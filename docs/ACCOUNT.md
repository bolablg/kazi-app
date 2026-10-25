# Accounts and teams

Open your avatar menu to find **My account**, **Settings**, **Connections**, and **Team & people**. My account embeds Clerk’s profile and security interface directly in Settings. Manage your profile, email addresses, passwords, and sessions there according to your enabled sign-in methods. **Sign out** is in the same menu. The isolated synthetic demo shows a sample identity instead of live account controls.

Sign in with your own account. Kazi creates your personal space and Personal planning project. There is no shared administrator login or default password. Creating a team makes you its **Owner**. Owners can invite **Managers** and **Members**, change existing member roles, and remove teammates. Managers can manage team projects and invite members. Guests receive access to specific projects. Only an owner can grant the Manager role, and the owner's role cannot be changed here.

## Settings and connections

| Screen                              | Contents                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Settings → My account               | Clerk profile, email addresses, security, and sessions                         |
| Settings → Planning                 | Plan approval, working days and hours, capacity, quiet hours, aging thresholds |
| Settings → Export my data           | Download the application data you can access                                   |
| Connections → Overview              | Calendar and MCP connection status                                             |
| Calendar → Subscribe & export       | Private Kazi subscriptions, link management, and ICS export                    |
| Connections → Calendar availability | Optional Google free/busy sources                                              |
| Connections → MCP & agents          | Server endpoint, credential scopes, expiry, revocation, and last use           |
| Connections → Activity              | Recent authenticated MCP tool outcomes                                         |

Connections belong to the signed-in person. Administrators cannot retrieve teammates' MCP secrets or private calendar connections. An MCP client's reported name comes from its handshake. Last seen records authenticated use, rather than live presence.

## Work across teams

You can belong to several teams. Open a team from Favorites or choose **Open work** in **Team & people** to focus tasks, projects, Calendar, and Insights on that team. The top bar shows the current team; clear its filter or choose **View all work** in Team & people to return to all teams. Permissions apply separately in each team. A role in one team does not grant access to another team's projects or anyone's personal work.

Under **Account → Team & people**, choose **Create team**, then use **People & access** to invite teammates and manage their roles. Private projects keep their own access rules. Role changes are timestamped in activity and take effect across the interface and MCP.

Removing a member removes their access and drops that team's events from their calendar subscriptions. Planning checks a person's existing Kazi reservations across teams to avoid overlaps without exposing private task details to another team.

## Invite people

Select the team, enter an email address, and choose the person's role and project access. Invitations provide an expiring signup or sign-in link. Acceptance requires the intended verified email address and a valid invitation; creating or sending an invitation does not itself grant membership.

When email delivery is configured, invitations show their delivery status. You can also copy and share the private invitation link. Signing in preserves the invitation so the recipient can complete acceptance.

## Favorites

Star projects in the project list or project details, and star teams in **Account → Team & people**. The collapsible **Favorites** section combines both kinds, with a **Project** or **Team** tag after each name. It shows five shortcuts in total, with the most recently added first. **More favorites** opens the complete mixed list, where either kind can be removed. Personal work remains available in Tasks and its Personal planning project.

Opening a team favorite focuses Overview on that team. A project favorite opens that project, switching the team filter when needed. Favorites stay available across team filters, are private to you, and do not change ownership or permissions. Losing access to a project hides its favorite entry. **Projects** still opens the complete project list; **Team & people** remains the complete team directory. The account menu stays accessible when the sidebar scrolls.

See [permissions](PRODUCT.md), [calendar subscriptions](CALENDAR.md), and [MCP connections](MCP.md).
