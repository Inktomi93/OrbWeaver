// A new chat is fully editable before it exists on the server. A draft chat has no server row, so its
// pre-send edits (greeting, roster tuning, group config, room overrides, injections) live here, keyed by
// draftKey, until the first send hands the whole config to chat.startChat's carry-params. Uses
// createGatedStore (not createEntityDraftStore): transient device-local pre-commit state, not a
// crash-survival localStorage mirror. Sparse by construction — absent key/field means server default.

import type { ChatInjectionInput, GroupConfigInput, RoomOverrides } from "@orb/contracts/chat";
import type { RpgStatProfile } from "@orb/contracts/rpg";
import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** One founding character's pre-send roster tuning (deviating fields only — absent ⇒ column default). */
export interface DraftRosterOverride {
  readonly disabled?: boolean;
  readonly talkativeness?: number;
}

/** One draft chat's editable pre-send config. Every field is optional + sparse: absent ⇒ the server's
 *  plain-new-chat default (byte-identical). Mirrors the `startChat` carry-params one-for-one. */
export interface DraftConfig {
  /** Raw chosen/edited opening text per founding character (swipe picks `greetings[idx]`; edit types it). */
  readonly greetings?: Readonly<Record<CharacterId, string>>;
  readonly rosterOverrides?: Readonly<Record<CharacterId, DraftRosterOverride>>;
  /** Members added to the founding cast pre-send (add-member) — folded into `characterIds` at commit. */
  readonly addedCharacterIds?: readonly CharacterId[];
  readonly groupConfig?: GroupConfigInput;
  readonly roomOverrides?: RoomOverrides;
  readonly injections?: readonly ChatInjectionInput[];
  /** #40 — the staged "turn on RPG" overlay intent: the first send carries it to `chat.startChat`, which
   *  mints the lite game BEFORE the opening turn (turn 1 in-game). `profile` omitted = freeform. */
  readonly startAsGame?: { readonly profile?: RpgStatProfile };
}

/** The frozen default-ref (selector-stability floor, UI-Gates §7 row 4) — every read of an untouched
 *  draft returns THIS exact object, so a subscribing surface never re-renders on an identity churn. */
export const EMPTY_DRAFT_CONFIG: DraftConfig = Object.freeze({});

interface DraftConfigState {
  readonly configs: Readonly<Record<string, DraftConfig>>;
}

const useDraftConfigStore = createGatedStore<DraftConfigState>("draft-config", (): DraftConfigState => ({ configs: {} }));

/** Non-reactive snapshot of one draft's config (commit reads it; tests). Untouched ⇒ the frozen empty. */
export function readDraftConfig(draftKey: string): DraftConfig {
  return useDraftConfigStore.getState().configs[draftKey] ?? EMPTY_DRAFT_CONFIG;
}

/** Merge a field patch into one draft's config (the single write chokepoint). */
function patchDraftConfig(draftKey: string, patch: Partial<DraftConfig>): void {
  const { configs } = useDraftConfigStore.getState();
  const next = { ...(configs[draftKey] ?? EMPTY_DRAFT_CONFIG), ...patch };
  useDraftConfigStore.setState({ configs: { ...configs, [draftKey]: next } }, false, "draft-config/patch");
}

/** Set one founding character's raw opening text (swipe → `greetings[idx]`; edit → typed). `""` clears it
 *  to the card default at commit (the empty-greeting seed-skip). */
export function setDraftGreeting(draftKey: string, characterId: CharacterId, text: string): void {
  const { greetings } = readDraftConfig(draftKey);
  patchDraftConfig(draftKey, { greetings: { ...greetings, [characterId]: text } });
}

/** Merge one founding character's roster tuning (mute/talkativeness). */
export function setDraftRosterOverride(draftKey: string, characterId: CharacterId, override: DraftRosterOverride): void {
  const { rosterOverrides } = readDraftConfig(draftKey);
  patchDraftConfig(draftKey, {
    rosterOverrides: {
      ...rosterOverrides,
      [characterId]: { ...rosterOverrides?.[characterId], ...override },
    },
  });
}

/** Replace the draft's group config (the group-config editor's save seam). */
export function setDraftGroupConfig(draftKey: string, groupConfig: GroupConfigInput): void {
  patchDraftConfig(draftKey, { groupConfig });
}

/** Replace the draft's room overrides (the room-overrides form's save seam). */
export function setDraftRoomOverrides(draftKey: string, roomOverrides: RoomOverrides): void {
  patchDraftConfig(draftKey, { roomOverrides });
}

/** Replace the draft's authored injections (the injections manager's save seam). */
/** Stage / clear the draft's #40 "turn on RPG" overlay intent (`undefined` clears — the toggle's off). */
export function setDraftStartAsGame(draftKey: string, startAsGame: { readonly profile?: RpgStatProfile } | undefined): void {
  // exactOptionalPropertyTypes: a clear DELETES the key (never stores an explicit-undefined slot).
  patchDraftConfig(draftKey, startAsGame === undefined ? {} : { startAsGame });
  if (startAsGame === undefined) {
    clearDraftConfigField(draftKey);
  }
}

/** Remove the `startAsGame` key from one draft's config (the exactOptionalPropertyTypes-safe clear). */
function clearDraftConfigField(draftKey: string): void {
  const { configs } = useDraftConfigStore.getState();
  const current = configs[draftKey];
  if (current === undefined || current.startAsGame === undefined) {
    return;
  }
  const { startAsGame: _cleared, ...rest } = current;
  useDraftConfigStore.setState({ configs: { ...configs, [draftKey]: rest } }, false, "draft-config/clear-start-as-game");
}

export function setDraftInjections(draftKey: string, injections: readonly ChatInjectionInput[]): void {
  patchDraftConfig(draftKey, { injections });
}

/** Append a member to the draft's cast (add-member) — deduped, folded into `characterIds` at commit. */
export function addDraftCharacter(draftKey: string, characterId: CharacterId): void {
  const { addedCharacterIds } = readDraftConfig(draftKey);
  if (addedCharacterIds?.includes(characterId) === true) {
    return;
  }
  patchDraftConfig(draftKey, { addedCharacterIds: [...(addedCharacterIds ?? []), characterId] });
}

/** Drop a draft's whole config — on commit (its edits now live on the created chat) or on discard. */
export function clearDraftConfig(draftKey: string): void {
  const { configs } = useDraftConfigStore.getState();
  if (configs[draftKey] === undefined) {
    return;
  }
  const next = { ...configs };
  delete next[draftKey];
  useDraftConfigStore.setState({ configs: next }, false, "draft-config/clear");
}

/** Reactive: one draft's whole config (the editing surfaces read what they need). Untouched ⇒ the frozen
 *  empty ref, so a surface subscribed to an untouched draft never re-renders on an unrelated draft's edit. */
export function useDraftConfig(draftKey: string): DraftConfig {
  return useDraftConfigStore((s) => s.configs[draftKey] ?? EMPTY_DRAFT_CONFIG);
}

/** A draft's founding cast: the seed roster + pre-send additions from the panel, in that order — the SAME
 *  union `resolveDraftCommit` writes to `chat.startChat`'s `characterIds`.
 *
 *  Homed in `#state` (not the chat feature) because it folds the two STATE shapes this tier owns — the
 *  active chat's `DraftSeed` and this store's `addedCharacterIds` — and it has consumers in two features:
 *  the chat room (greeting preview + the room-theme takeover) and the app-shell's carried-background
 *  resolver, which cannot import `#features/chat`. One spelling, or a draft's cast means one thing to the
 *  transcript and another to the chrome — which is exactly how the pre-send window drifted.
 *
 *  DEDUPED, first occurrence wins. There were THREE spellings of this union before (the commit bridge, the
 *  greeting preview, and `useChatContextState`) and only the context panel's deduped, so a character
 *  present in BOTH halves rendered one row in the Members tab, two greeting rows, and would have been
 *  written to `startChat` twice — two participant rows for one character. The strict spelling wins. */
export function resolveDraftCharacterIds(
  seedCharacterIds: readonly CharacterId[] | undefined,
  addedCharacterIds: readonly CharacterId[] | undefined,
): CharacterId[] {
  return [...new Set([...(seedCharacterIds ?? []), ...(addedCharacterIds ?? [])])];
}
