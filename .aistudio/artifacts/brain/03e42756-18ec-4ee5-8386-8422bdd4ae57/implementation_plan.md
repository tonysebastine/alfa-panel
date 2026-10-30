# UI Polish, Responsive Layout Density & Toast Notification Architecture

An enterprise-grade UI refinement plan to elevate 1Panel Architect into a refined, high-density DevOps console with responsive card sizing, balanced table action spacing, tabular monospace figures with memory meters, and a floating top-right toast stack with auto-dismiss and action undo.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Implementation Status**: Completed & Verified. All layout density polish, responsive card sizing, tabular monospace figures with memory meters, and the floating top-right toast notification stack with action undo have been deployed, passing ESLint and Next.js production compilation with HTTP 200 responses.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades the entire user interface into a cohesive, pixel-perfect Linux hosting dashboard adhering to high-density SaaS design standards. Replaces jarring inline alert banners with a unified floating toast stack, refines table row ergonomics so 7 direct action controls fit cleanly without awkward wrapping on laptops and desktop viewports, and gives every metric precise tabular alignment.
- **Target Audience**: Systems engineers and DevOps developers managing production container stacks who demand high visual hierarchy, instant feedback, and zero cognitive friction.
- **Key Value**: Delivers professional aesthetic polish, responsive flexibility across viewport sizes (1280px to 1920px+), and ergonomic operational controls.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Executing Site Actions with Toast Undo*: Clicking "Stop", "Restart", or "Delete" immediately fires a floating toast at the top-right corner with a clear message, a countdown progress line, and an "Undo" button (e.g. for accidental stops).
  2. *Scanning Workload Metrics*: The workload table displays memory usage as tabular figures (`482 MB / 2048 MB`) accompanied by a sleek inline progress meter that shifts color from emerald to amber if usage exceeds 80%.
  3. *Responsive KPI Card Grids*: Top-level summary cards adapt smoothly from a 2-column mobile split to a balanced 4-column desktop layout with consistent padding, hairline borders, and subtle typographic dividers (`·`).
  4. *Ergonomic Action Bar*: The 7 direct action buttons (`Start/Stop`, `Restart`, `Logs`, `Auto-Heal`, `Files`, `Manage`, `Delete`) are styled with uniform 32px targets, subtle borders, high-contrast hover states, and clear native tooltips that never wrap awkwardly.

- **Visual Identity & Theme**:
  - *Color Palette*: Neutral dark slate canvas (`#0b0f19` / `bg-slate-950`), structural card surfaces (`#111827` / `bg-slate-900`), and subtle borders (`border-slate-800`).
  - *Accent System*: Emerald (`#10b981`) for nominal health, cyan (`#06b6d4`) for network/SSL, purple (`#a855f7`) for diagnostic logs, and rose (`#f43f5e`) for destructive/stopped states.
  - *Typography*: Strict 2+1 font system with sans headings and body paired with `font-mono tabular-nums` for all metrics, latencies, ports, and timestamps.
  - *Zero-Pill Discipline*: Unboxed status text with subtle typographic dots (`·`), reserving pill outlines strictly for functional interactive controls.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Floating Toast Stack vs. Inline Page Banners**
  - *Chosen Approach*: Build a lightweight, accessible React toast context/manager positioned at `fixed top-5 right-5 z-50` supporting multiple queued notifications, auto-dismiss, and callback actions.
  - *Why*: Inline banners push page content down on every click, creating jarring layout shifts (CLS) when performing rapid site actions.
  - *Alternative Considered*: Browser native alerts (rejected: blocks thread and breaks iframe).

- **Decision 2: Compact Action Button Strip with Tooltips**
  - *Chosen Approach*: Group row actions into a dedicated button strip with fixed 32×32px click targets, clear iconography, distinct hover tints, and ARIA labels.
  - *Why*: Eliminates awkward vertical wrapping while keeping all high-frequency operations single-click accessible.

- **Decision 3: Monospace Memory & CPU Bars**
  - *Chosen Approach*: Render memory usage as `used / limit` with a 48px inline proportional bar and percentage indicator.
  - *Why*: Allows operators to spot memory-hungry containers instantly without opening the detail view.

---

### 4. Technical Architecture & Component Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js Root Layout / Page                         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     ToastProvider & Floating Stack                    │  │
│  │   - Fixed top-5 right-5 z-50 toast queue                              │  │
│  │   - Auto-dismiss countdown (3.5s) + Action Undo handler               │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │                            DashboardShell                             │  │
│  │   - Responsive sidebar with clean 7-item hosting navigation           │  │
│  │   - Top bar with system telemetry, node info & quick watchdog status  │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│         ┌────────────────────────────┼────────────────────────────┐         │
│         ▼                            ▼                            ▼         │
│  ┌──────────────┐             ┌──────────────┐             ┌──────────────┐ │
│  │ Sites View   │             │ Auto-Heal    │             │ Databases &  │ │
│  │ - 4-Col KPIs │             │ Watchdog     │             │ Settings     │ │
│  │ - Monospace  │             │ - MTTR cards │             │ - High-dense │ │
│  │   memory bar │             │ - Live feed  │             │   tables     │ │
│  │ - 32px action│             │ - Latency    │             │ - MFA & RBAC │ │
│  │   button row │             │   counters   │             │   forms      │ │
│  └──────────────┘             └──────────────┘             └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Interactive State & Event Mapping**:
  - `ToastContext`: Exposes `showToast({ message, type, undoAction })`.
  - `SitesManagementView`: Consumes toast system; replaces local `actionNotice` banner with floating toasts and 5-second undo callback for stop/start actions.
  - `SiteDetailView`: Connects action buttons to toast system.
  - `AutoHealDashboard`: Polishes simulation output and metric cards.
  - Verification: Run `lint_applet` and `compile_applet` to verify clean build.
