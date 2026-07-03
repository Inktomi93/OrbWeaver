// domain/chat/assembly/assemble — the BUILD section walk. Render a reorderable `PromptConfig` against the immutable `AssembleContext` into the STATIC
// (cache-stable) + DYNAMIC (per-turn) system-prompt halves + the after-history injection bucket. Pure: no
// DB, no infra — context.ts loads the data and passes it in (`AssembleContext`), keeping this unit-testable
// and reusable by a client preview.
//
// THE ORDER: per section `macro → frame`, macros BEFORE framing (the WI per-entry
// `regex(WORLD_INFO)` ran upstream in context.ts's WI→injection conversion, NOT here). Render ONCE — every
// section renders through `renderMacros` exactly once (the two overridable slots memoize their preset render
// in `computeOriginals` so a `{{original}}`-wrapping card doesn't double-fire side-effect macros).
//
// `chat_history` is the PIVOT: sections before it build the system block; sections after it are delivered as
// `in_chat` injections AFTER the conversation (the runner/SHAPE splices history at the pivot).
//
// {{user}} resolves DIFFERENTLY by section origin (the dual-persona rule):
//   • CARD-derived sections (char_*, post_history, scenario) → the PINNED ("anchor") persona, so a mid-chat
//     persona switch never retroactively rewrites the card's {{user}} references.
//   • USER-authored sections (literal blocks, the persona marker, host room overrides) → the ACTIVE persona.
//
// THE SYSTEM-BLOCK CHAT INJECTIONS (before_prompt/in_static/in_prompt on `ctx.chatInjections`) arrive
// ALREADY macro-resolved + role-framed (context.ts's ONE injection list — render once); this walk emits them
// verbatim. `in_chat` injections are the SHAPE splice's job (not handled here).
//
// FLAG[assemble-post-process]: neo applied `applyAssemblePostProcess` to the joined halves. That helper's
// home is `@orb/server/kit/post-process` — NOT yet built (it lands with RECEIVE).
// This chunk returns the raw `\n\n`-joined halves; the post-process pass is wired when that kit lands.

import type {
  AssembleCharacter,
  AssembleContext,
  AssembledPrompt,
  AssembleTrace,
  ChatInjection,
  SectionPreview,
} from "@orb/contracts/chat";
import type { GenerationType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import { globalMacroRegistry } from "@orb/kit/macro";
import { normalizeExampleStart } from "@orb/kit/speaker-label";
import { renderMacros } from "./macros";

// ── Volatile-macro detection (the static-half cache-buster scan) ──────────────────────────────────────
// A macro whose value changes per render busts the cached static prefix. Derived from the kit registry's
// `volatile: true` flag (set at registration) so a new volatile handler extends this set automatically.
// `/a^/` is unsatisfiable (top-level so it isn't re-compiled per call).
const NO_VOLATILE_RE = /a^/u;
let volatileMacroReCache: RegExp | undefined;
function volatileMacroRe(): RegExp {
  if (volatileMacroReCache === undefined) {
    const names = globalMacroRegistry.volatileNames();
    volatileMacroReCache =
      names.length === 0 ? NO_VOLATILE_RE : new RegExp(`\\{\\{#?(${names.join("|")})\\b`, "giu");
  }
  return volatileMacroReCache;
}

/** The volatile macro names present in `text` (source-template scan — macros are resolved before they'd
 *  reach the static half, so a post-render scan is impossible). */
function findVolatileMacros(text: string | null | undefined): string[] {
  if (text === null || text === undefined || text.length === 0) {
    return [];
  }
  const hits = new Set<string>();
  for (const m of text.matchAll(volatileMacroRe())) {
    if (m[1] !== undefined) {
      hits.add(m[1].toLowerCase());
    }
  }
  return [...hits];
}

type MarkerSection = Extract<PromptSection, { type: "marker" }>;
type TemplatedMarkerSection = Extract<
  MarkerSection,
  { marker: keyof typeof DEFAULT_MARKER_TEMPLATES }
>;

/** The template for a templated marker — caller override wins, else the shipped default framing. Empty
 *  string is a valid override ("render nothing"). */
function templateFor(section: TemplatedMarkerSection): string {
  return section.template ?? DEFAULT_MARKER_TEMPLATES[section.marker];
}

/** Memoized preset render of each overridable section's PRESET `template`, keyed by section id — so the
 *  preset renders ONCE per assembly (a `{{original}}`-wrapping card re-uses the memo). */
interface Originals {
  renderedById: Map<string, string>;
}
const EMPTY_ORIGINALS: Originals = { renderedById: new Map() };

/** The shared per-assembly render bundle threaded through the section/marker arms (keeps each render fn
 *  under the 4-param cap). `pivotIndex` is the `chat_history` position (the after-history boundary). */
interface BuildEnv {
  readonly ctx: AssembleContext;
  readonly trace: AssembleTrace;
  readonly originals: Originals;
  readonly pivotIndex: number;
}

/** A room/card override "counts" only with NON-whitespace content — blank means "inherit," not "override
 *  with emptiness." */
function overrideSet(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ── Merged co-speaker cards (cardScope: "merged" — Part III §7) ────────────────────────────────────────
// The merge-eligible per-member card fields, declared as a tuple (§7.5 — no inline string-literal union).
const MEMBER_FIELDS = [
  "description",
  "personality",
  "scenario",
  "exampleMessages",
  "systemPrompt",
  "postHistoryInstructions",
] as const;
type MemberField = (typeof MEMBER_FIELDS)[number];

/** Hard cap on the concatenated merged-fallback value (chars) — bounds the room-override `{{original}}`
 *  blowup when many present members each carry a long field. */
const MERGED_FALLBACK_CAP = 4000;

/** Render ONE member's card field with `{{char}}` bound to THAT member and `{{user}}` to the room anchor
 *  (pinned persona). The member sub-context drops the room tier so a member-field `{{scenario}}` binds to the
 *  member's own value. `exampleMessages` is `<START>`-normalized so a member's example chain begins fresh. */
function renderMemberField(
  field: MemberField,
  member: AssembleCharacter,
  ctx: AssembleContext,
): string {
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
  const rendered = renderMacros(raw, sub, ctx.pinnedPersona);
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

/** The room-override SCOPE FALLBACK (Part III §9): the value a room override inherits / `{{original}}`
 *  recovers, + whether it merged the present cast. Solo/scoped collapses to `activeValue` (byte-identical). */
function resolveScopeFallback(
  field: MemberField,
  ctx: AssembleContext,
  activeValue: string,
): { value: string; merged: boolean } {
  const co = ctx.coSpeakers;
  if (co === undefined || co.length === 0) {
    return { value: activeValue, merged: false };
  }
  const parts = dedupeNonEmpty([activeValue, ...co.map((m) => renderMemberField(field, m, ctx))]);
  const joined = parts.join("\n\n");
  const value = joined.length > MERGED_FALLBACK_CAP ? joined.slice(0, MERGED_FALLBACK_CAP) : joined;
  return { value, merged: true };
}

/** The merged co-speakers' card block (ST APPEND), appended after the active character's description.
 *  Empty (scoped / solo / no co-speakers) → "" (byte-identical to the single-card render). */
function renderCoSpeakers(ctx: AssembleContext): string {
  const co = ctx.coSpeakers;
  if (co === undefined || co.length === 0) {
    return "";
  }
  return co
    .map((m) => {
      const head = [
        renderMemberField("description", m, ctx),
        renderMemberField("personality", m, ctx),
      ]
        .filter((s) => s.trim().length > 0)
        .join("\n");
      if (head.trim().length === 0) {
        return "";
      }
      const parts = [`[Also present — ${m.name}]\n${head}`];
      const scenario = renderMemberField("scenario", m, ctx);
      const examples = renderMemberField("exampleMessages", m, ctx);
      if (scenario.trim().length > 0) {
        parts.push(`[${m.name}'s scenario]\n${scenario}`);
      }
      if (examples.trim().length > 0) {
        parts.push(`[${m.name}'s example dialogue]\n${examples}`);
      }
      return parts.join("\n\n");
    })
    .filter((b) => b.length > 0)
    .join("\n\n");
}

// ── The two overridable markers (room > card > preset) ─────────────────────────────
const MERGED_CACHE_BUSTER = "merged-present-cast";

function recordMergedCacheBuster(trace: AssembleTrace): void {
  if (!trace.staticCacheBusters.includes(MERGED_CACHE_BUSTER)) {
    trace.staticCacheBusters.push(MERGED_CACHE_BUSTER);
  }
}

function recordOverrideSource(
  trace: AssembleTrace,
  field: keyof NonNullable<AssembleTrace["overrideSources"]>,
  source: string | undefined,
): void {
  if (source === undefined) {
    return;
  }
  trace.overrideSources ??= {};
  trace.overrideSources[field] = source;
}

/** The label for a room-overrideable slot ("room override" / "merged (present cast)" / "from <name>" /
 *  absent). One params object so it stays under the 4-param cap. */
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
  const { ctx, originals } = env;
  const cardOverride = ctx.character[cardField];
  const preset =
    originals.renderedById.get(section.id) ??
    renderMacros(templateFor(section), ctx, ctx.activePersona);
  const afterCard =
    overrideSet(cardOverride) && section.forbidCharacterOverride !== true
      ? renderMacros(cardOverride, ctx, ctx.pinnedPersona, preset)
      : preset;
  const fallback = resolveScopeFallback(cardField, ctx, afterCard);
  if (overrideSet(roomOverride) && section.forbidRoomOverride !== true) {
    return {
      text: renderMacros(roomOverride, ctx, ctx.activePersona, fallback.value),
      merged: fallback.merged,
    };
  }
  return { text: fallback.value, merged: fallback.merged };
}

// ── Per-marker render arms (split out so `renderMarker` stays under the complexity gate) ────────────────

function renderOverridableMarker(
  section: TemplatedMarkerSection,
  marker: "main_prompt" | "post_history",
  env: BuildEnv,
): string {
  const { ctx, trace } = env;
  const cardField = marker === "main_prompt" ? "systemPrompt" : "postHistoryInstructions";
  const room =
    marker === "main_prompt" ? ctx.roomOverrides?.mainPrompt : ctx.roomOverrides?.postHistory;
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
  const active = renderMacros(templateFor(section), ctx, ctx.pinnedPersona);
  const { value, merged } = resolveScopeFallback("scenario", ctx, active);
  if (value.trim().length === 0) {
    return "";
  }
  const inheritedLabel = merged ? "merged (present cast)" : `from ${ctx.character.name}`;
  recordOverrideSource(trace, "scenario", overrideSet(room) ? "room override" : inheritedLabel);
  if (merged) {
    recordMergedCacheBuster(trace);
  }
  return value;
}

/** The ctx field + trace flag for each server-injected marker (avoids a nested ternary). */
function serverMarkerValue(
  marker: "compact_summary" | "memory" | "guided_instruction",
  ctx: AssembleContext,
): string | null | undefined {
  if (marker === "compact_summary") {
    return ctx.compactSummary;
  }
  if (marker === "memory") {
    return ctx.memory;
  }
  return ctx.guidedInstruction;
}

function markServerInclude(
  marker: "compact_summary" | "memory" | "guided_instruction",
  trace: AssembleTrace,
): void {
  if (marker === "compact_summary") {
    trace.compactSummaryIncluded = true;
  } else if (marker === "memory") {
    trace.memoryIncluded = true;
  } else {
    trace.guidedInstructionIncluded = true;
  }
}

function renderServerMarker(
  section: TemplatedMarkerSection,
  marker: "compact_summary" | "memory" | "guided_instruction",
  env: BuildEnv,
): string {
  const value = serverMarkerValue(marker, env.ctx);
  if (value === null || value === undefined || value.trim().length === 0) {
    return "";
  }
  markServerInclude(marker, env.trace);
  return renderMacros(templateFor(section), env.ctx, env.ctx.activePersona);
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
      const active = renderMacros(templateFor(section), ctx, ctx.pinnedPersona);
      const co = renderCoSpeakers(ctx);
      if (co.trim().length > 0) {
        recordMergedCacheBuster(trace);
      }
      return [active, co].filter((s) => s.trim().length > 0).join("\n\n");
    }
    case "char_personality":
      return ctx.character.personality
        ? renderMacros(templateFor(section), ctx, ctx.pinnedPersona)
        : "";
    case "dialogue_examples":
      return ctx.character.exampleMessages
        ? renderMacros(templateFor(section), ctx, ctx.pinnedPersona)
        : "";
    case "persona":
      // Emits ONLY when the active persona's description placement is in_prompt (else it rode an
      // injection, or nowhere — the single-placement rule that makes double-injection impossible).
      return ctx.activePersona && ctx.personaMarkerActive !== false
        ? renderMacros(templateFor(section), ctx, ctx.activePersona)
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
  return section.type === "literal"
    ? renderMacros(section.content, env.ctx, env.ctx.activePersona)
    : renderMarker(section, env);
}

// ── Static cache-buster source scan ────────────────────────────────────────────────────────────────────
function coSpeakerFieldSources(field: MemberField, ctx: AssembleContext): string[] {
  const co = ctx.coSpeakers;
  return co === undefined ? [] : co.map((m) => m[field] ?? "");
}

/** The source strings (pre-render) feeding a STATIC marker — split out so `collectStaticSources` stays
 *  under the complexity gate. */
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
      return [
        templateFor(section),
        ctx.character.systemPrompt ?? "",
        ctx.roomOverrides?.mainPrompt ?? "",
        ...coSpeakerFieldSources("systemPrompt", ctx),
      ];
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
      return [
        templateFor(section),
        ctx.character.scenario ?? "",
        ctx.roomOverrides?.scenario ?? "",
        ...coSpeakerFieldSources("scenario", ctx),
      ];
    case "dialogue_examples":
      return [templateFor(section), ctx.character.exampleMessages ?? ""];
  }
}
// biome-ignore-end lint/suspicious/noUnnecessaryConditions: see the matching -start above.

function collectStaticSources(section: PromptSection, ctx: AssembleContext): string[] {
  return section.type === "literal" ? [section.content] : markerStaticSources(section, ctx);
}

/** Pre-render the PRESET content of every enabled overridable section, memoized by id — so the preset
 *  template renders EXACTLY ONCE (the `{{original}}` source) regardless of section order. */
function computeOriginals(config: PromptConfig, ctx: AssembleContext): Originals {
  const overridable = config.sections.filter(
    (s): s is TemplatedMarkerSection =>
      s.type === "marker" &&
      s.enabled &&
      (s.marker === "main_prompt" || s.marker === "post_history"),
  );
  if (overridable.length === 0) {
    return EMPTY_ORIGINALS;
  }
  const renderedById = new Map<string, string>();
  for (const s of overridable) {
    renderedById.set(s.id, renderMacros(templateFor(s), ctx, ctx.activePersona));
  }
  return { renderedById };
}

// ── Section routing (static vs dynamic vs after-history) ────────────────────────────────────────────────
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
  return (
    section.marker === "memory" ||
    section.marker === "guided_instruction" ||
    section.marker === "chat_history"
  );
}

/** A relative non-system section is delivered at the TOP of history (before the conversation). The splice
 *  clamps this large depth to history length. */
const BEFORE_HISTORY_DEPTH = Number.MAX_SAFE_INTEGER;

/** A section's `in_chat` delivery depth, or null for system-block placement. Precedence: explicit
 *  `inject.depth` \> after the pivot (depth 0) \> non-system role (top of history) \> system block. */
function injectionDepthFor(section: PromptSection, idx: number, pivotIndex: number): number | null {
  if (
    section.type === "marker" &&
    (section.marker === "chat_history" ||
      section.marker === "world_info_before" ||
      section.marker === "world_info_after")
  ) {
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
  // biome-ignore lint/suspicious/noUnnecessaryConditions: `wiTrace` is optional (`?:`); biome's optional-
  // chain inference wrongly treats the `?? fallback` as redundant (tsc requires it — same false-positive
  // family as the -start block above + credentials/substrate/parse-metadata.ts).
  const wi = ctx.wiTrace ?? { included: 0, dropped: [], matchedKeys: [] };
  const trace: AssembleTrace = {
    staticSections: [],
    dynamicSections: [],
    worldInfoIncluded: wi.included,
    worldInfoDropped: wi.dropped,
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
}

/** Deliver an after-history (`in_chat`) section: render → push to the injection bucket at `depth`. The
 *  splice (SHAPE) frames it; content here is macro-resolved only. */
function pushAfterHistory(
  section: PromptSection,
  depth: number,
  env: BuildEnv,
  acc: WalkAccum,
): void {
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
}

/** Scan a static section's source strings for volatile macros (cache-busters) into `busters`. */
function scanStaticBusters(
  section: PromptSection,
  ctx: AssembleContext,
  busters: Set<string>,
): void {
  for (const src of collectStaticSources(section, ctx)) {
    for (const name of findVolatileMacros(src)) {
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
    scanStaticBusters(section, env.ctx, acc.cacheBusters);
  }
  const rendered = renderSection(section, env).trim();
  if (rendered.length === 0) {
    return;
  }
  (dynamic ? acc.dynamicParts : acc.staticParts).push(rendered);
  (dynamic ? env.trace.dynamicSections : env.trace.staticSections).push(section.id);
}

/** Append the non-empty trimmed content of `list` to `target` (with a matching `label` per section),
 *  counting each into the trace. One params object keeps it under the 4-param cap. */
function appendInjections(args: {
  list: readonly ChatInjection[];
  target: string[];
  sections: string[];
  label: string;
  trace: AssembleTrace;
}): void {
  for (const inj of args.list) {
    const text = inj.content.trim();
    if (text.length > 0) {
      args.target.push(text);
      args.sections.push(args.label);
      args.trace.chatInjectionsIncluded += 1;
    }
  }
}

/** Route the system-block chat injections — content arrives ALREADY macro-resolved + role-framed from
 *  context.ts (the ONE injection list). `before_prompt` PREPEND to static, `in_static` APPEND, `in_prompt`
 *  → dynamic. `in_chat` is the SHAPE splice's job (not handled here). */
function applySystemInjections(ctx: AssembleContext, trace: AssembleTrace, acc: WalkAccum): void {
  const all = ctx.chatInjections;
  if (all === undefined || all.length === 0) {
    return;
  }
  // before_prompt: prepend as ONE batched block so the caller's array order = the rendered order.
  const beforeTexts = all
    .filter((i) => i.position === "before_prompt")
    .map((i) => i.content.trim())
    .filter((t) => t.length > 0);
  if (beforeTexts.length > 0) {
    acc.staticParts.unshift(...beforeTexts);
    trace.chatInjectionsIncluded += beforeTexts.length;
    for (const _t of beforeTexts) {
      trace.staticSections.unshift("chat-injection:before_prompt");
    }
  }
  appendInjections({
    list: all.filter((i) => i.position === "in_static"),
    target: acc.staticParts,
    sections: trace.staticSections,
    label: "chat-injection:in_static",
    trace,
  });
  appendInjections({
    list: all.filter((i) => i.position === "in_prompt"),
    target: acc.dynamicParts,
    sections: trace.dynamicSections,
    label: "chat-injection:in_prompt",
    trace,
  });
}

/**
 * Render `config` against `ctx` into the system-prompt halves + the after-history injection bucket. Each
 * enabled section is delivered into the system block (static/dynamic via `isSectionDynamic`) or as an
 * `in_chat` injection (after the `chat_history` pivot, or with an explicit `inject`/non-system role).
 * Disabled sections and empty renders skip. Pure (SHAPE consumes the immutable result).
 */
export function assemblePrompt(config: PromptConfig, ctx: AssembleContext): AssembledPrompt {
  const trace = freshTrace(ctx);
  const acc: WalkAccum = {
    staticParts: [],
    dynamicParts: [],
    afterHistory: [],
    cacheBusters: new Set<string>(),
  };
  const pivotIndex = config.sections.findIndex(
    (s) => s.type === "marker" && s.marker === "chat_history",
  );
  const env: BuildEnv = { ctx, trace, originals: computeOriginals(config, ctx), pivotIndex };

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

  for (const b of trace.staticCacheBusters) {
    acc.cacheBusters.add(b);
  }
  trace.staticCacheBusters = [...acc.cacheBusters];

  // FLAG[assemble-post-process]: raw join (the post-process kit lands with RECEIVE — header note).
  return {
    static: acc.staticParts.join("\n\n"),
    dynamic: acc.dynamicParts.join("\n\n"),
    afterHistory: acc.afterHistory,
    sendHistory,
    trace,
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
    originals: computeOriginals(config, previewCtx),
    pivotIndex: -1,
  };
  return { rendered: renderSection(section, env), half, trace };
}
