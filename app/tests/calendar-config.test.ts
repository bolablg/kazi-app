import { afterEach, expect, it, vi } from "vitest";
import {
  calendarOrigin,
  requireGoogleCalendar,
} from "../convex/calendarConfig";
afterEach(() => vi.unstubAllEnvs());

it.each([
  [
    "https://kazi.iyanju.com/",
    "https://production-fixture.convex.site",
    "https://kazi.iyanju.com",
  ],
  [
    "https://kazi-git-branch.vercel.app",
    "https://branch-fixture.convex.site",
    "https://kazi-git-branch.vercel.app",
  ],
  ["http://127.0.0.1:5173", "http://127.0.0.1:3211", "http://127.0.0.1:3211"],
  [
    "http://localhost:5173",
    "https://dev-fixture.convex.site",
    "https://dev-fixture.convex.site",
  ],
])(
  "uses the matching public calendar origin for %s",
  (app, backend, expected) => {
    vi.stubEnv("APP_ORIGIN", app);
    vi.stubEnv("CONVEX_SITE_URL", backend);
    expect(calendarOrigin()).toBe(expected);
  },
);

it.each([
  "https://user:password@kazi.example",
  "https://kazi.example/subpath",
  "https://kazi.example?other=value",
  "http://kazi.example",
])("rejects invalid application origin %s", (app) => {
  vi.stubEnv("APP_ORIGIN", app);
  expect(() => calendarOrigin()).toThrow("Calendar links are unavailable");
});

it.each(["not-base64!", btoa("short")])(
  "checks the encryption key before starting Google consent",
  (key) => {
    vi.stubEnv("APP_ORIGIN", "https://kazi.example");
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", key);
    expect(() => requireGoogleCalendar()).toThrow("setup is incomplete");
  },
);
