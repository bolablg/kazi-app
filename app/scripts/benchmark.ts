import { cpus, platform, arch } from "node:os";
import { writeFileSync } from "node:fs";
import { allocate, MINUTE, localInstant } from "../shared/scheduler";
import { seedState } from "../shared/fixtures";
import { defaults } from "../shared/model";
const now = Date.parse("2026-10-26T13:00:00Z"),
  s = seedState(now);
const tasks = Array.from({ length: 100 }, (_, i) => ({
  ...s.tasks[0],
  id: "benchmark-" + i,
  assigneeId: s.members[i % 3].id,
  status: "todo" as const,
  remainingMinutes: 45,
  deadline: "2026-11-06",
  dependencies: [],
}));
const input = {
  tasks,
  busy: s.members.flatMap((m) => [
    {
      ownerId: m.id,
      start: localInstant("2026-10-26", 12, defaults.timezone),
      end: localInstant("2026-10-26", 13, defaults.timezone),
    },
  ]),
  preferences: Object.fromEntries(s.members.map((m) => [m.id, defaults])),
  startDate: "2026-10-26",
  days: 14,
  now,
};
const samples: number[] = [];
let result = allocate(input);
for (let i = 0; i < 25; i++) {
  const start = performance.now();
  result = allocate(input);
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const report = {
  date: new Date().toISOString(),
  node: process.version,
  platform: platform() + " " + arch(),
  cpu: cpus()[0]?.model,
  tasks: 100,
  people: 3,
  samples: 25,
  meanMs: Number(
    (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2),
  ),
  p95Ms: Number(samples[23].toFixed(2)),
  maxMs: Number(samples.at(-1)!.toFixed(2)),
  scheduledMinutes: result.scheduledMinutes,
  unscheduledMinutes: result.remainingMinutes,
  providerNetworkExcluded: true,
};
writeFileSync("../docs/benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
