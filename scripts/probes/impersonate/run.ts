// IMP-1 probe — DOES THE VOICE-LOCK NUDGE HOLD? (measure before building)
//
// ST runs TWO anti-bleed layers on impersonate (char-name stop strings + a wrong-name response DELETE —
// `docs/reviews/misc/2026-08-01-st-impersonate-anatomy.md`); ours is prompt-side only (the voice-lock
// `impersonateNudge`) plus the incidental receive clean. This probe drives REAL impersonate generations
// through the production prompt assembly (see `prompt.ts`) across 12 bleed-tempting fixtures and two arms —
// the local vLLM 8B (weak instruction-following, where ST's second layer earns its keep) and one cheap
// hosted model — then scores each output for character-voice bleed, raw and post-production-clean.
//
// Resumable: every completed (arm, layer, fixture, sample) is APPENDED to the results JSONL as it lands and
// is skipped on a re-run. Delete the file (or set IMP_OUT) for a clean measurement.
//
//   node_modules/.bin/tsx scripts/probes/impersonate/run.ts
//
// | env            | default              | effect                                                        |
// |----------------|----------------------|---------------------------------------------------------------|
// | IMP_ARMS       | local                | comma list: `local`, `hosted`                                  |
// | IMP_SAMPLES    | 3 local / 1 hosted   | generations per fixture per arm                                |
// | IMP_FIXTURES   | all                  | comma list of fixture ids                                      |
// | IMP_OUT        | results.jsonl        | results path, relative to this directory                       |
// | IMP_LOCAL_URL  | http://127.0.0.1:8703| the vLLM generation engine                                     |
// | IMP_HOSTED_MODEL | openai/gpt-4.1-mini| the OpenRouter model for the hosted arm                        |
// | IMP_DRY        | unset                | print the assembled prompt of each fixture and exit (no spend) |
// | IMP_SCORE_ONLY | unset                | re-score the saved results with the current scorer (no spend)  |
// | IMP_LAYER      | off                  | `on` = send the IMP-1 char-name stop set on the wire            |
// | IMP_JUDGE      | unset                | run the blind who-is-speaking judge over unjudged samples      |
// | IMP_JUDGE_MODEL| anthropic/claude-sonnet-5 | the judge model (one hosted call per sample)              |

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { foreignLabelStops } from "@orb/kit/speaker-label";
import type { ImpersonateFixture } from "./fixtures";
import { FIXTURES } from "./fixtures";
import type { BuiltRequest } from "./prompt";
import { buildRequest } from "./prompt";
import type { Scored } from "./score";
import { applyLegacyClean, applyProductionClean, scoreBleed } from "./score";

// The ONE env read-site. A probe harness IS its env knobs (that is the interface you type at the shell), so
// they are aliased here once rather than suppressed at thirteen call sites.
// biome-ignore lint/style/noProcessEnv: see above — deliberate, single-site, dev-tooling only.
const ENV = process.env;

const LINE_SPLIT_RE = /\r?\n/;
const SURROUNDING_QUOTE_RE = /^["']|["']$/g;

const HERE = import.meta.dirname;
// JSONL, one sample per line: the file is APPENDED to as each generation lands (so an interrupted run
// keeps everything it paid for), and each record is self-contained — including the rendered nudge it was
// generated under. Rewritten whole only by the judge / re-score passes, which mutate existing records.
const OUT = path.join(HERE, ENV["IMP_OUT"] ?? "results.jsonl");
const LOCAL_URL = ENV["IMP_LOCAL_URL"] ?? "http://127.0.0.1:8703";
const HOSTED_MODEL = ENV["IMP_HOSTED_MODEL"] ?? "openai/gpt-4.1-mini";
// The CALIBRATED judge (see `judgeSample`). Stamped with a prompt version so a judge-prompt edit
// invalidates the stored verdicts instead of silently mixing two rubrics in one results file.
const JUDGE_MODEL = ENV["IMP_JUDGE_MODEL"] ?? "anthropic/claude-sonnet-5";
const JUDGE_STAMP = `${JUDGE_MODEL}#reason-then-verdict`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Production's materialized output reserve (`DEFAULT_MAX_OUTPUT_TOKENS`) — an impersonate turn sets no
// explicit maxOutputTokens, so this is the number a real turn sends.
const MAX_TOKENS = 2048;
// Judge + report shaping constants (the harness's own presentation, no domain meaning).
const JUDGE_MAX_TOKENS = 300;
const ERROR_SNIPPET_CHARS = 300;
const LOCAL_SAMPLES_DEFAULT = 3;
const HOSTED_SAMPLES_DEFAULT = 1;
const PERCENT = 100;
const RULE_WIDTH = 82;
const DRY_RULE_WIDTH = 100;
const COL_FIXTURE = 25;
const COL_JUDGED = 14;
const COL_LABEL = 12;
const COL_LAUNDERED = 11;
const TOTAL_INDENT = 20;
// `on` ⇒ the wire carries the IMP-1 char-name stop set (the built layer-2a). The receive-side clean is
// ALWAYS production's current one — `score.ts` mirrors it — with the pre-IMP-1 clean kept beside it so the
// laundering the fix removed stays measurable on the same bytes.
const LAYER: LayerName = (ENV["IMP_LAYER"] ?? "off") === "on" ? "on" : "off";

type ArmName = "local" | "hosted";
type LayerName = "off" | "on";

interface Sample {
  readonly arm: ArmName;
  readonly model: string;
  readonly fixture: string;
  readonly sample: number;
  /** Which anti-bleed layer the WIRE carried. Absent on the pre-layer baseline samples ⇒ "off". */
  readonly layer?: LayerName;
  readonly raw: string;
  readonly cleaned: string;
  /** The same bytes through the PRE-IMP-1 clean — the laundering comparison. */
  readonly legacyCleaned?: string;
  readonly finishReason: string | null;
  rawScore: Scored;
  cleanScore: Scored;
  /** The rendered impersonateNudge this generation ran under — the receipt, per record. */
  readonly nudge: string;
  /** The blind judge's verdict on the RAW text — the primary bleed measure. */
  judge?: { verdict: JudgeVerdict; model: string };
}

/** PERSONA = the line is the user's persona speaking in their own voice (no bleed). CHARACTER = it is the
 *  card character speaking / being narrated. MIXED = it starts as one and slides into the other. */
type JudgeVerdict = "PERSONA" | "CHARACTER" | "MIXED" | "UNPARSED";
const JUDGE_VERDICTS: readonly JudgeVerdict[] = ["PERSONA", "CHARACTER", "MIXED"];

function readSamples(): Sample[] {
  if (!fs.existsSync(OUT)) {
    return [];
  }
  return fs
    .readFileSync(OUT, "utf8")
    .split(LINE_SPLIT_RE)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Sample);
}

function appendSample(s: Sample): void {
  fs.appendFileSync(OUT, `${JSON.stringify(s)}\n`);
}

/** Whole-file rewrite — the judge / re-score passes mutate records in place. */
function rewriteSamples(samples: readonly Sample[]): void {
  fs.writeFileSync(OUT, samples.map((s) => `${JSON.stringify(s)}\n`).join(""));
}

/** The OpenRouter key: the env first, else the repo `.env` (this probe runs from a worktree, whose checkout
 *  carries no `.env` — the main checkout's is the one the owner maintains). Never printed. */
function openRouterKey(): string {
  const fromEnv = ENV["OPENROUTER_PROBE_KEY"] ?? ENV["OPENROUTER_API_KEY"];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  const candidates = [path.join(HERE, "../../../.env"), path.join(HERE, "../../../../../../.env")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) {
      continue;
    }
    for (const key of ["OPENROUTER_PROBE_KEY=", "OPENROUTER_API_KEY="]) {
      const line = fs
        .readFileSync(file, "utf8")
        .split(LINE_SPLIT_RE)
        .find((l) => l.startsWith(key));
      if (line !== undefined) {
        const value = line.slice(key.length).trim().replace(SURROUNDING_QUOTE_RE, "");
        if (value.length > 0) {
          return value;
        }
      }
    }
  }
  throw new Error("no OPENROUTER_PROBE_KEY / OPENROUTER_API_KEY in env or .env");
}

interface Completion {
  readonly text: string;
  readonly finishReason: string | null;
}

interface WireResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string | null }; readonly finish_reason?: string | null }[];
  readonly error?: unknown;
}

async function complete(url: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<Completion> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const json = (await res.json()) as WireResponse;
  const choice = json.choices?.[0];
  if (choice === undefined) {
    throw new Error(`${url} → ${JSON.stringify(json.error ?? json).slice(0, ERROR_SNIPPET_CHARS)}`);
  }
  return { text: choice.message?.content ?? "", finishReason: choice.finish_reason ?? null };
}

async function localModel(): Promise<string> {
  const res = await fetch(`${LOCAL_URL}/v1/models`);
  const json = (await res.json()) as { data?: readonly { id: string }[] };
  const id = json.data?.[0]?.id;
  if (id === undefined) {
    throw new Error(`no model served at ${LOCAL_URL}`);
  }
  return id;
}

function generate(arm: ArmName, model: string, built: BuiltRequest, key: string): Promise<Completion> {
  // Sampling knobs are UNSET on purpose: the shipped default preset carries `params: {}`, so a production
  // impersonate turn sends only `max_tokens` (+ the turn's stop set) and lets the backend's defaults stand.
  const body = {
    model,
    messages: built.messages,
    max_tokens: MAX_TOKENS,
    stream: false,
    ...(LAYER === "on" ? { stop: foreignLabelStops([...built.castNames]) } : {}),
  };
  return arm === "local" ? complete(`${LOCAL_URL}/v1/chat/completions`, body, {}) : complete(OPENROUTER_URL, body, { Authorization: `Bearer ${key}` });
}

function scoreSample(s: Sample, fx: ImpersonateFixture): void {
  const cast = fx.cast.map((c) => c.name);
  s.rawScore = scoreBleed(s.raw, cast, fx.persona.name);
  s.cleanScore = scoreBleed(s.cleaned, cast, fx.persona.name);
}

/** The blind who-is-speaking judge — the PRIMARY bleed measure. Sees the two people in the scene, the
 *  character's last line, and the candidate; never the arm, the model, the nudge, or what the probe is
 *  trying to prove.
 *
 *  CALIBRATED against a hand-read of the 36 local transcripts (33/36 agreement, the 3 misses being the
 *  genuinely ambiguous lines). Two framings measurably failed first and are pinned here so they aren't
 *  re-tried: (1) presenting the character's last line as "has JUST said" + "then this line was written"
 *  primes turn-taking, and the judge rationalizes an obvious character line as the persona's reply; (2) a
 *  one-word answer with no room to reason passes takeovers that the same model attributes correctly when
 *  it may write a sentence first. Hence: neutral framing, reason-then-verdict, verdict on the LAST line. */
async function judgeSample(text: string, fx: ImpersonateFixture, key: string): Promise<JudgeVerdict> {
  const body = text.trim();
  if (body.length === 0) {
    return "UNPARSED";
  }
  const lastAssistant = [...fx.canon].reverse().find((r) => r.role === "assistant");
  const speaker = fx.cast.find((c) => c.name === lastAssistant?.authorName) ?? fx.character;
  const { text: out } = await complete(
    OPENROUTER_URL,
    {
      model: JUDGE_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            "Two people are in this roleplay scene:",
            `A) ${fx.persona.name} — ${fx.persona.description}`,
            `B) ${speaker.name} — ${speaker.description}`,
            "",
            `Earlier in the scene, B (${speaker.name}) said:`,
            "---",
            lastAssistant?.content ?? "",
            "---",
            "",
            "Here is a line from the scene. Attribute it:",
            "---",
            body,
            "---",
            "",
            "Who is speaking in that line — A or B? Judge from what the speaker claims, owns, knows and demands, not from turn order (either of them may have said it). A line spoken with B's authority, role or possessions is B's however it is phrased.",
            "",
            `Think in one sentence, then end your reply with exactly one word on its own final line: PERSONA (A, ${fx.persona.name}), CHARACTER (B, ${speaker.name}, or a line narrating B), or MIXED.`,
          ].join("\n"),
        },
      ],
    },
    { Authorization: `Bearer ${key}` },
  );
  const verdictLine = (out.trim().split("\n").at(-1) ?? "").toUpperCase();
  return JUDGE_VERDICTS.find((v) => verdictLine.includes(v)) ?? "UNPARSED";
}

function selectedFixtures(): readonly ImpersonateFixture[] {
  const ids = ENV["IMP_FIXTURES"]?.split(",").map((s) => s.trim());
  return ids === undefined ? FIXTURES : FIXTURES.filter((f) => ids.includes(f.id));
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * PERCENT).toFixed(0)}%`;
}

/** A sample the judge called the character's voice (or a slide into it). */
function judgedBleed(s: Sample): boolean {
  return s.judge?.verdict === "CHARACTER" || s.judge?.verdict === "MIXED";
}

/** The model emitted a CHARACTER label that the PRE-IMP-1 receive clean stripped — the character's words
 *  then reached the composer as the user's own, with their only visible tell removed. ST deletes the whole
 *  reply in this case; post-IMP-1 we keep the label so the reviewer can see it. */
function laundered(s: Sample): boolean {
  // The baseline samples predate the `legacyCleaned` field — for them `cleaned` IS the legacy clean.
  return s.rawScore.flags.charSelfLabel && (s.legacyCleaned ?? s.cleaned) !== s.raw;
}

function report(samples: readonly Sample[]): void {
  const groups = [...new Set(samples.map((s) => `${s.arm}/${s.layer ?? "off"}`))];
  for (const group of groups) {
    const rows = samples.filter((s) => `${s.arm}/${s.layer ?? "off"}` === group);
    console.log(`\n=== ${group} (${rows[0]?.model ?? "?"}) — ${rows.length} generations ===`);
    console.log("fixture                  judged-bleed  char-label  laundered  mech-flags");
    console.log("-".repeat(RULE_WIDTH));
    for (const fx of selectedFixtures()) {
      const mine = rows.filter((s) => s.fixture === fx.id);
      if (mine.length === 0) {
        continue;
      }
      const judged = mine.filter(judgedBleed).length;
      const labels = mine.filter((s) => s.rawScore.flags.charSelfLabel).length;
      const laund = mine.filter(laundered).length;
      const flags = [...new Set(mine.flatMap((s) => s.rawScore.hits.map((h) => h.split(":")[0] ?? h)))].join(",");
      console.log(
        `${fx.id.padEnd(COL_FIXTURE)}${`${judged}/${mine.length}`.padEnd(COL_JUDGED)}${`${labels}/${mine.length}`.padEnd(COL_LABEL)}${`${laund}/${mine.length}`.padEnd(COL_LAUNDERED)}${flags}`,
      );
    }
    const judgedTotal = rows.filter(judgedBleed).length;
    const labelTotal = rows.filter((s) => s.rawScore.flags.charSelfLabel).length;
    const laundTotal = rows.filter(laundered).length;
    console.log("-".repeat(RULE_WIDTH));
    console.log(
      `TOTAL${" ".repeat(TOTAL_INDENT)}${`${judgedTotal}/${rows.length} (${pct(judgedTotal, rows.length)})`.padEnd(COL_JUDGED)}${`${labelTotal}/${rows.length}`.padEnd(COL_LABEL)}${`${laundTotal}/${rows.length}`}`,
    );
  }
}

/** `IMP_DRY` — print each fixture's assembled request and spend nothing. */
function printPrompts(fixtures: readonly ImpersonateFixture[]): void {
  for (const fx of fixtures) {
    const built = buildRequest(fx);
    console.log(`\n${"=".repeat(DRY_RULE_WIDTH)}\n${fx.id} — ${fx.tempts}\n${"=".repeat(DRY_RULE_WIDTH)}`);
    for (const m of built.messages) {
      console.log(`\n--- ${m.role}${m.name !== undefined ? ` (name=${m.name})` : ""} ---\n${m.content}`);
    }
  }
}

/** `IMP_JUDGE` — the blind who-is-speaking pass over every sample not yet judged by THIS judge stamp. */
async function judgeAll(samples: readonly Sample[]): Promise<void> {
  const key = openRouterKey();
  for (const s of samples) {
    const fx = FIXTURES.find((f) => f.id === s.fixture);
    if (fx === undefined || s.judge?.model === JUDGE_STAMP) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — each verdict is persisted before the next call, so an interrupted judge pass resumes instead of re-buying every judgment.
    s.judge = { verdict: await judgeSample(s.raw, fx, key), model: JUDGE_STAMP };
    rewriteSamples(samples);
    console.log(`  judge ${s.arm}/${s.fixture}#${s.sample} → ${s.judge.verdict}`);
  }
}

/** One arm's generations, resumable: a completed `(arm, layer, fixture, sample, model)` is skipped. */
async function runArm(args: {
  readonly arm: ArmName;
  readonly model: string;
  readonly fixtures: readonly ImpersonateFixture[];
  readonly samples: Sample[];
  readonly key: string;
}): Promise<void> {
  const { arm, model, fixtures, samples: collected, key } = args;
  const samples = Number(ENV["IMP_SAMPLES"] ?? (arm === "local" ? LOCAL_SAMPLES_DEFAULT : HOSTED_SAMPLES_DEFAULT));
  console.log(`\n### arm ${arm} — ${model} × ${fixtures.length} fixtures × ${samples}`);
  for (const fx of fixtures) {
    const built = buildRequest(fx);
    for (let i = 1; i <= samples; i++) {
      if (collected.some((s) => s.arm === arm && s.fixture === fx.id && s.sample === i && s.model === model && (s.layer ?? "off") === LAYER)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — one generation at a time keeps the local engine off its queue and persists each sample before the next is bought.
      const { text, finishReason } = await generate(arm, model, built, key);
      const cleaned = applyProductionClean(text, built.castNames, built.personaName);
      const sample: Sample = {
        arm,
        model,
        layer: LAYER,
        fixture: fx.id,
        sample: i,
        nudge: built.nudge,
        legacyCleaned: applyLegacyClean(text, built.castNames),
        raw: text,
        cleaned,
        finishReason,
        rawScore: scoreBleed(text, built.castNames, built.personaName),
        cleanScore: scoreBleed(cleaned, built.castNames, built.personaName),
      };
      collected.push(sample);
      appendSample(sample);
      console.log(`  ${fx.id} #${i} — ${text.length}ch ${sample.cleanScore.bleed ? `BLEED [${sample.cleanScore.hits.join(" ")}]` : "clean"}`);
    }
  }
}

async function main(): Promise<void> {
  const fixtures = selectedFixtures();
  const samples = readSamples();

  if (ENV["IMP_DRY"] !== undefined) {
    printPrompts(fixtures);
    return;
  }

  if (ENV["IMP_JUDGE"] !== undefined) {
    await judgeAll(samples);
    report(samples);
    return;
  }

  if (ENV["IMP_SCORE_ONLY"] !== undefined) {
    for (const s of samples) {
      const fx = FIXTURES.find((f) => f.id === s.fixture);
      if (fx !== undefined) {
        scoreSample(s, fx);
      }
    }
    rewriteSamples(samples);
    report(samples);
    return;
  }

  const arms = (ENV["IMP_ARMS"] ?? "local").split(",").map((s) => s.trim()) as ArmName[];
  const key = arms.includes("hosted") ? openRouterKey() : "";
  for (const arm of arms) {
    // biome-ignore lint/performance/noAwaitInLoops: two arms at most, and they must not interleave — the local engine and the hosted endpoint are reported as separate measurements.
    const model = arm === "local" ? await localModel() : HOSTED_MODEL;
    await runArm({ arm, model, fixtures, samples, key });
  }
  report(samples);
  console.log(`\nfull transcripts → ${OUT}\n`);
}

await main();
