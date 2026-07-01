// domain/chat/assembly/context — the RESOLVE → GATHER → BUILD orchestration (chat.md Part II §2 ASSEMBLE
// phases 1-3; the immutable two-phase turn ctx of §5). This is the ASSEMBLE CONTEXT PRODUCER: it turns a
// chat + roster + preset + canon into the IMMUTABLE `AssembleContext` (the turn ctx) that SHAPE (chunk 7)
// consumes per speaker. The order is the artifact — read it top-to-bottom in `buildAssembleContext`:
//
//   RESOLVE — cast (primary + roster live cards via `ctx.getCard`, D28), personas (anchor + active), room
//             overrides, names. Identity only; NO macros yet (§2 phase 1).
//   GATHER  — the 4-scope WI pool (`world-info/pool`), the keyword match over `recent + resolved names +
//             PENDING user text` (the two-phase lag-kill, §3 rule 4), memory recall, ChoiceBlock vars.
//   BUILD   — per WI entry `macro → regex(WORLD_INFO) → wiFormat-wrap` rendered ONCE (§3 rules 1/2/3: macros
//             before regex before framing, no double render); route EVERY injection (WI + user
//             `chat_injections` + guided) into ONE `Injection[]` list, budgeted in ONE pass (§4).
//
// IMMUTABILITY (§5): this produces the immutable `AssembleContext`. BUILD (assemble.ts `assemblePrompt`) +
// SHAPE (shape.ts) are pure functions of it (+ the speaker) — NO in-place `assembleCtx` mutation.
//
// FLAG[cross-domain-inputs]: three inputs are resolved by OTHER domains and have NO op on `ChatContext`, so
// (per the CLAUDE.md "flag, don't stub" rule) they are PARAMETERS the engine/verb resolves at the
// composition seam (like the resolved `connection`), NOT fetched here:
//   • `promptConfig` (preset/settings selection — the contract already makes it a required `AssembleContext`
//     field), • `personas` (anchor/active name+description — there is no persona-read op, only
//     `resolvePersona`), • `memory` (the `{{memory}}` string — `ctx.searchDigests` returns block KEYS; the
//     keys→text format step is the unbuilt `memory/` subsystem).
// SEND (D53 step 2): the USER_INPUT regex pass runs HERE, between RESOLVE (`base` → the author-side macro ctx)
// and GATHER (the WI keyword match) — chat.md §2 (`macro → set {{input}} → USER_INPUT regex → fold the POST-regex
// text into the WI haystack + {{input}} → persist`). Running it inside the producer is what lets BOTH the haystack
// the keyword match sees AND the user row the verb persists be the SAME post-regex text (no divergence; §3 rule 4
// + §7 canon-mutating-at-write). The post-regex text is surfaced to the SEND verb via the {@link SendRegexResult}
// out-param (it persists the row); the verbatim greeting path (start-chat) takes NO composer input, so USER_INPUT
// regex never applies there.
//
// The node:vm ReDoS watchdog now exists (`@orb/server/kit/regex`) and is INJECTED as
// `ctx.applyRegexReplace` (D53) — both the WORLD_INFO pass (here) and the SEND USER_INPUT pass run their one
// `text.replace` under the per-call timeout, so a catastrophic-backtracking host-tier pattern throws (→ the kit
// executor's per-script try/catch) instead of hanging the turn.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  AssembleCharacter,
  AssembleContext,
  AssembleWorldEntry,
  ChatInjection,
  RoomOverrides,
} from "@orb/contracts/chat";
import type { GenerationType, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_FORMAT_STRINGS } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroContext } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { estimateTokens } from "@orb/kit/tokens";
import { buildKeywordHaystack, matchEntryKeys } from "@orb/kit/world-info";
import type { ApplyRegexReplaceOp, ChatContext } from "../contract/context";
import type { ResolvedPersonas } from "../contract/foreign";
import { renderInjection } from "./injections";
import { buildTurnMacroContext, renderMacros } from "./macros";
import { loadWorldInfoPool } from "./world-info/pool";

interface MatchedKey {
  key: string;
  matchedLatestUserMessage: boolean;
}

// ── ONE injection list + ONE budget pass (chat.md §4) ──────────────────────────────────────────────────
/** A budget candidate: a fully-rendered injection + cost + survival flag + sort priority. WI entries carry
 *  their real priority + `ignoreBudget`; operator/author injections (user `chat_injections` / guided) are
 *  `ignoreBudget: true` (intent, never droppable) at a high priority. `bucket` routes an always-scope WI
 *  entry to a `world_info_before`/`after` anchor instead of the list. */
interface InjectionCandidate {
  injection: ChatInjection;
  tokens: number;
  ignoreBudget: boolean;
  priority: number;
  entryId: string;
  bucket: "before" | "after" | null;
}

const OPERATOR_PRIORITY = Number.MAX_SAFE_INTEGER;

function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Sort candidates priority DESC, then `entryId` ASC — deterministic so the budget walk is reproducible. */
function compareCandidates(a: InjectionCandidate, b: InjectionCandidate): number {
  return b.priority !== a.priority ? b.priority - a.priority : compareStr(a.entryId, b.entryId);
}

/** The ONE budget pass (chat.md §4): walk the unified candidate list ONCE (priority order), charging tokens
 *  against `budget`; `ignoreBudget` entries always survive; `budget <= 0` ⇒ keep all. Returns the kept
 *  candidates (original order) + the budget-dropped ids for the trace. */
function budgetInjections(
  candidates: readonly InjectionCandidate[],
  budget: number,
): { kept: InjectionCandidate[]; dropped: { id: string; reason: "budget" }[] } {
  const ordered = [...candidates].sort(compareCandidates);
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

// ── WI → injection conversion (GATHER keyword match + BUILD render-once; chat.md §3 rules 1-4) ──────────
/** Resolve `{{entry}}` in a wiFormat template WITHOUT re-rendering the already-resolved entry content
 *  (chat.md §3 rule 3 — render once). `wiFormat`'s OWN macros render once (`{{entry}}` is unregistered, so
 *  the engine re-emits it verbatim); the resolved entry text is then string-spliced in. */
function wrapWiFormat(content: string, wiFormat: string, ctx: AssembleContext): string {
  if (!wiFormat.includes("{{entry}}")) {
    return content;
  }
  return renderMacros(wiFormat, ctx, ctx.activePersona).replaceAll("{{entry}}", content);
}

interface WiConversionArgs {
  readonly regexScripts: readonly RegexScriptInput[];
  /** The injected node:vm ReDoS watchdog (D53) — the WORLD_INFO regex pass runs its `text.replace` under it. */
  readonly applyReplace: ApplyRegexReplaceOp;
  readonly wiFormat: string;
  readonly recentMessages: readonly string[];
  readonly names: readonly string[];
  readonly pendingUserText: string | undefined;
  readonly lastUserMessage: string | undefined;
  readonly hasBeforeAnchor: boolean;
  readonly hasAfterAnchor: boolean;
}

/** The per-conversion runtime bundle (keeps `classifyWiEntry` under the 4-param cap). */
interface WiConvEnv {
  readonly ctx: AssembleContext;
  readonly args: WiConversionArgs;
  /** The turn-stage macro ctx for the WORLD_INFO regex find/replace template passes — built ONCE. */
  readonly regexCtx: MacroContext;
  readonly haystacks: { full: string; latestUser: string };
  readonly matchedKeys: MatchedKey[];
}

/** Which anchor bucket an always-scope, system-half WI entry joins (null ⇒ default in_static). */
function resolveBucket(
  entry: AssembleWorldEntry,
  args: WiConversionArgs,
): "before" | "after" | null {
  if (entry.position === "before" && args.hasBeforeAnchor) {
    return "before";
  }
  if (entry.position === "after" && args.hasAfterAnchor) {
    return "after";
  }
  return null;
}

/** Position-route a rendered WI entry into a budget candidate: depth-inject → in_chat; always-scope →
 *  anchor bucket (or in_static); keyword (fired) → in_prompt. */
function wiCandidate(
  entry: AssembleWorldEntry,
  content: string,
  args: WiConversionArgs,
): InjectionCandidate {
  const entryId = entry.id ?? entry.content;
  const meta = {
    tokens: estimateTokens(content),
    ignoreBudget: entry.ignoreBudget === true,
    priority: entry.priority,
    entryId,
  };
  if (entry.inject !== null && entry.inject !== undefined) {
    const injection: ChatInjection = {
      position: "in_chat",
      depth: entry.inject.depth,
      role: entry.inject.role,
      content,
    };
    return { injection, ...meta, bucket: null };
  }
  if (entry.scope === "always") {
    const injection: ChatInjection = { position: "in_static", depth: 0, role: "system", content };
    return { injection, ...meta, bucket: resolveBucket(entry, args) };
  }
  const injection: ChatInjection = { position: "in_prompt", depth: 0, role: "system", content };
  return { injection, ...meta, bucket: null };
}

/** Record a keyword entry's fired keys (+ whether each fired on the LATEST user text) into the trace. */
function recordKeyHits(entry: AssembleWorldEntry, hits: readonly string[], env: WiConvEnv): void {
  const userHits =
    env.haystacks.latestUser.length > 0
      ? new Set(matchEntryKeys(entry.keys, env.haystacks.latestUser))
      : new Set<string>();
  for (const key of hits) {
    env.matchedKeys.push({ key, matchedLatestUserMessage: userHits.has(key) });
  }
}

/** Classify ONE enabled WI entry → a budget candidate (null if a keyword entry didn't fire). Renders ONCE:
 *  `macro → regex(WORLD_INFO) → wiFormat-wrap` (chat.md §3); source-routed persona (pinned for card-derived,
 *  active for chat-attached — the dual-persona rule). */
function classifyWiEntry(entry: AssembleWorldEntry, env: WiConvEnv): InjectionCandidate | null {
  if (entry.scope === "keyword") {
    const hits = matchEntryKeys(entry.keys, env.haystacks.full);
    if (hits.length === 0) {
      return null;
    }
    recordKeyHits(entry, hits, env);
  }
  const persona = entry.source === "character" ? env.ctx.pinnedPersona : env.ctx.activePersona;
  const resolved = renderMacros(entry.content, env.ctx, persona);
  const afterRegex = executeRegexScripts({
    text: resolved,
    scripts: env.args.regexScripts,
    placement: "WORLD_INFO",
    ctx: env.regexCtx,
    applyReplace: env.args.applyReplace,
  });
  return wiCandidate(entry, wrapWiFormat(afterRegex, env.args.wiFormat, env.ctx), env.args);
}

/** Convert the WI pool → budget candidates + the matched-keys trace (chat.md §3/§4). Keyword matching sees
 *  the PENDING user text (the two-phase lag-kill). */
function convertWorldInfo(
  pool: readonly AssembleWorldEntry[],
  ctx: AssembleContext,
  args: WiConversionArgs,
  regexCtx: MacroContext,
): { candidates: InjectionCandidate[]; matchedKeys: MatchedKey[] } {
  const haystackTexts = [
    ...args.recentMessages,
    ...(args.pendingUserText !== undefined ? [args.pendingUserText] : []),
  ];
  const latestUserText = args.pendingUserText ?? args.lastUserMessage ?? "";
  const env: WiConvEnv = {
    ctx,
    args,
    regexCtx,
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

// ── RESOLVE helpers ────────────────────────────────────────────────────────────────────────────────────
/** The flat `characters` card (D28) → the slim `AssembleCharacter` the assembler renders. */
function toAssembleCharacter(card: CharacterCard): AssembleCharacter {
  return {
    name: card.name,
    description: card.description ?? "",
    personality: card.personality,
    scenario: card.scenario,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
  };
}

/** Everything the engine/verb resolves at the composition seam + the chat-owned data this producer reads.
 *  File-local (the `types-in-contract` gate forbids an exported feature type outside contract/) — the engine
 *  passes a structurally-matching literal. See FLAG[cross-domain-inputs]. */
interface BuildAssembleContextInput {
  readonly chatId: ChatId;
  /** The host (the funding/owner identity — `getCard` ownership + WI global scope). */
  readonly ownerId: UserId;
  /** The roster character ids whose live cards form the cast (primary first; D28 identity). */
  readonly castCharacterIds: readonly CharacterId[];
  /** The present human participants' active persona ids (the WI persona-book scope). */
  readonly personaIds: readonly PersonaId[];
  readonly promptConfig: PromptConfig;
  readonly personas: ResolvedPersonas;
  readonly roomOverrides?: RoomOverrides | undefined;
  /** The committed recent window (oldest→newest), already scan-depth sliced — the WI haystack + the
   *  {{lastMessage}}-family macro inputs. */
  readonly recentMessages: readonly string[];
  readonly lastMessage?: string | undefined;
  readonly lastUserMessage?: string | undefined;
  readonly lastCharMessage?: string | undefined;
  /** The in-flight (uncommitted) user turn — folded into the WI keyword haystack (§3 rule 4). */
  readonly pendingUserText?: string | undefined;
  readonly currentInput?: string | undefined;
  /** Persisted user `chat_injections` (already loaded by the verb; macro-resolved + framed here). */
  readonly userInjections: readonly ChatInjection[];
  readonly memory?: string | null | undefined;
  readonly compactSummary?: string | null | undefined;
  readonly guidedInstruction?: string | null | undefined;
  readonly variableValues: Record<string, string>;
  readonly generationType?: GenerationType | undefined;
  /** The caller's PER-REQUEST browser IANA zone for `{{time}}`/`{{date}}` (client.md epoch-UTC pipeline) — NOT
   *  a stored/host setting (D19). Absent ⇒ the macro engine falls back to server-local. The per-request wire
   *  (turn request → here) lands with the client; FLAG[timezone-per-request] in assemble-gather. */
  readonly timezone?: string | undefined;
  readonly nowMs?: number | undefined;
  /** The routing-resolved model id (for {{model}} inside WORLD_INFO regex replacements). */
  readonly model: string;
  /** The per-turn injection token budget (0 ⇒ unbudgeted). */
  readonly injectionTokenBudget: number;
  /** The effective HOST-TIER regex set (D53 — host-global ∪ chat-preset ∪ cast), resolved under the frozen
   *  `runAsUserId` by the verb/root (FLAG[hosttier-regex-supply](PD-41-adjacent): the 3-source resolution is the
   *  orchestrator's integration step, supplied as a resolved cross-domain input — like preset/personas/memory).
   *  Applied at SEND (USER_INPUT, here) + copied onto the returned `AssembleContext` for RECEIVE (the pipeline).
   *  Absent/empty ⇒ no host-tier regex this turn. */
  readonly hostTierRegexScripts?: readonly RegexScript[] | undefined;
}

/** Out-param sink for the SEND USER_INPUT regex result (chat.md §2/§7 — canon-mutating at write). When the
 *  caller supplies BOTH `pendingUserText` and `hostTierRegexScripts`, {@link buildAssembleContext} runs the
 *  USER_INPUT regex (to fold the post-regex text into the WI haystack + {{input}}) and writes the result here so
 *  the SEND verb can PERSIST that exact post-regex text — the haystack and the stored user row never diverge.
 *  Unset otherwise (a no-op turn, no host scripts, or no pending text). A caller-owned scratch object, NOT a
 *  mutation of any producer input. File-local (the `types-in-contract` gate) — callers pass a structural
 *  `{ sendUserText?: string }`. */
interface SendRegexResult {
  sendUserText?: string;
}

function hasMarker(config: PromptConfig, marker: string): boolean {
  return config.sections.some((s) => s.type === "marker" && s.marker === marker && s.enabled);
}

/** Frame a system-block injection (before/in_static/in_prompt) ONCE — content arriving here is already
 *  macro-resolved, so the identity resolver is used (render once). `in_chat` injections are left UNFRAMED
 *  (SHAPE's splice frames them). */
function frameSystemInjection(inj: ChatInjection): ChatInjection {
  return inj.position === "in_chat" ? inj : { ...inj, content: renderInjection(inj) };
}

/** Set `target[key]` only when `value` is defined (omit, never `undefined`, under
 *  exactOptionalPropertyTypes). */
function setIf<K extends keyof AssembleContext>(
  target: AssembleContext,
  key: K,
  value: AssembleContext[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** Build the macro-free base ctx (RESOLVE output + GATHER scalars). The WI conversion needs a ctx to render
 *  WI macros against, so this is built before BUILD wires the injections. */
function buildBaseContext(
  character: AssembleCharacter,
  cast: AssembleCharacter[],
  input: BuildAssembleContextInput,
): AssembleContext {
  const base: AssembleContext = {
    character,
    promptConfig: input.promptConfig,
    cast,
    castCharacterIds: [...input.castCharacterIds],
    pinnedPersona: input.personas.anchor,
    activePersona: input.personas.active,
    speaker: { kind: "single", character },
    recentMessages: [...input.recentMessages],
    variableValues: input.variableValues,
    generationType: input.generationType ?? "normal",
  };
  setIf(base, "roomOverrides", input.roomOverrides);
  setIf(base, "lastMessage", input.lastMessage);
  setIf(base, "lastUserMessage", input.lastUserMessage);
  setIf(base, "lastCharMessage", input.lastCharMessage);
  setIf(base, "currentInput", input.currentInput);
  setIf(base, "timezone", input.timezone);
  setIf(base, "nowMs", input.nowMs);
  setIf(base, "memory", input.memory);
  setIf(base, "compactSummary", input.compactSummary);
  setIf(base, "guidedInstruction", input.guidedInstruction);
  return base;
}

/** Route the budget-kept candidates: anchor-bucket WI → the before/after anchor parts; everything else →
 *  the injection list (system-block positions framed once; in_chat left unframed for the SHAPE splice). */
function routeKept(kept: readonly InjectionCandidate[]): {
  chatInjections: ChatInjection[];
  beforeParts: string[];
  afterParts: string[];
} {
  const chatInjections: ChatInjection[] = [];
  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  for (const c of kept) {
    if (c.bucket === "before") {
      beforeParts.push(c.injection.content);
    } else if (c.bucket === "after") {
      afterParts.push(c.injection.content);
    } else {
      chatInjections.push(frameSystemInjection(c.injection));
    }
  }
  return { chatInjections, beforeParts, afterParts };
}

/**
 * RESOLVE → GATHER → BUILD: produce the IMMUTABLE per-turn `AssembleContext` (chat.md §2/§5). Reads the
 * chat-owned roster cast (via `ctx.getCard`) + the WI pool; everything cross-domain is in `input` (see the
 * FLAGs). The returned ctx is the turn artifact SHAPE consumes per speaker — never mutated after return.
 */
export async function buildAssembleContext(
  ctx: ChatContext,
  input: BuildAssembleContextInput,
  out?: SendRegexResult,
): Promise<AssembleContext> {
  // ── RESOLVE — cast (live cards via the injected getCard, D28). NO macros yet. ──
  const cards = await Promise.all(
    input.castCharacterIds.map((characterId) =>
      ctx.getCard({ ownerId: input.ownerId, characterId }),
    ),
  );
  const cast = cards.filter((c): c is CharacterCard => c !== null).map(toAssembleCharacter);
  const character: AssembleCharacter = cast[0] ?? { name: "Assistant", description: "" };

  // ── GATHER — the 4-scope WI pool (memory/recall/vars are engine-supplied inputs). ──
  const pool = await loadWorldInfoPool(ctx.db, {
    chatId: input.chatId,
    ownerId: input.ownerId,
    castCharacterIds: input.castCharacterIds,
    personaIds: input.personaIds,
  });

  const base = buildBaseContext(character, cast, input);

  // ── SEND — USER_INPUT regex on the pending user text (chat.md §2: macro → set {{input}} → USER_INPUT regex
  //    → fold the POST-regex text into the WI haystack + {{input}}). Between RESOLVE/base and GATHER so the
  //    haystack AND the persisted row (surfaced via `out`) are BOTH post-regex — no divergence (§3 rule 4 / §7).
  //    The replace-template macro ctx is author-side (macros-before-regex); the watchdog guards the regex (D53). ──
  const hostScripts: readonly RegexScript[] = input.hostTierRegexScripts ?? [];
  let pendingText = input.pendingUserText;
  if (input.pendingUserText !== undefined && hostScripts.length > 0) {
    const sendMacroCtx = buildTurnMacroContext({
      assembleCtx: base,
      model: input.model,
      chatId: input.chatId,
      input: input.pendingUserText,
    });
    const sendUserText = executeRegexScripts({
      text: input.pendingUserText,
      scripts: hostScripts,
      placement: "USER_INPUT",
      ctx: sendMacroCtx,
      applyReplace: ctx.applyRegexReplace,
    });
    pendingText = sendUserText;
    // §2: the post-regex text feeds {{input}} for the rest of ASSEMBLE (and the verb persists it via `out`).
    base.currentInput = sendUserText;
    if (out !== undefined) {
      out.sendUserText = sendUserText;
    }
  }

  // ── BUILD — WI → injections (render once + keyword match), unify into ONE list, ONE budget pass. ──
  const wiFormat = input.promptConfig.formatStrings?.wiFormat ?? DEFAULT_FORMAT_STRINGS.wiFormat;
  const names = [
    ...cast.map((c) => c.name),
    input.personas.anchor?.name,
    input.personas.active?.name,
  ].filter((n): n is string => typeof n === "string" && n.length > 0);

  // WI activation is EMERGENT (no master toggle, ST parity): the pool yields attached+enabled+present; an
  // empty pool ⇒ nothing rendered. The before/after anchors only POSITION the always-scope bucket.
  const wi = convertWorldInfo(
    pool,
    base,
    {
      regexScripts: input.promptConfig.regexScripts,
      applyReplace: ctx.applyRegexReplace,
      wiFormat,
      recentMessages: input.recentMessages,
      // POST-USER_INPUT-regex (chat.md §2 — the two-phase haystack sees the transformed pending text).
      pendingUserText: pendingText,
      names,
      lastUserMessage: input.lastUserMessage,
      hasBeforeAnchor: hasMarker(input.promptConfig, "world_info_before"),
      hasAfterAnchor: hasMarker(input.promptConfig, "world_info_after"),
    },
    buildTurnMacroContext({ assembleCtx: base, model: input.model, chatId: input.chatId }),
  );

  // The ONE injection list (chat.md §4): WI + the user `chat_injections` (operator intent — never dropped).
  const userCandidates: InjectionCandidate[] = input.userInjections.map((injection, idx) => ({
    injection,
    tokens: estimateTokens(injection.content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: `user:${idx}`,
    bucket: null,
  }));
  const { kept, dropped } = budgetInjections(
    [...wi.candidates, ...userCandidates],
    input.injectionTokenBudget,
  );
  const { chatInjections, beforeParts, afterParts } = routeKept(kept);

  return {
    ...base,
    chatInjections,
    worldInfoBefore: beforeParts.join("\n"),
    worldInfoAfter: afterParts.join("\n"),
    // Carry the resolved host-tier regex set onto the immutable ctx so RECEIVE (the pipeline) applies the same
    // set (AI_OUTPUT/REASONING) the SEND pass used (USER_INPUT) — D53. Absent stays absent (preview/aux turns).
    ...(input.hostTierRegexScripts !== undefined
      ? { hostTierRegexScripts: input.hostTierRegexScripts }
      : {}),
    wiTrace: {
      included: chatInjections.length + beforeParts.length + afterParts.length,
      dropped,
      matchedKeys: wi.matchedKeys,
    },
  };
}
