export const taskLabelKey = (label: string) =>
  label.trim().normalize("NFKC").toLocaleLowerCase("en-US");

export function normalizeTaskLabels(labels: string[]) {
  const unique = new Map<string, string>();
  for (const label of labels) {
    const name = label.trim();
    if (name && !unique.has(taskLabelKey(name)))
      unique.set(taskLabelKey(name), name);
  }
  return [...unique.values()];
}

export const parseTaskLabels = (value: string) =>
  normalizeTaskLabels(value.split(","));
