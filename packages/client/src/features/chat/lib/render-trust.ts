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
  /** The §4.8 lenient naked-HTML wrap gate — a CHAT-level verdict (game chat + `features.immersiveHtml`),
   *  carried on the row policy so the block projection reads ONE render-policy object. False by default:
   *  outside a card-teaching game, raw HTML stays literal text / a code block. */
  readonly lenientCards: boolean;
  /** The `appearance.colorQuotedSpeech` pref, carried on the SAME render-policy object the body arms already
   *  read (the `lenientCards` precedent) rather than a parallel prop down four render helpers. Default ON —
   *  it matches the contract default, so a mount that threads no pref renders what the settings say. */
  readonly colorQuotes: boolean;
}

export interface ResolveRowRenderPolicyInput {
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
  readonly viewerUserId: UserId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The chat-level §4.8 lenient-wrap verdict the surface resolved (game + immersiveHtml). Absent ⇒ off. */
  readonly lenientHtmlCards?: boolean | undefined;
  /** The user's quoted-speech tint pref; absent ⇒ ON (the contract default). */
  readonly colorQuotedSpeech?: boolean | undefined;
}

export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, characterId, viewerUserId, participants } = input;

  const policy: RenderPolicy = (characterId === null ? undefined : participants?.get(characterId)?.renderPolicy) ?? SAFE_FLOOR;

  const isOwnUserMessage = role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || policy.trustHtml ? "trusted" : "untrusted";
  return {
    trust,
    allowExternal: !policy.forbidExternalMedia,
    lenientCards: input.lenientHtmlCards === true,
    colorQuotes: input.colorQuotedSpeech !== false,
  };
}
