import { expect, it } from "vitest";
import { prefersMcpEventStream } from "../shared/mcpTransport";

it.each([
  null,
  "",
  "*/*",
  "application/json",
  "application/json, text/event-stream",
])("keeps JSON as the default for %s", (accept) =>
  expect(prefersMcpEventStream(accept)).toBe(false),
);

it.each([
  ["text/event-stream, application/json", true],
  ["text/event-stream;q=0.8, application/json;q=0.8", true],
  ["application/json;q=0.8, text/event-stream;q=0.8", false],
  ["application/json;q=0.5, text/event-stream;q=0.9", true],
  ["text/event-stream;q=0.5, application/json;q=0.9", false],
  ["application/json;q=0, text/event-stream;q=0.1", true],
  ["text/event-stream;q=0, application/json;q=0", false],
  ["text/event-stream;q=0, application/json", false],
  [
    "application/json;q=0.8, text/event-stream;q=0.4, text/event-stream;q=0.9",
    true,
  ],
  ['application/json;note="a,b", text/event-stream', false],
  ['text/event-stream;note="a;q=0,b";q=0.8, application/json;q=0.5', true],
  ["text/event-stream; Q = 0.9, application/json;q=0.5", true],
] as const)("negotiates response preference for %s", (accept, expected) => {
  expect(prefersMcpEventStream(accept)).toBe(expected);
});

it.each(["invalid", "", "-0.1", "1.1", "0.1234", ".5", '"1"', "1;q=0.8"])(
  "does not enable SSE for invalid quality %s",
  (quality) =>
    expect(
      prefersMcpEventStream(
        `text/event-stream;q=${quality}, application/json;q=0.5`,
      ),
    ).toBe(false),
);

it("does not treat a malformed quality parameter as default quality", () => {
  expect(
    prefersMcpEventStream("text/event-stream;q, application/json;q=0.5"),
  ).toBe(false);
});

it("keeps malformed quoted parameters from enabling SSE", () => {
  expect(
    prefersMcpEventStream(
      'text/event-stream;note="unterminated, application/json',
    ),
  ).toBe(false);
});
