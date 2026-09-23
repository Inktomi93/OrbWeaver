// domain/rpg/chat-ops/gather — the game turn's GATHER (docs/plans/rpg/design.md + the delivery-model amendment §4.6).
// Produces the generic gather contribution chat merges STRUCTURALLY: `{ macros, injections, tools }` (chat
// names no rpg type). A non-game chat returns `null` → byte-identical no-op (the existing contract-test
// pattern). PRINCIPAL-FREE: chat already gated the turn's caller; the gather resolves game-ness by the row.
//
// WHERE THE TURN'S STATE IS CAPTURED, by resolved mode:
//   • cheap    — a dedicated POST-COMMIT TOOL round (`runToolRound`: the 7 state tools, `tool_choice:required`,
//                a `no_changes` escape, enum-constrained args), emitting PARALLEL tool calls in one request.
//   • folded   — R1: the SAME 7 tools ride THIS turn as TERMINAL tools (`tool_choice:"auto"`), so the model
//                answers in prose AND records the state in ONE completion and no second call is paid. They are
//                NOT registry tools (`tools` stays `[]` — nothing is executed or recursed on); they ride the
//                separate `terminalTools` channel and their calls come back on `RpgTurnContext`. NOT on a wire
//                that silences prose under tool attachment (`foldGuarded` — the local engine): there the mount
//                is withheld and the flush runs cheap's post-commit round, loud (D112 as amended).
//   • readonly/manual-steering — NO state capture at all; the host hand-edits every plane, and those hand
//                values STILL steer via THIS reminder (the honest degrade is DESIGNED, §4.6 — never a silent
//                mode-downgrade), so a readonly game mounts no tools either.
// The reminder always injects the tracked state as FLAVOR so the character reacts off it — that part rides
// every mode, folded included: the fold adds a WRITE surface, it never changes what the character READS.
//
// The reminder reads the SAME `buildTrackerView` projection the CP panel renders, so the injection and the
// panel never drift. `resolveStateDelivery` is the ONE per-turn capability read (already resolved for THIS
// game's `extractionMode` by the integration op) — the gather reuses its verdicts, never re-resolving.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import type { GatherTurnContextArgs } from "../../chat/index.ts";
import type { RpgGatherResult } from "../contract/params.ts";
import type { RpgContext, RpgGameRow } from "../contract/service.ts";
import { snapshotRowToState } from "../contract/service.ts";
import { findGameByChat } from "../persistence/games.ts";
import { resolveTurnSnapshotPair } from "../persistence/snapshots.ts";
import { defaultSnapshotState } from "../substrate/default-state.ts";
import { buildLiteReminder } from "../substrate/reminder.ts";
import { buildRpgMacroFeed } from "./macro-view.ts";
import { isReconcileBeat } from "./reconcile-cadence.ts";
import { buildTrackerView } from "./tracker-view.ts";

/** Build the folded turn's TERMINAL tools, or `null` on ANY failure (R1 — narrative inviolability on the BUILD
 *  half). The mount is the one piece of the fold that runs PRE-commit: it reads the db (the participants + the game
 *  row `resolveExtractionRefs` needs), so a transient fault here would otherwise take down the character turn
 *  itself — a state-tracking convenience killing the reply is exactly the inversion the delivery model forbids.
 *  On a throw the turn assembles byte-identically to a tool-less one and the flush sees the `null` terminal
 *  channel, so its fallback post-commit round still captures the beat. Loud, never silent (`onFoldBuildFailed`). */
async function buildFoldedTurnSafely(
  ctx: RpgContext,
  game: RpgGameRow,
  baseState: RpgSnapshotState,
  prose: ProseOverrides,
): Promise<Awaited<ReturnType<RpgContext["buildFoldedTurn"]>> | null> {
  // @orb-waive caught-failure-ownership(err): reported via `ctx.onFoldBuildFailed` (loud,
  // per the function header's R1 doctrine) and returned as the consumed `null` terminal channel the flush's
  // fallback post-commit round checks. Ends if the fold mount becomes a required precondition.
  try {
    const reconcile = await isReconcileBeat(ctx.db, game);
    return await ctx.buildFoldedTurn({ chatId: game.chatId, baseState, reconcile, prose });
  } catch (err) {
    ctx.onFoldBuildFailed({ chatId: game.chatId, gameId: game.id, err });
    return null;
  }
}

/**
 * The gather, over chat's own call shape ({@link GatherTurnContextArgs}) — `chatId`, the identity binding, the
 * VER-1b regen slot, and the resolved PRESET prose. Taking the args object rather than a positional list is what
 * keeps chat's contract and this impl one shape: a new chat-resolved input (prose was the third) lands as one
 * field, not a fourth positional nobody at the call site can read.
 */
export async function gatherTurnContext(ctx: RpgContext, args: GatherTurnContextArgs): Promise<RpgGatherResult | null> {
  const { chatId, steerIdentity, regenSlotMessageId } = args;
  // PROSE-1 — the model-facing teach/heading OVERRIDES, resolved CHAT-SIDE off the turn's PRESET
  // (`promptConfig.prose`, authored in the Templates tab) and threaded in exactly like `steerIdentity`: rpg
  // splices chat's resolution, it never reaches for a preset. Absent ⇒ `{}` ⇒ every slot resolves to its shipped
  // default, byte-identical to a game whose host has edited nothing. A game turn assembles the game's
  // `gmPresetId` (chat's preset REDIRECT), so what lands here IS that table's GM preset's copy.
  const prose = args.prose ?? {};
  const game: RpgGameRow | undefined = await findGameByChat(ctx.db, chatId);
  if (game === undefined || !game.config.engaged) {
    // Non-game chat, or a DISENGAGED game (#40 front-door toggle OFF) — byte-identical no-op: no
    // reminder, no state block, no steering, no macros/CEL, no tools. The rows are preserved untouched.
    return null;
  }

  // FLUSH BARRIER (the race fix): block until THIS chat's prior post-turn flush has landed before we read the
  // state the reminder assembles from. The dedicated state round made the flush a real 0.8-2.9s call, so a fast
  // re-send could otherwise read STALE state here (the exec's live-confirmed race). Bounded — a hung flush
  // releases the barrier and the turn proceeds on last-known state (never a deadlocked turn). No in-flight flush
  // (the common case) resolves immediately. This realizes the ratified "one-beat-behind but GUARANTEED" contract.
  await ctx.flushBarrier.awaitInFlight(chatId);

  // ONE connection resolve, TWO verdicts (§4.6 + the D112 fold guard): can the model write this game's state at
  // all, and — if it can — does mounting tools on THIS wire cost the narrative?
  const { trackersReadOnly, foldGuarded } = await ctx.resolveStateDelivery(chatId, args.funderUserId);
  // THE TURN'S READ BASE (VER-1b — the READ twin of VER-1a's write base). A FRESH turn reads the resolution
  // HEAD. A REGEN (swipe/reroll) reads the state as of BEFORE its target slot, because on a regen the head IS
  // the abandoned variant's snapshot — still selected/committed while the replacement generates. Reading it
  // told the model the beats and state of prose it was about to be asked to write DIFFERENTLY: strong models
  // visibly wrestled with a system note describing an unwritten moment, and every reroll got railroaded into
  // paraphrasing the rejected variant (the owner's live rerolls-all-alike). Both state reads below take the
  // same slot, so the view, the reminder, the delta pair and the fold's ref enums are ONE state — and it is
  // byte-identically the state the flush will apply the new variant's writes onto (`snapshotStateBeforeSlot`).
  const view = await buildTrackerView(ctx, game, trackersReadOnly, regenSlotMessageId);
  // The DELTA BLOCK's second ladder read (§2.7): the prev→current snapshot PAIR on the selected lineage. `cur`
  // is the SAME snapshot the tracker view projects from (a swipe re-selects both ends together —
  // swipe-consistent by construction); `prev` is the snapshot one committed beat back (null on the first
  // snapshot → the delta's first-state arm). A turnless game (no rows) has no `cur` row — the view synthesized
  // the born default, so the reminder's `curSnapshot` mirrors it (`defaultSnapshotState`) with a null prev.
  // On a REGEN the pair is the SAME prev→cur the slot's first generation saw, so "CHANGES SINCE LAST BEAT"
  // describes the beat BEFORE this slot — never the abandoned variant's own changes.
  const { cur, prev } = await resolveTurnSnapshotPair(ctx.db, { id: game.id, chatId }, regenSlotMessageId);
  const curSnapshot: RpgSnapshotState = cur !== undefined ? snapshotRowToState(cur) : defaultSnapshotState();
  const prevSnapshot: RpgSnapshotState | null = prev !== undefined ? snapshotRowToState(prev) : null;
  // The delta's participant-name map (fold-in #5): `actorRefKey → display name` so per-actor delta lines name participant
  // actors ("Kael HP 12→16", not "character HP 12→16"). Resolved HERE (the gather has `ctx.resolveParticipants` reach —
  // the same source `buildTrackerView` reads) and handed to the PURE delta as data (no I/O in the registry).
  const participants = await ctx.resolveParticipants(chatId);
  const participantNames: Record<string, string> = {};
  for (const entry of participants) {
    participantNames[actorRefKey(entry.actorRef)] = entry.name;
  }
  // The host-authored steeringNote's identity-macro binding (the substitution fix) — BOTH values resolved
  // CHAT-SIDE and threaded in (chat owns `{{user}}`/`{{char}}` identity resolution; rpg SPLICES, never
  // re-derives): `{{user}}` = the active/triggering persona name; `{{char}}` = the Ruling-B host/null-speaker
  // `{{char}}` (Chat-Macro-Resolution.md ruling B — the JOINED CAST in a multi-character room, the single
  // character in solo). Absent (a caller that supplies no binding) ⇒ `buildLiteReminder` ships the note
  // verbatim; the render is guided-safe (identity substitution only — never full macro/variable power).
  const steerMacros = steerIdentity !== undefined ? { user: steerIdentity.user ?? DEFAULT_PERSONA_NAME, char: steerIdentity.char } : undefined;
  // R1 — the FOLD: on a `folded` game with a live write path, THIS turn carries the 7 state tools as TERMINAL
  // tools, so the model co-emits prose + state in one completion. Resolved BEFORE the reminder because a
  // reconcile beat contributes a note the reminder carries (the post-commit rounds put that line in their own
  // system prompt; a folded turn has no second prompt). The refs are bound to `curSnapshot` — which since
  // VER-1b is the SAME state `stageStateRound` will resolve as its apply base (both go through
  // `snapshotStateBeforeSlot` on a regen, both the head on a fresh turn), so what the model is constrained to
  // write is exactly what the apply path can resolve.
  //
  // ERRORS-AS-DATA, AND THIS HALF IS THE DANGEROUS ONE: unlike the flush (which runs post-commit, where the
  // worst case is a lost state write), the mount runs PRE-commit inside turn assembly — a throw here kills the
  // character turn before any narrative exists. It reads the db (participants + game row), so it CAN throw. Swallow
  // it to a no-mount + a loud log: the turn then assembles byte-identically to a tool-less one, the engine hands
  // the flush a `null` channel, and the fallback post-commit round captures the state one beat later. The
  // narrative is never at risk; the degrade is visible.
  //
  // THE FOLD GUARD (D112 as amended, owner ruling): `foldGuarded` ⇒ this wire silences the model's prose the
  // moment tools ride it (the local vLLM engine: `content: null` on 36/36 tool-attached turns, spike §4g), so the
  // fold's own premise — prose AND state in one completion — is false here. The mount is withheld PRE-COMMIT:
  // no db read, no tools on the wire, a byte-identical tool-less character turn, and the flush's `null` channel
  // runs the SAME cheap post-commit round the no-terminal-channel arm runs, LOUDLY (`local-engine-fold-guard`).
  // The wire class arrives as a CAPABILITY fact (`coEmitsProseWithTools`, resolved at compose) — rpg never sees
  // a credential source. An EXPLICIT `cheap` is untouched: the guard governs only where folded lands.
  const foldable = game.config.extractionMode === "folded" && !trackersReadOnly && !foldGuarded;
  // PROSE-1 S4 — the fold mounts the SAME six tool descriptions the post-commit round would send, so it gets
  // the SAME prose the round will later receive on `RpgTurnContext.prose` (both are this turn's resolution).
  // The two vehicles teaching one vocabulary is structural, not a convention.
  const folded = foldable ? await buildFoldedTurnSafely(ctx, game, curSnapshot, prose) : null;

  // The reminder injects state as FLAVOR — never tool-update guidance. That holds on the folded path too: the
  // tool DESCRIPTIONS teach the write surface (measured: a hosted strong model co-emits narrative AND 1–3
  // strict tool calls on 6/6 turns off the unchanged narrative prompt), so the prose is never asked to carry
  // bookkeeping instructions it might narrate back at the player.
  const reminder = buildLiteReminder({
    view,
    steeringNote: game.config.lite.steeringNote,
    steerMacros,
    curSnapshot,
    prevSnapshot,
    // The attribute vocabulary (label + hint) the state block teaches once — the sheet's steering lever.
    statProfile: game.config.statProfile,
    features: game.config.features,
    participantNames,
    // P3 hidden-channel teaching gates (§3.3) — composed into the reminder only when the knob is on.
    deception: game.config.features.deception,
    omniscience: game.config.features.omniscience,
    dateMode: game.config.dateMode, // #9 — narrated drops the day counter from the ambient line
    // PROSE-1 — the preset's model-facing prose overrides, so the reminder's teaches/headings resolve any host
    // edit (absent ⇒ shipped defaults, byte-identical to pre-PROSE-1).
    prose,
  });

  // The reconcile-beat note rides the reminder ONLY on a folded turn (the post-commit rounds append their own
  // to their own system prompt). It is authored as WRITE-SURFACE guidance, not narration guidance, so a
  // reconcile beat re-states the panel without the character narrating a stocktake.
  const reconcileNote = folded?.reconcileNote ?? null;
  const content = reconcileNote !== null ? `${reminder}\n\n${reconcileNote}` : reminder;
  const injection: ChatInjection = { position: "in_chat", depth: 0, role: "system", content };

  // The macro + CEL feed (parity-plus §12) — populates `rpgSceneState`/`rpgCast`/`rpgQuests`/`rpgDelta` from the
  // SAME tracker view the reminder + panel read (one projection, three consumers), plus the data-only `rpg` CEL
  // tree so `{{expr::rpg.…}}` reads state on a game turn. A READ mirror, never a write. The delta context mirrors
  // the reminder's (same participantNames/castFields/relationshipHints) so the `{{rpgDelta}}` macro == the reminder's
  // delta block. Full-mode macros (`rpgMap`/`rpgMorale`/…) are ABSENT from the map ⇒ they resolve "" (honest empty).
  // `dateMode` + `statProfile` are handed in for the same reason `buildLiteReminder` gets them: the feed composes
  // the REMINDER'S line builders, so the host's date ruling + attribute vocabulary govern both surfaces alike.
  const feed = buildRpgMacroFeed({
    view,
    prevSnapshot,
    curSnapshot,
    deltaContext: { participantNames, trackerDefs: game.config.trackers, relationshipHints: game.config.features.relationshipHints, prose },
    dateMode: game.config.dateMode,
    statProfile: game.config.statProfile,
  });
  // `cardKeepLastX` (M2, parity-plus §3.5) rides the structural gather contract to the engine's wire seam.
  // `tools: []` in EVERY mode — the fold does not use the tool-use registry (a registry tool would be executed
  // and recursed on, which is the second model call R1 exists to delete); it rides `terminalTools`, omitted
  // entirely when the fold isn't on so a non-folded turn's request is byte-identical.
  return {
    macros: feed.macros,
    injections: [injection],
    tools: [],
    celBindings: { rpg: feed.rpg },
    cardKeepLastX: game.config.features.cardKeepLastX,
    ...(folded !== null && folded.tools.length > 0 ? ({ terminalTools: folded.tools } satisfies Pick<RpgGatherResult, "terminalTools">) : {}),
  };
}
