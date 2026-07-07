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

import type { CharacterId } from "@orb/kit/ids";
import type { ChatHandle, DraftConfig, DraftRosterOverride, DraftSeed } from "#state";
import { EMPTY_DRAFT_CONFIG, readDraftConfig } from "#state";

/** The `chat.startChat` draft carry-params (each optional/sparse — absent ⇒ the server default). Mirrors
 *  the wire schema's optional fields; `characterIds` is the resolved founding cast (seed ∪ added). */
export interface DraftCarry {
  readonly seedGreetings?: Readonly<Record<CharacterId, string>>;
  readonly rosterOverrides?: Readonly<Record<CharacterId, DraftRosterOverride>>;
  readonly groupConfig?: NonNullable<DraftConfig["groupConfig"]>;
  readonly roomOverrides?: NonNullable<DraftConfig["roomOverrides"]>;
  readonly injections?: NonNullable<DraftConfig["injections"]>[number][];
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
export function resolveDraftCommit(
  handle: ChatHandle,
  draftSeed: DraftSeed | undefined,
): DraftCommit {
  const draftKey = handle.kind === "draft" ? handle.draftKey : null;
  const config = draftKey === null ? EMPTY_DRAFT_CONFIG : readDraftConfig(draftKey);
  const characterIds = [...(draftSeed?.characterIds ?? []), ...(config.addedCharacterIds ?? [])];
  const carry: DraftCarry = {
    ...(config.greetings !== undefined ? { seedGreetings: config.greetings } : {}),
    ...(config.rosterOverrides !== undefined ? { rosterOverrides: config.rosterOverrides } : {}),
    ...(config.groupConfig !== undefined ? { groupConfig: config.groupConfig } : {}),
    ...(config.roomOverrides !== undefined ? { roomOverrides: config.roomOverrides } : {}),
    ...(config.injections !== undefined ? { injections: [...config.injections] } : {}),
  };
  return { draftKey, characterIds, carry };
}
