// domain/chat/substrate/auth/clamp — THE D22 member-card visibility clamp. A pure
// projection: a present human member may READ a roster character's card, but only the fields at or below the
// room's `chatMetadata.group.memberCardVisibility` level (`name-avatar | sheet | sheet+lore | full`,
// host-set, default `sheet`). The owner/host always sees `full`. Read-only + while-present; viewing ≠
// owning (edit/clone/export stay owner-only — NOT this projection's concern).
//
// Levels widen left→right; the ordering is DERIVED from the canonical `MEMBER_CARD_VISIBILITY_LEVELS` tuple
// (one home, no re-spell). Fields above the effective level are nulled. `tags`/`lore` are NOT on the flat
// `CharacterCard` (tags = the `character_tags` junction; lore = the character's rendered world-info), so the
// caller resolves + passes them — the clamp never fabricates them, it only gates what it is given.

import type { CharacterCard } from "@orb/contracts/character";
import type { AgentCardView, MemberCardView, MemberCardVisibility } from "@orb/contracts/chat";
import { MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { AgentSourceKind, ParticipantRole } from "@orb/contracts/identity";
import type { CharacterId, Handle } from "@orb/kit/ids";

/** The visibility rank (index in the canonical tuple) — derive-don't-respell the ordering. */
function rank(level: MemberCardVisibility): number {
  return MEMBER_CARD_VISIBILITY_LEVELS.indexOf(level);
}

/**
 * The EFFECTIVE visibility for a viewer: the room host always sees `full`; every other present member sees
 * the host-configured level. (The GLOBAL owner/admin
 * override is the caller's concern — it passes `full` directly; this resolves the per-chat resource role.)
 */
export function resolveCardVisibility(viewerRole: ParticipantRole, configured: MemberCardVisibility): MemberCardVisibility {
  return viewerRole === "host" ? "full" : configured;
}

/**
 * Clamp a roster character's card to the {@link MemberCardView} the member may read at `visibility`
 * (D22). `name`/`avatarAssetId` are the always-present floor; `sheet`+ reveals the presentable identity;
 * `sheet+lore`+ adds the rendered world-info; `full` adds the prompt-steering internals. Pure — no I/O.
 */
export function clampMemberCard(input: {
  readonly characterId: CharacterId;
  readonly card: CharacterCard;
  /** Resolved `character_tags` (caller-supplied; clamped at `sheet`). */
  readonly tags: string[] | null;
  /** Resolved world-info entry contents (caller-supplied; clamped at `sheet+lore`). */
  readonly lore: string[] | null;
  /** The CAS hash of `card.avatarAssetId` (caller-resolved — this function is pure, no I/O; mirrors
   *  `tags`/`lore`). Same always-present floor as `avatarAssetId` (never clamped by `visibility`). */
  readonly avatarHash: string | null;
  readonly visibility: MemberCardVisibility;
}): MemberCardView {
  const { characterId, card, tags, lore, avatarHash, visibility } = input;
  const r = rank(visibility);
  const atSheet = r >= rank("sheet");
  const atLore = r >= rank("sheet+lore");
  const atFull = r >= rank("full");
  return {
    characterId,
    visibility,
    name: card.name,
    avatarAssetId: card.avatarAssetId,
    avatarHash,
    description: atSheet ? card.description : null,
    personality: atSheet ? card.personality : null,
    scenario: atSheet ? card.scenario : null,
    // MemberCardView.greetings is a clamped DISPLAY projection (string[]) — group-only isn't meaningful to a
    // room member, so the object shape does NOT propagate here; project each greeting to its text.
    greetings: atSheet ? card.greetings.map((g) => g.text) : null,
    exampleMessages: atSheet ? card.exampleMessages : null,
    tags: atSheet ? tags : null,
    creatorNotes: atSheet ? card.creatorNotes : null,
    lore: atLore ? lore : null,
    systemPrompt: atFull ? card.systemPrompt : null,
    postHistoryInstructions: atFull ? card.postHistoryInstructions : null,
    authorsNoteDepth: atFull ? (card.depthPrompt?.depth ?? null) : null,
  };
}

/**
 * Build the D22 {@link AgentCardView} for an AGENT seat (D60; agent-principal-design/06 §5). Unlike
 * {@link clampMemberCard} there is NO visibility ladder: an agent has no `characters` card to clamp, and its
 * steering internals ARE its owner-private soul (the same privacy logic that hides a low-level card's
 * internals), so the room-shareable answer to "who is this?" is a FIXED minimal projection — the soul display
 * name (doc-04 speaker source) + the satellite `sourceKind` + the owner's public handle. Pure: the caller
 * resolves the three inputs (chat holds no `users`/`agent_principals` read). NEVER the soul prompt or an avatar.
 */
export function buildAgentCardView(input: { readonly displayName: string; readonly sourceKind: AgentSourceKind; readonly ownerHandle: Handle }): AgentCardView {
  return { displayName: input.displayName, sourceKind: input.sourceKind, ownerHandle: input.ownerHandle };
}
