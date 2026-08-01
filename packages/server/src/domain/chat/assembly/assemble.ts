// domain/chat/assembly/assemble — the BUILD section walk. Render a reorderable `PromptConfig` against the
// immutable `AssembleContext` into the static (cache-stable) + dynamic (per-turn) system-prompt halves +
// the after-history injection bucket. Pure: no DB, no infra — context.ts loads the data and passes it in.
//
// `chat_history` is the pivot: sections before it build the system block; sections after it are delivered
// as `in_chat` injections after the conversation. `{{user}}` resolves differently by section origin:
// card-derived sections use the pinned ("anchor") persona; user-authored sections use the active persona.
//
// The system-block chat injections arrive already macro-resolved + role-framed from context.ts; this walk
// emits them verbatim. `in_chat` injections are the SHAPE splice's job.
//
// The rendered system halves run through the ASSEMBLE post-process pass (`applyAssemblePostProcess`, keyed
// to the preset's `postProcess` block) after the section/injection walk, before the caller's cache split —
// the transform is idempotent and only reorders whitespace, so it never busts the static-cache prefix.

import type { AssembleCharacter, AssembleContext, AssembledPrompt, AssembleTrace, ChatInjection, SectionPreview } from "@orb/contracts/chat";
import type { GenerationType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { MacroRegistry } from "@orb/kit/macro";
import { globalMacroRegistry } from "@orb/kit/macro";
import { normalizeExampleStart } from "@orb/kit/speaker-label";
import { applyAssemblePostProcess } from "@orb/server/kit/post-process";
import type { AssemblySlice } from "../contract/results";
import { injectionSource, personaContributorLabel, sectionSource } from "./budget";
import { BEFORE_HISTORY_DEPTH } from "./injections";
import { renderMacros } from "./macros";

// A macro whose value changes per render busts the cached static prefix. `/a^/` is unsatisfiable
// (top-level so it isn't re-compiled per call).
const NO_VOLATILE_RE = /a^/u;
// The volatile-name scan re, memoized PER REGISTRY (WAVE MU): the process singleton keeps its one-compile,
// and each per-turn user-macro registry gets its own compile so a volatile random-pick user macro in a
// static section busts the cache (a WeakMap so per-turn registries are GC'd with the turn — no leak).
//
// ASSUMES(single-replica): a PURE per-registry memoization cache — NOT a correctness boundary, so there is NO
// DB-backed replacement seam (and none is needed). It derives the SAME regex from the registry's own
// `volatileNames()` every time; a cross-replica "miss" (a fresh replica's empty WeakMap) simply RECOMPILES
// the identical regex on first use — deterministic + idempotent, never a divergent result. The keys are
// per-turn registries (GC'd with the turn) + the process singleton, so the map self-bounds.
const volatileReByRegistry = new WeakMap<MacroRegistry, RegExp>();
function volatileMacroRe(registry: MacroRegistry): RegExp {
  const cached = volatileReByRegistry.get(registry);
  if (cached !== undefined) {
    return cached;
  }
  const names = registry.volatileNames();
  const re = names.length === 0 ? NO_VOLATILE_RE : new RegExp(`\\{\\{#?(${names.join("|")})\\b`, "giu");
  volatileReByRegistry.set(registry, re);
  return re;
}

/** The volatile macro names present in `text` (source-template scan — resolved macros never reach here). */
function findVolatileMacros(text: string | null | undefined, registry: MacroRegistry): string[] {
  if (text === null || text === undefined || text.length === 0) {
    return [];
  }
  const hits = new Set<string>();
  for (const m of text.matchAll(volatileMacroRe(registry))) {
    if (m[1] !== undefined) {
      hits.add(m[1].toLowerCase());
    }
  }
  return [...hits];
}

type MarkerSection = Extract<PromptSection, { type: "marker" }>;
type TemplatedMarkerSection = Extract<MarkerSection, { marker: keyof typeof DEFAULT_MARKER_TEMPLATES }>;

/** The template for a templated marker — caller override wins, else the shipped default framing. */
function templateFor(section: TemplatedMarkerSection): string {
  return section.template ?? DEFAULT_MARKER_TEMPLATES[section.marker];
}

/** Memoized preset render of each overridable section's preset `template`, keyed by section id. */
interface Originals {
  renderedById: Map<string, string>;
}
const EMPTY_ORIGINALS: Originals = { renderedById: new Map() };

/** The shared per-assembly render bundle threaded through the section/marker arms. `pivotIndex` is the
 *  `chat_history` position. */
interface BuildEnv {
  readonly ctx: AssembleContext;
  readonly trace: AssembleTrace;
  readonly originals: Originals;
  readonly pivotIndex: number;
  /** The per-turn user-macro registry (WAVE MU) every section render + volatile-scan reads; the process
   *  `globalMacroRegistry` when the turn authored no user macros (byte-identical). */
  readonly registry: MacroRegistry;
  /** The MERGED card section's per-roster-member split, keyed by section id — recorded during the render
   *  (only the render knows which bytes are whose) and read back by the budget walk, so the Preview tab can
   *  say what EACH member in the room costs instead of one opaque "cards" total. Empty for every other
   *  section: they have exactly one contributor. */
  readonly memberBlocks: Map<string, readonly { name: string; text: string }[]>;
}

/** A room/card override "counts" only with non-whitespace content — blank means "inherit." */
function overrideSet(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// The merge-eligible per-member card fields, declared as a tuple.
const MEMBER_FIELDS = ["description", "personality", "scenario", "exampleMessages", "systemPrompt", "postHistoryInstructions"] as const;
type MemberField = (typeof MEMBER_FIELDS)[number];

/** Hard cap on the concatenated merged-fallback value (chars) — bounds the room-override `{{original}}`
 *  blowup when many present members each carry a long field. */
const MERGED_FALLBACK_CAP = 4000;

/** Render ONE member's card field with `{{char}}` bound to that member and `{{user}}` to the room anchor.
 *  `exampleMessages` is `<START>`-normalized so a member's example chain begins fresh. */
function renderMemberField(field: MemberField, member: AssembleCharacter, ctx: AssembleContext, registry: MacroRegistry): string {
  const raw = member[field];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "";
  }
  const { roomOverrides: _drop, ...rest } = ctx;
  const sub: AssembleContext = {
    ...rest,
    character: member,
    speaker: { kind: "single", character: member },
  };
  const rendered = renderMacros(raw, sub, ctx.pinnedPersona, { registry });
  return field === "exampleMessages" ? normalizeExampleStart(rendered) : rendered;
}

/** Drop empties + duplicates, preserving first-seen order. */
function dedupeNonEmpty(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** The room-override scope fallback: the value a room override inherits / `{{original}}` recovers, + whether
 *  it merged the present cast. Solo/scoped collapses to `activeValue`. Consumed only by the two
 *  `{{original}}`-templated overridable markers, never the scenario marker (that would double-emit it). */
function resolveScopeFallback(field: MemberField, ctx: AssembleContext, activeValue: string, registry: MacroRegistry): { value: string; merged: boolean } {
  const co = ctx.coSpeakers;
  if (co === undefined || co.length === 0) {
    return { value: activeValue, merged: false };
  }
  const parts = dedupeNonEmpty([activeValue, ...co.map((m) => renderMemberField(field, m, ctx, registry))]);
  const joined = parts.join("\n\n");
  const value = joined.length > MERGED_FALLBACK_CAP ? joined.slice(0, MERGED_FALLBACK_CAP) : joined;
  return { value, merged: true };
}

/** ONE present roster member's merged card block, or "" when they contribute nothing. */
function renderCoSpeakerBlock(member: AssembleCharacter, ctx: AssembleContext, registry: MacroRegistry): string {
  const head = [renderMemberField("description", member, ctx, registry), renderMemberField("personality", member, ctx, registry)]
    .filter((s) => s.trim().length > 0)
    .join("\n");
  if (head.trim().length === 0) {
    return "";
  }
  // The three headings are PROSE-1 slots (per-USER under the room host) carrying the `{{name}}` pre-
  // substitution token; the card text beneath each is data, never authorable. Absent overrides ⇒ the
  // shipped frames.
  const heading = (id: ProseSlotId): string => resolveProseText(id, ctx.prose ?? {}, { name: member.name });
  const parts = [`${heading("chat.group.alsoPresent")}\n${head}`];
  const scenario = renderMemberField("scenario", member, ctx, registry);
  const examples = renderMemberField("exampleMessages", member, ctx, registry);
  if (scenario.trim().length > 0) {
    parts.push(`${heading("chat.group.scenarioHeading")}\n${scenario}`);
  }
  if (examples.trim().length > 0) {
    parts.push(`${heading("chat.group.exampleHeading")}\n${examples}`);
  }
  return parts.join("\n\n");
}

/** The merged co-speakers' card blocks, appended after the active character's description — kept PER MEMBER
 *  (not pre-joined) so the budget can attribute each roster member's own token cost by NAME. Empty when
 *  scoped/solo/no co-speakers. The joined form is byte-identical to the pre-split render. */
function renderCoSpeakerBlocks(ctx: AssembleContext, registry: MacroRegistry): { name: string; text: string }[] {
  const co = ctx.coSpeakers;
  if (co === undefined || co.length === 0) {
    return [];
  }
  return co.map((m) => ({ name: m.name, text: renderCoSpeakerBlock(m, ctx, registry) })).filter((b) => b.text.length > 0);
}

const MERGED_CACHE_BUSTER = "merged-present-cast";

function recordMergedCacheBuster(trace: AssembleTrace): void {
  if (!trace.staticCacheBusters.includes(MERGED_CACHE_BUSTER)) {
    trace.staticCacheBusters.push(MERGED_CACHE_BUSTER);
  }
}

function recordOverrideSource(trace: AssembleTrace, field: keyof NonNullable<AssembleTrace["overrideSources"]>, source: string | undefined): void {
  if (source === undefined) {
    return;
  }
  trace.overrideSources ??= {};
  trace.overrideSources[field] = source;
}

/** The label for a room-overrideable slot ("room override" / "merged (present cast)" / "from <name>" /
 *  absent). */
function resolveOverrideSource(args: {
  room: string | null | undefined;
  forbidRoomOverride: boolean | undefined;
  cardField: string | null | undefined;
  merged: boolean;
  characterName: string;
}): string | undefined {
  let source: string | undefined;
  if (overrideSet(args.room) && args.forbidRoomOverride !== true) {
    source = "room override";
  } else if (args.merged) {
    source = "merged (present cast)";
  } else if (overrideSet(args.cardField)) {
    source = `from ${args.characterName}`;
  }
  return source;
}

/** Render an overridable slot (main_prompt / post_history): preset `template` is the editable PRESET
 *  content; a card field replaces it in place (`{{original}}` recovers the preset); a host room value
 *  replaces the card-resolved value in place (`{{original}}` recovers THAT inherited value). */
function renderOverridable(
  section: TemplatedMarkerSection,
  env: BuildEnv,
  cardField: "systemPrompt" | "postHistoryInstructions",
  roomOverride: string | null | undefined,
): { text: string; merged: boolean } {
  const { ctx, originals, registry } = env;
  const cardOverride = ctx.character[cardField];
  const preset = originals.renderedById.get(section.id) ?? renderMacros(templateFor(section), ctx, ctx.activePersona, { registry });
  const afterCard =
    overrideSet(cardOverride) && section.forbidCharacterOverride !== true
      ? renderMacros(cardOverride, ctx, ctx.pinnedPersona, { original: preset, registry })
      : preset;
  const fallback = resolveScopeFallback(cardField, ctx, afterCard, registry);
  if (overrideSet(roomOverride) && section.forbidRoomOverride !== true) {
    return {
      text: renderMacros(roomOverride, ctx, ctx.activePersona, { original: fallback.value, registry }),
      merged: fallback.merged,
    };
  }
  return { text: fallback.value, merged: fallback.merged };
}

function renderOverridableMarker(section: TemplatedMarkerSection, marker: "main_prompt" | "post_history", env: BuildEnv): string {
  const { ctx, trace } = env;
  const cardField = marker === "main_prompt" ? "systemPrompt" : "postHistoryInstructions";
  const room = marker === "main_prompt" ? ctx.roomOverrides?.mainPrompt : ctx.roomOverrides?.postHistory;
  const { text, merged } = renderOverridable(section, env, cardField, room);
  const source = resolveOverrideSource({
    room,
    forbidRoomOverride: section.forbidRoomOverride,
    cardField: ctx.character[cardField],
    merged,
    characterName: ctx.character.name,
  });
  recordOverrideSource(trace, marker === "main_prompt" ? "mainPrompt" : "postHistory", source);
  if (merged) {
    recordMergedCacheBuster(trace);
  }
  return text;
}

function renderScenarioMarker(section: TemplatedMarkerSection, env: BuildEnv): string {
  const { ctx, trace } = env;
  const room = ctx.roomOverrides?.scenario;
  // Active speaker's effective scenario only — co-speakers' scenarios are emitted once by the
  // char_description co-block; merging them here too would double-emit.
  const value = renderMacros(templateFor(section), ctx, ctx.pinnedPersona, { registry: env.registry });
  if (value.trim().length === 0) {
    return "";
  }
  recordOverrideSource(trace, "scenario", overrideSet(room) ? "room override" : `from ${ctx.character.name}`);
  return value;
}

/** The ctx field + trace flag for each server-injected marker (avoids a nested ternary). */
function serverMarkerValue(marker: "compact_summary" | "memory" | "guided_instruction", ctx: AssembleContext): string | null | undefined {
  if (marker === "compact_summary") {
    return ctx.compactSummary;
  }
  if (marker === "memory") {
    return ctx.memory;
  }
  return ctx.guidedInstruction;
}

function markServerInclude(marker: "compact_summary" | "memory" | "guided_instruction", trace: AssembleTrace): void {
  if (marker === "compact_summary") {
    trace.compactSummaryIncluded = true;
  } else if (marker === "memory") {
    trace.memoryIncluded = true;
  } else {
    trace.guidedInstructionIncluded = true;
  }
}

function renderServerMarker(section: TemplatedMarkerSection, marker: "compact_summary" | "memory" | "guided_instruction", env: BuildEnv): string {
  const value = serverMarkerValue(marker, env.ctx);
  if (value === null || value === undefined || value.trim().length === 0) {
    return "";
  }
  markServerInclude(marker, env.trace);
  return renderMacros(templateFor(section), env.ctx, env.ctx.activePersona, { registry: env.registry });
}

// biome-ignore-start lint/suspicious/noUnnecessaryConditions: biome's cross-package zod-union inference
// (the same false positive documented in credentials/substrate/parse-metadata.ts) mis-resolves the
// `@orb/contracts/preset` `PromptSection.marker` union → it flags every reachable `case` as "unreachable"
// and the nullable card fields (`personality`/`scenario`/`exampleMessages` are `string | null`) as
// non-null (calling `?? ""` redundant). tsc confirms the switches are exhaustive + reachable and the
// `?? ""` guards are required (removing them is a tsc error). biome is the false positive here.
function renderMarker(section: MarkerSection, env: BuildEnv): string {
  const { ctx, trace } = env;
  switch (section.marker) {
    case "main_prompt":
    case "post_history":
      return renderOverridableMarker(section, section.marker, env);
    case "scenario":
      return renderScenarioMarker(section, env);
    case "char_description": {
      // The MERGED card section — the one section whose text belongs to several roster members at once, so it
      // records a per-member split (`env.memberBlocks`) the budget attributes by NAME. The joined string is
      // byte-identical to the pre-split render.
      const active = renderMacros(templateFor(section), ctx, ctx.pinnedPersona, { registry: env.registry });
      const blocks = renderCoSpeakerBlocks(ctx, env.registry);
      if (blocks.length > 0) {
        recordMergedCacheBuster(trace);
      }
      env.memberBlocks.set(
        section.id,
        [{ name: ctx.character.name, text: active }, ...blocks].filter((b) => b.text.trim().length > 0),
      );
      return [active, ...blocks.map((b) => b.text)].filter((s) => s.trim().length > 0).join("\n\n");
    }
    case "char_personality":
      return ctx.character.personality !== null && ctx.character.personality !== ""
        ? renderMacros(templateFor(section), ctx, ctx.pinnedPersona, { registry: env.registry })
        : "";
    case "dialogue_examples":
      return ctx.character.exampleMessages !== null && ctx.character.exampleMessages !== ""
        ? renderMacros(templateFor(section), ctx, ctx.pinnedPersona, { registry: env.registry })
        : "";
    case "persona":
      // Emits ONLY when the active persona's description placement is in_prompt (else it rode an
      // injection, or nowhere — the single-placement rule that makes double-injection impossible).
      return ctx.activePersona && ctx.personaMarkerActive !== false
        ? renderMacros(templateFor(section), ctx, ctx.activePersona, { registry: env.registry })
        : "";
    case "compact_summary":
    case "memory":
    case "guided_instruction":
      return renderServerMarker(section, section.marker, env);
    case "world_info_before":
      return ctx.worldInfoBefore ?? "";
    case "world_info_after":
      return ctx.worldInfoAfter ?? "";
    case "chat_history":
      // The pivot renders nothing — the runner/SHAPE owns history.
      return "";
  }
}

function renderSection(section: PromptSection, env: BuildEnv): string {
  // Literal blocks are USER-authored → active persona; markers route per-marker (dual-persona inside).
  return section.type === "literal" ? renderMacros(section.content, env.ctx, env.ctx.activePersona, { registry: env.registry }) : renderMarker(section, env);
}

function coSpeakerFieldSources(field: MemberField, ctx: AssembleContext): string[] {
  const co = ctx.coSpeakers;
  return co === undefined ? [] : co.map((m) => m[field] ?? "");
}

/** The source strings (pre-render) feeding a static marker. */
function markerStaticSources(section: MarkerSection, ctx: AssembleContext): string[] {
  switch (section.marker) {
    case "chat_history":
      return [];
    case "world_info_before":
      return ctx.worldInfoBefore !== undefined ? [ctx.worldInfoBefore] : [];
    case "world_info_after":
      return ctx.worldInfoAfter !== undefined ? [ctx.worldInfoAfter] : [];
    case "persona":
    case "compact_summary":
    case "memory":
    case "guided_instruction":
      return [templateFor(section)];
    case "main_prompt":
      return [templateFor(section), ctx.character.systemPrompt ?? "", ctx.roomOverrides?.mainPrompt ?? "", ...coSpeakerFieldSources("systemPrompt", ctx)];
    case "post_history":
      return [
        templateFor(section),
        ctx.character.postHistoryInstructions ?? "",
        ctx.roomOverrides?.postHistory ?? "",
        ...coSpeakerFieldSources("postHistoryInstructions", ctx),
      ];
    case "char_description":
      return [
        templateFor(section),
        ctx.character.description,
        ...coSpeakerFieldSources("description", ctx),
        ...coSpeakerFieldSources("personality", ctx),
        ...coSpeakerFieldSources("scenario", ctx),
        ...coSpeakerFieldSources("exampleMessages", ctx),
      ];
    case "char_personality":
      return [templateFor(section), ctx.character.personality ?? ""];
    case "scenario":
      return [templateFor(section), ctx.character.scenario ?? "", ctx.roomOverrides?.scenario ?? "", ...coSpeakerFieldSources("scenario", ctx)];
    case "dialogue_examples":
      return [templateFor(section), ctx.character.exampleMessages ?? ""];
  }
}
// biome-ignore-end lint/suspicious/noUnnecessaryConditions: see the matching -start above.

function collectStaticSources(section: PromptSection, ctx: AssembleContext): string[] {
  return section.type === "literal" ? [section.content] : markerStaticSources(section, ctx);
}

/** Pre-render the preset content of every enabled overridable section, memoized by id — renders exactly
 *  once regardless of section order. */
function computeOriginals(config: PromptConfig, ctx: AssembleContext, registry: MacroRegistry): Originals {
  const overridable = config.sections.filter(
    (s): s is TemplatedMarkerSection => s.type === "marker" && s.enabled && (s.marker === "main_prompt" || s.marker === "post_history"),
  );
  if (overridable.length === 0) {
    return EMPTY_ORIGINALS;
  }
  const renderedById = new Map<string, string>();
  for (const s of overridable) {
    renderedById.set(s.id, renderMacros(templateFor(s), ctx, ctx.activePersona, { registry }));
  }
  return { renderedById };
}

const SYNTHETIC_COMPACT_SUMMARY_ID = "__synthetic-compact-summary";

/** PD-140/D25: a compacted chat's summary must reach STATELESS runners even when the active preset omits a
 *  `compact_summary` section (the neo C1 cache-anchor invariant). The assembler — not the preset author —
 *  guarantees delivery: when `ctx.compactSummary` is set and no enabled `compact_summary` section exists,
 *  synthesize one immediately before the `chat_history` pivot (end of section list if there's no pivot). */
function withImplicitCompactSummary(config: PromptConfig, ctx: AssembleContext): PromptConfig {
  if (ctx.compactSummary === null || ctx.compactSummary === undefined || ctx.compactSummary.trim().length === 0) {
    return config;
  }
  const hasSection = config.sections.some((s) => s.type === "marker" && s.marker === "compact_summary" && s.enabled);
  if (hasSection) {
    return config;
  }
  const synthetic: PromptSection = {
    type: "marker",
    id: SYNTHETIC_COMPACT_SUMMARY_ID,
    name: "compact summary (implicit)",
    marker: "compact_summary",
    role: "system",
    enabled: true,
  };
  const pivotIndex = config.sections.findIndex((s) => s.type === "marker" && s.marker === "chat_history");
  const sections = [...config.sections];
  sections.splice(pivotIndex >= 0 ? pivotIndex : sections.length, 0, synthetic);
  return { ...config, sections };
}

function generationTypeBucket(t: GenerationType): GenerationType {
  return t === "regenerate" ? "swipe" : t;
}

/** ST `shouldTrigger`: a section with no trigger always fires; otherwise only when this turn's generation
 *  type matches one of its triggers (alias-normalized). */
function sectionTriggers(section: PromptSection, generationType: GenerationType): boolean {
  const trigger = "trigger" in section ? section.trigger : undefined;
  if (trigger === undefined || trigger.length === 0) {
    return true;
  }
  const turn = generationTypeBucket(generationType);
  return trigger.some((t) => generationTypeBucket(t) === turn);
}

function isSectionDynamic(section: PromptSection): boolean {
  // A trigger-gated section's PRESENCE varies by generation type → it can never live in the cached prefix.
  if ("trigger" in section && section.trigger !== undefined && section.trigger.length > 0) {
    return true;
  }
  if (section.type === "literal") {
    return false;
  }
  return section.marker === "memory" || section.marker === "guided_instruction" || section.marker === "chat_history";
}

/** A section's `in_chat` delivery depth, or null for system-block placement. Precedence: explicit
 *  `inject.depth` \> after the pivot (depth 0) \> non-system role (top of history) \> system block. */
function injectionDepthFor(section: PromptSection, idx: number, pivotIndex: number): number | null {
  if (section.type === "marker" && (section.marker === "chat_history" || section.marker === "world_info_before" || section.marker === "world_info_after")) {
    return null;
  }
  const inject = "inject" in section ? section.inject : undefined;
  if (inject !== undefined) {
    return inject.depth;
  }
  if (pivotIndex >= 0 && idx > pivotIndex) {
    return 0;
  }
  if (section.role !== "system") {
    return BEFORE_HISTORY_DEPTH;
  }
  return null;
}

function freshTrace(ctx: AssembleContext): AssembleTrace {
  const wi = ctx.wiTrace ?? { included: 0, dropped: [], matchedKeys: [], activated: [] };
  const trace: AssembleTrace = {
    staticSections: [],
    dynamicSections: [],
    worldInfoIncluded: wi.included,
    worldInfoDropped: wi.dropped,
    worldInfoActivated: wi.activated.map((e) => ({ id: e.id, keys: e.keys })),
    matchedKeys: wi.matchedKeys,
    compactSummaryIncluded: false,
    memoryIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
  };
  if (ctx.authorsNoteSource !== undefined) {
    trace.overrideSources = { authorsNote: ctx.authorsNoteSource };
  }
  return trace;
}

interface WalkAccum {
  staticParts: string[];
  dynamicParts: string[];
  afterHistory: ChatInjection[];
  cacheBusters: Set<string>;
  /** The per-contribution BUDGET attribution (`assembly/budget`) — every non-empty rendered part, tagged with
   *  the source bucket it lands in. Collected on EVERY build (the walk already holds the text; the tagging is
   *  a map lookup) but returned only by {@link assemblePromptWithSlices}: `AssembledPrompt` is PERSISTED per
   *  variant (`message_variants.promptSnapshot`, D26), and carrying a second copy of the whole prompt there
   *  would double every snapshot row for a host-only debug read. */
  slices: AssemblySlice[];
}

/** Deliver an after-history (`in_chat`) section: render → push to the injection bucket at `depth`. The
 *  splice (SHAPE) frames it; content here is macro-resolved only. */
function pushAfterHistory(section: PromptSection, depth: number, env: BuildEnv, acc: WalkAccum): void {
  const rendered = renderSection(section, env).trim();
  if (rendered.length === 0) {
    return;
  }
  const order = "inject" in section ? section.inject?.order : undefined;
  const injection: ChatInjection = {
    position: "in_chat",
    depth,
    role: section.role,
    content: rendered,
  };
  if (order !== undefined) {
    injection.order = order;
  }
  acc.afterHistory.push(injection);
  env.trace.afterHistorySections.push(section.id);
  pushSlices(section, rendered, env, acc);
}

/** WHO this section's bytes belong to — the budget's per-contributor label. A card section is the roster
 *  MEMBER whose card it renders; the persona marker is the speaking persona; everything else is authored
 *  content with no person behind it, so it keeps the preset section's own name (the same name the prompt
 *  manager shows). Roster vocabulary throughout: members are named, never grouped under a collective noun. */
function sectionLabel(section: PromptSection, ctx: AssembleContext): string {
  if (section.type === "literal") {
    return section.name;
  }
  if (section.marker === "char_personality" || section.marker === "dialogue_examples" || section.marker === "scenario") {
    return ctx.character.name;
  }
  if (section.marker === "persona") {
    return personaLabel(ctx.activePersona?.name);
  }
  return section.name;
}

/** The persona's budget label — the persona's own name, marked so a roster member and the human's persona
 *  can't read as the same kind of contributor in one list. ONE home for the marking (`assembly/budget`), so
 *  a marker-delivered persona description and an at-depth one merge into a single contributor row. */
function personaLabel(name: string | undefined): string {
  return name === undefined || name.trim().length === 0 ? "persona" : personaContributorLabel(name);
}

/** Record a rendered section's budget slices: ONE per contributor. The merged card section splits per roster
 *  member (recorded during its render); every other section is a single contributor. */
function pushSlices(section: PromptSection, rendered: string, env: BuildEnv, acc: WalkAccum): void {
  const source = sectionSource(section);
  const blocks = env.memberBlocks.get(section.id);
  if (blocks === undefined || blocks.length === 0) {
    acc.slices.push({ source, label: sectionLabel(section, env.ctx), text: rendered });
    return;
  }
  for (const block of blocks) {
    acc.slices.push({ source, label: block.name, text: block.text.trim() });
  }
}

/** Scan a static section's source strings for volatile macros (cache-busters) into `busters`. */
function scanStaticBusters(section: PromptSection, ctx: AssembleContext, busters: Set<string>, registry: MacroRegistry): void {
  for (const src of collectStaticSources(section, ctx)) {
    for (const name of findVolatileMacros(src, registry)) {
      busters.add(name);
    }
  }
}

/** Deliver ONE section: after-history injection (depth !== null) OR system-block (static/dynamic). */
function walkSection(section: PromptSection, idx: number, env: BuildEnv, acc: WalkAccum): void {
  const depth = injectionDepthFor(section, idx, env.pivotIndex);
  if (depth !== null) {
    pushAfterHistory(section, depth, env, acc);
    return;
  }
  const dynamic = isSectionDynamic(section);
  if (!dynamic) {
    scanStaticBusters(section, env.ctx, acc.cacheBusters, env.registry);
  }
  const rendered = renderSection(section, env).trim();
  if (rendered.length === 0) {
    return;
  }
  (dynamic ? acc.dynamicParts : acc.staticParts).push(rendered);
  (dynamic ? env.trace.dynamicSections : env.trace.staticSections).push(section.id);
  pushSlices(section, rendered, env, acc);
}

/** Append the non-empty trimmed content of `list` to `target` (with a matching `label` per section),
 *  counting each into the trace + attributing each to its budget source. */
function appendInjections(args: {
  list: readonly ChatInjection[];
  target: string[];
  sections: string[];
  label: string;
  trace: AssembleTrace;
  slices: AssemblySlice[];
}): void {
  for (const inj of args.list) {
    const text = inj.content.trim();
    if (text.length > 0) {
      args.target.push(text);
      args.sections.push(args.label);
      args.trace.chatInjectionsIncluded += 1;
      args.slices.push({ ...injectionSource(inj), text });
    }
  }
}

/** Route the system-block chat injections — content arrives already macro-resolved + role-framed.
 *  `before_prompt` prepends to static, `in_static` appends, `in_prompt` goes dynamic. */
function applySystemInjections(ctx: AssembleContext, trace: AssembleTrace, acc: WalkAccum): void {
  const all = ctx.chatInjections;
  if (all === undefined || all.length === 0) {
    return;
  }
  // before_prompt: prepend as ONE batched block so the caller's array order = the rendered order.
  const before = all.filter((i) => i.position === "before_prompt" && i.content.trim().length > 0);
  const beforeTexts = before.map((i) => i.content.trim());
  if (beforeTexts.length > 0) {
    acc.staticParts.unshift(...beforeTexts);
    trace.chatInjectionsIncluded += beforeTexts.length;
    for (const inj of before) {
      trace.staticSections.unshift("chat-injection:before_prompt");
      acc.slices.push({ ...injectionSource(inj), text: inj.content.trim() });
    }
  }
  appendInjections({
    list: all.filter((i) => i.position === "in_static"),
    target: acc.staticParts,
    sections: trace.staticSections,
    label: "chat-injection:in_static",
    trace,
    slices: acc.slices,
  });
  appendInjections({
    list: all.filter((i) => i.position === "in_prompt"),
    target: acc.dynamicParts,
    sections: trace.dynamicSections,
    label: "chat-injection:in_prompt",
    trace,
    slices: acc.slices,
  });
}

/**
 * Render `config` against `ctx` into the system-prompt halves + the after-history injection bucket. Each
 * enabled section is delivered into the system block or as an `in_chat` injection. Pure.
 */
export function assemblePrompt(rawConfig: PromptConfig, ctx: AssembleContext, registry: MacroRegistry = globalMacroRegistry): AssembledPrompt {
  return assembleWithSlices(rawConfig, ctx, registry).prompt;
}

/**
 * The BUILD product PLUS its per-source budget attribution — the host Preview tab's read (`previewAssembly`).
 * Byte-identical to {@link assemblePrompt} on the prompt half; the slices are the SAME rendered strings, tagged
 * with the `AssemblySource` bucket they land in (`assembly/budget`). Kept off `AssembledPrompt` because that
 * shape is persisted per variant (D26) — see {@link WalkAccum.slices}.
 */
export function assemblePromptWithSlices(
  rawConfig: PromptConfig,
  ctx: AssembleContext,
  registry: MacroRegistry = globalMacroRegistry,
): { prompt: AssembledPrompt; slices: readonly AssemblySlice[] } {
  return assembleWithSlices(rawConfig, ctx, registry);
}

function assembleWithSlices(
  rawConfig: PromptConfig,
  ctx: AssembleContext,
  registry: MacroRegistry,
): { prompt: AssembledPrompt; slices: readonly AssemblySlice[] } {
  const config = withImplicitCompactSummary(rawConfig, ctx);
  const trace = freshTrace(ctx);
  const acc: WalkAccum = {
    staticParts: [],
    dynamicParts: [],
    afterHistory: [],
    cacheBusters: new Set<string>(),
    slices: [],
  };
  const pivotIndex = config.sections.findIndex((s) => s.type === "marker" && s.marker === "chat_history");
  const env: BuildEnv = { ctx, trace, originals: computeOriginals(config, ctx, registry), pivotIndex, registry, memberBlocks: new Map() };

  const pivotSection = pivotIndex >= 0 ? config.sections[pivotIndex] : undefined;
  // Send history unless a chat_history marker is explicitly present AND disabled.
  const sendHistory = !(pivotSection !== undefined && pivotSection.enabled === false);

  const generationType = ctx.generationType ?? "normal";
  config.sections.forEach((section, idx) => {
    if (!section.enabled) {
      return;
    }
    if (section.type === "marker" && section.marker === "chat_history") {
      return;
    }
    if (!sectionTriggers(section, generationType)) {
      return;
    }
    walkSection(section, idx, env, acc);
  });

  applySystemInjections(ctx, trace, acc);

  // The `in_chat` injections never touch the system halves (SHAPE splices them into history), but they ARE
  // part of what the model reads next turn — the rpg state block rides exactly this channel. Account them
  // here, at their pre-splice content: the splice's role framing (`[Note from system: …]`) adds a handful of
  // tokens the estimate doesn't chase (advisory by construction, like every count on this surface).
  for (const inj of ctx.chatInjections ?? []) {
    if (inj.position === "in_chat" && inj.content.trim().length > 0) {
      acc.slices.push({ ...injectionSource(inj), text: inj.content.trim() });
    }
  }

  for (const b of trace.staticCacheBusters) {
    acc.cacheBusters.add(b);
  }
  trace.staticCacheBusters = [...acc.cacheBusters];

  // Post-process the joined system halves per the preset (collapseNewlines). No-op unless the preset opts
  // in — an untouched preset returns byte-identical joins. Idempotent + whitespace-only → cache-safe.
  const pp = config.postProcess;
  return {
    prompt: {
      static: applyAssemblePostProcess(acc.staticParts.join("\n\n"), pp),
      dynamic: applyAssemblePostProcess(acc.dynamicParts.join("\n\n"), pp),
      afterHistory: acc.afterHistory,
      sendHistory,
      trace,
    },
    slices: acc.slices,
  };
}

/**
 * Render ONE section against a real `AssembleContext` — the prompt-manager edit dialog's Preview tab.
 * SIDE-EFFECT FREE: the variable map is cloned so a `{{setvar}}` in the preview can't bleed into the
 * caller's live `variableValues`.
 */
export function previewSection(
  section: PromptSection,
  ctx: AssembleContext,
  config: PromptConfig,
  registry: MacroRegistry = globalMacroRegistry,
): SectionPreview {
  const half: "static" | "dynamic" = isSectionDynamic(section) ? "dynamic" : "static";
  const trace = freshTrace(ctx);
  if (!section.enabled) {
    return { rendered: "", half, trace };
  }
  const previewCtx: AssembleContext = { ...ctx, variableValues: { ...(ctx.variableValues ?? {}) } };
  const env: BuildEnv = {
    ctx: previewCtx,
    trace,
    originals: computeOriginals(config, previewCtx, registry),
    pivotIndex: -1,
    registry,
    memberBlocks: new Map(),
  };
  return { rendered: renderSection(section, env), half, trace };
}
