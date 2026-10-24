import { mergeTeamStates } from "../shared/teams";
import { buildIcal } from "../shared/ical";
import { migrateDemoIds } from "../shared/demoIds";
import { browserId } from "../shared/ids";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useAction, useMutation, useQuery, useConvex } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { type Command, type State, defaults } from "../shared/model";
import {
  execute,
  completeDemoWrites,
  evaluateRisks,
  addTaskArtifact,
} from "../shared/domain";
import { checkFile } from "../shared/artifacts";
import {
  storeDemoFile,
  readDemoFile,
  clearDemoFiles,
  downloadBlob,
} from "./artifactFiles";
import { seedState, DEMO_USER } from "../shared/fixtures";
export interface Data {
  local?: boolean;
  workspaceId?: Id<"workspaces">;
  state: State;
  actorId: string;
  demo: boolean;
  online: boolean;
  teamId: string;
  teamIds: string[];
  teams: {
    id: string;
    name: string;
    kind: "personal" | "team";
    ownerId: string;
    role: string;
  }[];
  setTeam: (id: string) => void;
  createTeam: (name: string) => Promise<void>;
  dispatch: (
    command: Command,
    options?: { teamId?: string },
  ) => Promise<string>;
  uploadArtifact: (
    taskId: string,
    file: File,
    placement: "description" | "task",
  ) => Promise<string>;
  downloadArtifact: (taskId: string, artifactId: string) => Promise<void>;
  enableCollaboration: () => Promise<void>;
  acceptInvite: (token: string) => Promise<void>;
  inviteUrl: string;
  calendar: (
    operation: "connect" | "refresh" | "disconnect" | "list" | "choose",
    args?: {
      selectedIds: string[];
      destinationId: string;
      shareAvailability?: boolean;
    },
  ) => Promise<unknown>;
  feeds: {
    id: string;
    label: string;
    projectId?: string;
    includeDeadlines: boolean;
    expiresAt: number;
    revoked: boolean;
  }[];
  agenda: (
    operation: "create" | "revoke" | "export",
    args?: {
      label?: string;
      projectId?: string;
      includeDeadlines?: boolean;
      id?: string;
    },
  ) => Promise<unknown>;
  mintToken: (label: string, scopes: string[]) => Promise<string>;
  tokens: {
    id: string;
    label: string;
    revoked: boolean;
    expiresAt: number;
    scopes: string[];
    lastUsedAt?: number;
    clientName?: string;
    clientVersion?: string;
    lastTool?: string;
    toolCalls?: number;
  }[];
  mcpActivity: {
    id: string;
    label: string;
    tool: string;
    at: number;
    outcome: "success" | "error";
  }[];
  revokeToken: (id: string) => Promise<void>;
  reset: () => void;
}
const Context = createContext<Data | null>(null);
export function useData() {
  const c = useContext(Context);
  if (!c) throw new Error("Data provider missing");
  return c;
}
export function useOnline() {
  const [online, set] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => set(navigator.onLine);
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => {
      window.removeEventListener("online", f);
      window.removeEventListener("offline", f);
    };
  }, []);
  return online;
}
const storageKey = "kazi.synthetic-demo.v2";
function initial() {
  try {
    const s = localStorage.getItem(storageKey);
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.workspace && parsed.tasks && parsed.members)
        return migrateDemoIds({
          ...parsed,
          workspace: {
            ...parsed.workspace,
            name:
              parsed.workspace.name === "Studio workspace"
                ? "Kazi"
                : parsed.workspace.name,
          },
          iterations: parsed.iterations ?? [],
        } as State);
    }
  } catch {}
  return seedState();
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState(initial),
    [inviteUrl, setInviteUrl] = useState(""),
    [demoTeamId, setDemoTeamId] = useState("all");
  const online = useOnline();
  const demoState = useRef(state);
  const updateDemo = (next: State) => {
    demoState.current = next;
    set(next);
  };
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);
  const dispatch = async (command: Command) => {
    if (!online)
      throw new Error(
        "You are offline. Reconnect to save changes or approve plans.",
      );
    const ctx = {
      actorId: DEMO_USER,
      now: Date.now(),
      id: browserId,
      verifiedCalendar: true,
      invitationHash:
        command.type === "invite" ? crypto.randomUUID() : undefined,
    };
    let { state: next, result } = execute(demoState.current, command, ctx);
    // A foreground fixture of the server's recovery job, explicitly limited to
    // the synthetic owner. Real background execution belongs to Convex.
    if (command.type === "preferences" && !command.preferences.reviewRequired) {
      for (const proposal of next.proposals.filter(
        (p) => p.trigger === "recovery" && p.status === "awaiting_review",
      )) {
        const owners = [
          ...new Set(
            proposal.alternatives[proposal.selected].sessions.map(
              (s) => s.assigneeId,
            ),
          ),
        ];
        if (
          owners.length &&
          owners.every(
            (id) =>
              next.members.find((m) => m.id === id)?.preferences
                .reviewRequired === false,
          )
        ) {
          try {
            next = execute(
              next,
              { type: "approve", id: proposal.id, revision: proposal.revision },
              { ...ctx, automatic: true },
            ).state;
          } catch {
            /* The pending review remains visible if facts changed. */
          }
        }
      }
    }
    next = completeDemoWrites(evaluateRisks(next, ctx));
    if (command.type === "invite")
      setInviteUrl(
        "Demo invitation created. Shared links require the connected Clerk and Convex backend.",
      );
    updateDemo(next);
    return result;
  };
  return (
    <Context.Provider
      value={{
        state,
        teamId: demoTeamId,
        teamIds: [state.workspace.id],
        teams: [
          {
            ...state.workspace,
            role:
              state.members.find((m) => m.id === DEMO_USER)?.role ?? "owner",
          },
        ],
        setTeam: setDemoTeamId,
        createTeam: async () => {
          throw new Error(
            "Creating another team requires the connected backend.",
          );
        },
        actorId: DEMO_USER,
        demo: true,
        online,
        dispatch,
        uploadArtifact: async (taskId, file, placement) => {
          checkFile(file.name, file.size, file.type);
          if (!online) throw new Error("Reconnect before attaching a file.");
          const id = browserId();
          await storeDemoFile(id, file);
          const next = structuredClone(demoState.current);
          addTaskArtifact(
            next,
            {
              id,
              taskId,
              name: file.name,
              kind: "file",
              placement,
              size: file.size,
              contentType: file.type,
              createdBy: DEMO_USER,
              createdAt: Date.now(),
            },
            { actorId: DEMO_USER, now: Date.now(), id: browserId },
          );
          updateDemo(next);
          return id;
        },
        downloadArtifact: async (taskId, id) => {
          const artifact = state.artifacts?.find(
            (a) => a.id === id && a.taskId === taskId && !a.removedAt,
          );
          if (!artifact) throw new Error("This artifact is unavailable.");
          downloadBlob(await readDemoFile(id), artifact.name);
        },
        inviteUrl,
        enableCollaboration: async () => {
          updateDemo({
            ...demoState.current,
            workspace: { ...demoState.current.workspace, kind: "team" },
          });
        },
        acceptInvite: async () => {
          throw new Error(
            "Invitation acceptance requires a connected Clerk and Convex backend.",
          );
        },
        calendar: async (op, args) => {
          if (op === "list")
            return [
              { id: "fixture", name: "Example work calendar", writable: true },
            ];
          if (op === "connect")
            throw new Error(
              "This is a synthetic demo. Configure Clerk, Convex, and Google OAuth to connect your account.",
            );
          if (op === "choose" && args) {
            if (
              !["fixture", "kazi"].includes(args.destinationId) ||
              args.selectedIds.some((id) => id !== "fixture")
            )
              throw new Error(
                "Only the example calendar is available in the demo.",
              );
            set({
              ...state,
              calendars: state.calendars.map((c) =>
                c.ownerId === DEMO_USER
                  ? {
                      ...c,
                      status: args.destinationId === "kazi" ? "native" : "demo",
                      selectedIds: args.selectedIds,
                      destinationId: args.destinationId,
                      shareAvailability: args.shareAvailability ?? false,
                    }
                  : c,
              ),
            });
          }
          if (op === "disconnect")
            set({
              ...state,
              calendars: state.calendars.map((c) =>
                c.ownerId === DEMO_USER
                  ? {
                      ...c,
                      status: "disconnected",
                      selectedIds: [],
                      destinationId: undefined,
                    }
                  : c,
              ),
            });
          if (op === "refresh")
            set({
              ...state,
              calendars: state.calendars.map((c) =>
                c.ownerId === DEMO_USER
                  ? {
                      ...c,
                      status: "demo",
                      selectedIds: ["fixture"],
                      destinationId: "fixture",
                      lastSync: Date.now(),
                    }
                  : c,
              ),
            });
        },
        feeds: [],
        agenda: async (op, args) => {
          if (op === "export")
            return buildIcal(state, DEMO_USER, {
              ...args,
              appOrigin: location.origin,
            });
          throw new Error(
            "Calendar subscription links require the connected backend. Download ICS works in this demo.",
          );
        },
        mintToken: async () => {
          throw new Error(
            "MCP tokens require the connected Clerk and Convex backend. See docs/MCP.md for setup.",
          );
        },
        tokens: [],
        mcpActivity: [],
        revokeToken: async () => {},
        reset: () => {
          void clearDemoFiles().catch(() => {});
          localStorage.removeItem(storageKey);
          updateDemo(seedState());
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function LiveProvider({
  children,
  actorId,
  local = false,
}: {
  children: ReactNode;
  actorId: string;
  local?: boolean;
}) {
  const online = useOnline(),
    bootstrap = useMutation(api.commands.bootstrap),
    execute = useMutation(api.commands.execute),
    plan = useAction(api.commands.plan),
    invite = useAction(api.commands.invite),
    enable = useMutation(api.commands.enableCollaboration),
    accept = useMutation(api.commands.acceptInvite),
    create = useMutation(api.commands.createTeam);
  const connect = useAction(api.calendar.connect),
    refresh = useAction(api.calendar.refresh),
    disconnect = useAction(api.calendar.disconnect),
    list = useAction(api.calendar.list),
    choose = useAction(api.calendar.choose),
    mint = useAction(api.tokens.mint),
    revoke = useMutation(api.tokens.revoke);
  const release = useAction(api.commands.release);
  const prepareFile = useMutation(api.files.prepare);
  const convex = useConvex(),
    createFeed = useAction(api.calendar.createFeed),
    revokeFeed = useMutation(api.calendar.revokeFeed);
  const [primaryId, setWorkspace] = useState<Id<"workspaces">>(),
    [teamId, setTeamId] = useState(
      () => localStorage.getItem("kazi.team-filter." + actorId) ?? "all",
    ),
    [error, setError] = useState(""),
    [inviteUrl, setInviteUrl] = useState("");
  const entries = useQuery(api.commands.allSnapshot, primaryId ? {} : "skip");
  const ordered = entries
    ? [...entries].sort(
        (a, b) => Number(b.id === primaryId) - Number(a.id === primaryId),
      )
    : [];
  const selected =
    teamId === "all" ? ordered : ordered.filter((entry) => entry.id === teamId);
  const effective = selected.length ? selected : ordered;
  const state = effective.length
    ? mergeTeamStates(effective, actorId)
    : undefined;
  const workspaceId = (effective[0]?.id ?? primaryId) as
    Id<"workspaces"> | undefined;
  const setTeam = (id: string) => {
    setTeamId(id);
    localStorage.setItem("kazi.team-filter." + actorId, id);
  };
  const feeds = useQuery(
      api.calendar.feeds,
      workspaceId ? { workspaceId } : "skip",
    ),
    tokens = useQuery(api.tokens.list, {}),
    mcpActivity = useQuery(api.tokens.activity, {});
  useEffect(() => {
    let live = true;
    bootstrap({})
      .then((id) => {
        if (live && id) setWorkspace(id);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
      localStorage.removeItem("kazi.private");
    };
  }, [bootstrap, actorId]);
  if (error)
    return (
      <div className="startup">
        <h1>Connection required</h1>
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!workspaceId || !state)
    return (
      <div className="startup">
        <div className="logo-symbol">k</div>
        <h1>Loading Kazi</h1>
        <p>
          {online
            ? "Loading your tasks and projects…"
            : "You’re offline. Reconnect to load your private data."}
        </p>
      </div>
    );
  const dispatch = async (command: Command, options?: { teamId?: string }) => {
    if (!online)
      throw new Error("Reconnect to save changes or approve a plan.");
    const resourceId =
      "projectId" in command && command.projectId
        ? command.projectId
        : "id" in command
          ? command.id
          : "versionId" in command
            ? command.versionId
            : undefined;
    const target =
      options?.teamId ??
      (resourceId && state.resourceTeams?.[resourceId]) ??
      workspaceId;
    const args = {
      workspaceId: target as Id<"workspaces">,
      command: JSON.stringify(command),
      requestId: crypto.randomUUID(),
    };
    if (command.type === "invite") {
      const result = await invite(args);
      setInviteUrl(result.url);
      return result.url;
    }
    if (command.type === "release_sessions") return release(args);
    return ["propose", "approve"].includes(command.type)
      ? plan(args)
      : execute(args);
  };
  return (
    <Context.Provider
      value={{
        state: state as State,
        teamId: selected.length ? teamId : "all",
        teamIds: effective.map((entry) => entry.id),
        teams: ordered.map(({ id, state }) => ({
          ...state.workspace,
          id,
          role: state.members.find((m) => m.id === actorId)?.role ?? "guest",
        })),
        setTeam,
        createTeam: async (name) => {
          const id = await create({ name });
          setTeam(String(id));
        },
        workspaceId,
        actorId,
        local,
        demo: false,
        online,
        dispatch,
        uploadArtifact: async (taskId, file, placement) => {
          if (!online) throw new Error("Reconnect before attaching a file.");
          checkFile(file.name, file.size, file.type);
          const transfer = await prepareFile({
            workspaceId: (state.resourceTeams?.[taskId] ??
              workspaceId) as Id<"workspaces">,
            taskId,
            kind: "upload",
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
            placement,
          });
          const response = await fetch(transfer.url, {
            method: "POST",
            headers: {
              Authorization: "Bearer " + transfer.token,
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
            cache: "no-store",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok)
            throw new Error(
              "File upload failed. Check your connection and task access, then try again.",
            );
          return (await response.json()).artifactId as string;
        },
        downloadArtifact: async (taskId, id) => {
          const artifact = state.artifacts?.find(
            (a) => a.id === id && a.taskId === taskId && !a.removedAt,
          );
          if (!artifact) throw new Error("This artifact is unavailable.");
          const transfer = await prepareFile({
            workspaceId: (state.resourceTeams?.[taskId] ??
              workspaceId) as Id<"workspaces">,
            taskId,
            kind: "download",
            artifactId: id,
          });
          const response = await fetch(transfer.url, {
            headers: { Authorization: "Bearer " + transfer.token },
            cache: "no-store",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok)
            throw new Error(
              "Download unavailable. Check task access and try again.",
            );
          downloadBlob(await response.blob(), artifact.name);
        },
        inviteUrl,
        enableCollaboration: async () => {
          await enable({ workspaceId });
        },
        acceptInvite: async (token) => {
          const id = await accept({ token });
          setWorkspace(id);
          setTeam(String(id));
        },
        calendar: async (op, args) => {
          if (op === "connect") return connect({ workspaceId });
          if (op === "refresh") return refresh({ workspaceId });
          if (op === "disconnect") return disconnect({ workspaceId });
          if (op === "list") return list({ workspaceId });
          if (op === "choose" && args) return choose({ workspaceId, ...args });
        },
        feeds: feeds ?? [],
        agenda: async (operation, args) => {
          if (operation === "create")
            return createFeed({
              workspaceId,
              label: args?.label ?? "My calendar",
              includeDeadlines: args?.includeDeadlines ?? false,
              allTeams: teamId === "all",
              ...(args?.projectId ? { projectId: args.projectId } : {}),
            });
          if (operation === "revoke" && args?.id)
            return revokeFeed({ id: args.id as Id<"calendarFeeds"> });
          if (operation === "export")
            return convex.query(api.calendar.exportAgenda, {
              workspaceId,
              includeDeadlines: args?.includeDeadlines ?? false,
              allTeams: teamId === "all",
              ...(args?.projectId ? { projectId: args.projectId } : {}),
            });
        },
        mintToken: (label, scopes) => mint({ label, scopes }),
        tokens: (tokens ?? []).map((t) => ({ ...t, id: String(t.id) })),
        mcpActivity: (mcpActivity ?? []).map((a) => ({
          ...a,
          id: String(a.id),
        })),
        revokeToken: async (id) => {
          await revoke({ id: id as Id<"mcpTokens"> });
        },
        reset: () => {},
      }}
    >
      {children}
    </Context.Provider>
  );
}
