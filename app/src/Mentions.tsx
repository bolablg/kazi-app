import { useId, useRef, useState, type ReactNode } from "react";
import type { Member, Mention } from "../shared/model";
import { mentionLabel, moveMentions, searchPeople } from "../shared/people";
import { PersonOption } from "./PeoplePicker";

export function MentionText({
  text,
  mentions = [],
  members,
  liveNames = true,
}: {
  text: string;
  mentions?: Mention[];
  members: Member[];
  liveNames?: boolean;
}) {
  const parts: ReactNode[] = [];
  let end = 0;
  for (const mention of mentions) {
    if (mention.start < end || mention.end > text.length) continue;
    const member = members.find((m) => m.id === mention.memberId);
    parts.push(text.slice(end, mention.start));
    parts.push(
      <span
        key={mention.start}
        className="person-mention"
        title={
          member
            ? [member.name, member.email].filter(Boolean).join(" · ")
            : "Former teammate"
        }
      >
        {member && liveNames
          ? mentionLabel(member)
          : text.slice(mention.start, mention.end)}
      </span>,
    );
    end = mention.end;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}

export function MentionInput({
  label,
  name,
  value,
  mentions,
  onChange,
  members,
  rows = 3,
  placeholder,
  disabled = false,
  hideHint = false,
}: {
  label: string;
  name?: string;
  value: string;
  mentions: Mention[];
  onChange: (text: string, mentions: Mention[]) => void;
  members: Member[];
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  hideHint?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLTextAreaElement>(null),
    overlay = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0),
    [focused, setFocused] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [active, setActive] = useState(0);
  const match = /(?:^|[\s(])@([^\s]*)$/.exec(value.slice(0, cursor));
  const start = match ? cursor - match[1].length - 1 : -1;
  const open =
    focused &&
    !dismissed &&
    !!match &&
    !mentions.some((m) => cursor > m.start && cursor <= m.end);
  const matches = open ? searchPeople(members, match![1]).slice(0, 8) : [];
  const choose = (member: Member) => {
    const label = mentionLabel(member),
      after = value.slice(0, start) + label + " " + value.slice(cursor);
    const references = [
      ...moveMentions(value, after, mentions),
      { memberId: member.id, start, end: start + label.length },
    ].sort((a, b) => a.start - b.start);
    if (after.length > 5000 || references.length > 30) return;
    onChange(after, references);
    setDismissed(true);
    setCursor(start + label.length + 1);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        start + label.length + 1,
        start + label.length + 1,
      );
    });
  };
  return (
    <div className="mention-field">
      {name && (
        <input
          type="hidden"
          name={name + "Mentions"}
          value={JSON.stringify(mentions)}
        />
      )}
      <div className="mention-writing">
        <div className="mention-overlay" aria-hidden="true" ref={overlay}>
          <MentionText
            text={value + "\n"}
            mentions={mentions}
            members={members}
            liveNames={false}
          />
        </div>
        <textarea
          ref={input}
          name={name}
          aria-label={label}
          aria-describedby={id + "-hint"}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-activedescendant={
            open && matches.length ? `${id}-${active}` : undefined
          }
          rows={rows}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={5000}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onScroll={() => {
            if (input.current && overlay.current) {
              overlay.current.scrollTop = input.current.scrollTop;
              overlay.current.scrollLeft = input.current.scrollLeft;
            }
          }}
          onChange={(e) => {
            onChange(
              e.target.value,
              moveMentions(value, e.target.value, mentions),
            );
            setCursor(e.target.selectionStart);
            setDismissed(false);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (open && e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
            } else if (
              open &&
              ["ArrowDown", "ArrowUp"].includes(e.key) &&
              matches.length
            ) {
              e.preventDefault();
              setActive(
                (a) =>
                  (a + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
                  matches.length,
              );
            } else if (
              open &&
              ["Enter", "Tab"].includes(e.key) &&
              matches[active]
            ) {
              e.preventDefault();
              choose(matches[active]);
            }
          }}
        />
      </div>
      {open && (
        <div
          className="people-options mention-options"
          role="listbox"
          id={id}
          aria-label="Mention suggestions"
        >
          {matches.map((m, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              id={`${id}-${i}`}
              key={m.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(m)}
              onPointerMove={() => setActive(i)}
            >
              <PersonOption member={m} />
            </button>
          ))}
          {!matches.length && <p>No matching people with project access.</p>}
        </div>
      )}
      <small
        id={id + "-hint"}
        className={hideHint ? "sr-only" : "mention-hint"}
      >
        Type @ to mention someone. They’ll be notified when you{" "}
        {name === "description" ? "save" : "post"}.
      </small>
    </div>
  );
}
