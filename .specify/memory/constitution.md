# FiberBlaze Workforce Management (WFM) Constitution

## Core Principles

### I. Telecom Operational Integrity (NON-NEGOTIABLE)
Every field state transition, optical signal measurement, NAP port allocation, and subscriber coordinate update must preserve operational truth:
- Verified subscriber and NAP coordinates are reused; field captures exceeding 30 meters from a verified pin create a `PENDING` `LocationDiscrepancy` for Supervisor review and MUST NEVER silently overwrite trusted records.
- Transfer (`TRANSFER`) work orders track old site and new site independently; the old NAP port MUST remain `LOCKED_TRANSFER` until the new site installation, optical `dBm` reading, and mandatory proof pass validation.
- Stale (`>5 minutes`) or logged-out technician telemetry MUST be badged `LAST_KNOWN` or `OFFLINE`—never `LIVE`—and GPS ingestion halts immediately on session logout.
- Nearby technician recommendations use real Cavite street-routed ETA plus active queue load as controller suggestions, never blind auto-assignment.

### II. Test-First Domain & API Engineering (NON-NEGOTIABLE)
All domain policies, state machines, optical/NAP validators, Excel importers, idempotency engines, map routing/snap modules, and RBAC API boundaries follow strict Red-Green-Refactor TDD:
- Write the failing Vitest unit/contract test first, observe the expected failure, implement the smallest clean code to pass, and keep the full suite green before advancing.

### III. Least-Privilege RBAC & Gated External Execution
Authentication uses cryptographically signed HS256 JWTs (`jose`) with server-side RBAC enforcement across `TECHNICIAN`, `JOB_CONTROLLER`, `SUPERVISOR`, and `ADMINISTRATOR`:
- Client applications NEVER issue direct billing, CRM, or OLT provisioning commands; approved completions enqueue immutable records into the `IntegrationOutbox` (`GATED_DRY_RUN`) for audited inspection.
- Every state change, assignment, override, and login/logout appends an immutable, hash-chained `AuditLog` entry.

### IV. Offline-Resilient & Camera-Verified Field Execution
Field technicians operate across Cavite subdivisions and dead zones:
- Mandatory field evidence requires live WebRTC camera capture (or explicitly labeled `[SIMULATED FTTH FEED]` frames in demo mode) stamped with tamper-evident telemetry (`WO#`, ISO timestamp, GPS coordinates, technician code, optical `dBm`), plus SHA-256 content digest.
- Offline actions persist in IndexedDB with deterministic `idempotencyKey` UUIDs; replaying the same mutation twice MUST return the original `SyncReceipt` without duplicate completions or conflicting overwrites.

### V. Precision Ergonomics & Zero AI Slop
Interfaces adhere strictly to `design-system/fiberblaze-wfm/MASTER.md` and surface overrides:
- Carbon/Obsidian NOC precision surfaces (with projector daylight toggle) for Operations; High-Contrast Daylight/Dark toggleable `48px+` touch cockpit for Field Technicians.
- SVG iconography only (zero emoji icons), tabular monospace telemetry (`Fira Code` / `Atkinson Hyperlegible Mono`), WCAG 2.2 AA contrast (`>= 4.5:1`), keyboard focus rings, and `prefers-reduced-motion` support.
- Reuse only the Cavite 3D MapLibre + OpenFreeMap + Valhalla/OSRM + Kalman/Viterbi HMM navigation engine—zero food-delivery artifacts.

## Architectural & Stack Standards

- **Runtime & Framework:** Node.js 24+, Next.js (App Router, TypeScript strict mode), React 19, Tailwind CSS v4 + CSS custom token variables.
- **Persistence:** Zero-config transactional SQLite (`better-sqlite3`) with clean SQL migrations and a documented PostgreSQL 16/18 handover schema (`prisma/schema.postgresql.prisma`), plus local protected media storage.
- **Map & Telemetry Engine:** MapLibre GL JS v4.7+, OpenFreeMap `liberty` vector tiles (`3D extruded Cavite buildings`), Valhalla + FOSSGIS OSRM street routing with deterministic Cavite corridor graph fallback so offline/rate-limited environments never break routing.
- **Scoped Surface Sessions:** Independent JWT cookies/headers for `/ops` and `/tech` frames so the `/demo` Split-Screen Executive Theater operates two real simultaneous RBAC identities without session collision.

## Quality & Security Gates

1. Full automated test suite (`npm test`) passes with zero errors.
2. Production TypeScript & Next.js build (`npm run build`) exits `0`.
3. Live runtime and browser verification confirms Excel import, 3D Cavite navigation, Repair / New Install / Transfer port-lock, offline sync idempotency, Supervisor GPS diff & evidence review, and Split-Screen live sync.
4. Independent `@code-review-and-quality` and `@security-audit` passes complete with all Critical and Required findings remediated and regression-tested.

## Governance

This Constitution governs all specifications, plans, tasks, code reviews, and security audits in `wfm`. Any architectural deviation requires explicit justification against operational simplicity (`devj` / `ponytail`).

**Version**: 1.0.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
