import { useState, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import {
  FileText,
  Link2,
  Paperclip,
  Send,
  X,
  Download,
  Plus,
  ArrowRight,
  CircleDot,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Activity, Task, TaskArtifact, Mention } from "../shared/model";
import { taskPeople } from "../shared/people";
import { MentionInput, MentionText } from "./Mentions";
import { InfoTip } from "./InfoTip";
import { statusLabels } from "../shared/model";
import { stageColors } from "./PrioritySelect";
import { checkFile, fileSize } from "../shared/artifacts";
import { canEditTask } from "../shared/workflow";
import { useData } from "./data";
import { Avatar, useUI } from "./components";

export function ArtifactItem({
  artifact,
  removable = false,
}: {
  artifact: TaskArtifact;
  removable?: boolean;
}) {
  const { state, actorId, dispatch, downloadArtifact, online } = useData(),
    { run } = useUI();
  const [busy, setBusy] = useState(false);
  const task = state.tasks.find((t) => t.id === artifact.taskId);
  const canRemove =
    task &&
    (artifact.createdBy === actorId || canEditTask(state, task, actorId));
  const content = (
    <>
      <span className="artifact-icon">
        {artifact.kind === "file" ? (
          <FileText size={18} />
        ) : (
          <Link2 size={18} />
        )}
      </span>
      <span className="artifact-copy">
        <strong>{artifact.name}</strong>
        <small>
          {artifact.kind === "file"
            ? fileSize(artifact.size ?? 0)
            : new URL(artifact.url!).hostname}
        </small>
      </span>
      {artifact.kind === "file" && <Download size={14} />}
    </>
  );
  return (
    <div className="task-artifact" data-kind={artifact.kind}>
      {artifact.kind === "link" ? (
        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          className="artifact-download"
          disabled={busy || !online}
          onClick={async () => {
            setBusy(true);
            try {
              await run(() => downloadArtifact(artifact.taskId, artifact.id));
            } finally {
              setBusy(false);
            }
          }}
          aria-label={`Download ${artifact.name}`}
        >
          {content}
        </button>
      )}
      {removable && canRemove && (
        <button
          type="button"
          className="icon-button"
          disabled={!online || busy}
          aria-label={`Remove artifact ${artifact.name}`}
          onClick={() =>
            void run(
              () =>
                dispatch({
                  type: "remove_artifact",
                  id: artifact.taskId,
                  artifactId: artifact.id,
                }),
              "Artifact removed",
            )
          }
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function ArtifactActions({
  taskId,
  placement,
  onAdded,
}: {
  taskId: string;
  placement: "description" | "task";
  onAdded?: (id: string) => void;
}) {
  const { dispatch, uploadArtifact, online } = useData(),
    { run } = useUI();
  const [busy, setBusy] = useState(false),
    [linkOpen, setLinkOpen] = useState(false),
    [name, setName] = useState(""),
    [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const linkSubmit = useRef<HTMLButtonElement>(null);
  return (
    <div className="artifact-actions">
      <div className="artifact-action-buttons">
        <input
          ref={input}
          className="sr-only"
          hidden
          aria-label={`Upload ${placement === "description" ? "description" : "task"} files`}
          type="file"
          multiple
          disabled={!online || busy}
          onChange={async (event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            setBusy(true);
            try {
              await run(async () => {
                for (const file of files) {
                  const id = await uploadArtifact(taskId, file, placement);
                  onAdded?.(id);
                }
              }, "Files attached");
            } finally {
              setBusy(false);
            }
          }}
        />
        <button
          type="button"
          className="text-button"
          onClick={() => input.current?.click()}
          disabled={!online || busy}
        >
          <Paperclip size={15} />
          {busy ? "Uploading…" : "Attach file"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setLinkOpen(!linkOpen)}
          disabled={!online || busy}
          aria-expanded={linkOpen}
        >
          <Link2 size={15} />
          Add link
        </button>
        <small>Up to 20 MB per file</small>
      </div>
      {linkOpen && (
        <div
          className="artifact-link-editor"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              linkSubmit.current?.click();
            }
          }}
        >
          <label>
            Link name
            <input
              aria-label="Artifact link name"
              maxLength={180}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design file, brief, or reference"
            />
          </label>
          <label>
            URL
            <input
              aria-label="Artifact URL"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              maxLength={2048}
            />
          </label>
          <button
            ref={linkSubmit}
            type="button"
            className="button secondary"
            disabled={!online || busy || !name.trim() || !url.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const id = await run(
                  () =>
                    dispatch({
                      type: "attach_link",
                      id: taskId,
                      name: name.trim(),
                      url: url.trim(),
                      placement,
                    }),
                  "Link attached",
                );
                if (id) {
                  onAdded?.(id);
                  setName("");
                  setUrl("");
                  setLinkOpen(false);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus size={14} />
            Attach link
          </button>
          <p>
            Paste a Google Drive or other HTTPS link. Access stays controlled by
            the source.
          </p>
        </div>
      )}
    </div>
  );
}
export function TaskArtifacts({
  task,
  placement,
}: {
  task: Task;
  placement: "description" | "task";
}) {
  const { state } = useData();
  const artifacts = (state.artifacts ?? []).filter(
    (a) => a.taskId === task.id && a.placement === placement && !a.removedAt,
  );
  if (placement === "task" && !artifacts.length) return null;
  return (
    <section
      className={"task-artifacts " + placement}
      aria-label={
        placement === "description"
          ? "Description attachments"
          : "Task artifacts"
      }
    >
      {placement === "task" && (
        <div className="section-line">
          <h2>Artifacts</h2>
          <span className="count">{artifacts.length}</span>
        </div>
      )}
      {artifacts.length > 0 && (
        <div className="artifact-grid">
          {artifacts.map((a) => (
            <ArtifactItem key={a.id} artifact={a} removable />
          ))}
        </div>
      )}
      <ArtifactActions taskId={task.id} placement={placement} />
    </section>
  );
}

function CommentComposer({ task }: { task: Task }) {
  const { state, actorId, dispatch, uploadArtifact, online } = useData(),
    { run, notify } = useUI();
  const [body, setBody] = useState(""),
    [mentions, setMentions] = useState<Mention[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [attached, setAttached] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    author = state.members.find((m) => m.id === actorId);
  return (
    <form
      className="task-comment-composer"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || (!body.trim() && !files.length && !attached.length)) return;
        setBusy(true);
        try {
          const result = await run(async () => {
            const ids = [...attached];
            for (const file of files) {
              const id = await uploadArtifact(task.id, file, "task");
              ids.push(id);
              setAttached([...ids]);
              setFiles((current) => current.filter((f) => f !== file));
            }
            return dispatch({
              type: "comment",
              id: task.id,
              body,
              mentions,
              attachmentIds: ids,
            });
          }, "Comment posted");
          if (result) {
            setBody("");
            setMentions([]);
            setFiles([]);
            setAttached([]);
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <Avatar name={author?.name ?? "You"} color={author?.color} small />
      <div className="comment-compose-body">
        <MentionInput
          label="Add a comment"
          hideHint
          placeholder="Write a comment… @mention a teammate"
          value={body}
          mentions={mentions}
          onChange={(text, mentions) => {
            setBody(text);
            setMentions(mentions);
          }}
          members={taskPeople(state, task.projectId)}
          disabled={busy}
        />
        {(files.length > 0 || attached.length > 0) && (
          <div
            className="comment-pending-files"
            aria-label="Comment attachments"
          >
            {files.map((file, index) => (
              <span key={index}>
                <Paperclip size={13} />
                <span>{file.name}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove pending file ${file.name}`}
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {attached.map((id) => (
              <span key={id}>
                <Paperclip size={13} />
                {state.artifacts?.find((a) => a.id === id)?.name ??
                  "Attached file"}
              </span>
            ))}
          </div>
        )}
        <div className="comment-compose-actions">
          <input
            ref={input}
            className="sr-only"
            hidden
            type="file"
            multiple
            aria-label="Attach files to comment"
            disabled={busy || !online}
            onChange={(e) => {
              const selected = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              try {
                if (files.length + attached.length + selected.length > 10)
                  throw new Error("Attach up to 10 files per comment.");
                selected.forEach((f) => checkFile(f.name, f.size, f.type));
                setFiles([...files, ...selected]);
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Choose another file.",
                  true,
                );
              }
            }}
          />
          <button
            type="button"
            className="text-button"
            disabled={!online || busy}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={15} />
            Attach files
          </button>
          <button
            className="button primary"
            disabled={
              !online ||
              busy ||
              (!body.trim() && !files.length && !attached.length)
            }
          >
            <Send size={14} />
            {busy ? "Posting…" : "Post comment"}
          </button>
        </div>
      </div>
    </form>
  );
}
function ActivityRows({ events }: { events: Activity[] }) {
  const { state } = useData();
  const commentedAttachments = new Set(
    events
      .filter((event) => event.kind === "comment")
      .flatMap((event) => event.attachmentIds ?? []),
  );
  const visibleEvents = events.filter(
    (event) =>
      !(
        event.kind === "change" &&
        !event.toStatus &&
        /^(Uploaded|Attached) /.test(event.message) &&
        event.attachmentIds?.length &&
        event.attachmentIds.every((id) => commentedAttachments.has(id))
      ),
  );
  return (
    <ol className="task-conversation-list">
      {visibleEvents.map((event) => {
        const author = state.members.find((m) => m.id === event.actorId);
        return (
          <li
            key={event.id}
            className={"task-conversation-event " + event.kind}
          >
            {event.kind === "comment" ? (
              <Avatar
                name={author?.name ?? "Former teammate"}
                color={author?.color}
                small
              />
            ) : (
              <span className="activity-system-icon">
                <CircleDot size={16} />
              </span>
            )}
            <div>
              <div className="comment-byline">
                <strong>{author?.name ?? "Former teammate"}</strong>
                <time
                  dateTime={new Date(event.at).toISOString()}
                  title={new Date(event.at).toLocaleString()}
                >
                  {new Date(event.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {event.toStatus ? (
                <div className="activity-status-update">
                  <span>
                    {event.fromStatus
                      ? "changed the status"
                      : "created the task"}
                  </span>
                  <div>
                    {event.fromStatus && (
                      <>
                        <span
                          className="activity-stage"
                          data-status={event.fromStatus}
                        >
                          <i
                            style={{
                              background: stageColors[event.fromStatus],
                            }}
                          />
                          {statusLabels[event.fromStatus]}
                        </span>
                        <ArrowRight size={13} />
                      </>
                    )}
                    <span
                      className="activity-stage"
                      data-status={event.toStatus}
                    >
                      <i style={{ background: stageColors[event.toStatus] }} />
                      {statusLabels[event.toStatus]}
                    </span>
                  </div>
                  {event.message !== "Updated task" &&
                    event.message !== "Created task" && <p>{event.message}</p>}
                </div>
              ) : (
                event.message && (
                  <p>
                    <MentionText
                      text={event.message}
                      mentions={event.mentions}
                      members={state.members}
                    />
                  </p>
                )
              )}
              {!!event.attachmentIds?.length && (
                <div className="artifact-grid">
                  {event.attachmentIds.map((id) => {
                    const artifact = state.artifacts?.find(
                      (a) => a.id === id && a.taskId === event.taskId,
                    );
                    return artifact && !artifact.removedAt ? (
                      <ArtifactItem key={id} artifact={artifact} />
                    ) : (
                      <span key={id} className="removed-artifact">
                        Attachment removed
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
function LiveActivity({ taskId }: { taskId: string }) {
  const { state, workspaceId } = useData();
  const { results, status, loadMore } = usePaginatedQuery(
    api.files.activity,
    {
      workspaceId: (state.resourceTeams?.[taskId] ??
        workspaceId) as Id<"workspaces">,
      taskId,
    },
    { initialNumItems: 50 },
  );
  return (
    <>
      <ActivityRows events={results} />
      {!results.length && status !== "LoadingFirstPage" && (
        <p className="muted">No activity yet.</p>
      )}
      {status === "LoadingFirstPage" && (
        <p className="muted">Loading activity…</p>
      )}
      {status === "CanLoadMore" && (
        <button
          type="button"
          className="text-button"
          onClick={() => loadMore(50)}
        >
          Load earlier activity
        </button>
      )}
    </>
  );
}
export function TaskActivity({ task }: { task: Task }) {
  const { demo, state } = useData();
  const events = state.activities
    .filter((event) => event.taskId === task.id)
    .sort((a, b) => b.at - a.at);
  return (
    <section className="task-activity" aria-label="Task activity">
      <div className="section-title-group">
        <h2>Activity</h2>
        <InfoTip label="About task activity">
          Comments, attachments, and timestamped changes appear here. Type @ in
          a comment to mention a teammate; they are notified when you post.
        </InfoTip>
      </div>
      <CommentComposer key={task.id} task={task} />
      {demo ? (
        <>
          <ActivityRows events={events} />
          {!events.length && <p className="muted">No activity yet.</p>}
        </>
      ) : (
        <LiveActivity taskId={task.id} />
      )}
    </section>
  );
}
