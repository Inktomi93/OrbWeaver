// domain/chat/assembly/context — the RESOLVE → GATHER → BUILD orchestration (ASSEMBLE
// phases 1-3; the immutable two-phase turn ctx). This is the ASSEMBLE CONTEXT PRODUCER: it turns a
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
// and GATHER (the WI keyword match — `macro → set {{input}} → USER_INPUT regex → fold the POST-regex
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
  AssemblePersona,
  AssembleWorldEntry,
  ChatInjection,
  RoomAuthorsNote,
  RoomOverrides,
  SpeakerRef,
} from "@orb/contracts/chat";
import { AUTHORS_NOTE_DEFAULT_DEPTH, AUTHORS_NOTE_DEFAULT_ROLE } from "@orb/contracts/chat";
import type { GenerationType, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_FORMAT_STRINGS, DEFAULT_GUIDED_ACTIONS } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PersonaId, UserId, WorldEntryId } from "@orb/kit/ids";
import { resolveInjectionPlacement } from "@orb/kit/injection";
import type { MacroContext } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { estimateTokens } from "@orb/kit/tokens";
import { buildKeywordHaystack, matchEntryKeys } from "@orb/kit/world-info";
import { getLog } from "#foundation/observability";
import type { ApplyRegexReplaceOp, ChatContext } from "../contract/context";
import type { ResolvedPersonas } from "../contract/foreign";
import type { GuidedSteer } from "../contract/params";
import { renderInjection } from "./injections";
import {
  buildTurnMacroContext,
  freezeVolatileMacros,
  renderMacros,
  resolveGuidedActionText,
} from "./macros";
import { loadWorldInfoPool } from "./world-info/pool";

interface MatchedKey {
  key: string;
  matchedLatestUserMessage: boolean;
}

/** F9: route the D53 regex watchdog's deliberate throw (a ReDoS timeout / a bad host regex) to the operator
 *  log — the kit executor's `onScriptFailure?.()` is a no-op without a sink, silently eating the guard's
 *  observability (fail-open by design: the pass proceeds on the text as-is). Shared by the WORLD_INFO +
 *  USER_INPUT host-tier passes. */
function onHostRegexFailure(
  placement: "WORLD_INFO" | "USER_INPUT",
): (err: unknown, script: RegexScriptInput) => void {
  return (err, script) =>
    getLog().warn(
      { err, placement, findRegex: script.findRegex },
      "chat: host-tier regex script failed (D53 watchdog)",
    );
}

/** F9: the macro engine's depth-cap / 1MB-output trip is fail-open (the output stays bounded) but must be
 *  OBSERVABLE — route it to the operator log (never supplied on the live assemble path). */
function onMacroWarn(msg: string, err?: unknown): void {
  getLog().warn({ err, macroWarn: msg }, "chat: macro budget/eval trip (D53)");
}

// ── ONE injection list + ONE budget pass ──────────────────────────────────────────────────
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
  /** Set ONLY for a WI-origin candidate (the real `worldEntries` PK) — user/guided candidates use a
   *  synthetic `entryId` (`"user:0"`/`"guided"`) and leave this unset. `worldInfoActivated` (D50 pt-2)
   *  reports exactly the budget-surviving entries carrying this field. */
  worldEntryId?: WorldEntryId;
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

/** The ONE budget pass: walk the unified candidate list ONCE (priority order), charging tokens
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

// ── WI → injection conversion (GATHER keyword match + BUILD render-once) ──────────
/** Resolve `{{entry}}` in a wiFormat template WITHOUT re-rendering the already-resolved entry content
 *  (render once). `wiFormat`'s OWN macros render once (`{{entry}}` is unregistered, so
 *  the engine re-emits it verbatim); the resolved entry text is then string-spliced in. */
function wrapWiFormat(content: string, wiFormat: string, ctx: AssembleContext): string {
  if (!wiFormat.includes("{{entry}}")) {
    return content;
  }
  // FUNCTION-replacement form (F3): the string form of `replaceAll` treats `$$`/`$&`/`$1` in `content` as
  // replacement patterns — so lore with currency (`charges $$50`) or `$&` is silently corrupted. A function
  // replacer inserts `content` verbatim (default wiFormat `{{entry}}` puts EVERY entry through here).
  return renderMacros(wiFormat, ctx, ctx.activePersona).replaceAll("{{entry}}", () => content);
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
  const meta = {
    tokens: estimateTokens(content),
    ignoreBudget: entry.ignoreBudget === true,
    priority: entry.priority,
    entryId: entry.id,
    worldEntryId: entry.id,
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
 *  `macro → regex(WORLD_INFO) → wiFormat-wrap`; source-routed persona (pinned for card-derived,
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
    onScriptFailure: onHostRegexFailure("WORLD_INFO"),
  });
  // F2-sibling: an entry whose content renders empty contributes nothing — with the DEFAULT wiFormat
  // (identity `{{entry}}`) it already collapses to "", but a CUSTOM wiFormat (`[World info:\n{{entry}}]`)
  // would wrap the emptiness into a dangling scaffold. Guard here so no empty entry ever reaches the prompt.
  if (afterRegex.trim().length === 0) {
    return null;
  }
  return wiCandidate(entry, wrapWiFormat(afterRegex, env.args.wiFormat, env.ctx), env.args);
}

/** Convert the WI pool → budget candidates + the matched-keys trace. Keyword matching sees
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
    // The Character's-Note-@-Depth carried onto the slim cast (the `{depth, role?, prompt}` projection),
    // spliced per-member by `characterDepthNoteCandidates`. A null card field ⇒ no note.
    depthPrompt: card.depthPrompt,
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
   *  `{{lastMessage}}`-family macro inputs. */
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
  /** The one-turn typed steer (PD-63 routed): resolved ONCE in BUILD — template + neutralized
   *  `{{input}}` → the `{{guided_instruction}}` marker (system placement, the default) or a depth-0
   *  `in_chat` injection (the `inject` arm). Never persisted; never re-routed at splice time. */
  readonly guided?: GuidedSteer | undefined;
  readonly variableValues: Record<string, string>;
  readonly generationType?: GenerationType | undefined;
  /** The caller's PER-REQUEST browser IANA zone for `{{time}}`/`{{date}}` (client.md epoch-UTC pipeline) — NOT
   *  a stored/host setting (D19). Absent ⇒ the macro engine falls back to server-local. The per-request wire
   *  (turn request → here) lands with the client; FLAG[timezone-per-request] in assemble-gather. */
  readonly timezone?: string | undefined;
  readonly nowMs?: number | undefined;
  /** The SEEDED turn PRNG (D46 — never ambient `Math.random`). Drives the SEND volatile-macro FREEZE
   *  (`{{roll}}`/`{{random}}`/`{{pick}}`) so a committed row's baked value is deterministic + replayable. Absent
   *  (preview / aux turn without a composer send) ⇒ the freeze pass has no PRNG (only pending-text sends
   *  freeze). */
  readonly prng?: (() => number) | undefined;
  /** The routing-resolved model id (for `{{model}}` inside WORLD_INFO regex replacements). */
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

/** Out-param sink for the SEND USER_INPUT regex result (canon-mutating at write). When the
 *  caller supplies BOTH `pendingUserText` and `hostTierRegexScripts`, {@link buildAssembleContext} runs the
 *  USER_INPUT regex (to fold the post-regex text into the WI haystack + `{{input}}`) and writes the result here so
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
  castMembers: SpeakerRef[],
  input: BuildAssembleContextInput,
): AssembleContext {
  const base: AssembleContext = {
    character,
    promptConfig: input.promptConfig,
    cast,
    castCharacterIds: [...input.castCharacterIds],
    castMembers,
    // The NULL-ANCHOR FALLBACK (the dual-persona rule, decided): an unset/dead anchor resolves to
    // the ACTIVE persona, so card-derived {{user}}/{{persona}} + source==='character' WI never collapse
    // to the literal "User" while the speaker HAS a persona. A SET anchor still never follows a mid-chat
    // switch (the stable card POV); the fallback fires only when there is no anchor to hold.
    pinnedPersona: input.personas.anchor ?? input.personas.active,
    activePersona: input.personas.active,
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
  setIf(base, "lastMessage", input.lastMessage);
  setIf(base, "lastUserMessage", input.lastUserMessage);
  setIf(base, "lastCharMessage", input.lastCharMessage);
  setIf(base, "currentInput", input.currentInput);
  setIf(base, "timezone", input.timezone);
  setIf(base, "nowMs", input.nowMs);
  setIf(base, "memory", input.memory);
  setIf(base, "compactSummary", input.compactSummary);
  setIf(base, "guidedInstruction", input.guidedInstruction);
  // FINAL-Persona §A.6b gap #1 — the SINGLE-PLACEMENT rule for the ACTIVE persona's description: the
  // `{{persona}}` marker (the `in_prompt` slot, assemble.ts) emits ONLY when the active placement is
  // `in_prompt` (the default / absent). `at_depth` rode the `in_chat` injection below; `none` opts out —
  // either way the marker is SILENCED so the description is never double-injected. Keyed off the ACTIVE
  // persona (the PROMPT `{{user}}`), never the anchor (the anchor rides card-context, not this marker).
  base.personaMarkerActive =
    input.personas.active?.placement === undefined ||
    input.personas.active.placement.kind === "in_prompt";
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

/** Resolve the one-turn guided steer (PD-63) against the built base ctx. Placement is decided
 *  ONCE: the explicit `steer.placement`, else the action config's `role` (`system` → the marker; `user`/
 *  `assistant` → a depth-0 injection). The system arm MUTATES `base.guidedInstruction` (base is the local
 *  under construction — the ctx is frozen after BUILD); the inject arm returns the candidate for the ONE
 *  injection list. No steer ⇒ no-op. */
function resolveGuidedSteer(
  base: AssembleContext,
  input: BuildAssembleContextInput,
): { candidates: InjectionCandidate[] } {
  const steer = input.guided;
  if (steer === undefined) {
    return { candidates: [] };
  }
  const config =
    input.promptConfig.guidedActions?.[steer.action] ?? DEFAULT_GUIDED_ACTIONS[steer.action];
  const resolved = resolveGuidedActionText(base, {
    action: steer.action,
    input: steer.input ?? "",
    model: input.model,
    chatId: input.chatId,
    person: steer.person,
  });
  // F2: a scaffold-only action on a blank steer resolves to "" (resolveGuidedActionText) — inject NOTHING
  // rather than a dangling scaffold. Neither arm fires: don't touch `base.guidedInstruction` (the marker's
  // own empty-check would drop it, but leaving the pre-resolved `input.guidedInstruction` intact is correct),
  // and emit no depth-0 injection. Any genuinely-empty resolution is treated the same (no empty candidate).
  if (resolved.trim().length === 0) {
    return { candidates: [] };
  }
  const placement =
    steer.placement ??
    (config.role === "system"
      ? ({ kind: "system" } as const)
      : ({ kind: "inject", role: config.role } as const));
  if (placement.kind === "system") {
    base.guidedInstruction = resolved;
    return { candidates: [] };
  }
  return {
    candidates: [
      {
        injection: { position: "in_chat", depth: 0, role: placement.role, content: resolved },
        tokens: estimateTokens(resolved),
        ignoreBudget: true,
        priority: OPERATOR_PRIORITY,
        entryId: "guided",
        bucket: null,
      },
    ],
  };
}

/** The ANCHOR persona's card-context lead-in — marks its description as the established identity the
 *  character's card relationships refer to (its card `{{user}}`). No magic string; one home. */
const ANCHOR_IDENTITY_PREFIX = "The person the character knows as the user is";

/** The ACTIVE persona's `descriptionPosition: "at_depth"` → an `in_chat` injection candidate (its own
 *  placement, per Chat-Macro-Resolution §4 — the PROMPT `{{user}}`, "who is speaking now"), or null when
 *  it doesn't inject at depth (`in_prompt` rides the `{{persona}}` marker — assemble.ts; `none` opts out;
 *  empty description). The description is MACRO-RESOLVED against the ACTIVE persona (its `{{user}}`/
 *  `{{persona}}` = its OWN name/description) BEFORE it enters the list — resolving against any OTHER
 *  persona would cross-contaminate (the owner-flagged bug). `{{char}}` resolves to the cast primary as
 *  normal. UNFRAMED (the primary "current speaker" block) so a no-swap turn is byte-identical to the
 *  single-persona output. The splice re-runs its macro pass, but it is idempotent on resolved text. */
function activePersonaDepthCandidate(
  ctx: AssembleContext,
  active: AssemblePersona | null,
): InjectionCandidate | null {
  if (active === null || active.placement?.kind !== "at_depth") {
    return null;
  }
  const content = renderMacros(active.description, ctx, active);
  if (content.trim().length === 0) {
    return null;
  }
  const { depth, role } = active.placement;
  return {
    injection: { position: "in_chat", depth, role, content },
    tokens: estimateTokens(content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "persona-description",
    bucket: null,
  };
}

/** The ANCHOR persona's description injected in CARD-CONTEXT (FINAL-Persona §A.6b gap #1, the BOTH-PERSONAS
 *  rule). The anchor is the CARD-context persona — the character's relationships are built around it (a card
 *  that says the user is its brother refers to the ANCHOR) — so on a mid-chat swap its description must reach
 *  the model even though the ACTIVE speaker differs, else the character loses all context on who its card
 *  refers to. Delivered as a FIXED `in_static` system block (appended WITH the card-derived sections in
 *  assemble.ts, the same region `pinnedPersona`-resolved card content lands), NOT via the anchor's OWN
 *  `descriptionPosition` — that setting is the anchor persona's PROMPT-time preference for when IT is the
 *  active speaker (the wrong role here). The description is macro-resolved against the ANCHOR persona (its
 *  own user/persona macros = its own name/description — per-persona resolution, no cross-contamination),
 *  then framed as the established identity. Returns null when the anchor opts out
 *  (`descriptionPosition: "none"`) or has an empty description. */
function anchorPersonaCardCandidate(
  ctx: AssembleContext,
  anchor: AssemblePersona,
): InjectionCandidate | null {
  if (anchor.placement?.kind === "none") {
    return null;
  }
  const resolved = renderMacros(anchor.description, ctx, anchor);
  if (resolved.trim().length === 0) {
    return null;
  }
  const content = `[${ANCHOR_IDENTITY_PREFIX} ${anchor.name}: ${resolved}]`;
  return {
    injection: { position: "in_static", depth: 0, role: "system", content },
    tokens: estimateTokens(content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "persona-description-anchor",
    bucket: null,
  };
}

/** True when the ANCHOR is the SAME persona as the ACTIVE (the no-swap case) — deduped on the projected
 *  identity: same `personaId` ⟹ `loadPersona` (`entry/compose/chat.ts`) yields structurally-equal
 *  projections, so a name+description match IS a personaId match for every real input (`AssemblePersona`
 *  is deliberately id-free — the slim assemble projection avoids a `chat → persona` DAG edge). */
function sameProjectedPersona(a: AssemblePersona, b: AssemblePersona | null): boolean {
  return b !== null && a.name === b.name && a.description === b.description;
}

/** Resolve the DISTINCT personas in play for `{{user}}` (FINAL-Persona §A.6b gap #1, the BOTH-PERSONAS
 *  rule) into injection candidates, each in ITS OWN context role (mirroring the `{{user}}` card-vs-prompt
 *  split), joined into the SAME unified list/budget pass WI + guided feed. `ignoreBudget: true` (config
 *  intent, the `userCandidates`/guided precedent):
 *   • ACTIVE (the PROMPT `{{user}}`) → per its OWN `descriptionPosition` (`at_depth` = an `in_chat`
 *     injection here; `in_prompt` = the `{{persona}}` marker, assemble.ts; `none` = nothing). UNFRAMED.
 *   • ANCHOR (the CARD `{{user}}`) → a FIXED `in_static` card-context system block (NOT its own
 *     `descriptionPosition`), injected ONLY on a real swap (a persona DISTINCT from active), framed as the
 *     established identity — so a mid-chat swap keeps the character's context on who its card refers to.
 *  Deduped: anchor == active (the common no-swap case) OR a null anchor ⇒ the anchor adds NOTHING ⇒ the
 *  output is byte-identical to the ACTIVE-only injection (the "solo byte-identical" invariant). */
function resolvePersonaDescriptionCandidates(
  ctx: AssembleContext,
  personas: ResolvedPersonas,
): InjectionCandidate[] {
  const candidates: InjectionCandidate[] = [];
  const active = activePersonaDepthCandidate(ctx, personas.active);
  if (active !== null) {
    candidates.push(active);
  }
  if (personas.anchor !== null && !sameProjectedPersona(personas.anchor, personas.active)) {
    const anchor = anchorPersonaCardCandidate(ctx, personas.anchor);
    if (anchor !== null) {
      candidates.push(anchor);
    }
  }
  return candidates;
}

/** The seated cast's Character's-Note-\@-Depth (`card.depthPrompt`, ST `data.extensions.depth_prompt` /
 *  getGroupDepthPrompts) → per-member `in_chat` injection candidates, the CHARACTER sibling of the persona
 *  depth-candidate above (same unified list + budget pass; `ignoreBudget: true` — a card-authored steering
 *  intent, never droppable, the persona/guided precedent). EVERY present cast member with a non-empty note
 *  injects — its `{{char}}` bound to THAT member (a per-member render ctx: `character`/`speaker` swapped to
 *  the member, so `charForSpeaker` yields the member's name — the "each member's note is about itself" rule).
 *  `{{user}}` routes to the CARD (anchor/pinned) persona: the note is a CARD-authored field, so it follows
 *  the card-section persona axis (Chat-Macro-Resolution §3 "CARD sections" — `pinnedPersona`), NOT the active
 *  speaker's. Depth is the note's own `depth`; role its own `role ?? "system"` (the assembler default).
 *
 *  STACKING (multiple notes at the SAME depth): the candidates are pushed in CAST ORDER (primary first) and
 *  budgetInjections preserves insertion order, so the emitted `chatInjections` array is cast-ordered; the
 *  SHAPE splice (`spliceInChatInjections`) sorts depth-DESC then `order`-ASC and is STABLE on ties, and no
 *  note sets `order` — so same-depth notes keep array order ("array order = output order", per that splice),
 *  i.e. the primary's note lands on top. Deterministic without an explicit per-note `order`.
 *
 *  PREFILL: assistant\@depth-0 is a response prefill, rejected at the WRITE boundary
 *  (`cardDepthPromptWriteSchema`), so assembly never receives it and needs no special case — the splice would
 *  normalize it anyway. Solo (one present member, one note) stays byte-identical to the single-note output. */
function characterDepthNoteCandidates(ctx: AssembleContext): {
  candidates: InjectionCandidate[];
  contributorNames: string[];
} {
  const cast = ctx.cast ?? [ctx.character];
  const candidates: InjectionCandidate[] = [];
  const contributorNames: string[] = [];
  cast.forEach((member, idx) => {
    const note = member.depthPrompt;
    if (note === null || note === undefined || note.prompt.trim().length === 0) {
      return;
    }
    const memberCtx: AssembleContext = {
      ...ctx,
      character: member,
      speaker: { kind: "single", character: member },
    };
    const content = renderMacros(note.prompt, memberCtx, ctx.pinnedPersona);
    if (content.trim().length === 0) {
      return;
    }
    contributorNames.push(member.name);
    candidates.push({
      injection: { position: "in_chat", depth: note.depth, role: note.role ?? "system", content },
      tokens: estimateTokens(content),
      ignoreBudget: true,
      priority: OPERATOR_PRIORITY,
      entryId: `character-note:${idx}`,
      bucket: null,
    });
  });
  return { candidates, contributorNames };
}

/** The `authorsNoteSource` trace label for the fired character notes (assemble.ts →
 *  `overrideSources.authorsNote`): the single contributor's name, or "merged (present cast)" when 2+
 *  cast members contribute. Callers pass a NON-EMPTY name list (a zero-note turn leaves
 *  `authorsNoteSource` unset). */
function depthNoteSource(contributorNames: readonly string[]): string {
  return contributorNames.length === 1 ? `from ${contributorNames[0]}` : "merged (present cast)";
}

/** The chat's ROOM author's note (`roomOverrides.authorsNote`) → an `in_chat` depth-note candidate on the
 *  SAME central injection machinery the member notes ride (an `ignoreBudget` OPERATOR_PRIORITY candidate —
 *  host steering intent, never droppable). Returns null when the rendered note is empty.
 *
 *  PLACEMENT (D32): resolved through the shared `resolveInjectionPlacement` primitive. The stored directive's
 *  host-set `depth`/`role` (task #22 — the widened `roomAuthorsNoteSchema`) flow straight through; each unset
 *  field falls back to the house AUTHOR'S-NOTE defaults ({@link AUTHORS_NOTE_DEFAULT_DEPTH} /
 *  {@link AUTHORS_NOTE_DEFAULT_ROLE}). A legacy bare-string note is coerced to `{prompt}` at the metadata
 *  read seam, so it arrives here carrying no depth/role and the defaults win (byte-identical to pre-#22).
 *
 *  MACRO ROUTING (matches the ROOM-OVERRIDE axis at assemble.ts — host room overrides render against the
 *  ACTIVE persona): `{{user}}` → the active persona; `{{char}}` → the base primary (the note is chat-scoped,
 *  not bound to any one cast member, so the ctx is left unmodified — `character`/`speaker` stay the primary). */
function roomAuthorsNoteCandidate(
  ctx: AssembleContext,
  note: RoomAuthorsNote,
): InjectionCandidate | null {
  const content = renderMacros(note.prompt, ctx, ctx.activePersona);
  if (content.trim().length === 0) {
    return null;
  }
  const { depth, role } = resolveInjectionPlacement(note, {
    depth: AUTHORS_NOTE_DEFAULT_DEPTH,
    role: AUTHORS_NOTE_DEFAULT_ROLE,
  });
  return {
    injection: { position: "in_chat", depth, role, content },
    tokens: estimateTokens(content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: "authors-note-room",
    bucket: null,
  };
}

/** THE author's-note depth injection for this turn — ONE home, no doubling (task #18 owner ruling,
 *  2026-07-09): a non-empty `roomOverrides.authorsNote` OVERRIDES and SUPPRESSES the per-member card
 *  `depthPrompt` notes (the host's room note is the room's single author's-note authority); an unset /
 *  whitespace-only room note ⇒ the member notes flow exactly as before (the regression path). The trace
 *  source is "room override" (the reserved `AssembleContext.authorsNoteSource` label) vs the member
 *  contributor label. Suppression keys on the STORED note being non-empty, so a host note that renders empty
 *  still suppresses (the authored room note is the authority) — it just contributes no candidate. */
function authorsNoteCandidates(ctx: AssembleContext): {
  candidates: InjectionCandidate[];
  authorsNoteSource?: string;
} {
  const roomNote = ctx.roomOverrides?.authorsNote;
  if (roomNote !== undefined && roomNote.prompt.trim().length > 0) {
    const candidate = roomAuthorsNoteCandidate(ctx, roomNote);
    return {
      candidates: candidate !== null ? [candidate] : [],
      authorsNoteSource: "room override",
    };
  }
  const member = characterDepthNoteCandidates(ctx);
  return member.contributorNames.length > 0
    ? { candidates: member.candidates, authorsNoteSource: depthNoteSource(member.contributorNames) }
    : { candidates: member.candidates };
}

/**
 * RESOLVE → GATHER → BUILD: produce the IMMUTABLE per-turn `AssembleContext`. Reads the
 * chat-owned roster cast (via `ctx.getCard`) + the WI pool; everything cross-domain is in `input` (see the
 * FLAGs). The returned ctx is the turn artifact SHAPE consumes per speaker — never mutated after return.
 */
export async function buildAssembleContext(
  ctx: ChatContext,
  input: BuildAssembleContextInput,
  out?: SendRegexResult,
): Promise<AssembleContext> {
  // ── RESOLVE — cast (live cards via the injected getCard, D28). NO macros yet. `castMembers` is the
  //    speaker identity index-aligned with the FILTERED `cast` (a gone/null card drops from both) — the
  //    per-speaker card selection keys on it (D60). Agent members join `cast`/`castMembers` at AP3-2's
  //    RESOLVE substitution (soul → AssembleCharacter); a character-only room's refs are all `character`. ──
  const cards = await Promise.all(
    input.castCharacterIds.map((characterId) =>
      ctx.getCard({ ownerId: input.ownerId, characterId }),
    ),
  );
  const present = input.castCharacterIds.flatMap((characterId, i) => {
    const card = cards[i];
    return card ? [{ characterId, card }] : [];
  });
  const cast = present.map((p) => toAssembleCharacter(p.card));
  const castMembers: SpeakerRef[] = present.map((p) => ({
    kind: "character",
    characterId: p.characterId,
  }));
  const character: AssembleCharacter = cast[0] ?? { name: "Assistant", description: "" };

  // ── GATHER — the 4-scope WI pool (memory/recall/vars are engine-supplied inputs). ──
  const pool = await loadWorldInfoPool(ctx.db, {
    chatId: input.chatId,
    ownerId: input.ownerId,
    castCharacterIds: input.castCharacterIds,
    personaIds: input.personaIds,
  });

  const base = buildBaseContext(character, cast, castMembers, input);

  // ── SEND — freeze the composer text's VOLATILE macros, THEN run USER_INPUT regex (macro → set {{input}}
  //    → USER_INPUT regex → fold the POST-regex text into the WI haystack + {{input}}). Between RESOLVE/base
  //    and GATHER so the haystack AND the persisted row (surfaced via `out`) are BOTH the same post-transform
  //    text — no divergence (§3 rule 4 / §7). Macros-before-regex (§3 rule 1): the FREEZE resolves the turn's
  //    nondeterministic macros ONCE (Chat-Macro-Resolution.md §0 — commit-time freeze) so the host regex sees
  //    (and canon stores) the baked {{roll}}/{{time}} VALUE, while IDENTITY macros stay raw/per-view; then the
  //    replace-template macro ctx is author-side and the watchdog guards the regex (D53). ──
  const hostScripts: readonly RegexScript[] = input.hostTierRegexScripts ?? [];
  let pendingText = input.pendingUserText;
  if (input.pendingUserText !== undefined) {
    // FREEZE: bake nondeterministic macros against the pinned clock (base.nowMs/timezone) + seeded PRNG;
    // identity/name macros pass through raw. A no-`{{` composer string is byte-identical passthrough.
    let frozen = freezeVolatileMacros(input.pendingUserText, base, { random: input.prng });
    if (hostScripts.length > 0) {
      const sendMacroCtx = buildTurnMacroContext({
        assembleCtx: base,
        model: input.model,
        chatId: input.chatId,
        input: frozen,
        onWarn: onMacroWarn,
      });
      frozen = executeRegexScripts({
        text: frozen,
        scripts: hostScripts,
        placement: "USER_INPUT",
        ctx: sendMacroCtx,
        applyReplace: ctx.applyRegexReplace,
        onScriptFailure: onHostRegexFailure("USER_INPUT"),
      });
    }
    pendingText = frozen;
    // §2: the frozen (+ post-regex) text feeds {{input}} for the rest of ASSEMBLE AND is the row the verb
    // persists (via `out`) — canon stores the frozen value, so a re-render is byte-stable (D46/§0).
    base.currentInput = frozen;
    if (out !== undefined) {
      out.sendUserText = frozen;
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
      // POST-USER_INPUT-regex (the two-phase haystack sees the transformed pending text).
      pendingUserText: pendingText,
      names,
      lastUserMessage: input.lastUserMessage,
      hasBeforeAnchor: hasMarker(input.promptConfig, "world_info_before"),
      hasAfterAnchor: hasMarker(input.promptConfig, "world_info_after"),
    },
    buildTurnMacroContext({ assembleCtx: base, model: input.model, chatId: input.chatId }),
  );

  // ── GUIDED (PD-63): resolve the one-turn steer ONCE — the action template + the neutralized
  //    `{{input}}` against the turn macro ctx — and deliver it via EXACTLY ONE placement: the
  //    `{{guided_instruction}}` system-marker (the default) or a depth-0 `in_chat` injection (author intent —
  //    it joins the ONE injection list, `ignoreBudget`). Never re-routed at splice time (§6 — the old
  //    `role:system`-at-depth auto-convert is dropped); never persisted. ──
  const guided = resolveGuidedSteer(base, input);

  // The ONE injection list: WI + the user `chat_injections` + a guided depth-0 injection
  // (operator/author intent — never dropped).
  const userCandidates: InjectionCandidate[] = input.userInjections.map((injection, idx) => ({
    injection,
    tokens: estimateTokens(injection.content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: `user:${idx}`,
    bucket: null,
  }));
  const personaDescription = resolvePersonaDescriptionCandidates(base, input.personas);
  // THE author's-note depth injection (task #18 ruling): a non-empty `roomOverrides.authorsNote` OVERRIDES +
  // SUPPRESSES the per-member card `depthPrompt` notes; unset ⇒ the member notes flow. Either way it joins the
  // SAME list/budget pass. Appended AFTER persona so a same-depth tie orders persona-then-note deterministically
  // (array order = output order; see the character-note STACKING note).
  const authorsNote = authorsNoteCandidates(base);
  const { kept, dropped } = budgetInjections(
    [
      ...wi.candidates,
      ...userCandidates,
      ...guided.candidates,
      ...personaDescription,
      ...authorsNote.candidates,
    ],
    input.injectionTokenBudget,
  );
  const { chatInjections, beforeParts, afterParts } = routeKept(kept);
  // D50 pt-2: the entries that actually FIRED this turn — WI-origin candidates (`worldEntryId` set) that
  // survived the budget pass. `worldInfoActivated`'s emit site (engine.ts) reads this off `wiTrace`.
  const entryIds = kept.flatMap((c) => (c.worldEntryId !== undefined ? [c.worldEntryId] : []));

  return {
    ...base,
    chatInjections,
    worldInfoBefore: beforeParts.join("\n"),
    worldInfoAfter: afterParts.join("\n"),
    // The author's-note trace source ("room override" when the room note wins, else the member contributor
    // label; `ignoreBudget` ⇒ every contributor survives the budget). Unset when no note applied (trace omits it).
    ...(authorsNote.authorsNoteSource !== undefined
      ? { authorsNoteSource: authorsNote.authorsNoteSource }
      : {}),
    // Carry the resolved host-tier regex set onto the immutable ctx so RECEIVE (the pipeline) applies the same
    // set (AI_OUTPUT/REASONING) the SEND pass used (USER_INPUT) — D53. Absent stays absent (preview/aux turns).
    ...(input.hostTierRegexScripts !== undefined
      ? { hostTierRegexScripts: input.hostTierRegexScripts }
      : {}),
    wiTrace: {
      included: chatInjections.length + beforeParts.length + afterParts.length,
      dropped,
      matchedKeys: wi.matchedKeys,
      entryIds,
    },
  };
}
