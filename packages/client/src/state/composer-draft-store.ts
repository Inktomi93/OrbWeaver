// The composer DRAFT store (D70 client commons) — the chat composer's in-progress text, lifted out of a
// ChatRoomSurface-local `useState` into chat-scoped client state so it survives a surface remount
// (draft-loss on remount is a real papercut). The draft is ephemeral client state, never a server value —
// chat owns the read (Composer `value`/`onChange`) + the send-clear (an empty `onChange("")`). Keyed by a
// stable per-room SCOPE KEY (a committed chat's `ChatId`, or a draft's `draftKey`); an unseen scope reads
// "". Not persisted (an unsent draft is transient; matches the prior local state).

import { createGatedStore } from "./create-gated-store";

interface ComposerDraftState {
  /** Per-room draft text (`scopeKey → text`); an absent scope reads "". */
  readonly drafts: Readonly<Record<string, string>>;
}

const useComposerDraftStore = createGatedStore<ComposerDraftState>("composer-draft", (): ComposerDraftState => ({ drafts: {} }));

/** Replace a room's draft text (the composer's `onChange`). */
export function setComposerDraft(scopeKey: string, text: string): void {
  const { drafts } = useComposerDraftStore.getState();
  useComposerDraftStore.setState({ drafts: { ...drafts, [scopeKey]: text } }, false, "composerDraft/set");
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
