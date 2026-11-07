# Page Override: Field Technician Mobile Cockpit (`/tech` & `/demo` Right Frame)

> Overrides `design-system/fiberblaze-wfm/MASTER.md` for outdoor Cavite FTTH field workflows and 3D turn-by-turn navigation.

## Surface & Ergonomic Rules

### Outdoor Daylight Mode (`[data-theme="field-light"]` — Default for Field Visibility)
- `--bg-canvas`: `#F8FAFC`
- `--bg-surface`: `#FFFFFF`
- `--bg-elevated`: `#F1F5F9`
- `--border-subtle`: `#CBD5E1`
- `--text-primary`: `#090D16` (Maximum sunlight legibility)
- `--text-secondary`: `#1E293B`
- `--accent-blaze`: `#C2410C` (`#FFFFFF` label text, > 5.1:1 contrast)
- `--status-ok`: `#047857`
- `--status-fault`: `#B91C1C`

### Night / 3D Navigation Cockpit Mode (`[data-theme="field-dark"]`)
- Matches `ops-noc.md` Carbon/Obsidian HUD tokens so 3D extruded Cavite buildings, amber primary route lines, and maneuver banners mirror the street-navigation cockpit seamlessly.

## Touch & Interaction Mandates
- **Minimum Touch Target:** `48px × 48px` (`min-h-12`) on all buttons, port cells, tabs, and camera shutter controls (`gap-2` / `8px+` minimum spacing between adjacent interactive elements).
- **Tap Responsiveness:** `touch-action: manipulation` and `overscroll-behavior: contain` on scrollable drawers, signature canvas, and MapLibre stage.
- **Persistent Connectivity & Queue Strip:** Top status bar always displays `ONLINE` vs `DEAD-ZONE OFFLINE`, GPS lock accuracy, and pending IndexedDB sync count with one-tap sync drawer access.
