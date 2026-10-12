// The state rounds' prompt inputs: the transcript slice, the model-projected state, the per-call ref vocabulary, and the
// system/user prompt builders every vehicle shares, so the priced and the sent payloads come from one place.

import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ExtractionRefs, RpgActorRef, RpgGameConfig, RpgSheet, RpgSnapshotState, RpgTrackerCarrier } from "@orb/contracts/rpg";
import {
  actorRefKey,
  buildRpgToolDescriptions,
  buildTrackerWriteGroups,
  composePlaneTeaching,
  constrainExtractionSchema,
  gameTrackerWriteKeys,
  RPG_NO_CHANGES_TOOL,
  rpgExtractionSchema,
  rpgGameConfigSchema,
} from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { RpgTurnTranscriptMessage } from "#domain/chat";
import type { PromptInputs, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";
import { findGameByChat } from "#src/domain/rpg/persistence/games.ts";
import { listSheets } from "#src/domain/rpg/persistence/sheets.ts";
import { actorCarrier } from "#src/domain/rpg/substrate/actor-carrier.ts";

// THE HOST resolves by ROLE (the injected `deps.rpgChatOps.resolveHostUserId`, role='host' — D19), never join
// order: `acceptHostHandoff` (D64) swaps roles in place, so the first-joined human is NOT the host (stickler F3).
// Both the resync extraction (whose human funds the model call) and the capability verdict read it.

/** Render one transcript row as a labeled story line (`Mira: …`, `You: …`, `System: …`). A null speaker
 *  name renders by role (user → "You", system → "System", assistant → "Narrator") — the model reads coherent
 *  story attribution without needing the id plumbing. */
const TRANSCRIPT_ROLE_FALLBACK: Readonly<Record<RpgTurnTranscriptMessage["role"], string>> = { user: "You", system: "System", assistant: "Narrator" };

function renderTranscriptLine(m: RpgTurnTranscriptMessage): string {
  return `${m.speakerName ?? TRANSCRIPT_ROLE_FALLBACK[m.role]}: ${m.content}`;
}

/** Slice the turn's transcript to the game's configured extraction window (§1.3). The LATEST BEAT is always
 *  `transcript.at(-1)` (the committed reply — the delta covers exactly it). The RECENT-STORY block is:
 *    • `beat`   → EMPTY (byte-compatible with the pre-redesign one-beat request — the user prompt drops the
 *                 RECENT STORY block entirely so the request is identical to today's `{state}\n{beat}`).
 *    • `window` → newest-first fill up to `extractionWindowTokens`, then reversed to oldest→newest (whole
 *                 messages — a huge single beat degrades to fewer messages, never truncated mid-utterance).
 *    • `full`   → the whole transcript (already compaction-bounded by the char turn's loading).
 *  The beat itself is never double-counted in the story block (it is the newest row, rendered under LATEST
 *  BEAT). Returns the story lines (oldest→newest) + the latest beat text. */
function sliceTranscript(transcript: readonly RpgTurnTranscriptMessage[], config: RpgGameConfig): { story: readonly RpgTurnTranscriptMessage[]; beat: string } {
  const beatRow = transcript.at(-1);
  const beat = beatRow?.content ?? "";
  if (config.extractionContext === "beat") {
    return { story: [], beat };
  }
  // The story is every row BEFORE the latest beat (the beat rides its own block).
  const priorRows = transcript.slice(0, -1);
  if (config.extractionContext === "full") {
    return { story: priorRows, beat };
  }
  // `window`: newest-first fill up to the token budget, then restore oldest→newest order.
  const budget = config.extractionWindowTokens;
  const kept: RpgTurnTranscriptMessage[] = [];
  let used = 0;
  for (let i = priorRows.length - 1; i >= 0; i--) {
    const row = priorRows[i];
    if (row === undefined) {
      continue;
    }
    if (used + row.tokens > budget && kept.length > 0) {
      break; // budget spent (always keep at least one prior message so `window` is never empty when story exists)
    }
    kept.push(row);
    used += row.tokens;
  }
  kept.reverse();
  return { story: kept, beat };
}

/** The structured-extraction system prompt HEADER (the arc semantics § the plane teaching composes onto).
 *  The model reads the RECENT STORY + the CURRENT TRACKED STATE + the LATEST BEAT and emits the WHOLE state
 *  delta as ONE structured object — no user-facing prose, structured output is the fit. The projected schema
 *  marks the five array fields REQUIRED (zod `.default([])` in output mode), so "nothing changed" is EMPTY
 *  ARRAYS, not a literal `{}` (stickler S5 — a bare `{}` fails the Anthropic runtime's schema validation).
 *
 *  ARC AWARENESS (crunchy-cluster §1.3): the RECENT STORY is the model's EVIDENCE. The delta it outputs covers
 *  ONLY the LATEST BEAT, but it may use the whole story to understand it — a relationship warming over several
 *  turns, an item picked up earlier and still carried, a quest implied across turns. The per-plane teaching
 *  (below, composed from `EXTRACTION_PLANE_PROMPTS`) carries the RECONCILE + INFER doctrine and the newly-
 *  covered planes (plot/trackers/emoji/day — §1.6). ESTABLISH-when-unset stays the ENFORCED-SCHEMA
 *  lever (`constrainExtractionSchema` marks scene fields REQUIRED on a fresh game); this prompt is the content-
 *  quality arm. The R1 ref enums (below) keep targets honest. */
/** Compose the full structured-extraction system prompt: the header + the per-plane teaching (from the §1.6 registry,
 *  config/refs/prose aware — plot/trackers/emoji/day/deception-clause) + the R1 ref enumeration + (on a
 *  reconcile beat) the reconcile line. The registry is the ONE home both the structured extraction and the cheap
 *  tool round teach their planes from; every string in it is a PROSE-1 slot (`contracts/rpg/prose.ts`). */
export function extractionSystem(inputs: PromptInputs): string {
  const { config, refs, prose, reconcile } = inputs;
  const teaching = composePlaneTeaching({ config, refs, prose });
  const refLines = refEnumerationLines(inputs);
  const parts = [
    resolveProseText("rpg.extract.systemHeader", prose),
    teaching,
    ...(refLines.length > 0 ? [refLines] : []),
    ...(reconcile ? [resolveProseText("rpg.extract.reconcilePass", prose)] : []),
  ];
  return parts.join("\n\n");
}

/** Strip model-facing PLUMBING from the base state before it rides the CURRENT TRACKED STATE block (§4.4):
 *   • `fieldLocks` — the lock record is not model data; the model-facing frame renders it as one prose "Locked
 *     paths" line (so the model honors pins without reading the raw record as noise).
 *   • quest + objective `id`s — the extractor targets quests by NAME (`upsert_quest`), so the branded ids are
 *     pure noise that bloat the prompt and can mislead a weak model into echoing an id.
 *  Returns the projected JSON string + the locked-paths line (empty when nothing is locked). */
function projectStateForModel(baseState: RpgSnapshotState, prose: ProseOverrides): { json: string; lockedPathsLine: string } {
  const { fieldLocks, quests, ...rest } = baseState;
  const strippedQuests = quests.map(({ id: _id, objectives, ...q }) => ({
    ...q,
    objectives: objectives.map(({ id: _oid, ...o }) => o),
  }));
  const json = JSON.stringify({ ...rest, quests: strippedQuests });
  const lockedPaths = fieldLocks !== null ? Object.keys(fieldLocks) : [];
  const lockedPathsLine = lockedPaths.length > 0 ? resolveProseText("rpg.extract.lockedPaths", prose, { lockedPaths: lockedPaths.join(", ") }) : "";
  return { json, lockedPathsLine };
}

/** The user-turn body both extraction arms send — the three labeled blocks (§1.3). RECENT STORY (oldest first)
 *  is DROPPED on the `beat` arm so the request is byte-identical to the pre-redesign `{state}\n{beat}` shape
 *  (the escape hatch's byte-compat contract). The CURRENT TRACKED STATE is the model-projected state (§4.4
 *  strip); the LATEST BEAT is the newest committed turn (its delta target). */
function extractionUserPrompt(args: {
  story: readonly RpgTurnTranscriptMessage[];
  stateJson: string;
  lockedPathsLine: string;
  beat: string;
  prose: ProseOverrides;
}): string {
  const stateBlock = args.lockedPathsLine.length > 0 ? `${args.stateJson}\n${args.lockedPathsLine}` : args.stateJson;
  // `beat` arm: no RECENT STORY block — byte-identical to today's `CURRENT STATE:\n{json}\n\nLATEST BEAT:\n{beat}`.
  if (args.story.length === 0) {
    return `CURRENT STATE:\n${stateBlock}\n\nLATEST BEAT:\n${args.beat}`;
  }
  const storyLines = args.story.map(renderTranscriptLine).join("\n");
  // PROSE-1 slot (#578): the LATEST BEAT label carries real prose ("your delta covers exactly this") beside
  // the two structural block headers (§2.11, out of scope) — `rpg.extract.userPrompt.latestBeatLabel`.
  return (
    `RECENT STORY (oldest first):\n${storyLines}\n\n` +
    `CURRENT TRACKED STATE:\n${stateBlock}\n\n` +
    `${resolveProseText("rpg.extract.userPrompt.latestBeatLabel", args.prose)}\n${args.beat}`
  );
}

/** Build the user-turn body BOTH extraction arms share, from the turn context + base state + config. The ONE
 *  place that honors the §1.3 byte-compat contract: on the `beat` arm the request is IDENTICAL to the
 *  pre-redesign shape — the FULL `JSON.stringify(baseState)` (no §4.4 strip) and no RECENT STORY block, so the
 *  verifier's diff matches today exactly. The `window`/`full` arms slice the turn's transcript and ride the
 *  model-projected state (locks/ids stripped, §4.4). */
export function buildExtractionUserPrompt(
  transcript: readonly RpgTurnTranscriptMessage[],
  baseState: RpgSnapshotState,
  config: RpgGameConfig,
  prose: ProseOverrides,
): string {
  const { story, beat } = sliceTranscript(transcript, config);
  // `beat` arm — byte-identical to the pre-redesign request: the raw full state JSON, no strip, no story block.
  if (config.extractionContext === "beat") {
    return extractionUserPrompt({ story: [], stateJson: JSON.stringify(baseState), lockedPathsLine: "", beat, prose });
  }
  // `window`/`full` — the new behavior: sliced story + the §4.4 model-projected state.
  const { json, lockedPathsLine } = projectStateForModel(baseState, prose);
  return extractionUserPrompt({ story, stateJson: json, lockedPathsLine, beat, prose });
}

/** The SEMANTIC self-ref the human player's actor always answers to — a STABLE token independent of the
 *  display name (owner ruling 2026-07-27: "You" is the no-persona fallback, a persona sets a real name, and
 *  the model reaching for "player" was the saner API). The wire vocabulary leads with this; the resolver
 *  (`buildActorRefIndex` self-aliases) maps it to the user ref, and the snapshot keys on `user:<id>` (stable
 *  across persona changes — verified, never orphaned by a display-name toggle). */
const PLAYER_SEMANTIC_REF = "player";

/** The resolved ref vocabulary for a call: the enum-able refs + the player's current display name (for the
 *  prompt's `player = X` explainer; null when no user actor) + the game config (the plane-teaching + window
 *  knobs read it — resolved once here, off the game the refs already fetch). A turnless game (no row) folds to
 *  the all-defaults config so the fresh-game path still teaches every default plane. */
interface ResolvedRefs {
  readonly refs: ExtractionRefs;
  readonly playerDisplayName: string | null;
  readonly config: RpgGameConfig;
}

/** The valid per-call refs the schema constraint + the prompt enumerate. The set MIRRORS what `resolveActor`
 *  (`tools/apply.ts`) can actually resolve, so the enum offers exactly the resolvable targets:
 *   • the semantic `player` token — ADDED only when NO participant member already occupies the name "player"
 *     (`buildActorRefIndex` gives an explicit participant name precedence over the self-alias; a participant char
 *     literally named "Player" therefore OWNS the `player` ref — stickler F10 — and the human is addressed by
 *     their own display name, kept below);
 *   • every participant member's display name (incl. a "Player"-named char and the user's persona name);
 *   • every tracked NPC actor's display name (`baseState.actorState` npc entries — R2 folded the old separate
 *     `presentCharacters[].key` walk into this one, because the scene npcs and the tracked npcs are the same
 *     rows now) — so `scene.presentRemove` can name an NPC the model previously upserted, and
 *     party/inventory/wallet reach a first-class npc whether or not she is on stage (stickler F4, D108).
 *  Deduped case-insensitively. A model can then only target a REAL, resolvable ref under an enforcing backend,
 *  and the npc-actor reach is representable in BOTH constrained modes. */
export async function resolveExtractionRefs(deps: RpgRoundsDeps, chatId: ChatId, baseState: RpgSnapshotState, reconcile: boolean): Promise<ResolvedRefs> {
  const [participants, game] = await Promise.all([deps.rpgChatOps.resolveRpgParticipants(chatId), findGameByChat(deps.db, chatId)]);
  const config = game?.config ?? rpgGameConfigSchema.parse({});
  // R6 — the per-actor write surface needs each participant actor's SHEET exceptions (grants/revokes). One read,
  // only when the game actually defines trackers (a tracker-free game pays nothing for the machinery).
  const sheets = game !== undefined && config.trackers.length > 0 ? await listSheets(deps.db, game.id) : [];
  const player = participants.find((r) => r.actorRef.kind === "user");
  const participantOwnsPlayerName = participants.some((r) => r.name.toLowerCase() === PLAYER_SEMANTIC_REF);
  // The CARRIERS and the target-name enum are built from ONE walk, so they can never diverge: every name the
  // enum offers belongs to a carrier whose writable-tracker set the schema then pins (R6), and every carrier
  // is reachable. Insertion-ordered, case-insensitively deduped.
  const seen = new Set<string>();
  const carriers: RpgTrackerCarrier[] = [];
  const add = (carrier: RpgTrackerCarrier): void => {
    const key = carrier.name.toLowerCase();
    if (carrier.name.length > 0 && !seen.has(key)) {
      seen.add(key);
      carriers.push(carrier);
    }
  };
  // Every carrier is minted through the ONE derivation the READ surface uses (`actorCarrier`, the tracker
  // view's) — never a second inline spelling of "which class is this person, and what are their exceptions".
  // That is the §1.4 fix made literal: the read surface used to class by which PLANE a row sat on and the
  // write surface by name-dedup order, so a participant character standing in the scene was `npcs` to one and
  // `party` to the other, and a `trust(appliesTo:"npcs")` def was taught on her line and offered on nobody's.
  // One function, both surfaces, class derived from `actorRef.kind` — the drift is unrepresentable.
  const sheetByKey = new Map<string, RpgSheet>(
    sheets.map((row) => [
      actorRefKey(row.characterId !== null ? { kind: "character", characterId: row.characterId } : { kind: "user", userId: row.userId as UserId }),
      row.sheet,
    ]),
  );
  const carrierFor = (ref: RpgActorRef, name: string): RpgTrackerCarrier => actorCarrier(ref, name, sheetByKey.get(actorRefKey(ref)));
  // The stable semantic token leads — UNLESS a participant member already claims "player" (that char owns it, F10).
  // It rides as a SECOND carrier over the same actor so it lands in the player's own write-surface group.
  if (player !== undefined && !participantOwnsPlayerName) {
    add(carrierFor(player.actorRef, PLAYER_SEMANTIC_REF));
  }
  for (const r of participants) {
    // every participant display name is valid (persona-name + the F10 "Player"-named char)
    add(carrierFor(r.actorRef, r.name));
  }
  // The tracked NPC actors — on stage or off (F4: party/inventory/wallet reach a tracked NPC either way).
  // ONE walk since R2, because the scene npcs and the tracked npcs are the SAME rows now: the presence plane
  // holds only ref keys, so there is no second name namespace to add and no way for a carrier to be classed
  // twice. The enum offers the DISPLAY name (what the model wrote and will write back), never the slug key.
  for (const actor of baseState.actorState) {
    if (actor.actorRef.kind === "npc") {
      add(carrierFor(actor.actorRef, actor.identity?.name ?? actor.actorRef.npcKey));
    }
  }
  const actorRefs = carriers.map((c) => c.name);
  // R5a — the CURRENTLY-ACTIVE condition names (across every tracked actor, deduped in encounter order)
  // constrain `party[].removeCondition`, so a retirement can only name a condition that is actually on
  // someone. Nobody afflicted ⇒ an empty list ⇒ the field stays unconstrained (never an empty enum).
  const conditionNames = [...new Set(baseState.actorState.flatMap((a) => a.volatile.conditions.map((c) => c.name)))];
  // ESTABLISH-WHEN-UNSET: force scene fields REQUIRED (constrainExtractionSchema) ONLY while the current scene
  // lacks them — a fresh game establishes the scene from the first beat, an ongoing scene keeps the optional
  // omit=keep patch. `location` defaults to "" (unset), `clock` is null until a timeOfDay lands, and an empty
  // `presentCharacters` means no npc has been put on stage yet (force a non-empty presentUpsert).
  //
  // RECONCILE (crunchy-cluster §1.3): on a reconcile beat / a resync, force EVERY scene field REQUIRED
  // UNCONDITIONALLY (not just the unset ones) — the establish-when-unset lever becomes the standing anti-drift
  // mechanism, so the model re-states the whole scene + present characters even when the state already has them. The
  // re-emission still merges through [merge-clear] + lock honoring, so a hand-pin survives a reconcile.
  const establishScene = reconcile
    ? { location: true, timeOfDay: true, presentCast: true }
    : {
        location: baseState.location === "",
        timeOfDay: baseState.clock === null,
        presentCast: baseState.presentCharacters.length === 0,
      };
  return {
    refs: {
      actorRefs,
      // R6 — the per-actor write surface: each distinct writable-tracker set with the target names that share
      // it. Identical sets collapse into ONE group, so the common all-`everyone` game projects a flat schema.
      trackerWriteGroups: buildTrackerWriteGroups(config.trackers, carriers),
      gameTrackerKeys: gameTrackerWriteKeys(config.trackers),
      conditionNames,
      establishScene,
    },
    playerDisplayName: player?.name ?? null,
    config,
  };
}

/** The valid-ref enumeration block (the FALLBACK arm for a model whose wire can't enforce the schema enum —
 *  the schema binds it structurally where the backend supports it, and the prompt names the valid refs
 *  everywhere). The `player` token is explained (= the human's character, currently shown as X) so the model
 *  prefers the stable ref. Returns "" for a fresh game with no refs (the composer omits the block). Both the
 *  structured extraction (`extractionSystem`) and the cheap tool round (`toolRoundSystem`) append this. */
function refEnumerationLines(inputs: PromptInputs): string {
  const { refs, playerDisplayName, prose } = inputs;
  const lines: string[] = [];
  if (refs.actorRefs.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.targets", prose, { targetRefs: refs.actorRefs.join(", ") }));
  }
  // Explain the `player` token ONLY when it is actually in the enum — a roster char literally named "Player"
  // owns that ref (F10), so the token is withheld and the human is addressed by their display name instead.
  if (playerDisplayName !== null && refs.actorRefs.includes(PLAYER_SEMANTIC_REF)) {
    lines.push(resolveProseText("rpg.extract.refs.playerToken", prose, { playerRef: PLAYER_SEMANTIC_REF, playerName: playerDisplayName }));
  }
  // R6 — the TRACKER write surface named in prose (the fallback arm for a wire that can't enforce the enums).
  // The keys are listed per distinct carrier set, so a model reading only the prompt still learns that not
  // every actor carries every tracker. Empty groups (a tracker-free game) contribute nothing.
  //
  // The two ARM LABELS stay inline literals and are NOT slots: `trackerDeltas keys:` / `trackerSets keys:` are
  // the wire field names with a colon — structural grammar, three words, §2.11's out-of-scope class (editing
  // one buys a host nothing and desyncs the label from the arg it names).
  for (const group of refs.trackerWriteGroups) {
    if (group.deltaKeys.length === 0 && group.setKeys.length === 0) {
      continue;
    }
    const arms: string[] = [];
    if (group.deltaKeys.length > 0) {
      arms.push(`trackerDeltas keys: ${group.deltaKeys.join(", ")}`);
    }
    if (group.setKeys.length > 0) {
      arms.push(`trackerSets keys: ${group.setKeys.join(", ")}`);
    }
    lines.push(resolveProseText("rpg.extract.refs.trackerGroup", prose, { targetRefs: group.targetRefs.join(", "), trackerKeys: arms.join("; ") }));
  }
  const gameKeys = [...refs.gameTrackerKeys.deltaKeys, ...refs.gameTrackerKeys.setKeys];
  if (gameKeys.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.gameTrackerKeys", prose, { trackerKeys: gameKeys.join(", ") }));
  }
  // R5b(a) — the schema binds `removeCondition` to the live conditions (R5a); this is the matching PROMPT half
  // for a backend that can't enforce the enum. Without it the model retires a condition nobody carries (or
  // comma-joins four into the scalar, the measured 8B failure) and the write is silently dropped at apply.
  if (refs.conditionNames.length > 0) {
    lines.push(resolveProseText("rpg.extract.refs.conditions", prose, { conditions: refs.conditionNames.join(", ") }));
  }
  lines.push(resolveProseText("rpg.extract.refs.closing", prose));
  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHEAP mode — the DEDICATED TOOL ROUND (owner ruling 2026-07-27). The sibling of `runExtraction`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A state-only request (NOT tools on the character turn): the 6 state tools + a `no_changes` escape, with
// ref-enum-constrained args (R1) + `tool_choice:"required"` (LIVE-VERIFIED: vLLM hermes/Qwen3 + OpenRouter
// both emit PARALLEL calls on a change beat + a single `no_changes` on a quiet one). No prose expected. The
// parsed calls fold to the SAME `RpgStateDelta` the structured arm produces (the shared-plane proof). Portable across
// the connections that carry a forced tool round (`carriesForcedToolRound`); any other connection routes through
// the SAME structured-output extraction (identical delta by the shared-plane proof — the
// honest degrade, capability-keyed: cheap needs `capability.tools`, absent ⇒ readonly upstream).

/** The tool-round system prompt — state-focused, aggressive about tool use (no prose to lose). Composes the
 *  SAME per-plane teaching (from the §1.6 registry — plot/trackers/deception-clause) that the
 *  structured arm uses, plus the tool-round's decomposition-nudge framing + the ref enumeration (R1 fallback). */
export function toolRoundSystem(inputs: PromptInputs): string {
  const { config, refs, prose, reconcile } = inputs;
  // DECOMPOSITION NUDGE (2026-07-27): the 8B under-fires — a beat that moved location AND wounded someone often
  // wrote only ONE plane. So the prompt walks the model plane-by-plane (a checklist) and gives the concrete
  // multi-call example, forcing it to consider EACH plane independently rather than settling for one call.
  // Bounded attempt ([[plan-for-small-hardware]] — if the 8B ceiling holds, the honest-arms degrade holds).
  // The bytes are a PROSE-1 slot, so a host whose model under-fires differently can retune the checklist.
  const base = resolveProseText("rpg.extract.toolRoundHeader", prose);
  const teaching = composePlaneTeaching({ config, refs, prose });
  const refLines = refEnumerationLines(inputs);
  const parts = [base, teaching, refLines, ...(reconcile ? [resolveProseText("rpg.extract.reconcilePass", prose)] : [])];
  return parts.join("\n\n");
}

/** Build the per-game, per-actor wire tools for a state round / a folded turn (R6 + R2). The parameters come
 *  from ONE projection of the extraction schema constrained by this call's refs — so the tool a model is handed
 *  offers EXACTLY the trackers each target actually carries, minus the locked ones (prevent-at-schema; the
 *  apply-time lock strip stays a backstop). The descriptions are the R2 TEMPLATES rendered against THIS game,
 *  so a host's `Grit ("resolve you spend to push through danger")` reaches the write surface by name + gloss.
 *
 *  A plane the game doesn't have is OMITTED ENTIRELY, never offered as an empty husk: `set_tracker` disappears
 *  when the game defines no game-subject trackers (the constraint dropped the plane from the schema, and a
 *  tool whose parameters no longer exist would be an invitation to write nothing).
 *
 * @public Test-anchored module surface: the structured round's schema-weight pins build from this exact list. */
export function buildToolRoundWireTools(
  refs: ExtractionRefs,
  config: RpgGameConfig,
  prose: ProseOverrides,
): { name: string; description: string; parameters: Record<string, unknown> }[] {
  // The per-tool projected args, ref-constrained. We reuse the extraction constraint by projecting the whole
  // extraction schema once and lifting each array field's item schema (which carries the injected enums).
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs) as {
    properties?: Record<string, { items?: Record<string, unknown> } | Record<string, unknown>>;
  };
  const itemSchemaOf = (field: string): Record<string, unknown> | undefined => {
    const node = constrained.properties?.[field] as { items?: Record<string, unknown> } | undefined;
    return node === undefined ? undefined : (node.items ?? { type: "object" });
  };
  const sceneSchema = (constrained.properties?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" };
  const descriptions = buildRpgToolDescriptions({ config, refs, prose });
  const describeTool = (name: string): string => descriptions.get(name) ?? "";
  const tools: { name: string; description: string; parameters: Record<string, unknown> }[] = [
    { name: "update_party", description: describeTool("update_party"), parameters: itemSchemaOf("party") ?? { type: "object" } },
    { name: "update_inventory", description: describeTool("update_inventory"), parameters: itemSchemaOf("inventory") ?? { type: "object" } },
    { name: "update_scene", description: describeTool("update_scene"), parameters: sceneSchema },
  ];
  // The game-subject tracker tool — present ONLY when this game defines one (R6 "a disabled feature's tool is
  // omitted entirely"). `itemSchemaOf` returns undefined exactly when the constraint pruned the plane.
  const trackerParams = itemSchemaOf("trackers");
  if (trackerParams !== undefined) {
    tools.push({ name: "set_tracker", description: describeTool("set_tracker"), parameters: trackerParams });
  }
  tools.push(
    { name: "upsert_quest", description: describeTool("upsert_quest"), parameters: itemSchemaOf("quests") ?? { type: "object" } },
    { name: "add_journal_entry", description: describeTool("add_journal_entry"), parameters: itemSchemaOf("journal") ?? { type: "object" } },
    {
      name: RPG_NO_CHANGES_TOOL,
      description: resolveProseText("rpg.extract.tool.noChanges", prose),
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  );
  return tools;
}
