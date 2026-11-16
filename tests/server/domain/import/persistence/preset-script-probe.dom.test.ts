// @subject packages/server/src/domain/preset/verbs/import-file.ts
// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// A hand-run check: it takes ANY preset file by path and runs every regex script in it through the app's own
// pipelines, then prints one row per script. It runs only when `ORB_PRESET_PROBE_FILE` names the file, so the default
// suites skip it. The file is untrusted input: it is read and run, never copied into the tree.
//
//   P1 import      the single-file preset door lands the scripts, and each landed row reads back as the file states it.
//   P2 shape       what each markup replacement would write, through the kit readers the reply render uses.
//   P3 real input  each display script on a block its own pattern matches, taken from the preset's prompt texts.
//   P4 depth       a twelve-turn room: a prompt-only script strips its block from replies at or past its minimum depth.
//   P5 cost        the display pass as the Worker runs it and the prompt pass under the server's watchdog.
import { readFile } from "node:fs/promises";
import process from "node:process";
import { setImmediate } from "node:timers/promises";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { stRegexScriptFields } from "@orb/contracts/regex";
import { scanStyledHold, stripStyleElements, stripTags } from "@orb/kit/content";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { NO_SEATS } from "@orb/kit/message-author";
import type { ExecuteRegexScriptsArgs, RegexPassCall, RegexRowStamps } from "@orb/kit/regex";
import { executeRegexScripts, regexSkipReason } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { toContentBlocks } from "#client/features/chat/lib/content-blocks.ts";
import type { ReplyPart } from "#client/features/chat/lib/reply-parts.ts";
import { replyLayout } from "#client/features/chat/lib/reply-parts.ts";
import { DISPLAY_OUTPUT_MAX_CHARS, DISPLAY_ROW_BUDGET_MS, DISPLAY_SCRIPT_DEADLINE_MS } from "#client/lib/display-pass-protocol.ts";
import type { DisplayPass, DisplayRowCall, MessageRenderContext } from "#client/lib/message-render.ts";
import { applyDisplayScript, prepareDisplayPass, renderStyledMessageForDisplay } from "#client/lib/message-render.ts";
import { openRegexPass, REGEX_TEXT_PASS_BUDGET_MS, regexHistoryPassBudgetMs, regexNotAppliedCause } from "#server/primitives/regex/index.ts";
import { textRoom, wireOf, wireText } from "../../chat/scenario-physical.ts";

// biome-ignore lint/style/noProcessEnv: a path the person running the check names, not application configuration.
const PRESET_PATH = process.env["ORB_PRESET_PROBE_FILE"];

const FILE_NAME = "Probe.json";
const RUN_TIMEOUT_MS = 900_000;
// Twelve sends leave eleven replies behind the newest row, at depths 1, 3, 5 ... 21.
const ROOM_TURNS = 12;
// A preset can ask for a reply far larger than the room's test model leaves space for beside the prompt, which drops
// the whole history. The room lowers that one limit so the history reaches the wire; no script reads it.
const ROOM_MAX_OUTPUT_TOKENS = 1024;
const REPLY_MARKER = "Reply marker";
const REPLY_MARKER_RE = /Reply marker t(\d+)\./;
const EXAMPLE_MATCHES_PER_TEXT = 20;
const EXAMPLE_CONTEXT_CHARS = 200;
const MARKUP_RE = /<\/?[A-Za-z!]/;
const COMPLETE_TAG_RE = /<\/?[A-Za-z][^<>\n]*>/;
const RAW_ELEMENT_RE = /<(style|script)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
// A literal tag pair is the one pattern shape an input can be made from without reading what its author meant.
const TAG_PAIR_SOURCE_RE = /^<([A-Za-z][\w:-]*)(?:\[\^>\]\*)?(?:\[\\s\\S\]|\.)\*\??<\\\/\1>$/;
// A stylesheet or script line shorter than this could be prose by chance.
const MIN_LEAK_LINE_CHARS = 8;
const SLOWEST_LISTED = 5;
// A stylesheet that opens after another tag with a blank line inside: the frame's Markdown ends the HTML block there.
const STYLE_AFTER_TAG_BLANK_LINE = "style-after-tag+css-blank-line";
const NO_STYLE_SHAPE = "no-style";
const LOG_LINES_READ = 2000;
const LOG_BUDGET_MARKS = ["regex pass budget", "ERR_SCRIPT_EXECUTION_TIMEOUT", "not applied"] as const;
const ASSISTANT_STAMP: RegexRowStamps = { role: "assistant", kind: "standard", authorUserId: null, characterId: null, personaId: null };
const REPLY: DisplayRowCall = { target: "AI_OUTPUT", row: ASSISTANT_STAMP, depth: undefined };
const PROMPT_CALL: RegexPassCall = { pass: "prompt", target: "AI_OUTPUT", row: ASSISTANT_STAMP, room: NO_SEATS, depth: 1000 };
const VERDICT_WORDS: Readonly<Record<string, string>> = { null: "n/a", true: "ok", false: "RED" };
const PHASES = ["P1", "P2", "P3", "P4", "P5"] as const;
type Phase = (typeof PHASES)[number];

/** One phase's verdict for one script: `ok` is null when the phase never reached it, with the reason in `notes`. */
interface Cell {
  readonly ok: boolean | null;
  readonly notes: readonly string[];
}

const cellOk = (notes: readonly string[] = []): Cell => ({ ok: true, notes });
const cellRed = (notes: readonly string[]): Cell => ({ ok: false, notes });
const cellNone = (note: string): Cell => ({ ok: null, notes: [note] });

interface FileScript {
  readonly index: number;
  readonly name: string;
  readonly raw: Record<string, unknown>;
  /** The passes the file's own switches name. */
  readonly stated: string;
}

interface Probe {
  readonly scripts: readonly FileScript[];
  readonly prompts: readonly string[];
  readonly cells: Map<number, Partial<Record<Phase, Cell>>>;
  readonly lines: string[];
  /** Which scripts' written text carries each markup shape, as `P2#12` labels. */
  readonly shapes: Map<string, string[]>;
}

type Landed = ReadonlyMap<number, RegexScriptRow>;
type MacroContext = ExecuteRegexScriptsArgs["ctx"];

interface Example {
  readonly text: string;
  readonly source: "prompt" | "pattern";
}

type ExampleSearch = { readonly found: Example } | { readonly absent: string };

function put(probe: Probe, index: number, phase: Phase, cell: Cell): void {
  const row = probe.cells.get(index);
  if (row !== undefined) {
    row[phase] = cell;
  }
}

function say(probe: Probe, line: string): void {
  probe.lines.push(line);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function statedPasses(raw: Record<string, unknown>): string {
  const target = raw["target"];
  if (Array.isArray(target)) {
    return target.join("+");
  }
  const passes = [raw["markdownOnly"] === true ? "display" : null, raw["promptOnly"] === true ? "prompt" : null].filter((pass) => pass !== null);
  return passes.length === 0 ? "save" : passes.join("+");
}

function readFileScripts(file: unknown): FileScript[] {
  const extensions = isPlainObject(file) ? file["extensions"] : undefined;
  const list = isPlainObject(extensions) ? extensions["regex_scripts"] : undefined;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((raw, index) => (isPlainObject(raw) ? [{ index, name: textOf(raw["scriptName"] ?? raw["name"]), raw, stated: statedPasses(raw) }] : []));
}

function contentsOf(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((entry) => (isPlainObject(entry) && typeof entry["content"] === "string" && entry["content"] !== "" ? [entry["content"]] : []));
}

/** Every prompt text the file carries: a SillyTavern preset's `prompts` or a block list's `blocks`. */
function readPromptTexts(file: unknown): string[] {
  return isPlainObject(file) ? [...contentsOf(file["prompts"]), ...contentsOf(file["blocks"])] : [];
}

function newProbe(file: unknown): Probe {
  const scripts = readFileScripts(file);
  return {
    scripts,
    prompts: readPromptTexts(file),
    cells: new Map(scripts.map(({ index }) => [index, {}])),
    lines: [],
    shapes: new Map(),
  };
}

// ── P1: what the file states, read back off the landed row in SillyTavern's own spelling ──────────────────────────

// A depth bound as SillyTavern's gate reads it: a floor applies from -1 up (and -1 is no bound), a ceiling from 0 up.
function statedMin(value: unknown): number | null {
  return typeof value === "number" && value > -1 ? value : null;
}

function statedMax(value: unknown): number | null {
  return typeof value === "number" && value >= 0 ? value : null;
}

function statedSubstitute(value: unknown): number {
  if (typeof value === "boolean") {
    return Number(value);
  }
  return typeof value === "number" ? value : 0;
}

function sortedNumbers(value: unknown): string {
  return JSON.stringify(Array.isArray(value) ? value.filter((member) => typeof member === "number").toSorted((a, b) => a - b) : []);
}

function readBackMismatches(row: RegexScriptRow, raw: Record<string, unknown>): string[] {
  const back = stRegexScriptFields(row);
  const checks: readonly (readonly [string, boolean])[] = [
    ["disabled", back.disabled !== (raw["disabled"] === true)],
    ["placement", sortedNumbers(back.placement) !== sortedNumbers(raw["placement"])],
    ["markdownOnly", back.markdownOnly !== (raw["markdownOnly"] === true)],
    ["promptOnly", back.promptOnly !== (raw["promptOnly"] === true)],
    ["minDepth", back.minDepth !== statedMin(raw["minDepth"])],
    ["maxDepth", back.maxDepth !== statedMax(raw["maxDepth"])],
    ["findRegex", row.findRegex !== raw["findRegex"]],
    ["replaceString", row.replaceString !== raw["replaceString"]],
    ["runOnEdit", row.runOnEdit !== (raw["runOnEdit"] === true)],
    ["trimStrings", JSON.stringify(row.trimStrings) !== JSON.stringify(raw["trimStrings"] ?? [])],
    ["substituteRegex", row.substituteRegex !== statedSubstitute(raw["substituteRegex"])],
  ];
  return checks.flatMap(([field, differs]) => (differs ? [field] : []));
}

// Rows come back in the file's order and a refused script leaves none, so rows pair with the file by name.
function pairByName(probe: Probe, rows: readonly RegexScriptRow[]): Landed {
  const byName = new Map<string, RegexScriptRow[]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  const landed = new Map<number, RegexScriptRow>();
  for (const script of probe.scripts) {
    const row = byName.get(script.name)?.shift();
    if (row === undefined) {
      put(probe, script.index, "P1", cellRed(["not-landed"]));
      continue;
    }
    landed.set(script.index, row);
    const mismatches = readBackMismatches(row, script.raw);
    put(probe, script.index, "P1", mismatches.length === 0 ? cellOk() : cellRed(mismatches));
  }
  return landed;
}

function noteWholePresetRefused(probe: Probe, why: string): void {
  say(probe, `P1 the whole preset was refused: ${why}`);
  for (const script of probe.scripts) {
    put(probe, script.index, "P1", cellRed(["not-landed(whole preset refused)"]));
    for (const phase of PHASES.slice(1)) {
      put(probe, script.index, phase, cellNone("nothing landed"));
    }
  }
}

/** The single-file door, on a fresh root: preview, import, then the landed rows paired with the file's scripts. */
async function importPhase(probe: Probe, fileText: string): Promise<Landed> {
  // Not `_st-tree-door.ts`'s `harness`: its import chain reaches a helper that spells a Node-only fetch option, which the
  // DOM compiler world this file sits in refuses.
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const preview = await caller.preset.previewFile({ fileText, fileName: FILE_NAME });
  const imported = await caller.preset.importFile({ fileText, fileName: FILE_NAME });
  if (!preview.ok) {
    noteWholePresetRefused(probe, preview.error);
    return new Map();
  }
  if (!imported.ok || imported.presetId === undefined) {
    noteWholePresetRefused(probe, "the import refused it after the preview accepted it");
    return new Map();
  }
  say(
    probe,
    `P1 preview: ${String(preview.regexScripts)} attach, ${String(preview.regexScriptsOff)} off, ${String(preview.refusedScripts.length)} refused; left out ${String(preview.leftOut.length)} field(s)`,
  );
  const lifted = imported.regexScripts;
  say(probe, `P1 import: created ${String(lifted?.created ?? 0)}, reused ${String(lifted?.reused ?? 0)}, refused ${String(lifted?.refused.length ?? 0)}`);
  for (const refusal of lifted?.refused ?? []) {
    say(probe, `P1 refused ${JSON.stringify(refusal.name.slice(0, 40))}: ${refusal.reason}`);
  }
  return pairByName(probe, await caller.regex.listForPreset({ presetId: imported.presetId }));
}

// ── P2 and P3: the readers the reply render uses, over a display script's output ──────────────────────────────────

/** The lines of every `<style>` and `<script>` element in `text`: the bytes that must never read as prose. */
function rawElementLines(text: string): string[] {
  return [...text.matchAll(RAW_ELEMENT_RE)].flatMap((match) =>
    textOf(match[2])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= MIN_LEAK_LINE_CHARS),
  );
}

function leaksAny(prose: string, lines: readonly string[]): boolean {
  return lines.some((line) => prose.includes(line));
}

/** What shape the markup has, so a failing set can be grouped by cause. */
function shapeOf(text: string): string[] {
  const afterTag = /<[a-z][^>\n]*>[^\n]*<style\b/i.test(text);
  const blankLine = /<style\b[^>]*>(?:(?!<\/style)[\s\S])*?\n[ \t]*\n[\s\S]*?<\/style/i.test(text);
  const shapes: readonly (readonly [string, boolean])[] = [
    ["style-after-tag", afterTag],
    ["style-on-own-line", /^[ \t]*<style\b/im.test(text)],
    ["css-blank-line", blankLine],
    [STYLE_AFTER_TAG_BLANK_LINE, afterTag && blankLine],
    ["script", /<script\b/i.test(text)],
    [NO_STYLE_SHAPE, !/<style\b/i.test(text)],
  ];
  return shapes.flatMap(([name, present]) => (present ? [name] : []));
}

// A reply too heavy to frame renders through the inert path whole, so only a framed layout has native parts.
function framedParts(layout: ReturnType<typeof replyLayout>): readonly ReplyPart[] {
  return layout.kind === "framed" ? layout.parts : [];
}

function nativeLeaks(text: string, lines: readonly string[]): string[] {
  return [false, true].flatMap((lenientHtml) =>
    framedParts(replyLayout([{ text, tokens: undefined }], { lenientHtml, cardTrust: "tierB" })).flatMap((part) =>
      part.kind === "native" && part.block.kind === "markdown" && leaksAny(part.block.md, lines) ? [`native-leak(lenient=${String(lenientHtml)})`] : [],
    ),
  );
}

/** The kit readers over one text. Each failure code names the reader that put stylesheet or script text, or a tag, into prose. */
function readerFailures(text: string): string[] {
  const lines = rawElementLines(text);
  const held = scanStyledHold(text)
    .flatMap((segment) => (segment.kind === "text" ? [segment.text] : []))
    .join("\n");
  const streamed = stripTags(stripStyleElements(text));
  return [
    ...(leaksAny(held, lines) ? ["hold-leak"] : []),
    ...(leaksAny(streamed, lines) ? ["stream-leak"] : []),
    ...(COMPLETE_TAG_RE.test(streamed) ? ["stream-tag"] : []),
    ...nativeLeaks(text, lines),
  ];
}

// A script may delete what it matches, so an empty output has no blocks and that is no failure.
function readText(text: string): readonly string[] {
  const blocks = toContentBlocks(text, { cardTrust: "tierB", lenientHtml: true, keepUnknownDirectives: true });
  return blocks.length === 0 && text.trim() !== "" ? [...readerFailures(text), "no-blocks"] : readerFailures(text);
}

// The frame's own Markdown render sits behind a door a test may not import, so the shapes it mishandles are listed
// by script instead of judged.
function noteShapes(probe: Probe, label: string, text: string): void {
  for (const shape of shapeOf(text).filter((name) => name !== NO_STYLE_SHAPE)) {
    probe.shapes.set(shape, [...(probe.shapes.get(shape) ?? []), label]);
  }
}

function renderContext(displayScripts: readonly RegexScriptRow[]): MessageRenderContext {
  return {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
    displayScripts,
    room: NO_SEATS,
  };
}

// The pattern the executor itself compiled, taken through its `applyReplace` seam on an empty text.
function compiledPattern(row: RegexScriptRow, call: RegexPassCall, ctx: MacroContext): RegExp | undefined {
  let compiled: RegExp | undefined;
  executeRegexScripts({
    text: "",
    scripts: [row],
    call,
    ctx,
    applyReplace: (text, regex) => {
      compiled = regex;
      return text;
    },
  });
  return compiled;
}

// `|` adds an empty alternative, so the exec of the empty string matches and reports every group the pattern has.
function groupShape(regex: RegExp): { readonly count: number; readonly names: readonly string[] } {
  const match = new RegExp(`${regex.source}|`, regex.flags.replaceAll(/[gy]/g, "")).exec("");
  return { count: Math.max(0, (match?.length ?? 1) - 1), names: Object.keys(match?.groups ?? {}) };
}

// A pattern that matches placeholder words in the same group positions and names as the real one, so the replacement
// runs through the production display pass and writes the text it would write.
function syntheticFor(row: RegexScriptRow, regex: RegExp): { readonly input: string; readonly row: RegexScriptRow } {
  const { count, names } = groupShape(regex);
  const numbered = Array.from({ length: count }, (_, i) => `cap${String(i + 1)}`);
  const named = names.map((name) => `name${name}`);
  const source = [...numbered.map((word) => `(${word})`), ...names.map((name, i) => `(?<${name}>${named[i] ?? ""})`)].join("");
  const input = [...numbered, ...named].join("");
  return source === ""
    ? { input: "x", row: { ...row, findRegex: "/x/g", substituteRegex: 0 } }
    : { input, row: { ...row, findRegex: `/${source}/g`, substituteRegex: 0 } };
}

function shapeCell(probe: Probe, index: number, row: RegexScriptRow, pass: DisplayPass): Cell {
  // `exec`, not `.test`: the vitest lint rule reads a `.test(` call as a test body and refuses the branch.
  if (MARKUP_RE.exec(row.replaceString) === null) {
    return cellNone("replacement carries no markup");
  }
  const skipped = regexSkipReason(row, pass.call);
  if (skipped !== null) {
    return cellNone(`the reply call skips it: ${skipped}`);
  }
  const regex = compiledPattern(row, pass.call, pass.macroCtx);
  if (regex === undefined) {
    return cellNone("pattern did not compile");
  }
  const synthetic = syntheticFor(row, regex);
  const written = renderStyledMessageForDisplay(synthetic.input, renderContext([synthetic.row]), REPLY).text;
  noteShapes(probe, `P2#${String(index)}`, written);
  const failures = readText(written);
  return failures.length === 0 ? cellOk() : cellRed([...failures, ...shapeOf(written)]);
}

function shapePhase(probe: Probe, rows: readonly (readonly [number, RegexScriptRow])[], pass: DisplayPass): void {
  for (const [index, row] of rows) {
    put(probe, index, "P2", shapeCell(probe, index, row, pass));
  }
}

// ── The example block a script's own pattern matches ──────────────────────────────────────────────────────────────

interface Hit {
  readonly text: string;
  readonly at: number;
}

interface Search {
  readonly row: RegexScriptRow;
  readonly call: RegexPassCall;
  readonly ctx: MacroContext;
}

/** The first matches of the script's own compiled pattern in `text`, found under the server's watchdog. */
function hitsIn(search: Search, text: string): readonly Hit[] | "watchdog" {
  const hits: Hit[] = [];
  const failures: unknown[] = [];
  openRegexPass(Number.POSITIVE_INFINITY).execute({
    text,
    scripts: [search.row],
    call: search.call,
    ctx: search.ctx,
    onScriptFailure: (err) => {
      failures.push(err);
    },
    applyReplace: (subject, regex) => {
      for (const match of subject.matchAll(new RegExp(regex.source, regex.flags))) {
        if (match[0] !== "") {
          hits.push({ text: match[0], at: match.index });
        }
        if (hits.length >= EXAMPLE_MATCHES_PER_TEXT) {
          break;
        }
      }
      return subject;
    },
  });
  return failures.length > 0 ? "watchdog" : hits;
}

function patternExample(regex: RegExp): string | undefined {
  const tag = TAG_PAIR_SOURCE_RE.exec(regex.source)?.[1];
  return tag === undefined ? undefined : `<${tag}>probe</${tag}>`;
}

// A lookbehind or lookahead needs the text around the match, so the bare match is tried first and a window second.
function usableForm(prompt: string, hit: Hit, usable: (text: string) => boolean): string | undefined {
  const window = prompt.slice(Math.max(0, hit.at - EXAMPLE_CONTEXT_CHARS), hit.at + hit.text.length + EXAMPLE_CONTEXT_CHARS);
  return [hit.text, window].find(usable);
}

interface ExampleOptions {
  readonly usable: (text: string) => boolean;
  /** Take the smallest usable match of every prompt rather than the first. */
  readonly shortest: boolean;
}

function shorter(best: string | undefined, form: string | undefined): string | undefined {
  return form !== undefined && (best === undefined || form.length < best.length) ? form : best;
}

function scanPrompts(
  search: Search,
  prompts: readonly string[],
  options: ExampleOptions,
): { readonly best: string | undefined; readonly matched: boolean } | "watchdog" {
  let best: string | undefined;
  let matched = false;
  for (const prompt of prompts) {
    const hits = hitsIn(search, prompt);
    if (hits === "watchdog") {
      return "watchdog";
    }
    matched ||= hits.length > 0;
    best = hits.reduce<string | undefined>((current, hit) => shorter(current, usableForm(prompt, hit, options.usable)), best);
    if (best !== undefined && !options.shortest) {
      break;
    }
  }
  return { best, matched };
}

/** An example from the preset's own prompt texts, else one built from a literal tag-pair pattern. */
function findExample(search: Search, probe: Probe, options: ExampleOptions): ExampleSearch {
  const skipped = regexSkipReason(search.row, search.call);
  if (skipped !== null) {
    return { absent: `the call skips it: ${skipped}` };
  }
  const scan = scanPrompts(search, probe.prompts, options);
  if (scan === "watchdog") {
    return { absent: "watchdog while searching" };
  }
  if (scan.best !== undefined) {
    return { found: { text: scan.best, source: "prompt" } };
  }
  const matchedSomewhere = scan.matched;
  const regex = compiledPattern(search.row, search.call, search.ctx);
  const built = regex === undefined ? undefined : patternExample(regex);
  if (built !== undefined && options.usable(built)) {
    return { found: { text: built, source: "pattern" } };
  }
  return { absent: matchedSomewhere ? "matches a prompt text, but alone it matches nothing" : "no prompt text matches" };
}

function replacesIn(row: RegexScriptRow, text: string): boolean {
  return renderStyledMessageForDisplay(text, renderContext([row]), REPLY).text !== text;
}

function realInputPhase(probe: Probe, rows: readonly (readonly [number, RegexScriptRow])[], pass: DisplayPass): Map<number, Example> {
  const examples = new Map<number, Example>();
  for (const [index, row] of rows) {
    const found = findExample({ row, call: pass.call, ctx: pass.macroCtx }, probe, { usable: (text) => replacesIn(row, text), shortest: false });
    if ("absent" in found) {
      put(probe, index, "P3", found.absent.startsWith("watchdog") ? cellRed([found.absent]) : cellNone(found.absent));
      continue;
    }
    examples.set(index, found.found);
    const written = renderStyledMessageForDisplay(found.found.text, renderContext([row]), REPLY).text;
    noteShapes(probe, `P3#${String(index)}`, written);
    const failures = readText(written);
    put(probe, index, "P3", failures.length === 0 ? cellOk([found.found.source]) : cellRed([found.found.source, ...failures, ...shapeOf(written)]));
  }
  return examples;
}

// ── P5: the display pass as the Worker runs it, and the prompt pass under the server's budget ─────────────────────

function cpuMs(before: NodeJS.CpuUsage): number {
  const used = process.threadCpuUsage(before);
  return (used.user + used.system) / 1000;
}

interface DisplayCost {
  readonly wallMs: number;
  readonly cause: string;
}

// The watchdog first: a pattern that never finishes would hang this thread, which the browser kills in a Worker.
function guardedDisplayCosts(pass: DisplayPass): Map<RegexScriptRow, DisplayCost> {
  const costs = new Map<RegexScriptRow, DisplayCost>();
  const watchdog = openRegexPass(Number.POSITIVE_INFINITY);
  let text = pass.text;
  for (const row of pass.scripts) {
    let failure: unknown;
    const started = performance.now();
    text = watchdog.execute({
      text,
      scripts: [row],
      call: pass.call,
      ctx: pass.macroCtx,
      passInputLength: pass.text.length,
      onScriptFailure: (err) => {
        failure = err;
      },
    });
    costs.set(row, { wallMs: performance.now() - started, cause: failure === undefined ? "" : regexNotAppliedCause(failure) });
  }
  return costs;
}

interface WorkerRun {
  readonly timings: ReadonlyMap<RegexScriptRow, number>;
  readonly spentMs: number;
  readonly cut: string;
  readonly outputChars: number;
}

// The Worker's own loop (`display-pass.worker.ts`), over the scripts the watchdog let through.
function workerRun(pass: DisplayPass, costs: ReadonlyMap<RegexScriptRow, DisplayCost>): WorkerRun {
  const timings = new Map<RegexScriptRow, number>();
  let text = pass.text;
  let spentMs = 0;
  let cut = "none";
  for (const row of pass.scripts.filter((script) => costs.get(script)?.cause === "")) {
    if (spentMs >= DISPLAY_ROW_BUDGET_MS) {
      cut = "row budget";
      break;
    }
    const started = performance.now();
    const next = applyDisplayScript(text, row, pass.macroCtx, pass.call);
    const took = performance.now() - started;
    timings.set(row, took);
    spentMs += took;
    if (next.text.length > DISPLAY_OUTPUT_MAX_CHARS) {
      cut = "output bound";
      break;
    }
    text = next.text;
  }
  return { timings, spentMs, cut, outputChars: text.length };
}

function displayCostCell(cost: DisplayCost | undefined, workerMs: number | undefined): Cell {
  const notes = [
    ...(cost !== undefined && cost.cause !== "" ? [`watchdog:${cost.cause} after ${cost.wallMs.toFixed(0)} ms`] : []),
    ...(workerMs !== undefined && workerMs >= DISPLAY_SCRIPT_DEADLINE_MS ? [`worker ${workerMs.toFixed(0)} ms >= ${String(DISPLAY_SCRIPT_DEADLINE_MS)}`] : []),
  ];
  return notes.length === 0 ? cellOk([`${(workerMs ?? 0).toFixed(1)} ms`]) : cellRed(notes);
}

function displayCostPhase(probe: Probe, rows: readonly (readonly [number, RegexScriptRow])[], reply: string): void {
  const pass = prepareDisplayPass(reply, renderContext(rows.map(([, row]) => row)), REPLY);
  const costs = guardedDisplayCosts(pass);
  const run = workerRun(pass, costs);
  for (const [index, row] of rows) {
    put(probe, index, "P5", displayCostCell(costs.get(row), run.timings.get(row)));
  }
  const slowest = [...run.timings]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, SLOWEST_LISTED)
    .map(([row, ms]) => `#${String(rows.find(([, candidate]) => candidate === row)?.[0])} ${ms.toFixed(1)} ms`);
  say(
    probe,
    `P5 display: ${String(pass.scripts.length)} scripts on one ${String(reply.length)}-char reply; worker loop ${run.spentMs.toFixed(1)} ms of ${String(DISPLAY_ROW_BUDGET_MS)} ms, per-script limit ${String(DISPLAY_SCRIPT_DEADLINE_MS)} ms, cut: ${run.cut}; output ${String(run.outputChars)} of ${String(DISPLAY_OUTPUT_MAX_CHARS)} chars; slowest ${slowest.join(", ")}`,
  );
}

function promptCostPhase(probe: Probe, rows: readonly (readonly [number, RegexScriptRow])[], reply: string): void {
  const pass = openRegexPass(REGEX_TEXT_PASS_BUDGET_MS);
  const macroCtx = prepareDisplayPass("", renderContext([]), REPLY).macroCtx;
  const causes = new Map<RegexScriptRow, string>();
  const costs = new Map<RegexScriptRow, number>();
  const wallStarted = performance.now();
  const cpuStarted = process.threadCpuUsage();
  let text = reply;
  for (const [, row] of rows) {
    const before = process.threadCpuUsage();
    text = pass.execute({
      text,
      scripts: [row],
      call: PROMPT_CALL,
      ctx: macroCtx,
      passInputLength: reply.length,
      onScriptFailure: (err) => {
        causes.set(row, regexNotAppliedCause(err));
      },
    });
    costs.set(row, cpuMs(before));
  }
  for (const [index, row] of rows) {
    const cause = causes.get(row);
    put(probe, index, "P5", cause === undefined ? cellOk([`${(costs.get(row) ?? 0).toFixed(2)} ms CPU`]) : cellRed([`not applied:${cause}`]));
  }
  say(
    probe,
    `P5 prompt: ${String(rows.length)} scripts on the same reply, ${(performance.now() - wallStarted).toFixed(1)} ms wall, ${cpuMs(cpuStarted).toFixed(1)} ms CPU of a ${String(REGEX_TEXT_PASS_BUDGET_MS)} ms pass budget, not applied ${String(causes.size)}`,
  );
}

// ── P4: a room of twelve turns, and the prompt the last one sends ─────────────────────────────────────────────────

// Replies sit at odd depths (1, 3, 5 ...) because each turn adds a user row. A script that strips from depth `min` is
// probed at the deepest odd depth below it, where its block must remain, and the shallowest odd depth at or past it,
// where it must be gone.
function probeDepths(min: number): { readonly keep: number | null; readonly strip: number } {
  const strip = min % 2 === 1 ? min : min + 1;
  return { keep: strip >= 3 ? strip - 2 : null, strip };
}

const depthOfTurn = (turn: number): number => 2 * (ROOM_TURNS - turn) - 1;
const turnAtDepth = (depth: number): number => ROOM_TURNS - (depth + 1) / 2;

interface DepthSubject {
  readonly index: number;
  readonly min: number;
  readonly example: Example;
}

function depthSubjects(probe: Probe, examples: ReadonlyMap<number, Example>): DepthSubject[] {
  return [...examples].flatMap(([index, example]) => {
    const raw = probe.scripts.find((script) => script.index === index)?.raw;
    return statedMax(raw?.["maxDepth"]) === null ? [{ index, min: statedMin(raw?.["minDepth"]) ?? 0, example }] : [];
  });
}

function roomReplies(subjects: readonly DepthSubject[]): string[] {
  return Array.from({ length: ROOM_TURNS }, (_, i) => {
    const turn = i + 1;
    const depth = depthOfTurn(turn);
    const blocks = subjects.filter(({ min }) => [probeDepths(min).keep, probeDepths(min).strip].includes(depth)).map(({ example }) => example.text);
    return [`${REPLY_MARKER} t${String(turn)}.`, ...blocks].join("\n\n");
  });
}

function wireByTurn(body: unknown): Map<number, string> {
  const messages = isPlainObject(body) && Array.isArray(body["messages"]) ? body["messages"] : [];
  const byTurn = new Map<number, string>();
  for (const message of messages) {
    const text = wireText(jsonValueSchema.parse(message));
    const turn = REPLY_MARKER_RE.exec(text)?.[1];
    if (turn !== undefined) {
      byTurn.set(Number(turn), text);
    }
  }
  return byTurn;
}

function depthVerdict(subject: DepthSubject, wire: ReadonlyMap<number, string>): Cell {
  const { keep, strip } = probeDepths(subject.min);
  const probes = [...(keep === null ? [] : [{ depth: keep, expectKept: true }]), { depth: strip, expectKept: false }];
  const failures: string[] = [];
  const unreached: string[] = [];
  for (const { depth, expectKept } of probes) {
    const text = wire.get(turnAtDepth(depth));
    if (text === undefined) {
      unreached.push(`depth ${String(depth)}`);
    } else if (text.includes(subject.example.text) !== expectKept) {
      failures.push(`depth ${String(depth)} ${expectKept ? "stripped" : "kept"}, expected ${expectKept ? "kept" : "stripped"}`);
    }
  }
  if (failures.length > 0) {
    return cellRed([`min ${String(subject.min)}`, ...failures]);
  }
  return unreached.length === 0 ? cellOk([`min ${String(subject.min)}`, subject.example.source]) : cellNone(`reply not on the wire at ${unreached.join(", ")}`);
}

async function setRoomLimit(room: Awaited<ReturnType<typeof textRoom>>, fileText: string): Promise<void> {
  const imported = await room.caller.preset.importFile({ fileText, fileName: FILE_NAME });
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the room's preset import landed no preset");
  }
  const { config } = await room.caller.preset.get({ id: imported.presetId });
  await room.caller.preset.update({ id: imported.presetId, config: { ...config, params: { ...config.params, maxOutputTokens: ROOM_MAX_OUTPUT_TOKENS } } });
  await room.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: imported.presetId } });
}

async function depthPhase(probe: Probe, fileText: string, examples: ReadonlyMap<number, Example>): Promise<void> {
  const subjects = depthSubjects(probe, examples);
  if (subjects.length === 0) {
    say(probe, "P4 room: no prompt-only script has an example, so no room was run");
    return;
  }
  const replies = roomReplies(subjects);
  await using room = await textRoom(replies, { memoryEnabled: false, server: { logLevel: "warn" } });
  await setRoomLimit(room, fileText);
  let lastBody: unknown;
  for (let turn = 1; turn <= ROOM_TURNS; turn += 1) {
    const sent = await wireOf(room, () => room.root.services.chat.send({ principal: room.owner, chatId: room.chatId, content: `Turn ${String(turn)}.` }));
    lastBody = sent.newest;
    await room.root.settleBackground();
    await setImmediate();
  }
  const stored = (await room.root.services.chat.listMessages({ principal: room.owner, chatId: room.chatId })).messages.filter(
    ({ role }) => role === "assistant",
  );
  const storedIntact = stored.length === ROOM_TURNS && stored.every(({ content }, i) => content === replies[i]);
  const wire = wireByTurn(lastBody);
  for (const subject of subjects) {
    const verdict = depthVerdict(subject, wire);
    put(probe, subject.index, "P4", storedIntact ? verdict : cellRed([...verdict.notes, "stored rows changed"]));
  }
  say(probe, `P4 room: ${String(ROOM_TURNS)} turns, ${String(wire.size)} replies on the last wire, stored rows ${storedIntact ? "unchanged" : "CHANGED"}`);
  const lines = room.root.observability.logLines(LOG_LINES_READ);
  const marked = lines.filter((line) => LOG_BUDGET_MARKS.some((mark) => line.includes(mark)));
  say(
    probe,
    `P5 room log: ${String(marked.length)} regex budget or deadline line(s) of ${String(lines.length)} read; history budget for ${String(ROOM_TURNS * 2)} rows is ${String(regexHistoryPassBudgetMs(ROOM_TURNS * 2))} ms`,
  );
  for (const line of marked.slice(0, SLOWEST_LISTED)) {
    say(probe, `P5 room log: ${line.slice(0, 220)}`);
  }
}

// ── The table ─────────────────────────────────────────────────────────────────────────────────────────────────────

function cellText(cell: Cell | undefined): string {
  if (cell === undefined) {
    return "-";
  }
  const notes = cell.notes.length === 0 ? "" : `:${cell.notes.join(",")}`;
  return `${VERDICT_WORDS[String(cell.ok)]}${notes}`;
}

function tableLines(probe: Probe): string[] {
  const lines = ["", ["idx", "stated", ...PHASES].join(" | ")];
  for (const script of probe.scripts) {
    const row = probe.cells.get(script.index) ?? {};
    lines.push([String(script.index), script.stated, ...PHASES.map((phase) => cellText(row[phase]))].join(" | "));
  }
  lines.push("");
  for (const phase of PHASES) {
    const cells = probe.scripts.map(({ index }) => ({ index, cell: probe.cells.get(index)?.[phase] }));
    const red = cells.filter(({ cell }) => cell?.ok === false).map(({ index }) => index);
    const ok = cells.filter(({ cell }) => cell?.ok === true).length;
    lines.push(`${phase}: ok ${String(ok)}, red ${String(red.length)}, not exercised ${String(cells.length - ok - red.length)}; red at ${JSON.stringify(red)}`);
  }
  lines.push("", "frame Markdown render: not run (the test tree has no door to it); written-text shapes by script:");
  for (const [shape, labels] of [...probe.shapes].toSorted(([a], [b]) => a.localeCompare(b))) {
    lines.push(`shape ${shape}: ${String(labels.length)} written text(s) at ${labels.join(" ")}`);
  }
  return lines;
}

function redLabels(probe: Probe): string[] {
  return PHASES.flatMap((phase) =>
    probe.scripts.filter(({ index }) => probe.cells.get(index)?.[phase]?.ok === false).map(({ index }) => `${phase}#${String(index)}`),
  );
}

function enabledRows(landed: Landed, pass: "display" | "prompt"): (readonly [number, RegexScriptRow])[] {
  return [...landed].filter(([, row]) => row.enabled && row.passes.includes(pass) && (pass === "display" || !row.passes.includes("display")));
}

async function runProbe(fileText: string): Promise<Probe> {
  const probe = newProbe(JSON.parse(fileText));
  say(probe, `preset file: ${String(probe.scripts.length)} scripts, ${String(probe.prompts.length)} prompt texts`);
  const landed = await importPhase(probe, fileText);
  const displayRows = enabledRows(landed, "display");
  const promptRows = enabledRows(landed, "prompt");
  const displayPass = prepareDisplayPass("", renderContext([]), REPLY);
  shapePhase(probe, displayRows, displayPass);
  const examples = realInputPhase(probe, displayRows, displayPass);
  const promptExamples = new Map<number, Example>();
  for (const [index, row] of promptRows) {
    const search = { row, call: PROMPT_CALL, ctx: displayPass.macroCtx };
    const found = findExample(search, probe, {
      usable: (text) => !text.includes("{{") && hitsIn(search, text) !== "watchdog" && hitsIn(search, text).length > 0,
      shortest: true,
    });
    if ("found" in found) {
      promptExamples.set(index, found.found);
    } else {
      put(probe, index, "P4", found.absent.startsWith("watchdog") ? cellRed([found.absent]) : cellNone(found.absent));
    }
  }
  const reply = ["Reply prose.", ...[...examples.values(), ...promptExamples.values()].map(({ text }) => text)].join("\n\n");
  displayCostPhase(probe, displayRows, reply);
  promptCostPhase(probe, promptRows, reply);
  if (landed.size > 0) {
    await depthPhase(probe, fileText, promptExamples);
  }
  return probe;
}

test.skipIf(PRESET_PATH === undefined)("every regex script of a preset file through the app's own pipelines", { timeout: RUN_TIMEOUT_MS }, async () => {
  const probe = await runProbe(await readFile(PRESET_PATH ?? "", "utf8"));
  process.stdout.write(`${[...probe.lines, ...tableLines(probe)].join("\n")}\n`);
  expect(probe.scripts.length).toBeGreaterThan(0);
  const reds = redLabels(probe);
  // The count, not the list: the table above names every red script, and a list here repeats it per assertion line.
  expect(reds.length, "the red scripts are in the table above").toBe(0);
});

test("the probe's detectors fire on a planted stylesheet, a planted mismatch and a planted tag", () => {
  const css = ".planted-line{color:red}";
  expect(leaksAny(`prose\n${css}`, rawElementLines(`<style>\n${css}\n</style>`))).toBe(true);
  expect(leaksAny("prose only", rawElementLines(`<style>\n${css}\n</style>`))).toBe(false);
  expect(rawElementLines("<div>no style here</div>")).toEqual([]);
  expect(shapeOf(`<div><style>\n${css}\n\n${css}\n</style></div>`)).toContain(STYLE_AFTER_TAG_BLANK_LINE);
  expect(shapeOf(`<style>\n${css}\n${css}\n</style>`)).not.toContain(STYLE_AFTER_TAG_BLANK_LINE);
  expect(COMPLETE_TAG_RE.test(stripTags("a <b"))).toBe(false);
  expect(COMPLETE_TAG_RE.test("a <b>tag</b>")).toBe(true);
  const row = prepareDisplayPass("", renderContext([]), REPLY);
  expect(row.scripts).toEqual([]);
  expect(probeDepths(1)).toEqual({ keep: null, strip: 1 });
  expect(probeDepths(4)).toEqual({ keep: 3, strip: 5 });
  expect(probeDepths(5)).toEqual({ keep: 3, strip: 5 });
  expect(turnAtDepth(depthOfTurn(5))).toBe(5);
});
