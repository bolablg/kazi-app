import { ConvexError } from "convex/values";
import {
  hasServiceAccessClaim,
  permitsService,
  serviceAccessFromClaims,
} from "../shared/serviceAccess";

/** Compatibility is a rollout state, never permission to create the reviewer. */
export function serviceAccessMode(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.KAZI_SERVICE_ACCESS_MODE;
  if (mode !== "compat" && mode !== "strict")
    throw new ConvexError({
      code: "SERVICE_ACCESS_CONFIG",
      message: "The service access configuration needs attention.",
    });
  return mode;
}

export function assertCentralServiceEligibility(
  claims: Record<string, unknown>,
  subject: string,
  representation: "jwt" | "convex",
) {
  if (serviceAccessMode() === "compat" && !hasServiceAccessClaim(claims))
    return;
  const access = serviceAccessFromClaims(claims, subject, representation);
  if (!permitsService(access, "kazi"))
    throw new ConvexError({
      code: "SERVICE_NOT_ALLOWED",
      message: "This iYANJU account is not authorized to use Kazi.",
    });
}
