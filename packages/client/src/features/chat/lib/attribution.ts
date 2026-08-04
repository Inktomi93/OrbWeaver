// Per-row attribution resolution — a pure function, unit-testable without mounting MessageRow, that
// never parses attribution from body text. Assistant rows resolve the server-stamped characterId
// against the roster; user rows resolve personaId (falling back to activePersonaId for legacy rows) but
// never go bare — a viewer's own row always labels as "You". A null characterId in a multi-character
// room is a neutral "Narrator", never participants[0] (which would misattribute a merged turn).
//
// Transcript-integrity floor: a character REMOVED from the room keeps its historical rows in the
// transcript ("their messages stay" — the removal-confirm promise), but its `ParticipantView` is gone.
// The name still resolves (`characterNamesById` covers every referenced id, removed or not); the AVATAR
// falls back to the participant-independent `characterAvatarsById` producer so a removal never degrades a
// historical portrait to bare initials. The live participant still WINS when present (its avatarHash can
// carry a per-chat override the character-level producer doesn't).

import type { ParticipantView } from "@orb/contracts/chat";
import { soleTrueSoloCharacter } from "@orb/contracts/chat";
import { cardEmbeddableSubset } from "@orb/contracts/theme";
import type { AssetId, CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { hueDistance, oklchHue } from "@orb/kit/safe-color";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { colorForCharacter } from "./speaker-color.ts";

export interface RowAttribution {
  /** `null` = render no attribution chrome. */
  readonly name: string | null;
  /** Which side of the two-kind cast this row's identity resolved from; `null` only alongside
   *  `name === null`. Consumers stamp it as `data-*`, never branch JSX on it. */
  readonly kind: "character" | "persona" | null;
  readonly avatarAssetId: AssetId | null;
  /** The avatar's CAS hash — `null` renders the initials fallback. */
  readonly avatarHash: string | null;
  /** Stable per-entity seed for the deterministic fallback hue — the same id the library card / chat
   *  header seed with, so one entity resolves to one color everywhere. */
  readonly hueSeed: string;
  /** Per-speaker theme tokens for the row's bubble; `null` for user rows and unresolved rows. */
  readonly tokens: ThemeScopeTokens | null;
}

const NO_ATTRIBUTION: RowAttribution = {
  name: null,
  kind: null,
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "",
  tokens: null,
};
const NARRATOR_ATTRIBUTION: RowAttribution = {
  name: "Narrator",
  kind: "character",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "narrator",
  tokens: null,
};
// "Traveler", not "You" (owner ruling 2026-08-03). Users are FORCED to hold a persona — boot seeds
// `Traveler` (entry/boot/seed-default-persona.ts) — so this branch is the unresolvable-persona floor, and
// naming it "You" reintroduces the very collision that rename was minted to kill: the model is shown the
// identity and writes it into the prose (seeder/demo-chats.ts:52 records exactly that happening). One
// spelling, one L, matching the seeded persona.
const DEFAULT_USER_ATTRIBUTION: RowAttribution = {
  name: "Traveler",
  kind: "persona",
  avatarAssetId: null,
  avatarHash: null,
  hueSeed: "you",
  tokens: null,
};

export interface ResolveRowAttributionInput {
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly personaId: PersonaId | null;
  readonly participants?: ReadonlyMap<CharacterId, ParticipantView> | undefined;
  readonly characterNamesById?: ReadonlyMap<CharacterId, RowCharacterName> | undefined;
  readonly personaNamesById?: ReadonlyMap<PersonaId, RowPersonaName> | undefined;
  readonly personaAvatarsById?: ReadonlyMap<PersonaId, string | null> | undefined;
  /** The assistant-row portrait floor: `characterId → avatarHash` covering every character the chat
   *  references (incl. one removed from the room). Used only when the live participant is absent. */
  readonly characterAvatarsById?: ReadonlyMap<CharacterId, string | null> | undefined;
  /** Fallback for LEGACY rows with a null personaId; never the chat's anchorPersonaId pin.
   *
   *  ⚠️ ONLY APPLIED TO THE VIEWER'S OWN ROWS (see `resolveUserAttribution`). It is the VIEWER's active
   *  persona, so applying it to a row someone else authored renames THEIR message to YOURS. Live
   *  2026-08-03: a member joined with an unbound seat (`activePersonaId` null → rows persist
   *  `personaId` null), and every one of his turns rendered as the host. The row's `authorUserId` is
   *  what makes the fallback safe — without it this is an identity bug, not a cosmetic one. */
  readonly activePersonaId?: PersonaId | null | undefined;
  /** The row's author, and the viewer — the pair that decides whether the legacy `activePersonaId`
   *  fallback may fire. Both null ⇒ no fallback (fail-closed: name nobody rather than name wrongly). */
  readonly authorUserId?: UserId | null | undefined;
  readonly viewerUserId?: UserId | null | undefined;
  /**
   * The room's output mode is NARRATOR (`group.output === "narrator"`) — every assistant row is one merged,
   * narrator-voiced turn, which is the SAME predicate `MessageRow.isNarratorVoiced` gates the in-body
   * speaker-span grammar on.
   *
   * It exists because `NARRATOR_ATTRIBUTION` was UNREACHABLE in exactly the room it was written for
   * (side-eye 2026-08-03 P1). A narrator turn is persisted against the room's SYNTHETIC group character
   * (`domain/character/substrate/group-character.ts` — handle `__group__<chatId>`, card name **"Group"**, a
   * never-rendered memory bucket by its own header), and that id is a real `characters` row, so it rides the
   * chat's `characterNames` producer like any cast member. The `characterId === null` branch below therefore
   * never fired: every row resolved a name — "Group" — and an id-hashed magenta tint, and the reader was
   * shown a fake cast member in a room that has none.
   */
  readonly narratorRoom?: boolean | undefined;
}

export function resolveRowAttribution(input: ResolveRowAttributionInput): RowAttribution {
  if (input.role === "user") {
    return resolveUserAttribution(input);
  }
  if (input.role === "assistant") {
    return resolveAssistantAttribution(input);
  }
  return NO_ATTRIBUTION;
}

function resolveUserAttribution(input: ResolveRowAttributionInput): RowAttribution {
  // The legacy fallback fires ONLY on the viewer's own row. `activePersonaId` is the VIEWER's persona, so
  // letting it cover another author's null-persona row renames their message to the viewer's identity —
  // measured live 2026-08-03. Unknown author or unknown viewer ⇒ no fallback (fail closed).
  const ownRow = input.authorUserId !== null && input.authorUserId !== undefined && input.authorUserId === input.viewerUserId;
  const personaId = input.personaId ?? (ownRow ? (input.activePersonaId ?? null) : null);
  const persona = personaId === null ? undefined : input.personaNamesById?.get(personaId);
  if (persona === undefined) {
    return DEFAULT_USER_ATTRIBUTION;
  }
  const avatarHash = (personaId === null ? undefined : input.personaAvatarsById?.get(personaId)) ?? null;
  return {
    name: persona.name,
    kind: "persona",
    avatarAssetId: null,
    avatarHash,
    hueSeed: personaId ?? "you",
    tokens: null,
  };
}

function resolveAssistantAttribution(input: ResolveRowAttributionInput): RowAttribution {
  // A narrator room's assistant row IS the narrator, whatever producer id the write stamped on it — see
  // `narratorRoom`. This has to lead: the stamped id resolves to a name, so every branch below it succeeds.
  if (input.narratorRoom === true) {
    return NARRATOR_ATTRIBUTION;
  }
  if (input.characterId === null) {
    return isMultiCharacterRoom(input.participants) ? NARRATOR_ATTRIBUTION : NO_ATTRIBUTION;
  }
  const name = input.characterNamesById?.get(input.characterId)?.name;
  if (name === undefined) {
    return NO_ATTRIBUTION;
  }
  const participant = input.participants?.get(input.characterId);
  const tokens = characterTint(input.characterId, participant?.themeOverride, false);
  // The live participant wins (it can carry a per-chat avatar override); once removed it's absent, so the
  // portrait falls back to the character-level producer — never straight to the initials fallback.
  const avatarHash = participant?.avatarHash ?? input.characterAvatarsById?.get(input.characterId) ?? null;
  return {
    name,
    kind: "character",
    avatarAssetId: participant?.avatarAssetId ?? null,
    avatarHash,
    hueSeed: input.characterId,
    tokens,
  };
}

function isMultiCharacterRoom(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): boolean {
  if (participants === undefined) {
    return false;
  }
  const MultiCharacterFloor = 1;
  let characterCount = 0;
  for (const participant of participants.values()) {
    if (participant.kind === "character") {
      characterCount += 1;
      if (characterCount > MultiCharacterFloor) {
        return true;
      }
    }
  }
  return false;
}

/** In a true-solo room (exactly one human and one character, no other seat) the character's authored
 *  themeOverride takes over the chat-root chrome; any other composition falls back to the viewer's own
 *  theme. The composition is NOT re-spelled here: `soleTrueSoloCharacter` (contracts/chat) is the ONE
 *  home its header already claims to be, shared with the card-carried arm of the background takeover.
 *  What rides is the CARD-EMBEDDABLE subset only — a card supplies the room's look, never the viewer's
 *  ergonomics (TD §3). */
export function resolveRoomTheme(participants: readonly ParticipantView[] | undefined): ThemeScopeTokens | undefined {
  const override = soleTrueSoloCharacter(participants)?.themeOverride;
  return override === null || override === undefined ? undefined : cardEmbeddableSubset(override);
}

/** THE ONE per-character tint resolution — the authored `themeOverride` when it carries anything, else the
 *  deterministic hash. The hash is ALWAYS seeded by the CHARACTER ID, never the display name: a name-seeded
 *  hash forked one character into TWO colors (their own per-speaker row hashed the id, their span inside a
 *  merged-narrator row hashed the name), which is exactly the "coloring is wrong" a reader sees. Both the
 *  row-level attribution above and the narrator-span map below resolve through here, so that class of fork
 *  cannot come back. `projected` runs the override through the CARD-EMBEDDABLE subset — true for a span
 *  INSIDE a bubble (a card supplies look, never the viewer's ergonomics, TD §3), false for the row itself. */
function characterTint(characterId: CharacterId, override: ThemeScopeTokens | null | undefined, projected: boolean): ThemeScopeTokens {
  if (override === null || override === undefined) {
    return colorForCharacter(characterId);
  }
  const carried = projected ? cardEmbeddableSubset(override) : override;
  return Object.keys(carried).length > 0 ? carried : colorForCharacter(characterId);
}

/** For the merged-narrator speaker-split path: display NAME -\> that character's tint, resolved through the
 *  ONE {@link characterTint} home. EVERY seated character is included (an override-less member resolves to
 *  its id-seeded hash) — the map is therefore also the room's PRESENT CAST-NAME set, which is what the
 *  plain-`Name:` half of the span parse keys on. */
export function speakerThemesByName(participants: ReadonlyMap<CharacterId, ParticipantView> | undefined): ReadonlyMap<string, ThemeScopeTokens> {
  const byName = new Map<string, ThemeScopeTokens>();
  if (participants === undefined) {
    return byName;
  }
  const claimedHues: number[] = [];
  for (const participant of participants.values()) {
    if (participant.kind !== "character" || participant.characterId === null) {
      continue;
    }
    const tint = characterTint(participant.characterId, participant.themeOverride, true);
    const resolved = deCollideDialogueHue(participant.characterId, tint, claimedHues);
    const hue = resolved.dialogueColor === undefined ? null : oklchHue(resolved.dialogueColor);
    if (hue !== null) {
      claimedHues.push(hue);
    }
    byName.set(participant.displayName, resolved);
  }
  return byName;
}

/** How far apart two speakers' DIALOGUE hues must sit before a reader can tell them apart at all. Measured,
 *  not chosen: the demo room shipped `oklch(0.85 0.10 80)` beside `oklch(0.85 0.08 72)` — 8° at one
 *  lightness — and the two speakers' spans read as one colour, so the feature looked broken in the room
 *  built to show it off (side-eye 2026-08-03 P2). 24° is the smallest separation that survives a body-text
 *  span at this app's fixed L/C. */
const MIN_DIALOGUE_HUE_SEPARATION = 24;

/**
 * Keep one room's dialogue spans distinguishable.
 *
 * The tints come from AUTHORED `themeOverride`s, which carry no cross-member guarantee — two cards written
 * months apart by different people land wherever they land. When an authored dialogue hue falls inside
 * {@link MIN_DIALOGUE_HUE_SEPARATION} of one a speaker earlier in the roster already holds, this speaker's
 * dialogue (and only its dialogue) falls back to the deterministic id-hash, which is spread across the whole
 * wheel by construction. Everything else the card authored — speaker name colour, narration, bubble — is
 * untouched: the card's look is its own, and only the ONE token that has to be legible AGAINST A SIBLING is
 * arbitrated. A non-oklch authored value is left alone entirely (`oklchHue` returns null — see its header:
 * no de-collision against a fabricated number).
 */
function deCollideDialogueHue(characterId: CharacterId, tint: ThemeScopeTokens, claimedHues: readonly number[]): ThemeScopeTokens {
  const dialogue = tint.dialogueColor;
  const hue = dialogue === undefined ? null : oklchHue(dialogue);
  if (hue === null || !claimedHues.some((claimed) => hueDistance(claimed, hue) < MIN_DIALOGUE_HUE_SEPARATION)) {
    return tint;
  }
  return { ...tint, dialogueColor: colorForCharacter(characterId).dialogueColor };
}
