import { describe, expect, it } from "vitest";
import {
  permitsService,
  serviceAccessFromClaims,
  signedServiceAccess,
} from "../shared/serviceAccess";

const subject = "user_synthetic_reviewer";
const restriction = { version: 1, services: ["wlan"] };
const envelope = { version: 1, subject, restriction };
const flat = {
  "iyanju_access.version": 1,
  "iyanju_access.subject": subject,
  "iyanju_access.restriction.version": 1,
  "iyanju_access.restriction.services": ["wlan"],
};

describe("subject-bound iYANJU eligibility contract", () => {
  it("keeps the central contract identical for raw tokens and Convex dotted claims", () => {
    const expected = { kind: "restricted", services: ["wlan"] };
    expect(
      serviceAccessFromClaims({ iyanju_access: envelope }, subject, "jwt"),
    ).toEqual(expected);
    expect(serviceAccessFromClaims(flat, subject, "convex")).toEqual(expected);
    expect(permitsService(signedServiceAccess(envelope, subject), "kazi")).toBe(
      false,
    );
    expect(permitsService(signedServiceAccess(envelope, subject), "wlan")).toBe(
      true,
    );
    expect(
      serviceAccessFromClaims(
        { iyanju_access: { ...envelope, restriction: null } },
        subject,
        "jwt",
      ),
    ).toEqual({ kind: "unrestricted" });
    expect(
      serviceAccessFromClaims(
        {
          "iyanju_access.version": 1,
          "iyanju_access.subject": subject,
          "iyanju_access.restriction": null,
        },
        subject,
        "convex",
      ),
    ).toEqual({ kind: "unrestricted" });
  });
  it.each([
    undefined,
    null,
    [],
    "wlan",
    {},
    { version: 1, subject },
    { ...envelope, subject: "another_subject" },
    { ...envelope, version: 2 },
    { ...envelope, restriction: undefined },
    { ...envelope, unsafe: true },
    ...[
      null,
      [],
      "wlan",
      {},
      { version: 2, services: ["wlan"] },
      { version: 1, services: [] },
      { version: 1, services: ["Wlan"] },
      { version: 1, services: ["unknown"] },
      { version: 1, services: ["wlan", "wlan"] },
      { version: 1, services: ["wlan"], extra: true },
    ]
      .filter((v) => v !== null)
      .map((restriction) => ({ ...envelope, restriction })),
  ])("rejects incomplete/malformed signed envelope %#", (value) => {
    expect(signedServiceAccess(value, subject)).toEqual({ kind: "invalid" });
  });
  it.each([
    {},
    { ...flat, iyanju_access: envelope },
    { ...flat, "iyanju_access.extra": true },
    { ...flat, "iyanju_access.restriction": null },
    { ...flat, "iyanju_access.version": "1" },
    { ...flat, "iyanju_access.subject": "someone_else" },
    { ...flat, "iyanju_access.restriction.services": "wlan" },
    { ...flat, "iyanju_access.restriction.services": ["wlan", "wlan"] },
    { "iyanju_access.version": 1, "iyanju_access.subject": subject },
    { "unsafe_metadata.iyanju_access": envelope },
  ])("rejects stripped, mixed or ambiguous Convex policy %#", (claims) => {
    expect(serviceAccessFromClaims(claims, subject, "convex")).toEqual({
      kind: "invalid",
    });
  });
  it("rejects dotted policy keys in raw JWTs and never uses email or unsafe metadata as authority", () => {
    expect(serviceAccessFromClaims(flat, subject, "jwt")).toEqual({
      kind: "invalid",
    });
    for (const email of ["first@example.test", "changed@example.test"])
      expect(
        serviceAccessFromClaims(
          {
            iyanju_access: envelope,
            email,
            unsafe_metadata: {
              iyanju_access: { ...envelope, restriction: null },
            },
          },
          subject,
          "jwt",
        ),
      ).toEqual({ kind: "restricted", services: ["wlan"] });
  });
});
