# FiberBlaze WFM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or dispatching-parallel-agents to implement independent subsystems after shared contracts and failing tests are established. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-grade, full-stack FiberBlaze Workforce Management (WFM) prototype uniting Cavite 3D street navigation, Excel-to-paperless dispatch, Repair/Install/Transfer FTTH workflows, camera-only watermarked proof, offline idempotent sync, and an Executive Split-Screen Demo Theater.

**Architecture:** Modular Next.js (App Router, TypeScript strict) monorepo backed by a zero-config transactional SQLite database (`better-sqlite3` with WAL + foreign keys + atomic transactions, paired with `prisma/schema.postgresql.prisma` for PostgreSQL 16/18 handover), pure framework-free TypeScript domain & Cavite 3D map engines, scoped per-surface HS256 JWT RBAC (`fb_ops_session` vs `fb_tech_session`), and a Server-Sent Events (`/api/events`) real-time bus.

**Tech Stack:** Node.js 24, Next.js 15/16 (App Router, TypeScript), React 19, Tailwind CSS v4, `better-sqlite3`, `jose` (JWT), `xlsx` / custom OOXML-safe parser & builder (`exceljs`), `maplibre-gl` v4.7.1, `lucide-react` (SVG icons), `vitest` (TDD unit & API contract suite).

**Spec:** `specs/001-fiberblaze-wfm/spec.md`

## Global Constraints

- Cavite geographic bounds: `minLat: 14.05, maxLat: 14.50, minLng: 120.58, maxLng: 121.08` (`maxBoundsLngLat: [[120.52, 14.00], [121.12, 14.54]]`).
- Map style: `https://tiles.openfreemap.org/styles/liberty` with 3D extruded buildings (`min 6.5m`), Valhalla + FOSSGIS OSRM routing, plus deterministic offline Cavite street-corridor graph fallback when external routing APIs are unreachable or rate-limited.
- Zero food-delivery terminology (`merchant`, `pickup`, `GrabFood`, `Foodpanda` forbidden anywhere in `src/`).
- Roles: `'TECHNICIAN' | 'JOB_CONTROLLER' | 'SUPERVISOR' | 'ADMINISTRATOR'`.
- Optical GPON Rx thresholds: `PASS` (`-25.0` to `-8.0 dBm`), `MARGINAL_WARNING` (`-27.9` to `-25.0 dBm`), `FAIL_OUT_OF_RANGE` (`< -27.9` or `> -8.0 dBm`).
- GPS mismatch threshold: `> 30` meters from verified coordinates creates `PENDING` `LocationDiscrepancy` without mutating subscriber coordinates; GPS staleness threshold: `> 300_000 ms` (5 minutes).
- UI standards: Zero emojis as icons, `>= 4.5:1` contrast, `>= 48px` mobile touch targets in `/tech`, Carbon NOC + Daylight theme tokens from `design-system/fiberblaze-wfm/`.

## Review Focus

1. **Simultaneous Split-Screen Session Collision:** Logging in as `TECHNICIAN` inside `/demo`'s right frame must NOT overwrite `JOB_CONTROLLER`'s session cookie on the left — solved via surface-scoped cookies (`fb_ops_session`, `fb_tech_session`) selected by `X-FB-Surface` header, pinned by API auth tests.
2. **Premature Old NAP Port Release on Failed/Exception Transfer:** Filing `FB_ISSUE`, `CUST_ISSUE`, or failing optical `dBm` validation on a `TRANSFER` job must keep `oldPort` in `LOCKED_TRANSFER` — pinned by domain & repository transaction tests.
3. **Double-Click / Reconnect Replay of Offline Completion:** Submitting the same `idempotencyKey` twice after dead-zone reconnect must return the original `SyncReceipt` (`replayed: true`) without duplicating `AuditLog`, `FieldEvidence`, or `IntegrationOutbox` rows — pinned by concurrency/replay tests.
4. **External Routing API Timeout During Live Presentation:** Public `valhalla1.openstreetmap.de` or `router.project-osrm.org` endpoints can timeout on conference Wi-Fi — solved via bounded `3500ms` timeout racing into a built-in high-resolution Cavite highway/barangay road-network Dijkstra fallback so 3D routing works 100% offline/online — pinned by router fallback tests.
5. **Malicious Excel Formula / Path Traversal / Oversized Evidence Payloads:** CSV/Excel cells starting with `=`, `+`, `-`, `@` (CSV formula injection) during export/import, path traversal in evidence IDs, or forged role claims — pinned by security boundary tests.

---

## Target Repository Structure

```text
c:\Users\Admin\Desktop\wfm\
├── .specify/memory/constitution.md
├── design-system/fiberblaze-wfm/
│   ├── MASTER.md
│   └── pages/{ops-noc.md, tech-mobile.md}
├── specs/001-fiberblaze-wfm/
│   ├── spec.md
│   ├── plan.md
│   └── tasks.md
├── prisma/
│   └── schema.postgresql.prisma          # Production PostgreSQL 16/18 handover contract
├── src/
│   ├── domain/                           # Pure TypeScript FTTH business rules (zero Next/DB imports)
│   │   ├── types.ts                      # Canonical enums, DTOs, invariants
│   │   ├── workOrderLifecycle.ts         # State machine + role transition guards
│   │   ├── opticalAndNap.ts              # GPON dBm classifier + NAP port & Transfer-Lock rules
│   │   ├── gpsIntegrity.ts               # 30m mismatch detector + 5m staleness + logout cutoff
│   │   ├── excelImport.ts                # Column auto-mapper, Cavite row validator, formula sanitizer
│   │   ├── dispatchRecommender.ts        # Street-ETA + workload + vehicle scorer
│   │   └── auditChain.ts                 # Deterministic SHA-256 hash-chain builder & verifier
│   ├── map-engine/                       # Clean TypeScript port of Cavite 3D street navigation
│   │   ├── geo.ts                        # Haversine, polyline6, bearings, speed segments, Cavite bounds
│   │   ├── kalman.ts                     # 2D GPS velocity-aware Kalman filter
│   │   ├── snapToRoad.ts                 # Newson-Krumm Viterbi HMM road-centerline snapper
│   │   ├── obstacles.ts                  # Cavite roadworks, flood zones, user road-block detours
│   │   ├── caviteFallbackGraph.ts        # Built-in Cavite arterial/barangay street graph (Dijkstra)
│   │   ├── router.ts                     # Valhalla + FOSSGIS OSRM racer + instant Cavite graph fallback
│   │   └── navigator.ts                  # Real-time turn-by-turn controller + off-route auto-reroute
│   ├── server/                           # Transactional SQLite store, Auth, Media, SSE EventBus
│   │   ├── db.ts                         # better-sqlite3 singleton, schema DDL, atomic tx helper
│   │   ├── seed.ts                       # Realistic Cavite FiberBlaze network seed + 1-click reset
│   │   ├── auth.ts                       # scrypt password hashing, jose HS256 JWT, surface-scoped RBAC
│   │   ├── repository.ts                 # Transactional WFM operations, idempotency ledger, audit, outbox
│   │   ├── evidenceStore.ts              # Safe SHA-256 local storage for watermarked photos & signatures
│   │   ├── sampleExcel.ts                # Generates downloadable realistic Cavite .xlsx dispatch batch
│   │   └── events.ts                     # In-memory pub/sub EventEmitter for /api/events SSE live push
│   ├── client/
│   │   ├── offlineQueue.ts               # IndexedDB persistent queue + Dead-Zone simulator + auto-replay
│   │   ├── apiClient.ts                  # Surface-aware fetch wrapper (`ops` vs `tech`) + offline intercept
│   │   └── watermark.ts                  # HTML5 Canvas FTTH camera viewfinder, presets & burned-in stamp
│   ├── components/
│   │   ├── map/CaviteMapStage.tsx        # Unified MapLibre 3D WebGL component (Fleet Mode & 3D Gimbal Nav Mode)
│   │   ├── ops/                          # Management Portal modules (Dispatch, Excel Wizard, Map, Supervisor, KPI/Admin)
│   │   └── tech/                         # Mobile PWA Cockpit modules (Job Queue, 3D Nav HUD, NAP Matrix, Camera, Signature, Sync Drawer)
│   └── app/
│       ├── layout.tsx & globals.css      # NOC Carbon & Field Daylight CSS token system
│       ├── page.tsx                      # Executive Gateway & Instant Persona / Split-Screen Launcher
│       ├── ops/page.tsx                  # Operations Management Portal (`JOB_CONTROLLER`, `SUPERVISOR`, `ADMINISTRATOR`)
│       ├── tech/page.tsx                 # Field Technician Mobile PWA Cockpit (`TECHNICIAN`)
│       ├── demo/page.tsx                 # Synchronized Split-Screen Executive Demo Theater
│       └── api/                          # REST + SSE Route Handlers (`auth`, `work-orders`, `import`, `telemetry`, `supervision`, `evidence`, `admin`, `events`)
└── tests/
    ├── domain/                           # TDD unit suites for all FTTH rules & audit hash-chain
    ├── map-engine/                       # TDD unit suites for Cavite bounds, Kalman, Viterbi, Router fallback
    └── api/                              # Integration & RBAC security contract suites against real SQLite DB
```
