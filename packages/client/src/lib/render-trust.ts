// The render-trust resolver — pure, zero-I/O, the one place the per-message render trust tier +
// external-media gate are decided. trust="trusted" iff the message is the viewer's own input, or the
// authoring character opted in via its server-resolved renderPolicy.trustHtml; else "untrusted" (the
// safe default for assistant/LLM, other-participant, and system content). External media is a separate
// axis. Both read the server-resolved ParticipantView.renderPolicy; absent ⇒ fail closed.
//
// Homed in lib/ (the cross-cutting display seams, beside `message-render`) rather than features/chat:
// TWO features render the same authored content — chat's transcript rows and the rpg panel's card
// archive (Scene "Cards" / Journal) — and a cross-feature RUNTIME import is banned, so a second home
// here would mean a second spelling of a SECURITY verdict.

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

type RenderTrust = "trusted" | "untrusted";
/** The D44 §12.2 card render tiers. `tierA` = the DEFAULT inert sanitized allowlist in the main DOM;
 *  `tierB` = the OPT-IN sandboxed `ImmersiveCard` mini-UI that may carry the card's own CSS. */
type CardTier = "tierA" | "tierB";

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
  /** The CARD render tier (D44 §12.2), resolved HERE because it has TWO independent consent axes and this
   *  file is the one trust authority — a second spelling elsewhere would be a second spelling of a security
   *  verdict, the same reason `trust` itself lives here.
   *
   *  `tierB` (the sandboxed ImmersiveCard, card CSS applied) when EITHER consent is present:
   *   1. the AUTHOR is trusted — the viewer's own input, or `renderPolicy.trustHtml` (the per-character
   *      opt-in D44 names), or
   *   2. the ROOM consented — a game chat with `features.immersiveHtml` ON (`lenientCards`). Turning that
   *      switch on is what makes the engine TEACH the model to emit `:::card` fences; a room that asks for
   *      cards and then refuses to render them is a toggle that lies. The host flipping it IS the consent.
   *
   *  `tierA` (the default inert allowlist — no `<style>`, no inline `style=`) otherwise. */
  readonly cardTier: CardTier;
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
  const lenientCards = input.lenientHtmlCards === true;
  return {
    trust,
    allowExternal: !policy.forbidExternalMedia,
    lenientCards,
    colorQuotes: input.colorQuotedSpeech !== false,
    // EITHER consent grants the sandboxed tier — see the field doc. Note both are HOST actions (a character
    // opt-in, or the room's immersive-HTML switch); neither is anything the MODEL can assert about itself.
    cardTier: trust === "trusted" || lenientCards ? "tierB" : "tierA",
  };
}
