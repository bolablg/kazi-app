import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { HmrContext, ViteDevServer } from "vite";
import { developmentReload } from "../scripts/development-reload";

afterEach(() => vi.useRealTimers());

function setup(enabled = true) {
  const send = vi.fn();
  const close = new EventEmitter();
  const server = {
    ws: { send },
    httpServer: close,
  } as unknown as ViteDevServer;
  const plugin = developmentReload(enabled);
  (plugin.configureServer as (server: ViteDevServer) => void)(server);
  const change = (file: string) =>
    (plugin.handleHotUpdate as (ctx: HmrContext) => unknown)({
      file,
      server,
    } as HmrContext);
  return { send, close, change };
}

it("replaces partial hot updates with one automatic reload after an edit batch", () => {
  vi.useFakeTimers();
  const { send, change } = setup();
  expect(change("/kazi/app/src/LoadingScreen.tsx")).toEqual([]);
  vi.advanceTimersByTime(100);
  expect(change("/kazi/app/shared/model.ts")).toEqual([]);
  vi.advanceTimersByTime(199);
  expect(send).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: "full-reload",
    path: "*",
  });
});

it("leaves other modes and unrelated files alone and cancels reloads on server close", () => {
  vi.useFakeTimers();
  const disabled = setup(false);
  expect(disabled.change("/kazi/app/src/App.tsx")).toBeUndefined();
  const active = setup();
  expect(active.change("/kazi/docs/WORKFLOW.md")).toBeUndefined();
  active.change("/kazi/app/src/style.css");
  active.close.emit("close");
  vi.runAllTimers();
  expect(disabled.send).not.toHaveBeenCalled();
  expect(active.send).not.toHaveBeenCalled();
});
