// The DRAFT-CONFIG store (J2/J3 — a new chat is fully editable BEFORE it exists on the server). A draft
// chat (`ChatHandle` kind `"draft"`, keyed by its `draftKey`) has no server row, so its pre-send edits —
// the swiped/typed greeting, roster mute/talkativeness, group config, room overrides, authored injections —
// have nowhere to persist yet. They live HERE, keyed by `draftKey`, and the FIRST send hands the whole
// config to `chat.startChat`'s carry-params (use-send-message.ts), which persists them atomically at
// creation (server `StartChatParams` — seedGreetings/rosterOverrides/groupConfig/roomOverrides/injections).
//
// This is the orbweaver way, NOT neo's model-b: there is NO `isOptimistic` boolean and NO seeded query
// caches (chat-handle.ts rejects that). The draft is a distinct `ChatHandle` variant carrying its own
// state; the editing surfaces route their save/seed seam to this store when the handle is a draft, and to
// the committed verbs otherwise (the ONE branch per concern — the room-overrides/roster/group editors).
//
// `createGatedStore` (not `createEntityDraftStore`): draft config is transient device-local pre-commit
// state, NOT the crash-survival localStorage mirror the persist factory is for (the `message-edit-draft`
// precedent). Sparse by construction — an absent key/field ⇒ the server's plain-new-chat default, so an
// untouched draft commits byte-identical. Cleared on commit (or discard) via `clearDraftConfig`.

import type { ChatInjectionInput, GroupConfigInput, RoomOverrides } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

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
}

/** The frozen default-ref (selector-stability floor, UI-Gates §7 row 4) — every read of an untouched
 *  draft returns THIS exact object, so a subscribing surface never re-renders on an identity churn. */
export const EMPTY_DRAFT_CONFIG: DraftConfig = Object.freeze({});

interface DraftConfigState {
  readonly configs: Readonly<Record<string, DraftConfig>>;
}

const useDraftConfigStore = createGatedStore<DraftConfigState>(
  "draft-config",
  (): DraftConfigState => ({ configs: {} }),
);

/** Non-reactive snapshot of one draft's config (commit reads it; tests). Untouched ⇒ the frozen empty. */
export function readDraftConfig(draftKey: string): DraftConfig {
  return useDraftConfigStore.getState().configs[draftKey] ?? EMPTY_DRAFT_CONFIG;
}

/** Merge a field patch into one draft's config (the single write chokepoint). */
function patchDraftConfig(draftKey: string, patch: Partial<DraftConfig>): void {
  const { configs } = useDraftConfigStore.getState();
  const next = { ...(configs[draftKey] ?? EMPTY_DRAFT_CONFIG), ...patch };
  useDraftConfigStore.setState(
    { configs: { ...configs, [draftKey]: next } },
    false,
    "draft-config/patch",
  );
}

/** Set one founding character's raw opening text (swipe → `greetings[idx]`; edit → typed). `""` clears it
 *  to the card default at commit (the empty-greeting seed-skip). */
export function setDraftGreeting(draftKey: string, characterId: CharacterId, text: string): void {
  const { greetings } = readDraftConfig(draftKey);
  patchDraftConfig(draftKey, { greetings: { ...greetings, [characterId]: text } });
}

/** Merge one founding character's roster tuning (mute/talkativeness). */
export function setDraftRosterOverride(
  draftKey: string,
  characterId: CharacterId,
  override: DraftRosterOverride,
): void {
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
export function setDraftInjections(
  draftKey: string,
  injections: readonly ChatInjectionInput[],
): void {
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
