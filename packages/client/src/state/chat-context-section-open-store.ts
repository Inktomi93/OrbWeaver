// "THIS CHAT" SECTION DISCLOSURE — which sections of the chat CONTEXT tab are expanded, remembered per
// device (#830, the #821 residue).
//
// WHY IT EXISTS: with the injection rows collapsed (#821) the tab still settled at 2,836px desktop across
// FOURTEEN sections — Host controls' eight alone are 1,880px — so Documents and World books were still below
// the fold and a host at the top of the pane had 14 competing destinations and no map of them (side-eye
// 2026-08-30 §7: "a section index or a collapse-all is the missing
// affordance"). Making every section a disclosure turns the closed pane INTO that index — each kicker keeps
// its count chip, so the map carries "Documents 1 · World books 2" without spending a line of chrome on a
// second navigation element in a pane the same review praised as chrome-clean.
//
// WHY PER DEVICE: "World books open, Host controls closed" is a working posture on THIS screen, not a
// preference that should follow a user to a phone whose fold is 300px shorter — the `config-group-open` /
// `character-library` browse-prefs precedent (§12.1). Registered as device-local in
// tooling/src/verify/gates/persistence-boundary.ts.
//
// THE STORED SHAPE IS A SPARSE Record<string, boolean>, NOT a list of open ids: sections do not share ONE
// default (Field overrides and Injections open, the racks and the host band closed), so "absent from the
// open list" cannot distinguish "the user closed Field overrides" from "never touched". An ABSENT key means
// "this section's own default"; a present key is the user's explicit answer. Ids are host-opaque strings —
// the grafted §6c contributions bring their own — so there is no vocabulary tuple to be total over and an
// unknown persisted key is simply a section that no longer registers (one dead entry, dropped on next
// write of that id).

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";

interface ChatContextSectionOpenState {
  /** Sparse: only the sections the user has explicitly toggled. Absent = that section's own default. */
  readonly open: Readonly<Record<string, boolean>>;
}

const DEFAULT_STATE: ChatContextSectionOpenState = { open: {} };

const PERSIST_VERSION = 1;

function sanitizeOpen(v: unknown): Readonly<Record<string, boolean>> {
  if (!isPlainObject(v)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(v)) {
    if (typeof value === "boolean") {
      out[id] = value;
    }
  }
  return out;
}

function migrate(persisted: unknown): ChatContextSectionOpenState {
  return { open: sanitizeOpen(isPlainObject(persisted) ? persisted["open"] : undefined) };
}

const useChatContextSectionOpenStore = createPersistedStore<ChatContextSectionOpenState>(
  "chat-context-sections",
  (): ChatContextSectionOpenState => DEFAULT_STATE,
  {
    version: PERSIST_VERSION,
    migrate,
    partialize: (s): ChatContextSectionOpenState => ({ open: s.open }),
  },
);

/** Reactive: is this section expanded? `fallback` is the section's own default, used until the user has
 *  answered for it. A boolean selector (no fresh object per render). */
export function useChatContextSectionOpen(id: string, fallback: boolean): boolean {
  return useChatContextSectionOpenStore((s) => s.open[id] ?? fallback);
}

/** Record the user's answer for one section (the kicker disclosure). */
export function setChatContextSectionOpen(id: string, open: boolean): void {
  const { open: current } = useChatContextSectionOpenStore.getState();
  useChatContextSectionOpenStore.setState({ open: { ...current, [id]: open } }, false, "chatContextSections/setOpen");
}

/** Test seam: drop every remembered disclosure (a CT must not inherit another test's expanded set). */
export function __resetChatContextSections(): void {
  useChatContextSectionOpenStore.setState({ open: {} }, false, "chatContextSections/__reset");
}
