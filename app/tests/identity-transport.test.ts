import { expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { identityApi } from "../src/identityApi";
import {
  freshIdentityRequest,
  identityErrorCode,
  identityErrorMessage,
  reverificationHint,
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
it("uses fresh JWT authentication transport with the installed integration/template selection", async () => {
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
    undefined,
    "mutation",
    identityApi.completeLink,
    { id: "synthetic-id", secret: "synthetic-proof" },
  );
  expect(getToken).toHaveBeenLastCalledWith({
    skipCache: true,
    template: "convex",
  });
  expect(transport.mutation).toHaveBeenLastCalledWith(
    identityApi.completeLink,
    { id: "synthetic-id", secret: "synthetic-proof" },
  );
});
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
