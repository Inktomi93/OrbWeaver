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
type PlainReason = (typeof PLAIN_REASONS)[number];

/** Where the viewer can turn rich content on for this row, or that they cannot. */
const PLAIN_REMEDIES = [
  // The character's Trust tab: the viewer hosts the room, so the character is theirs.
  "character-trust",
  // The install's Character trust defaults: the viewer is an admin.
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
  readonly author: Extract<PlainReason, "character" | "member" | "unattributed">;
  /** Where the character's policy came from; set when `author` is `character`. */
  readonly source: RenderPolicySource | undefined;
  /** The characters whose settings hold the row, in roster order: one for a character's row, every binding seat for a
   *  narrator row; empty when no character's setting applies. */
  readonly characters: readonly PlainCharacter[];
  /** Who holds the row's internet media when its policy refuses it; absent when it loads or no character's setting
   *  applies. */
  readonly media?: Omit<MediaHolder, "viewerIsHost"> | undefined;
  /** Whether the viewer hosts the room. Characters in a room are the host's (D64), so only the host can edit one. */
  readonly viewerIsHost: boolean;
}

/** One character a plain row names, with its name in this room when the room names one. */
interface PlainCharacter {
  readonly characterId: CharacterId;
  readonly characterName: string | undefined;
}

interface PlainVerdict {
  readonly reason: PlainReason;
  readonly remedy: PlainRemedy;
  readonly characters: readonly PlainCharacter[];
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
function resolvePlainVerdict(subject: PlainSubject, viewerIsAdmin: boolean): PlainVerdict {
  const reason = plainReason(subject);
  const named = reason === "character" || reason === "install";
  return {
    reason,
    remedy: plainRemedy(reason, subject.viewerIsHost, viewerIsAdmin),
    characters: named ? subject.characters : [],
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

/** What character trust can hold back on a row, in the order the notice lists it: the row's styling (it draws as plain
 *  text), its scripts, and its internet media. The stored axes stay two (what content may do, what it may fetch); the
 *  notice reads them as one question. */
const HELD_KINDS = ["styling", "scripts", "media"] as const;
export type HeldKind = (typeof HELD_KINDS)[number];

/** Which setting holds external media out of a framed card or styled reply: the install's, the character's own, or
 *  none, because no seated character's policy covers the row and the frame takes the floor. */
const FRAMED_MEDIA_REASONS = ["install-media", "character-media", "unattributed-media"] as const;
type FramedMediaReason = (typeof FRAMED_MEDIA_REASONS)[number];

/** Which consent holds a framed card's or styled reply's own scripts off, as the notice names it. */
const FRAMED_SCRIPT_REASONS = ["install-scripts", "character-scripts", "viewer-scripts", "unattributed-scripts"] as const;
type FramedScriptReason = (typeof FRAMED_SCRIPT_REASONS)[number];

/** Why one kind is held back. A plain row's own scripts and media can share its styling's cause, because the step or
 *  author that holds the styling holds them too. */
export type TrustCause = PlainReason | FramedScriptReason | FramedMediaReason;

/** One kind a row holds back, the setting that holds it, and where this viewer can change it. `characters` names every
 *  character whose setting holds it, in roster order, so a remedy reaches each of them. */
export interface TrustHold {
  readonly kind: HeldKind;
  readonly cause: TrustCause;
  readonly remedy: PlainRemedy;
  readonly characters: readonly PlainCharacter[];
}

/** A framed card's or styled reply's mint selector, beside the roster and install reads every member already has. */
interface FramedMediaSubject {
  /** The character the frame was minted for (`CardOrigin.characterId`). */
  readonly characterId: CharacterId | null;
  readonly participants: ReadonlyMap<CharacterId, ParticipantView>;
  /** The room's narrator policy (`ChatDetail.narratorRender`). */
  readonly narrator: NarratorRenderPolicy | undefined;
  /** The install's `forbidExternalMedia`, as `/api/auth/config` serves it to every viewer. */
  readonly installForbids: boolean;
  readonly viewerIsHost: boolean;
}

/** The characters named for a set of ids, with each one's name in this room when the room names one. */
function namedCharacters(characterIds: readonly CharacterId[], participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): readonly PlainCharacter[] {
  return characterIds.map((characterId) => ({ characterId, characterName: participants?.get(characterId)?.displayName }));
}

// The seats whose own media setting forbids it among those a policy reads: a narrator row's policy forbids external
// media when any present seat's does, so every such seat holds it.
function mediaForbidders(characterIds: readonly CharacterId[], participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): readonly CharacterId[] {
  return characterIds.filter((characterId) => participants?.get(characterId)?.renderPolicy?.forbidExternalMedia === true);
}

// The policy a frame was minted under, and the characters it reads. A selector with no seat is a narrator row's group
// character, which the card-frame route resolves to the narrator policy over every present seat.
function framedAuthor(
  characterId: CharacterId | null,
  participants: ReadonlyMap<CharacterId, ParticipantView>,
  narrator: NarratorRenderPolicy | undefined,
): {
  readonly policy: RenderPolicy | undefined;
  readonly source: RenderPolicySource | undefined;
  readonly bound: readonly CharacterId[];
  readonly read: readonly CharacterId[];
} {
  const seat = characterId === null ? undefined : participants.get(characterId);
  if (seat !== undefined || characterId === null || narrator === undefined) {
    const own = seat === undefined || characterId === null ? [] : [characterId];
    return { policy: seat?.renderPolicy, source: seat?.renderSource, bound: own, read: own };
  }
  return { policy: narrator.renderPolicy, source: narrator.renderSource, bound: narrator.characterIds, read: [...participants.keys()] };
}

// Which setting withholds a framed row's external media and where this viewer can change it, or `undefined` when the
// row's policy lets it load. The rule is the card-frame route's own (`resolveCardMediaVerdict`), over the same reads,
// so this names the holder the route applied. Every input is already on every member's roster and auth config, so the
// verdict tells a member nothing new.
function resolveFramedMediaVerdict(subject: FramedMediaSubject, viewerIsAdmin: boolean): TrustHold | undefined {
  const { policy, read } = framedAuthor(subject.characterId, subject.participants, subject.narrator);
  // A row no seated policy covers mints at the floor, which no setting lifts.
  if (policy === undefined) {
    return { kind: "media", cause: "unattributed-media", remedy: "none", characters: [] };
  }
  const { external } = resolveCardMediaVerdict({ installForbids: subject.installForbids, policy });
  if (external.loads) {
    return undefined;
  }
  return mediaHold(
    {
      heldBy: external.heldBy,
      forbidders: mediaForbidders(read, subject.participants),
      participants: subject.participants,
      viewerIsHost: subject.viewerIsHost,
    },
    viewerIsAdmin,
  );
}

interface MediaHolder {
  readonly heldBy: Extract<ReturnType<typeof resolveCardMediaVerdict>["external"], { readonly loads: false }>["heldBy"];
  /** The characters whose own media setting forbids it, in roster order. */
  readonly forbidders: readonly CharacterId[];
  readonly participants: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  readonly viewerIsHost: boolean;
}

function mediaHold({ heldBy, forbidders, participants, viewerIsHost }: MediaHolder, viewerIsAdmin: boolean): TrustHold {
  switch (heldBy) {
    case "install":
      return { kind: "media", cause: "install-media", remedy: viewerIsAdmin ? "system-trust" : "ask-admin", characters: [] };
    case "character":
      return forbidders.length === 0
        ? { kind: "media", cause: "unattributed-media", remedy: "none", characters: [] }
        : {
            kind: "media",
            cause: "character-media",
            remedy: viewerIsHost ? "character-trust" : "ask-host",
            characters: namedCharacters(forbidders, participants),
          };
    default:
      return assertNeverHolder(heldBy);
  }
}

/** A framed card's or styled reply's mint selector, beside the roster and settings reads every viewer has. */
interface FramedScriptSubject {
  /** The character the frame was minted for (`CardOrigin.characterId`). */
  readonly characterId: CharacterId | null;
  readonly participants: ReadonlyMap<CharacterId, ParticipantView>;
  /** The room's narrator policy (`ChatDetail.narratorRender`). */
  readonly narrator: NarratorRenderPolicy | undefined;
  /** The viewer's own consent, read through `viewerRunsCardScripts`. */
  readonly viewerRunsScripts: boolean;
  readonly viewerIsHost: boolean;
}

// Which consent holds a framed row's own scripts off and where this viewer can change it, or `undefined` when they
// run. The rule is the card-frame route's own (`resolveCardScriptVerdict`), over the same reads, so this names the
// consent the route applied. A row no seated policy covers mints at the static floor, which no setting lifts.
function resolveFramedScriptVerdict(subject: FramedScriptSubject, viewerIsAdmin: boolean): TrustHold | undefined {
  const { policy, source, bound } = framedAuthor(subject.characterId, subject.participants, subject.narrator);
  const unattributed: TrustHold = { kind: "scripts", cause: "unattributed-scripts", remedy: "none", characters: [] };
  if (policy === undefined) {
    return unattributed;
  }
  const verdict = resolveCardScriptVerdict({ step: policy.htmlTrust, viewerRuns: subject.viewerRunsScripts });
  if (verdict.runs) {
    return undefined;
  }
  switch (verdict.heldBy) {
    case "character": {
      // A seat with no card, or a room with no consenting host, never reaches the interactive step, and no setting
      // of a character's lifts it.
      if (source === "no-card" || source === "no-host" || bound.length === 0) {
        return unattributed;
      }
      // An inheriting character's step is the install's default: the admin lifts it there, and the host by giving the
      // character its own Interactive step, the same remedies as a plain row's.
      const inherited = source === "inherited";
      return {
        kind: "scripts",
        cause: inherited ? "install-scripts" : "character-scripts",
        remedy: plainRemedy(inherited ? "install" : "character", subject.viewerIsHost, viewerIsAdmin),
        characters: namedCharacters(bound, subject.participants),
      };
    }
    case "viewer":
      return { kind: "scripts", cause: "viewer-scripts", remedy: "own-scripts", characters: [] };
    default:
      return assertNeverHolder(verdict.heldBy);
  }
}

/** What one framed card or styled reply on a row was granted and what its markup asks for, as the frame reports it to
 *  the row's one trust notice. `granted` is the server's answer for this document, never a guess from the roster. */
export interface FrameTrustFacts {
  /** The mint selector (`CardOrigin.characterId`). */
  readonly characterId: CharacterId | null;
  /** The other characters whose stylesheets the document carries; each one's media setting also holds its media. */
  readonly carriedFrom: readonly CharacterId[];
  readonly granted: { readonly externalMedia: boolean; readonly interactive: boolean };
  /** Whether the markup needs scripts the posture decides: false on the srcdoc floor, which runs none under any setting. */
  readonly needsScripts: boolean;
  /** Whether the markup or its stylesheet names internet media. */
  readonly needsMedia: boolean;
}

/** The reads a framed hold is named from, every one already on each member's roster, auth config and settings. */
export interface FramedHoldReads {
  readonly participants: ReadonlyMap<CharacterId, ParticipantView>;
  readonly narrator: NarratorRenderPolicy | undefined;
  readonly installForbids: boolean;
  readonly viewerRunsScripts: boolean;
  readonly viewerIsHost: boolean;
}

/** What a plain row's own content asks for beside its styling. */
export interface PlainContentNeeds {
  readonly scripts: boolean;
  readonly media: boolean;
}

/** Every kind a `tierA` row holds back. Its scripts share its styling's cause: a plain row's step is below Interactive,
 *  and the setting that lifts its styling decides its scripts. Its media is held by the same verdict its frame would
 *  take, or by its author when no character's setting covers it. */
export function resolvePlainHolds(subject: PlainSubject, needs: PlainContentNeeds, viewerIsAdmin: boolean): readonly TrustHold[] {
  const styling = resolvePlainVerdict(subject, viewerIsAdmin);
  const shared = { cause: styling.reason, remedy: styling.remedy, characters: styling.characters };
  const holds: TrustHold[] = [{ kind: "styling", ...shared }];
  if (needs.scripts) {
    holds.push({ kind: "scripts", ...shared });
  }
  if (needs.media) {
    // Another person's row, or one no character's setting covers, holds its media for the cause that holds its styling.
    if (subject.author !== "character") {
      holds.push({ kind: "media", ...shared });
    } else if (subject.media !== undefined) {
      holds.push(mediaHold({ ...subject.media, viewerIsHost: subject.viewerIsHost }, viewerIsAdmin));
    }
  }
  return holds;
}

/** Every kind a framed document holds back, read off its grant; the verdicts only name the holder. Nothing while the
 *  roster says the kind loads, because then the grant is a mint the next one corrects, not a setting to name. */
export function resolveFramedHolds(frame: FrameTrustFacts, reads: FramedHoldReads, viewerIsAdmin: boolean): readonly TrustHold[] {
  const holds: TrustHold[] = [];
  if (frame.needsScripts && !frame.granted.interactive) {
    const scripts = resolveFramedScriptVerdict({ characterId: frame.characterId, ...reads }, viewerIsAdmin);
    if (scripts !== undefined) {
      holds.push(scripts);
    }
  }
  if (frame.needsMedia && !frame.granted.externalMedia) {
    // The frame's own author first, then each author whose stylesheet it carries: the first that withholds is named.
    const media = [frame.characterId, ...frame.carriedFrom]
      .map((author) => resolveFramedMediaVerdict({ characterId: author, ...reads }, viewerIsAdmin))
      .find((found) => found !== undefined);
    if (media !== undefined) {
      holds.push(media);
    }
  }
  return holds;
}

const holdKey = (hold: TrustHold): string => [hold.kind, hold.cause, ...hold.characters.map((character) => character.characterId)].join(" ");

/** One row's holds, once each, in {@link HELD_KINDS} order: a row with several frames that hold the same kind for the
 *  same cause says it once. */
export function mergeTrustHolds(holds: readonly TrustHold[]): readonly TrustHold[] {
  const unique = new Map<string, TrustHold>();
  for (const hold of holds) {
    unique.set(holdKey(hold), unique.get(holdKey(hold)) ?? hold);
  }
  return [...unique.values()].toSorted((left, right) => HELD_KINDS.indexOf(left.kind) - HELD_KINDS.indexOf(right.kind));
}

// The remedies that open a control. The rest tell the viewer who can change it, or that nothing does.
const ACTION_REMEDIES: ReadonlySet<PlainRemedy> = new Set<PlainRemedy>(["character-trust", "system-trust", "own-scripts"]);

/** The one hold whose control a row's notice opens: the first, in kind order, that this viewer can change. Another hold
 *  the viewer can also change is named by its cause, and the control it opens is the same Character trust block or the
 *  viewer's own switch the cause names. */
export function actionHold(holds: readonly TrustHold[]): TrustHold | undefined {
  return holds.find((hold) => ACTION_REMEDIES.has(hold.remedy) && (hold.remedy !== "character-trust" || hold.characters.length > 0));
}

function assertNeverHolder(holder: never): never {
  throw new Error(`render-trust: unhandled holder ${String(holder)}`);
}

/** The characters a row's policy is read from, with that policy as the server resolved it. */
interface RowAuthor {
  readonly characterIds: readonly CharacterId[];
  readonly policy: RenderPolicy | undefined;
  readonly source: RenderPolicySource | undefined;
}

// A narrator row voices the whole room, so it reads the policy the server bounded by the present characters, and its
// subjects are the characters whose settings bind that policy. One with no character id floors, as its card frame does:
// the frame route cannot bind that row to the request.
function rowAuthor(input: ResolveRowRenderPolicyInput): RowAuthor {
  if (input.kind === "narrator") {
    const narrator = input.characterId === null ? undefined : input.narrator;
    return { characterIds: narrator?.characterIds ?? [], policy: narrator?.renderPolicy, source: narrator?.renderSource };
  }
  const seat = input.characterId === null ? undefined : input.participants?.get(input.characterId);
  return { characterIds: input.characterId === null ? [] : [input.characterId], policy: seat?.renderPolicy, source: seat?.renderSource };
}

export function resolveRowRenderPolicy(input: ResolveRowRenderPolicyInput): RowRenderPolicy {
  const { role, authorUserId, viewerUserId } = input;

  const { characterIds, policy: resolved, source } = rowAuthor(input);
  const policy: RenderPolicy = resolved ?? SAFE_FLOOR;

  const isOwnUserMessage = role === "user" && authorUserId !== null && authorUserId === viewerUserId;

  const trust: RenderTrust = isOwnUserMessage || rendersTrustedHtml(policy.htmlTrust) ? "trusted" : "untrusted";
  const lenientCards = input.lenientHtmlCards === true;
  // EITHER consent grants the sandboxed tier — see the field doc. Both come from the host or the box (the
  // character's resolved step, or the room's immersive-HTML switch); neither is anything the MODEL can assert.
  const cardTier: CardTier = trust === "trusted" || lenientCards ? "tierB" : "tierA";
  const viewerIsHost = input.viewerIsHost === true;
  const { external } = resolveCardMediaVerdict({ installForbids: input.installForbidsExternalMedia, policy });
  const base = {
    trust,
    // The viewer's own media reveals their address only to hosts they chose, so it follows the install alone. Another
    // member's media stays click-to-load: a pixel there would reveal every viewer.
    allowExternal: isOwnUserMessage ? !input.installForbidsExternalMedia : external.loads,
    lenientCards,
    colorQuotes: input.colorQuotedSpeech !== false,
    cardTier,
    heldCards: input.gameCardsOff === true ? { viewerIsHost } : undefined,
  };
  if (cardTier === "tierB") {
    return base;
  }
  return { ...base, plain: plainSubjectOf(input, { characterIds, resolved, source, external }) };
}

// Whose content a `tierA` row is, with what its own policy says about its styling and its media.
function plainSubjectOf(
  input: ResolveRowRenderPolicyInput,
  row: Pick<RowAuthor, "characterIds" | "source"> & {
    readonly resolved: RenderPolicy | undefined;
    readonly external: ReturnType<typeof resolveCardMediaVerdict>["external"];
  },
): PlainSubject {
  const { characterIds, resolved, source, external } = row;
  let author: PlainSubject["author"] = "unattributed";
  if (input.role === "user") {
    author = "member";
  } else if (resolved !== undefined) {
    author = "character";
  }
  const viewerIsHost = input.viewerIsHost === true;
  if (author !== "character") {
    return { author, source: undefined, characters: [], viewerIsHost };
  }
  return {
    author,
    source,
    characters: namedCharacters(characterIds, input.participants),
    media: external.loads
      ? undefined
      : {
          heldBy: external.heldBy,
          // A narrator row's media is forbidden when any present seat's is, so every such seat holds it.
          forbidders: mediaForbidders(input.kind === "narrator" ? [...(input.participants?.keys() ?? [])] : characterIds, input.participants),
          participants: input.participants,
        },
    viewerIsHost,
  };
}
