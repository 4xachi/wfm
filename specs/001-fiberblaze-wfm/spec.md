# Feature Specification: FiberBlaze Workforce Management (WFM) Platform

**Feature Branch**: `001-fiberblaze-wfm`  
**Created**: 2026-11-07  
**Status**: Approved  
**Source Blueprint**: `FiberBlaze_WFM_Blueprint_2026-11-06.pptx` (Slides 1–13) + Cavite 3D Map Engine (`C:\Users\Admin\Documents\test_project\map`)

---

## 1. Purpose & Executive Value

FiberBlaze WFM unifies **dispatch, Cavite 3D field navigation, FTTH execution, optical/photo verification, offline synchronization, and KPI/audit governance** into one operating platform for FiberBlaze's fiber broadband operations across Cavite, Philippines—bridging today's Excel + signed hard-copy beta operations to a paperless target architecture without unapproved external billing or OLT network writes.

---

## 2. User Roles & Least-Privilege Boundaries

| Role | Surface | Permitted Actions | Prohibited Actions |
| :--- | :--- | :--- | :--- |
| `TECHNICIAN` | `/tech`, `/demo` (right) | View own assigned jobs, navigate in 3D across Cavite, update `ASSIGNED → WORKING → COMPLETED / FB_ISSUE / CUST_ISSUE`, capture GPS, NAP ports, optical `dBm`, camera-only watermarked photos, subscriber signatures, queue offline sync | Cannot cancel work orders, reassign jobs, approve own GPS discrepancies, view other technicians' private queues, or trigger raw CRM/OLT writes |
| `JOB_CONTROLLER` | `/ops`, `/demo` (left) | Upload/map/validate/dispatch `.xlsx`/`.csv` batches, create digital intake orders, view live/last-known fleet map, inspect street-routed technician suggestions, assign/reassign, reschedule `CUST_ISSUE`, cancel non-completed orders | Cannot approve `FB_ISSUE` engineering overrides or alter audit logs |
| `SUPERVISOR` | `/ops`, `/demo` (left) | Review completed/marginal evidence & optical `dBm`, resolve `PENDING` GPS pin discrepancies (`>30m`) on 3D map diff, resolve `FB_ISSUE` network escalations & return for completion, view KPIs | Cannot alter system RBAC roles or reset production/demo databases |
| `ADMINISTRATOR` | `/ops`, `/demo` (left) | Manage users/roles, inspect `IntegrationOutbox` (`GATED_DRY_RUN` CRM/OLT payloads), inspect hash-chained `AuditLog`, export KPI/audit reports, execute 1-click Demo Reset | Client UI still cannot bypass server validation or mutate historical audit hashes |

---

## 3. Prioritized User Journeys & Acceptance Scenarios

### Journey 1 — Excel-to-Dispatch & Street-Routed Assignment (P1, `JOB_CONTROLLER`)
1. **Given** an `.xlsx` or `.csv` batch of Cavite subscriber tickets (or the built-in realistic sample `.xlsx` generator), **When** the Job Controller uploads the file, maps columns, runs validation, and previews rows, **Then** invalid Cavite coordinates, unknown workflow types, or missing subscriber identifiers are highlighted inline before batch import.
2. **Given** an `UNASSIGNED` or `CUST_ISSUE` work order in Bacoor, Imus, Dasmariñas, or Gen. Trias, **When** the controller opens Technician Suggestions, **Then** the system ranks active technicians using **Cavite street-routed ETA + active queue count + vehicle fit (`motorbike` vs `l300_van`)** as a 1-click suggestion—never auto-assigning silently.

### Journey 2 — 3D Cavite Navigation & FTTH Field Execution (P1, `TECHNICIAN`)
1. **Given** an `ASSIGNED` work order, **When** the technician opens `/tech` and starts navigation, **Then** MapLibre renders OpenFreeMap 3D extruded Cavite buildings, 3D gimbal follow camera, Valhalla + FOSSGIS OSRM street route (with deterministic local Cavite graph fallback), road-block detour support, and Kalman + Viterbi HMM snap-to-road telemetry.
2. **Given** a `WORKING` job across the three FTTH workflows:
   - **`REPAIR`**: Reuses verified subscriber/NAP records, captures troubleshooting reason, post-work optical Rx `dBm`, and mandatory camera-only watermarked photo.
   - **`NEW_INSTALL`**: Captures/verifies subscriber GPS, selects a `FREE` port on an 8/16-port `NapBox` matrix, records fiber tag & ONU/modem serial, validates optical Rx `dBm`, captures camera-only watermarked proof, and records digital canvas signature (or signed hard-copy beta capture).
   - **`TRANSFER`**: Displays Old Site (`oldNapBoxId` / `oldPortNumber` in `LOCKED_TRANSFER`) and New Site separately; **old NAP port remains locked** until New Site port selection, optical `dBm`, and mandatory proof succeed, at which point Old Port transitions cleanly to `FREE` with preserved location history.

### Journey 3 — Offline Dead-Zone Queue & Idempotent Reconnect Sync (P1, `TECHNICIAN`)
1. **Given** the technician is in Dead-Zone Offline Mode (`navigator.onLine === false` or Simulated Offline toggle active), **When** they start work, capture watermarked photos/signatures, and submit completion, **Then** the payload + deterministic `idempotencyKey` are persisted in IndexedDB and visible in the Offline Sync Inspector.
2. **Given** queued offline mutations, **When** connectivity returns (even if Sync is triggered multiple times or retried concurrently), **Then** the server processes each `idempotencyKey` exactly once, returns the stored `SyncReceipt` on replay, prevents conflicting overwrites on already-closed jobs, and broadcasts live updates to `/ops`.

### Journey 4 — Exception Routing, GPS Mismatch Diff & Evidence Governance (P1, `SUPERVISOR`)
1. **Given** a technician encounters a full/damaged NAP or OLT LOS (`rxDbm < -27.9 dBm`), **When** they file `FB_ISSUE` with reason and photo proof, **Then** the ticket enters the Supervisor NetOps Queue (`6A → 6C → 6D`), where resolving the facility issue transitions it back to `ASSIGNED` (`11. Return for Completion`).
2. **Given** a field GPS capture that deviates `>30m` from a verified subscriber coordinate, **When** submitted, **Then** the subscriber's trusted coordinate is NOT overwritten; a `PENDING` `LocationDiscrepancy` appears on the Supervisor 3D Pin Diff Map showing exact meter delta, allowing explicit `APPROVE` (updates trusted pin) or `REJECT` (retains existing pin).

### Journey 5 — Split-Screen Executive Demo Theater (P1, Executive Presenter)
1. **Given** `/demo` is opened in a single browser window, **When** the presenter dispatches or reassigns a job in the left `/ops` pane, **Then** the right `/tech` mobile viewport receives the update instantaneously via SSE without clobbering either pane's independent JWT RBAC session, and guided scenario presets let the presenter demonstrate Excel dispatch, 3D Cavite detour navigation, Transfer port-lock, Offline sync, and Supervisor GPS diff in minutes.

---

## 4. Functional Requirements & Domain Invariants

- **FR-001 (RBAC & Scoped JWT):** Authenticate users with `scrypt`/`argon2` password verification and signed HS256 JWTs (`jose`), supporting independent scoped cookies (`fb_ops_session`, `fb_tech_session`) and `X-FB-Surface` selection.
- **FR-002 (Logout GPS Cutoff):** Logging out immediately marks `TechnicianProfile.sessionActive = false` and rejects further GPS pings until re-authenticated.
- **FR-003 (GPS Freshness Honesty):** Compute telemetry state strictly from `sessionActive` and `lastGpsAt`: `LIVE` (`<= 5 min`), `STALE` (`> 5 min`, rendered as `LAST KNOWN`), `OFFLINE` (`sessionActive === false`).
- **FR-004 (Work-Order State Machine):** Enforce legal transitions:
  - `UNASSIGNED → ASSIGNED | CANCELLED`
  - `ASSIGNED → WORKING | CANCELLED` (plus reassignment to another technician)
  - `WORKING → COMPLETED | FB_ISSUE | CUST_ISSUE`
  - `FB_ISSUE → ASSIGNED | CANCELLED` (`SUPERVISOR` / `ADMINISTRATOR` resolution)
  - `CUST_ISSUE → ASSIGNED | CANCELLED` (`JOB_CONTROLLER` / `ADMINISTRATOR` reschedule)
  - `CANCELLED` restricted strictly to `JOB_CONTROLLER` and `ADMINISTRATOR`.
- **FR-005 (Optical Signal Guardrails):** Classify GPON Rx power (`dBm`):
  - `-25.0 <= rxDbm <= -8.0` → `PASS`
  - `-27.9 <= rxDbm < -25.0` → `MARGINAL_WARNING` (flags `supervisorReviewRequired = true`)
  - `rxDbm < -27.9` or `rxDbm > -8.0` → `FAIL_OUT_OF_RANGE` (blocks `COMPLETED`; guides technician to `FB_ISSUE`).
- **FR-006 (NAP Port Allocation & Transfer Lock):** Prevent assigning an `OCCUPIED`, `FAULTY`, or `LOCKED_TRANSFER` port to a new subscriber. For `TRANSFER`, keep `oldPort` in `LOCKED_TRANSFER` throughout `ASSIGNED`, `WORKING`, `FB_ISSUE`, and `CUST_ISSUE`, releasing `oldPort → FREE` atomically only inside the `COMPLETED` transaction.
- **FR-007 (Coordinate Verification & 30m Mismatch Rule):** Unverified subscriber records accept initial field coordinates (`coordsVerified = true`); verified records encountering field distance `> 30m` preserve verified coordinates and create a `LocationDiscrepancy` (`PENDING`).
- **FR-008 (Camera-Only Watermarked Proof & Beta Hard-Copy):** Field photo capture uses live WebRTC `getUserMedia` (or explicitly badged `[SIMULATED FTTH FEED]` canvas frames for boardroom demos), blocks raw gallery photo uploads for field proof, renders burned-in metadata (`WO#`, UTC/PH timestamp, Lat/Lng, Tech code, `dBm`), and computes SHA-256 file integrity hashes. During Beta, signed hard-copy work orders can be captured via a dedicated `SIGNED_HARDCOPY` document slot.
- **FR-009 (Idempotent Offline Sync):** Every field mutation carries `idempotencyKey`; duplicate submissions return cached `SyncReceipt` (`replayed: true`), and stale mutations against terminal work orders return structured `409 CONFLICT` diagnostics without data corruption.
- **FR-010 (Excel Import Pipeline + Digital Intake):** Parse `.xlsx` and `.csv` uploads client/server-side, support interactive column mapping, validate Cavite bounds (`14.05–14.50 N`, `120.58–121.08 E`), preview valid/invalid rows, batch-create tickets, provide a 1-click realistic Cavite sample `.xlsx` download, and expose a Digital Subscriber Intake form.
- **FR-011 (Pure Cavite 3D Map & Routing Port):** Port `geo`, `kalman`, `snapToRoad`, `navigator`, `obstacles`, and `router` from `C:\Users\Admin\Documents\test_project\map` into typed TypeScript with zero food-delivery terms, OpenFreeMap `liberty` 3D buildings, Valhalla + FOSSGIS OSRM routing, deterministic offline Cavite corridor graph fallback, road-block avoidance, and 3D gimbal follow HUD.
- **FR-012 (Controlled Integration Gateway & Hash-Chained Audit):** Enqueue CRM/Inventory/OLT provisioning events into `IntegrationOutbox` (`status: 'GATED_DRY_RUN'`) and append SHA-256 hash-chained `AuditLog` entries for every state mutation.

---

## 5. Measurable Success Criteria

- **SC-001:** 100% of domain invariants (state transitions, optical `dBm` bands, Transfer port-lock, 30m GPS mismatch, idempotency replay, hash-chain audit, Cavite bounds & Viterbi snap-to-road) covered by passing automated Vitest tests written TDD-first.
- **SC-002:** Zero unauthenticated or cross-role privilege escalations across all `/api/*` endpoints verified via automated RBAC contract tests and `@security-audit`.
- **SC-003:** Live end-to-end execution of Excel `.xlsx` import → Street-ETA suggestion → Dispatch → 3D Cavite Navigation → Offline Dead-Zone Completion → Reconnect Sync → Supervisor Review verified in a real browser with zero console errors.
