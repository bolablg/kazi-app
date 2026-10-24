# Accounts and teams

Open your avatar menu to find **My account**, **Settings**, **Connections**, and **Team & people**. My account shows your profile, email, role, and authentication status. **Manage profile & password** opens your account controls; **Sign out** is in the same menu.

Sign in with your own account. Kazi creates your personal space and Personal planning project. There is no shared administrator login or default password. A team creator becomes that team's manager, with the owner role. Team owners and admins manage invitations, project access, and member removal.

## Settings and connections

| Screen                     | Contents                                                                       |
| -------------------------- | ------------------------------------------------------------------------------ |
| Settings → My account      | Profile, role, authentication status, account management                       |
| Settings → Planning        | Plan approval, working days and hours, capacity, quiet hours, aging thresholds |
| Settings → General         | Team details and access management                                             |
| Settings → Data & app      | Export and installation information                                            |
| Connections → Overview     | Calendar and MCP connection status                                             |
| Connections → Calendar     | Kazi agenda, private subscriptions, and optional outside availability          |
| Connections → MCP & agents | Server endpoint, credential scopes, expiry, revocation, and last use           |
| Connections → Activity     | Recent authenticated MCP tool outcomes                                         |

Connections belong to the signed-in person. Administrators cannot retrieve teammates' MCP secrets or private calendar connections. An MCP client's reported name comes from its handshake. Last seen records authenticated use, rather than live presence.

## Work across teams

You can belong to several teams. Use the header's **Team** filter to choose All teams or one team across tasks, projects, calendar, and reports. Permissions apply separately in each team. A role in one team does not grant access to another team's projects or anyone's personal work.

Under **Account → Team & people**, choose **Create team**, then use **People & access** to manage invitations and project access. Your existing personal work can also be shared through **Enable collaboration**.

Removing a member removes their access and drops that team's events from their calendar subscriptions. Planning checks a person's existing Kazi reservations across teams to avoid overlaps without exposing private task details to another team.

## Invite people

Select the team, enter an email address, and choose the person's role and project access. Invitations provide an expiring signup or sign-in link. Acceptance requires the intended verified email address and a valid invitation; creating or sending an invitation does not itself grant membership.

When email delivery is configured, invitations show queued, sent, or failed status. Otherwise, they show **Link only**, and you can share the invitation link yourself. Signing in preserves the invitation so the recipient can complete acceptance.

## Favorites

Star projects in the project list or project details. The collapsible **Favorites** section shows your active starred projects. Favorites are personal and do not change ownership or permissions. Losing access to a project hides its favorite entry. **Projects** opens the complete project list.

See [permissions](PRODUCT.md), [calendar subscriptions](CALENDAR.md), and [MCP connections](MCP.md).
