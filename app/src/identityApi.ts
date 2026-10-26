import { makeFunctionReference } from "convex/server";

export type IdentityStatus = {
  mode: "legacy" | "shared";
  provider: "legacy" | "central";
  state: "ready" | "unlinked";
  actorId: string | null;
  canLinkLegacy: boolean;
  hasCentralIdentity: boolean;
  activation: null | {
    serviceId: "kazi";
    activatedAt: number | null;
    firstObservedAt: number;
    provenance: string;
  };
  accountCreatedAt: number | null;
};
export type LinkProof = { id: string; secret: string };
export type LinkPreview = {
  expiresAt: number;
  legacyDisplay: { name: string; email: string };
  completed: boolean;
};
export const identityApi = {
  status: makeFunctionReference<"query", Record<string, never>, IdentityStatus>(
    "identity:status",
  ),
  beginLink: makeFunctionReference<
    "action",
    Record<string, never>,
    LinkProof & Omit<LinkPreview, "completed">
  >("identity:beginLink"),
  linkPreview: makeFunctionReference<"query", LinkProof, LinkPreview>(
    "identity:linkPreview",
  ),
  completeLink: makeFunctionReference<
    "mutation",
    LinkProof,
    { actorId: string; workspaceId?: string }
  >("identity:completeLink"),
  startNewAccount: makeFunctionReference<
    "mutation",
    Record<string, never>,
    { actorId: string; workspaceId: string }
  >("identity:startNewAccount"),
};
