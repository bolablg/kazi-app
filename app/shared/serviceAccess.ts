/** iYANJU signed service-eligibility contract v1. This never grants Kazi roles. */
export const serviceIds = ["kazi", "wlan", "playkin"] as const;
export type ServiceId = (typeof serviceIds)[number];
export type ServiceAccess =
  | { kind: "unrestricted" }
  | { kind: "restricted"; services: ServiceId[] }
  | { kind: "invalid" };

const claim = "iyanju_access";
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const invalid = (): ServiceAccess => ({ kind: "invalid" });

export function parseServiceRestriction(value: unknown): ServiceAccess {
  if (
    !object(value) ||
    !exactKeys(value, ["version", "services"]) ||
    value.version !== 1 ||
    !Array.isArray(value.services) ||
    value.services.length === 0 ||
    value.services.length > serviceIds.length ||
    value.services.some((id) => !serviceIds.includes(id as ServiceId)) ||
    new Set(value.services).size !== value.services.length
  )
    return invalid();
  return { kind: "restricted", services: [...value.services] as ServiceId[] };
}

export function signedServiceAccess(
  value: unknown,
  subject: string,
): ServiceAccess {
  if (
    !subject ||
    subject.length > 180 ||
    !object(value) ||
    !exactKeys(value, ["version", "subject", "restriction"]) ||
    value.version !== 1 ||
    value.subject !== subject
  )
    return invalid();
  return value.restriction === null
    ? { kind: "unrestricted" }
    : parseServiceRestriction(value.restriction);
}

export function hasServiceAccessClaim(claims: Record<string, unknown>) {
  return Object.keys(claims).some(
    (key) => key === claim || key.startsWith(claim + "."),
  );
}

/** Convex queries flatten nested JWT custom claims into dotted keys. Only the
 * exact documented contract is reconstructed; mixed or unknown policy keys deny.
 * Raw authenticated JWTs must retain the canonical nested envelope. */
export function serviceAccessFromClaims(
  claims: Record<string, unknown>,
  subject: string,
  representation: "jwt" | "convex" = "jwt",
): ServiceAccess {
  const keys = Object.keys(claims).filter(
    (key) => key === claim || key.startsWith(claim + "."),
  );
  if (Object.hasOwn(claims, claim))
    return keys.length === 1
      ? signedServiceAccess(claims[claim], subject)
      : invalid();
  if (representation === "jwt") return invalid();
  const prefix = claim + ".";
  const common = [prefix + "version", prefix + "subject"];
  const restriction = prefix + "restriction";
  if (Object.hasOwn(claims, restriction)) {
    if (
      keys.length !== 3 ||
      ![...common, restriction].every((key) => Object.hasOwn(claims, key)) ||
      claims[restriction] !== null
    )
      return invalid();
    return signedServiceAccess(
      {
        version: claims[common[0]],
        subject: claims[common[1]],
        restriction: null,
      },
      subject,
    );
  }
  const restricted = [
    ...common,
    restriction + ".version",
    restriction + ".services",
  ];
  if (
    keys.length !== restricted.length ||
    !restricted.every((key) => Object.hasOwn(claims, key))
  )
    return invalid();
  return signedServiceAccess(
    {
      version: claims[common[0]],
      subject: claims[common[1]],
      restriction: {
        version: claims[restriction + ".version"],
        services: claims[restriction + ".services"],
      },
    },
    subject,
  );
}

export function permitsService(access: ServiceAccess, id: ServiceId) {
  return (
    access.kind === "unrestricted" ||
    (access.kind === "restricted" && access.services.includes(id))
  );
}
