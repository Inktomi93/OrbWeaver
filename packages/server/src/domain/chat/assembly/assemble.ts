// domain/chat/assembly/assemble — the BUILD section walk. Render a reorderable `PromptConfig` against the
// immutable `AssembleContext` into the static (cache-stable) + dynamic (per-turn) system-prompt halves +
// the after-history injection bucket. Pure: no DB, no infra — context.ts loads the data and passes it in.
//
// `chat_history` is the pivot: sections before it build the system block; sections after it are delivered
// as `in_chat` injections after the conversation. `{{user}}` resolves differently by section origin:
// card-derived sections use the pinned ("anchor") persona; user-authored sections use the active persona.
//
// THE SAME ORIGIN SPLIT GOVERNS `{{char}}`, and it is an INVARIANT this file can be read against:
// **every `pinnedPersona` render binds against a `{kind:"single"}` speaker** — `env.cardCtx` for the primary
// member's fields ({@link cardOwnerCtx}), `renderMemberField`'s per-member sub-ctx for a co-speaker's. Card
// text is written BY a character's author ABOUT that character, so `{{char}}` in it means "me" regardless of
// what the turn is voicing. Every `activePersona` render is preset/host/user-authored and keeps the TURN's
// speaker arm, which is where `{{char}}`-as-all-seated-characters belongs (the main-prompt framing "You are {{char}}").
// The invariant was violated once, in exactly one direction: co-speakers were rebound and the primary was
// not, so a narrator round leaked all the seated characters into the primary's own description.
//
// The system-block chat injections arrive already macro-resolved + role-framed from context.ts; this walk
// emits them verbatim. `in_chat` injections are the SHAPE splice's job.
//
// The rendered system halves run through the ASSEMBLE post-process pass (`applyAssemblePostProcess`, keyed
// to the preset's `postProcess` block) after the section/injection walk, before the caller's cache split —
// the transform is idempotent and only reorders whitespace, so it never busts the static-cache prefix.

import type { AssembleCharacter, AssembleContext, AssembledPrompt, AssemblePersona, AssembleTrace, ChatInjection, SectionPreview } from "@orb/contracts/chat";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES, NARRATOR_MAIN_PROMPT_TEMPLATE } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { MacroRegistry } from "@orb/kit/macro";
import { globalMacroRegistry } from "@orb/kit/macro";
import { normalizeExampleStart } from "@orb/kit/speaker-label";
import type { PostProcessConfig } from "@orb/server/kit/post-process";
import { applyAssemblePostProcess } from "@orb/server/kit/post-process";
import type { AssemblySlice } from "../contract/results.ts";
import { injectionSource, personaContributorLabel, sectionSource } from "./budget.ts";
import { BEFORE_HISTORY_DEPTH } from "./injections.ts";
import { renderMacros } from "./macros.ts";
import { hasActiveMarker, sectionTriggers } from "./sections.ts";

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

/**
 * The template for a templated marker — caller override wins, else the shipped default framing.
 *
 * The `main_prompt` DEFAULT is MODE-AWARE, and this is its ONE resolution home. A narrator round is one
 * generation voicing all the seated characters and the world around them, which the per-speaker default does
 * not say, so it takes the narrator sibling (`{{char}}` bound to the JOINED member names). A per-speaker merged
 * turn's system block is the whole roster for every speaker: it keeps the single default with `{{char}}` bound to
 * the roster, so a room of one reads the same bytes it always did. Keyed on the speaker arm: the SHAPE already
 * decided what this turn voices, so nothing here re-derives it from `cardScope`/`isGroup`.
 *
 * A caller `template` is checked FIRST and is one stored text for both kinds: a host who writes the framing
 * owns the whole slot, on every turn (row 52 — the per-section override IS the edit path, so there is no
 * per-mode override to consult).
 */
/** The `main_prompt` default per speaker arm — a mapped Record, so a new arm fails `tsc` here. */
const MAIN_PROMPT_BY_SPEAKER: Record<NonNullable<AssembleContext["speaker"]>["kind"], string> = {
  single: DEFAULT_MARKER_TEMPLATES.main_prompt,
  "multi-voice": NARRATOR_MAIN_PROMPT_TEMPLATE,
  // The single default, `{{char}}` bound to the whole roster: a room of one renders today's bytes exactly.
  roster: DEFAULT_MARKER_TEMPLATES.main_prompt,
};

function templateFor(section: TemplatedMarkerSection, ctx: AssembleContext): string {
  if (section.template !== undefined) {
    return section.template;
  }
  if (section.marker !== "main_prompt") {
    return DEFAULT_MARKER_TEMPLATES[section.marker];
  }
  return ctx.speaker === undefined ? MAIN_PROMPT_BY_SPEAKER.single : MAIN_PROMPT_BY_SPEAKER[ctx.speaker.kind];
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
  /** The ctx every CARD-DERIVED render binds against — see {@link cardOwnerCtx}. Identical to `ctx` by
   *  REFERENCE on every non-narrator turn, so nothing outside a narrator round can change bytes. */
  readonly cardCtx: AssembleContext;
  /** The MERGED card section's per-roster-member split, keyed by section id — recorded during the render
   *  (only the render knows which bytes are whose) and read back by the budget walk, so the Preview tab can
   *  say what EACH member in the room costs instead of one opaque "cards" total. Empty for every other
   *  section: they have exactly one contributor. */
  readonly memberBlocks: Map<string, readonly { name: string; text: string }[]>;
  /** The preset's `postProcess` block — the SAME config the two joined system halves are transformed with, so
   *  a system-half budget slice can be priced on the bytes that are actually SENT (see {@link pushSlices}). */
  readonly postProcess: PostProcessConfig | undefined;
}

/**
 * The ctx a CARD-DERIVED render binds `{{char}}` against: the card's OWN owner, never the turn's speaker arm.
 *
 * A card's description/personality/scenario/examples/systemPrompt is written BY that character's author ABOUT
 * that character — `{{char}}` inside it means "me". That is already true for co-speakers, whose fields render
 * through {@link renderMemberField}'s `{kind:"single", character: member}` sub-ctx; the PRIMARY member's
 * fields had no such rebind, so the narrator arm's `{kind:"multi-voice"}` speaker leaked the joined member names into them
 * ("Charlotte, JFC is a tired archivist" for a card that reads `{{char}} is a tired archivist`). The
 * asymmetry was the defect: one member of the same merged section rendered under a different rule than the
 * rest of it.
 *
 * PRESET/HOST-authored text is NOT card-derived and keeps the turn's arm — the main-prompt framing
 * (`You are {{char}}`) is precisely where `{{char}}`-as-all-seated-characters is the point. The split follows the persona axis this file
 * already routes on: a `pinnedPersona` render is card-derived, an `activePersona` render is user/preset-authored.
 *
 * WHAT THE TWO PERSONAS ARE (owner-stated, and the reason the axis is shaped this way — the WHICH-PERSONA
 * half of the same split, where the rule above is the WHICH-TEXT half):
 *   · `pinnedPersona` — the human a CARD's `{{user}}` references resolve to: the player who opened the chat,
 *     or in a multi-human room whichever player the HOST anchored (`chats.anchorPersonaId`, host-only via
 *     `setChatAnchorPersona`). Resolved once in `assembly/context.ts` as `personas.anchor ?? personas.active`,
 *     so card text keeps naming the same person for everyone reading it, whoever is currently speaking.
 *   · `activePersona` — the human a PRESET's `{{user}}` resolves to: the room's anchor human, with the persona
 *     their seat holds NOW (D122 as amended; the presser only on an impersonate draft).
 * Persona pinning is OWNER-SACRED (its concept and mechanics are not a lane's to redesign). `cardOwnerCtx`
 * below rebinds only `speaker`; it must never touch either persona field, or a card starts addressing the
 * wrong human.
 *
 * Returned BY REFERENCE unless the arm is `multi-voice`, so every solo and per-speaker turn is byte-identical.
 */
function cardOwnerCtx(ctx: AssembleContext): AssembleContext {
  return ctx.speaker === undefined || ctx.speaker.kind === "single" ? ctx : { ...ctx, speaker: { kind: "single", character: ctx.character } };
}

/** A room/card override "counts" only with non-whitespace content — blank means "inherit." */
function overrideSet(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// The merge-eligible per-member card fields, declared as a tuple.
const MEMBER_FIELDS = ["description", "personality", "scenario", "exampleMessages", "systemPrompt", "postHistoryInstructions"] as const;
type MemberField = (typeof MEMBER_FIELDS)[number];

/** Hard cap on the concatenated merged-fallback value, in CODE POINTS — bounds the room-override
 *  `{{original}}` blowup when many present members each carry a long field. */
const MERGED_FALLBACK_CAP = 4000;

/** The separator between merged member contributions (counted against {@link MERGED_FALLBACK_CAP}). */
const MERGED_JOIN = "\n\n";

/** Render ONE member's card field with `{{char}}` bound to that member and `{{user}}` to the room anchor.
 *  `exampleMessages` is `<START>`-normalized so a member's example chain begins fresh.
 *
 *  EMPTINESS IS DECIDED ON THE RENDERED VALUE, BEFORE NORMALIZATION (#436). A field that is non-blank at
 *  source but resolves to whitespace is a contribution of nothing — but `normalizeExampleStart` prepends
 *  `<START>`, so normalizing first made that nothing look non-empty and shipped `[X's example dialogue]`
 *  over a bare `<START>`. Every other field (scenario above all) already emitted nothing from the identical
 *  input because it has no post-render step; checking the render, not the raw, is what makes the two agree. */
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
  if (rendered.trim().length === 0) {
    return "";
  }
  return field === "exampleMessages" ? normalizeExampleStart(rendered) : rendered;
}

/** ONE contributor's share of a merged fallback: whose card the bytes are, and the bytes. */
interface MergedContribution {
  readonly name: string;
  readonly text: string;
}

/** Drop empties + duplicates, preserving first-seen order. Keyed on the TEXT (two members with identical card
 *  text contribute once, attributed to the first), because the value is a prompt, not a roster. */
function dedupeNonEmpty(parts: readonly MergedContribution[]): MergedContribution[] {
  const seen = new Set<string>();
  const out: MergedContribution[] = [];
  for (const p of parts) {
    const t = p.text.trim();
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push({ name: p.name, text: t });
    }
  }
  return out;
}

/**
 * Split {@link MERGED_FALLBACK_CAP} across the contributions and cut each on CODE POINTS.
 *
 * Two defects lived in the `joined.slice(0, CAP)` this replaces. (1) A UTF-16 cut can land BETWEEN a surrogate
 * pair and ship a lone surrogate into the prompt — any emoji or non-BMP script in a card reaches the cut.
 * (2) The cut was positional, so ONE long first member consumed the entire budget and every later member's
 * card contributed literally nothing, while the trace said only `merged: true`.
 *
 * The allocation is WATER-FILLING: every contributor is offered an equal share, contributors that need less
 * than their share release the surplus to the rest, and that repeats until nothing more is released. A short
 * member is therefore never cut to make room for a long one, and a long one is cut only against members that
 * actually want the space. Under the cap the result is byte-identical to the plain join (every contribution is
 * offered more than it needs and takes all of it), which is the overwhelming case.
 *
 * `truncated` names the contributors that were cut — the fact a host needs when their card's prose is not in
 * the prompt and the trace otherwise only says "merged".
 */
function allocateMergedFallback(parts: readonly MergedContribution[], cap: number): { texts: string[]; truncated: string[] } {
  const points = parts.map((p) => [...p.text]);
  const separators = Math.max(parts.length - 1, 0) * MERGED_JOIN.length;
  const budget = Math.max(cap - separators, 0);
  if (points.reduce((n, c) => n + c.length, 0) <= budget) {
    return { texts: parts.map((p) => p.text), truncated: [] };
  }
  const shares = points.map(() => 0);
  let open = points.map((_, i) => i);
  let remaining = budget;
  while (open.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) {
      break;
    }
    const satisfied = open.filter((i) => (points[i]?.length ?? 0) <= share);
    if (satisfied.length === 0) {
      // Nobody releases surplus — everyone still open is longer than the even share, so they all take it.
      for (const i of open) {
        shares[i] = share;
        remaining -= share;
      }
      open = [];
      break;
    }
    for (const i of satisfied) {
      const need = points[i]?.length ?? 0;
      shares[i] = need;
      remaining -= need;
    }
    open = open.filter((i) => !satisfied.includes(i));
  }
  const texts = points.map((cp, i) => cp.slice(0, shares[i] ?? 0).join(""));
  const truncated = parts.flatMap((p, i) => ((shares[i] ?? 0) < (points[i]?.length ?? 0) ? [p.name] : []));
  return { texts, truncated };
}

/** The room-override scope fallback: the value a room override inherits / `{{original}}` recovers, whether it
 *  merged the present characters, and WHO got cut to fit the cap. Solo/scoped collapses to `activeValue`.
 *  Consumed only by the two `{{original}}`-templated overridable markers, never the scenario marker (that
 *  would double-emit it). */
function resolveScopeFallback(
  field: MemberField,
  ctx: AssembleContext,
  activeValue: string,
  registry: MacroRegistry,
): { value: string; merged: boolean; truncated: readonly string[] } {
  const co = ctx.coSpeakers;
  if (co === undefined || co.length === 0) {
    return { value: activeValue, merged: false, truncated: [] };
  }
  const contributions = dedupeNonEmpty([
    { name: ctx.character.name, text: activeValue },
    ...co.map((m) => ({ name: m.name, text: renderMemberField(field, m, ctx, registry) })),
  ]);
  const allocated = allocateMergedFallback(contributions, MERGED_FALLBACK_CAP);
  return { value: allocated.texts.join(MERGED_JOIN), merged: true, truncated: allocated.truncated };
}

/** ONE present roster member's merged card block, or "" when they contribute nothing. */
function renderCoSpeakerBlock(member: AssembleCharacter, ctx: AssembleContext, registry: MacroRegistry): string {
  const head = [renderMemberField("description", member, ctx, registry), renderMemberField("personality", member, ctx, registry)]
    .filter((s) => s.trim().length > 0)
    .join("\n");
  if (head.trim().length === 0) {
    return "";
  }
  // The three headings are PROSE-1 slots (PRESET-homed since the F4 re-home) carrying the `{{name}}` pre-
  // substitution token; the card text beneath each is data, never authorable. Absent overrides ⇒ the
  // shipped frames.
  const heading = (id: ProseSlotId): string => resolveProseText(id, ctx.prose ?? {}, { name: member.name });
  const parts = [`${heading("chat.group.characterHeading")}\n${head}`];
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

/** ONE other present human's people-block entry: the `chat.group.personaHeading` frame, then the description
 *  rendered against THAT persona (its `{{user}}` is its own name). Only an `in_prompt` description rides the
 *  block — `at_depth` rode its own injection and `none` opted out — but the heading always stays, so the model
 *  can map a row label to a person. */
function renderPersonEntry(person: AssemblePersona, ctx: AssembleContext, registry: MacroRegistry): string {
  const heading = resolveProseText("chat.group.personaHeading", ctx.prose ?? {}, { name: person.name });
  if (person.placement !== undefined && person.placement.kind !== "in_prompt") {
    return heading;
  }
  const description = renderMacros(person.description, ctx, person, { registry }).trim();
  return description.length === 0 ? heading : `${heading}\n${description}`;
}

/** The `persona` marker. The voice part (the marker template against the voice persona) emits ONLY when its
 *  description placement is in_prompt — else it rode an injection, or nowhere: the single-placement rule that
 *  makes double-injection impossible. With other present humans the marker is the people block, kept PER
 *  PERSON so the budget names each one: the voice part unheaded and first, then every other human's entry in
 *  join order. Position alone marks who `{{user}}` is; no people is today's solo render, byte for byte. */
function renderPersonaMarker(section: TemplatedMarkerSection, env: BuildEnv): string {
  const { ctx, registry } = env;
  const voice = ctx.activePersona && ctx.personaMarkerActive !== false ? renderMacros(templateFor(section, ctx), ctx, ctx.activePersona, { registry }) : "";
  if (ctx.people === undefined || ctx.people.length === 0) {
    return voice;
  }
  const blocks = [
    { name: personaLabel(ctx.activePersona?.name), text: voice.trim() },
    ...ctx.people.map((person) => ({ name: personaLabel(person.name), text: renderPersonEntry(person, ctx, registry) })),
  ].filter((part) => part.text.length > 0);
  env.memberBlocks.set(section.id, blocks);
  return blocks.map((b) => b.text).join("\n\n");
}

const MERGED_CACHE_BUSTER = "merged-present-characters";

function recordMergedCacheBuster(trace: AssembleTrace): void {
  if (!trace.staticCacheBusters.includes(MERGED_CACHE_BUSTER)) {
    trace.staticCacheBusters.push(MERGED_CACHE_BUSTER);
  }
}

/** Record WHOSE merged-fallback contribution the cap cut (`assembly/assemble` allocateMergedFallback). A cut
 *  is a silent loss of card prose the host wrote, and `overrideSources` only ever said "merged (present
 *  characters)" — the names are the fact that makes it actionable. Nothing cut ⇒ the field stays absent. */
function recordMergedFallbackTruncation(trace: AssembleTrace, field: "mainPrompt" | "postHistory", names: readonly string[]): void {
  if (names.length === 0) {
    return;
  }
  trace.mergedFallbackTruncated ??= {};
  trace.mergedFallbackTruncated[field] = [...names];
}

function recordOverrideSource(trace: AssembleTrace, field: keyof NonNullable<AssembleTrace["overrideSources"]>, source: string | undefined): void {
  if (source === undefined) {
    return;
  }
  trace.overrideSources ??= {};
  trace.overrideSources[field] = source;
}

/** The label for a room-overrideable slot ("room override" / "merged (present characters)" / "from <name>" /
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
    source = "merged (present characters)";
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
): { text: string; merged: boolean; truncated: readonly string[] } {
  const { ctx, cardCtx, originals, registry } = env;
  const cardOverride = ctx.character[cardField];
  const preset = originals.renderedById.get(section.id) ?? renderMacros(templateFor(section, ctx), ctx, ctx.activePersona, { registry });
  const afterCard =
    overrideSet(cardOverride) && section.forbidCharacterOverride !== true
      ? renderMacros(cardOverride, cardCtx, ctx.pinnedPersona, { original: preset, registry })
      : preset;
  const fallback = resolveScopeFallback(cardField, ctx, afterCard, registry);
  if (overrideSet(roomOverride) && section.forbidRoomOverride !== true) {
    return {
      text: renderMacros(roomOverride, ctx, ctx.activePersona, { original: fallback.value, registry }),
      merged: fallback.merged,
      truncated: fallback.truncated,
    };
  }
  return { text: fallback.value, merged: fallback.merged, truncated: fallback.truncated };
}

function renderOverridableMarker(section: TemplatedMarkerSection, marker: "main_prompt" | "post_history", env: BuildEnv): string {
  const { ctx, trace } = env;
  const cardField = marker === "main_prompt" ? "systemPrompt" : "postHistoryInstructions";
  const room = marker === "main_prompt" ? ctx.roomOverrides?.mainPrompt : ctx.roomOverrides?.postHistory;
  const { text, merged, truncated } = renderOverridable(section, env, cardField, room);
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
  recordMergedFallbackTruncation(trace, marker === "main_prompt" ? "mainPrompt" : "postHistory", truncated);
  return text;
}

function renderScenarioMarker(section: TemplatedMarkerSection, env: BuildEnv): string {
  const { ctx, trace } = env;
  const room = ctx.roomOverrides?.scenario;
  // Active speaker's effective scenario only — co-speakers' scenarios are emitted once by the
  // char_description co-block; merging them here too would double-emit.
  const value = renderMacros(templateFor(section, ctx), env.cardCtx, ctx.pinnedPersona, { registry: env.registry });
  if (value.trim().length === 0) {
    return "";
  }
  recordOverrideSource(trace, "scenario", overrideSet(room) ? "room override" : `from ${ctx.character.name}`);
  return value;
}

/** The markers whose CONTENT the server injects per turn — the preset owns only the framing template. Two
 *  mapped Records below (§5.5 dispatch discipline) rather than an if/else chain with a fall-through default:
 *  a new server marker is then a tsc error at BOTH sites, never a section that silently renders empty. */
const SERVER_MARKERS = ["compact_summary", "memory", "databank", "guided_instruction"] as const satisfies readonly MarkerSection["marker"][];
type ServerMarker = (typeof SERVER_MARKERS)[number];

// Computed keys — the marker vocabulary is snake_case on the wire (the `DEFAULT_MARKER_TEMPLATES` idiom).
const SERVER_MARKER_VALUE: Record<ServerMarker, (ctx: AssembleContext) => string | null | undefined> = {
  ["compact_summary"]: (ctx) => ctx.compactSummary,
  ["memory"]: (ctx) => ctx.memory,
  ["databank"]: (ctx) => ctx.databank,
  ["guided_instruction"]: (ctx) => ctx.guidedInstruction,
};

/** Each server marker's `AssembleTrace` inclusion flag — set only when the marker actually DELIVERED text, so
 *  the host's diagnostics can tell "no retrieval this turn" from "the preset places no slot" (issue #80). */
const SERVER_MARKER_FLAG = {
  ["compact_summary"]: "compactSummaryIncluded",
  ["memory"]: "memoryIncluded",
  ["databank"]: "databankIncluded",
  ["guided_instruction"]: "guidedInstructionIncluded",
} as const satisfies Record<ServerMarker, keyof AssembleTrace>;

function renderServerMarker(section: TemplatedMarkerSection, marker: ServerMarker, env: BuildEnv): string {
  const value = SERVER_MARKER_VALUE[marker](env.ctx);
  if (value === null || value === undefined || value.trim().length === 0) {
    return "";
  }
  env.trace[SERVER_MARKER_FLAG[marker]] = true;
  return renderMacros(templateFor(section, env.ctx), env.ctx, env.ctx.activePersona, { registry: env.registry });
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
      const active = renderMacros(templateFor(section, ctx), env.cardCtx, ctx.pinnedPersona, { registry: env.registry });
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
        ? renderMacros(templateFor(section, ctx), env.cardCtx, ctx.pinnedPersona, { registry: env.registry })
        : "";
    case "dialogue_examples":
      return ctx.character.exampleMessages !== null && ctx.character.exampleMessages !== ""
        ? renderMacros(templateFor(section, ctx), env.cardCtx, ctx.pinnedPersona, { registry: env.registry })
        : "";
    case "persona":
      return renderPersonaMarker(section, env);
    case "compact_summary":
    case "memory":
    case "databank":
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
      return personaStaticSources(section, ctx);
    case "compact_summary":
    case "memory":
    case "databank":
    case "guided_instruction":
      return [templateFor(section, ctx)];
    case "main_prompt":
      return [templateFor(section, ctx), ctx.character.systemPrompt ?? "", ctx.roomOverrides?.mainPrompt ?? "", ...coSpeakerFieldSources("systemPrompt", ctx)];
    case "post_history":
      return [
        templateFor(section, ctx),
        ctx.character.postHistoryInstructions ?? "",
        ctx.roomOverrides?.postHistory ?? "",
        ...coSpeakerFieldSources("postHistoryInstructions", ctx),
      ];
    case "char_description":
      return [
        templateFor(section, ctx),
        ctx.character.description,
        ...coSpeakerFieldSources("description", ctx),
        ...coSpeakerFieldSources("personality", ctx),
        ...coSpeakerFieldSources("scenario", ctx),
        ...coSpeakerFieldSources("exampleMessages", ctx),
      ];
    case "char_personality":
      return [templateFor(section, ctx), ctx.character.personality ?? ""];
    case "scenario":
      return [templateFor(section, ctx), ctx.character.scenario ?? "", ctx.roomOverrides?.scenario ?? "", ...coSpeakerFieldSources("scenario", ctx)];
    case "dialogue_examples":
      return [templateFor(section, ctx), ctx.character.exampleMessages ?? ""];
  }
}
// biome-ignore-end lint/suspicious/noUnnecessaryConditions: see the matching -start above.

/** The persona marker's static sources: the template, plus every description the marker actually renders — the
 *  voice's when its placement keeps it in the marker, and each person's `in_prompt` one. A description routed to
 *  an injection or opted out never reaches the static half, so scanning it would overstate the cache-busters. */
function personaStaticSources(section: TemplatedMarkerSection, ctx: AssembleContext): string[] {
  const voice = ctx.activePersona && ctx.personaMarkerActive !== false ? [ctx.activePersona.description] : [];
  const people = (ctx.people ?? []).flatMap((person) => (person.placement === undefined || person.placement.kind === "in_prompt" ? [person.description] : []));
  return [templateFor(section, ctx), ...voice, ...people];
}

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
    renderedById.set(s.id, renderMacros(templateFor(s, ctx), ctx, ctx.activePersona, { registry }));
  }
  return { renderedById };
}

const SYNTHETIC_COMPACT_SUMMARY_ID = "__synthetic-compact-summary";

/** PD-140/D25: a compacted chat's summary must reach STATELESS runners even when the active preset omits a
 *  `compact_summary` section (the neo C1 cache-anchor invariant). The assembler — not the preset author —
 *  guarantees delivery: when `ctx.compactSummary` is set and no ACTIVE `compact_summary` section exists,
 *  synthesize one immediately before the `chat_history` pivot (end of section list if there's no pivot).
 *
 *  ACTIVE, never merely enabled (`assembly/sections` hasActiveMarker): an enabled `compact_summary` whose
 *  `trigger` array excludes THIS turn's generation type is dropped by the walk below, so counting it as
 *  delivery suppressed the synthesis and the compacted chat's summary reached the model NOWHERE — exactly the
 *  silent break this guarantee exists to prevent. The synthetic section declares no `trigger`, so it always
 *  fires; a trigger-MATCHED real section still wins, so nothing is ever double-emitted. */
function withImplicitCompactSummary(config: PromptConfig, ctx: AssembleContext): PromptConfig {
  if (ctx.compactSummary === null || ctx.compactSummary === undefined || ctx.compactSummary.trim().length === 0) {
    return config;
  }
  if (hasActiveMarker(config, "compact_summary", ctx.generationType ?? "normal")) {
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

function isSectionDynamic(section: PromptSection): boolean {
  // A trigger-gated section's PRESENCE varies by generation type → it can never live in the cached prefix.
  if ("trigger" in section && section.trigger !== undefined && section.trigger.length > 0) {
    return true;
  }
  if (section.type === "literal") {
    return false;
  }
  // `databank` joins memory here: retrieval is re-run every turn against the pending message, so its bytes
  // change turn to turn — in the STATIC half it would bust the cached prefix on every send (databank-design/07 §3).
  return section.marker === "memory" || section.marker === "databank" || section.marker === "guided_instruction" || section.marker === "chat_history";
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
    // Copied VERBATIM from the ctx the gather staged it on (the `wiTrace` posture) — the build walk never
    // re-derives a recall fact. Absent ⇒ recall never ran for this ctx, which is `null`, not an empty recall.
    memoryRecall: ctx.memoryTrace ?? null,
    databankIncluded: false,
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
  // `in-chat`: the SHAPE splice delivers these bytes verbatim — the ASSEMBLE post-process only ever runs on
  // the two joined system halves, so transforming the slice here would price bytes nobody produces.
  pushSlices({ section, rendered, env, acc, delivery: "in-chat" });
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

/**
 * WHERE a contribution's bytes are delivered, which decides what still happens to them after the walk.
 * `system-half` bytes join the static/dynamic strings and then run the preset's ASSEMBLE post-process;
 * `in-chat` bytes are handed to the SHAPE splice verbatim (the pass never touches history rows).
 */
type SliceDelivery = "system-half" | "in-chat";

/**
 * The bytes a contribution actually DELIVERS — what the budget must be priced on (`assembly/budget`).
 *
 * A `system-half` contribution runs the same `applyAssemblePostProcess` the joined half runs, and the two
 * agree EXACTLY rather than approximately: every part is `.trim()`ed before it joins on `\n\n`, so no newline
 * run can span a join seam, and collapsing per part is therefore the same string as collapsing the join.
 * Priced pre-transform, a preset with `collapseNewlines` on charged the host for whitespace the model never
 * received — the budget described a prompt nobody sent.
 */
function deliveredSliceText(text: string, delivery: SliceDelivery, env: BuildEnv): string {
  return delivery === "system-half" ? applyAssemblePostProcess(text, env.postProcess) : text;
}

/** Record a rendered section's budget slices: ONE per contributor, priced on its DELIVERED bytes. The merged
 *  card section splits per roster member (recorded during its render); every other section is a single
 *  contributor. */
function pushSlices(args: {
  readonly section: PromptSection;
  readonly rendered: string;
  readonly env: BuildEnv;
  readonly acc: WalkAccum;
  readonly delivery: SliceDelivery;
}): void {
  const { section, rendered, env, acc, delivery } = args;
  const source = sectionSource(section);
  const blocks = env.memberBlocks.get(section.id);
  if (blocks === undefined || blocks.length === 0) {
    acc.slices.push({ source, label: sectionLabel(section, env.ctx), text: deliveredSliceText(rendered, delivery, env), sectionId: section.id });
    return;
  }
  for (const block of blocks) {
    acc.slices.push({ source, label: block.name, text: deliveredSliceText(block.text.trim(), delivery, env), sectionId: section.id });
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

/** Keyword-fired lore anchored at a world-info marker joins the per-turn half at the marker's place in the
 *  prompt order, so it sits among the other per-turn sections where the preset author put the anchor. */
function pushAnchoredKeywordLore(section: PromptSection, env: BuildEnv, acc: WalkAccum): void {
  if (section.type !== "marker" || (section.marker !== "world_info_before" && section.marker !== "world_info_after")) {
    return;
  }
  const lore = (section.marker === "world_info_before" ? env.ctx.worldInfoBeforeDynamic : env.ctx.worldInfoAfterDynamic)?.trim() ?? "";
  if (lore.length === 0) {
    return;
  }
  acc.dynamicParts.push(lore);
  env.trace.dynamicSections.push(section.id);
  pushSlices({ section, rendered: lore, env, acc, delivery: "system-half" });
}

/** Deliver ONE section: after-history injection (depth !== null) OR system-block (static/dynamic). */
function walkSection(section: PromptSection, idx: number, env: BuildEnv, acc: WalkAccum): void {
  const depth = injectionDepthFor(section, idx, env.pivotIndex);
  if (depth !== null) {
    pushAfterHistory(section, depth, env, acc);
    return;
  }
  pushAnchoredKeywordLore(section, env, acc);
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
  pushSlices({ section, rendered, env, acc, delivery: "system-half" });
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
  /** The preset ASSEMBLE post-process — these injections join a SYSTEM HALF, so their slice is priced on the
   *  post-transform bytes exactly as a section's is ({@link deliveredSliceText}). */
  postProcess: PostProcessConfig | undefined;
}): void {
  for (const inj of args.list) {
    const text = inj.content.trim();
    if (text.length > 0) {
      args.target.push(text);
      args.sections.push(args.label);
      args.trace.chatInjectionsIncluded += 1;
      args.slices.push({ ...injectionSource(inj), text: applyAssemblePostProcess(text, args.postProcess) });
    }
  }
}

/** Route the system-block chat injections — content arrives already macro-resolved + role-framed.
 *  `before_prompt` prepends to static, `in_static` appends, `in_prompt` goes dynamic. */
function applySystemInjections(ctx: AssembleContext, trace: AssembleTrace, acc: WalkAccum, pp: PostProcessConfig | undefined): void {
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
      acc.slices.push({ ...injectionSource(inj), text: applyAssemblePostProcess(inj.content.trim(), pp) });
    }
  }
  appendInjections({
    list: all.filter((i) => i.position === "in_static"),
    target: acc.staticParts,
    sections: trace.staticSections,
    label: "chat-injection:in_static",
    trace,
    slices: acc.slices,
    postProcess: pp,
  });
  appendInjections({
    list: all.filter((i) => i.position === "in_prompt"),
    target: acc.dynamicParts,
    sections: trace.dynamicSections,
    label: "chat-injection:in_prompt",
    trace,
    slices: acc.slices,
    postProcess: pp,
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
  // Read ONCE and threaded onto the env: the joined halves and every system-half budget slice must run the
  // SAME transform, or the budget prices a prompt that differs from the one being sent.
  const pp = config.postProcess;
  const acc: WalkAccum = {
    staticParts: [],
    dynamicParts: [],
    afterHistory: [],
    cacheBusters: new Set<string>(),
    slices: [],
  };
  const pivotIndex = config.sections.findIndex((s) => s.type === "marker" && s.marker === "chat_history");
  const env: BuildEnv = {
    ctx,
    cardCtx: cardOwnerCtx(ctx),
    trace,
    originals: computeOriginals(config, ctx, registry),
    pivotIndex,
    registry,
    memberBlocks: new Map(),
    postProcess: pp,
  };

  const generationType = ctx.generationType ?? "normal";

  const pivotSection = pivotIndex >= 0 ? config.sections[pivotIndex] : undefined;
  // Send history unless a chat_history marker is explicitly present AND does not fire this turn — disabled,
  // or gated by a `trigger` that excludes this generation type. The TRIGGER arm is new with #1462 (the plain
  // markers only just gained the field, ST parity): the pivot is the one section the walk skips before the
  // trigger check, so nothing else would read its gate, and a stored gate no reader honours is the same
  // silent drop this row is about.
  const sendHistory = !(pivotSection !== undefined && (pivotSection.enabled === false || !sectionTriggers(pivotSection, generationType)));
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

  applySystemInjections(ctx, trace, acc, pp);

  // The `in_chat` injections never touch the system halves (SHAPE splices them into history), but they ARE
  // part of what the model reads next turn — the rpg state block rides exactly this channel. Account them
  // here, at their pre-splice content: the splice's role framing (`chat.injection.systemNote`) adds a handful of
  // tokens the estimate doesn't chase (advisory by construction, like every count on this surface). NOT
  // post-processed: the ASSEMBLE pass runs on the two joined SYSTEM halves only, and these bytes never join
  // one — they go to the SHAPE splice verbatim.
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
    cardCtx: cardOwnerCtx(previewCtx),
    trace,
    originals: computeOriginals(config, previewCtx, registry),
    pivotIndex: -1,
    registry,
    memberBlocks: new Map(),
    // The single-section preview emits no budget slices, so nothing reads this — the field is carried for
    // the env's shape, and `previewSection` deliberately shows the section's OWN render (the post-process is
    // a property of the joined half, not of one section).
    postProcess: config.postProcess,
  };
  return { rendered: renderSection(section, env), half, trace };
}
