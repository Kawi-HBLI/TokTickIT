# Lab 3 UI Specification — Zen Green Service Desk

## 1. Purpose and UI contract

Lab 3 replaces the Lab 2 development requester selector with authenticated
users. It preserves the established Zen Green visual language and the usable
requester Ticket flows while adding role-aware navigation and the staff and
administrator workspaces. This document describes the intended interface; it
does not grant a UI permission that the API does not enforce.

Roles shown by the UI are **Requester**, **IT Staff**, and **Administrator**.
The shell and routes are rendered from the authenticated current user. A
hidden menu item, altered URL, or manipulated client state must never be the
only barrier to restricted data or actions.

## 2. Shared visual system

Lab 3 extends, rather than replaces, the tokens established in
`client/src/app.css` and `docs/lab-02/ui-spec.md`.

| Token | Value | Required use |
|---|---:|---|
| Primary green (`--zen-700`) | `#006B3C` | Header, primary button, major brand emphasis |
| Dark green (`--zen-900`) | `#064E3B` | Heading and primary-button hover/focus surface |
| Secondary green (`--zen-500`) | `#0B7A46` | Active navigation, links, focus accent |
| Pale green (`--zen-100`) | `#EAF6EF` | Selected, success, and quiet emphasis surface |
| Page background | `#F5F7F6` | Application background |
| Surface (`--surface`) | `#FFFFFF` | Cards, forms, tables, dialogs |
| Primary text | `#1A2E26` | Body text, labels, headings |
| Muted text | `#64748B` | Help, dates, secondary metadata |
| Neutral border (`--border`) | `#CBD5E1` | Inputs, cards, table divisions |
| Read-only surface | `#EEF3F0` | Server-managed data that is not editable |
| Error | `#B91C1C` / `#FEF2F2` | Validation and safe failure alert |
| Warning | `#92400E` / `#FFFBEB` | Irreversible or cautionary action |
| Success | `#065F46` / `#EAF6EF` | Confirmed successful action |
| Focus ring | `#81C9A8`, 3px outer outline | Keyboard-visible focus indicator |

- Use `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`; body text is
  at least 16px with line-height at least 1.5.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48px. The main content is centred,
  max-width 1200px. Cards have 8px radius, restrained elevation, and 24px
  desktop / 16px mobile internal padding.
- Every status and priority badge includes readable text; color reinforces but
  never supplies the only meaning. Status text uses the user-facing names,
  such as `Waiting for Requester`, not only enum values.
- Existing priority badge colors remain: Critical `#991B1B/#FEE2E2`, High
  `#9A3412/#FFEDD5`, Medium `#92400E/#FEF3C7`, and Low `#1E40AF/#DBEAFE`.
  Status badges must likewise give each status a text label and a
  high-contrast foreground/background pairing.

### Shared components

**Form controls.** Every editable input, select, and textarea has a visible
`<label>`, a programmatic association, a minimum 44px interactive height, and
neutral border on white. Required fields show a visible asterisk and semantic
required state. Invalid fields expose `aria-invalid`, reference help/error
with `aria-describedby`, and show an error immediately below that field.
Placeholders are examples, never labels. Read-only values use the read-only
surface and are selectable for copying where useful.

**Buttons.** Use one solid primary action per decision area. Secondary buttons
are bordered or pale green; tertiary actions are text links; destructive
actions use dark-red text and explicit labels. While saving, disable the
initiating control and show an inline spinner plus a verb such as `Saving
changes…`; do not use spinner-only controls. Icon-only buttons require an
accessible name and tooltip.

**Feedback.** Field errors stay adjacent to their input. A page-level safe
failure states what happened without leaking protected records and offers
Retry when meaningful. Successful, loading, and non-critical update messages
are announced through `aria-live="polite"`; validation summary or failed
submission may use `role="alert"` / assertive announcement. Preserve typed
values after safe API failure. Empty, no-results, forbidden, not-found, and
conflict states use distinct wording and a useful next action.

**Dialogs.** Confirmations have an accessible name, move focus to their
heading or first meaningful control, trap focus while open, close with Escape
unless an operation is currently irreversible/busy, and restore focus to the
trigger. The destructive button names the action (for example, `Deactivate
account`), rather than only `Confirm`.

## 3. Authenticated application shell and routes

The login and mandatory change-password pages intentionally omit the
authenticated shell. All other application routes use a compact Primary Green
header containing TokTickIT brand, role-appropriate navigation, current
user's name and role, and `Log out`. The current page is identifiable by text,
active-state styling, and `aria-current="page"`—not color alone.

| Role | Navigation |
|---|---|
| Requester | My Tickets, Create Ticket |
| IT Staff | Ticket Queue |
| Administrator | User Management, Ticket Queue |

On mobile, navigation becomes a labelled menu button with `aria-expanded` and
a controlled menu. It remains fully keyboard operable and exposes the current
user/role without relying on a hover interaction. The Lab 2 `Development
Requester` display and `Change Requester` action are removed entirely.

At initial boot, display a small loading state until current-user resolution
finishes. When no valid session exists, redirect to `/login`; when the user is
required to change the initial password, redirect to `/change-password` and
do not expose application content beneath it. After logout, clear client
identity/cache, announce completion where the route transition permits it,
and send the user to `/login`.

## 4. Authentication screens

### 4.1 Login — `/login`

Use a centred, narrow surface card with TokTickIT title, `Sign in` heading,
brief service-desk description, Email and Password fields, and `Sign in`
primary button. Include a visible password-show/hide control with a descriptive
accessible name. No registration or reset-password link is provided because
those workflows are out of scope.

| State | Required presentation and behaviour |
|---|---|
| Ready | Email and password labels visible; submit remains available after client validation succeeds |
| Client validation | Required/invalid-email or missing-password message occurs by its field; focus goes to the first invalid field after submit |
| Signing in | Both fields and submit protected from duplicate submission; button reads `Signing in…` |
| Invalid credentials | One safe form-level message, `We could not sign you in. Check your email and password.` It must not reveal whether an email exists |
| Inactive account after valid credentials | `This account is inactive. Contact an administrator for access.` No other account information is exposed |
| Rate limited | Safe retry-after wording without revealing account information; sign-in remains appropriately disabled until allowed |
| Server/network failure | `We could not sign you in right now. Try again.` with Retry; retain email but clear password as appropriate for safety |
| Success | Route by server-delivered user state: mandatory password change or permitted home page |

### 4.2 Mandatory Change Password — `/change-password`

This is a gated page for `mustChangePassword`; browser navigation to another
app route returns to this page until success. It contains Current/Initial
Password, New Password, Confirm New Password, policy hint, and `Change
password` primary action. New password is not announced or exposed after
typing; show/hide controls are labelled.

Policy feedback is stated in text before submission and field-level validation
identifies mismatch or policy failure. On success, announce `Password changed.
You can now continue to TokTickIT.` and route to the role's home. Busy,
safe-failure, and focus behaviour follow shared rules. `Log out` is always
available; ordinary shell navigation is not.

## 5. Requester experience and Lab 2 regression

Requester routes retain Create Ticket (`/tickets/new`), My Tickets
(`/tickets`), and Ticket Detail (`/tickets/:id`). Identity comes only from
the logged-in user; requester selection, requester ID inputs, and switcher
UI are removed. Lab 2 filters, sort, pagination, attachment upload/download,
soft removal, owned-ticket safe not-found behaviour, validation, and
desktop/tablet/mobile layouts remain applicable.

### 5.1 Requester Ticket Detail

The detail page shows ticket number, requested priority, IT priority, current
status, current owner (or `Unassigned`), category, related system, summary,
description, timestamps, and attachments. It keeps the Lab 2 Back to My
Tickets link and read-only grid. A requester may only reach their own Ticket;
an inaccessible, deleted, or unknown record displays the same safe `Ticket
not found` screen with `Back to My Tickets`.

Add a `Conversation` section below ticket information and above attachments:

- Public comments show author display name, role label, timestamp, and plain
  text rendered safely. Requesters can create a non-empty Public Comment.
- Internal Notes never appear in requester DOM, visual output, accessible
  tree, or API response. The absence is not replaced with a disabled internal
  note form.
- Comment composer has a labelled textarea, maximum-length help/count, submit
  action `Post public comment`, busy state, field errors, success live update,
  and retained text after a safe failure.
- A separate `Problem appears resolved` action is available only for `New`,
  `Open`, `In Progress`, or `Waiting for Requester`. It clearly explains that
  it notifies IT and does not mark the Ticket Resolved or Closed. Because the
  action is idempotent and does not change formal status, it does not require a
  confirmation dialog. It submits the currently displayed Ticket version; a
  stale/concurrent status conflict reloads the Ticket and explains that its
  status changed. After success, replace the action with the backend time
  and author indication while leaving formal status unchanged.

Requester cannot see Claim, assignment, IT priority editing, status controls
that exceed the permitted resolution indication, or `Actions Taken` (Lab 4).

## 6. IT Staff experience

### 6.1 Ticket Queue — `/staff/tickets`

The queue is the IT Staff landing page. It has a heading, concise count/summary
that is updated accessibly, and a filter toolbar with visible labels:

- Search by Ticket Number, Summary, or Requester;
- Status, Requested Priority, IT Priority, Category, and Owner filters;
- Sort selector and labelled ascending/descending control;
- Page size and `Clear filters` action.

The desktop table has explicit headers and visible `View details` action:

1. Ticket Number
2. Summary
3. Requester
4. Requested Priority
5. IT Priority
6. Status
7. Owner
8. Last Updated
9. View Details

Sortable headers/buttons expose their current sort direction semantically;
do not make a whole row the only activation target. `Unassigned` is readable
as text plus neutral badge. Pagination reports `Showing X–Y of Z tickets`,
and Previous/Next state is both disabled and exposed semantically at bounds.
Changing a query, filter, sort, or page size returns to page one.

At tablet and mobile widths, switch before overflow to accessible Ticket cards
with the same essential metadata and a full-width View Details action. The
table must not force horizontal page scrolling. Queue states are loading
skeletons, empty queue, no-results with Clear filters, safe retrieval failure
with Retry, and safe forbidden/not-found route responses.

### 6.2 IT Staff Ticket Detail — `/staff/tickets/:id`

This detail uses the same immutable ticket information and attachment
presentation as the requester view, then groups staff controls into visibly
separate cards so public communication cannot be mistaken for internal work.

**Assignment and workflow card.** Display current owner, requested priority,
IT priority, and status. IT Staff can Claim an unassigned ticket or assign /
reassign within the authorization and transition rules. Each mutation shows
the affected ticket/owner/state in text, validates server result, has busy and
safe conflict states, and refreshes visible values from the response. IT
Priority and status controls are labelled selects or equivalent accessible
controls; unavailable transitions are absent or explained as unavailable,
never made to look usable. Confirmation is used wherever the status-transition
matrix requires it.

**Conversation card.** Public comments are presented and composed as above.
The clearly distinct `Internal notes — visible to IT Staff and Administrators
only` area uses a warning-tinted boundary, explicit visibility text/icon, its
own labelled composer, character help/count, and `Add internal note` action.
Public and Internal composer controls must never share one ambiguous submit
button. Both entries are append-only; edit and delete controls are absent.

The page exposes Ticket not found, safe forbidden, load failure, per-action
conflict (for example, ownership changed by another staff member), validation,
and saving/success states without discarding unaffected view content.

## 7. Administrator User Management — `/admin/users`

Only Administrator navigation exposes this route. The page starts with title,
short safety explanation, `Create user` primary action, search labelled
`Search by name or email`, and Role filter (`All roles`, Requester, IT Staff,
Administrator). The desktop table includes Name, Email, Role, Status, and
visible Edit action. Inactive uses readable `Inactive` text and an icon/badge,
not opacity/color alone. Mobile/tablet use cards or an appropriately reduced
layout with the same data and full-width Edit action.

Create and Edit open an accessible dialog or dedicated page with visible
heading and labels for Name, Email, one Role, activation state, and Initial
Password / Set new initial password as appropriate. Password resets explicitly
state that the recipient must change it at next sign-in. User list has loading,
empty, no-results, safe failure, and Retry states. Search/filter state is
retained after closing a modal or successful mutation where practical.

Deactivation requires a confirmation dialog naming the user and warns when
the action is prohibited because it would deactivate the signed-in
administrator or the last active Administrator. Such server conflict appears
as a safe contextual error; it does not silently change the toggle. No delete
control, bulk action, multi-role control, invitation, or profile settings are
present.

## 8. Global state, error, and responsive rules

| Viewport | Width | Required layout |
|---|---:|---|
| Desktop | `>= 992px` | Centred max-width page; full queue/user table; multi-column forms and detail grids |
| Tablet | `768–991px` | Wrapped toolbar; two-column forms where usable; table reduced to cards before content would overflow |
| Mobile | `< 768px` | One-column content; menu navigation; collapsed filters; full-width primary and key secondary actions; card list |

At every breakpoint: no horizontal page scrolling; no clipped label, error,
button, comment, attachment filename, badge, or pagination control; long
names wrap or truncate visually only when the full string is programmatically
available; dialogs fit within viewport and retain reachable actions; and text
does not overlap after zoom or larger system fonts. Content must reflow without
loss of functionality at 320 CSS px and 400% zoom.

All screens implement a suitable form of loading, saving, validation, success,
empty, no-results, forbidden, not-found, conflict, and safe unexpected failure
state where that state can occur. Protected tickets/users use generic safe
not-found or forbidden wording as defined by the API contract and never expose
another person's record through an error.

## 9. Accessibility acceptance rules (WCAG 2.2 AA)

- Use semantic landmarks (`header`, `nav`, `main`), one `h1` per page, logical
  heading order, native controls before custom ARIA widgets, and valid
  name/role/value/state semantics.
- All functions—including login, logout, navigation menu, filters, table
  detail links, dialogs, comments, assignment, priority/status update, and
  user edit/deactivation—are usable by keyboard alone in visual reading order.
  Avoid keyboard traps except a temporary modal focus trap with Escape/close.
- Keyboard focus has a persistent 3px high-contrast ring with offset; it is
  not obscured by sticky header, card, or modal. Focus moves predictably to
  first validation error after failed submit, into a dialog on open, to the
  relevant heading after route change, and back to the trigger on dialog close.
- Text contrast is at least 4.5:1 (normal text); large text and non-text UI
  indicators are at least 3:1. State, priority, requiredness, success, warning,
  and error never rely on color alone; pair them with text and, where helpful,
  icons/patterns.
- Every interactive target is at least 24 by 24 CSS px (WCAG 2.2 minimum); the
  established 44px high button/control convention is retained for touch
  comfort. Adjacent small targets must have adequate spacing.
- Visible labels, instructions, constraints, and errors identify what needs
  correction. Do not clear entered data after validation or recoverable
  failure. Do not ask users to re-enter information already available in the
  active flow unless security requires it.
- Dynamic queue counts, save results, comments, and filters use a polite live
  region; errors needing immediate attention use an assertive alert without
  unexpected focus loss. Busy controls expose their state and cannot be
  duplicate-submitted.
- Decorative icons use `aria-hidden`; meaningful images have concise text
  alternatives. Icon-only buttons have accessible names. Status/role badges
  have text content that remains available to assistive technology.

## 10. Automated UI and visual evidence

Component/style/accessibility tests must verify role-aware shell navigation;
Login and Change Password labels/errors/busy states; requester exclusion from
Internal Notes and staff actions; staff queue table/card equivalence; detail
workflow controls and visibly separated public/internal composers; admin
create/edit/deactivation safeguards; semantic labels; focus; live regions;
badge text; responsive no-overflow; and approved tokens.

Capture the following final evidence at Desktop `1440x900`, Tablet `834x1112`,
and Mobile `390x844`, with `-desktop`, `-tablet`, or `-mobile` in each file
name. Exact planned paths:

| Area | Required screenshots |
|---|---|
| Authentication | `artifacts/lab-03/screenshots/authentication/01-login-ready-{viewport}.png`; `02-login-validation-or-safe-failure-{viewport}.png`; `03-change-password-{viewport}.png` |
| Staff queue | `artifacts/lab-03/screenshots/staff-queue/01-queue-results-{viewport}.png`; `02-queue-filter-no-results-{viewport}.png`; `03-queue-loading-or-failure-{viewport}.png` |
| Staff ticket detail | `artifacts/lab-03/screenshots/staff-ticket-detail/01-detail-assignment-priority-status-{viewport}.png`; `02-detail-public-and-internal-notes-{viewport}.png`; `03-detail-conflict-or-validation-{viewport}.png` |
| User management | `artifacts/lab-03/screenshots/user-management/01-users-list-{viewport}.png`; `02-create-or-edit-user-{viewport}.png`; `03-deactivation-safety-or-forbidden-{viewport}.png` |
| Requester regression | `artifacts/lab-03/screenshots/requester/01-my-tickets-authenticated-{viewport}.png`; `02-ticket-detail-public-comment-{viewport}.png`; `03-problem-appears-resolved-{viewport}.png` |

For each capture, verify Zen Green color/surface continuity; visible role and
active navigation; readable labels and errors; distinguishable public/internal
content; no clipping/overlap/horizontal overflow; reachable actions; explicit
badges; and a visible non-color focus/state indicator in at least one
accessibility capture. Keyboard, screen-reader, and authorization behaviour
also require automated/E2E evidence; screenshots alone are not proof.

## 11. Contract alignment decisions

1. Administrator is permitted to use Ticket Queue and Staff Ticket Detail in
   addition to Administrator-only User Management, matching the approved
   authorization matrix.
2. Formal `Resolved`, `Closed`, `Reopened`, and `Cancelled` transitions use the
   confirmations defined in `specification.md`; Problem Appears Resolved is a
   separate idempotent indication and does not require confirmation.
3. Public Comments allow 1-2,000 trimmed characters and Internal Notes allow
   1-4,000 trimmed characters, matching the API contract.
