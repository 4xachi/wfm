# Page Override: Operations NOC Command Center (`/ops` & `/demo` Left Pane)

> Overrides `design-system/fiberblaze-wfm/MASTER.md` for Job Controller, Technical Supervisor, and Administrator views.

## Surface & Color Tokens (Carbon NOC Default + Projector Light Toggle)

### Dark NOC Mode (`[data-theme="noc-dark"]` — Default for `/ops`)
- `--bg-canvas`: `#0B0F14` (Obsidian base)
- `--bg-surface`: `#111720` (Primary instrument dock)
- `--bg-elevated`: `#17202B` (Cards, modals, table headers)
- `--bg-hover`: `#1E293B` (Row & control hover)
- `--border-subtle`: `#243142` (`1px` crisp hairline)
- `--border-strong`: `#334155`
- `--text-primary`: `#F1F5F9` (Contrast > 14:1)
- `--text-secondary`: `#CBD5E1` (Contrast > 9:1)
- `--text-muted`: `#94A3B8` (Contrast >= 5.2:1 on `#0B0F14` / `#111720`)
- `--accent-blaze`: `#F97316` (FiberBlaze Signal Orange — primary action)
- `--accent-blaze-ink`: `#090D12` (Dark ink on `#F97316` for > 7.5:1 AA contrast)
- `--accent-amber`: `#F59E0B` (Marginal optical warning / `CUST_ISSUE`)
- `--status-ok`: `#10B981` (Optic Emerald — Pass `-8` to `-25 dBm`, `COMPLETED`, `LIVE` GPS)
- `--status-fault`: `#EF4444` (LOS / `FB_ISSUE` / `<-28 dBm` / Road block)
- `--status-info`: `#38BDF8` (Signal Cobalt — `WORKING`, alternative street route)

### Projector Daylight Mode (`[data-theme="noc-light"]`)
- `--bg-canvas`: `#F8FAFC`
- `--bg-surface`: `#FFFFFF`
- `--bg-elevated`: `#F1F5F9`
- `--border-subtle`: `#CBD5E1`
- `--text-primary`: `#0F172A`
- `--text-secondary`: `#334155`
- `--text-muted`: `#475569`
- `--accent-blaze`: `#EA580C`
- `--accent-blaze-ink`: `#FFFFFF`

## Typography & Density Rules
- **UI & Headings:** `Host Grotesk`, `Fira Sans`, system-ui (`-0.02em` tracking on headings).
- **Telemetry, Coordinates, Optical `dBm`, Work-Order IDs, NAP Ports, Timers:** `Atkinson Hyperlegible Mono`, `Fira Code`, monospace (`font-variant-numeric: tabular-nums`).
- **Table & Dock Density:** Compact `36px–40px` desktop row height, sticky column headers, instant multi-facet filtering, zero decorative hero banners inside operational views.
