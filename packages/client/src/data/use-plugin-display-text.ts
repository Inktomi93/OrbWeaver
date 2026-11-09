// `usePluginDisplayText` — the CLIENT half of the plugin DISPLAY-transform seam (U6,
// seam 14; the ST message-formatting-hook parity row).
//
// THE ORDERING IS LAW, and it is recorded in the design doc as well as here:
//   member macros → member DISPLAY regex → PLUGIN DISPLAY TRANSFORMS → markdown.
// So this hook takes the text `renderMessageForDisplay` has already produced and hands its answer straight to
// the markdown renderer. Two consequences, both deliberate:
//   • The plugin's output never re-enters a macro plane, which is what satisfies interaction-spec §2 laws 6/7
//     BY CONSTRUCTION — no `neutralizeMacros` is needed and no legitimate `{{char}}` in the row is collateral.
//   • A member's own DISPLAY regex scripts CANNOT post-process a plugin annotation. That is the recorded
//     ordering, not an accident: the viewer's regex is about the CANON they were shown, and a plugin's
//     annotation is decoration layered on top of it.
//
// WHY IT LIVES IN `#data` and not in `features/plugin`: its consumer is the CHAT transcript, and a feature may
// not import another feature (`client-features-no-cross`) — the exact reason `use-display-scripts.ts` lives
// here beside it. Same tier, same precedent, same file neighbourhood.
//
// BYTE-IDENTITY WHEN OFF, in one query: `plugin.listDisplayTransforms` is a room-level read whose EMPTY answer
// disables every per-row call. A viewer with no display transforms therefore makes ZERO extra requests while a
// transcript paints, and the transcript renders exactly as it did before this seam existed. (Without that
// gate a 100-row transcript would be a 100-request storm — the whole reason the per-row anchor family carries
// tighter bounds than the room-level ones.)
//
// RESULT CACHING is the query key, not a side table: the key is `{chatId, messageId, text}`, so a virtual-
// scroll repaint, a re-mount, or a sibling row re-render resolves from cache and refires nothing. The TEXT is
// the content identity — an edit, a swipe, or a macro re-resolve changes it and gets its own transform; a
// repaint of the same bytes does not. `staleTime: Infinity` is the app's query-client default.
//
// THE FIRST PAINT IS UNTRANSFORMED, on purpose: the row shows its own text immediately and swaps when the
// annotation lands. That is the flank law's posture (content first, decoration when ready) and it is also the
// failure posture — a refused, slow, or errored round-trip leaves the row reading exactly as it would have.

import { useQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

export type PluginDisplayRow = Pick<inferInput<Trpc["plugin"]["transformForDisplay"]>, "chatId" | "messageId">;

/** Annotate one already-rendered row through the viewer's own plugins' display transforms. Returns `text`
 *  unchanged when there is no row, no registered transform, or the round-trip has not landed (or failed). */
export function usePluginDisplayText(text: string, row: PluginDisplayRow | undefined): string {
  const trpc = useTRPC();
  // The GATE. One room-level read, shared by every row through the query cache; its empty answer is what keeps
  // a plugin-less transcript byte-identical.
  const { data: registered } = useQuery(trpc.plugin.listDisplayTransforms.queryOptions());
  // `Array.isArray`, not `!== undefined`: this hook now runs on EVERY committed row, so it must survive a
  // read that answers with something other than the contract (a stubbed CT route, a transport hiccup) by
  // going silent rather than by throwing inside a transcript render.
  const hasTransforms = Array.isArray(registered) && registered.length > 0;
  // A chat-less row or an empty transform registry carries no entity identity, so the gate builds no key;
  // there is no empty ChatId/MessageId value for an `enabled` guard to accidentally release.
  // A failed round-trip degrades this row to its own text, never into the transcript's error boundary (the
  // query client's `throwOnError: false`). It is the same silence a skipped transform produces: a display
  // transform is decoration, so it is not retried either.
  const { data } = useGatedQuery(hasTransforms ? row : undefined, (gated) => ({
    ...trpc.plugin.transformForDisplay.queryOptions({ chatId: gated.chatId, messageId: gated.messageId, text }),
    retry: false,
  }));
  return data?.text ?? text;
}
