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
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Activity, Task, TaskArtifact } from "../shared/model";
import { checkFile, fileSize } from "../shared/artifacts";
import { canEditTask } from "../shared/workflow";
import { useData } from "./data";
import { Avatar, useUI } from "./components";
import { TaskHistory } from "./TaskHistory";

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
              body: body.trim(),
              attachmentIds: ids,
            });
          }, "Comment posted");
          if (result) {
            setBody("");
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
        <textarea
          aria-label="Add a comment"
          placeholder="Share an update or ask a question…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={3}
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
  return (
    <ol className="task-conversation-list">
      {events.map((event) => {
        const author = state.members.find((m) => m.id === event.actorId);
        return (
          <li
            key={event.id}
            className={"task-conversation-event " + event.kind}
          >
            <Avatar
              name={author?.name ?? "Former teammate"}
              color={author?.color}
              small
            />
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
              {event.message && <p>{event.message}</p>}
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
function LiveActivity({
  taskId,
  comments,
}: {
  taskId: string;
  comments: boolean;
}) {
  const { state, workspaceId } = useData();
  const { results, status, loadMore } = usePaginatedQuery(
    api.files.activity,
    {
      workspaceId: (state.resourceTeams?.[taskId] ??
        workspaceId) as Id<"workspaces">,
      taskId,
      ...(comments ? { kind: "comment" as const } : {}),
    },
    { initialNumItems: 50 },
  );
  const events = comments
    ? results.filter((e) => e.kind === "comment")
    : results;
  return (
    <>
      <ActivityRows events={events} />
      {!events.length && status !== "LoadingFirstPage" && (
        <p className="muted">
          {comments
            ? "No comments yet. Start the conversation."
            : "Updates will appear here."}
        </p>
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
export function TaskConversation({ task }: { task: Task }) {
  const { demo, state } = useData(),
    [view, setView] = useState<"activity" | "comments">("activity");
  const events = state.activities
    .filter(
      (e) =>
        e.taskId === task.id && (view === "activity" || e.kind === "comment"),
    )
    .sort((a, b) => b.at - a.at);
  return (
    <section className="task-conversation" aria-label="Task conversation">
      <div className="task-conversation-heading">
        <h2>Conversation</h2>
        <div role="tablist" aria-label="Task discussion views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "activity"}
            onClick={() => setView("activity")}
          >
            Activity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "comments"}
            onClick={() => setView("comments")}
          >
            Comments
          </button>
        </div>
      </div>
      <CommentComposer key={task.id} task={task} />
      <div
        role="tabpanel"
        aria-label={view === "activity" ? "Task activity" : "Task comments"}
      >
        {demo ? (
          <>
            <ActivityRows events={events} />
            {!events.length && (
              <p className="muted">
                {view === "comments"
                  ? "No comments yet. Start the conversation."
                  : "Updates will appear here."}
              </p>
            )}
          </>
        ) : (
          <LiveActivity taskId={task.id} comments={view === "comments"} />
        )}
      </div>
      {view === "activity" && (
        <details className="task-status-history">
          <summary>Detailed status history</summary>
          <TaskHistory taskId={task.id} />
        </details>
      )}
    </section>
  );
}
