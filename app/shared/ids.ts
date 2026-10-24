import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** Stable, namespaced 128-bit identifiers for deterministic internal records. */
export function stableId(namespace: string, ...parts: (string | number)[]) {
  return bytesToHex(
    sha256(utf8ToBytes(JSON.stringify(["kazi-id/1", namespace, ...parts]))),
  ).slice(0, 32);
}
/** Convex supplies the seeded strong PRNG used by transactional commands. */
export function transactionId() {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0"),
  ).join("");
}
export function browserId() {
  return crypto.randomUUID().replaceAll("-", "");
}
export function isOpaqueId(id: string) {
  return (
    /^[a-z0-9]{24,64}$/.test(id) ||
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
  );
}
export const projectPath = (id: string) => `/project/${encodeURIComponent(id)}`;
export const taskPath = (task: { id: string; projectId: string }) =>
  `${projectPath(task.projectId)}/task/${encodeURIComponent(task.id)}`;
export const standaloneTaskPath = (id: string) =>
  `/task/${encodeURIComponent(id)}`;
export const planPath = (id: string, revision?: number) =>
  `/plan/${encodeURIComponent(id)}${revision === undefined ? "" : `?revision=${revision}`}`;
