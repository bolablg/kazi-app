# Service eligibility

Kazi enforces service eligibility separately from its local roles, team membership and record permissions. An eligible central account still needs the existing Kazi identity mapping and normal project/team access.

## Signed contract

Every accepted central session or JWT template must carry the same signed envelope:

```json
{
  "iyanju_access": {
    "version": 1,
    "subject": "user_example",
    "restriction": null
  }
}
```

The subject must equal the signature-verified immutable token subject. Explicit `restriction: null` identifies an ordinary account. A restriction is an exact object such as `{ "version": 1, "services": ["wlan"] }`. Version 1 service IDs are `kazi`, `wlan` and `playkin`; lists must be unique and nonempty. Unknown fields/services, missing keys, wrong subjects and malformed values deny access. Email and user-writable metadata are never authority.

Convex queries expose nested claims as dotted keys; mutations/actions can read the original already-authenticated JWT. The parser validates the same contract in either representation and rejects mixed or ambiguous policy keys. Provider propagation of null, numeric version and service arrays must be checked before enforcement.

## Configuration and rollout

The Convex backend must explicitly set `KAZI_SERVICE_ACCESS_MODE`:

- `compat`: a staged state that accepts an absent envelope, while rejecting present malformed policies or restrictions excluding Kazi. No restricted account may be created while any service is in compatibility mode.
- `strict`: requires a complete valid envelope for every central principal before status, account linking, provisioning, bootstrap, protected reads/writes or key/integration creation. Shared identity mode is required.

Missing or invalid mode fails closed. There is no implicit compatibility default. Existing test fixtures explicitly select compatibility; this does not configure a deployed backend. No new Clerk API credential or actor-policy cache is required.

Before deploying this guard, approve and set the explicit staged mode on the matching development, preview and production Convex backends. Review the exact shared development and production Clerk issuance paths before changing their settings. The installed Convex adapter uses the default session when `sessionClaims.aud === "convex"` and otherwise requests the `convex` JWT template; every accepted path must include the envelope or be explicitly retired through a separately reviewed change. The central Services summary accepts only the existing root-origin, session-bound token path.

Apply the envelope to development first. Verify a fresh ordinary token and a synthetic restricted fixture through a direct Convex query, mutation/action and root summary, without logging tokens or private profiles. Confirm nested JWT and dotted query values, exact issuer/environment/subject/audience/origin, and existing session/factor verification. Preserve the current signed profile claims and Convex audience. Then obtain approval for the exact production session/template settings, allow older short-lived tokens to expire or refresh, and enable strict mode only after provider readback and normal-user regression checks pass. No issuer, origin, audience or role expansion is part of this rollout.

## Bounded new-account guarantee

This guard supports a new restricted central subject whose restriction is attached atomically before any invitation, session or use. That subject must have no prior Kazi alias, actor, activation, MCP key, file ticket, calendar feed, OAuth grant or scheduled integration lineage. The central gate denies it before any trusted Kazi alias or derivative credential can be created. Both sides of a legacy-link attempt must retain the existing fresh dual-proof checks, and central eligibility is enforced before previewing or completing the link. The dedicated root Services endpoint enforces eligibility independently of its different authorized origin.

Opaque Kazi credentials still authenticate their existing local owner and scopes; a central JWT is not an MCP credential. No email match, client-supplied actor ID or alternate issuer can create a trusted mapping for the restricted subject.

Retroactively restricting an already-bound Kazi actor is unsupported by this release. Existing legacy sessions, MCP keys, file/feed bearers and integration jobs require a separate authoritative policy/revocation design for that capability. Do not apply this bounded guarantee to such accounts, or claim global readiness from compatibility mode or synthetic tests. All participating service guards and strict issuance settings must be verified before provisioning a new restricted account.
