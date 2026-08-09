// The composer DRAFT store (D70 client commons) — the chat composer's in-progress text, lifted out of a
// ChatRoomSurface-local `useState` into chat-scoped client state so it survives a surface remount
// (draft-loss on remount is a real papercut). The draft is ephemeral client state, never a server value —
// chat owns the read (Composer `value`/`onChange`) + the send-clear (an empty `onChange("")`). Keyed by a
// stable per-room SCOPE KEY (a committed chat's `ChatId`, or a draft's `draftKey`); an unseen scope reads "".
//
// IT NOW SURVIVES A RELOAD (owner pick, 2026-08-09). This header used to say "Not persisted (an unsent
// draft is transient; matches the prior local state)" — the ruling is superseded, and only for the reload
// leg: text a user typed and did not send is theirs, and a refresh/crash/tab-restore losing it is the same
// papercut a remount was, one tier up. NAV-AWAY DISCARD IS DELIBERATELY NOT BUILT HERE (it is an owner
// design pass, still open on the board): this store persists, it never decides when a draft dies.
//
// THE PERSISTED BLOB IS BOUNDED AND SANITIZED, because a scopeKey→text map is unbounded by construction —
// one room per key, forever, in a ~5MB origin-wide localStorage every other `orb:*` store shares:
//   • an EMPTY draft never persists (a sent/cleared room writes "", which is the absence of a draft, not a
//     draft of nothing) — so the common case leaves no residue at all;
//   • the map is MRU-ORDERED (`setComposerDraft` re-seats the key it touches at the end) and capped, so the
//     eviction the cap performs drops the LEAST-recently-typed room rather than an arbitrary one;
//   • `migrate` is TOTAL — any corrupt/foreign blob degrades to an empty map. A draft mirror is cache, never
//     canon (#11 autosave doctrine), and must never brick the composer.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";

/** How many rooms' drafts survive a reload, least-recently-typed evicted first. Rooms a user typed in and
 *  never sent from are few; the cap exists so a long-lived install cannot grow this blob without bound. */
export const COMPOSER_DRAFT_CAP = 50;

const PERSIST_VERSION = 1;

interface ComposerDraftState {
  /** Per-room draft text (`scopeKey → text`), MRU-ordered — an absent scope reads "". */
  readonly drafts: Readonly<Record<string, string>>;
}

const DEFAULT_STATE: ComposerDraftState = { drafts: {} };

/** Keep only non-empty string entries, newest-last, capped. Shared by the write path and `migrate` so a
 *  rehydrated blob obeys exactly the same bounds a live write does. */
function bound(drafts: Readonly<Record<string, string>>): Record<string, string> {
  const kept = Object.entries(drafts).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "");
  return Object.fromEntries(kept.slice(-COMPOSER_DRAFT_CAP));
}

/** TOTAL, crash-proof migrate: any unknown/corrupt persisted blob degrades to an empty draft map. */
function migrate(persisted: unknown): ComposerDraftState {
  if (!(isPlainObject(persisted) && isPlainObject(persisted["drafts"]))) {
    return DEFAULT_STATE;
  }
  return { drafts: bound(persisted["drafts"] as Record<string, string>) };
}

const useComposerDraftStore = createPersistedStore<ComposerDraftState>("composer-draft", (): ComposerDraftState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): ComposerDraftState => ({ drafts: bound(s.drafts) }),
});

/** Replace a room's draft text (the composer's `onChange`). The touched key is RE-SEATED at the end of the
 *  map (delete-then-insert) so key order is most-recently-typed-last — the order the cap evicts by. */
export function setComposerDraft(scopeKey: string, text: string): void {
  const next = { ...useComposerDraftStore.getState().drafts };
  delete next[scopeKey];
  next[scopeKey] = text;
  useComposerDraftStore.setState({ drafts: next }, false, "composerDraft/set");
}

/** Move a draft from one scope key to another (draft→committed promotion keeps the in-flight text visible
 *  across the `draftKey → ChatId` key flip — the send is optimistic and the row may not have cleared yet). */
export function migrateComposerDraft(fromScopeKey: string, toScopeKey: string): void {
  const { drafts } = useComposerDraftStore.getState();
  const text = drafts[fromScopeKey];
  if (text === undefined) {
    return;
  }
  const next: Record<string, string> = { ...drafts, [toScopeKey]: text };
  delete next[fromScopeKey];
  useComposerDraftStore.setState({ drafts: next }, false, "composerDraft/migrate");
}

/** Reactive: a room's current draft text (defaults to "" when unset). */
export function useComposerDraft(scopeKey: string): string {
  return useComposerDraftStore((s) => s.drafts[scopeKey] ?? "");
}

/** Non-hook snapshot — for the store's own tests + any read outside a render (the `__readRecentModelsForTest`
 *  precedent; the reactive hook needs a React render). */
export function __readComposerDraftsForTest(): Readonly<Record<string, string>> {
  return useComposerDraftStore.getState().drafts;
}

/** Drop every draft — test-only hygiene (a module singleton must not leak state across tests). */
export function __resetComposerDrafts(): void {
  useComposerDraftStore.setState({ drafts: {} }, false, "composerDraft/clearAll");
}
