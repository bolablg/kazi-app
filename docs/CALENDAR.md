# Kazi agenda and calendar subscriptions

Kazi's agenda combines deadlines and approved focus sessions. You can review and approve plans without connecting an outside calendar. Calendar, Insights, and the subscription feed use the same scheduling records, while plan history preserves previous accepted versions.

## Plan directly in Calendar

Calendar opens in Day view on a phone and Workweek on a larger screen. Day, 3 days, Workweek, Week, Month and Schedule share one view selector. Your view and color preference are remembered for this account and team on this device; the URL preserves the selected date and filters. Date navigation includes Today and a date picker.

Use the Tasks tray to find ready work by title, priority or tag. It shows the estimated time left to place after future confirmed reservations; partially scheduled work remains available. Backlog ideas are optional and must be explicitly promoted in Tasks before scheduling. Reserving time does not change a task's deadline or workflow stage.

Select an empty time slot or use a task's Reserve time action. Desktop users can drag a task onto the calendar, move a reservation, or resize it; the reservation form confirms the exact time before saving. Tap and keyboard controls provide the same actions. Select a task title to open its full task page.

Only the worker can reserve or change time on their own calendar. Teammate overlays are read-only. Working days/hours, session bounds, transition buffers, daily focus limits, deadlines, prerequisites, and known reservations across your teams are rechecked when saving. Connected availability must be fresh and cover the requested dates. Without an outside source, capacity only accounts for Kazi reservations and your saved working preferences.

Current-calendar changes are revision checked. Undo restores the affected reservations atomically and stops if any changed concurrently. Accepted plan snapshots remain immutable; edits to their native Kazi sessions are recorded as current-calendar overlays with activity history.

## Repeats and reminders

A reservation can repeat on working days or weekly, for an explicit total of 2–26 occurrences within the next six months. Repeats use your saved IANA time zone, preserving local clock time across daylight-saving changes. You can edit or cancel one occurrence, this and following occurrences, or the series. Undo preserves individually adjusted occurrences.

Optional reminders appear in Kazi Notifications. They are in-app reminders, not browser push or email delivery. Moving or cancelling a reservation invalidates its old reminder; delivery checks its current revision, assignment and access.

## Views and daily details

The compact capacity strip summarizes the selected day's known available and reserved time. Details explain focus limits, buffers and availability freshness. Color by Project, Tag or Priority changes visual grouping without changing task data. Private outside events remain labelled Busy without event text.

Select a date or the +N indicator to expand its daily agenda. Month cells keep a bounded list, and short timed sessions keep a readable title. Include proposals is available in Calendar options; proposed sessions remain unconfirmed until approved through Plans. Calendar options also contain person/project filtering and view preferences.

Timed views show your saved working hours with one hour before and after. Visible bookings outside that window expand it so they remain accessible. Scrollable panes support wheel, touch and keyboard navigation with hidden scrollbar tracks. Move reservations using the hand cursor; drag their upper or lower edge to adjust the start or end, then confirm the exact change.

## Calendar Insights

Insights → Calendar shows current confirmed allocation within the selected dates: minutes by project/tag, ready-task scheduling coverage, short reservations and recorded calendar changes. Overlapping reservations are not counted as extra effort, and multi-tag allocation is shared among the task's tags. These metrics describe a plan, not hours worked or individual productivity. Workflow stage durations and completion outcomes remain separate.

## Subscribe from another app

Open **Calendar → Subscribe & export → Create calendar link**. Choose all your projects or one project, and whether to include deadline reminders. The sidebar’s Teams filter determines whether the link follows one team or all your current memberships. Copy the private URL into your calendar app's subscription controls:

- Google Calendar: Other calendars → From URL.
- Outlook: Add calendar → Subscribe from web.
- Apple Calendar: File → New Calendar Subscription.

An ICS download is a snapshot. A subscription periodically fetches changes. The feed includes your assigned tasks and sessions within your current team and project access. Removing a membership also removes that team's work from the feed.

Treat a subscription link as a credential. Kazi shows it once, supports up to five active links per person/team, and expires each link after one year. You can revoke links on the same Calendar subscriptions page. Access is checked on every fetch, but copies already downloaded by another calendar may remain there.

## What appears as busy

Confirmed focus sessions appear as busy. Optional task deadlines are all-day reminders, so they do not reserve an entire day. Unapproved proposals are excluded. Released sessions publish cancellation records using the same event identifiers.

Calendar providers control refresh timing. Changes may take hours to appear, so a subscription cannot guarantee immediate booking protection. If you use an appointment booking page, select the Kazi calendar in that provider's availability settings and check how it handles subscribed calendars.

Subscriptions publish Kazi's agenda outward. Editing an event in another calendar does not update Kazi, and the subscription does not tell Kazi about your other meetings. Edit tasks and plans in Kazi or through MCP.

## Outside availability

Open **Account → Connections → Calendar availability** for optional outside availability. Where Google availability is enabled, **Connect Google availability** starts Google's consent flow. Choose the calendars Kazi should use when checking for outside busy times. This connection reads availability rather than event titles and attendees. It does not grant permission to write to Google Calendar.

Kazi checks availability freshness before proposing or approving plans and before saving direct reservations. If a selected calendar cannot be read, repair the connection or remove that source. Without an outside source, Kazi plans using its own reservations and your saved working hours, and cannot account for meetings elsewhere.

Choosing Kazi as the publishing destination preserves connected read-only availability sources. Disconnecting Google explicitly removes its connection credentials and availability selection. Your Kazi agenda remains available. Optional free/busy sharing exposes busy intervals to team planners while preserving your own plan approval controls.

See [planning and permissions](PRODUCT.md) and [MCP calendar tools](MCP.md).
