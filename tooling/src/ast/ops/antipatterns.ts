// `pnpm ast antipatterns [--scope <dir>]` — run every antipattern detector in one structure pass and print the
// hits by class, waived or not. The class table is the machine half of docs/law/enforcement-antipatterns.md:
// a class names its detecting gates; the doc carries the examples and burn-down items. Waived hits are read off
// the pass's own marker consumption, so a green structure run still shows the debt it carries.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import type { SpawnNicedResult } from "@orb/tooling/floor/process/proc-contract";
import { print } from "../../floor/artifacts/artifacts.ts";
import type { StructureArtifact, StructureArtifactGate, StructureArtifactPolicy } from "../../floor/artifacts/structure-artifact-contract.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type { AntipatternVerdict } from "../contract/types.ts";
import { parseFlags } from "../lib/emit.ts";
import { beginRun, exitToolError, finishRun, noteMatches, noteScope, noteUnits } from "../lib/ledger.ts";
import { REPO_ROOT } from "../lib/root.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast antipatterns");

/** Antipattern class → the gates that detect it. Order is print order. */
export const ANTIPATTERN_CLASSES = [
  {
    name: "contract-copy",
    gates: [
      "contract-structural-copy",
      "contract-derives-not-respells",
      "no-inline-wire-interface",
      "no-inline-domain-interface",
      "no-inline-package-interface",
      "no-inline-types",
      "test-hand-shape",
    ],
  },
  { name: "copied-logic", gates: ["test-production-clone"] },
  { name: "unparsed-boundary", gates: ["json-column-read-parsed", "wire-json-parsed-at-consumer", "trpc-input-declarations", "zod-output-twin-parity"] },
  { name: "respelled-constant", gates: ["no-inline-union-alias", "no-inline-union-redecl", "testid-typed-only", "testid-typed-only-stories"] },
  { name: "cast", gates: ["no-loose-id-cast", "no-mint-via-cast", "no-test-fabrication"] },
  { name: "hand-forged-id", gates: ["no-raw-id", "brand-in-name-position", "typeid-prefix-boundary", "no-fake-disabled-id"] },
  { name: "impossible-fixture", gates: ["no-opaque-test-fixture", "test-factory-contract", "test-determinism"] },
  { name: "mock-of-own-code", gates: ["test-mock-doctrine"] },
  { name: "copied-door-list", gates: ["ct-config-mirror-parity"] },
  { name: "file-name-mirror", gates: ["test-layout", "test-reach", "test-presence-client"] },
  { name: "one-shot-live-read", gates: ["ct-no-oneshot-live-read-assert"] },
  { name: "swallowed-failure", gates: ["caught-failure-ownership"] },
  { name: "unscoped-owner-read", gates: ["owner-scoped-reads", "owner-scoped-writes"] },
  { name: "superseded-spelling", gates: ["platform-spellings"] },
  { name: "vanity-alias", gates: ["no-vanity-alias"] },
] as const satisfies readonly { readonly name: string; readonly gates: readonly string[] }[];

export const ANTIPATTERNS_VERB = "antipatterns";
const CORPUS_STRUCTURE = "check:structure(antipattern gates)";
const SCOPE_FLAG = "--scope";
// The whole-tree pass of every class gate took about 220 s on 2026-10-11 (`pnpm ast antipatterns`); the base
// keeps headroom over that on a quiet box and `budget()` stretches it under load, up to the floor's ceiling.
const STRUCTURE_PASS_BASE_MS = 300_000;
/** How much of a failed pass's output the tool error quotes. */
const OUTPUT_TAIL_CHARS = 2000;
const ARTIFACT_RE = /read (reports\/runs\/structure\/\S+\/check-structure\.json)/u;
const MARKER_RE = /@orb-waive(?:-file)?\s+([a-z][a-z0-9-]*)\(([^()\r\n]+)\)/u;
// The waiver ratchet's alarm. Its rows are measured at the application scope the structure barrier judges, so a
// whole-repository pass (tooling suites included) reads it as a report line, never as a failing hit.
const BUDGET_ALARM = "waiver-budget";
const CONSUMPTION_RE = /^(?<file>.+):(?<line>\d+):\d+$/u;
// Exit 0 is a clean pass and 1 is findings; every other exit is a refusal or a crash.
const VERDICT_EXITS: ReadonlySet<number | null> = new Set([EXIT.clean, EXIT.violations]);

/** `--scope <dir>` or `--scope=<dir>`; nothing else is accepted. */
export function parseAntipatternScope(tokens: readonly string[]): string | undefined {
  if (tokens.length === 0) {
    return;
  }
  const [flag, value, ...rest] = tokens;
  const inline = flag?.startsWith(`${SCOPE_FLAG}=`) === true ? flag.slice(SCOPE_FLAG.length + 1) : undefined;
  const scope = inline ?? (flag === SCOPE_FLAG ? value : undefined);
  const extra = inline === undefined ? rest : [value, ...rest].filter((token) => token !== undefined);
  if (scope === undefined || scope === "" || extra.length > 0) {
    throw new UsageError(`usage: pnpm ast antipatterns [${SCOPE_FLAG} <dir>] — got ${JSON.stringify(tokens.join(" "))}`);
  }
  return scope;
}

function antipatternGates(): readonly string[] {
  return [...new Set(ANTIPATTERN_CLASSES.flatMap((cls) => cls.gates))];
}

/** The waived hits each gate consumed: every matched marker, read back from its own source line. */
function waivedHits(policy: StructureArtifactPolicy, readText: (rel: string) => string): Map<string, string[]> {
  const byGate = new Map<string, string[]>();
  const lines = new Map<string, readonly string[]>();
  for (const { id, count } of policy.authority.ordinaryConsumption) {
    const at = CONSUMPTION_RE.exec(id)?.groups;
    if (count === 0 || at?.["file"] === undefined || at["line"] === undefined) {
      continue;
    }
    const file = at["file"];
    const source = lines.get(file) ?? readText(file).split(/\r?\n/u);
    lines.set(file, source);
    const marker = MARKER_RE.exec(source[Number(at["line"]) - 1] ?? "");
    if (marker?.[1] !== undefined) {
      const list = byGate.get(marker[1]) ?? [];
      list.push(`${file}:${at["line"]} (${marker[2]})`);
      byGate.set(marker[1], list);
    }
  }
  return byGate;
}

function render(
  policy: StructureArtifactPolicy,
  gates: ReadonlyMap<string, StructureArtifactGate>,
  readText: (rel: string) => string,
): { lines: string[]; failing: number } {
  const waived = waivedHits(policy, readText);
  const alarms = policy.authority.alarms;
  const lines: string[] = [];
  let failing = 0;
  for (const cls of ANTIPATTERN_CLASSES) {
    const ran = cls.gates.flatMap((id) => {
      const gate = gates.get(id);
      return gate === undefined ? [] : [gate];
    });
    const open = ran.flatMap((gate) => gate.violations.map((v) => `  unwaived ${gate.name}  ${v.file}:${v.line}  ${v.token ?? ""}`));
    const own = alarms.filter((alarm) => cls.gates.some((id) => id === alarm.policyId));
    const alarmed = own.filter((alarm) => alarm.kind !== BUDGET_ALARM).map((alarm) => `  alarm    ${alarm.policyId}  ${alarm.message}`);
    const ratchet = own.filter((alarm) => alarm.kind === BUDGET_ALARM).map((alarm) => `  budget   ${alarm.policyId}  ${alarm.message}`);
    const withheld = ran.filter((gate) => gate.withheld).map((gate) => `  withheld ${gate.name}  needs the whole tree; run without ${SCOPE_FLAG}`);
    const held = ran.flatMap((gate) => (waived.get(gate.name) ?? []).map((site) => `  waived   ${gate.name}  ${site}`));
    const heldCount = ran.reduce((n, gate) => n + gate.waived + gate.granted, 0);
    failing += open.length + alarmed.length;
    lines.push(`${cls.name}: ${open.length} unwaived, ${heldCount} waived (${cls.gates.join(", ")})`, ...open, ...alarmed, ...ratchet, ...withheld, ...held);
  }
  return { lines, failing };
}

/**
 * Judge one finished structure pass. A killed child, a refused selection (an unknown check exits 3), a pass
 * with no artifact, a tool error, or a class gate missing from the artifact is no verdict, never a clean run.
 * @param scoped - a `--scope` run, where a whole-population gate is legitimately withheld.
 */
export function judgeAntipatternPass(res: SpawnNicedResult, scoped: boolean, readText: (rel: string) => string): AntipatternVerdict {
  const output = `${res.stdout}\n${res.stderr}`.slice(-OUTPUT_TAIL_CHARS);
  const artifactPath = ARTIFACT_RE.exec(res.stdout)?.[1];
  if (res.timedOut || !VERDICT_EXITS.has(res.code) || artifactPath === undefined) {
    const why = res.timedOut ? "was killed at its time budget" : `exited ${String(res.code)}`;
    return { kind: "no-verdict", reason: `the structure pass ${why} and gave no verdict.\n${output}` };
  }
  const artifact = JSON.parse(readText(artifactPath)) as StructureArtifact;
  if (artifact.policy === null) {
    return { kind: "no-verdict", reason: `the structure pass at ${artifactPath} resolved no policy` };
  }
  const errors = [...artifact.policy.toolErrors, ...artifact.policy.authority.toolErrors].map((e) => e.message);
  if (errors.length > 0) {
    return { kind: "no-verdict", reason: `the structure pass reported tool errors: ${errors.join("; ")}` };
  }
  const gates = new Map(artifact.gates.map((gate) => [gate.name, gate]));
  const missing = antipatternGates().filter((id) => !gates.has(id));
  if (missing.length > 0) {
    return { kind: "no-verdict", reason: `the structure pass did not run ${missing.join(", ")}; fix ANTIPATTERN_CLASSES` };
  }
  const withheld = scoped ? [] : artifact.gates.filter((gate) => gate.withheld).map((gate) => gate.name);
  if (withheld.length > 0) {
    return { kind: "no-verdict", reason: `the whole-tree pass withheld ${withheld.join(", ")}` };
  }
  const populationFiles = Math.max(0, ...artifact.gates.map((gate) => gate.population.effectiveSourcePaths));
  return { kind: "verdict", ...render(artifact.policy, gates, readText), populationFiles };
}

/** The verb entry: one ledgered run around {@link cmdAntipatterns}; exit 1 when any hit is unwaived. */
export async function runAntipatterns(tokens: readonly string[]): Promise<number> {
  beginRun(ANTIPATTERNS_VERB, CORPUS_STRUCTURE, parseFlags([]));
  await cmdAntipatterns(tokens);
  finishRun();
  return typeof process.exitCode === "number" ? process.exitCode : EXIT.clean;
}

async function cmdAntipatterns(tokens: readonly string[]): Promise<void> {
  const scope = parseAntipatternScope(tokens);
  const gates = antipatternGates();
  noteUnits("gates", gates.length);
  noteScope(scope === undefined ? "whole-repository" : `folder:${scope}`);
  const args = ["check:structure", ...gates.flatMap((id) => ["--check", id]), ...(scope === undefined ? [] : ["--folder", scope])];
  const res = await spawnNiced("pnpm", args, { cwd: REPO_ROOT, timeoutMs: budget(STRUCTURE_PASS_BASE_MS) });
  const verdict = judgeAntipatternPass(res, scope !== undefined, (rel) => readFileSync(join(REPO_ROOT, rel), "utf8"));
  if (verdict.kind === "no-verdict") {
    exitToolError(`antipatterns: ${verdict.reason}`);
  }
  noteUnits("population-files", verdict.populationFiles);
  for (const line of verdict.lines) {
    print(line);
  }
  noteMatches(verdict.failing, verdict.failing);
  if (verdict.failing > 0) {
    process.exitCode = EXIT.violations;
  }
}
