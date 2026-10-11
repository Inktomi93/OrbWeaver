// `pnpm ast antipatterns [--scope <dir>]` — run every antipattern detector in one structure pass and print the
// hits by class, waived or not. The class table is the machine half of docs/law/enforcement-antipatterns.md:
// a class names its detecting gates; the doc carries the examples and burn-down items. Waived hits are read off
// the pass's own marker consumption, so a green structure run still shows the debt it carries.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { parseFlags } from "../lib/emit.ts";
import { beginRun, exitToolError, finishRun, noteMatches, noteScope, noteUnits } from "../lib/ledger.ts";
import { REPO_ROOT } from "../lib/root.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast antipatterns");

/** Antipattern class → the gates that detect it. Order is print order. */
export const ANTIPATTERN_CLASSES = [
  {
    name: "contract-copy",
    gates: ["contract-structural-copy", "contract-derives-not-respells", "no-inline-wire-interface", "no-inline-domain-interface", "no-inline-types"],
  },
  { name: "unparsed-boundary", gates: ["json-column-read-parsed", "wire-json-parsed-at-consumer", "trpc-input-declarations", "zod-output-twin-parity"] },
  { name: "respelled-constant", gates: ["no-inline-union-alias", "no-inline-union-redecl", "testid-typed-only", "testid-typed-only-stories"] },
  { name: "cast", gates: ["no-loose-id-cast", "no-mint-via-cast", "no-test-fabrication"] },
  { name: "hand-forged-id", gates: ["no-raw-id", "brand-in-name-position", "typeid-prefix-boundary", "no-fake-disabled-id"] },
  { name: "impossible-fixture", gates: ["no-opaque-test-fixture", "test-factory-contract", "test-determinism"] },
  { name: "mock-of-own-code", gates: ["test-mock-doctrine"] },
  { name: "copied-door-list", gates: ["ct-config-mirror-parity"] },
  { name: "file-name-mirror", gates: ["test-layout", "test-presence"] },
  { name: "one-shot-live-read", gates: ["ct-no-oneshot-live-read-assert"] },
  { name: "swallowed-failure", gates: ["caught-failure-ownership"] },
  { name: "unscoped-owner-read", gates: ["owner-scoped-reads", "owner-scoped-writes"] },
  { name: "superseded-spelling", gates: ["platform-spellings"] },
  { name: "vanity-alias", gates: ["no-vanity-alias"] },
] as const satisfies readonly { readonly name: string; readonly gates: readonly string[] }[];

export const ANTIPATTERNS_VERB = "antipatterns";
const CORPUS_STRUCTURE = "check:structure(antipattern gates)";
const SCOPE_FLAG = "--scope";
/** How much of a failed pass's stderr the tool error quotes. */
const STDERR_TAIL_CHARS = 2000;
const ARTIFACT_RE = /read (reports\/runs\/structure\/\S+\/check-structure\.json)/u;
const MARKER_RE = /@orb-waive(?:-file)?\s+([a-z][a-z0-9-]*)\(([^()\r\n]+)\)/u;

interface StructureGate {
  readonly name: string;
  readonly violations: readonly { readonly file: string; readonly line: number; readonly token?: string }[];
  readonly waived: number;
  readonly population: { readonly effectiveSourcePaths: number };
}

interface StructureArtifact {
  readonly gates: readonly StructureGate[];
  readonly policy: {
    readonly toolErrors: readonly { readonly message: string }[];
    readonly authority: { readonly ordinaryConsumption: readonly { readonly id: string; readonly count: number }[] };
  };
}

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

/** The waived hits one gate consumed: each matched marker, read back from its own source line. */
function waivedHits(artifact: StructureArtifact): Map<string, string[]> {
  const byGate = new Map<string, string[]>();
  const lines = new Map<string, readonly string[]>();
  for (const { id, count } of artifact.policy.authority.ordinaryConsumption) {
    const at = /^(?<file>.+):(?<line>\d+):\d+$/u.exec(id)?.groups;
    if (count === 0 || at?.["file"] === undefined || at["line"] === undefined) {
      continue;
    }
    const file = at["file"];
    const source = lines.get(file) ?? readFileSync(join(REPO_ROOT, file), "utf8").split("\n");
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

function render(artifact: StructureArtifact): number {
  const gates = new Map(artifact.gates.map((gate) => [gate.name, gate]));
  const waived = waivedHits(artifact);
  let unwaived = 0;
  for (const cls of ANTIPATTERN_CLASSES) {
    const ran = cls.gates.flatMap((id) => {
      const gate = gates.get(id);
      return gate === undefined ? [] : [gate];
    });
    const open = ran.flatMap((gate) => gate.violations.map((v) => `  unwaived ${gate.name}  ${v.file}:${v.line}  ${v.token ?? ""}`));
    const held = ran.flatMap((gate) => (waived.get(gate.name) ?? []).map((site) => `  waived   ${gate.name}  ${site}`));
    const heldCount = ran.reduce((n, gate) => n + gate.waived, 0);
    unwaived += open.length;
    print(`${cls.name}: ${open.length} unwaived, ${heldCount} waived (${cls.gates.join(", ")})`);
    for (const line of [...open, ...held]) {
      print(line);
    }
  }
  noteMatches(unwaived, unwaived);
  return unwaived;
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
  const gates = [...new Set(ANTIPATTERN_CLASSES.flatMap((cls) => cls.gates))];
  noteUnits("gates", gates.length);
  noteScope(scope === undefined ? "whole-repository" : `folder:${scope}`);
  const args = ["check:structure", ...gates.flatMap((id) => ["--check", id]), ...(scope === undefined ? [] : ["--folder", scope])];
  const res = await spawnNiced("pnpm", args, { cwd: REPO_ROOT });
  const artifactPath = ARTIFACT_RE.exec(res.stdout)?.[1];
  // Exit 0 is clean and 1 is findings; anything else, or no artifact, is a broken pass with no verdict.
  if (res.timedOut || artifactPath === undefined || (res.code !== 0 && res.code !== 1)) {
    exitToolError(`antipatterns: the structure pass gave no verdict (exit ${String(res.code)}).\n${res.stderr.slice(-STDERR_TAIL_CHARS)}`);
  }
  const artifact = JSON.parse(readFileSync(join(REPO_ROOT, artifactPath), "utf8")) as StructureArtifact;
  if (artifact.policy.toolErrors.length > 0) {
    exitToolError(`antipatterns: the structure pass reported tool errors: ${artifact.policy.toolErrors.map((e) => e.message).join("; ")}`);
  }
  noteUnits("population-files", Math.max(0, ...artifact.gates.map((gate) => gate.population.effectiveSourcePaths)));
  if (render(artifact) > 0) {
    process.exitCode = 1;
  }
}
