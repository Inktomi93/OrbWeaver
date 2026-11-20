// The render-trust resolver — pure, zero-I/O, the one place the per-message render trust tier +
// external-media gate are decided. trust="trusted" iff the message is the viewer's own input, or the
// authoring character sits above the floor on the server-resolved renderPolicy.htmlTrust LADDER (the ONE
// ordered axis, contracts/chat: untrusted < trusted < interactive); else "untrusted" (another user's
// input, a character on the untrusted step, and any row with no resolved policy). External media is a separate
// axis. Both read the server-resolved ParticipantView.renderPolicy, or ChatDetail.narratorRender for a narrator row;
// absent ⇒ fail closed. A plain (tierA) row's verdict — which setting holds it plain and whether this viewer may
// change it — is read here off the same policy, so the notice that names a setting can never disagree with the tier
// it explains.
//
// Homed in lib/ (the cross-cutting display seams, beside `message-render`) rather than features/chat:
// TWO features render the same authored content — chat's transcript rows and the rpg panel's card
// archive (Scene "Cards" / Journal) — and a cross-feature RUNTIME import is banned, so a second home
// here would mean a second spelling of a SECURITY verdict.

import type { DeploymentRenderPolicy, MessageKind, NarratorRenderPolicy, ParticipantView, RenderPolicy, RenderPolicySource } from "@orb/contracts/chat";
import { rendersTrustedHtml, resolveCardMediaVerdict, resolveCardScriptVerdict } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

const RENDER_TRUSTS = ["trusted", "untrusted"] as const;
type RenderTrust = (typeof RENDER_TRUSTS)[number];
const CARD_TIERS = ["tierA", "tierB"] as const;
/** The docs/law/UI-Theming-and-Content.md §12.2 card render tiers. `tierA` = the inert sanitized allowlist in the main DOM;
 *  `tierB` = the sandboxed `ImmersiveCard` mini-UI that may carry the card's own CSS. */
type CardTier = (typeof CARD_TIERS)[number];

// Unresolved character policy fails closed; deployment defaults are resolved separately below.
const SAFE_FLOOR: RenderPolicy = { htmlTrust: "untrusted", forbidExternalMedia: true };

/** The same strictness one tier DOWN: the DEPLOYMENT pair a per-character override resolves against, used
 *  while `/api/auth/config` has not landed (`data/auth-config.ts`'s `useRenderPolicyFloor`). Kept beside
 *  {@link SAFE_FLOOR} because they are the same decision said at two tiers, and a second spelling of a
 *  fail-closed default is how one of them drifts permissive. */
export const DEPLOYMENT_FLOOR: DeploymentRenderPolicy = { defaultHtmlStep: "untrusted", forbidExternalMedia: true };

/** Why a styled reply the row's tier would frame renders on the inert plain path instead, by role: the reason the
 *  plain-content notice names. */
export const PLAIN_REPLY_REASON = { carriedStylesOverBudget: "carried-styles-over-budget", frameUnavailable: "frame-unavailable" } as const;
export type PlainReplyReason = (typeof PLAIN_REPLY_REASON)[keyof typeof PLAIN_REPLY_REASON];

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
  /** The CARD render tier (docs/law/UI-Theming-and-Content.md §12.2), resolved HERE because it has TWO independent consent axes and this
   *  file is the one trust authority — a second spelling elsewhere would be a second spelling of a security
   *  verdict, the same reason `trust` itself lives here.
   *
   *  `tierB` (the sandboxed ImmersiveCard, card CSS applied) when EITHER consent is present:
   *   1. the AUTHOR is trusted — the viewer's own input, or a character at or above `trusted`, read off
   *      the ONE ordered `renderPolicy.htmlTrust` ladder (`rendersTrustedHtml`), or
   *   2. the ROOM consented — a game chat with `features.immersiveHtml` ON (`lenientCards`). Turning that
   *      switch on is what makes the engine TEACH the model to emit `:::card` fences; a room that asks for
   *      cards and then refuses to render them is a toggle that lies. The host flipping it IS the consent.
   *
   *  `tierA` (the default inert allowlist — no `<style>`, no inline `style=`) otherwise. */
  readonly cardTier: CardTier;
  /** Set in a game room whose immersive HTML cards are off, for the notice that says a reply's card markup is not drawn
   *  as a card. Absent everywhere else, and while the game's read has not landed. */
  readonly heldCards?: HeldCards | undefined;
  /** Whose content a `tierA` row is and what its own policy says, for the plain-content notice; absent on `tierB`.
   *  {@link resolvePlainVerdict} turns it into the reason and the remedy once the viewer's standing is read. */
  readonly plain?: PlainSubject | undefined;
}

/** The reason the held-cards notice names. */
export const HELD_CARDS_REASON = "game-cards-off";

/** A game room's card wrap held off by its immersive HTML switch, and whether this viewer may turn it on. */
export interface HeldCards {
  /** Only the host edits the game's switches. */
  readonly viewerIsHost: boolean;
}

/** What makes a `tierA` row plain, read off the same policy the tier came from. */
const PLAIN_REASONS = [
  // The character's own HTML setting is Plain text.
  "character",
  // The character inherits the install's "Default for characters", which is Plain text.
  "install",
  // No card is read for the seat, so no one consents for it and it draws as Plain text.
  "no-card",
  // The room has no consenting host, so no card applies and it draws as Plain text.
  "no-host",
  // Another person wrote the row: no setting renders someone else's HTML.
  "member",
  // No seated character's policy covers the row, so it renders at the fail-closed floor.
  "unattributed",
] as const;
export type PlainReason = (typeof PLAIN_REASONS)[number];

/** Where the viewer can turn rich content on for this row, or that they cannot. */
const PLAIN_REMEDIES = [
  // The character's Trust tab: the viewer hosts the room, so the character is theirs.
  "character-trust",
  // The System section's media and trust settings: the viewer is an admin.
  "system-trust",
  // Only the room's host can change it.
  "ask-host",
  // Only the server's admin can change it.
  "ask-admin",
  // The viewer's own "Run scripts in cards and styled replies" setting.
  "own-scripts",
  // The game's host console: the viewer hosts the room.
  "game-settings",
  // Nothing turns it on.
  "none",
] as const;
export type PlainRemedy = (typeof PLAIN_REMEDIES)[number];

/** A `tierA` row's author as its policy resolved: a seated character with a resolved policy, another person, or
 *  neither (the fail-closed floor). */
export interface PlainSubject {
  readonly author: "character" | "member" | "unattributed";
  /** Where the character's policy came from; set when `author` is `character`. */
  readonly source: RenderPolicySource | undefined;
  /** The character whose setting it is; null when no character's setting applies. */
  readonly characterId: CharacterId | null;
  /** That character's name in this room, when the room names one. */
  readonly characterName: string | undefined;
  /** Whether the viewer hosts the room. Characters in a room are the host's (D64), so only the host can edit one. */
  readonly viewerIsHost: boolean;
}

export interface PlainVerdict {
  readonly reason: PlainReason;
  readonly remedy: PlainRemedy;
  readonly characterId: CharacterId | null;
  readonly characterName: string | undefined;
}

export interface ResolveRowRenderPolicyInput {
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
  readonly characterId: CharacterId | null;
  readonly viewerUserId: UserId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  /** The row's declared purpose (`MessageView.kind`, D129); absent ⇒ `standard`. */
  readonly kind?: MessageKind | undefined;
  /** The room's narrator policy (`ChatDetail.narratorRender`), which a `narrator` row reads in place of a seat. Absent ⇒
   *  a narrator row renders at the fail-closed floor. */
  readonly narrator?: NarratorRenderPolicy | undefined;
  /** The chat-level §4.8 lenient-wrap verdict the surface resolved (game + immersiveHtml). Absent ⇒ off. */
  readonly lenientHtmlCards?: boolean | undefined;
  /** The room is a game whose `immersiveHtml` read landed as off. Absent ⇒ not. */
  readonly gameCardsOff?: boolean | undefined;
  /** The install's "Block external media" (`useRenderPolicyFloor`, strict until the config lands). The viewer's own
   *  message loads external media under it alone; every other row also takes its author's policy. */
  readonly installForbidsExternalMedia: boolean;
  /** The user's quoted-speech tint pref; absent ⇒ ON (the contract default). */
  readonly colorQuotedSpeech?: boolean | undefined;
  /** Whether the viewer hosts the room (`ChatDetail.viewerIsHost`); absent ⇒ not. */
  readonly viewerIsHost?: boolean | undefined;
}

// Why an untrusted character policy is untrusted, read off where the server says it came from. Under
// `resolveRenderPolicy` (`@orb/contracts/chat`) one setting always suffices: a character's own step wins over the
// install default, an inheriting character follows the install default alone, and a seat with no card or no consenting
// host is Plain text, which no setting changes.
function plainReason(subject: PlainSubject): PlainReason {
  if (subject.author !== "character" || subject.source === undefined) {
    return subject.author === "character" ? "unattributed" : subject.author;
  }
  switch (subject.source) {
    case "own":
      return "character";
    case "inherited":
      return "install";
    case "no-card":
    case "no-host":
      return subject.source;
    default:
      return assertNeverReason(subject.source);
  }
}

function plainRemedy(reason: PlainReason, isHost: boolean, isAdmin: boolean): PlainRemedy {
  switch (reason) {
    case "character":
      return isHost ? "character-trust" : "ask-host";
    case "install":
      // The install default is the admin's; a host who is not an admin can still give their own character Rich HTML.
      if (isAdmin) {
        return "system-trust";
      }
      return isHost ? "character-trust" : "ask-host";
    case "no-card":
    case "no-host":
    case "member":
    case "unattributed":
      return "none";
    default:
      return assertNeverReason(reason);
  }
}

function assertNeverReason(reason: never): never {
  throw new Error(`render-trust: unhandled plain reason ${String(reason)}`);
}

/** Which setting holds a `tierA` row plain and where this viewer can change it. A character is named only when its
 *  own setting, or the default it inherits, is the cause. */
export function resolvePlainVerdict(subject: PlainSubject, viewerIsAdmin: boolean): PlainVerdict {
  const reason = plainReason(subject);
  const named = reason === "character" || reason === "install";
  return {
    reason,
    remedy: plainRemedy(reason, subject.viewerIsHost, viewerIsAdmin),
    characterId: named ? subject.characterId : null,
    characterName: named ? subject.characterName : undefined,
  };
}

/** The room's character seats by character id: the map every row's policy and every framed notice's verdict reads,
 *  in the transcript and in the game's card archive. */
export function buildParticipantsById(participants: readonly ParticipantView[]): ReadonlyMap<CharacterId, ParticipantView> {
  const byId = new Map<CharacterId, ParticipantView>();
  for (const participant of participants) {
    if (participant.kind === "character" && participant.characterId !== null) {
      byId.set(participant.characterId, participant);
    }
  }
  return byId;
}

/** Which setting holds external media out of a framed card or styled reply: the install's, the character's own, or
 *  none, because no seated character's policy covers the row and the frame takes the floor. */
const FRAMED_MEDIA_REASONS = ["install-media", "character-media", "unattributed-media"] as const;
export type FramedMediaReason = (typeof FRAMED_MEDIA_REASONS)[number];

/** A framed card's or styled reply's mint selector, beside the roster and install reads every member already has. */
export interface FramedMediaSubject {
  /** The character the frame was minted for (`CardOrigin.characterId`). */
  readonly characterId: CharacterId | null;
  readonly participants: ReadonlyMap<CharacterId, ParticipantView>;
  /** The room's narrator policy (`ChatDetail.narratorRender`). */
  readonly narrator: NarratorRenderPolicy | undefined;
  /** The install's `forbidExternalMedia`, as `/api/auth/config` serves it to every viewer. */
  readonly installForbids: boolean;
  readonly viewerIsHost: boolean;
}

export interface FramedMediaVerdict {
  readonly reason: FramedMediaReason;
  readonly remedy: PlainRemedy;
  readonly characterId: CharacterId | null;
  readonly characterName: string | undefined;
}

// The policy the frame was minted under and the character whose own media setting forbids it. A selector with no seat
// is a narrator row's group character, which the card-frame route resolves to the narrator policy; that policy forbids
// external media when any present character's does, so the first such seat in roster order is the one to name.
function framedMediaAuthor(subject: FramedMediaSubject): { readonly policy: RenderPolicy | undefined; readonly seat: ParticipantView | undefined } {
  const { characterId, participants, narrator } = subject;
  const seat = characterId === null ? undefined : participants.get(characterId);
  if (seat !== undefined || characterId === null || narrator === undefined) {
    return { policy: seat?.renderPolicy, seat };
  }
  return { policy: narrator.renderPolicy, seat: [...participants.values()].find((candidate) => candidate.renderPolicy?.forbidExternalMedia === true) };
}

/** Which setting withholds a framed row's external media and where this viewer can change it, or `undefined` when the
 *  row's policy lets it load. The rule is the card-frame route's own (`resolveCardMediaVerdict`), over the same reads,
 *  so this names the holder the route applied. Every input is already on every member's roster and auth config, so the
 *  verdict tells a member nothing new. */
export function resolveFramedMediaVerdict(subject: FramedMediaSubject, viewerIsAdmin: boolean): FramedMediaVerdict | undefined {
  const { policy, seat } = framedMediaAuthor(subject);
  const unnamed = { characterId: null, characterName: undefined };
  // A row no seated policy covers mints at the floor, which no setting lifts.
  if (policy === undefined) {
    return { reason: "unattributed-media", remedy: "none", ...unnamed };
  }
  const { external } = resolveCardMediaVerdict({ installForbids: subject.installForbids, policy });
  if (external.loads) {
    return undefined;
  }
  switch (external.heldBy) {
    case "install":
      return { reason: "install-media", remedy: viewerIsAdmin ? "system-trust" : "ask-admin", ...unnamed };
    case "character": {
      const characterId = seat?.characterId ?? null;
      if (characterId === null) {
        return { reason: "unattributed-media", remedy: "none", ...unnamed };
      }
      return { reason: "character-media", remedy: subject.viewerIsHost ? "character-trust" : "ask-host", characterId, characterName: seat?.displayName };
    }
    default:
      return assertNeverHolder(external.heldBy);
  }
}

/** Which consent holds a framed card's or styled reply's own scripts off, as the notice names it. */
const FRAMED_SCRIPT_REASONS = ["install-scripts", "character-scripts", "viewer-scripts", "unattributed-scripts"] as const;
export type FramedScriptReason = (typeof FRAMED_SCRIPT_REASONS)[number];

/** A framed card's or styled reply's mint selector, beside the roster, install and settings reads every viewer has. */
export interface FramedScriptSubject {
  /** The character the frame was minted for (`CardOrigin.characterId`). */
  readonly characterId: CharacterId | null;
  readonly participants: ReadonlyMap<CharacterId, ParticipantView>;
  /** The room's narrator policy (`ChatDetail.narratorRender`). */
  readonly narrator: NarratorRenderPolicy | undefined;
  /** Whether the install's "Default for characters" is Interactive, as `/api/auth/config` serves it to every viewer. */
  readonly installAllowsScripts: boolean;
  /** The viewer's own consent, read through `viewerRunsCardScripts`. */
  readonly viewerRunsScripts: boolean;
  readonly viewerIsHost: boolean;
}

export interface FramedScriptVerdict {
  readonly reason: FramedScriptReason;
  readonly remedy: PlainRemedy;
  readonly characterId: CharacterId | null;
  readonly characterName: string | undefined;
}

// The policy the frame was minted under, and the seat whose setting binds it. A selector with no seat is a narrator
// row's group character, which the card-frame route resolves to the narrator policy, bound by the narrator's seat.
function framedScriptAuthor(subject: FramedScriptSubject): RowAuthor {
  const { characterId, participants, narrator } = subject;
  const seat = characterId === null ? undefined : participants.get(characterId);
  if (seat !== undefined || characterId === null || narrator === undefined) {
    return { characterId, seat, policy: seat?.renderPolicy, source: seat?.renderSource };
  }
  return { characterId: narrator.characterId, seat: participants.get(narrator.characterId), policy: narrator.renderPolicy, source: narrator.renderSource };
}

/** Which consent holds a framed row's own scripts off and where this viewer can change it, or `undefined` when they
 *  run. The rule is the card-frame route's own (`resolveCardScriptVerdict`), over the same three reads, so this names
 *  the consent the route applied. A row no seated policy covers mints at the static floor, which no setting lifts. */
export function resolveFramedScriptVerdict(subject: FramedScriptSubject, viewerIsAdmin: boolean): FramedScriptVerdict | undefined {
  const { characterId, seat, policy, source } = framedScriptAuthor(subject);
  const unnamed = { characterId: null, characterName: undefined };
  if (policy === undefined) {
    return { reason: "unattributed-scripts", remedy: "none", ...unnamed };
  }
  const verdict = resolveCardScriptVerdict({ installAllows: subject.installAllowsScripts, step: policy.htmlTrust, viewerRuns: subject.viewerRunsScripts });
  if (verdict.runs) {
    return undefined;
  }
  switch (verdict.heldBy) {
    case "install":
      return { reason: "install-scripts", remedy: viewerIsAdmin ? "system-trust" : "ask-admin", ...unnamed };
    case "character":
      // A seat with no card, or a room with no consenting host, never reaches the interactive step, and no setting
      // of a character's lifts it.
      if (source === "no-card" || source === "no-host" || characterId === null) {
        return { reason: "unattributed-scripts", remedy: "none", ...unnamed };
      }
      return { reason: "character-scripts", remedy: subject.viewerIsHost ? "character-trust" : "ask-host", characterId, characterName: seat?.displayName };
    case "viewer":
      return { reason: "viewer-scripts", remedy: "own-scripts", ...unnamed };
    default:
      return assertNeverHolder(verdict.heldBy);
  }
}

function assertNeverHolder(holder: never): never {
  throw new Error(`render-trust: unhandled holder ${String(holder)}`);
}

/** The character a row's policy is read from, with that policy as the server resolved it. */
interface RowAuthor {
  readonly characterId: CharacterId | null;
  readonly seat: ParticipantView | undefined;
  readonly policy: RenderPolicy | undefined;
  readonly source: RenderPolicySource | undefined;
}

// A narrator row voices the whole room, so it reads the policy the server bounded by the present characters, and its
// subject is the character whose setting binds that policy.
function rowAuthor(input: ResolveRowRenderPolicyInput): RowAuthor {
  const narrated = input.kind === "narrator";
  const characterId = narrated ? (input.narrator?.characterId ?? null) : input.characterId;
  const seat = characterId === null ? undefined : input.participants?.get(characterId);
  if (narrated) {
    return { characterId, seat, policy: input.narrator?.renderPolicy, source: input.narrator?.renderSource };
  }
  return { characterId, seat, policy: seat?.renderPolicy, source: seat?.renderSource };
}

export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, viewerUserId } = input;

  const { characterId, seat, policy: resolved, source } = rowAuthor(input);
  const policy: RenderPolicy = resolved ?? SAFE_FLOOR;

  const isOwnUserMessage = role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || rendersTrustedHtml(policy.htmlTrust) ? "trusted" : "untrusted";
  const lenientCards = input.lenientHtmlCards === true;
  // EITHER consent grants the sandboxed tier — see the field doc. Both come from the host or the box (the
  // character's resolved step, or the room's immersive-HTML switch); neither is anything the MODEL can assert.
  const cardTier: CardTier = trust === "trusted" || lenientCards ? "tierB" : "tierA";
  const viewerIsHost = input.viewerIsHost === true;
  const base = {
    trust,
    // The viewer's own media reveals their address only to hosts they chose, so it follows the install alone. Another
    // member's media stays click-to-load: a pixel there would reveal every viewer.
    allowExternal: isOwnUserMessage
      ? !input.installForbidsExternalMedia
      : resolveCardMediaVerdict({ installForbids: input.installForbidsExternalMedia, policy }).external.loads,
    lenientCards,
    colorQuotes: input.colorQuotedSpeech !== false,
    cardTier,
    heldCards: input.gameCardsOff === true ? { viewerIsHost } : undefined,
  };
  if (cardTier === "tierB") {
    return base;
  }
  let author: PlainSubject["author"] = "unattributed";
  if (role === "user") {
    author = "member";
  } else if (resolved !== undefined) {
    author = "character";
  }
  return {
    ...base,
    plain: {
      author,
      source: author === "character" ? source : undefined,
      characterId: author === "character" ? characterId : null,
      characterName: seat?.displayName,
      viewerIsHost,
    },
  };
}
