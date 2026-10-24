import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "bounded deadline and outbox reconciliation",
  { minutes: 1 },
  internal.jobs.tick,
  {},
);
export default crons;
