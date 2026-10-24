# Application design and responsive behavior

The latest user direction takes precedence over the earlier Height-only presentation: use clear black typography, visible black structural dividers, full-width content, one environment with multiple projects, and a useful schedule overview. The task-oriented navigation and view tabs are informed by the supplied Height screenshot and [Asana's project views](https://asana.com/features/project-management/project-views). No Asana assets or source code are copied.

## Views

- **Overview / Calendar:** Month, Week, and Day controls switch between a monthly grid and weekly/daily time calendars. All views combine due dates, confirmed work sessions, private calendar busy intervals, and optional proposals. Selecting a date opens its detailed schedule below the calendar. Previous/next buttons move by the selected range; Today restores the current date. Switching ranges retains the selected date and filters, and the range is preserved in the URL. Week/day views keep deadlines in a separate due row and pack overlapping timed blocks into distinct lanes. On phones, cells show date/count controls; details remain readable in the selected-day list.
- **Overview / Schedule:** Events grouped by date, including their time, project, and explicit type. This is the default on phones to put readable work details first.
- **Tasks:** One collection with List, Board, and Archive tabs and shared project, person, stage, priority, label, deadline, and sort filters. Personal planning holds work outside a named project. List shows every active stage even when empty, plus a collapsed Archive; Board excludes archived work.
- **Plans:** Proposals and History are URL-backed tabs. One proposal builder is available from Plans, Overview, and project details. Proposals handles review; History preserves accepted versions and comparison. The separate My week calendar is removed. Open calendar links to Overview’s Week range.
- **Favorites:** Projects remains the primary entry to all projects. A separate collapsible Favorites section contains only the current person’s starred, accessible, active projects. Star buttons in the project list and details update that person’s membership preference without changing projects, work, or plan history. The heading expands/collapses; it does not navigate to the project list.
- **Task labels:** Comma-separated work categories such as Research, Design, and Admin use consistent, case-insensitive colors and black text. Names remain editable, duplicate spellings are merged, and compact lists limit visible tags with an overflow count. Labels appear in lists, boards, edit forms, and calendar agendas. Task management can filter by label. Calendar project colors remain, but the unbounded project-color legend is removed in favor of the project filter.

Due dates do not reserve time. Optional proposals do not count as scheduled work. Occupied-time totals merge overlapping intervals. Cross-midnight events are split using local day boundaries, including daylight saving transitions. Private busy labels show no event titles or details. An active proposal receipt takes precedence over its immutable accepted snapshot, preventing released reservations from reappearing through history.

The separate Assigned to me sidebar item and page are removed. Old `/my-tasks` links redirect to the assigned Tasks filter, `/inbox` to Personal planning, and `/week` to `/plans`, preserving the project filter.

## Layout

- Content panels fill the available main area, including Settings, Connections, plans, and project lists. No fixed 960-pixel form limit remains.
- The sidebar remains visible at 1024 pixels and above. Phones and portrait tablets use a collapsible sidebar with the same profile, settings, and connection controls.
- The shell uses dynamic viewport height and safe-area-aware bottom spacing. Scrolling occurs inside the main panel.
- Phone forms use at least 16-pixel input text to avoid automatic iOS zoom. Monthly calendar and day grid fit their containers without horizontal document scrolling.
- Semantic event labels and text accompany color. Body text and controls use black; white appears on dark active controls and avatars. Overdue dates use a dark red exception.

The browser suite checks 360, 390, 768, 1024, 1440, and 1920-pixel widths across Overview, tabbed Tasks and Plans, Settings, Connections, Plans, and Projects. Screenshots supplement assertions for document width, available panel width, heading contrast, mobile day navigation, and actual view changes. Production service-worker tests verify offline shell reload and static-only caches. Actual iOS/Android installed-device validation remains a separate release gate.

## Resource navigation and board interaction

Project names are display labels; canonical project/task links use opaque IDs and typed path segments. Clicking a task opens a URL-backed full task page. The title and description precede compact field rows, dependency nodes, and collaborators. Close/Escape returns to Tasks; browser Back follows history. Back/Forward and refresh preserve useful task navigation. Project List/Board selection is retained in its view query parameter. Board cards open on click and move across statuses on drag; a dedicated touch/keyboard handle retains normal mobile scrolling. Keyboard controls are Space to lift/drop, Left/Right to choose status, and Escape to cancel. Drop targets are highlighted. Offline or unauthorized moves are disabled; saved changes use the same command validation as other task updates.

Team & people, Connections, and Settings live under the account menu and are not duplicated as separate sidebar items. Shared icon/text controls use flex alignment with centered cross-axis placement, including account links, card metadata, buttons, and breadcrumbs. Reports uses black text and dividers, project colors for allocation, and directly labeled measures; it does not require worked-minute logging.

## Workflow consolidation and agenda

Overview now has Calendar and Schedule only. Tasks has List, Board, and Archive tabs and a single shared filter bar; Personal planning is the default project. Five workflow columns—Backlog, To do, In progress, To validate, Completed—scroll horizontally within the content region. Each column has a bounded independently scrolling card area, keeping its heading visible. Cards show worker avatars instead of full names. Cards open on click and support pointer/touch/keyboard dragging. Status editing is in the full task view, with no Move to dropdown on cards. Blocked, rejected, and discontinued tasks share Archive. List keeps it collapsed; a separate Archive tab opens it. Projects expose a separate delivery status and a date-based Timeline tab. The native Kazi agenda and optional external availability appear in Account → Connections → Calendar. Subscription links are shown once with revoke controls; local-only and provider refresh limitations are explicit.

The global team filter selects All teams or one membership without changing the application's navigation. Task/project writes retain their originating team and role. Project creation and personal planning ask for the team when several are visible. The task page distinguishes owner/reviewer from worker, displays status-colored dependency nodes, and uses removable collaborator chips.

Development uses Vite live updates plus a debounced reload after source changes. The development entry removes stale service workers; production retains its deliberate update prompt.

The full-page task layout is informed by Asana’s official full-screen task reference. A compact toolbar holds All tasks, project context, copy link, and close. Title and description lead; metadata uses flat label/value rows rather than boxed cards. Less frequent planning options collapse. Thin native scrollbars replace heavy tracks on the main area and board; task details use a single main scrollbar.
