import { useAuth, useReverification } from "@clerk/react";
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { ConvexError } from "convex/values";

const sessionConfigurationMessage =
  "Account linking is temporarily unavailable because the sign-in connection needs attention. Please contact support.";
export class IdentitySessionConfigurationError extends Error {
  constructor() {
    super(sessionConfigurationMessage);
    this.name = "IdentitySessionConfigurationError";
  }
}

export function identityErrorCode(error: unknown): string | null {
  if (
    error instanceof ConvexError &&
    error.data &&
    typeof error.data === "object"
  ) {
    const data = error.data as { code?: unknown };
    return typeof data.code === "string" ? data.code : null;
  }
  return null;
}
export function identityErrorMessage(error: unknown) {
  const code = identityErrorCode(error);
  if (
    error instanceof IdentitySessionConfigurationError ||
    (code === "REVERIFICATION_REQUIRED" && !canReverify(error))
  )
    return sessionConfigurationMessage;
  if (code === "REVERIFICATION_REQUIRED")
    return "Verify your sign-in again, then retry linking.";
  if (code === "IDENTITY_LINK" || code === "IDENTITY_LINK_USED")
    return "This account-link request has expired or was already used. Start again.";
  if (
    code === "IDENTITY_LINKED" ||
    code === "IDENTITY_CONFLICT" ||
    code === "IDENTITY_REGISTERED"
  )
    return "One of these accounts is already linked. Your existing Kazi data is unchanged.";
  if (code === "IDENTITY_UNLINKED")
    return "Link your existing Kazi account or choose a new personal workspace.";
  if (code === "IDENTITY_LINK_LIMIT")
    return "Finish an existing link request or wait five minutes before trying again.";
  if (code === "IDENTITY_DISABLED")
    return "Account linking is not available in this environment.";
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "reverification_cancelled"
  )
    return "Verification was cancelled. Your accounts have not been linked.";
  return "We could not complete this request. Please try again.";
}

export const reverificationHint = {
  clerk_error: {
    type: "forbidden",
    reason: "reverification-error",
    metadata: {
      reverification: { level: "multi_factor", afterMinutes: 10 },
    },
  },
} as const;

function canReverify(error: unknown) {
  if (identityErrorCode(error) !== "REVERIFICATION_REQUIRED") return false;
  const data = (error as ConvexError<{ reason?: string }>).data;
  // Older deployed backends returned only the code. New backends distinguish
  // stale factors from missing session proof; only stale proof can be refreshed
  // by asking the user to verify again.
  return (
    !Object.hasOwn(data, "reason") ||
    data.reason === "factor_age_stale_or_invalid"
  );
}
export function identityVerificationFailure(error: unknown) {
  if (identityErrorCode(error) !== "REVERIFICATION_REQUIRED") throw error;
  if (!canReverify(error)) throw new IdentitySessionConfigurationError();
  return reverificationHint;
}

type IdentityFunction = FunctionReference<"action" | "mutation", "public">;
/** A fresh JWT is installed on this request's transport, never passed as data. */
export async function freshIdentityRequest<F extends IdentityFunction>(
  url: string,
  getToken: (options: { skipCache: boolean }) => Promise<string | null>,
  audience: unknown,
  kind: "action" | "mutation",
  reference: F,
  args: FunctionArgs<F>,
): Promise<FunctionReturnType<F>> {
  // Sensitive link proof must come from a Clerk session JWT. Custom templates
  // can omit session-bound factor ages and must never be a fallback here.
  if (audience !== "convex") throw new IdentitySessionConfigurationError();
  const token = await getToken({ skipCache: true });
  if (!token) throw new Error("The secure session is unavailable.");
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAuth(token);
  try {
    return await (kind === "action"
      ? client.action(reference as FunctionReference<"action">, args)
      : client.mutation(reference as FunctionReference<"mutation">, args));
  } finally {
    client.clearAuth();
  }
}

export function useIdentityRequest<F extends IdentityFunction>(
  url: string,
  kind: "action" | "mutation",
  reference: F,
) {
  const { getToken, sessionClaims } = useAuth();
  return useReverification(async (args: FunctionArgs<F>) => {
    try {
      return await freshIdentityRequest(
        url,
        getToken,
        sessionClaims?.aud,
        kind,
        reference,
        args,
      );
    } catch (error) {
      return identityVerificationFailure(error);
    }
  });
}
