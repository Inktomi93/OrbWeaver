// Assemble context producer: RESOLVE (characters/personas/names) → GATHER (WI pool + keyword match + memory) →
// BUILD (render WI once, unify all injections into one budgeted pass) → the immutable AssembleContext SHAPE
// consumes per speaker. USER_INPUT regex runs here (between RESOLVE and GATHER) so the WI haystack and the
// persisted user row are the same post-regex text.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  AssembleCharacter,
  AssembleContext,
  AssemblePersona,
  AssembleWorldEntry,
  ChatInjection,
  MacroFreezeRecord,
  MemoryRecallSlice,
  RoomOverrides,
  SpeakerRef,
} from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { GenerationType, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, PRESET_FORMAT_SLOT_IDS, REWRITE_TOGGLES } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { composeProse, legacyProseOverrides, resolveProseText, resolveSteerFragments } from "@orb/contracts/prose";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { composeRewriteSteer, GUIDED_GAME_STEERS } from "@orb/kit/guided";
import type { CharacterId, ChatId, PersonaId, UserId, WorldEntryId } from "@orb/kit/ids";
import type { MacroContext, MacroFreeze, MacroRegistry } from "@orb/kit/macro";
import { globalMacroRegistry } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { estimateTokens } from "@orb/kit/tokens";
import type { EntryPosition, MatchEntryKeysOptions } from "@orb/kit/world-info";
import { buildKeywordHaystack, matchEntryKeys } from "@orb/kit/world-info";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { ApplyRegexReplaceOp, TestRegexKeyOp } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { ResolvedPersonas } from "../contract/foreign.ts";
import type { GuidedSteer } from "../contract/params.ts";
import { BEFORE_HISTORY_DEPTH, renderInjection } from "./injections.ts";
import { buildTurnMacroContext, freezeVolatileMacros, renderMacros, resolveGuidedActionText } from "./macros.ts";
import { hasActiveMarker } from "./sections.ts";
import { loadWorldInfoPool } from "./world-info/pool.ts";

interface MatchedKey {
  key: string;
  matchedLatestUserMessage: boolean;
}

/** Logs a ReDoS-watchdog/bad-regex failure; the pass proceeds fail-open on the text as-is. */
function onHostRegexFailure(placement: "WORLD_INFO" | "USER_INPUT"): (err: unknown, script: RegexScriptInput) => void {
  return (err, script) => getLog().warn({ err, placement, findRegex: script.findRegex }, "chat: host-tier regex script failed (D53 watchdog)");
}

/** Logs a bad user-authored world-info REGEX KEY (a V3 `use_regex` entry); the matcher falls back to a
 *  literal compare for that key, so the turn proceeds fail-open. */
function onWorldInfoKeyCompileFailure(key: string, reason: string): void {
  getLog().warn({ key, reason }, "chat: world-info regex key failed to compile — matched literally");
}

/** Logs a macro-engine depth-cap/output-size trip; fail-open, output stays bounded. */
function onMacroWarn(msg: string, err?: unknown): void {
  getLog().warn({ err, macroWarn: msg }, "chat: macro budget/eval trip (D53)");
}

/** Where a world-info entry sits in the system region: the before/after anchor it follows, in the static half
 *  (an always-scope entry) or the per-turn half (a keyword-fired one). */
interface WiBucket {
  readonly anchor: EntryPosition;
  readonly half: "static" | "dynamic";
}

/** A budget candidate: a rendered injection + cost + survival flag + sort priority. `bucket` routes a WI entry
 *  to its before/after anchor instead of the injection list. */
interface InjectionCandidate {
  injection: ChatInjection;
  tokens: number;
  ignoreBudget: boolean;
  priority: number;
  entryId: string;
  /** Set only for a WI-origin candidate; user/guided candidates use a synthetic entryId and leave this unset. */
  worldEntryId?: WorldEntryId;
  /** The WI entry's keyword list (WI-origin only; [] for an always-scope entry) — surfaced in the activation
   *  trace so the host preview lists WHICH lore fired by identity + keys. Unset for user/guided candidates. */
  worldEntryKeys?: string[];
  bucket: WiBucket | null;
}

const OPERATOR_PRIORITY = Number.MAX_SAFE_INTEGER;

function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Sort priority DESC, then entryId ASC — deterministic budget walk. */
function compareCandidates(a: InjectionCandidate, b: InjectionCandidate): number {
  return b.priority !== a.priority ? b.priority - a.priority : compareStr(a.entryId, b.entryId);
}

/** Walks the candidate list once in priority order, charging tokens against `budget`; `ignoreBudget`
 *  entries always survive; `budget <= 0` keeps all. Returns kept candidates (original order) + dropped ids. */
function budgetInjections(
  candidates: readonly InjectionCandidate[],
  budget: number,
): { kept: InjectionCandidate[]; dropped: { id: string; reason: "budget" }[] } {
  const ordered = candidates.toSorted(compareCandidates);
  const keptSet = new Set<InjectionCandidate>();
  const dropped: { id: string; reason: "budget" }[] = [];
  let spent = 0;
  for (const c of ordered) {
    if (budget > 0 && !c.ignoreBudget && spent + c.tokens > budget) {
      dropped.push({ id: c.entryId, reason: "budget" });
      continue;
    }
    if (budget > 0 && !c.ignoreBudget) {
      spent += c.tokens;
    }
    keptSet.add(c);
  }
  return { kept: candidates.filter((c) => keptSet.has(c)), dropped };
}

/** Resolves `{{entry}}` in a wiFormat template without re-rendering the already-resolved entry content. */
function wrapWiFormat(content: string, wiFormat: string, ctx: AssembleContext, registry: MacroRegistry): string {
  if (!wiFormat.includes("{{entry}}")) {
    return content;
  }
  // Function-replacer, not string replaceAll: the string form treats "$$"/"$&"/"$1" in content as
  // replacement patterns, corrupting lore text that contains them (e.g. "$$50").
  return renderMacros(wiFormat, ctx, ctx.activePersona, { registry }).replaceAll("{{entry}}", () => content);
}

interface WiConversionArgs {
  readonly regexScripts: readonly RegexScriptInput[];
  /** The injected node:vm ReDoS watchdog (D53) — the WORLD_INFO regex pass runs its `text.replace` under it. */
  readonly applyReplace: ApplyRegexReplaceOp;
  /** The injected node:vm ReDoS watchdog for a `use_regex` entry's key `.test` (#710) — a catastrophic
   *  user-authored key is interrupted instead of hanging the keyword scan. */
  readonly testRegexKey: TestRegexKeyOp;
  readonly wiFormat: string;
  readonly recentMessages: readonly string[];
  readonly names: readonly string[];
  readonly pendingUserText: string | undefined;
  /** The raw one-turn guided steer text (F4 / §6-item-5): the user's steering line joins the keyword
   *  haystack so "the dragon attacks" can wake dragon lore on a generate/swipe/continue turn that has no
   *  pendingUserText. The RAW input (not the resolved template) — the template is boilerplate framing; the
   *  keyword-bearing content is the user's line. Absent/empty ⇒ byte-identical to a non-steered turn. */
  readonly guidedSteerText: string | undefined;
  readonly lastUserMessage: string | undefined;
  readonly hasBeforeAnchor: boolean;
  readonly hasAfterAnchor: boolean;
  /** The per-turn user-macro registry (WAVE MU) the WI entry-content + wiFormat renders resolve against
   *  (carried on the args bundle so `convertWorldInfo` stays under the 4-param cap). */
  readonly registry: MacroRegistry;
}

/** The per-conversion runtime bundle (keeps `classifyWiEntry` under the 4-param cap). */
interface WiConvEnv {
  readonly ctx: AssembleContext;
  readonly args: WiConversionArgs;
  /** The turn-stage macro ctx for the WORLD_INFO regex find/replace template passes — built ONCE. */
  readonly regexCtx: MacroContext;
  /** The per-turn user-macro registry (WAVE MU) the WI entry content + wiFormat renders resolve against. */
  readonly registry: MacroRegistry;
  readonly haystacks: { full: string; latestUser: string };
  readonly matchedKeys: MatchedKey[];
}

/** Which anchor a system-half WI entry follows, or null when the preset renders no such anchor this turn (the
 *  entry then keeps its default half: in_static for always-scope, the in_prompt suffix for keyword). */
function resolveBucket(entry: AssembleWorldEntry, args: WiConversionArgs, half: WiBucket["half"]): WiBucket | null {
  if (entry.position === "before" && args.hasBeforeAnchor) {
    return { anchor: "before", half };
  }
  if (entry.position === "after" && args.hasAfterAnchor) {
    return { anchor: "after", half };
  }
  return null;
}

/** Position-routes a rendered WI entry: depth-inject → in_chat; always-scope → its anchor in the static half
 *  (or in_static); keyword (fired) → its anchor in the per-turn half (or the in_prompt suffix), the anchor
 *  SillyTavern places it at. The cache cost of per-turn lore at an anchor is the author's choice. */
function wiCandidate(entry: AssembleWorldEntry, content: string, args: WiConversionArgs): InjectionCandidate {
  const meta = {
    tokens: estimateTokens(content),
    ignoreBudget: entry.ignoreBudget === true,
    priority: entry.priority,
    entryId: entry.id,
    worldEntryId: entry.id,
    worldEntryKeys: [...entry.keys],
  };
  if (entry.inject !== null && entry.inject !== undefined) {
    const injection: ChatInjection = {
      position: "in_chat",
      depth: entry.inject.depth,
      role: entry.inject.role,
      content,
      origin: "world-info",
    };
    return { injection, ...meta, bucket: null };
  }
  if (entry.scope === "always") {
    const injection: ChatInjection = { position: "in_static", depth: 0, role: "system", content, origin: "world-info" };
    return { injection, ...meta, bucket: resolveBucket(entry, args, "static") };
  }
  const injection: ChatInjection = { position: "in_prompt", depth: 0, role: "system", content, origin: "world-info" };
  return { injection, ...meta, bucket: resolveBucket(entry, args, "dynamic") };
}

/** The per-entry key-compile options: a V3 `use_regex` entry's keys compile as PATTERNS, and a bad pattern
 *  warns + falls back to a literal compare rather than failing the turn. `testRegex` is the injected node:vm
 *  ReDoS watchdog so a catastrophic user-authored key `.test` is interrupted, not run unbounded (#710). */
function keyMatchOptions(entry: AssembleWorldEntry, testRegex: TestRegexKeyOp): MatchEntryKeysOptions {
  return { keyMode: entry.keyMode ?? "literal", onKeyCompileFailure: onWorldInfoKeyCompileFailure, testRegex };
}

/** Records a keyword entry's fired keys, noting which fired on the latest user text, into the trace. */
function recordKeyHits(entry: AssembleWorldEntry, hits: readonly string[], env: WiConvEnv): void {
  const userHits =
    env.haystacks.latestUser.length > 0
      ? new Set(matchEntryKeys(entry.keys, env.haystacks.latestUser, keyMatchOptions(entry, env.args.testRegexKey)))
      : new Set<string>();
  for (const key of hits) {
    env.matchedKeys.push({ key, matchedLatestUserMessage: userHits.has(key) });
  }
}

/** Classifies one enabled WI entry into a budget candidate (null if a keyword entry didn't fire); renders
 *  once via macro → regex(WORLD_INFO) → wiFormat-wrap. */
function classifyWiEntry(entry: AssembleWorldEntry, env: WiConvEnv): InjectionCandidate | null {
  if (entry.scope === "keyword") {
    const hits = matchEntryKeys(entry.keys, env.haystacks.full, keyMatchOptions(entry, env.args.testRegexKey));
    if (hits.length === 0) {
      return null;
    }
    recordKeyHits(entry, hits, env);
  }
  const persona = entry.source === "character" ? env.ctx.pinnedPersona : env.ctx.activePersona;
  const resolved = renderMacros(entry.content, env.ctx, persona, { registry: env.registry });
  const afterRegex = executeRegexScripts({
    text: resolved,
    scripts: env.args.regexScripts,
    placement: "WORLD_INFO",
    ctx: env.regexCtx,
    applyReplace: env.args.applyReplace,
    onScriptFailure: onHostRegexFailure("WORLD_INFO"),
  });
  // Guard against wrapping an empty entry into a dangling scaffold under a custom wiFormat template.
  if (afterRegex.trim().length === 0) {
    return null;
  }
  return wiCandidate(entry, wrapWiFormat(afterRegex, env.args.wiFormat, env.ctx, env.registry), env.args);
}

/** Converts the WI pool to budget candidates + the matched-keys trace; keyword matching sees the
 *  pending (uncommitted) user text. */
function convertWorldInfo(
  pool: readonly AssembleWorldEntry[],
  ctx: AssembleContext,
  args: WiConversionArgs,
  regexCtx: MacroContext,
): { candidates: InjectionCandidate[]; matchedKeys: MatchedKey[] } {
  // Order is immaterial to matching (newline-joined, word-boundary regex per key); the steer is appended
  // last so a non-steered turn stays byte-identical to the recentMessages+pendingUserText haystack.
  const haystackTexts = [
    ...args.recentMessages,
    ...(args.pendingUserText !== undefined ? [args.pendingUserText] : []),
    ...(args.guidedSteerText !== undefined && args.guidedSteerText.trim().length > 0 ? [args.guidedSteerText] : []),
  ];
  const latestUserText = args.pendingUserText ?? args.lastUserMessage ?? "";
  const env: WiConvEnv = {
    ctx,
    args,
    regexCtx,
    registry: args.registry,
    haystacks: {
      full: buildKeywordHaystack(haystackTexts, args.names),
      latestUser: latestUserText.toLowerCase(),
    },
    matchedKeys: [],
  };
  const candidates: InjectionCandidate[] = [];
  for (const entry of pool) {
    if (!entry.enabled) {
      continue;
    }
    const candidate = classifyWiEntry(entry, env);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  return { candidates, matchedKeys: env.matchedKeys };
}

/** The flat `characters` card → the slim `AssembleCharacter` the assembler renders. */
function toAssembleCharacter(card: CharacterCard): AssembleCharacter {
  return {
    name: card.name,
    description: card.description ?? "",
    personality: card.personality,
    scenario: card.scenario,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    depthPrompt: card.depthPrompt,
  };
}

/** Everything the engine/verb resolves at the composition seam + the chat-owned data this producer reads.
 *  File-local — the engine passes a structurally-matching literal (promptConfig/personas/memory are
 *  resolved by other domains, not fetched here). */
interface BuildAssembleContextInput {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly characterIds: readonly CharacterId[];
  /** The present SEATED agents (D60), soul-resolved by `loadRoom` via the compose-root speaker registry.
   *  Appended to `characters`/`speakerRefs` AFTER the characters (index-aligned) so the per-speaker SHAPE renders
   *  an agent's soul as its own card. Empty (the overwhelming case) ⇒ byte-identical to a character-only room.
   *  NOT folded into `characterIds` — agents have no character id / world-info / memory bucket. */

  /** The `speakerKey`s of the present MUTED seats (character + agent), from `loadRoom`'s candidate `disabled`
   *  axis — the producer of `unmutedCharacters`. Absent ⇒ nothing muted (or a hand-built ctx) ⇒ the full seated-character set. */
  readonly mutedSpeakerKeys?: ReadonlySet<string> | undefined;
  readonly personaIds: readonly PersonaId[];
  readonly promptConfig: PromptConfig;
  readonly personas: ResolvedPersonas;
  /** The room seats more than one present human (`AssembleContext.multiHuman`). Absent ⇒ solo. */
  readonly multiHuman?: boolean | undefined;
  readonly roomOverrides?: RoomOverrides | undefined;
  readonly recentMessages: readonly string[];
  readonly lastMessage?: string | undefined;
  readonly lastUserMessage?: string | undefined;
  readonly lastCharMessage?: string | undefined;
  /** In-flight (uncommitted) user turn — folded into the WI keyword haystack. */
  readonly pendingUserText?: string | undefined;
  readonly currentInput?: string | undefined;
  readonly userInjections: readonly ChatInjection[];
  readonly memory?: string | null | undefined;
  /** The recall trace explaining {@link BuildAssembleContextInput.memory} (#250) — staged by the gather that
   *  produced the text. Absent ⇒ recall never ran for this build ⇒ the assembly trace reports
   *  `memoryRecall: null` (a preview / hand-built ctx), which is distinct from a recall that surfaced nothing. */
  readonly memoryTrace?: MemoryRecallSlice | undefined;
  /** The `{{databank}}` slot value (DB6) — reading-order-restored, budget-fitted document chunks. Absent ⇒
   *  the slot resolves empty (byte-identical to a non-databank turn). */
  readonly databank?: string | null | undefined;
  /** The 8 rpg* data-fed macro values (rpg-design/06 §1), keyed by the RpgGatherMacros field names — a game
   *  turn's GATHER stages this. Absent ⇒ every rpg macro resolves empty (byte-identical non-game turn). */
  readonly rpgMacros?: Readonly<Record<string, string>> | undefined;
  // A game turn's `{{expr::…}}` CEL activation (§12) — the data-only `rpg` binding (the tracker view as a CelValue
  // tree). Absent ⇒ `{{expr}}` sees an empty binding (`{{expr::rpg.…}}` errors-to-"").
  readonly celBindings?: Readonly<Record<string, unknown>> | undefined;
  /** The `{{idle_duration}}` value (§12 D6 fold) — human text time-since-last-activity, computed at GATHER off
   *  the message timestamps (excluding the in-flight message). Absent ⇒ the marker resolves empty. */
  readonly idleDuration?: string | undefined;
  readonly compactSummary?: string | null | undefined;
  /** The compaction coverage stamp — covered canon rows (`seq <= compactedThroughSeq`) fall out of the shaped
   *  prompt history when a summary is present (full-reset). Null/absent ⇒ no exclusion. */
  readonly compactedThroughSeq?: number | null | undefined;
  readonly guidedInstruction?: string | null | undefined;
  /** The one-turn typed steer, resolved once in BUILD; never persisted or re-routed at splice time. */
  readonly guided?: GuidedSteer | undefined;
  readonly variableValues: Record<string, string>;
  readonly generationType?: GenerationType | undefined;
  /** Per-request browser IANA zone for `{{time}}`/`{{date}}`, not a stored setting; absent falls back to
   *  server-local. */
  readonly timezone?: string | undefined;
  readonly nowMs?: number | undefined;
  /** Seeded turn PRNG — never ambient Math.random; drives the SEND volatile-macro freeze so a committed
   *  row's baked value is deterministic + replayable. */
  readonly prng?: (() => number) | undefined;
  readonly model: string;
  /** Per-turn injection token budget (0 = unbudgeted). */
  readonly injectionTokenBudget: number;
  /** Effective host-tier regex set (global ∪ preset ∪ character ∪ room), resolved by the verb/root; applied
   *  at SEND (USER_INPUT) and copied onto the returned AssembleContext for RECEIVE. */
  readonly hostTierRegexScripts?: readonly RegexScriptRow[] | undefined;
  /** The per-turn user-macro RENDER registry (WAVE MU) — every section/WI/persona/note render resolves
   *  user macros against it; absent ⇒ the process `globalMacroRegistry` (byte-identical). NEVER placed on
   *  the returned serializable `AssembleContext` — it rides the build INPUT + `TurnPrep` only. */
  readonly macroRegistry?: MacroRegistry | undefined;
  /** The per-turn user-macro FREEZE registry (WAVE MU) — the SEND volatile-macro bake resolves user macros
   *  in composer text against it; absent ⇒ the process `VOLATILE_ONLY_REGISTRY` (byte-identical). */
  readonly freezeMacroRegistry?: MacroRegistry | undefined;
}

/** Out-param sink for the SEND USER_INPUT regex result: when both `pendingUserText` and
 *  `hostTierRegexScripts` are supplied, {@link buildAssembleContext} writes the post-regex text here so
 *  the SEND verb persists the exact same text the WI haystack saw. */
interface SendRegexResult {
  sendUserText?: string;
  /** The VOLATILE-FREEZE record (D129-F) of what the SEND bake resolved out of the composer draft, in
   *  occurrence order. Written only when something actually froze (absent ⇒ the draft carried no volatile
   *  macro — the common case, and the reason `macro_freezes` stays NULL for it). */
  sendMacroFreezes?: MacroFreezeRecord;
}

/** Frames a system-block injection once (content already macro-resolved); `in_chat` injections stay
 *  unframed since SHAPE's splice frames them. */
function frameSystemInjection(inj: ChatInjection, prose: ProseOverrides): ChatInjection {
  return inj.position === "in_chat" ? inj : { ...inj, content: renderInjection(inj, undefined, prose) };
}

/** Sets `target[key]` only when `value` is defined (omit, never `undefined`, under exactOptionalPropertyTypes). */
function setIf<K extends keyof AssembleContext>(target: AssembleContext, key: K, value: AssembleContext[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** Builds the macro-free base ctx (RESOLVE output + GATHER scalars) that WI conversion renders against
 *  before BUILD wires the injections. */
function buildBaseContext(
  character: AssembleCharacter,
  characters: AssembleCharacter[],
  speakerRefs: SpeakerRef[],
  input: BuildAssembleContextInput,
): AssembleContext {
  const base: AssembleContext = {
    character,
    promptConfig: input.promptConfig,
    characters,
    // Derived from speakerRefs so it stays index-aligned with `characters` even once agents append (agent seats
    // carry no characterId → null). A character-only room is byte-identical to `[...input.characterIds]`.
    characterIds: speakerRefs.map((m) => m.characterId),
    speakerRefs,
    // The non-muted CHARACTER subset — the `{{groupNotMuted}}` feed (owner ruling: the group macros are
    // character-only; an agent voices via the assembled seated characters but never appears in a name list). Filtered by the
    // muted-seat keys `loadRoom` derives from the SAME `disabled` axis arbitration reads. A muted character
    // stays in `characters` (its card + lore still contribute) but drops here.
    unmutedCharacters: characters.filter((_, i) => {
      const ref = speakerRefs[i];
      return ref !== undefined && input.mutedSpeakerKeys?.has(speakerKey(ref)) !== true;
    }),
    // Null-anchor fallback: an unset/dead anchor resolves to the active persona so card-derived macros
    // never collapse to the literal "User"; a SET anchor never follows a mid-chat swap.
    pinnedPersona: input.personas.anchor ?? input.personas.active,
    activePersona: input.personas.active,
    // WHOSE `{{user}}` this is — SHAPE's null-stamp guard (see `AssembleContext.activePersonaUserId`). Absent ⇒
    // null ⇒ fail closed (no null-stamped row borrows the name).
    activePersonaUserId: input.personas.activeUserId ?? null,
    speaker: { kind: "single", character },
    recentMessages: [...input.recentMessages],
    variableValues: input.variableValues,
    // D46 runtime plane: ONE fresh op-log per assembly, threaded BY REFERENCE (like `variableValues`) into every
    // macro context so a `{{setvar}}` in ANY section / regex template / guided template this turn is recorded.
    // After the turn the engine flushes it to the produced variant's `variable_delta`.
    opLog: [],
    generationType: input.generationType ?? "normal",
  };
  setIf(base, "roomOverrides", input.roomOverrides);
  setIf(base, "multiHuman", input.multiHuman);
  setIf(base, "lastMessage", input.lastMessage);
  setIf(base, "lastUserMessage", input.lastUserMessage);
  setIf(base, "lastCharMessage", input.lastCharMessage);
  setIf(base, "currentInput", input.currentInput);
  setIf(base, "timezone", input.timezone);
  setIf(base, "nowMs", input.nowMs);
  setIf(base, "memory", input.memory);
  setIf(base, "memoryTrace", input.memoryTrace);
  // Absent (undefined) ⇒ skipped ⇒ byte-identical to a non-databank build (the null-op pin, DB6).
  setIf(base, "databank", input.databank);
  setIf(base, "compactSummary", input.compactSummary);
  setIf(base, "compactedThroughSeq", input.compactedThroughSeq);
  setIf(base, "guidedInstruction", input.guidedInstruction);
  // parity-plus P6 (§12): the rpg data-fed macro map + the `{{expr::…}}` CEL activation + the `{{idle_duration}}`
  // value — each absent (non-game / gather null) ⇒ skipped ⇒ every rpg macro / `{{expr::rpg.…}}` / idle marker
  // resolves empty (byte-identical non-game build). The gather stages all three; a non-game turn stages none.
  setIf(base, "rpgMacros", input.rpgMacros);
  setIf(base, "celBindings", input.celBindings);
  setIf(base, "idleDuration", input.idleDuration);
  // The {{persona}} marker emits only when the active persona's placement is in_prompt (default/absent);
  // at_depth/none route elsewhere, so the description is never double-injected.
  base.personaMarkerActive = input.personas.active?.placement === undefined || input.personas.active.placement.kind === "in_prompt";
  return base;
}

/** Routes budget-kept candidates: anchor-bucket WI → its half's before/after parts; everything else → the
 *  injection list (system-block positions framed once, in_chat left unframed for the SHAPE splice). */
function routeKept(
  kept: readonly InjectionCandidate[],
  prose: ProseOverrides,
): {
  chatInjections: ChatInjection[];
  anchored: Record<WiBucket["half"], Record<EntryPosition, string[]>>;
} {
  const chatInjections: ChatInjection[] = [];
  const anchored: Record<WiBucket["half"], Record<EntryPosition, string[]>> = {
    static: { before: [], after: [] },
    dynamic: { before: [], after: [] },
  };
  for (const c of kept) {
    if (c.bucket === null) {
      chatInjections.push(frameSystemInjection(c.injection, prose));
    } else {
      anchored[c.bucket.half][c.bucket.anchor].push(c.injection.content);
    }
  }
  return { chatInjections, anchored };
}

/** The guided steer's delivery depth when the action config declares none (G10): the tail — exactly where
 *  every guided injection landed before the field existed, so an absent `depth` is byte-identical. */
const GUIDED_DEFAULT_DEPTH = 0;

/** An ignore-budget guided injection candidate carrying the resolved steer with `role` at `depth` (G10;
 *  absent ⇒ the tail). */
function guidedInjectionCandidate(resolved: string, role: ChatInjection["role"], depth: number = GUIDED_DEFAULT_DEPTH): InjectionCandidate {
  return {
    injection: { position: "in_chat", depth, role, content: resolved, origin: "guided" },
    tokens: estimateTokens(resolved),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "guided",
    bucket: null,
  };
}

/** The steer text a guided action's `{{input}}` receives: the picked Rewrite-modal toggle KINDS resolved to
 *  their prose-slot sentences and joined ahead of the host's own free text (the templating fork, ARM B).
 *  No picks ⇒ the free text VERBATIM, so every non-Rewrite fire and every plain steered
 *  rewrite is byte-identical to the pre-fork wire.
 *
 *  The join is the SAME pure `composeRewriteSteer` the browser used to run — it moved seams, not semantics —
 *  so the composed bytes for a given pick set are identical to what the client produced, minus the part that
 *  is now a host's to edit: the fragments come from `resolveProseText`, two rungs, override-beats-default. */
function composeSteerInput(toggles: readonly string[] | undefined, freeText: string, prose: ProseOverrides): string {
  if (toggles === undefined || toggles.length === 0) {
    return freeText;
  }
  return composeRewriteSteer(resolveSteerFragments(REWRITE_TOGGLES, toggles, prose), freeText);
}

/** Resolves the one-turn guided steer against the built base ctx: `steer.placement`, else the action
 *  config's role (system → marker; user/assistant → depth-0 injection). No steer is a no-op.
 *
 *  Marker-fallback (§10 addendum / F8): a `system` placement lands via the `{{guided_instruction}}` marker,
 *  but a preset whose template lacks (or disables) that marker would drop the steer into the void. Instead
 *  of vanishing, the resolved text falls back to a depth-0 system-role injection — the SAME ChatInjection
 *  channel every other steer rides (the audit's convergence design) — and flips `guidedPlacedAsInjection`
 *  so the engine emits a LOUD `guided_placed_as_injection` warning (D41; the config-editor marker chip
 *  keeps warning at author time). PD-63's one-placement rule holds: still exactly one delivery. */
function resolveGuidedSteer(base: AssembleContext, input: BuildAssembleContextInput, steerInput: string): { candidates: InjectionCandidate[] } {
  const steer = input.guided;
  if (steer === undefined) {
    return { candidates: [] };
  }
  // The P5 one-shot GAME steer (the wand's Plot submenu + "Offer choices"): the wire carries only an enum
  // KIND; the SYSTEM template (kit `GUIDED_GAME_STEERS` — trusted, never the neutralized `{{input}}` splice)
  // resolves through the normal macro engine, so `{{rpgSceneState}}`/`{{rpgQuests}}`/`{{random}}` read the
  // game turn's gather feed. Delivered as a depth-0 system injection — the ephemeral channel the reminder
  // rides (never a `chat_injections` row, never the preset's per-action config). `input` is ignored by design.
  if (steer.gameSteer !== undefined) {
    const resolved = renderMacros(GUIDED_GAME_STEERS[steer.gameSteer].template, base, base.activePersona, { registry: input.macroRegistry }).trim();
    return { candidates: resolved.length === 0 ? [] : [guidedInjectionCandidate(resolved, "system")] };
  }
  const config = input.promptConfig.guidedActions?.[steer.action] ?? DEFAULT_GUIDED_ACTIONS[steer.action];
  const resolved = resolveGuidedActionText(base, {
    action: steer.action,
    input: steerInput,
    model: input.model,
    chatId: input.chatId,
    person: steer.person,
    registry: input.macroRegistry,
  });
  // A scaffold-only action on a blank steer resolves empty — inject nothing rather than a dangling scaffold.
  if (resolved.trim().length === 0) {
    return { candidates: [] };
  }
  const placement = steer.placement ?? (config.role === "system" ? ({ kind: "system" } as const) : ({ kind: "inject", role: config.role } as const));
  if (placement.kind === "system") {
    // The marker is the intended system-half home; only fall back when the active preset can't render it ON
    // THIS TURN. `hasActiveMarker` (not "enabled") is load-bearing: an enabled `guided_instruction` whose
    // `trigger` excludes this generation type is dropped by the BUILD walk, so believing it would render
    // stored the steer on the ctx and skipped the injection — and the steer then reached the model NOWHERE.
    if (hasActiveMarker(input.promptConfig, "guided_instruction", input.generationType ?? "normal")) {
      base.guidedInstruction = resolved;
      return { candidates: [] };
    }
    base.guidedPlacedAsInjection = true;
    return { candidates: [guidedInjectionCandidate(resolved, "system")] };
  }
  // G10: the action's own `depth` rides the inject arm (absent ⇒ the tail). A per-turn `placement` overrides
  // the ROLE only — depth is the preset author's delivery choice, not the caller's.
  return { candidates: [guidedInjectionCandidate(resolved, placement.role, config.depth)] };
}

/** G9 — the history-START boundary (`formatStrings.newChatMarker`; ST `new_chat_prompt`, §6.5 census). ONE
 *  USER-role injection at {@link BEFORE_HISTORY_DEPTH}: the splice clamps that to the history length, so it lands
 *  ABOVE the first canon row, and a greeting-first chat opens on a user row on every route. The role is fixed,
 *  as in SillyTavern; only the text is the preset's (blank inherits the shipped slot, like every format string).
 *  `ignoreBudget` because a boundary marker silently dropped by the budget pass is exactly the silent break this
 *  slot exists to prevent; it is one line of text. */
function newChatMarkerCandidate(base: AssembleContext, input: BuildAssembleContextInput): InjectionCandidate[] {
  const template = resolveProseText(
    PRESET_FORMAT_SLOT_IDS.newChatMarker,
    legacyProseOverrides(PRESET_FORMAT_SLOT_IDS.newChatMarker, input.promptConfig.formatStrings?.newChatMarker),
  );
  const content = renderMacros(template, base, base.activePersona, { registry: input.macroRegistry }).trim();
  if (content.length === 0) {
    return [];
  }
  return [
    {
      injection: { position: "in_chat", depth: BEFORE_HISTORY_DEPTH, role: "user", content, origin: "new-chat-marker" },
      tokens: estimateTokens(content),
      ignoreBudget: true,
      priority: OPERATOR_PRIORITY,
      entryId: "new-chat-marker",
      bucket: null,
    },
  ];
}

/** The active persona's `descriptionPosition: "at_depth"` → an in_chat candidate, or null when it doesn't
 *  inject at depth. Resolved against the active persona itself to avoid cross-contaminating another persona's
 *  macros; unframed so a no-swap turn stays byte-identical to single-persona output. */
function activePersonaDepthCandidate(ctx: AssembleContext, active: AssemblePersona | null, registry: MacroRegistry): InjectionCandidate | null {
  if (active === null || active.placement?.kind !== "at_depth") {
    return null;
  }
  const content = renderMacros(active.description, ctx, active, { registry });
  if (content.trim().length === 0) {
    return null;
  }
  const { depth, role } = active.placement;
  return {
    injection: { position: "in_chat", depth, role, content, origin: "persona", originLabel: active.name },
    tokens: estimateTokens(content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "persona-description",
    bucket: null,
  };
}

/** The anchor persona's description injected in card-context: a fixed in_static system block so a mid-chat
 *  swap still reaches the model with who the character's card relationships refer to, even though the
 *  active speaker differs. Ignores the anchor's own descriptionPosition (that's its prompt-time preference
 *  for when it IS active, not this role). Null when opted out or empty. */
function anchorPersonaCardCandidate(ctx: AssembleContext, anchor: AssemblePersona, registry: MacroRegistry, prose: ProseOverrides): InjectionCandidate | null {
  if (anchor.placement?.kind === "none") {
    return null;
  }
  const resolved = renderMacros(anchor.description, ctx, anchor, { registry });
  if (resolved.trim().length === 0) {
    return null;
  }
  // The lead-in clause is a PROSE-1 slot (census row 74, per-USER under the ROOM HOST); the brackets, the
  // anchor's name and its rendered description are the injection's GRAMMAR and stay authored here.
  const content = `[${resolveProseText("chat.assembly.anchorIdentity", prose)} ${anchor.name}: ${resolved}]`;
  return {
    injection: { position: "in_static", depth: 0, role: "system", content, origin: "persona", originLabel: anchor.name },
    tokens: estimateTokens(content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "persona-description-anchor",
    bucket: null,
  };
}

/** True when the anchor is the same persona as active (no-swap case), deduped on name+description since
 *  AssemblePersona is deliberately id-free. */
function sameProjectedPersona(a: AssemblePersona, b: AssemblePersona | null): boolean {
  return b !== null && a.name === b.name && a.description === b.description;
}

/** Resolves the distinct personas in play for `{{user}}` into injection candidates: active per its own
 *  descriptionPosition (unframed); anchor as a fixed card-context block, only on a real swap. Deduped so a
 *  no-swap turn's output is byte-identical to the active-only injection. */
function resolvePersonaDescriptionCandidates(
  ctx: AssembleContext,
  personas: ResolvedPersonas,
  registry: MacroRegistry,
  prose: ProseOverrides,
): InjectionCandidate[] {
  const candidates: InjectionCandidate[] = [];
  const active = activePersonaDepthCandidate(ctx, personas.active, registry);
  if (active !== null) {
    candidates.push(active);
  }
  if (personas.anchor !== null && !sameProjectedPersona(personas.anchor, personas.active)) {
    const anchor = anchorPersonaCardCandidate(ctx, personas.anchor, registry, prose);
    if (anchor !== null) {
      candidates.push(anchor);
    }
  }
  return candidates;
}

/** The seated characters' Character's-Note-\@-Depth (`card.depthPrompt`) → per-member in_chat injection
 *  candidates. Every present characters member with a non-empty note injects, with `{{char}}` bound to that
 *  member; `{{user}}` routes to the card (anchor/pinned) persona, not the active speaker. Same-depth
 *  notes keep seating order (primary first) deterministically since neither side sets an explicit `order`. */
function characterDepthNoteCandidates(
  ctx: AssembleContext,
  registry: MacroRegistry,
): {
  candidates: InjectionCandidate[];
  contributorNames: string[];
} {
  const characters = ctx.characters ?? [ctx.character];
  const candidates: InjectionCandidate[] = [];
  const contributorNames: string[] = [];
  characters.forEach((member, idx) => {
    const note = member.depthPrompt;
    if (note === null || note === undefined || note.prompt.trim().length === 0) {
      return;
    }
    const memberCtx: AssembleContext = {
      ...ctx,
      character: member,
      speaker: { kind: "single", character: member },
    };
    const content = renderMacros(note.prompt, memberCtx, ctx.pinnedPersona, { registry });
    if (content.trim().length === 0) {
      return;
    }
    contributorNames.push(member.name);
    candidates.push({
      injection: { position: "in_chat", depth: note.depth, role: note.role ?? "system", content, origin: "authors-note", originLabel: member.name },
      tokens: estimateTokens(content),
      ignoreBudget: true,
      priority: OPERATOR_PRIORITY,
      entryId: `character-note:${idx}`,
      bucket: null,
    });
  });
  return { candidates, contributorNames };
}

/** The authorsNoteSource trace label: the single contributor's name, or "merged (present characters)" when
 *  2+ members contribute. */
function depthNoteSource(contributorNames: readonly string[]): string {
  return contributorNames.length === 1 ? `from ${contributorNames[0]}` : "merged (present characters)";
}

/** The author's-note depth injections for this turn — the seated characters' card notes, and ONLY those. The
 *  per-chat author's note is NOT a second producer here: a room-level note is a
 *  `chat_injections` row, which reaches this same list through `userInjections` on the identical at-depth
 *  splice. `authorsNoteSource` therefore names card contributors or is absent. */
function authorsNoteCandidates(
  ctx: AssembleContext,
  registry: MacroRegistry,
): {
  candidates: InjectionCandidate[];
  authorsNoteSource?: string;
} {
  const member = characterDepthNoteCandidates(ctx, registry);
  return member.contributorNames.length > 0
    ? { candidates: member.candidates, authorsNoteSource: depthNoteSource(member.contributorNames) }
    : { candidates: member.candidates };
}

/**
 * The SEND leg's AUTHOR-SIDE transform chain, in its one ruled order (D51): volatile FREEZE → the D50
 * `user_input` PromptTransform → the USER_INPUT regex. Returns the post-transform draft, which is the ONE
 * text both the WI keyword haystack and the persisted row see — they cannot diverge because there is only
 * one value.
 *
 * The freeze is byte-destructive, so it RECORDS what it resolved (D129-F) and the record travels back on the
 * sink for the verb to persist beside the row. The pre-freeze draft itself does NOT travel: the verb already
 * holds it (it is what it passed as `pendingUserText`), and shipping a second copy would invite the two to
 * drift. `freezes.length === 0` leaves the sink field absent, which is what makes `macro_freezes` NULL for
 * the overwhelming common case.
 */
async function runSendAuthorTransforms(
  ctx: ChatContext,
  args: {
    readonly draft: string;
    readonly input: BuildAssembleContextInput;
    readonly base: AssembleContext;
    readonly hostScripts: readonly RegexScriptRow[];
    readonly out: SendRegexResult | undefined;
  },
): Promise<string> {
  const { draft, input, base, hostScripts, out } = args;
  const freezes: MacroFreeze[] = [];
  let text = freezeVolatileMacros(draft, base, { random: input.prng, registry: input.freezeMacroRegistry, freezes });
  // The D50 `user_input` PromptTransform point (automation-design/04 §1.2 / §6): AFTER the macro pass,
  // BEFORE the USER_INPUT regex. Rewrites the draft the WI haystack + the persisted row both see (author-
  // side transform order — D51). Null op / zero registrants ⇒ byte-identical.
  if (ctx.promptTransforms !== null) {
    const transformed = await ctx.promptTransforms("user_input", input.chatId, text, base.variableValues ?? {});
    // §5.14 — a transform may REFUSE the generation rather than rewrite it. Thrown as the coded chat refusal
    // (not swallowed like a D53 skip): the turn does not happen and the author is told, in the transform's
    // own words, which is the whole difference between "it said no" and "it timed out".
    if (transformed.aborted) {
      throw new ChatOperationError(CHAT_OP_CODES.promptTransformAborted, `a prompt transform aborted this turn: ${transformed.reason}`);
    }
    text = transformed.text;
  }
  if (hostScripts.length > 0) {
    // `{{char}}` HERE IS THE ROOM'S, NOT A SPEAKER'S — and that is correct, not a divergence to repair.
    // The other three placements are ROUND-scoped and agree with each other on the round's voice
    // (`PROMPT_HISTORY` + `AI_OUTPUT`/`REASONING`, all off the SHAPED ctx — see `engine/pipeline`
    // applyReceiveTransforms). This leg runs at SEND, inside the build of the very ctx a round is later
    // shaped from: arbitration has not run, no speaker exists yet, and on a multi-speaker round the text
    // being transformed feeds EVERY speaker's prompt. Binding it to one of them would be a guess. The base
    // ctx's primary is the only identity that exists at this point in the turn.
    const sendMacroCtx = buildTurnMacroContext({
      assembleCtx: base,
      model: input.model,
      chatId: input.chatId,
      input: text,
      onWarn: onMacroWarn,
      registry: input.macroRegistry,
    });
    text = executeRegexScripts({
      text,
      scripts: hostScripts,
      placement: "USER_INPUT",
      ctx: sendMacroCtx,
      applyReplace: ctx.applyRegexReplace,
      onScriptFailure: onHostRegexFailure("USER_INPUT"),
    });
  }
  if (out !== undefined) {
    out.sendUserText = text;
    if (freezes.length > 0) {
      out.sendMacroFreezes = freezes;
    }
  }
  return text;
}

/** Produces the immutable per-turn AssembleContext SHAPE consumes per speaker; never mutated after return. */
export async function buildAssembleContext(ctx: ChatContext, input: BuildAssembleContextInput, out?: SendRegexResult): Promise<AssembleContext> {
  const cards = await Promise.all(input.characterIds.map((characterId) => ctx.getCard({ ownerId: input.ownerId, characterId })));
  const present = input.characterIds.flatMap((characterId, i) => {
    const card = cards[i];
    return card ? [{ characterId, card }] : [];
  });
  const characters = present.map((p) => toAssembleCharacter(p.card));
  const speakerRefs: SpeakerRef[] = present.map((p): SpeakerRef => ({ kind: "character", characterId: p.characterId }));
  const character: AssembleCharacter = characters[0] ?? { name: "Assistant", description: "" };

  // The turn's PROSE bag — the two homes composed into one home-agnostic record (PROSE-1 §3.1 stays intact:
  // `composeProse` keeps each key only from the storage that slot actually homes in, so this is a merge of
  // disjoint sets, never a cascade). USER = the room host's app-tier overrides, resolved from the chatId
  // rather than the input literal so the ~50 hand-built assemble inputs stay honest (a caller cannot forget
  // it, and a hostless room degrades to `{}`). PRESET = the resolved preset's own blob, which is where the
  // turn-wire FRAMINGS live. Both absent ⇒ the shipped defaults, byte-identical.
  const prose = composeProse({ user: await ctx.resolveChatProse(input.chatId), preset: input.promptConfig.prose });

  // ── GATHER — the 4-scope WI pool (memory/recall/vars are engine-supplied inputs). ──
  // The character ids handed to the pool are the OWNER-VERIFIED ones (#1396) — `present`, not `input.characterIds`.
  // Every id above was already resolved through the owner-scoped `getCard`, and the ones that came back empty
  // are exactly the cards this turn refuses to speak for; feeding the raw list let a card the ownership read
  // REFUSED still contribute its character-scope lore. The pool's own per-arm owner predicates are the second
  // belt (`world-info/pool.ts` FLAG[attachment-scope]) — this one decides WHICH IDS, that one WHOSE BOOK.
  const pool = await loadWorldInfoPool(ctx.db, {
    chatId: input.chatId,
    ownerId: input.ownerId,
    characterIds: present.map((p) => p.characterId),
    personaIds: input.personaIds,
  });

  const base = buildBaseContext(character, characters, speakerRefs, input);
  // The per-turn user-macro registries (WAVE MU) — absent ⇒ the process singletons (byte-identical). The
  // RENDER registry drives every section/WI/persona/note macro pass; the FREEZE registry the SEND bake.
  const reg = input.macroRegistry ?? globalMacroRegistry;

  // SEND — freeze volatile macros then run USER_INPUT regex, between RESOLVE/base and GATHER so the WI
  // haystack and the persisted row (via `out`) are the same post-transform text.
  const hostScripts: readonly RegexScriptRow[] = input.hostTierRegexScripts ?? [];
  let pendingText = input.pendingUserText;
  if (input.pendingUserText !== undefined) {
    pendingText = await runSendAuthorTransforms(ctx, { draft: input.pendingUserText, input, base, hostScripts, out });
    base.currentInput = pendingText;
  }

  // BUILD — WI to injections (render once + keyword match), unified into one list, one budget pass.
  // PROSE-1 §4.6: storage unchanged (`formatStrings.wiFormat`), the two rungs run through the ONE resolver.
  const wiFormat = resolveProseText(
    PRESET_FORMAT_SLOT_IDS.wiFormat,
    legacyProseOverrides(PRESET_FORMAT_SLOT_IDS.wiFormat, input.promptConfig.formatStrings?.wiFormat),
  );
  const names = [...characters.map((c) => c.name), input.personas.anchor?.name, input.personas.active?.name].filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );

  // The ONE composition of this turn's steer text (ARM B): the picked Rewrite toggles resolved from the
  // preset's prose + the host's free text. Composed HERE, before the WI convert, because BOTH consumers
  // want the same bytes — the keyword haystack below and the guided injection further down. Pre-fork the
  // browser sent the already-joined string and both read it off `guided.input`; keeping one value keeps that
  // identity (a fragment that happens to match a WI keyword still wakes the entry, as it always did).
  const guidedSteerText = input.guided === undefined ? undefined : composeSteerInput(input.guided.rewriteToggles, input.guided.input ?? "", prose);

  const wi = convertWorldInfo(
    pool,
    base,
    {
      // The RESOLVED host-tier union (D53: host-global ∪ chat-preset ∪ present characters), i.e. the SAME set every
      // other shared leg runs — USER_INPUT above, AI_OUTPUT/REASONING in `engine/pipeline`. Reading the preset
      // slice alone dropped host-global + card scripts whose placement includes WORLD_INFO, and WORLD_INFO is
      // in the settings' default placement set, so those silently never fired. `assemble-gather` folds the
      // preset scripts INTO the union, so this is a strict widening on every real turn.
      regexScripts: hostScripts,
      applyReplace: ctx.applyRegexReplace,
      testRegexKey: ctx.testRegexKey,
      wiFormat,
      recentMessages: input.recentMessages,
      pendingUserText: pendingText,
      // F4: the raw steer line joins the WI keyword haystack (source `scan=true`). Available here before
      // the convert call, so no resolution-order shift — macro-resolution-before-scan is untouched (the
      // raw steer never participates in macro resolution for scanning).
      guidedSteerText,
      names,
      lastUserMessage: input.lastUserMessage,
      // ACTIVE anchors, not merely enabled ones — the SAME predicate the walk asks. An anchor the walk drops
      // for a trigger mismatch renders nothing, so routing an always-scope entry into its bucket would delete
      // that lore for the turn; no active anchor ⇒ the entry keeps its default `in_static` placement, which
      // is where it always went. The plain markers only gained `trigger` with #1462 (ST sets
      // `injection_trigger` on every prompt-manager entry — the missing field was a parity gap), and this is
      // the reader that gap left with nothing to read.
      hasBeforeAnchor: hasActiveMarker(input.promptConfig, "world_info_before", input.generationType ?? "normal"),
      hasAfterAnchor: hasActiveMarker(input.promptConfig, "world_info_after", input.generationType ?? "normal"),
      registry: reg,
    },
    buildTurnMacroContext({ assembleCtx: base, model: input.model, chatId: input.chatId, registry: input.macroRegistry }),
  );

  const guided = resolveGuidedSteer(base, input, guidedSteerText ?? "");

  const userCandidates: InjectionCandidate[] = input.userInjections.map((injection, idx) => ({
    injection,
    tokens: estimateTokens(injection.content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: `user:${idx}`,
    bucket: null,
  }));
  const personaDescription = resolvePersonaDescriptionCandidates(base, input.personas, reg, prose);
  // Appended after persona so a same-depth tie orders persona-then-note deterministically.
  const authorsNote = authorsNoteCandidates(base, reg);
  const { kept, dropped } = budgetInjections(
    [...wi.candidates, ...userCandidates, ...guided.candidates, ...personaDescription, ...authorsNote.candidates, ...newChatMarkerCandidate(base, input)],
    input.injectionTokenBudget,
  );
  const { chatInjections, anchored } = routeKept(kept, prose);
  // WI-origin candidates that survived the budget pass, by identity (id + keys); worldInfoActivated (engine.ts
  // bus emit + the host preview panel) reads this off wiTrace.
  const activated = kept.flatMap((c) => (c.worldEntryId !== undefined ? [{ id: c.worldEntryId, keys: c.worldEntryKeys ?? [] }] : []));

  return {
    ...base,
    // Carried onto the immutable ctx so the downstream BUILD walk (the merged co-speaker headings) and the
    // SHAPE splice (the two note frames, the round nudge) resolve the SAME host's frames this build did.
    prose,
    chatInjections,
    worldInfoBefore: anchored.static.before.join("\n"),
    worldInfoAfter: anchored.static.after.join("\n"),
    ...(anchored.dynamic.before.length > 0 ? { worldInfoBeforeDynamic: anchored.dynamic.before.join("\n") } : {}),
    ...(anchored.dynamic.after.length > 0 ? { worldInfoAfterDynamic: anchored.dynamic.after.join("\n") } : {}),
    ...(authorsNote.authorsNoteSource !== undefined ? { authorsNoteSource: authorsNote.authorsNoteSource } : {}),
    // Carries the resolved host-tier regex set onto the immutable ctx so RECEIVE applies the same set SEND used.
    ...(input.hostTierRegexScripts !== undefined ? { hostTierRegexScripts: input.hostTierRegexScripts } : {}),
    wiTrace: {
      // WORLD-INFO entries only — the kept candidates that carry a `worldEntryId`, which is exactly
      // `activated`. It used to count every kept injection, and `chatInjections` holds all six candidate
      // families (world-info, user, guided, persona description, author's note, new-chat marker), so any turn
      // with a chat injection reported lore that never fired ("3 included" on a chat with no books at all).
      included: activated.length,
      dropped,
      matchedKeys: wi.matchedKeys,
      activated,
    },
  };
}
