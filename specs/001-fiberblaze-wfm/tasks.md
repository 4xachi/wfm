# FiberBlaze WFM — Dependency-Ordered TDD Tasks

**Feature**: `001-fiberblaze-wfm`  
**Spec**: `specs/001-fiberblaze-wfm/spec.md`  
**Plan**: `specs/001-fiberblaze-wfm/plan.md`

---

## Wave 1: Workspace Foundation & Shared Contracts
- [ ] **T001**: Initialize Next.js TypeScript strict workspace, Tailwind v4, `maplibre-gl`, `jose`, `fflate`, `lucide-react`, and `vitest` test runner (`package.json`, `tsconfig.json`, `vitest.config.ts`).
- [ ] **T002**: Define canonical FTTH domain types, role enums, optical constants, Cavite bounds, and API DTO contracts in `src/domain/types.ts` + PostgreSQL handover schema in `prisma/schema.postgresql.prisma`.

## Wave 2: Pure Domain Core (Strict Red-Green-Refactor TDD)
- [ ] **T003 [TDD]**: Work-Order State Machine & Role Guards (`tests/domain/workOrderLifecycle.test.ts` → `src/domain/workOrderLifecycle.ts`) — enforce `UNASSIGNED → ASSIGNED → WORKING → COMPLETED / FB_ISSUE / CUST_ISSUE`, `FB_ISSUE → ASSIGNED` (`SUPERVISOR`), `CUST_ISSUE → ASSIGNED` (`JOB_CONTROLLER`), and Admin/Controller-only `CANCELLED`.
- [ ] **T004 [TDD]**: GPON Optical Power & NAP Port Transfer-Lock Engine (`tests/domain/opticalAndNap.test.ts` → `src/domain/opticalAndNap.ts`) — enforce `-8` to `-25 dBm` Pass, `-25.1` to `-27.9 dBm` Marginal Warning, `<-28` / `>-8 dBm` Fail block, port collision guard, and `LOCKED_TRANSFER` retention until New Site completion.
- [ ] **T005 [TDD]**: GPS Integrity, 30m Mismatch Discrepancy & Staleness Honesty (`tests/domain/gpsIntegrity.test.ts` → `src/domain/gpsIntegrity.ts`) — enforce unverified capture vs verified reuse, `>30m` `LocationDiscrepancy` creation without overwriting trusted coordinates, `5 min` `STALE` cutoff, and logout `OFFLINE` cutoff.
- [ ] **T006 [TDD]**: Safe OOXML `.xlsx` / `.csv` Parser, Generator, Column Auto-Mapper & Formula Sanitizer (`tests/domain/excelImport.test.ts` → `src/domain/excelImport.ts`) — zip-bomb/XXE-safe `.xlsx` & `.csv` reader/writer, Cavite bounds validation, and CSV formula injection neutralization.
- [ ] **T007 [TDD]**: Street-ETA Technician Recommender & SHA-256 Audit Chain (`tests/domain/dispatchAndAudit.test.ts` → `src/domain/dispatchRecommender.ts`, `src/domain/auditChain.ts`).

## Wave 3: Cavite 3D Map & Street Routing Engine Port (Strict TDD, Parallel Subagent)
- [ ] **T008 [TDD]**: Port & type `geo.ts`, `kalman.ts`, `snapToRoad.ts`, `obstacles.ts`, `caviteFallbackGraph.ts`, `router.ts`, and `navigator.ts` from `C:\Users\Admin\Documents\test_project\map\src\engine` into `src/map-engine/*` with Vitest suite `tests/map-engine/engine.test.ts` — verify zero food-delivery references, Cavite bounds clamping, Viterbi HMM snap-to-road, road-block avoidance, and instant offline Cavite road graph fallback.

## Wave 4: Transactional SQLite Persistence, Scoped JWT RBAC & REST/SSE API (TDD)
- [ ] **T009 [TDD]**: SQLite transactional database (`node:sqlite` WAL + foreign keys), Cavite FiberBlaze network seed (`NAP-BCR-042`, `NAP-IMS-118`, `NAP-DSM-205`, `NAP-GTR-310`, subscribers, technicians, sample work orders), and 1-click Demo Reset (`src/server/db.ts`, `src/server/seed.ts`).
- [ ] **T010 [TDD]**: Cryptographic `scrypt` + `jose` HS256 JWT Auth with surface-scoped cookies (`fb_ops_session`, `fb_tech_session`) and server-side RBAC guards (`tests/api/authAndRbac.test.ts` → `src/server/auth.ts`).
- [ ] **T011 [TDD]**: Transactional WFM Repository, Idempotency `SyncReceipt` Ledger, Safe SHA-256 Evidence Store, Gated `IntegrationOutbox`, and SSE Event Bus (`tests/api/repositoryAndSync.test.ts` → `src/server/repository.ts`, `src/server/evidenceStore.ts`, `src/server/events.ts`).
- [ ] **T012 [TDD]**: Next.js API Route Handlers (`src/app/api/*`) covering auth, work orders, batch Excel import & sample `.xlsx` download, telemetry & street-ETA suggestions, field completion/exception with idempotency, supervisor GPS diff & `FB_ISSUE` resolution, admin reset/audit/outbox, and SSE `/api/events`.

## Wave 5: Premium Multi-Surface UI Implementation (`ui-ux-pro-max`, Parallel Subagents)
- [ ] **T013**: Shared Design System CSS (`src/app/globals.css`), Reusable 3D MapLibre `<CaviteMapStage />` (Fleet Dispatch Mode + 3D Gimbal Turn-by-Turn Navigation Mode + Supervisor 3D Pin Diff Mode), IndexedDB Offline Queue (`src/client/offlineQueue.ts`), and FTTH Watermarked Camera/Preset Canvas (`src/client/watermark.ts`).
- [ ] **T014**: Executive Gateway (`/`) & Operations NOC Portal (`/ops`) — Live Fleet & NAP 3D Map, Street-ETA Dispatch Drawer, 5-Step Excel Dispatch Wizard + Sample `.xlsx` Download, Digital Subscriber Intake, Supervisor Evidence/Optical Queue, 3D GPS Mismatch Diff Desk, `FB_ISSUE` NetOps Resolution, KPI Analytics, Gated Outbox & Audit Chain Inspector, and Admin 1-Click Demo Reset.
- [ ] **T015**: Field Technician Mobile PWA Cockpit (`/tech`) — Daylight/Dark `48px+` touch UI, Assigned Queue, Full 3D Cavite Gimbal Navigation with Road-Block Detours & Viterbi Telemetry, Guided Repair / New Install / Transfer Workflows, Interactive 8/16-Port NAP Matrix (`LOCKED_TRANSFER` badge), Optical `dBm` Meter Guardrails, Live WebRTC Camera + FTTH Simulator Presets, Signature Canvas + Hard-Copy Slot, and Dead-Zone Offline Sync Drawer.
- [ ] **T016**: Synchronized Split-Screen Executive Demo Theater (`/demo`) — Side-by-side `/ops` + mobile-framed `/tech` with independent simultaneous RBAC sessions and 1-click guided Executive Storyboard Scenarios.

## Wave 6: End-to-End Verification, Code Review & Security Audit
- [ ] **T017**: Full Vitest suite (`npm test`), production build (`npm run build`), and live browser verification of all workflows and 3D Cavite maps.
- [ ] **T018**: Independent `@code-review-and-quality` and `@security-audit` subagent reviews, remediation of all Critical/Required findings, regression re-test, and final executive walkthrough artifact.
