# Kazi agenda and calendar subscriptions

Kazi owns the agenda. New accounts can propose and approve plans without a Google account. Approval reserves focus sessions transactionally in Convex with status `scheduled`; it creates no external calendar-write intent. The app calendar, reports, and subscription feed read the same current scheduling receipts. Plan versions preserve the original accepted snapshots.

## Subscribe from another app

Connections → Calendar → Create calendar link returns a private URL once. Choose all your projects or one project and whether to include deadline reminders. The global team filter determines whether the link follows one team or all current memberships. Copy the URL into:

- Google Calendar: Other calendars → From URL.
- Outlook: Add calendar → Subscribe from web.
- Apple Calendar: File → New Calendar Subscription.

A download is an ICS snapshot. A subscription periodically fetches changes. Only your assigned tasks and sessions visible under your current membership/project access are published. A secret link authorizes calendar reading, so protect it as a credential. Storage retains only its SHA-256 hash. Up to five active links per person/team are supported; each expires after one year. Links can be revoked, and permission is rechecked on every fetch. Revoked, expired, or inaccessible links return 404. Previously fetched copies may remain at the provider.

The backend must be reachable over public HTTPS for Google/Outlook to subscribe. The local development endpoint is `http://127.0.0.1:3211/agenda/<secret>.ics`; it is useful for local clients and verification, but remote providers cannot reach your localhost. No public deployment or calendar-provider subscription has been performed here.

## Booking availability and refresh limits

Confirmed sessions publish as `TRANSP:OPAQUE` (busy). Optional task deadlines are transparent all-day reminders, not full-day reservations. Pending proposals and failed/unconfirmed writes are excluded. Releases keep their stable UID and publish a canceled tombstone. Text is escaped, UTF-8 content lines fold at 75 octets, and files use CRLF in accordance with [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

[Google documents](https://support.google.com/calendar/answer/16287054) that appointment schedules can check primary and owned/managed/subscribed calendars on eligible plans. Select the Kazi subscription in the schedule’s availability settings and verify that its busy sessions block bookings. Provider-controlled refresh is a material limitation: [Microsoft states](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web) that subscription updates can take more than 24 hours. Kazi’s hourly refresh hint is advisory. This design simplifies publishing but cannot promise immediate prevention of double bookings.

A subscription is outbound. It does not tell Kazi about meetings in your other calendars, and editing a subscribed copy does not update Kazi. Edit tasks and plans in Kazi or through MCP.

## Optional outside availability

Connect Google availability only when you want Kazi to read outside busy times before planning. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_ORIGIN`, `CONVEX_SITE_URL`, and a base64 32-byte `TOKEN_ENCRYPTION_KEY` on Convex. Register the exact backend `/google/callback` URL with the OAuth web client.

Connections → Calendar → Connect Google availability starts provider consent. Select up to 20 calendars; no writable destination is required. New consent requests `calendar.calendarlist.readonly` and `calendar.events.freebusy`, without event-write scope. Refresh tokens are AES-GCM encrypted, OAuth state is single-use and expires in ten minutes, and event titles/attendees are never read into availability storage. Optional sharing exposes only free/busy intervals to team planners and does not waive their own approval authority.

Freshness is checked before proposing and approving. A selected provider calendar that fails does not become free time. Repair consent or remove that source deliberately. Without a source, Kazi uses its own reservations and saved working hours, and cannot know about outside meetings. Disconnecting Google removes its credentials and availability selection; Kazi agenda stays active.

Existing users with an older Google publishing destination retain it until choosing Kazi agenda or saving the new availability selection. Old confirmed Google events remain in Google. Their deterministic outbox, reconciliation, and verified release code are retained for historical safety, not offered as the new publishing model. Switching does not silently delete or migrate provider events; review old copies to avoid displaying duplicate busy blocks after subscribing.

Implementation references: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [free/busy API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [MCP action parity](MCP.md).

All-team subscriptions resolve current memberships on each fetch. Removing a team membership drops that team’s work from the feed without revealing its private task or busy details. Reservation checks across teams protect the same person from accepting overlapping Kazi plans.
