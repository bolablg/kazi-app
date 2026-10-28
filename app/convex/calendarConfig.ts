import { ConvexError } from "convex/values";

export function calendarOrigin() {
  const configured = process.env.APP_ORIGIN || process.env.CONVEX_SITE_URL;
  try {
    const url = new URL(configured ?? "");
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    if (url.protocol === "https:") return url.origin;
    // Local calendar clients reach the backend directly, without Vercel routing.
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      const backend = new URL(process.env.CONVEX_SITE_URL ?? "");
      if (
        !backend.username &&
        !backend.password &&
        backend.pathname === "/" &&
        !backend.search &&
        !backend.hash &&
        (backend.protocol === "https:" ||
          (backend.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)))
      )
        return backend.origin;
    }
  } catch {
    // Do not expose configuration values in a client error.
  }
  throw new ConvexError(
    "Calendar links are unavailable. Ask the app administrator to configure the application address.",
  );
}

export const googleCallbackUrl = () => `${calendarOrigin()}/google/callback`;

export function requireGoogleCalendar() {
  let validKey = false;
  try {
    validKey = atob(process.env.TOKEN_ENCRYPTION_KEY ?? "").length === 32;
  } catch {
    // Invalid encryption configuration must fail before asking for consent.
  }
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !validKey ||
    !process.env.APP_ORIGIN
  )
    throw new ConvexError(
      "Google Calendar setup is incomplete. The app administrator needs to configure Google Calendar before you can connect.",
    );
  return googleCallbackUrl();
}
