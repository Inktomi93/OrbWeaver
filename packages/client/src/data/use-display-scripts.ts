// `useDisplayScripts` — the display-tier regex set a viewer's transcript renders through (D121-E, closing
// F1), in the order it is applied.
//
// F1 was a dead wire in the honest sense: `client/src/lib/message-render.ts` has implemented the DISPLAY
// leg all along, and the ONE `MessageRenderContext` construction site never set `displayScripts` — so
// D53's per-user `markdownOnly` tier governed nothing, a DISPLAY-placement script never ran for anyone,
// and the editor's "Display only" switch was a knob wired to air. This hook is the missing supply.
//
// ── THE SOURCING (owner ruling 2026-08-02 — the O-4 fork, RESOLVED; this is no longer an open door) ─────
// TWO tiers, and the order between them is the ruling:
//
//   1. THE ROOM'S BROADCAST SET — the HOST's display scripts, and ONLY when the host has opted this room in
//      (`chatMetadata.hostDisplayScripts`, the host-only `chat.setHostDisplayScripts` toggle) — a host
//      staging shared visual effects on the transcript. Default OFF, and while it is off
//      the server returns `[]` — so a room that never touched the toggle is byte-identical to one that
//      never heard of the feature, and a member cannot even learn what scripts the host owns.
//   2. THE VIEWER'S OWN SET — always, on every arm, and applied LAST. Viewer-last is load-bearing: it is
//      what guarantees a viewer can always counter-style whatever the host broadcast.
//
// RENDER-ONLY, both tiers. Neither set ever reaches the composer, an edit textarea, the wire, or canon —
// the display leg runs inside `renderMessageForDisplay` on the way to the DOM and nowhere else. That is
// what makes the host toggle safe to hand out: a host can restyle how the room LOOKS, never what the model
// or the transcript actually says.
//
// It lives in `#data` rather than `features/regex` because its consumer is the CHAT message list, and
// features cannot import each other (the `#lib` vocabulary-map precedent).

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "./trpc.ts";

const NO_SCRIPTS: readonly RegexScriptRow[] = [];
const DISPLAY_PLACEMENT = "DISPLAY";

/** Narrow a library read to the scripts that would actually fire on the display leg. */
function displaySlice(rows: readonly RegexScriptRow[]): readonly RegexScriptRow[] {
  return rows.filter((row) => row.enabled && row.placement.includes(DISPLAY_PLACEMENT));
}

/**
 * The display-tier set for THIS room: the room's broadcast scripts (when the host opted in) followed by the
 * viewer's own. Pass `null` for a chat-less surface (a draft-greeting preview) — the viewer's own set still
 * applies, which is the whole point of tier 2.
 *
 * Deduped by row id, FIRST occurrence wins: when the viewer IS the host, their scripts arrive in both reads
 * and must run once, at the broadcast position.
 */
export function useDisplayScripts(chatId: ChatId | null): readonly RegexScriptRow[] {
  const trpc = useTRPC();
  // ONE query per tier (a row component must never fetch): `select` narrows the shared cache entry to the
  // display slice without a second network read or a second cache key.
  const own = useQuery({
    ...trpc.regex.listScripts.queryOptions(),
    select: displaySlice,
  });
  const room = useQuery({
    ...trpc.regex.listRoomDisplayScripts.queryOptions({ chatId: chatId ?? ("" as ChatId) }),
    // A chat-less surface has no room tier at all — the query never runs and the viewer's own set stands.
    enabled: chatId !== null,
    select: displaySlice,
  });

  const broadcast = room.data ?? NO_SCRIPTS;
  const viewer = own.data ?? NO_SCRIPTS;
  if (broadcast.length === 0) {
    // The overwhelmingly common arm (the toggle is off) — no allocation, no dedup pass.
    return viewer;
  }
  const seen = new Set(broadcast.map((row) => row.id));
  return [...broadcast, ...viewer.filter((row) => !seen.has(row.id))];
}
