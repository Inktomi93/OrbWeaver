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
//
// ── ITS SURFACE (#1742) ─────────────────────────────────────────────────────────────────────────────────
// This hook's output IS the room's `On screen` roster — the last group of the This-chat tab's **Regex**
// section, where each display script in force for THIS
// viewer is listed with its provenance (`yours` / `the host's`) and, for the viewer's own, its library
// switch. That roster is SEPARATE from the section's tier groups above it, and the O-4 ruling is exactly
// why: the display leg is ATTACHMENT-BLIND (it is the viewer's whole library ∩ DISPLAY, plus the host's
// broadcast), so a per-chat tier lever and the room's regex master cannot reach it and must not appear to.
// The host broadcast switch (`chat.setHostDisplayScripts`) is drawn at the foot of that roster.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

const NO_SCRIPTS: never[] = [];
/** The one leg this hook is about. EXPORTED because the room's `On screen` roster
 *  (`features/chat/components/regex-on-screen-group.tsx`) must ask the same question of the viewer's
 *  DISABLED rows — the ones this hook filters out by definition — and a second spelling of the literal is a
 *  second definition of "a display script". */
export const DISPLAY_PLACEMENT = "DISPLAY";

/** The two reads this hook composes, in ONE spelling — so the prefetch below and the render read below can
 *  never drift into two different cache keys (which would make the warm-up warm the wrong entry silently). */
function ownDisplayScriptQuery(trpc: Trpc): ReturnType<Trpc["regex"]["listScripts"]["queryOptions"]> {
  return trpc.regex.listScripts.queryOptions();
}

function roomDisplayScriptQuery(trpc: Trpc, chatId: ChatId): ReturnType<Trpc["regex"]["listRoomDisplayScripts"]["queryOptions"]> {
  return trpc.regex.listRoomDisplayScripts.queryOptions({ chatId });
}

/** Narrow a library read to the scripts that would actually fire on the display leg. */
function displaySlice(rows: readonly RegexScriptRow[]): readonly RegexScriptRow[] {
  const selected = rows.filter((row) => row.enabled && row.placement.includes(DISPLAY_PLACEMENT));
  return selected.length === 0 ? NO_SCRIPTS : selected;
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
    ...ownDisplayScriptQuery(trpc),
    placeholderData: NO_SCRIPTS,
    select: displaySlice,
  });
  // A chat-less surface has no room tier at all. `useGatedQuery` does not invoke the options builder, so no
  // fake ChatId exists and no room key or request can be built.
  const room = useGatedQuery(chatId, (id) => ({ ...roomDisplayScriptQuery(trpc, id), placeholderData: NO_SCRIPTS, select: displaySlice }));

  const broadcast = room.data ?? NO_SCRIPTS;
  const viewer = own.data ?? NO_SCRIPTS;
  if (broadcast.length === 0) {
    // The overwhelmingly common arm (the toggle is off) — no allocation, no dedup pass.
    return viewer;
  }
  const seen = new Set(broadcast.map((row) => row.id));
  return [...broadcast, ...viewer.filter((row) => !seen.has(row.id))];
}

/**
 * WARM both tiers from OUTSIDE the transcript's suspense boundary (#514) — the room's owner calls this in the
 * same render that mounts the boundary, so the two reads leave with the canon + roster reads instead of
 * waiting for them.
 *
 * THE IDIOM, and why it is spelled HERE rather than in a generic helper. A read that a suspending surface
 * needs but that its suspending reads do not FEED is a hop the user pays for nothing: `ChatThread` suspends
 * on `listMessages`+`getChat`, and only once those land does it render the subtree that first asks for the
 * display scripts — measured on the isolated stage, the two regex reads left the client ~730ms after the
 * chat-open click, ~500ms of which was pure boundary wait. Neither read depends on a byte of what the
 * boundary is waiting for (`listScripts` is not even chat-keyed). So the fix is not to move the READ (a row
 * component must never fetch, and the consumer that needs the data is inside) — it is to start the FETCH at
 * the boundary's owner. The warm-up subscribes to nothing and renders nothing: `ensureQueryData` fetches a
 * COLD key and resolves from cache for a warm one (`staleTime: Infinity`, `query-client.ts`), so the read
 * inside the boundary is the same read it always was — it just finds the entry filled or already in flight.
 * It fires from an EFFECT, not from the render body: a fetch is a side effect, and the mount commit that
 * schedules it is the same commit that renders the boundary's fallback, i.e. one frame after the suspending
 * reads left — against ~500ms of boundary wait. (`usePrefetchQuery` would put it in render, but its options
 * type EXCLUDES `skipToken`, which tRPC's `queryOptions()` output always carries in its `queryFn` union;
 * `ensureQueryData` takes that output as-is, which is why it is the shape the one precedent already uses.)
 *
 * The one-home rule that makes it safe: the warm-up and the read take their keys from the two query-builder
 * functions above, so no drift can make this warm a key nobody reads. A prefetch that warms the wrong key is
 * INVISIBLE — it looks exactly like a working one, plus a wasted round trip.
 *
 * The repo's other prefetch precedent (`use-open-refinery.ts`'s `ensureQueryData`) is the DECIDING flavour —
 * an action AWAITS a read it must have before it branches. This is the WARMING flavour: nobody awaits it, so
 * a rejection is dropped here rather than handled — the consumer inside the boundary is an ordinary query
 * that will refetch and surface its own error through `QueryBoundary`, exactly as it did before this existed.
 *
 * REQUIRED `ChatId`, where the read takes `ChatId | null`: the chat-less arm (a draft-greeting preview) has
 * no room tier to warm and no boundary to beat. `useGatedQuery` keeps that arm keyless instead of inventing
 * an entity id; this prefetch exists only where a real room id already exists.
 */
export function usePrefetchDisplayScripts(chatId: ChatId): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The options are rebuilt INSIDE the effect: `queryOptions()` returns a fresh object every render, so
  // depping on it would re-run this on every unrelated re-render of the surface. `trpc`/`queryClient` are
  // context values (stable), and the room cannot change without a remount — so this runs once per open.
  useEffect(() => {
    void queryClient.ensureQueryData(ownDisplayScriptQuery(trpc)).catch(() => undefined);
    void queryClient.ensureQueryData(roomDisplayScriptQuery(trpc, chatId)).catch(() => undefined);
  }, [queryClient, trpc, chatId]);
}
