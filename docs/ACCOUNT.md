# Accounts and administration

The sidebar shows the current user's avatar and name. **My account**, **Settings**, **Connections**, and **Team & people** appear together in that account menu, without duplicate sidebar entries. Open **My account** to see the email, username (when configured), role, and authentication status. In connected mode, **Manage profile & password** opens Clerk's account controls; **Sign out** is in the user menu.

Kazi uses Clerk for authentication and Convex for authorization. The owner of a newly created personal or team workspace has administrator access in that workspace. Team owners/admins manage invitations, project access, and member removal under **Team & people**. Roles belong to a workspace; they do not grant access to another person's personal workspace or calendar.

## Username and password sign-in

1. Configure a Clerk application. In **User & authentication**, enable the desired username identifier and password authentication. The hosted `<SignIn>` component follows that configuration, including verification and password recovery. See [Clerk's sign-up/sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).
2. Configure the Clerk JWT integration for Convex and its expected issuer/audience, as described in [Deployment](DEPLOYMENT.md).
3. Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` in the app environment, then restart/rebuild. Backend secret values belong in Convex environment settings.
4. Sign in with your own account. Kazi creates a personal team and Personal planning project for that immutable identity. Enable collaboration under Team & people when you want to invite others into the same application.

There is no shared `admin` account or default password. Local demo mode is a clearly labeled sample account with no live sign-in. **Settings → My account** displays setup instructions instead of a simulated login. User profile and sign-out actions use [Clerk's React hooks](https://clerk.com/docs/react/reference/hooks/use-clerk).

[Local Convex development](LOCAL_DEVELOPMENT.md) uses a separate, loopback-only development identity and signed session token. It exercises normal backend membership checks with a persistent local database. This development configuration is excluded from production builds.

## Where configuration lives

| Screen                     | Contents                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Settings → My account      | Profile, role, authentication status, password/account management                    |
| Settings → Planning        | Approval requirement, working days/hours, capacity, quiet hours                      |
| Settings → General         | Workspace details and link to people/access management                               |
| Settings → Data & app      | Export, installation notes, local demo reset                                         |
| Connections → Overview     | Calendar and MCP configuration status, clients seen                                  |
| Connections → Calendar     | Kazi agenda, private subscriptions/download, optional Google free/busy               |
| Connections → MCP & agents | Server endpoint, scoped credentials, expiry/revocation, client identity and last use |
| Connections → Activity     | Recent authenticated MCP tool outcomes                                               |

The Connections screens belong to the signed-in person. Administrators cannot retrieve teammates' MCP secrets or private calendar connections. A client name is supplied by the MCP protocol handshake and is labeled as reported by the client. Last seen indicates authenticated use; it is not a live-presence indicator.

Project favorites are also personal. Star controls in Projects or project details save the current person's favorite project IDs. Other members' favorites are omitted from their visible profiles. Losing project access hides its favorite entry; archived projects are excluded from the sidebar. Favorites do not change project ownership, team membership, scheduling preferences, or accepted plan history. The Favorites heading expands/collapses the sidebar list; Projects remains the entry to the complete project list.

## Teams in one interface

One person can belong to several teams. The header's **Team** filter chooses All teams or one membership across tasks, projects, calendar, and reports. The application keeps the same navigation. Every resource retains its team ID, and roles are checked in that team rather than borrowed from another membership. Reports can combine authorized teams or focus on one. New project/personal plan forms ask for a team when several are visible.

Under Account → Team & people, **Create team** makes the creator its manager (owner role). Select People & access to manage that team's invitations and project access. Existing personal work can also be shared by its owner with Enable collaboration. Removing membership immediately removes access and removes that team's events from all-team calendar feeds. Planning also checks the person's existing reservations in other teams to avoid double-booking, without exposing their task details to the other team.

## Optional invitation email

Set backend variables through the Convex dashboard or CLI:

- `INVITATION_SIGNING_KEY`: at least 32 cryptographically random characters.
- `APP_ORIGIN`: the frontend's origin; invitation links open `/join?token=<token>`.
- `RESEND_API_KEY`: optional Resend sending credential.
- `INVITE_EMAIL_FROM`: optional verified sender, for example `Kazi <invites@your-domain.example>`.

Without the optional email pair, invitations remain usable as expiring shareable signup/sign-in links and show **Link only**. Configured delivery shows queued, sent, or failed with a bounded error message. Recipient sign-in preserves the invitation URL. Acceptance requires the intended verified email and current invitation validity; sending an email does not grant membership.

The durable invitation outbox pins its sender, team name, recipient, and origin so retries use the same content. A stable provider idempotency key prevents duplicate delivery. Claims recheck invitation validity and the inviter's current manager role. Retries stop after three attempts or 23 hours, within Resend's documented 24-hour idempotency window. Real email delivery still requires a verified sender and an actual configured provider check. See [Resend idempotency documentation](https://resend.com/changelog/idempotency-keys).
