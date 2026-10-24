# Product behavior and permissions

## Workspace roles

| Operation                                         | Owner        | Admin                              | Member                     | Guest                              |
| ------------------------------------------------- | ------------ | ---------------------------------- | -------------------------- | ---------------------------------- |
| Read public workspace projects                    | Yes          | Yes                                | Yes                        | Only explicitly shared projects    |
| Read restricted team project                      | Yes          | Yes                                | If owner/member of project | If explicitly selected             |
| Create projects                                   | Yes          | Yes                                | Yes                        | No                                 |
| Manage a project and assign other people          | Yes          | Yes                                | If project owner           | If explicitly made project owner   |
| Update assigned task/progress                     | Yes          | Yes                                | Within authorized project  | Within explicitly shared project   |
| Invite/revoke/remove members                      | Yes          | Yes, excluding owner/admin removal | No                         | No                                 |
| Remove the owner                                  | No           | No                                 | No                         | No                                 |
| Change someone else’s planning policy             | No           | No                                 | No                         | No                                 |
| Write another person’s calendar merely as manager | No           | No                                 | No                         | No                                 |
| Approve personal focus sessions                   | Own calendar | Own calendar                       | Own calendar               | Own calendar, with resource access |

Personal work lives in a separate workspace. Team owners do not gain access to another user’s personal workspace. Project restrictions are an additional layer within a team. Workspace managers may administer restricted team projects; do not place private personal capture in a team workspace.

## Capture, effort and progress

Initial onboarding creates a personal workspace and Inbox. Every command chooses an explicit authorized workspace. An omitted project uses its persisted default Inbox. The default Inbox cannot be archived. Team Inbox is visibly shared; a guest without project access cannot capture into it.

Tasks have one assignee or an explicit Unassigned state, plus priority, state, deadlines, estimates, labels, dependencies and subtasks. Overdue is an indicator, not a task state. Explicit completion and reopening generate activity. Calendar time and timer logs do not complete work. Remaining effort updates override estimate-minus-logged-time arithmetic. Parents with children are excluded from planning workload so effort is counted once.

Comments/title changes do not reset the meaningful-progress timestamp. Progress check-ins, remaining-effort updates, and completion/reopening do. Reassignment increments task revision and notifies the new assignee; member removal unassigns their tasks and revokes future workspace/job access while preserving historical actor IDs.

## Plans and recovery

Review defaults ON. The current revision, alternatives, original deadline, recovery target, owners, available sessions, shortfall and actual sync status are visible during review. Approval creates one immutable accepted version. New versions link to their predecessor/root lineage and carry only unfinished canonical work through new task attempts.

Turning review OFF is a deliberate authenticated personal setting change with an audit record. It authorizes eligible automatic recovery within saved hours, daily cap, session limits and horizon. Project owners can add a project review requirement; a project override cannot remove anyone’s personal requirement. Automatic jobs re-read current policy and membership before effects. Teammates opt into free/busy sharing separately and retain control over their own approval.

The local demonstration simulates automatic scheduling when a saved OFF policy permits its queued synthetic recovery proposal. Real automatic jobs are durable Convex functions. No browser tab is needed by the connected backend.

Accepted Plan 1 stays unchanged when Plan 2 is generated or applied. Original Google reservations remain busy. The owner can explicitly select future reservations to release; past events cannot be released by this workflow. A moved or canceled external event is reconciled visibly, not overwritten to force it back to an old snapshot.

## Notifications

In-app alerts cover nearing deadlines (72h/24h checkpoints), stale meaningful progress after two local working-day boundaries, aging backlog reviews, validation requests, known capacity shortfalls, overdue work, pending reviews, and calendar receipts/errors. Quiet hours defer visibility, snooze lasts one day, and read/snooze never changes work completion. An overdue incident has one initial alert and later daily digest windows. Repeated jobs use stable recipient/item/condition/window keys.

Capacity claims are made only from confirmed fresh availability. Missing data is described as unknown. Recipient task alerts are scoped to the assignee and current resource permission. Backend state changes suppress obsolete completion/cancellation/removal alerts. Quiet hours and working/scheduling constraints are configurable; the initial checkpoint thresholds are currently fixed defaults.

## Offline and installation

The service worker precaches the application shell, icons and scripts. It does not cache Clerk/Convex responses. A loaded live subscription may retain its in-memory last view after a network drop, marked read-only. A cold offline start cannot perform initial authentication or obtain private server data. Reconnect to mutate, approve, or confirm calendar writes. Demo fixture persistence is separate from live account data.

Install through the browser’s install action or supported mobile Add to Home Screen flow. Updates are prompted, then activated deliberately. Sign-out/account changes discard the mounted live provider/subscription; no private live browser disk cache exists. Browser Web Push remains unconfigured. Optional Resend delivery is available for invitations; task review and other alerts are in-app and do not require email.
