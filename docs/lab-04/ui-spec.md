# Lab 4 UI Specification: Zen Green Service Desk & Operational Dashboards

## 1. Purpose and UI Contract

This document defines the user interface layout, interaction behavior, responsive adaptations, and WCAG 2.2 AA accessibility requirements for Lab 4 of TokTickIT. It extends the established **Zen Green** design language, adding operational dashboards for Requesters and IT Staff, and embedding the comprehensive **Actions Taken** workflow into Ticket Detail.

---

## 2. Shared Visual System & Status Badges

### 2.1 Zen Green Color Palette

| Token Name | Hex Code | WCAG Contrast Ratio | Purpose |
| :--- | :--- | :---: | :--- |
| `--color-forest-dark` | `#133826` | 11.5:1 on white | Primary brand color, headers, high-emphasis text |
| `--color-forest-mid` | `#1f593c` | 6.8:1 on white | Secondary brand, navigation highlights, primary buttons |
| `--color-sage-light` | `#e8f2ec` | 13.2:1 with dark | Background for cards, badges, and panels |
| `--color-surface-bg` | `#f8faf8` | N/A | Clean off-white page background |
| `--color-border-subtle` | `#d1dfd6` | N/A | Table and card dividers |
| `--color-status-pending` | `#b45309` (text) / `#fef3c7` (bg) | 5.2:1 | Pending Action Taken badge |
| `--color-status-completed`| `#15803d` (text) / `#dcfce7` (bg) | 5.4:1 | Completed Action Taken badge |
| `--color-status-cancelled`| `#4b5563` (text) / `#f3f4f6` (bg) | 6.5:1 | Cancelled Action Taken badge |
| `--color-error-danger` | `#b91c1c` (text) / `#fee2e2` (bg) | 6.1:1 | Resolution Gate error banner, critical alerts |

### 2.2 Typography & Semantic Badges

- **Font Family:** Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Status Chips:** Rendered with text labels and semantic SVG icons to ensure non-color status indication (e.g., `PENDING` displays a clock icon, `COMPLETED` displays a checkmark icon, `CANCELLED` displays an X icon).
- **Focus Indicator:** Visible 2px solid outline in `#1f593c` with 2px offset on all interactive elements.

---

## 3. Application Shell & Role Navigation

The top navigation bar provides clear active-page indicators and role-scoped navigation:

```
+-------------------------------------------------------------------------------------------------------------+
|  TokTickIT [Zen Logo]    Dashboard    Ticket Queue    User Management [Admin only]     [Jane IT (Staff)] [Logout] |
+-------------------------------------------------------------------------------------------------------------+
```

- **IT Staff Shell:**
  - `Dashboard`: Active link to `/staff/dashboard`.
  - `Ticket Queue`: Active link to `/staff/tickets`.
  - User badge displaying name and role tag `IT_STAFF`.
- **Administrator Shell:**
  - `Dashboard`: Active link to `/staff/dashboard`.
  - `Ticket Queue`: Active link to `/staff/tickets`.
  - `User Management`: Active link to `/admin/users`.
  - User badge displaying name and role tag `ADMINISTRATOR`.
- **Requester Shell:**
  - `Dashboard`: Active link to `/dashboard`.
  - `Create Ticket`: Active link to `/tickets/new`.
  - `My Tickets`: Active link to `/tickets`.
  - User badge displaying name and role tag `REQUESTER`.

---

## 4. IT Staff Dashboard UI (`/staff/dashboard`)

The Staff Dashboard provides operational awareness and prioritized work queues.

```
+-------------------------------------------------------------------------------------------------------------+
|  Operational Overview                                                               [Refresh Data Button]  |
+-------------------------------------------------------------------------------------------------------------+
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+             |
|  | OPEN TICKETS       |  | PENDING ACTIONS    |  | COMPLETED TODAY    |  | UNASSIGNED QUEUE   |             |
|  | 14 (Team)          |  | 2 (My Actions)     |  | 3 (Completed, UTC) |  | 3 (Team)           |             |
|  | [View All Open ->] |  | [View Tickets ->]  |  | [View Tickets ->]  |  | [Claim Work ->]    |             |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+             |
+-------------------------------------------------------------------------------------------------------------+
|  My Assigned Work (5 Tickets)                                                    [View Full Queue ->]      |
|  +-------------------+-----------------------------------------+----------+-------------+----------------+  |
|  | Ticket Number     | Summary                                 | Priority | Status      | Actions        |  |
|  +-------------------+-----------------------------------------+----------+-------------+----------------+  |
|  | TCK-2026-00012    | VPN connection drops every 10 minutes    | HIGH     | IN_PROGRESS | 1 Pending      |  |
|  | TCK-2026-00018    | Keyboard spacebar stuck on Lab PC 4     | MEDIUM   | OPEN        | 0 Actions      |  |
|  +-------------------+-----------------------------------------+----------+-------------+----------------+  |
+-------------------------------------------------------------------------------------------------------------+
|  Unassigned Team Work (3 Tickets)                                                                           |
|  +-------------------+-----------------------------------------+----------+-------------+----------------+  |
|  | TCK-2026-00045    | New hire workstation setup              | MEDIUM   | OPEN        | [Claim Ticket] |  |
|  +-------------------+-----------------------------------------+----------+-------------+----------------+  |
+-------------------------------------------------------------------------------------------------------------+
|  Recent Action Activity (Preview - Latest 10)                                                               |
|  - Jane IT completed action on TCK-2026-00012: "Adjusted MTU size on router interface" (10m ago)          |
+-------------------------------------------------------------------------------------------------------------+
```

### 4.1 Interactive Drill-Down & URL Hydration Rules

| Metric Card | Counted Entity | Exact Calculation Predicate | Drill-Down Destination URL | Destination Predicate | Notes on Entity Match & Label |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Open Tickets** | Tickets | `currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?statusGroup=active` | `currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. |
| **Unassigned Queue** | Tickets | `ownerId IS NULL AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?owner=unassigned&statusGroup=active` | `ownerId IS NULL AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. Excludes cancelled unassigned tickets. |
| **Pending Actions** | Actions Taken | `ActionTaken.status = 'PENDING' AND ActionTaken.assigneeId = currentUser.id AND Ticket.currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active` | Active tickets containing $\ge 1$ pending action assigned to current user | **Entity Distinction:** Card counts discrete *Actions* ($N$ actions); destination lists *Tickets* containing them ($M \le N$). Destination link labeled: **"View tickets containing these actions"**. Neither count nor queue includes cancelled tickets retaining frozen pending actions. No separate actions page required. |
| **Completed Today** | Actions Taken | `ActionTaken.status = 'COMPLETED' AND ActionTaken.completedById = currentUser.id AND completedAt >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')` | `/staff/tickets?completedBy=me&completedDate=today` | Tickets containing actions completed by current user today (UTC) | **Entity Distinction:** Card counts discrete *Actions* completed by current user today. "Completed by" means `ActionTaken.completedById`. Destination link labeled: **"View tickets containing these actions"**. The dashboard's "Recent Action Activity" list is an in-context preview of the latest 10 items, not the complete result set. |

- Browser Back/Forward buttons update active filters via `popstate` / `useSearchParams`.

---

## 5. Requester Dashboard UI (`/dashboard`)

The Requester Dashboard provides an executive summary of user-owned requests.

```
+-------------------------------------------------------------------------------------------------------------+
|  Welcome back, Sarah! Here is the status of your requests.                             [Create New Ticket] |
+-------------------------------------------------------------------------------------------------------------+
|  +---------------------------+  +---------------------------+  +---------------------------+                |
|  | ACTIVE TICKETS            |  | AWAITING YOUR INPUT       |  | RESOLVED & CLOSED         |                |
|  | 3                         |  | 1                         |  | 8                         |                |
|  | [View Active Tickets ->]  |  | [Provide Details ->]      |  | [View History ->]         |                |
|  +---------------------------+  +---------------------------+  +---------------------------+                |
+-------------------------------------------------------------------------------------------------------------+
|  Recent Ticket Activity                                                                                     |
|  +-------------------+---------------------------------------+----------------------+--------------------+  |
|  | Ticket Number     | Summary                               | Status               | Latest Update      |  |
|  +-------------------+---------------------------------------+----------------------+--------------------+  |
|  | TCK-2026-00033    | Need access to Figma workspace        | WAITING_FOR_REQUESTER| Staff commented    |  |
|  | TCK-2026-00028    | Outlook calendar sync failure         | RESOLVED             | Action completed   |  |
|  +-------------------+---------------------------------------+----------------------+--------------------+  |
+-------------------------------------------------------------------------------------------------------------+
```

### 5.1 Privacy & Drill-Down Rules

| Metric Card | Counted Entity | Exact Calculation Predicate | Drill-Down Destination URL | Destination Predicate | Notes on Entity Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Tickets** | Tickets | `requesterId = currentUser.id AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/tickets?statusGroup=active` | `requesterId = currentUser.id AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. |
| **Awaiting Input** | Tickets | `requesterId = currentUser.id AND currentStatus = 'WAITING_FOR_REQUESTER'` | `/tickets?status=WAITING_FOR_REQUESTER` | `requesterId = currentUser.id AND currentStatus = 'WAITING_FOR_REQUESTER'` | 1:1 Ticket count match. Hydrates status filter dropdown. |
| **Resolved & Closed**| Tickets | `requesterId = currentUser.id AND currentStatus IN ('RESOLVED','CLOSED')` | `/tickets?statusGroup=resolved_closed` | `requesterId = currentUser.id AND currentStatus IN ('RESOLVED','CLOSED')` | 1:1 Ticket count match. Covers both resolved and closed. |

- **Privacy Protection:** The recent ticket activity feed renders ONLY public ticket summaries, public comments, and public action summaries. Internal Notes, technical audit logs, and internal staff IDs are excluded.

---

## 6. Actions Taken on Staff Ticket Detail (`/staff/tickets/:id`)

The IT Staff Ticket Detail page incorporates an **Actions Taken** section positioned below Ticket Overview and above Comments/Notes.

```
+-------------------------------------------------------------------------------------------------------------+
|  Ticket #TCK-2026-00012: VPN connection drops every 10 minutes                 Status: [IN_PROGRESS]        |
|  Owner: [Jane IT]  |  IT Priority: [HIGH]  |  Category: [Network]                     [Change Status V]     |
+-------------------------------------------------------------------------------------------------------------+
|  Actions Taken (2)                                                                     [+ Add Action Taken] |
+-------------------------------------------------------------------------------------------------------------+
|  +--------------------------------------------------------------------------------------------------------+ |
|  | [PENDING]  Assigned to: Jane IT  |  Created: Oct 27, 2026 10:00 by Jane IT                             | |
|  | Description: Run packet capture on firewall gateway to inspect dropped TCP resets.                     | |
|  | Follow-Up: Required ("Verify capture with network team") | Attachment Notes: "pcap-log-01.cap"         | |
|  | [Complete Action]   [Cancel Action]   [Edit Details]   [View Audit History]                            | |
|  +--------------------------------------------------------------------------------------------------------+ |
|  +--------------------------------------------------------------------------------------------------------+ |
|  | [COMPLETED] Assigned to: Jane IT  |  Completed by: Bob Staff (Oct 27, 2026 11:30)                     | |
|  | Description: Replaced ethernet patch cable between dock and wall port.                                  | |
|  | Result: Link speed negotiated to 1Gbps full duplex. Packet loss dropped from 12% to 0%.                 | |
|  | [View Audit History]                                                                                   | |
|  +--------------------------------------------------------------------------------------------------------+ |
+-------------------------------------------------------------------------------------------------------------+
```

### 6.1 Modal Dialogs, Idempotency & Focus Management

1. **Client Idempotency Key Handling:**
   - The UI automatically generates a UUIDv4 `idempotencyKey` on initializing the "Add Action Taken" modal.
   - If the user submits, encounters a network timeout, and clicks submit again, the client reuses the identical key.
   - On successful submission or modal cancellation, the key is cleared and a new key generated for the next action.
2. **Pending-Submit Protection:**
   - On clicking submit in any modal (`Save Action`, `Confirm Completion`, `Confirm Cancellation`), the button enters a disabled pending state displaying a spinner and "Saving...", preventing duplicate clicks.
3. **Form State Preservation:**
   - If the server returns a recoverable validation error (`400`, `409`, or `422`), all entered form values (description, follow-up note, result, cancellation reason) remain populated in React state so the user never has to retype their work.
4. **Modal Focus Trapping & Restoration:**
   - Opening any modal traps keyboard focus inside its interactive elements (`Tab` / `Shift+Tab` cycle within modal).
   - Pressing `Escape` or clicking `Cancel` dismisses the modal and restores keyboard focus to the triggering button.

---

## 7. Actions Taken on Requester Ticket Detail (`/tickets/:id`)

Requesters view a simplified, transparent record of actions taken on their tickets:

```
+-------------------------------------------------------------------------------------------------------------+
|  Actions Taken by IT Staff                                                                                  |
+-------------------------------------------------------------------------------------------------------------+
|  * Replaced ethernet patch cable between dock and wall port.                                                |
|    Status: COMPLETED (Oct 27, 2026)                                                                         |
|    Outcome: Link speed negotiated to 1Gbps full duplex. Packet loss dropped from 12% to 0%.                 |
|                                                                                                             |
|  * Running packet capture on firewall gateway to inspect dropped TCP resets.                                |
|    Status: IN PROGRESS (Assigned to Jane IT)                                                                |
+-------------------------------------------------------------------------------------------------------------+
```

- Requesters can see `PENDING`, `COMPLETED`, and `CANCELLED` actions.
- Requesters do **NOT** have access to audit history drawers, internal assignee IDs, or edit/complete buttons.

---

## 8. Resolution Gate Feedback UI

When an IT Staff member attempts to update status to `RESOLVED` on Ticket Detail, the UI provides immediate, transparent feedback:

```
+-------------------------------------------------------------------------------------------------------------+
|  [!] CANNOT RESOLVE TICKET: RESOLUTION REQUIREMENTS NOT MET                                                 |
|  The following prerequisites must be fulfilled before resolving this ticket:                               |
|  [X] Primary Ticket Owner assigned (Current: Jane IT)                                                      |
|  [!] At least one COMPLETED Action Taken with documented results (Found: 0 completed)                       |
|  [!] Zero PENDING Actions Taken (Found: 1 pending action in progress)                                       |
|                                                                                                             |
|  Please complete or cancel outstanding actions and ensure results are documented before resolving.         |
|  [Dismiss Alert]                                                                                            |
+-------------------------------------------------------------------------------------------------------------+
```

- The alert is rendered with role `alert` and high-contrast red background (`#fee2e2` with `#991b1b` text).
- Focus is automatically moved to the alert banner so screen-reader users hear the error immediately.

---

## 9. Responsive Rules & 400% Zoom Reflow

### 9.1 Desktop ($1280\text{px}+$)
- Dashboard metric cards displayed in a 4-column horizontal grid.
- Tables show all metadata columns with proper cell truncation and accessible tooltips.

### 9.2 Tablet ($768\text{px} - 1024\text{px}$)
- Metric cards reflow into a $2 \times 2$ grid.
- Tables maintain priority columns; secondary timestamps collapse into relative time ("2h ago").
- Action Taken buttons wrap cleanly beneath description text without clipping.

### 9.3 Mobile ($375\text{px} - 640\text{px}$)
- Metric cards stack in a single vertical column ($1 \times 4$).
- Tables convert into card-based list rows to eliminate horizontal scrolling.
- Modal dialogs render full-screen with touch-friendly tap targets ($\ge 44 \times 44\text{px}$).

### 9.4 400% Zoom / 320px Reflow Check (WCAG 1.4.10)
- Content reflows into a single column at 320px equivalent width without requiring two-dimensional scrolling.
- Layouts use fluid CSS flexbox/grid and wrapping text without relying on `overflow-x: hidden` to clip overflow.

---

## 10. Accessibility Acceptance Rules (WCAG 2.2 AA)

1. **Color Contrast:** All text meets or exceeds 4.5:1 against its background.
2. **Focus Visibility:** Every button, link, input, and modal close button exhibits an unambiguous outline (`outline: 2px solid #1f593c; outline-offset: 2px;`).
3. **Keyboard Navigability & Trapping:**
   - `Tab` moves forward through interactive controls; `Shift+Tab` moves backward.
   - `Escape` closes any open modal or history drawer, returning focus to the trigger button.
   - Focus is trapped inside active modals.
4. **ARIA Semantics:**
   - Modal dialogs use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
   - Error summaries use `role="alert"` and `aria-live="assertive"`.

---

## 11. Visual & Screenshot Evidence Checklist

The following screenshots must be captured under `artifacts/lab-04/screenshots/` for the final submission PDF across desktop, tablet, and mobile viewports:

- [ ] `artifacts/lab-04/screenshots/staff-dashboard/desktop-overview.png`: 4 metric cards, workload tables, and recent activity (1440px).
- [ ] `artifacts/lab-04/screenshots/staff-dashboard/tablet-view.png`: 2x2 metric cards layout (834px).
- [ ] `artifacts/lab-04/screenshots/staff-dashboard/mobile-view.png`: Stacked cards and responsive rows (390px).
- [ ] `artifacts/lab-04/screenshots/requester-dashboard/desktop-summary.png`: 3 metric cards and recent tickets list (1440px).
- [ ] `artifacts/lab-04/screenshots/requester-dashboard/tablet-view.png`: 2x2 or responsive card layout (834px).
- [ ] `artifacts/lab-04/screenshots/requester-dashboard/mobile-view.png`: Mobile layout (390px).
- [ ] `artifacts/lab-04/screenshots/actions-taken/staff-actions-list-desktop.png`: Mixed status actions (`PENDING`, `COMPLETED`, `CANCELLED`) on Staff Ticket Detail (1440px).
- [ ] `artifacts/lab-04/screenshots/actions-taken/staff-actions-list-tablet.png`: Actions list wrapping on Tablet (834px).
- [ ] `artifacts/lab-04/screenshots/actions-taken/staff-actions-list-mobile.png`: Stacked Actions cards on Mobile (390px).
- [ ] `artifacts/lab-04/screenshots/actions-taken/create-action-modal.png`: Create modal with pending-submit state.
- [ ] `artifacts/lab-04/screenshots/actions-taken/complete-action-modal.png`: Complete modal requiring result.
- [ ] `artifacts/lab-04/screenshots/actions-taken/cancel-action-modal.png`: Cancel modal requiring cancellation reason.
- [ ] `artifacts/lab-04/screenshots/actions-taken/audit-history-drawer.png`: Reconstructible timeline of changes with actor and diffs.
- [ ] `artifacts/lab-04/screenshots/actions-taken/resolution-gate-failure.png`: Red error banner when resolution prerequisites fail.
- [ ] `artifacts/lab-04/screenshots/actions-taken/requester-read-only-desktop.png`: Read-only view on Requester Ticket Detail (1440px).
- [ ] `artifacts/lab-04/screenshots/actions-taken/requester-read-only-mobile.png`: Read-only view on Requester Ticket Detail (390px).
- [ ] `artifacts/lab-04/screenshots/accessibility/reflow-400-percent.png`: 320px equivalent view showing clean reflow with zero clipping.
