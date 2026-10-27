import {
  boundedJson,
  parseServiceActivation,
  serviceActivationHeaders,
} from "../shared/serviceActivation.js";

export function unavailableServiceActivation(status = 503) {
  return Response.json(
    { error: "Service summary unavailable" },
    { status, headers: serviceActivationHeaders },
  );
}

/** The target comes only from the existing selected-backend manifest. */
export function createServiceActivationProxy(
  mcpTarget: string,
  environment: "development" | "production",
  fetchUpstream: typeof fetch = fetch,
) {
  const backend = new URL(mcpTarget);
  if (
    backend.username ||
    backend.password ||
    backend.pathname !== "/mcp" ||
    backend.search ||
    backend.hash ||
    !(
      (backend.protocol === "https:" &&
        !backend.port &&
        /^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site$/.test(backend.hostname)) ||
      (environment === "development" &&
        backend.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(backend.hostname))
    )
  )
    throw new Error("Service summary requires the selected Convex backend");
  backend.pathname = "/account/service-activation";
  return async (request: Request) => {
    if (request.method !== "GET") {
      const response = unavailableServiceActivation(405);
      response.headers.set("Allow", "GET");
      return response;
    }
    if (new URL(request.url).search) return unavailableServiceActivation(400);
    const authorization = request.headers.get("Authorization");
    if (
      !authorization ||
      authorization.length > 16400 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization,
      )
    )
      return unavailableServiceActivation(401);
    try {
      const response = await fetchUpstream(backend.href, {
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(4000)]),
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        return unavailableServiceActivation(
          [401, 403].includes(response.status) ? response.status : 503,
        );
      }
      const summary = parseServiceActivation(
        await boundedJson(response),
        environment,
      );
      return summary
        ? Response.json(summary, { headers: serviceActivationHeaders })
        : unavailableServiceActivation();
    } catch {
      return unavailableServiceActivation();
    }
  };
}
