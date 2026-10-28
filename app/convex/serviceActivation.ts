import { v } from "convex/values";
import { httpAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { identityConfig } from "./identityConfig";
import { boundAuthenticatedClaims, canonicalActor } from "./identityCore";
import { assertCentralServiceEligibility } from "./serviceEligibility";
import {
  serviceActivationHeaders,
  type ServiceActivationSummary,
} from "../shared/serviceActivation";

function summarySettings() {
  const config = identityConfig();
  if (config.mode !== "shared" || config.environment === "preview")
    throw new Error("Service summary unavailable");
  const production = config.environment === "production";
  if (
    config.centralIssuer !==
    (production
      ? "https://clerk.iyanju.com"
      : "https://funky-monitor-8635.clerk.accounts.dev")
  )
    throw new Error("Service summary unavailable");
  return {
    config,
    environment: production
      ? ("production" as const)
      : ("development" as const),
    rootOrigin: production ? "https://iyanju.com" : "http://127.0.0.1:49569",
  };
}

export const forCentralOwner = internalQuery({
  args: { issuer: v.string(), subject: v.string() },
  handler: async (ctx, args): Promise<ServiceActivationSummary> => {
    const { config, environment } = summarySettings();
    if (args.issuer !== config.centralIssuer)
      throw new Error("Service summary unavailable");
    const actorId = await canonicalActor(ctx, {
      config,
      provider: "central",
      issuer: args.issuer,
      subject: args.subject,
      identity: {
        issuer: args.issuer,
        subject: args.subject,
        tokenIdentifier: args.issuer + "|" + args.subject,
      },
    });
    const record = actorId
      ? await ctx.db
          .query("serviceActivations")
          .withIndex("by_identity", (q) =>
            q
              .eq("environment", environment)
              .eq("serviceId", "kazi")
              .eq("actorId", actorId),
          )
          .unique()
      : null;
    return {
      version: 1,
      serviceId: "kazi",
      environment,
      activation: record
        ? {
            activatedAt: record.activatedAt,
            firstObservedAt: record.firstObservedAt,
          }
        : null,
    };
  },
});

function failure(status: number) {
  return Response.json(
    {
      error:
        status === 503
          ? "Service summary unavailable"
          : "Authentication required",
    },
    { status, headers: serviceActivationHeaders },
  );
}

/** Dedicated root-account read. Root origin is never added to normal Kazi API trust. */
export const summary = httpAction(async (ctx, request) => {
  if (new URL(request.url).search) return failure(400);
  let settings: ReturnType<typeof summarySettings>;
  try {
    settings = summarySettings();
  } catch {
    return failure(503);
  }
  const { config, rootOrigin } = settings;
  if (
    !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      request.headers.get("Authorization") ?? "",
    )
  )
    return failure(401);
  try {
    const identity = await ctx.auth.getUserIdentity();
    const metadata = await ctx.meta.getRequestMetadata();
    if (
      !identity ||
      !identity.subject ||
      identity.subject.length > 180 ||
      !metadata.authToken ||
      identity.issuer !== config.centralIssuer
    )
      return failure(401);
    let claims: Record<string, unknown>;
    try {
      claims = boundAuthenticatedClaims(metadata.authToken, identity);
    } catch {
      return failure(401);
    }
    try {
      assertCentralServiceEligibility(claims, identity.subject, "jwt");
    } catch {
      return failure(403);
    }
    if (
      claims.azp !== rootOrigin ||
      typeof claims.sid !== "string" ||
      !claims.sid ||
      claims.sid.length > 256 ||
      claims.client_id !== undefined ||
      (request.headers.has("Origin") &&
        request.headers.get("Origin") !== rootOrigin)
    )
      return failure(403);
    const result: ServiceActivationSummary = await ctx.runQuery(
      internal.serviceActivation.forCentralOwner,
      { issuer: identity.issuer, subject: identity.subject },
    );
    return Response.json(result, { headers: serviceActivationHeaders });
  } catch {
    return failure(503);
  }
});
