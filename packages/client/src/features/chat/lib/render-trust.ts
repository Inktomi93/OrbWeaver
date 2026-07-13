// The render-trust resolver — pure, zero-I/O, the one place the per-message render trust tier +
// external-media gate are decided. trust="trusted" iff the message is the viewer's own input, or the
// authoring character opted in via its server-resolved renderPolicy.trustHtml; else "untrusted" (the
// safe default for assistant/LLM, other-participant, and system content). External media is a separate
// axis. Both read the server-resolved ParticipantView.renderPolicy; absent ⇒ fail closed.

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

type RenderTrust = "trusted" | "untrusted";

const SAFE_FLOOR: RenderPolicy = { trustHtml: false, forbidExternalMedia: true };

export interface RowRenderPolicy {
  readonly trust: RenderTrust;
  readonly allowExternal: boolean;
}

export interface ResolveRowRenderPolicyInput {
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
  readonly viewerUserId: UserId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
}

export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, characterId, viewerUserId, participants } = input;

  const policy: RenderPolicy =
    (characterId === null ? undefined : participants?.get(characterId)?.renderPolicy) ?? SAFE_FLOOR;

  const isOwnUserMessage =
    role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || policy.trustHtml ? "trusted" : "untrusted";
  return { trust, allowExternal: !policy.forbidExternalMedia };
}
