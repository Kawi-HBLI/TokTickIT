# Lab 2 UI Specification - Zen Green Theme

## 1. UI Goals

The Lab 2 interface must make Requester identity, Ticket ownership, editable versus generated data, validation, and Attachment state easy to understand. Required workflows must remain usable with keyboard input and at desktop, tablet, and mobile widths. Later labs should reuse these tokens and component conventions rather than create a new visual system.

## 2. Design Tokens

| Token / Element | Value | Required Use |
|---|---|---|
| Primary Green | `#006B3C` | App header, primary actions, strong brand emphasis |
| Secondary Green | `#0B7A46` | Active navigation, links, hover and focus accents |
| Pale Green | `#EAF6EF` | Selected items, success areas, subtle section emphasis |
| Page Background | `#F5F7F6` | Main application background |
| Surface | `#FFFFFF` | Forms, tables, cards, dialogs |
| Primary Text | `#1A2E26` | Headings, labels, body text |
| Muted Text | `#64748B` | Help text, timestamps, secondary metadata |
| Neutral Border | `#CBD5E1` | Editable controls and card/table divisions |
| Read-only Background | `#EEF3F0` | Backend-generated and non-editable values |
| Error | text/border `#B91C1C`, background `#FEF2F2` | Validation and safe operation failures |
| Warning | text `#92400E`, background `#FFFBEB` | Attachment warnings and destructive confirmations |
| Success | text `#065F46`, background `#EAF6EF` | Successful creation/upload/removal confirmation |
| Focus Ring | `#0B7A46` with a visible outer ring | Keyboard focus on interactive controls |

### Priority and Status Badges

Badges include readable text and never communicate meaning by color alone.

| Badge | Text | Background |
|---|---|---|
| Critical Priority | `#991B1B` | `#FEE2E2` |
| High Priority | `#9A3412` | `#FFEDD5` |
| Medium Priority | `#92400E` | `#FEF3C7` |
| Low Priority | `#1E40AF` | `#DBEAFE` |
| New Status | `#065F46` | `#D1FAE5` |
| Unassigned | `#475569` | `#E2E8F0` |
| Removed | `#7F1D1D` | `#FEE2E2` |

`IN_PROGRESS`, `RESOLVED`, and other later lifecycle statuses are not interactive Lab 2 states and are not offered as filters or actions.

## 3. Typography and Spacing

- Font stack: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Base body size: `16px`; body line height: at least `1.5`.
- Page title: `1.75rem`, weight 700.
- Section title: `1.25rem`, weight 700.
- Field label: `0.875rem`, weight 600, placed above the control.
- Help and metadata text: at least `0.8125rem` with sufficient contrast.
- Spacing scale: 4, 8, 12, 16, 24, 32, and 48 pixels.
- Main content width: maximum `1200px`, centered.
- Cards use a subtle border, restrained shadow, `8px` radius, and at least `24px` desktop padding or `16px` mobile padding.

## 4. Shared Component Rules

### Form Controls

- Editable fields use a white background and neutral border.
- Read-only/backend-generated fields use the read-only background, a `Read-only` hint where needed, and cannot receive editable input.
- Inputs and selects have a minimum height of `42px`.
- Description has a minimum height of `120px` and may resize vertically only.
- Required labels include a visible red asterisk and accessible required semantics.
- Invalid controls use an error border and one message immediately below the associated field.
- Help text and error text use stable space where practical to avoid disruptive layout movement.
- Every field has a programmatic label; placeholders are examples, not replacements for labels.

### Buttons

- **Primary:** solid Primary Green; used once per decision area for Continue, Submit Ticket, or Add Attachment.
- **Secondary:** pale/white surface with Primary Green text and border; used for Cancel, Back, Retry, and non-primary actions.
- **Tertiary:** text/link style; used for Clear Filters and low-emphasis actions.
- **Destructive:** dark red with visible `Remove Attachment` text; used only after confirmation.
- **Disabled:** visually distinct, cannot be activated, and does not rely on cursor styling alone.
- **Busy:** disabled, displays a spinner plus descriptive text such as `Submitting ticket...`.
- Buttons have visible text. Icon-only controls require an accessible name and tooltip.
- Touch targets are at least `44px` high and wide where applicable.

### Alerts, Empty States, and Loading

- Field errors appear beside their fields; a summary alert may supplement but not replace them.
- Safe API errors explain what the user can do next and include Retry when meaningful.
- Success and warning messages use text/icons in addition to color.
- Loading indicators include visible text or an accessible status label.
- Empty state means the Requester owns no Tickets.
- No-results state means Tickets exist but current search/filters match none.
- Dynamic status messages use an `aria-live` region without unexpectedly moving keyboard focus.

## 5. Application Shell

- Header displays the TokTickIT name, My Tickets, Create Ticket, current Development Requester name, and Change Requester.
- The active page has a visible indicator in addition to color.
- The Requester area is labeled `Development Requester` so it is not mistaken for authenticated profile information.
- Change Requester opens the selector. If Create Ticket has unsaved changes, a confirmation dialog warns that switching discards those values.
- After a confirmed switch, Requester-specific cached data is cleared and the current route reloads for the new Requester.
- Desktop/tablet navigation is horizontal when space permits. Mobile navigation collapses into a keyboard-operable menu without hiding the current Requester.

## 6. Development Requester Selection

### Initial Selection Screen

Required content:

- TokTickIT title and Zen Green branding.
- Heading `Select Development Requester`.
- Explanation: `Select a Development Requester to test requester-specific ticket behavior. This is not a login screen. Authentication and role-based access will be introduced in Lab 3.`
- Labeled Requester dropdown populated from `GET /api/requesters`.
- Primary Continue button.

### States

| State | Required Presentation and Behavior |
|---|---|
| Loading | Dropdown and Continue disabled; spinner/skeleton with `Loading Requesters...` |
| Ready, none selected | Placeholder `Choose a Requester`; Continue disabled |
| Ready, selected | Name, email, and department visible; Continue enabled |
| Empty | `No active Development Requesters are available.`; Continue disabled |
| Failure | Safe error message and Retry button; Continue disabled |

The first visit uses a full selection screen rather than a dismissible modal because there is no valid destination without a Requester. Change Requester may reuse the selector in an accessible dialog with Cancel available because an existing selection remains valid.

Selection is stored in `sessionStorage`. A stored unknown or inactive ID is discarded and the selection screen is shown again.

## 7. Create Ticket Screen

Route: `/tickets/new`

### Structure

1. Breadcrumb/back link to My Tickets.
2. Page title and short instruction.
3. System information group:
   - Ticket Number: read-only `Generated after submission` before success.
   - Ticket Date: read-only `Set by the server after submission` before success.
   - Requester: read-only selected name and email.
4. Classification group:
   - Category, required, loaded from active Categories.
   - Related System, required, loaded from active Related Systems.
   - Requested Priority, required, default Medium.
5. Problem information group:
   - Summary, required, 5-100 characters, with character count.
   - Description, required, 10-2,000 characters, with character count.
6. Attachment group:
   - File picker/drag-and-drop area.
   - Allowed-type and 5 MiB help text.
   - Selected-file list with original name, type, size, validation state, and Remove Before Submit action.
   - Active/selected count such as `2 of 5 files`.
7. Actions: Submit Ticket and Cancel.

Reference-data loading disables affected controls and displays a loading state. If loading fails, existing typed values remain and Retry is available.

### Create Ticket States

| State | Required Presentation and Behavior |
|---|---|
| Initial | Empty editable fields; priority Medium; generated values use placeholders |
| Validation failure | Messages immediately below invalid fields; focus moves to or is announced for the first error |
| Invalid Attachment | Invalid file remains identified in the selection list or is clearly named in an error; submission is blocked |
| Submitting | Submit disabled; busy text shown; all fields protected from duplicate action |
| Success | Backend Ticket Number and Ticket Date displayed with View Ticket and My Tickets actions |
| Partial Attachment failure | Ticket success remains visible; failed filenames and retry-from-detail instructions shown |
| API failure | Safe form-level error shown; valid text/select values and selected-file information remain |

Cancel returns to My Tickets. If the form is dirty, Cancel requires confirmation.

For an uncertain submission outcome (network loss, server failure, or an invalid
success response), retain and temporarily lock the draft. Explain that the
request may already have succeeded and offer Retry with the same submission key.
Do not silently turn an edited draft into a new submission while resolving that
outcome. A confirmed validation rejection unlocks the fields for correction.

## 8. My Tickets Screen

Route: `/tickets`

### Controls

- Page heading `My Tickets` and a Create Ticket primary action.
- Search labeled `Search by Ticket Number or Summary`.
- Category filter: All Categories plus active Categories.
- Requested Priority filter: All Priorities, Low, Medium, High, Critical.
- Sort selector: Last Updated, Created Date, Requested Priority.
- Sort direction control with visible text or accessible name.
- Page-size selector: 10, 20, or 50.
- Clear Filters tertiary action.

Status changes are outside Lab 2, so the screen displays the `NEW` status but does not offer later workflow statuses as interactive filters.

### Desktop Table

Columns:

1. Ticket Number
2. Summary
3. Category
4. Related System
5. Requested Priority
6. Current Status
7. Last Updated
8. View Details action

Sortable state is announced and visibly indicated. A row is not the only way to open detail; a visible View Details link/button is available.

### Tablet and Mobile Cards

Cards show Ticket Number, Summary, Category, Requested Priority, Current Status, and Last Updated with a full-width View Details action. Secondary metadata may wrap but may not be clipped. Cards replace the wide table early enough to avoid horizontal page scrolling.

### Pagination and States

- Pagination shows Previous, current/nearby page numbers, Next, and `Showing X-Y of Z tickets`.
- Previous/Next are disabled at boundaries.
- Changing search, filters, sort, or page size returns to page 1.
- Loading uses skeleton rows/cards.
- Empty state offers Create Ticket.
- No-results state offers Clear Filters.
- Failure state uses a safe message and Retry while retaining current controls.

## 9. Requester Ticket Detail

Route: `/tickets/:id`

### Ticket Information

- Breadcrumbs and Back to My Tickets.
- Read-only values: Ticket Number, Ticket Date, Requester, Category, Related System, Requested Priority, IT Priority (`Unassigned`), Current Status (`New`), Ticket Owner (`Unassigned`), Summary, Description, Created At, and Last Updated.
- Read-only values use consistent visual treatment and remain selectable for copying where appropriate.
- Public Comments, Internal Notes, Actions Taken, status actions, and IT Staff controls do not appear.

### Detail States

| State | Required Presentation and Behavior |
|---|---|
| Loading | Ticket and Attachment skeletons |
| Success | Complete owned Ticket information and Attachment sections |
| Not found/ownership rejected | Same safe `Ticket not found` state with Back to My Tickets |
| Unexpected failure | Safe error, Retry, and Back to My Tickets |

## 10. Attachment Section

### Active Attachment

Each item displays original filename, type, human-readable size, upload date, Preview (when supported), Download, and Remove Attachment. Long filenames wrap or truncate visually with the full name available accessibly; they never create horizontal page overflow.

### Add Attachment

- File input supports JPG/JPEG, PNG, WEBP, and PDF.
- Help text states 5 MiB per file and five active files per Ticket.
- Add controls are disabled when the active count reaches five.
- Uploading displays per-file busy state and blocks duplicate upload.
- Success announces the added filename and updates the active count.
- Invalid/upload failure identifies the affected filename and retains the rest of the Ticket Detail view.

### Soft Removal

- Remove opens a confirmation dialog naming the file.
- Removal Reason is required, 5-200 characters, with field-level validation.
- Destructive action is labeled `Remove Attachment`; Cancel closes without changes.
- Focus enters the dialog, remains trapped while open, and returns to the invoking control after close.
- Busy state blocks duplicate removal.

### Removed Attachment

Removed items are displayed in a separate `Removed Attachments` subsection with Removed badge, original name, type, size, upload date, removal date, and reason. Preview, Download, and Remove controls are absent or disabled with explanatory text.

## 11. Responsive Rules

| Viewport | Width | Required Behavior |
|---|---|---|
| Desktop | `>= 992px` | Centered max-width layout; multi-column forms; full Ticket table; two/three-column read-only grids |
| Tablet | `768-991px` | Two-column forms where practical; Ticket cards or reduced non-overflow layout; wrapped filter controls |
| Mobile | `< 768px` | Single-column fields and cards; full-width primary actions; collapsible navigation/filters; touch-friendly controls |

At every viewport:

- No horizontal page scrolling.
- No clipped labels, errors, filenames, pagination controls, or buttons.
- Messages do not overlap controls.
- Summary and Description retain usable width.
- Header and current Requester remain understandable.
- Dialogs fit inside the viewport and their actions remain reachable.

## 12. Accessibility Rules

- One descriptive page heading per screen and logical heading levels.
- Every input has a visible label and associated help/error text.
- Required, invalid, expanded, busy, disabled, selected, and sort states are exposed semantically.
- Keyboard focus order follows the visual reading order.
- Focus indicators remain visible and meet contrast expectations.
- Dialogs use correct labeling and focus management.
- Dynamic loading, error, success, and upload/removal results use polite/assertive live regions as appropriate.
- Badges and validation use text/icons in addition to color.
- Icon-only controls have accessible names and tooltips.
- Images used as decoration have empty alternative text; meaningful illustrations have concise alternatives.

## 13. Automated UI Assertions

Component/style tests verify:

- Required labels, asterisks, helper/error associations, and read-only styling.
- Zen Green token classes/custom properties on the shell and primary components.
- Submit, upload, and removal busy/disabled behavior.
- Active navigation and Requester identity display.
- Empty versus no-results messages.
- Priority, New Status, Removed, and Unassigned badge text.
- Accessible names for navigation, filter, pagination, Attachment, and dialog controls.
- No later-lab comments, status controls, or IT Staff actions are rendered.

## 14. Visual Evidence Checklist

Required screenshot roots:

- `artifacts/lab-02/screenshots/requester-selector/`
- `artifacts/lab-02/screenshots/create-ticket/`
- `artifacts/lab-02/screenshots/my-tickets/`
- `artifacts/lab-02/screenshots/ticket-detail/`

Capture and inspect:

- Requester selector: loading, ready, empty, and API failure.
- Create Ticket: initial, validation failure, invalid Attachment, submitting, success, and API failure with retained values.
- My Tickets: Requester A list, Requester B list, search/filter/sort/pagination, empty, no-results, and failure.
- Ticket Detail: owned detail, active upload/download, removal confirmation, removed metadata, blocked removed download, and not-found/ownership state.
- Desktop, tablet, and mobile versions of Create Ticket, My Tickets, and Ticket Detail.

For every screenshot set, confirm:

- Colors and surfaces match the approved tokens.
- Editable and read-only fields are distinguishable.
- Validation appears beside the correct field.
- Button hierarchy and busy/disabled states are clear.
- No clipping, overlap, hidden action, unreadable filename, or horizontal page overflow is present.
- Focus and non-color state indicators are visible in at least one accessibility evidence capture.
