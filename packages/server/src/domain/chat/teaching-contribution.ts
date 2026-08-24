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

import type { ChatInjection } from "@orb/contracts/chat";
import { resolveProseText } from "@orb/contracts/prose";
import { createNamesOnlyRegistry, processMacros } from "@orb/kit/macro";
import type { ChatTeachingRegistry, TeachingCollection, TeachingContext, TeachingContribution } from "./contract/context.ts";

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
const CHOICES_NAMES_REGISTRY = createNamesOnlyRegistry();
/** The `{{user}}` floor when the turn has no active persona. Bound to the literal rpg's gather uses
 *  (`domain/rpg/chat-ops/gather.ts:126` — `steerIdentity.user ?? "User"`), NOT `@orb/kit/persona`'s
 *  `DEFAULT_PERSONA_NAME` ("Traveler"): the requirement here is byte-identity with the OTHER arm resolving
 *  this same slot, and a different floor would make a personaless turn's override render two different
 *  strings — which is precisely the containment miss below. If rpg's floor ever moves, this moves with it. */
const CHOICES_USER_FLOOR = "User";
function resolveChoicesTeach(tctx: TeachingContext): string {
  const text = resolveProseText(CHOICES_TEACH_SLOT_ID, tctx.prose);
  if (!text.includes("{{")) {
    return text;
  }
  const macros = { char: tctx.identity.char, user: tctx.identity.user ?? CHOICES_USER_FLOOR, persona: "", scenario: "", env: {} };
  return processMacros(text, macros, CHOICES_NAMES_REGISTRY);
}

/** Contributor #1 — the B1 standing "offer choices" posture: when this room's resolved knob is ON, tell the
 *  model it may end a turn with the `:::choices` fence. OFF ⇒ `[]` ⇒ the turn is byte-identical.
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
    // The SAME placement rpg's reminder uses (`in_chat` depth 0, `system`) — a teach is standing prompt
    // content for the turn about to run, and the depth-0 in-chat splice is where this codebase puts it.
    // Unstamped `origin`: the merge stamps it, and this is not game state.
    return Promise.resolve({ injections: [{ position: "in_chat", depth: 0, role: "system", content: teach }], toolNames: [] });
  },
};

/** The no-op collection — one frozen value so an OFF/suppressed arm allocates nothing and every "contributed
 *  nothing" path is the same object the collector's empty-registry arm produces. */
const EMPTY_COLLECTION: TeachingCollection = { injections: [], toolNames: [] };

/** Chat's own teaching contributions, in registration order (the collector sorts by `order`). */
export function createChatTeachingContributions(): ChatTeachingRegistry {
  return [rpgGatherProjection, offerChoicesTeach];
}
