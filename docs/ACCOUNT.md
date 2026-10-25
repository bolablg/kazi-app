# Accounts and teams

Open your avatar menu to find **My account**, **Settings**, **Connections**, and **Team & people**. My account embeds Clerk’s profile and security interface directly in Settings. Manage your profile, email addresses, passwords, and sessions there according to your enabled sign-in methods; no separate profile-launch dialog is required. **Sign out** is in the same menu. Local development and the synthetic demo show their sample identity instead of live account controls.

Sign in with your own account. Kazi creates your personal space and Personal planning project. There is no shared administrator login or default password. A team creator becomes that team's manager, with the owner role. Team owners and admins manage invitations, project access, and member removal.

## Settings and connections

| Screen                              | Contents                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Settings → My account               | Clerk profile, email addresses, security, and sessions                         |
| Settings → Planning                 | Plan approval, working days and hours, capacity, quiet hours, aging thresholds |
| Settings → General                  | Team details and access management                                             |
| Settings → Data & app               | Export and installation information                                            |
| Connections → Overview              | Calendar and MCP connection status                                             |
| Calendar → Subscribe & export       | Private Kazi subscriptions, link management, and ICS export                    |
| Connections → Calendar availability | Optional Google free/busy sources                                              |
| Connections → MCP & agents          | Server endpoint, credential scopes, expiry, revocation, and last use           |
| Connections → Activity              | Recent authenticated MCP tool outcomes                                         |

Connections belong to the signed-in person. Administrators cannot retrieve teammates' MCP secrets or private calendar connections. An MCP client's reported name comes from its handshake. Last seen records authenticated use, rather than live presence.

## Work across teams

You can belong to several teams. Use the sidebar's **Teams** filter to choose All teams or one team across tasks, projects, Calendar, and Insights. Permissions apply separately in each team. A role in one team does not grant access to another team's projects or anyone's personal work.

Under **Account → Team & people**, choose **Create team**, then use **People & access** to manage invitations and project access. Your existing personal work can also be shared through **Enable collaboration**.

Removing a member removes their access and drops that team's events from their calendar subscriptions. Planning checks a person's existing Kazi reservations across teams to avoid overlaps without exposing private task details to another team.

## Invite people

Select the team, enter an email address, and choose the person's role and project access. Invitations provide an expiring signup or sign-in link. Acceptance requires the intended verified email address and a valid invitation; creating or sending an invitation does not itself grant membership.

When email delivery is configured, invitations show queued, sent, or failed status. Otherwise, they show **Link only**, and you can share the invitation link yourself. Signing in preserves the invitation so the recipient can complete acceptance.

## Teams in the sidebar

Teams is the single global team filter. Choose All teams or an individual membership; up to five shortcuts appear, including the current selection. More teams opens the complete team directory. Open work focuses Overview on that team, while People & access opens its membership controls. The top bar shows the current scope without a second selector. Both sidebar sections collapse, and the account menu stays accessible when the sidebar scrolls.

## Favorites

Star projects in the project list or project details. The collapsible **Favorites** section shows up to five active starred projects. When you have more, **More projects** opens the complete Projects page. Favorites are personal and do not change ownership or permissions. Losing access to a project hides its favorite entry. **Projects** opens the complete project list.

See [permissions](PRODUCT.md), [calendar subscriptions](CALENDAR.md), and [MCP connections](MCP.md).
