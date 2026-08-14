// The named READ SETS the invalidation map's rows compose from, plus the entity→room bridge's per-kind
// rows — split out of `invalidation.ts` (which stays the EVENT→FILTERS maps and the one
// `invalidateFilters` chokepoint) when the bridge's rows pushed that file past the `component-size` cap.
// The seam is real, not arithmetic: a row in the map answers "what does THIS event stale", and a set here
// answers "which reads are that", which is the thing several rows share.
//
// Every export is consumed by `invalidation.ts` alone. Nothing here calls `invalidateQueries` — the seam's
// chokepoint stays in the map file (gate `no-inline-invalidate-outside-seam`).

import type { RoomEntityKind } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import type { Trpc } from "./trpc.ts";

/** What the proxy's `.queryFilter()`/`.pathFilter()` return — accepted by `invalidateQueries`. */
export type InvalidateFilter = InvalidateQueryFilters;

// The open chat's CANON reads (no chat list, no `getChat`) — message list, the swipe strip's step-target
// resolver, and the transcript divider's present-tense fit budget (previewContextFit — the boundary moves
// when canon commits/trims, so it refetches on every canon-terminal alongside the list).
//
// `getChat` is DELIBERATELY ABSENT: `ChatDetail` projects the `chats` ROW + roster only (title/star/archived/
// anchor/pendingHost/metadata group·overrides·background·rpg·opening/compact checkpoint/participants — see
// `substrate/chat-detail.ts`), and NOTHING in it derives from canon. Every transition that DOES stale it fires
// its own event, each naming `getChat` explicitly below: `chatUpdated` (title/star/archive/variables/
// injections/roster/handoff AND the auto-compaction checkpoint — the engine emits it on every marker write),
// `personaSwitched`, `chatOpened`, `historyTruncated`, the five `wi*` arms, `chatDeleted`. Carrying it here
// re-fetched the room on every commit/edit/terminal — the measured startChat burst was FOUR `getChat` wire
// fetches in 80ms (two of them from the greeting + user-row `messageCommitted` pair), and a plain turn paid
// two more on commit+complete. `invalidateQueries` does NOT dedupe against an in-flight fetch (it cancels and
// restarts), so every redundant row here is a real round-trip.
//
export function chatCanonReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ];
}

// `rpg.revealHidden` is an RPG read with a CANON driver: the verb DERIVES it from the stored selected-variant
// assistant BODIES (`domain/rpg/verbs/read/reveal-hidden.ts` — no table of its own), so its freshness driver
// is a BODY WRITE, not the rpg bus. Without a row the host's veiled cue + Veiled ledger froze at the count
// they had when the panel first mounted (the previewAssembly class — every new GM lie invisible until GC or
// a reload).
//
// It rides the BODY-WRITE terminals ONLY, never `turnCompleted`: a generated turn emits `messageCommitted`
// (the commit that writes the body) and then `turnCompleted` on the very next line of the engine — the second
// event changes no body, so carrying the reveal on both bought a duplicate wire fetch on EVERY turn (and
// `invalidateQueries` does not dedupe against an in-flight fetch — it cancels and restarts it). Every path
// that writes/changes an assistant body does emit `messageCommitted` (engine commit, edit, narrator post,
// generated image, the opening greeting), and the swipe/edit/delete family carries it through `chatReads`,
// so nothing the host can see goes stale. Costs nothing on a non-RPG chat or for a member: `invalidateQueries`
// is a no-op for a key with no cache entry, and the read only mounts for the host of a game.
export function hiddenRevealRead(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.rpg.revealHidden.pathFilter()];
}

// The NEXT TURN'S PROMPT, as the Preview tab shows it: the assembled-prompt trace + the content-free shape
// trace (`features/chat/components/assembly-preview-panel.tsx`). Both were in ZERO map rows, and the
// QueryClient runs `staleTime: Infinity` — so the tab froze at its first fetch FOREVER (the reported "old
// persona still in the preview": the server re-pin was correct, the panel was showing a snapshot from before
// it). They ride the SAME row as `previewContextFit` everywhere — the fit is the budget of exactly this
// assembly, so a row that refetches one and not the other makes the two halves of that tab disagree.
// `previewActionTemplates` (D8 / preset-surface-redesign §7.1) rides HERE, not a row of its own: it is the
// same class of read — a dry-run render of the next turn's prose against the live chat — and it goes stale on
// exactly the same moments. Through this one member it inherits every driver the pair already has:
// `presetsChanged` (the editor's own autosave — the resolved preview must move with the template you just
// typed, which is what makes "settle-live" true here), `settingsChanged` (a model/persona swap changes what
// `{{user}}`/`{{char}}` resolve TO), and every canon terminal (the macros read `{{lastMessage}}` &c). The
// binding's OTHER freshness axis — the bind target moving to a different chat — needs no row at all: `chatId`
// is in the query key, so a switch is a cold fetch of a new key by construction (§4.4's binding rows).
export function promptPreviewReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.chat.previewAssembly.pathFilter(), trpc.chat.getShapeTrace.pathFilter(), trpc.chat.previewActionTemplates.pathFilter()];
}

// Canon reads plus the chat list, for non-terminal canon events the server fires no chatsChanged for. Every
// event on this set moves (or can move) a stored body — an edit, a swipe, a hide, a delete/reorder — so the
// host-reveal derivation rides with it.
export function chatReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [...chatCanonReads(trpc), ...hiddenRevealRead(trpc), trpc.chat.listChats.pathFilter()];
}

/** Per-entity-kind filters for `roomEntityChanged`. Total over `RoomEntityKind` (the mapped type is the
 *  belt). Every row is free when its surface is closed — `invalidateQueries` is a no-op for a key with no
 *  cache entry. */
export const ROOM_ENTITY_FILTERS: { readonly [K in RoomEntityKind]: (chatId: ChatId, trpc: Trpc) => readonly InvalidateFilter[] } = {
  // The D22 member-card dialog (`getMemberCard`) is THE row the owner's symptom was missing: a card edit
  // fanned to the room repainted `getChat` and nothing else, because `getMemberCard` rode only the
  // editor-local user-bus `charactersChanged` row. Plus the seat's name/avatar in the roster (`getChat`) and
  // the member-gated fit budget + previews, which the card's content feeds.
  character: (chatId, trpc) => [
    trpc.chat.getMemberCard.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId }),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ],
  // A human seat's member-visible displayName + avatar ARE their active persona's (the server's
  // `resolveUserPublics`), so roster identity moves; the description feeds the next turn's assembly.
  persona: (chatId, trpc) => [trpc.chat.getChat.queryFilter({ chatId }), trpc.chat.previewContextFit.pathFilter(), ...promptPreviewReads(trpc)],
  // ASSEMBLY-derived reads only. No `worldInfo.*` row: those reads are OWNER-scoped, so a member never holds
  // a cache entry for them, and the owner's own devices already ride the user-bus `worldInfoChanged`.
  "world-info": (_chatId, trpc) => [trpc.chat.previewContextFit.pathFilter(), ...promptPreviewReads(trpc)],
};
