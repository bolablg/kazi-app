import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Check,
  Clock3,
  ListChecks,
  LocateFixed,
  Plug,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { defaults, defaultAgingDays, type Preferences } from "../shared/model";
import { useData } from "./data";
import { cx, useUI } from "./components";
import { InfoTip, PageTitle } from "./InfoTip";
import { AccountSettings } from "./AccountPages";
import {
  AccountDataExportButton,
  type AccountIdentityExport,
} from "./AccountDataExport";
import { availableTimeZones, deviceTimeZone } from "../shared/timezones";
import { AgendaSettings } from "./AgendaSettings";
import {
  ConnectionsOverview,
  McpActivity,
  McpSettings,
} from "./ConnectionsPages";

function SectionHeading({
  title,
  help,
  tone,
  children,
}: {
  title: string;
  help: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="planning-section-heading">
      <span className="settings-emblem" data-tone={tone}>
        {children}
      </span>
      <h2>{title}</h2>
      <InfoTip label={`About ${title.toLowerCase()}`}>{help}</InfoTip>
    </div>
  );
}
function HourSelect({
  value,
  onChange,
  end = false,
}: {
  value: number;
  onChange: (value: number) => void;
  end?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, i) => {
        const hour = i + (end ? 1 : 0);
        return (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, "0")}:00
          </option>
        );
      })}
    </select>
  );
}

export function SettingsPage({
  connections = false,
}: {
  connections?: boolean;
}) {
  const { state, actorId, dispatch, demo } = useData();
  const { run, notify } = useUI();
  const [params, setParams] = useSearchParams();
  const preferences =
    state.members.find((m) => m.id === actorId)?.preferences ?? defaults;
  const [prefs, setPrefs] = useState<Preferences>(preferences),
    [saving, setSaving] = useState(false);
  const requested = params.get("tab");
  const tabStrip = useRef<HTMLElement>(null);
  const workingHours = useRef<HTMLElement>(null);
  const [deviceZone] = useState(deviceTimeZone);
  const zones = useMemo(
    () => availableTimeZones(prefs.timezone),
    [prefs.timezone],
  );
  const tabs = connections
    ? [
        { id: "overview", label: "Overview" },
        { id: "calendar", label: "Calendar availability" },
        { id: "mcp", label: "MCP & agents" },
        { id: "activity", label: "Activity" },
      ]
    : [
        { id: "account", label: "My account" },
        { id: "planning", label: "Planning" },
      ];
  const tab =
    connections && params.get("calendar")
      ? "calendar"
      : tabs.some((t) => t.id === requested)
        ? requested!
        : !connections && requested === "workspace"
          ? "account"
          : connections
            ? "overview"
            : "planning";
  const savedPreferences = JSON.stringify(preferences);
  const section = params.get("section");
  useEffect(() => {
    if (tab !== "planning" || section !== "working-hours") return;
    const frame = requestAnimationFrame(() => {
      workingHours.current?.scrollIntoView({ block: "start" });
      workingHours.current
        ?.querySelector<HTMLSelectElement>("#planning-timezone")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, section]);
  useLayoutEffect(() => {
    const strip = tabStrip.current;
    if (!strip) return;
    const revealSelected = () => {
      const active = strip.querySelector<HTMLButtonElement>("button.active");
      if (!active) return;
      const bounds = strip.getBoundingClientRect();
      const selected = active.getBoundingClientRect();
      if (selected.left < bounds.left)
        strip.scrollLeft += selected.left - bounds.left - 8;
      else if (selected.right > bounds.right)
        strip.scrollLeft += selected.right - bounds.right + 8;
    };
    const observer = new ResizeObserver(revealSelected);
    observer.observe(strip);
    revealSelected();
    return () => observer.disconnect();
  }, [tab, connections]);
  useEffect(
    () => setPrefs(JSON.parse(savedPreferences)),
    [state.workspace.id, actorId, savedPreferences],
  );
  useEffect(() => {
    if (connections && params.get("calendar") === "error")
      notify(
        "Calendar consent was not completed. Start the connection again.",
        true,
      );
  }, [params, connections]);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));
  const dirty = JSON.stringify(prefs) !== JSON.stringify(preferences);
  const exportData = (accountIdentity?: AccountIdentityExport) => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "kazi-export/1",
              exportedAt: Date.now(),
              synthetic: demo,
              ...(accountIdentity ? { accountIdentity } : {}),
              data: state,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `kazi-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Your authorized application data was exported");
  };
  return (
    <div
      className={cx(
        "page settings-page",
        connections ? "connections-page" : "preferences-page",
      )}
    >
      <div className="page-heading">
        <div className="account-page-heading">
          <span
            className="account-page-emblem"
            data-tone={connections ? "blue" : "orange"}
            aria-hidden="true"
          >
            {connections ? <Plug size={24} /> : <Settings2 size={24} />}
          </span>
          <PageTitle
            help={
              connections
                ? "Manage calendar availability sources, MCP credentials, and agent activity."
                : "Manage your account and personal planning preferences."
            }
          >
            {connections ? "Connections" : "Settings"}
          </PageTitle>
        </div>
        {!connections && (
          <div className="settings-export">
            <AccountDataExportButton
              onExport={exportData}
              onError={() =>
                notify(
                  "We could not complete your export. Please try again.",
                  true,
                )
              }
            />
            <InfoTip label="About data export">
              Download the projects, tasks, activity, and plan history you can
              access. Authentication secrets and integration credentials are
              excluded. Your own shared-account mapping and service-use dates
              are included when shared sign-in is enabled.
            </InfoTip>
          </div>
        )}
      </div>
      <nav
        ref={tabStrip}
        className="tabs settings-tabs"
        aria-label={connections ? "Connection views" : "Settings sections"}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            aria-pressed={tab === t.id}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "account" && <AccountSettings />}
      {tab === "overview" && <ConnectionsOverview />}
      {tab === "calendar" && <AgendaSettings view="availability" />}
      {tab === "mcp" && <McpSettings />}
      {tab === "activity" && <McpActivity />}
      {tab === "planning" && (
        <form
          className="settings-form settings-planning"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await run(
                () => dispatch({ type: "preferences", preferences: prefs }),
                "Preferences saved",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <section
            className="settings-section planning-section planning-hours"
            id="working-hours"
            ref={workingHours}
          >
            <SectionHeading
              title="Working hours & capacity"
              tone="teal"
              help="Set your available hours and capacity for planned sessions. Working-time workflow metrics use these days and hours in your time zone; they do not measure time worked."
            >
              <Clock3 size={21} />
            </SectionHeading>
            <div className="form form-grid">
              <div className="timezone-field">
                <div className="timezone-label">
                  <label htmlFor="planning-timezone">Time zone</label>
                </div>
                <select
                  id="planning-timezone"
                  aria-label="Time zone"
                  value={prefs.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <div className="timezone-actions">
                  <button
                    type="button"
                    className="text-button device-timezone"
                    disabled={!deviceZone || prefs.timezone === deviceZone}
                    onClick={() => {
                      if (deviceZone) update("timezone", deviceZone);
                    }}
                  >
                    <LocateFixed size={14} />
                    Use device time zone
                  </button>
                  <InfoTip label="About your time zone">
                    This saved time zone controls planning, due dates,
                    reminders, and Insights. Use your device’s current zone as a
                    shortcut, then save. Traveling does not change it
                    automatically.
                  </InfoTip>
                </div>
              </div>
              <label>
                Daily focus capacity (minutes)
                <input
                  type="number"
                  min={30}
                  max={720}
                  step={15}
                  value={prefs.dailyMinutes}
                  onChange={(e) =>
                    update("dailyMinutes", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Day starts
                <HourSelect
                  value={prefs.startHour}
                  onChange={(v) => update("startHour", v)}
                />
              </label>
              <label>
                Day ends
                <HourSelect
                  end
                  value={prefs.endHour}
                  onChange={(v) => update("endHour", v)}
                />
              </label>
            </div>
            <fieldset className="planning-weekdays">
              <legend>Working days</legend>
              <div
                className="working-days"
                role="group"
                aria-label="Working days"
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day, i) => (
                    <button
                      type="button"
                      aria-pressed={prefs.workingDays.includes(i + 1)}
                      className={
                        prefs.workingDays.includes(i + 1) ? "selected" : ""
                      }
                      key={day}
                      onClick={() =>
                        update(
                          "workingDays",
                          prefs.workingDays.includes(i + 1)
                            ? prefs.workingDays.filter((d) => d !== i + 1)
                            : [...prefs.workingDays, i + 1],
                        )
                      }
                    >
                      {day}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
            <div className="form form-grid three session-preferences">
              <label>
                Shortest session (min)
                <input
                  type="number"
                  min={15}
                  max={120}
                  step={15}
                  value={prefs.minSession}
                  onChange={(e) => update("minSession", Number(e.target.value))}
                />
              </label>
              <label>
                Longest session (min)
                <input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={prefs.maxSession}
                  onChange={(e) => update("maxSession", Number(e.target.value))}
                />
              </label>
              <label>
                Space between sessions (min)
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={5}
                  value={prefs.bufferMinutes}
                  onChange={(e) =>
                    update("bufferMinutes", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </section>
          <section
            className="settings-section planning-section planning-approval"
            aria-labelledby="plan-approval-heading"
          >
            <SectionHeading
              title="Plan approval"
              tone="blue"
              help="Review proposals before they reach your calendar. Turning review off requires saving your automatic scheduling preferences."
            >
              <ShieldCheck size={21} />
            </SectionHeading>
            <div className="review-setting">
              <div>
                <div>
                  <strong id="plan-approval-heading">
                    Review new plans before scheduling
                  </strong>
                  <span className="planning-rule-state">
                    {prefs.reviewRequired
                      ? "Your approval comes first"
                      : "Automatic scheduling enabled"}
                  </span>
                </div>
              </div>
              <button
                className={cx("switch", prefs.reviewRequired && "on")}
                role="switch"
                aria-checked={prefs.reviewRequired}
                aria-label="Review new plans before scheduling"
                type="button"
                onClick={() => update("reviewRequired", !prefs.reviewRequired)}
              >
                <span />
              </button>
            </div>
            {!prefs.reviewRequired && (
              <div className="automatic-notice">
                <AlertTriangle size={19} />
                <p>
                  <strong>Automatic recovery · your calendar only.</strong>{" "}
                  Saving enables eligible recovery scheduling within your
                  working hours, capacity, and horizon. Teammates keep their own
                  review settings. Existing plans and events stay unchanged.
                </p>
              </div>
            )}
          </section>
          <section className="settings-section planning-section planning-notifications">
            <SectionHeading
              title="Notifications & planning horizon"
              tone="pink"
              help="Alerts respect quiet hours in your time zone. Deadline reminders run at 72 and 24 hours. Backend reminders continue with the browser closed; acknowledging one does not complete a task."
            >
              <Bell size={21} />
            </SectionHeading>
            <div className="form form-grid three">
              <label>
                Quiet hours begin
                <HourSelect
                  value={prefs.quietStart}
                  onChange={(v) => update("quietStart", v)}
                />
              </label>
              <label>
                Quiet hours end
                <HourSelect
                  value={prefs.quietEnd}
                  onChange={(v) => update("quietEnd", v)}
                />
              </label>
              <label>
                Planning horizon (days)
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={prefs.horizonDays}
                  onChange={(e) =>
                    update("horizonDays", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </section>
          <section className="settings-section planning-section workflow-thresholds planning-thresholds">
            <SectionHeading
              title="Workflow review thresholds"
              tone="violet"
              help="Flag tasks after this many calendar days in a stage. These thresholds surface review reminders and aging insights; they do not move or archive tasks. To Brainstorm ideas wait until their review date."
            >
              <ListChecks size={21} />
            </SectionHeading>
            <div className="threshold-grid">
              {(["backlog", "todo", "in_progress", "to_validate"] as const).map(
                (stage) => (
                  <label
                    className="threshold-tile"
                    data-stage={stage}
                    key={stage}
                  >
                    <span className="threshold-stage">
                      <i aria-hidden="true" />
                      {
                        {
                          backlog: "Backlog",
                          todo: "To do",
                          in_progress: "In progress",
                          to_validate: "To validate",
                        }[stage]
                      }
                    </span>
                    <span className="threshold-value">
                      <input
                        type="number"
                        aria-label={stage + " aging threshold"}
                        min={1}
                        max={stage === "backlog" ? 730 : 365}
                        value={
                          prefs.agingDays?.[stage] ?? defaultAgingDays[stage]
                        }
                        onChange={(e) =>
                          update("agingDays", {
                            ...defaultAgingDays,
                            ...prefs.agingDays,
                            [stage]: Number(e.target.value),
                          })
                        }
                      />
                      <span>days</span>
                    </span>
                  </label>
                ),
              )}
            </div>
          </section>
          <div className="settings-save">
            <span className="preference-save-state" role="status">
              <i data-dirty={dirty} />
              {dirty ? "Unsaved changes" : "Preferences up to date"}
            </span>
            <div className="settings-save-actions">
              {dirty && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={saving}
                  onClick={() => setPrefs(preferences)}
                >
                  Discard changes
                </button>
              )}
              <button className="button primary" disabled={saving || !dirty}>
                <Check size={15} />
                {saving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
