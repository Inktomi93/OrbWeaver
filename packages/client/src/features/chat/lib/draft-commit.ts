// The draft→committed COMMIT bridge (P4): resolve a draft's founding cast + its pre-send `draft-config`
// edits into the `chat.startChat` carry-params. ONE home for the carry-param contract because there are
// TWO commit paths that must stay byte-identical to each other AND to the server wire schema (§13.0 —
// duplication that changes together belongs in one place): the composer Send (`use-send-message.ts`) and
// the wand "Guide the opening" (`use-guided-actions.ts`).
//
// SPARSE BY CONSTRUCTION: only a TOUCHED field rides the carry, so an untouched draft commits exactly as
// today's plain new chat (the server `StartChatParams` treats an absent field as its default). The
// founding cast folds the draft's added members into the seed roster; `readonly` arrays are copied to the
// mutable shape the wire schema infers at the one call boundary (the `characterIds` precedent).

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { ChatHandle, DraftConfig, DraftRosterOverride, DraftSeed } from "#state";
import { EMPTY_DRAFT_CONFIG, readDraftConfig, resolveDraftCharacterIds } from "#state";

/** The `chat.startChat` draft carry-params (each optional/sparse — absent ⇒ the server default). Mirrors
 *  the wire schema's optional fields; `characterIds` is the resolved founding cast (seed ∪ added). */
export interface DraftCarry {
  readonly seedGreetings?: Readonly<Record<CharacterId, string>>;
  readonly rosterOverrides?: Readonly<Record<CharacterId, DraftRosterOverride>>;
  readonly groupConfig?: NonNullable<DraftConfig["groupConfig"]>;
  readonly roomOverrides?: NonNullable<DraftConfig["roomOverrides"]>;
  readonly injections?: NonNullable<DraftConfig["injections"]>[number][];
  /** #40 — the staged "turn on RPG" overlay intent (mints the lite game before the opening turn). */
  readonly startAsGame?: NonNullable<DraftConfig["startAsGame"]>;
  /** ST "Temporary Chat" (PD-65) — born ephemeral. Rides the SEED, not the draft-config store: it is a
   *  creation intent the launcher sets, not something the draft panel edits (the column is written only
   *  at `startChat`). Sparse: absent ⇒ a byte-identical plain new chat. */
  readonly temporary?: true;
}

/** A resolved draft commit: the founding cast, the sparse carry, and the `draftKey` to clear on success
 *  (null when the handle isn't a draft — a committed re-send carries nothing). */
export interface DraftCommit {
  readonly draftKey: string | null;
  readonly characterIds: CharacterId[];
  readonly carry: DraftCarry;
}

/** Read the active draft's config + seed into the `startChat` commit shape. Non-reactive (a commit-time
 *  snapshot, like `readDraftConfig`). A committed handle yields an empty carry + the (empty) seed cast. */
export function resolveDraftCommit(handle: ChatHandle, draftSeed: DraftSeed | undefined): DraftCommit {
  const draftKey = handle.kind === "draft" ? handle.draftKey : null;
  const config = draftKey === null ? EMPTY_DRAFT_CONFIG : readDraftConfig(draftKey);
  const characterIds = resolveDraftCharacterIds(draftSeed?.characterIds, config.addedCharacterIds);
  const carry: DraftCarry = {
    ...(config.greetings !== undefined ? { seedGreetings: config.greetings } : {}),
    ...(config.rosterOverrides !== undefined ? { rosterOverrides: config.rosterOverrides } : {}),
    ...(config.groupConfig !== undefined ? { groupConfig: config.groupConfig } : {}),
    ...(config.roomOverrides !== undefined ? { roomOverrides: config.roomOverrides } : {}),
    ...(config.injections !== undefined ? { injections: [...config.injections] } : {}),
    ...(config.startAsGame !== undefined ? { startAsGame: config.startAsGame } : {}),
    // From the SEED, not the config: the temp-chat launcher stamps it at `startNewChat`.
    ...(draftSeed?.temporary === true ? { temporary: true as const } : {}),
  };
  return { draftKey, characterIds, carry };
}

/** The inputs of the anchor-seed chain — every rung resolved to data a CLIENT honestly holds (the owned
 *  persona list types + ownership-filters the two lenient `seeds.*` id strings, exactly as the server's
 *  `resolveCurrentPersona`/`resolveDefaultPersona` do by re-reading the persona as its owner). */
export interface DraftAnchorPersonaInput {
  readonly seedAnchorPersonaId: PersonaId | null;
  /** The viewer's owned personas, id-only (`persona.list`) — the ownership filter for the seed pointers. */
  readonly ownedPersonaIds: readonly PersonaId[];
  /** `persona.listConnectedToCharacter` for a SOLO founding cast; empty for a group (the server's rung is
   *  gated on `characterIds.length === 1`, so a group founding never consults connections). */
  readonly connectedPersonaIds: readonly PersonaId[];
  /** `UserSettings.seeds.currentPersonaId` — a lenient string that may name a deleted/foreign persona. */
  readonly currentPersonaId: string | null;
  readonly defaultPersonaId: string | null;
}

const SOLE_CONNECTION = 1;

/** Which persona the draft's `{{user}}`/`{{persona}}` resolve against — i.e. the anchor `chat.startChat`
 *  WILL write when this draft commits. A MIRROR of the server's anchor seed chain (`verbs/start-chat.ts`:
 *  explicit anchor \> the connected persona of a solo founding \> the starter's current \> their default),
 *  kept here beside the commit carry it predicts: the greeting the room shows before send must address the
 *  same persona it will address after, and the draft has no chat row to read an anchor from. */
export function resolveDraftAnchorPersona(input: DraftAnchorPersonaInput): PersonaId | null {
  if (input.seedAnchorPersonaId !== null) {
    return input.seedAnchorPersonaId;
  }
  const [soleConnected] = input.connectedPersonaIds;
  if (input.connectedPersonaIds.length === SOLE_CONNECTION && soleConnected !== undefined) {
    return soleConnected;
  }
  // A stale/foreign pointer degrades to the next rung, never to a name the commit won't use.
  return input.ownedPersonaIds.find((id) => id === input.currentPersonaId) ?? input.ownedPersonaIds.find((id) => id === input.defaultPersonaId) ?? null;
}
