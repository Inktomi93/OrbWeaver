import type { TagId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

// A creation requests Name-field focus; consuming it must not clear the selected label or an open overlay.
const useLabelNameFocusStore = createGatedStore<{ readonly tagId: TagId | null }>("label-name-focus", () => ({ tagId: null }));

/** Ask the editor for `tagId` to focus its Name field when it mounts (`null` clears the request). */
export function setLabelNameFocus(tagId: TagId | null): void {
  useLabelNameFocusStore.setState({ tagId }, false, "label-name-focus/set");
}
/** Reactive: the tag whose editor owes its Name field focus, if any. */
export function useLabelNameFocus(): TagId | null {
  return useLabelNameFocusStore((s) => s.tagId);
}
