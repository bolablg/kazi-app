# Kazi agenda and calendar subscriptions

Kazi's agenda combines deadlines and approved focus sessions. You can review and approve plans without connecting an outside calendar. The calendar, reports, and subscription feed use the same scheduling records, while plan history preserves previous accepted versions.

## Subscribe from another app

Open **Account → Connections → Calendar → Create calendar link**. Choose all your projects or one project, and whether to include deadline reminders. The team filter determines whether the link follows one team or all your current memberships. Copy the private URL into your calendar app's subscription controls:

- Google Calendar: Other calendars → From URL.
- Outlook: Add calendar → Subscribe from web.
- Apple Calendar: File → New Calendar Subscription.

An ICS download is a snapshot. A subscription periodically fetches changes. The feed includes your assigned tasks and sessions within your current team and project access. Removing a membership also removes that team's work from the feed.

Treat a subscription link as a credential. Kazi shows it once, supports up to five active links per person/team, and expires each link after one year. You can revoke links in Connections. Access is checked on every fetch, but copies already downloaded by another calendar may remain there.

## What appears as busy

Confirmed focus sessions appear as busy. Optional task deadlines are all-day reminders, so they do not reserve an entire day. Unapproved proposals are excluded. Released sessions publish cancellation records using the same event identifiers.

Calendar providers control refresh timing. Changes may take hours to appear, so a subscription cannot guarantee immediate booking protection. If you use an appointment booking page, select the Kazi calendar in that provider's availability settings and check how it handles subscribed calendars.

Subscriptions publish Kazi's agenda outward. Editing an event in another calendar does not update Kazi, and the subscription does not tell Kazi about your other meetings. Edit tasks and plans in Kazi or through MCP.

## Outside availability

Where Google availability is enabled, **Connect Google availability** starts Google's consent flow. Choose the calendars Kazi should use when checking for outside busy times. This connection reads availability rather than event titles and attendees. It does not grant permission to write to Google Calendar.

Kazi checks availability freshness before proposing and approving plans. If a selected calendar cannot be read, repair the connection or remove that source. Without an outside source, Kazi plans using its own reservations and your saved working hours, and cannot account for meetings elsewhere.

Disconnecting Google removes its connection credentials and availability selection. Your Kazi agenda remains available. Optional free/busy sharing exposes busy intervals to team planners while preserving your own plan approval controls.

See [planning and permissions](PRODUCT.md) and [MCP calendar tools](MCP.md).
