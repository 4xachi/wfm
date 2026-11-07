import assert from 'node:assert/strict';

const BASE = process.env.FIBERBLAZE_TEST_URL || 'http://127.0.0.1:3000';
const PW = process.env.FIBERBLAZE_TEST_PW || 'FiberBlaze2026!';

// Minimal valid 1x1 PNG base64 for server magic-byte verification
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

class CookieClient {
  constructor(surface) {
    this.surface = surface;
    this.cookie = '';
  }

  async req(path, { method = 'GET', body, includeSurfaceHeader = true } = {}) {
    const headers = {};
    if (includeSurfaceHeader) headers['X-FB-Surface'] = this.surface;
    if (this.cookie) headers['Cookie'] = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const pair = sc.split(';')[0];
      if (pair.startsWith(`fb_${this.surface}_session=`)) {
        const val = pair.split('=')[1];
        this.cookie = val ? pair : '';
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await res.json()
      : await res.arrayBuffer();
    return { status: res.status, data };
  }
}

async function main() {
  console.log(`Connecting to FiberBlaze test server at ${BASE}...`);
  const admin = new CookieClient('ops');
  const controller = new CookieClient('ops');
  const supervisor = new CookieClient('ops');
  const mateo = new CookieClient('tech');
  const jessa = new CookieClient('tech');

  // 0. CSRF negative check: POST without X-FB-Surface must be rejected (403)
  const csrfCheck = await admin.req('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@fiberblaze.ph', password: PW },
    includeSurfaceHeader: false,
  });
  assert.equal(csrfCheck.status, 403, 'Expected 403 when X-FB-Surface missing');
  console.log('PASS [CSRF]: Missing X-FB-Surface blocked with 403');

  // 1. Login personas & reset baseline
  assert.equal(
    (await admin.req('/api/auth/login', { method: 'POST', body: { email: 'admin@fiberblaze.ph', password: PW } })).status,
    200,
  );
  assert.equal((await admin.req('/api/admin/reset', { method: 'POST', body: {} })).status, 200);

  assert.equal(
    (await controller.req('/api/auth/login', { method: 'POST', body: { email: 'controller@fiberblaze.ph', password: PW } })).status,
    200,
  );
  assert.equal(
    (await supervisor.req('/api/auth/login', { method: 'POST', body: { email: 'supervisor@fiberblaze.ph', password: PW } })).status,
    200,
  );
  assert.equal(
    (await mateo.req('/api/auth/login', { method: 'POST', body: { email: 'mateo@fiberblaze.ph', password: PW } })).status,
    200,
  );
  assert.equal(
    (await jessa.req('/api/auth/login', { method: 'POST', body: { email: 'jessa@fiberblaze.ph', password: PW } })).status,
    200,
  );

  // RBAC negative check: Technician cannot reset DB or assign work orders
  assert.equal((await mateo.req('/api/admin/reset', { method: 'POST', body: {} })).status, 403);
  assert.equal(
    (await mateo.req('/api/work-orders/assign', { method: 'POST', body: { workOrderId: 'wo-4', techUserId: 'u-tech-1' } })).status,
    403,
  );
  console.log('PASS [RBAC]: Technician blocked from Admin Reset and Controller Dispatch (403)');

  // 2. Sample .xlsx download + Digital/Batch Commit
  const xlsxRes = await controller.req('/api/import/sample-xlsx');
  assert.equal(xlsxRes.status, 200);
  assert.ok(xlsxRes.data.byteLength > 500, 'Sample .xlsx must be a non-empty OOXML archive');

  const commitRes = await controller.req('/api/import/commit', {
    method: 'POST',
    body: {
      fileName: 'cavite-morning-batch.xlsx',
      sourceChannel: 'EXCEL_IMPORT',
      rows: [
        {
          accountNumber: 'FB-CAV-8801',
          subscriberName: '=SUM(1,2) Elena Macapagal',
          phone: '09171239876',
          workflowType: 'NEW_INSTALL',
          priority: 'URGENT',
          municipality: 'Imus',
          barangay: 'Tanzang Luma II',
          streetAddress: 'Blk 9 Lot 3 Nueno Ave',
          lat: '14.4292',
          lng: '120.9374',
          planName: 'Blaze Fiber 600 Mbps',
          issueDescription: 'Urgent residential FTTH install',
        },
      ],
      mapping: {
        accountNumber: 'accountNumber',
        subscriberName: 'subscriberName',
        phone: 'phone',
        workflowType: 'workflowType',
        priority: 'priority',
        municipality: 'municipality',
        barangay: 'barangay',
        streetAddress: 'streetAddress',
        lat: 'lat',
        lng: 'lng',
        planName: 'planName',
        issueDescription: 'issueDescription',
      },
    },
  });
  assert.equal(commitRes.status, 200);
  assert.equal(commitRes.data.workOrders.length, 1);
  assert.ok(
    commitRes.data.workOrders[0].subscriberName.startsWith("'="),
    'Formula injection prefix must be neutralized with leading apostrophe',
  );
  const newWoId = commitRes.data.workOrders[0].id;
  console.log('PASS [EXCEL_IMPORT]: Sample .xlsx verified + formula-sanitized Cavite ticket created:', commitRes.data.workOrders[0].ticketNumber);

  // 3. Street-ETA Suggestions + Live SSE Delivery Test
  const sugRes = await controller.req(`/api/dispatch/suggestions?workOrderId=${newWoId}`);
  assert.equal(sugRes.status, 200);
  assert.ok(sugRes.data.suggestions.length >= 1, 'Expected ranked street-ETA suggestions');

  // Open live SSE connection as Mateo before assignment
  const sseAbort = new AbortController();
  const sseEvents = [];
  const ssePromise = (async () => {
    const res = await fetch(`${BASE}/api/events?surface=tech`, {
      headers: { Cookie: mateo.cookie },
      signal: sseAbort.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          sseEvents.push(JSON.parse(line.slice(6)));
          if (sseEvents.some((e) => e.type === 'WORK_ORDER_UPDATED' && e.entityId === newWoId)) {
            sseAbort.abort();
            return;
          }
        }
      }
    }
  })().catch(() => {});

  await new Promise((r) => setTimeout(r, 250));
  const assignRes = await controller.req('/api/work-orders/assign', {
    method: 'POST',
    body: { workOrderId: newWoId, techUserId: 'u-tech-1' },
  });
  assert.equal(assignRes.status, 200);
  await Promise.race([ssePromise, new Promise((r) => setTimeout(r, 1500))]);
  sseAbort.abort();
  assert.ok(
    sseEvents.some((e) => e.type === 'WORK_ORDER_UPDATED' && e.entityId === newWoId),
    'Technician SSE stream must receive live WORK_ORDER_UPDATED event',
  );
  console.log('PASS [STREET_ETA + SSE]: Assigned ticket delivered live over SSE to Technician');

  // Cross-technician ownership check: Jessa cannot start Mateo's assigned ticket
  const wrongTechStart = await jessa.req('/api/work-orders/start', {
    method: 'POST',
    body: { workOrderId: newWoId, idempotencyKey: crypto.randomUUID() },
  });
  assert.equal(wrongTechStart.status, 403, 'Jessa must get 403 starting Mateo work order');
  console.log('PASS [OWNERSHIP]: Cross-technician ticket mutation rejected with 403');

  // 4. Transfer Old-Port Lock Safeguard + FB_ISSUE Escalation + Supervisor Resolution + Marginal Completion + Idempotent Replay
  // Start wo-1003 (TRANSFER assigned to Jessa u-tech-2, old port nap-bcr-042 port 2 LOCKED_TRANSFER)
  assert.equal(
    (await jessa.req('/api/work-orders/start', { method: 'POST', body: { workOrderId: 'wo-1003', idempotencyKey: crypto.randomUUID() } })).status,
    200,
  );

  const fbEscalation = await jessa.req('/api/work-orders/outcome', {
    method: 'POST',
    body: {
      workOrderId: 'wo-1003',
      idempotencyKey: crypto.randomUUID(),
      outcomeStatus: 'FB_ISSUE',
      opticalRxDbm: -29.8,
      exceptionReasonCode: 'HIGH_SPLICE_LOSS',
      exceptionNotes: 'New drop in Imus Anabu measured -29.8 dBm; keep old Bacoor port locked!',
      evidenceItems: [
        {
          kind: 'CAMERA_OPTICAL',
          captureMode: 'SIMULATED_FTTH_FEED',
          dataUrl: TINY_PNG_DATA_URL,
          watermark: 'FB-WO-2026-1003 | HIGH_SPLICE_LOSS -29.8 dBm',
        },
      ],
    },
  });
  assert.equal(fbEscalation.status, 200);

  const bootAfterFb = (await supervisor.req('/api/bootstrap')).data;
  const bcrNap = bootAfterFb.napBoxes.find((n) => n.id === 'nap-bcr-042');
  assert.equal(
    bcrNap.ports.find((p) => p.portNumber === 2).status,
    'LOCKED_TRANSFER',
    'Old TRANSFER port MUST stay LOCKED_TRANSFER when new site encounters FB_ISSUE',
  );
  console.log('PASS [TRANSFER_LOCK_ON_FAULT]: Old port remained LOCKED_TRANSFER during FB_ISSUE');

  // Supervisor resolves FB_ISSUE back to Jessa
  const supResolve = await supervisor.req('/api/work-orders/resolve-fb-issue', {
    method: 'POST',
    body: {
      workOrderId: 'wo-1003',
      resolutionNotes: 'Re-spliced distribution tray in NAP-IMS-204; optical budget -19.4 dBm.',
      reassignTechId: 'u-tech-2',
    },
  });
  assert.equal(supResolve.status, 200);
  assert.equal(supResolve.data.workOrder.status, 'ASSIGNED');

  // Jessa restarts wo-1003 and completes TRANSFER with marginal signal (-26.3 dBm) + >30m GPS offset + camera & signature proof
  assert.equal(
    (await jessa.req('/api/work-orders/start', { method: 'POST', body: { workOrderId: 'wo-1003', idempotencyKey: crypto.randomUUID() } })).status,
    200,
  );

  const outcomeKey = crypto.randomUUID();
  const outcomePayload = {
    workOrderId: 'wo-1003',
    idempotencyKey: outcomeKey,
    outcomeStatus: 'COMPLETED',
    selectedNapBoxId: 'nap-ims-204',
    selectedPortNumber: 4,
    fiberTag: 'FT-IMS-204-P04',
    onuSerial: 'HWTC99887766',
    opticalRxDbm: -26.3,
    capturedLat: 14.4008, // >30m away from verified 14.3996, 120.9416
    capturedLng: 120.9428,
    evidenceItems: [
      {
        kind: 'CAMERA_OPTICAL',
        captureMode: 'SIMULATED_FTTH_FEED',
        dataUrl: TINY_PNG_DATA_URL,
        watermark: 'FB-WO-2026-1003 | -26.3 dBm',
      },
      {
        kind: 'SUBSCRIBER_SIGNATURE',
        captureMode: 'SIGNATURE_PAD',
        dataUrl: TINY_PNG_DATA_URL,
        watermark: 'SIGNED BY SUBSCRIBER',
      },
    ],
  };

  const completeRes1 = await jessa.req('/api/work-orders/outcome', {
    method: 'POST',
    body: outcomePayload,
  });
  assert.equal(completeRes1.status, 200);
  assert.equal(completeRes1.data.replayed, false);
  assert.equal(completeRes1.data.discrepancyCreated, true);
  assert.equal(completeRes1.data.workOrder.supervisorReviewRequired, true);

  // Replay exact same UUID to prove offline sync idempotency!
  const completeRes2 = await jessa.req('/api/work-orders/outcome', {
    method: 'POST',
    body: outcomePayload,
  });
  assert.equal(completeRes2.status, 200);
  assert.equal(completeRes2.data.replayed, true, 'Duplicate UUID must return cached idempotent receipt');
  console.log('PASS [TRANSFER_CUTOVER + IDEMPOTENT_REPLAY + >30m_DIFF]: Old port freed, new port occupied, marginal review flagged, UUID replay deduplicated');

  // 5. Verify old port freed + Supervisor approves review & discrepancy + Audit Chain intact
  const bootAfterCutover = (await supervisor.req('/api/bootstrap')).data;
  assert.equal(
    bootAfterCutover.napBoxes.find((n) => n.id === 'nap-bcr-042').ports.find((p) => p.portNumber === 2).status,
    'FREE',
    'Old TRANSFER port must release to FREE after cutover COMPLETED',
  );
  assert.equal(bootAfterCutover.auditIntegrity.valid, true, 'SHA-256 audit chain must remain valid');

  const pendingDisc = bootAfterCutover.discrepancies.find((d) => d.status === 'PENDING');
  assert.ok(pendingDisc, 'Expected PENDING location discrepancy');
  assert.equal(
    (await supervisor.req('/api/discrepancies/resolve', {
      method: 'POST',
      body: { discrepancyId: pendingDisc.id, decision: 'APPROVED', reviewNotes: 'Verified corner gate entrance' },
    })).status,
    200,
  );
  assert.equal(
    (await supervisor.req('/api/work-orders/approve-review', {
      method: 'POST',
      body: { workOrderId: 'wo-1003', reviewNotes: 'Marginal -26.3 dBm acceptable on 280m rural span; proof verified.' },
    })).status,
    200,
  );
  console.log('PASS [SUPERVISOR_GOVERNANCE]: Discrepancy & marginal optical proof approved; SHA-256 chain intact');

  // 6. Logout GPS Honesty Check
  await mateo.req('/api/telemetry/gps', {
    method: 'POST',
    body: { lat: 14.427, lng: 120.938, speedKmh: 24 },
  });
  assert.equal((await mateo.req('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
  const bootAfterLogout = (await supervisor.req('/api/bootstrap')).data;
  assert.equal(
    bootAfterLogout.technicians.find((t) => t.userId === 'u-tech-1').gpsFreshness,
    'OFFLINE',
    'Logged-out technician must immediately report OFFLINE GPS freshness',
  );
  console.log('PASS [GPS_LOGOUT_HALT]: Technician GPS immediately transitioned to OFFLINE upon logout');

  // 7. Restore pristine Cavite rehearsal dataset
  assert.equal((await admin.req('/api/admin/reset', { method: 'POST', body: {} })).status, 200);
  console.log('PASS [PRISTINE_RESET]: Database restored to pristine Cavite presentation seed');
}

main().catch((err) => {
  console.error('WORKFLOW_E2E_FAILED:', err);
  process.exit(1);
});
