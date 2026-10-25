import { useState } from "react";
import type { Task } from "../shared/model";
import { canEditTask } from "../shared/workflow";
import { useData } from "./data";
import { Empty, TaskRows, useUI } from "./components";

export function TaskArchive({
  tasks,
  openTask,
  expanded = false,
}: {
  expanded?: boolean;
  tasks: Task[];
  openTask: (id: string) => void;
}) {
  const [open, setOpen] = useState(expanded);
  const { state, actorId, dispatch, online } = useData(),
    { run } = useUI();
  return (
    <details
      className="task-archive"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Archived <span>{tasks.length}</span>
      </summary>
      {open && (
        <div>
          {tasks.length ? (
            tasks.map((task) => (
              <div className="archived-task" key={task.id}>
                <TaskRows tasks={[task]} onOpen={openTask} />
                <button
                  className="button secondary"
                  aria-label={`Restore ${task.title}`}
                  disabled={!online || !canEditTask(state, task, actorId)}
                  onClick={() =>
                    run(
                      () =>
                        dispatch({
                          type: "update_task",
                          id: task.id,
                          patch: { status: "backlog" },
                        }),
                      "Restored to Backlog",
                    )
                  }
                >
                  Restore
                </button>
              </div>
            ))
          ) : (
            <Empty
              title="Nothing archived"
              body="Archived tasks stay here until you restore them."
            />
          )}
        </div>
      )}
    </details>
  );
}
