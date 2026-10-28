# Calendar integration setup

Calendar subscriptions and optional Google availability use separate credentials.
Creating an ICS subscription does not require Google OAuth.

## Public calendar addresses

Set `APP_ORIGIN` on the matching Convex backend to the frontend origin. Production
uses `https://kazi.iyanju.com`; preview builds set it to their stable branch URL.
Subscriptions are published at `APP_ORIGIN/agenda/<private-token>.ics`. The Vercel
routes proxy feeds and `/google/callback` to the exact backend selected during the
build, with caching disabled. The service worker excludes both routes from its SPA
fallback. Existing Convex subscription URLs continue to work; the same private path
also works on the frontend domain once the routes have been deployed.

Local development uses the loopback Convex HTTP origin for these routes. Keep
`CONVEX_SITE_URL` managed by Convex.

## Optional Google availability

1. In the Google Cloud `iyanju` project, enable the Google Calendar API. Use a web
   OAuth client and configure its consent screen for the intended audience.
2. Register the exact production redirect URI:
   `https://kazi.iyanju.com/google/callback`. Preview clients must register the
   matching preview callback and use their own backend configuration.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the matching Convex backend,
   never in frontend `VITE_` variables or source control. Set
   `TOKEN_ENCRYPTION_KEY` to a base64-encoded 32-byte random key if it is absent.
   Preserve an existing encryption key; replacing it makes stored refresh tokens
   unreadable.
4. Kazi requests only `calendar.calendarlist.readonly` and
   `calendar.events.freebusy`. Configure the matching Google consent scopes and
   complete any required Google verification before opening access to users.
5. From Connections → Calendar availability, connect Google, complete consent,
   choose availability calendars, and refresh. Confirm that outside busy times
   affect planning. Cancelled or failed consent returns to this same settings tab
   with an explanation.

Clerk sign-in does not automatically supply these backend credentials. An existing
custom Google web client can be reused by adding Kazi's callback while retaining
its Clerk callback. A separate Calendar client in the same project keeps calendar
consent and sign-in configuration independent. Google sign-in alone does not grant
Calendar access: users must explicitly consent to the availability scopes.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), and
[Clerk social connections](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/overview).
