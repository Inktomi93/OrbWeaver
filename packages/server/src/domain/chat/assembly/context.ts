// Assemble context producer: RESOLVE (cast/personas/names) → GATHER (WI pool + keyword match + memory) →
// BUILD (render WI once, unify all injections into one budgeted pass) → the immutable AssembleContext SHAPE
// consumes per speaker. USER_INPUT regex runs here (between RESOLVE and GATHER) so the WI haystack and the
// persisted user row are the same post-regex text.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  AgentSpeakerIdentity,
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
import type { ChatContext } from "../context";
import type { AgentCastMember, ApplyRegexReplaceOp } from "../contract/context";
import type { ResolvedPersonas } from "../contract/foreign";
import type { GuidedSteer } from "../contract/params";
import { renderInjection } from "./injections";
import { buildTurnMacroContext, freezeVolatileMacros, renderMacros, resolveGuidedActionText } from "./macros";
import { loadWorldInfoPool } from "./world-info/pool";

interface MatchedKey {
  key: string;
  matchedLatestUserMessage: boolean;
}

/** Logs a ReDoS-watchdog/bad-regex failure; the pass proceeds fail-open on the text as-is. */
function onHostRegexFailure(placement: "WORLD_INFO" | "USER_INPUT"): (err: unknown, script: RegexScriptInput) => void {
  return (err, script) => getLog().warn({ err, placement, findRegex: script.findRegex }, "chat: host-tier regex script failed (D53 watchdog)");
}

/** Logs a macro-engine depth-cap/output-size trip; fail-open, output stays bounded. */
function onMacroWarn(msg: string, err?: unknown): void {
  getLog().warn({ err, macroWarn: msg }, "chat: macro budget/eval trip (D53)");
}

/** A budget candidate: a rendered injection + cost + survival flag + sort priority. `bucket` routes an
 *  always-scope WI entry to a before/after anchor instead of the injection list. */
interface InjectionCandidate {
  injection: ChatInjection;
  tokens: number;
  ignoreBudget: boolean;
  priority: number;
  entryId: string;
  /** Set only for a WI-origin candidate; user/guided candidates use a synthetic entryId and leave this unset. */
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

/** Resolves `{{entry}}` in a wiFormat template without re-rendering the already-resolved entry content. */
function wrapWiFormat(content: string, wiFormat: string, ctx: AssembleContext): string {
  if (!wiFormat.includes("{{entry}}")) {
    return content;
  }
  // Function-replacer, not string replaceAll: the string form treats "$$"/"$&"/"$1" in content as
  // replacement patterns, corrupting lore text that contains them (e.g. "$$50").
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
function resolveBucket(entry: AssembleWorldEntry, args: WiConversionArgs): "before" | "after" | null {
  if (entry.position === "before" && args.hasBeforeAnchor) {
    return "before";
  }
  if (entry.position === "after" && args.hasAfterAnchor) {
    return "after";
  }
  return null;
}

/** Position-routes a rendered WI entry: depth-inject → in_chat; always-scope → anchor bucket (or
 *  in_static); keyword (fired) → in_prompt. */
function wiCandidate(entry: AssembleWorldEntry, content: string, args: WiConversionArgs): InjectionCandidate {
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

/** Records a keyword entry's fired keys, noting which fired on the latest user text, into the trace. */
function recordKeyHits(entry: AssembleWorldEntry, hits: readonly string[], env: WiConvEnv): void {
  const userHits = env.haystacks.latestUser.length > 0 ? new Set(matchEntryKeys(entry.keys, env.haystacks.latestUser)) : new Set<string>();
  for (const key of hits) {
    env.matchedKeys.push({ key, matchedLatestUserMessage: userHits.has(key) });
  }
}

/** Classifies one enabled WI entry into a budget candidate (null if a keyword entry didn't fire); renders
 *  once via macro → regex(WORLD_INFO) → wiFormat-wrap. */
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
  // Guard against wrapping an empty entry into a dangling scaffold under a custom wiFormat template.
  if (afterRegex.trim().length === 0) {
    return null;
  }
  return wiCandidate(entry, wrapWiFormat(afterRegex, env.args.wiFormat, env.ctx), env.args);
}

/** Converts the WI pool to budget candidates + the matched-keys trace; keyword matching sees the
 *  pending (uncommitted) user text. */
function convertWorldInfo(
  pool: readonly AssembleWorldEntry[],
  ctx: AssembleContext,
  args: WiConversionArgs,
  regexCtx: MacroContext,
): { candidates: InjectionCandidate[]; matchedKeys: MatchedKey[] } {
  const haystackTexts = [...args.recentMessages, ...(args.pendingUserText !== undefined ? [args.pendingUserText] : [])];
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

/** An agent speaker's resolved SOUL → the same card-shaped `AssembleCharacter` slot a character card fills
 *  (D60; agent-principal-design/04 §5 — "the card-shape minus the card"). The soul `systemPrompt` rides the
 *  `AssembleCharacter.systemPrompt` override so it REPLACES the preset's main-prompt/system section for the
 *  agent's own turn (the per-speaker SHAPE picks this slot). No card body (`description: ""`), no world-info,
 *  no depth note — an agent has none; the soul carries NO tools (a room turn is a plain roleplay turn). */
function soulToAssembleCharacter(identity: AgentSpeakerIdentity): AssembleCharacter {
  return {
    name: identity.displayName,
    description: "",
    personality: null,
    scenario: null,
    exampleMessages: null,
    systemPrompt: identity.systemPrompt,
    postHistoryInstructions: null,
    depthPrompt: null,
  };
}

/** Everything the engine/verb resolves at the composition seam + the chat-owned data this producer reads.
 *  File-local — the engine passes a structurally-matching literal (promptConfig/personas/memory are
 *  resolved by other domains, not fetched here). */
interface BuildAssembleContextInput {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly castCharacterIds: readonly CharacterId[];
  /** The present SEATED agents (D60), soul-resolved by `loadRoom` via the compose-root speaker registry.
   *  Appended to `cast`/`castMembers` AFTER the characters (index-aligned) so the per-speaker SHAPE renders
   *  an agent's soul as its own card. Empty (the overwhelming case) ⇒ byte-identical to a character-only room.
   *  NOT folded into `castCharacterIds` — agents have no character id / world-info / memory bucket. */
  readonly agentCast?: readonly AgentCastMember[] | undefined;
  readonly personaIds: readonly PersonaId[];
  readonly promptConfig: PromptConfig;
  readonly personas: ResolvedPersonas;
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
  readonly compactSummary?: string | null | undefined;
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
  /** Effective host-tier regex set (host-global ∪ chat-preset ∪ cast), resolved by the verb/root; applied
   *  at SEND (USER_INPUT) and copied onto the returned AssembleContext for RECEIVE. */
  readonly hostTierRegexScripts?: readonly RegexScript[] | undefined;
}

/** Out-param sink for the SEND USER_INPUT regex result: when both `pendingUserText` and
 *  `hostTierRegexScripts` are supplied, {@link buildAssembleContext} writes the post-regex text here so
 *  the SEND verb persists the exact same text the WI haystack saw. */
interface SendRegexResult {
  sendUserText?: string;
}

function hasMarker(config: PromptConfig, marker: string): boolean {
  return config.sections.some((s) => s.type === "marker" && s.marker === marker && s.enabled);
}

/** Frames a system-block injection once (content already macro-resolved); `in_chat` injections stay
 *  unframed since SHAPE's splice frames them. */
function frameSystemInjection(inj: ChatInjection): ChatInjection {
  return inj.position === "in_chat" ? inj : { ...inj, content: renderInjection(inj) };
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
  cast: AssembleCharacter[],
  castMembers: SpeakerRef[],
  input: BuildAssembleContextInput,
): AssembleContext {
  const base: AssembleContext = {
    character,
    promptConfig: input.promptConfig,
    cast,
    // Derived from castMembers so it stays index-aligned with `cast` even once agents append (agent seats
    // carry no characterId → null). A character-only room is byte-identical to `[...input.castCharacterIds]`.
    castCharacterIds: castMembers.map((m) => (m.kind === "character" ? m.characterId : null)),
    castMembers,
    // Null-anchor fallback: an unset/dead anchor resolves to the active persona so card-derived macros
    // never collapse to the literal "User"; a SET anchor never follows a mid-chat swap.
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
  // The {{persona}} marker emits only when the active persona's placement is in_prompt (default/absent);
  // at_depth/none route elsewhere, so the description is never double-injected.
  base.personaMarkerActive = input.personas.active?.placement === undefined || input.personas.active.placement.kind === "in_prompt";
  return base;
}

/** Routes budget-kept candidates: anchor-bucket WI → before/after parts; everything else → the
 *  injection list (system-block positions framed once, in_chat left unframed for the SHAPE splice). */
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

/** Resolves the one-turn guided steer against the built base ctx: `steer.placement`, else the action
 *  config's role (system → marker; user/assistant → depth-0 injection). No steer is a no-op. */
function resolveGuidedSteer(base: AssembleContext, input: BuildAssembleContextInput): { candidates: InjectionCandidate[] } {
  const steer = input.guided;
  if (steer === undefined) {
    return { candidates: [] };
  }
  const config = input.promptConfig.guidedActions?.[steer.action] ?? DEFAULT_GUIDED_ACTIONS[steer.action];
  const resolved = resolveGuidedActionText(base, {
    action: steer.action,
    input: steer.input ?? "",
    model: input.model,
    chatId: input.chatId,
    person: steer.person,
  });
  // A scaffold-only action on a blank steer resolves empty — inject nothing rather than a dangling scaffold.
  if (resolved.trim().length === 0) {
    return { candidates: [] };
  }
  const placement = steer.placement ?? (config.role === "system" ? ({ kind: "system" } as const) : ({ kind: "inject", role: config.role } as const));
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

/** The anchor persona's card-context lead-in, marking its description as the established identity the
 *  character's card relationships refer to. */
const ANCHOR_IDENTITY_PREFIX = "The person the character knows as the user is";

/** The active persona's `descriptionPosition: "at_depth"` → an in_chat candidate, or null when it doesn't
 *  inject at depth. Resolved against the active persona itself to avoid cross-contaminating another persona's
 *  macros; unframed so a no-swap turn stays byte-identical to single-persona output. */
function activePersonaDepthCandidate(ctx: AssembleContext, active: AssemblePersona | null): InjectionCandidate | null {
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

/** The anchor persona's description injected in card-context: a fixed in_static system block so a mid-chat
 *  swap still reaches the model with who the character's card relationships refer to, even though the
 *  active speaker differs. Ignores the anchor's own descriptionPosition (that's its prompt-time preference
 *  for when it IS active, not this role). Null when opted out or empty. */
function anchorPersonaCardCandidate(ctx: AssembleContext, anchor: AssemblePersona): InjectionCandidate | null {
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

/** True when the anchor is the same persona as active (no-swap case), deduped on name+description since
 *  AssemblePersona is deliberately id-free. */
function sameProjectedPersona(a: AssemblePersona, b: AssemblePersona | null): boolean {
  return b !== null && a.name === b.name && a.description === b.description;
}

/** Resolves the distinct personas in play for `{{user}}` into injection candidates: active per its own
 *  descriptionPosition (unframed); anchor as a fixed card-context block, only on a real swap. Deduped so a
 *  no-swap turn's output is byte-identical to the active-only injection. */
function resolvePersonaDescriptionCandidates(ctx: AssembleContext, personas: ResolvedPersonas): InjectionCandidate[] {
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

/** The seated cast's Character's-Note-\@-Depth (`card.depthPrompt`) → per-member in_chat injection
 *  candidates. Every present cast member with a non-empty note injects, with `{{char}}` bound to that
 *  member; `{{user}}` routes to the card (anchor/pinned) persona, not the active speaker. Same-depth
 *  notes keep cast order (primary first) deterministically since neither side sets an explicit `order`. */
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

/** The authorsNoteSource trace label: the single contributor's name, or "merged (present cast)" when
 *  2+ members contribute. */
function depthNoteSource(contributorNames: readonly string[]): string {
  return contributorNames.length === 1 ? `from ${contributorNames[0]}` : "merged (present cast)";
}

/** The chat's room author's note → an in_chat depth-note candidate on the same injection machinery the
 *  member notes ride. `{{user}}` routes to the active persona; `{{char}}` to the base primary since the
 *  note is chat-scoped, not bound to any one cast member. Null when the rendered note is empty. */
function roomAuthorsNoteCandidate(ctx: AssembleContext, note: RoomAuthorsNote): InjectionCandidate | null {
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

/** The author's-note depth injection for this turn, one home, no doubling: a non-empty room authorsNote
 *  overrides and suppresses the per-member card depthPrompt notes; unset/whitespace-only falls through to
 *  the member notes. Suppression keys on the stored note being non-empty, so a note that renders empty
 *  still suppresses (it just contributes no candidate). */
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

/** Produces the immutable per-turn AssembleContext SHAPE consumes per speaker; never mutated after return. */
export async function buildAssembleContext(ctx: ChatContext, input: BuildAssembleContextInput, out?: SendRegexResult): Promise<AssembleContext> {
  // RESOLVE — live cast cards; castMembers stays index-aligned with the filtered cast (a gone/null card
  // drops from both). Seated agents (D60) append AFTER the characters as soul-cards on the SAME cast axis —
  // one turn path, no if(isAgent) branch; an empty agentCast is byte-identical to a character-only room.
  const cards = await Promise.all(input.castCharacterIds.map((characterId) => ctx.getCard({ ownerId: input.ownerId, characterId })));
  const present = input.castCharacterIds.flatMap((characterId, i) => {
    const card = cards[i];
    return card ? [{ characterId, card }] : [];
  });
  const agentCast = input.agentCast ?? [];
  const cast = [...present.map((p) => toAssembleCharacter(p.card)), ...agentCast.map((a) => soulToAssembleCharacter(a.identity))];
  const castMembers: SpeakerRef[] = [
    ...present.map((p): SpeakerRef => ({ kind: "character", characterId: p.characterId })),
    ...agentCast.map((a): SpeakerRef => ({ kind: "agent", userId: a.userId })),
  ];
  const character: AssembleCharacter = cast[0] ?? { name: "Assistant", description: "" };

  // ── GATHER — the 4-scope WI pool (memory/recall/vars are engine-supplied inputs). ──
  const pool = await loadWorldInfoPool(ctx.db, {
    chatId: input.chatId,
    ownerId: input.ownerId,
    castCharacterIds: input.castCharacterIds,
    personaIds: input.personaIds,
  });

  const base = buildBaseContext(character, cast, castMembers, input);

  // SEND — freeze volatile macros then run USER_INPUT regex, between RESOLVE/base and GATHER so the WI
  // haystack and the persisted row (via `out`) are the same post-transform text.
  const hostScripts: readonly RegexScript[] = input.hostTierRegexScripts ?? [];
  let pendingText = input.pendingUserText;
  if (input.pendingUserText !== undefined) {
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
    base.currentInput = frozen;
    if (out !== undefined) {
      out.sendUserText = frozen;
    }
  }

  // BUILD — WI to injections (render once + keyword match), unified into one list, one budget pass.
  const wiFormat = input.promptConfig.formatStrings?.wiFormat ?? DEFAULT_FORMAT_STRINGS.wiFormat;
  const names = [...cast.map((c) => c.name), input.personas.anchor?.name, input.personas.active?.name].filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );

  const wi = convertWorldInfo(
    pool,
    base,
    {
      regexScripts: input.promptConfig.regexScripts,
      applyReplace: ctx.applyRegexReplace,
      wiFormat,
      recentMessages: input.recentMessages,
      pendingUserText: pendingText,
      names,
      lastUserMessage: input.lastUserMessage,
      hasBeforeAnchor: hasMarker(input.promptConfig, "world_info_before"),
      hasAfterAnchor: hasMarker(input.promptConfig, "world_info_after"),
    },
    buildTurnMacroContext({ assembleCtx: base, model: input.model, chatId: input.chatId }),
  );

  const guided = resolveGuidedSteer(base, input);

  const userCandidates: InjectionCandidate[] = input.userInjections.map((injection, idx) => ({
    injection,
    tokens: estimateTokens(injection.content),
    ignoreBudget: true,
    priority: OPERATOR_PRIORITY,
    entryId: `user:${idx}`,
    bucket: null,
  }));
  const personaDescription = resolvePersonaDescriptionCandidates(base, input.personas);
  // Appended after persona so a same-depth tie orders persona-then-note deterministically.
  const authorsNote = authorsNoteCandidates(base);
  const { kept, dropped } = budgetInjections(
    [...wi.candidates, ...userCandidates, ...guided.candidates, ...personaDescription, ...authorsNote.candidates],
    input.injectionTokenBudget,
  );
  const { chatInjections, beforeParts, afterParts } = routeKept(kept);
  // WI-origin candidates that survived the budget pass; worldInfoActivated (engine.ts) reads this off wiTrace.
  const entryIds = kept.flatMap((c) => (c.worldEntryId !== undefined ? [c.worldEntryId] : []));

  return {
    ...base,
    chatInjections,
    worldInfoBefore: beforeParts.join("\n"),
    worldInfoAfter: afterParts.join("\n"),
    ...(authorsNote.authorsNoteSource !== undefined ? { authorsNoteSource: authorsNote.authorsNoteSource } : {}),
    // Carries the resolved host-tier regex set onto the immutable ctx so RECEIVE applies the same set SEND used.
    ...(input.hostTierRegexScripts !== undefined ? { hostTierRegexScripts: input.hostTierRegexScripts } : {}),
    wiTrace: {
      included: chatInjections.length + beforeParts.length + afterParts.length,
      dropped,
      matchedKeys: wi.matchedKeys,
      entryIds,
    },
  };
}
