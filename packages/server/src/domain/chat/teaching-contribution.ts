// domain/chat — THE RATIFIED 11th ROOT SLOT (`teaching-contribution.ts`, the S2 teaching seam's exit): the
// domain's OWN contributions to "what this chat's model is told it can do", compose-built and registered at
// `entry/compose`. Same shape of exception as `guard.ts` and `workload-contributions.ts` (D117): not a verb,
// I/O-capable, and cross-domain by construction — a domain DECLARES its teaching, one collector folds them
// (`substrate/teaching.ts`), and the turn knows no domain. Reachable only through the front door
// (`index.ts`), so the registry is assembled at the composition root and never imported by a verb.
//
// Chat's own contribution is the rpg-gather PROJECTION — contributor #0. The game's depth-0 state-block
// reminder was the seam's only contributor before it existed, and it stays byte-identical: same content,
// same order, same `game-state` stamp. Chat learns nothing rpg-shaped here (the input is the structural
// `ChatRpgGatherResult` chat already owns), and the gather's NON-injection outputs — macros, celBindings,
// cardKeepLastX, terminalTools — are untouched by this seam and still ride `buildTurnContext` directly.

import type { ChatInjection, ReactionEmoji } from "@orb/contracts/chat";
import {
  CHAT_REACT_TOOL_NAME,
  isNarratorVoiced,
  REACTION_ATTRIBUTION_CONTENT_CAP,
  REACTION_ATTRIBUTION_MAX_PER_MESSAGE,
  REACTION_ATTRIBUTION_SLOT_WINDOW,
  REACTION_SEGMENT_SNIPPET_MAX,
  reactionEmojiSchema,
} from "@orb/contracts/chat";
import { resolveProseText } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { createNamesOnlyRegistry, processMacros } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { resolveSegmentAnchor, segmentSnippet } from "@orb/kit/speaker-label";
import type { ChatTeachingRegistry, TeachingCollection, TeachingContext, TeachingContribution } from "./contract/context.ts";
import { listAttributionReactions, loadPresentCharacterNames } from "./persistence/reactions.ts";
import { NO_HISTORY_FLOOR } from "./substrate/auth/index.ts";

/** Contributor #0 — the rpg gather's injections + tool names, projected onto the teaching contract.
 *
 *  THE `game-state` STAMP LIVES HERE, and this is its one home. It used to sit at the injections merge
 *  (`substrate/assemble-gather.ts`), which was correct while rpg was the only contributor and became wrong
 *  the moment the merge went generic: a teaching contribution is not necessarily a game (C1's guidance line
 *  is authors-note register), so a merge-site stamp would mislabel every later contributor's budget
 *  accounting. The stamp's original reason is preserved exactly — the BUILD walk accounts the state block
 *  under its own source without chat ever reading an rpg type. */
const rpgGatherProjection: TeachingContribution = {
  id: "chat.rpg-gather",
  order: 0,
  collect: (tctx: TeachingContext): Promise<TeachingCollection> =>
    Promise.resolve({
      injections: (tctx.rpgGather?.injections ?? []).map((injection): ChatInjection => ({ ...injection, origin: "game-state" })),
      // The gather's own `tools` — `[]` in every mode as built (the fold rides `terminalTools`, which is NOT
      // a registry attach), so today's union is empty and the turn is byte-identical. Projected rather than
      // hard-coded `[]` so an rpg mode that DOES contribute registry tools attaches them through the one
      // seam instead of being silently dropped here.
      toolNames: tctx.rpgGather?.tools ?? [],
    }),
};

// ── The B1 offer-choices teach ──────────────────────────────────────────────────────────────────────────
//
// THIS BELONGS IN CHAT'S OWN CONTRIBUTION FILE, not a new `domain/<x>/teaching-contribution.ts` root slot:
// a D117 root-slot ratification is what a DOMAIN spends to raise its own seam into chat, and there is no
// second domain here — the knob is chat-homed (RULED F2: `chatMetadata.offerChoices` over the host's
// per-user default) and the teach is a chat-level posture. Do not "promote" this to a root slot for
// symmetry with rpg; the symmetry would be with a domain that does not exist.

/** The ONE choices-teach text, resolved the way rpg resolves it so the two are the SAME BYTES.
 *
 *  `PROSE_SLOTS["rpg.reminder.cyoaTeach"]` is the slot's one home (S2: NO second prose home). Two resolution
 *  steps, both mirroring `domain/rpg/substrate/reminder.ts`'s `resolveTeach`, and both load-bearing:
 *   1. the PRESET override wins over the shipped default (`resolveProseText` — the slot is `home: "preset"`,
 *      and a host who re-authored it must not get the baseline here and their own text there);
 *   2. a macro-BEARING override renders through the names-only registry, so a host who typed `{{user}}` gets
 *      the name and never literal braces. The shipped default is macro-free, so it never touches the engine
 *      (the `!includes("{{")` fast path) and is byte-identical to the pre-B1 constant.
 *  The registry is kit's (`createNamesOnlyRegistry` — ONE engine, every call site, so identity resolves and
 *  `{{random}}`/`{{setvar}}`/… re-emit verbatim). This is chat CALLING the shared engine, not a second home
 *  for the slot. */
const CHOICES_TEACH_SLOT_ID = "rpg.reminder.cyoaTeach" as const;
const CHOICES_FRAME_SLOT_ID = "chat.teach.choicesFrame" as const;
const CHOICES_NAMES_REGISTRY = createNamesOnlyRegistry();
function resolveChoicesTeach(tctx: TeachingContext): string {
  const text = resolveProseText(CHOICES_TEACH_SLOT_ID, tctx.prose);
  if (!text.includes("{{")) {
    return text;
  }
  const macros = { char: tctx.identity.char, user: tctx.identity.user ?? DEFAULT_PERSONA_NAME, persona: "", scenario: "", env: {} };
  return processMacros(text, macros, CHOICES_NAMES_REGISTRY);
}

/** Contributor #1 — the B1 standing "offer choices" posture: when this room's resolved knob is ON, tell the
 *  model it may end a turn with the `:::choices` fence, inside the `chat.teach.choicesFrame` delimiter. OFF ⇒
 *  `[]` ⇒ the turn is byte-identical.
 *
 *  THE SUPPRESSION ARM IS NOT THE COLLECTOR'S EXACT-MATCH GUARD, and this is a corrected premise (2026-08-24,
 *  B1): `substrate/teaching.ts`'s guard collapses injections that are byte-identical as a WHOLE, and A1
 *  assumed a game's cyoa teach arrives as its own injection. It does not. rpg pushes every teach into ONE
 *  `blocks` array with the game-state block, the delta and the steering license
 *  (`domain/rpg/substrate/reminder.ts:459`), joins them (`:571`), and emits exactly ONE injection
 *  (`domain/rpg/chat-ops/gather.ts:183,206`) — `buildLiteReminder` has no other caller. So on a real game turn
 *  the teach is a SUBSTRING of a larger blob and the exact-match guard cannot see it; without this arm a game
 *  chat running cyoa AND this knob would be told the same thing twice.
 *
 *  So the check is CONTAINMENT of the exact resolved text in what this turn's gather already contributed. It
 *  is narrow on purpose — the same bytes, resolved the same way, never a fuzzy match — and it lives HERE
 *  rather than in the generic collector, which must not learn to sniff inside another domain's blob. It reads
 *  `tctx.rpgGather` (the structural gather chat already owns), so it is independent of contributor order. */
const offerChoicesTeach: TeachingContribution = {
  id: "chat.offer-choices",
  order: 1,
  collect: (tctx: TeachingContext): Promise<TeachingCollection> => {
    if (!tctx.knobs.offerChoices) {
      return Promise.resolve(EMPTY_COLLECTION);
    }
    const teach = resolveChoicesTeach(tctx);
    const alreadyTaught = (tctx.rpgGather?.injections ?? []).some((injection) => injection.content.includes(teach));
    if (alreadyTaught) {
      return Promise.resolve(EMPTY_COLLECTION);
    }
    // Framed only AFTER the containment check: the game's reminder carries the bare teach inside its own frame.
    // A model that takes no system row folds this note into the player's message, so it carries its own
    // delimiter and never reads as the player's words (owner ruling). The frame is a plain token splice, so the
    // resolved teach rides inside it byte for byte.
    const content = resolveProseText(CHOICES_FRAME_SLOT_ID, tctx.prose, { teach });
    // The SAME placement rpg's reminder uses (`in_chat` depth 0, `system`) — a teach is standing prompt
    // content for the turn about to run, and the depth-0 in-chat splice is where this codebase puts it.
    // Unstamped `origin`: the merge stamps it, and this is not game state.
    return Promise.resolve({ injections: [{ position: "in_chat", depth: 0, role: "system", content }], toolNames: [] });
  },
};

/** The no-op collection — one frozen value so an OFF/suppressed arm allocates nothing and every "contributed
 *  nothing" path is the same object the collector's empty-registry arm produces. */
const EMPTY_COLLECTION: TeachingCollection = { injections: [], toolNames: [] };

// ── The B7/MR4 reaction-attribution loop ────────────────────────────────────────────────────────────────
//
// Marinara's clever half, on this codebase's rails: recent reactions are narrated INTO the next turn's
// prompt so the model can acknowledge them — the engagement payoff that makes a reaction steer the story.
// The mechanism is deliberately NOT the mini-spec's per-message inline splice: §3-S2's convergence law puts
// ALL prose steering on the ONE ChatInjection channel (single placement), and a second
// prompt-mutation plane beside it is exactly what the S2 seam exists to prevent. One depth-0 `in_chat`
// system injection carries every note; the model correlates by the quoted text.
//
// BOUNDED at three seams (the B7 "attribution caps" knob, constants one-homed in contracts/chat/reactions):
// the newest `REACTION_ATTRIBUTION_SLOT_WINDOW` reacted slots · the most-recent
// `REACTION_ATTRIBUTION_MAX_PER_MESSAGE` (K) reactions per message · bodies past
// `REACTION_ATTRIBUTION_CONTENT_CAP` skip re-segmentation (whole-message notes only — the Marinara cap).
//
// STALENESS is re-judged HERE, at inject time, through the ONE kit rule (`resolveSegmentAnchor`): a stored
// anchor the current canon refutes degrades to a whole-message note — never a mis-attributed quote. The
// read is SELECTED-variants-only (the prompt contains selected variants; a dead swipe's reaction must not
// be narrated against text the model cannot see) and the notes are DATA (§2 law 6 — the injections channel
// is macro-inert in production, so a `{{`-bearing snippet ships as literal braces, pinned at B1).

/** One reaction row → its note line. The reactor's display identity resolved by the read (character name /
 *  persona name); a seat with neither (a persona-less human) reads as "A member" — never a raw id. */
function attributionLine(
  row: Awaited<ReturnType<typeof listAttributionReactions>>[number],
  emoji: ReactionEmoji,
  characterNames: readonly string[],
  parseable: boolean,
): string {
  const name = row.reactorCharacterName ?? row.reactorPersonaName ?? "A member";
  const anchor =
    parseable && row.segmentIndex !== null && row.segmentSnippet !== null
      ? resolveSegmentAnchor(row.content, characterNames, { index: row.segmentIndex, speaker: row.segmentSpeaker, snippet: row.segmentSnippet })
      : null;
  if (anchor !== null && row.segmentSnippet !== null) {
    const whose = row.segmentSpeaker ?? "the narration";
    return `[${name} reacted with ${emoji} to ${whose === "the narration" ? whose : `${whose}'s line`}: "${row.segmentSnippet}"]`;
  }
  return `[${name} reacted with ${emoji} to the message: "${segmentSnippet(row.content, REACTION_SEGMENT_SNIPPET_MAX)}"]`;
}

/** Fold the read's chronological rows into note lines under the two per-message caps (K + content — see
 *  the section comment). "The last K" is a tail slice per messageId because the read is chronological
 *  within a message; an off-vocabulary emoji row is dropped (the `groupReactions` posture). */
function buildAttributionLines(rows: Awaited<ReturnType<typeof listAttributionReactions>>, characterNames: readonly string[]): readonly string[] {
  const byMessage = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byMessage.get(row.messageId) ?? [];
    byMessage.set(row.messageId, [...bucket, row]);
  }
  const lines: string[] = [];
  for (const bucket of byMessage.values()) {
    const kept = bucket.slice(-REACTION_ATTRIBUTION_MAX_PER_MESSAGE);
    // The content cap: past it, skip re-segmentation for this message (whole-message notes only).
    const parseable = (kept[0]?.content.length ?? 0) <= REACTION_ATTRIBUTION_CONTENT_CAP;
    for (const row of kept) {
      const token = reactionEmojiSchema.safeParse(row.emoji);
      if (token.success) {
        // The plain-`Name:` character-name set applies only to a narrator-voiced row — the same `isNarratorVoiced`
        // gate the write-side validation and the client renderer use (one predicate, every parse).
        lines.push(attributionLine(row, token.data, isNarratorVoiced(row.messageKind) ? characterNames : [], parseable));
      }
    }
  }
  return lines;
}

/** Contributor #2 — the reaction-attribution injection. No reactions (or the plane resolved off) ⇒
 *  {@link EMPTY_COLLECTION} ⇒ byte-identical (the A1 per-contributor property). */
function createReactionAttribution(db: Db): TeachingContribution {
  return {
    id: "chat.reaction-attribution",
    order: 2,
    collect: async (tctx: TeachingContext): Promise<TeachingCollection> => {
      if (!tctx.knobs.reactionsEnabled) {
        return EMPTY_COLLECTION;
      }
      // The turn runs AS the host, and a host holds no D16 floor (`resolveHistoryFloorSeq`'s host arm), so
      // the read floor is the no-floor constant — restated here rather than re-derived from a row read.
      const rows = await listAttributionReactions(db, tctx.chatId, { slotWindow: REACTION_ATTRIBUTION_SLOT_WINDOW, floorSeq: NO_HISTORY_FLOOR });
      if (rows.length === 0) {
        return EMPTY_COLLECTION;
      }
      const lines = buildAttributionLines(rows, await loadPresentCharacterNames(db, tctx.chatId));
      if (lines.length === 0) {
        return EMPTY_COLLECTION;
      }
      // Depth-0 `in_chat` system — right before the turn about to run, where an acknowledgment steer has
      // adjacency (the offer-choices teach's placement). Unstamped `origin`: the merge stamps it.
      return { injections: [{ position: "in_chat", depth: 0, role: "system", content: lines.join("\n") }], toolNames: [] };
    },
  };
}

/** Contributor #3 — the B7 `react` tool ATTACH (the FIRST non-empty `toolNames` contributor — R2's whole
 *  point). Teach and attach travel together (D145-a): the tool's wire `description` IS the teach (the
 *  tool-use contribution's documented posture — no prose injection beside it), so this contribution emits
 *  the NAME only, and only when BOTH knobs resolve on: `charactersCanReact` (the owner's opt-in — OFF by
 *  default at both tiers) AND `reactionsEnabled` (a room with the plane off attaches nothing). Either off
 *  ⇒ {@link EMPTY_COLLECTION} ⇒ the react tool never reaches the wire — the receipt the OFF toggle owes. */
const reactToolAttach: TeachingContribution = {
  id: "chat.react-tool",
  order: 3,
  collect: (tctx: TeachingContext): Promise<TeachingCollection> =>
    Promise.resolve(tctx.knobs.reactionsEnabled && tctx.knobs.charactersCanReact ? { injections: [], toolNames: [CHAT_REACT_TOOL_NAME] } : EMPTY_COLLECTION),
};

/** Chat's own teaching contributions, in registration order (the collector sorts by `order`). `db` feeds
 *  ONLY the attribution read — chat's own contribution reading chat's own tables through a closed-over
 *  dep, the `createAutomationTeachingContributions({db})` shape. */
export function createChatTeachingContributions(deps: { readonly db: Db }): ChatTeachingRegistry {
  return [rpgGatherProjection, offerChoicesTeach, createReactionAttribution(deps.db), reactToolAttach];
}
