import { useState, useRef, useLayoutEffect, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { Clock3, GripVertical, Plus } from "lucide-react";
import { statusLabels, taskWorkflow, type Task } from "../shared/model";
import { canEditTask } from "../shared/workflow";
import { useData } from "./data";
import { cx, dueLabel, duration, useUI, Avatar } from "./components";
import { TaskLabels } from "./TaskLabels";
const statuses = taskWorkflow;
const cardTitle = (title: string) =>
  Array.from(title).length > 96
    ? Array.from(title).slice(0, 95).join("").trimEnd() + "…"
    : title;
const coordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.code)) return;
  event.preventDefault();
  const current = String(
    context.over?.id ?? context.active?.data.current?.status,
  );
  const index = statuses.indexOf(current as (typeof statuses)[number]);
  const next = statuses[index + (event.code === "ArrowRight" ? 1 : -1)];
  const target = next && context.droppableRects.get(next),
    source = context.collisionRect;
  if (!target || !source) return currentCoordinates;
  context.droppableContainers
    .get(next)
    ?.node.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  return {
    x:
      currentCoordinates.x +
      target.left -
      source.left +
      (target.width - source.width) / 2,
    y: currentCoordinates.y + target.top - source.top + 65,
  };
};
export function TaskBoard({
  tasks,
  openTask,
  addTask,
  readOnly = false,
  addTaskLabel = "Add task",
}: {
  tasks: Task[];
  openTask: (id: string) => void;
  addTask?: () => void;
  readOnly?: boolean;
  addTaskLabel?: string;
}) {
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI();
  const [active, setActive] = useState<string>(),
    [saving, setSaving] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const resize = () =>
      element.style.setProperty(
        "--board-height",
        `${Math.round(Math.max(280, Math.min(520, window.innerHeight - element.getBoundingClientRect().top - 24)))}px`,
      );
    resize();
    const container = element.closest(".main-area") ?? element;
    let lastWidth = 0;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(resize);
      }
    });
    observer.observe(container);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordinates }),
  );
  const movable = (t: Task) =>
    !readOnly && online && !saving && canEditTask(state, t, actorId);
  const move = async (task: Task, status: Task["status"]) => {
    if (!movable(task) || task.status === status) return;
    setSaving(true);
    try {
      await run(
        () => dispatch({ type: "update_task", id: task.id, patch: { status } }),
        status === "archived"
          ? "Task archived"
          : `Moved to ${statusLabels[status]}`,
      );
    } finally {
      setSaving(false);
    }
  };
  const dragging = tasks.find((t) => t.id === active);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
      }
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up the task. Use Left and Right to choose a status column. Press Space to drop, or Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${active.data.current?.title ?? "task"}.`,
          onDragOver: ({ over }) =>
            over
              ? `Move to ${statusLabels[over.id as Task["status"]]}.`
              : "Outside a status column.",
          onDragEnd: ({ over }) =>
            over
              ? `Dropped in ${statusLabels[over.id as Task["status"]]}.`
              : "Move canceled.",
          onDragCancel: () => "Move canceled.",
        },
      }}
      onDragStart={({ active }) => setActive(String(active.id))}
      onDragCancel={() => setActive(undefined)}
      onDragEnd={async ({ active, over }) => {
        setActive(undefined);
        const task = tasks.find((t) => t.id === active.id),
          status = over?.id as Task["status"];
        if (
          !task ||
          !over ||
          !statuses.includes(status as (typeof statuses)[number]) ||
          task.status === status ||
          !movable(task)
        )
          return;
        await move(task, status);
      }}
    >
      <div
        ref={boardRef}
        className="task-board-scroll"
        tabIndex={0}
        role="region"
        aria-label="Task board, scroll horizontally for more stages"
      >
        <div className="board" aria-label="Task workflow">
          {statuses.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              count={tasks.filter((t) => t.status === status).length}
            >
              <div className="board-column-cards">
                {tasks
                  .filter((t) => t.status === status)
                  .map((t) => (
                    <BoardTask
                      key={t.id}
                      task={t}
                      owner={
                        state.members.find((m) => m.id === t.assigneeId)
                          ?.name ?? "Unassigned"
                      }
                      color={
                        state.members.find((m) => m.id === t.assigneeId)?.color
                      }
                      movable={movable(t)}
                      openTask={openTask}
                    />
                  ))}
              </div>
              {status === "todo" && !readOnly && addTask && (
                <button className="add-inline" onClick={addTask}>
                  <Plus size={15} />
                  {addTaskLabel}
                </button>
              )}
            </BoardColumn>
          ))}
        </div>
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="board-drag-preview">
            <strong className="board-task-title">
              {cardTitle(dragging.title)}
            </strong>
            <span>Move to another status</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
function BoardColumn({
  status,
  count,
  children,
}: {
  status: Task["status"];
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cx("board-column", isOver && "drop-target")}
      aria-label={`${statusLabels[status]} column`}
      data-status={status}
    >
      <h3>
        <span className={"status-dot " + status} />
        {statusLabels[status]}
        <span>{count}</span>
      </h3>
      {children}
    </section>
  );
}
function BoardTask({
  task,
  owner,
  color,
  movable,
  openTask,
}: {
  task: Task;
  owner: string;
  color?: string;
  movable: boolean;
  openTask: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({
      id: task.id,
      disabled: !movable,
      data: { status: task.status, title: task.title },
    });
  return (
    <article
      ref={setNodeRef}
      className={cx(
        "board-task",
        "draggable-board-task",
        isDragging && "dragging",
      )}
      {...listeners}
    >
      <button
        className="board-task-open"
        onClick={() => openTask(task.id)}
        aria-label={task.title}
      >
        <strong className="board-task-title" title={task.title}>
          {cardTitle(task.title)}
        </strong>
        <TaskLabels labels={task.labels} />
        <span className={"board-priority " + task.priority}>
          {task.priority} priority
        </span>
        <span className="board-task-meta">
          <span>
            <Clock3 size={12} />
            {task.remainingMinutes === undefined &&
            task.estimatedMinutes === undefined
              ? "—"
              : duration(task.remainingMinutes ?? task.estimatedMinutes ?? 0)}
          </span>
          <span>{dueLabel(task.deadline)}</span>
        </span>
        <span className="board-owner" aria-label={"Worker: " + owner}>
          <Avatar name={owner} color={color} small />
          {task.brainstorm && <span className="task-label">To Brainstorm</span>}
        </span>
      </button>
      <button
        ref={setActivatorNodeRef}
        className="board-drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${task.title}`}
        title="Drag to another status. Keyboard: Space, Left/Right, Space."
        disabled={!movable}
      >
        <GripVertical size={16} />
      </button>
    </article>
  );
}
