import type { Member, Mention, State } from "./model";

// A task has one home team. Membership in a different team never grants access.
export function taskPeople(state: State, projectId: string): Member[] {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return [];
  const team = state.resourceTeams?.[projectId];
  const members = team ? (state.teamMemberships?.[team] ?? []) : state.members;
  return members.filter(
    (m) =>
      ["owner", "admin"].includes(m.role) ||
      project.ownerId === m.id ||
      project.memberIds.includes(m.id) ||
      (!project.private && m.role !== "guest"),
  );
}

export function searchPeople(members: Member[], query: string): Member[] {
  const term = query.trim().replace(/^@/, "").toLocaleLowerCase();
  return members
    .filter((m) =>
      [m.name, m.username, m.email].some((value) =>
        value?.toLocaleLowerCase().includes(term),
      ),
    )
    .sort((a, b) => {
      const rank = (m: Member) =>
        [m.username, m.email, m.name].some((value) =>
          value?.toLocaleLowerCase().startsWith(term),
        )
          ? 0
          : 1;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
}

export function mentionLabel(member: Member) {
  return "@" + (member.username || member.name);
}

// Preserve references when editing around them; editing the mention itself turns
// it back into ordinary text until the author explicitly selects a person again.
export function moveMentions(
  before: string,
  after: string,
  mentions: Mention[],
): Mention[] {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length,
    newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap((mention) => {
    if (mention.end <= start) return [mention];
    if (mention.start >= oldEnd)
      return [
        { ...mention, start: mention.start + delta, end: mention.end + delta },
      ];
    return [];
  });
}

export function trimMentionText(text: string, mentions: Mention[] = []) {
  const leading = text.length - text.trimStart().length;
  return {
    text: text.trim(),
    mentions: mentions.map((m) => ({
      ...m,
      start: m.start - leading,
      end: m.end - leading,
    })),
  };
}
