import { useId, useState } from "react";
import { Search, X, Check } from "lucide-react";
import type { Member } from "../shared/model";
import { searchPeople } from "../shared/people";
import "./people.css";

export function PersonAvatar({ member }: { member: Member }) {
  return (
    <span className={"avatar small " + member.color} aria-hidden="true">
      {member.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function PersonOption({ member }: { member: Member }) {
  return (
    <>
      <PersonAvatar member={member} />
      <span className="person-identity">
        <strong>{member.name}</strong>
        <small>
          {[member.username && "@" + member.username, member.email]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
    </>
  );
}

export function PeoplePicker({
  label,
  name,
  members,
  value,
  onChange,
  multiple = false,
  allowUnassigned = false,
  disabled = false,
}: {
  label: string;
  name?: string;
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  allowUnassigned?: boolean;
  disabled?: boolean;
}) {
  const id = useId(),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const selected = members.filter((m) => value.includes(m.id));
  const matches = searchPeople(
    members.filter((m) => !multiple || !value.includes(m.id)),
    query,
  );
  const options: (Member | null)[] = [
    ...(allowUnassigned &&
    (!query || "unassigned".includes(query.toLowerCase()))
      ? [null]
      : []),
    ...matches.slice(0, 8),
  ];
  const choose = (person: Member | null) => {
    onChange(multiple ? [...value, person!.id] : [person?.id ?? "unassigned"]);
    setQuery("");
    setOpen(false);
    setActive(0);
  };
  return (
    <div className="people-field">
      <label htmlFor={id}>{label}</label>
      {name &&
        value.map((personId) => (
          <input key={personId} type="hidden" name={name} value={personId} />
        ))}
      {multiple && selected.length > 0 && (
        <div className="people-chips">
          {selected.map((m) => (
            <span className="person-chip" key={m.id}>
              <PersonAvatar member={m} />
              <span>{m.name}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove collaborator ${m.name}`}
                onClick={() => onChange(value.filter((v) => v !== m.id))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="people-search">
        {!multiple && selected[0] ? (
          <PersonAvatar member={selected[0]} />
        ) : (
          <Search size={15} aria-hidden="true" />
        )}
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + "-options"}
          aria-activedescendant={
            open && options.length ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder={
            multiple ? "Search name, username or email" : "Search people…"
          }
          value={
            open
              ? query
              : multiple
                ? ""
                : (selected[0]?.name ?? (allowUnassigned ? "Unassigned" : ""))
          }
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery("");
              setActive(0);
            }
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            } else if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setOpen(true);
              setActive((a) =>
                options.length
                  ? (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                    options.length
                  : 0,
              );
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (options[active] !== undefined) choose(options[active]);
            }
          }}
        />
      </div>
      {open && (
        <div
          className="people-options"
          id={id + "-options"}
          role="listbox"
          aria-label={label + " suggestions"}
        >
          {options.map((m, i) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${i}`}
              key={m?.id ?? "unassigned"}
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(m)}
              onPointerMove={() => setActive(i)}
            >
              {m ? (
                <PersonOption member={m} />
              ) : (
                <span className="person-identity">
                  <strong>Unassigned</strong>
                  <small>Choose a worker later</small>
                </span>
              )}
              {value.includes(m?.id ?? "unassigned") && <Check size={15} />}
            </button>
          ))}
          {!options.length && <p>No matching people with project access.</p>}
          {matches.length > 8 && (
            <small className="people-search-hint">
              Keep typing to narrow {matches.length} matches.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
