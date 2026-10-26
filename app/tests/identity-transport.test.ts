import { beforeEach, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { identityApi } from "../src/identityApi";
import {
  freshIdentityRequest,
  identityErrorCode,
  identityErrorMessage,
  reverificationHint,
  IdentitySessionConfigurationError,
  identityVerificationFailure,
} from "../src/identityTransport";

const transport = vi.hoisted(() => ({
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  action: vi.fn(async () => ({ id: "synthetic-nonce" })),
  mutation: vi.fn(async () => ({ actorId: "canonical-actor" })),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth = transport.setAuth;
    clearAuth = transport.clearAuth;
    action = transport.action;
    mutation = transport.mutation;
  },
}));
beforeEach(() => vi.clearAllMocks());
it("uses only a fresh default session JWT for sensitive link authentication", async () => {
  const getToken = vi.fn(async () => "synthetic-transport-jwt");
  await freshIdentityRequest(
    "https://synthetic.convex.cloud",
    getToken,
    "convex",
    "action",
    identityApi.beginLink,
    {},
  );
  expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
  expect(transport.setAuth).toHaveBeenCalledWith("synthetic-transport-jwt");
  expect(transport.action).toHaveBeenLastCalledWith(identityApi.beginLink, {});
  expect(transport.clearAuth).toHaveBeenCalled();
  await freshIdentityRequest(
    "https://synthetic.convex.cloud",
    getToken,
    "convex",
    "mutation",
    identityApi.completeLink,
    { id: "synthetic-id", secret: "synthetic-proof" },
  );
  expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
  expect(getToken.mock.calls).toEqual([
    [{ skipCache: true }],
    [{ skipCache: true }],
  ]);
  expect(transport.mutation).toHaveBeenLastCalledWith(
    identityApi.completeLink,
    { id: "synthetic-id", secret: "synthetic-proof" },
  );
});
it.each([undefined, null, "other", ["convex"]])(
  "rejects a missing or incompatible session audience before requesting a token (%s)",
  async (audience) => {
    const getToken = vi.fn(async () => "synthetic-jwt");
    await expect(
      freshIdentityRequest(
        "https://synthetic.convex.cloud",
        getToken,
        audience,
        "mutation",
        identityApi.completeLink,
        { id: "synthetic-id", secret: "synthetic-proof" },
      ),
    ).rejects.toBeInstanceOf(IdentitySessionConfigurationError);
    expect(getToken).not.toHaveBeenCalled();
    expect(transport.setAuth).not.toHaveBeenCalled();
    expect(transport.mutation).not.toHaveBeenCalled();
  },
);
it("clears transport authentication even when a sensitive request fails", async () => {
  transport.mutation.mockRejectedValueOnce(new Error("synthetic failure"));
  const count = transport.clearAuth.mock.calls.length;
  await expect(
    freshIdentityRequest(
      "https://synthetic.convex.cloud",
      async () => "synthetic-jwt",
      "convex",
      "mutation",
      identityApi.completeLink,
      { id: "synthetic-id", secret: "synthetic-proof" },
    ),
  ).rejects.toThrow();
  expect(transport.clearAuth.mock.calls.length).toBe(count + 1);
});
it("recognizes only structured server reverification errors", () => {
  expect(
    identityErrorCode(new ConvexError({ code: "REVERIFICATION_REQUIRED" })),
  ).toBe("REVERIFICATION_REQUIRED");
  expect(identityErrorCode(new Error("REVERIFICATION_REQUIRED"))).toBeNull();
  expect(reverificationHint.clerk_error.metadata.reverification).toEqual({
    level: "multi_factor",
    afterMinutes: 10,
  });
});
it.each([
  "auth_metadata_unavailable",
  "factor_age_missing",
  "unknown_future_reason",
])(
  "does not open a verification loop for unavailable session proof (%s)",
  (reason) => {
    const error = new ConvexError({ code: "REVERIFICATION_REQUIRED", reason });
    expect(() => identityVerificationFailure(error)).toThrow(
      IdentitySessionConfigurationError,
    );
    expect(identityErrorMessage(error)).toContain(
      "sign-in connection needs attention",
    );
    expect(identityErrorMessage(error)).not.toContain(reason);
  },
);
it("keeps step-up verification for stale factors and compatible older backend errors", () => {
  expect(
    identityVerificationFailure(
      new ConvexError({
        code: "REVERIFICATION_REQUIRED",
        reason: "factor_age_stale_or_invalid",
      }),
    ),
  ).toEqual(reverificationHint);
  expect(
    identityVerificationFailure(
      new ConvexError({ code: "REVERIFICATION_REQUIRED" }),
    ),
  ).toEqual(reverificationHint);
  const unrelated = new ConvexError({ code: "IDENTITY_CONFLICT" });
  expect(() => identityVerificationFailure(unrelated)).toThrow(unrelated);
  expect(
    identityErrorMessage(new IdentitySessionConfigurationError()),
  ).toContain("Please contact support");
});
it("gives safe restart and conflict guidance for the backend's link errors", () => {
  expect(
    identityErrorMessage(new ConvexError({ code: "IDENTITY_LINK_USED" })),
  ).toMatch(/Start again/);
  expect(
    identityErrorMessage(new ConvexError({ code: "IDENTITY_CONFLICT" })),
  ).toMatch(/data is unchanged/);
  expect(
    identityErrorMessage(new ConvexError({ code: "IDENTITY_LINK_LIMIT" })),
  ).toMatch(/five minutes/);
});
