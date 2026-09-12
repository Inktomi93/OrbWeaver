// THE §4.6 CONVERSION-DIFFERENTIAL HARNESS — one home for "replay a frozen legacy `GateDescriptor` and
// the final policies over the SAME BYTES, and compare findings, populations and tool errors" (#2000).
//
// WHY THIS IS A SHARED MODULE AND NOT A THIRD COPY. `tests/tooling/verify/gates/split-arm-parity.test.ts`
// (Tier 2a) carries its own inline copy; the schema-fact family (Tier 2b/2c) and the Tier 3 exceptions
// needed the same machinery, and three spellings of one mechanism is the "two homes for one concept"
// shape the constitution forbids. A later lane folding split-arm-parity onto this module is a separate,
// welcome change; this file does not touch it.
//
// WHAT A CALLER OWES, and why each piece exists:
//
// · A FROZEN SHA. `frozenLegacyGate` extracts the pre-conversion module with `git show` and runs it from a
//   scratch directory OUTSIDE the checkout, so every specifier it carries — relative, `@orb/tooling/…`, or
//   a bare package — is rewritten to an absolute file URL. `ts-morph` goes through `createRequire` so the
//   frozen module and the harness share ONE instance; two copies give the two engines different
//   `SyntaxKind` identities and the comparison becomes noise.
//
// · A LINE-ANCHORED SHIM, PROVEN. `shimHeaderImports` rewrites ONLY the header import block and asserts
//   the body is byte-identical afterwards. A blanket `String.replace` also patches the module's embedded
//   FIXTURE STRINGS — gate modules carry authored source containing `import … from "./x"` — and then BOTH
//   engines judge a broken specifier and report a matching pair of WRONG numbers, which a count comparison
//   structurally cannot detect.
//
// · ALL THREE COMPARISONS, DECLARED. A `Scenario` names the legacy findings, the final findings, both
//   populations and both tool-error sets. A population table alone is one third of §4.6, and a published
//   receipt has been a population-only table before.
//
// · A TOTAL TOOL-ERROR CLASSIFIER. `classifyToolError` may compress a message to a code for readability,
//   but it must THROW on a shape it does not recognise. A differential that silently absorbs a new refusal
//   shape is the vacuity this whole mechanism exists to prevent.
//
// · AN INERTNESS CONTROL ON EVERY CONSTRUCTED TWIN. Where a legacy fixture is too under-declared for the
//   final engine's readers to reach a verdict, the caller supplies a `repair` that completes it. The
//   harness then asserts the LEGACY engine's verdict on the twin equals its verdict on the raw example
//   (compared without line numbers, since a prepended declaration shifts every line below it). Without
//   that control a "twin" is simply a different example and proves nothing about catch parity.
//
// · AN IN-MEMORY-ONLY LEGACY GATE, AND THE HARNESS NOW REFUSES ANYTHING ELSE (#2119). Both replays run
//   over `useInMemoryFileSystem: true`, so a legacy gate that reads the REAL filesystem — `readFileSync`,
//   `existsSync`, a `node:child_process` shell-out, `process.cwd()` — cannot be replayed faithfully: its
//   fs arm answers about the running checkout rather than about the fixture, and §4.6's own guidance is
//   that such a gate needs a real tmpdir. This was verified harmless for the eleven blobs this repo
//   replays today (all pure in-memory AST readers), which is exactly why it had to become a REFUSAL
//   rather than a note: a future caller freezing a filesystem-reading descriptor would otherwise get a
//   confident, wrong differential. `frozenLegacyGate` scans the extracted source and throws, naming the
//   reach it found. A caller whose legacy gate genuinely needs disk owes a real-tmpdir harness, not a
//   relaxed scan here.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../tooling/src/verify/lib/policy-pass.ts";
import { expect } from "./tool-fixtures.ts";

const REQUIRE = createRequire(join(process.cwd(), "package.json"));

export type Files = Readonly<Record<string, string>>;

export interface Seen {
  readonly file: string;
  readonly line: number;
  readonly token: string | undefined;
  readonly message: string;
  readonly policyId: string | undefined;
}

/** What one replay produced. All three halves of §4.6, never just the population. */
export interface Replay {
  readonly findings: readonly string[];
  readonly population: number;
  readonly toolErrors: readonly string[];
}

export type Label = (seen: Seen) => string;

/** Compress a tool error to a declarable code, or THROW. Totality is the contract. */
export type ClassifyToolError = (owner: string, phase: string, message: string) => string;

/** The default vocabulary both engines are compared in: who reported, where, on which token, and enough of
 *  the message to tell the arms apart. */
export const label: Label = (seen) => `${seen.policyId ?? "legacy"} | ${seen.file}:${seen.line} | ${seen.token ?? "-"} | ${seen.message.slice(0, 46)}`;
/** The same finding WITHOUT its line — what a twin's inertness control compares in. */
export const unlined: Label = (seen) => `${seen.policyId ?? "legacy"} | ${seen.file} | ${seen.token ?? "-"} | ${seen.message.slice(0, 46)}`;

export function sorted(values: readonly string[]): readonly string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right));
}

/** ONE in-memory workspace per differential file, cleared between scenarios — the same substrate
 *  `ops/policy-conformance.ts` uses, and for the same reason: a fresh `Project` per scenario re-parses the
 *  default lib files on every `getTypeChecker()`, which is most of a differential's wall clock. */
export interface Differential {
  readonly legacyReplay: (gate: GateDescriptor, files: Files, shape: Label) => Replay;
  readonly finalReplay: (policies: readonly GatePolicy[], files: Files, shape: Label) => Replay;
  readonly runScenarios: (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly Scenario[]) => number;
}

/** A minimal, DECLARED completion of a legacy fixture. It exists only to make the fixture resolvable to
 *  the final engine's readers; `runScenarios` proves it never moved the legacy verdict. */
export interface Repair {
  readonly prepend?: Readonly<Record<string, string>>;
  readonly add?: Files;
  readonly replace?: Readonly<Record<string, readonly (readonly [string, string])[]>>;
}

/** One legacy example: both engines, all three comparisons, plus the twin where one is owed. */
export interface Scenario {
  readonly why: string;
  readonly legacyPopulation: number;
  readonly finalPopulation: number;
  readonly legacy: readonly string[];
  readonly final: readonly string[];
  readonly legacyErrors?: readonly string[];
  readonly finalErrors?: readonly string[];
  readonly repair?: Repair;
  readonly twinFinalPopulation?: number;
  readonly twinFinal?: readonly string[];
  readonly twinFinalErrors?: readonly string[];
}

export function repairedFiles(files: Files, repair: Repair): Files {
  const out: Record<string, string> = { ...files, ...(repair.add ?? {}) };
  for (const [path, text] of Object.entries(repair.prepend ?? {})) {
    const existing = out[path];
    if (existing === undefined) {
      throw new Error(`repair prepends to a path the example does not carry: ${path}`);
    }
    out[path] = `${text}${existing}`;
  }
  for (const [path, pairs] of Object.entries(repair.replace ?? {})) {
    for (const [from, to] of pairs) {
      const existing = out[path];
      if (existing === undefined || !existing.includes(from)) {
        throw new Error(`repair replaces text the example does not carry: ${path} ${from}`);
      }
      out[path] = existing.replaceAll(from, to);
    }
  }
  return out;
}

export function exampleFiles(example: GateExample, fallback: string): Files {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

export function legacyScenarios(legacy: GateDescriptor, fallback: string): readonly Files[] {
  return [...legacy.mustFlag, ...legacy.mustPass].map((example) => exampleFiles(example, fallback));
}

/** Every specifier a frozen module can carry, resolved to an absolute file URL. */
function resolveSpecifier(specifier: string): string {
  if (specifier.startsWith("../") || specifier.startsWith("./")) {
    return pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", specifier)).href;
  }
  if (specifier.startsWith("@orb/tooling/_shared/")) {
    return pathToFileURL(join(process.cwd(), "tooling/src/_shared", `${specifier.slice("@orb/tooling/_shared/".length)}.ts`)).href;
  }
  return pathToFileURL(REQUIRE.resolve(specifier)).href;
}

const IMPORT_LINE = /^(?<head>(?:import|export)\s.*?\sfrom\s)"(?<specifier>[^"]+)";$/u;
const HEADER_LINE = /^(?:\/\/|\/\*|\s*\*|$)/u;

/** Rewrite ONLY the header import block, and prove it. See this file's header for the failure it prevents. */
export function shimHeaderImports(source: string): string {
  const lines = source.split("\n");
  let end = 0;
  const rewritten: string[] = [];
  const imports: string[] = [];
  for (const [index, line] of lines.entries()) {
    const match = IMPORT_LINE.exec(line);
    if (match?.groups !== undefined) {
      const shimmed = `${match.groups["head"] as string}"${resolveSpecifier(match.groups["specifier"] as string)}";`;
      rewritten.push(shimmed);
      imports.push(shimmed);
      end = index + 1;
      continue;
    }
    if (HEADER_LINE.test(line)) {
      rewritten.push(line);
      continue;
    }
    end = index;
    break;
  }
  const body = lines.slice(end).join("\n");
  const out = `${rewritten.slice(0, end).join("\n")}\n${body}`;
  expect(out.slice(out.length - body.length), "the frozen module's BODY must be byte-identical after the header shim").toBe(body);
  for (const line of imports) {
    expect(line, "every shimmed import must resolve to an absolute file URL").toMatch(/ from "file:\/\/\//u);
  }
  return out;
}

/** Every spelling by which a legacy gate could reach the REAL filesystem or a subprocess. Deliberately a
 *  literal-text scan over the frozen SOURCE: this runs before the module is imported, and a scan that
 *  under-reports here is worse than one that over-reports — a false refusal costs a caller an explicit
 *  real-tmpdir harness, a false clean costs it a confident wrong differential. */
const FILESYSTEM_REACH: readonly string[] = [
  "node:fs",
  "node:child_process",
  "readFileSync",
  "writeFileSync",
  "existsSync",
  "readdirSync",
  "statSync",
  "realpathSync",
  "process.cwd(",
  "runNiced",
];

/** THE IN-MEMORY-ONLY OBLIGATION, ENFORCED (#2119). See the header: both replays run on a virtual project,
 *  so a legacy gate that touches disk answers about the running checkout rather than about the fixture.
 *  Exported so its own planted controls can drive it in both directions without importing a git blob. */
export function filesystemReach(source: string): readonly string[] {
  return FILESYSTEM_REACH.filter((spelling) => source.includes(spelling));
}

/** The pre-conversion descriptor, extracted at its frozen SHA and shimmed so it runs from `scratch`. */
export async function frozenLegacyGate(scratch: string, base: string, legacyPath: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${base}:${legacyPath}`], { encoding: "utf8" });
  const reach = filesystemReach(source);
  if (reach.length > 0) {
    throw new Error(
      `${legacyPath} at ${base} reaches the real filesystem (${reach.join(", ")}) — this harness replays on ` +
        "an in-memory project, so its fs arm would answer about the running checkout rather than the fixture. " +
        "Replay it on a real tmpdir instead of relaxing this refusal (tests/support/legacy-differential.ts).",
    );
  }
  const name = `${base.slice(0, 8)}-${basename(legacyPath)}`;
  const target = join(scratch, name);
  writeFileSync(target, shimHeaderImports(source));
  return ((await import(`${pathToFileURL(target).href}?frozen=${name}`)) as { readonly gate: GateDescriptor }).gate;
}

/** Build the two replay engines and the scenario runner over ONE shared virtual workspace. `root` is the
 *  virtual root every fixture path is created under; give each differential file its own. */
export function createDifferential(root: string, classifyToolError: ClassifyToolError): Differential {
  const shared = new Project({ useInMemoryFileSystem: true });

  const removeSources = (): void => {
    for (const sourceFile of shared.getSourceFiles()) {
      shared.removeSourceFile(sourceFile);
    }
  };

  const projectOf = (files: Files): Project => {
    removeSources();
    for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
      shared.createSourceFile(`${root}/${path}`, source);
    }
    return shared;
  };

  const rel = (file: string): string => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

  const legacyReplay = (gate: GateDescriptor, files: Files, shape: Label): Replay => {
    const project = projectOf(files);
    const result = runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    return {
      findings: sorted(
        (result.gates[0]?.findings ?? []).map((finding) =>
          shape({ file: rel(finding.file), line: finding.line, token: finding.token, message: finding.message ?? gate.message, policyId: undefined }),
        ),
      ),
      population: Object.keys(files).filter((path) => gate.scanRoot?.(path) ?? true).length,
      toolErrors: sorted(result.toolErrors.map((error) => `${error.gate}/${error.phase}`)),
    };
  };

  const finalReplay = (policies: readonly GatePolicy[], files: Files, shape: Label): Replay => {
    const project = projectOf(files);
    const result = runPolicyPass({ knownPolicies: policies, policies: [...policies], root, project, reviewedGrants: [], failOnWarnings: false });
    const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
    const population = new Set<string>();
    for (const owner of result.policies) {
      for (const path of owner.population.effectiveSourcePaths) {
        population.add(path);
      }
    }
    return {
      findings: sorted(
        result.authority.effectiveFindings.map((finding) =>
          shape({
            file: rel(finding.file),
            line: finding.line,
            token: finding.token,
            message: finding.message ?? messageOf.get(finding.policyId ?? "") ?? "",
            policyId: finding.policyId,
          }),
        ),
      ),
      population: population.size,
      toolErrors: sorted([
        ...result.toolErrors.map((error) => classifyToolError(error.policyId, error.phase, error.message)),
        ...result.factErrors.map((error) => classifyToolError(error.factId, error.phase, error.message)),
      ]),
    };
  };

  const runScenarios = (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly Scenario[]): number => {
    const examples = legacyScenarios(legacy, fallback);
    expect(scenarios.length, "every legacy example is declared — a dropped row would otherwise be silent").toBe(examples.length);
    for (const [index, scenario] of scenarios.entries()) {
      const files = examples[index] as Files;
      const tag = `#${index} ${scenario.why}`;
      const before = legacyReplay(legacy, files, label);
      const after = finalReplay(policies, files, label);
      expect(before.findings, `${tag} — LEGACY findings`).toEqual(sorted(scenario.legacy));
      expect(before.population, `${tag} — LEGACY population`).toBe(scenario.legacyPopulation);
      expect(before.toolErrors, `${tag} — LEGACY tool errors`).toEqual(sorted(scenario.legacyErrors ?? []));
      expect(after.findings, `${tag} — FINAL findings`).toEqual(sorted(scenario.final));
      expect(after.population, `${tag} — FINAL population`).toBe(scenario.finalPopulation);
      expect(after.toolErrors, `${tag} — FINAL tool errors`).toEqual(sorted(scenario.finalErrors ?? []));
      if (scenario.repair === undefined) {
        continue;
      }
      const twin = repairedFiles(files, scenario.repair);
      // THE INERTNESS CONTROL — the reason this is catch parity and not a table of numbers.
      expect(legacyReplay(legacy, twin, unlined).findings, `${tag} — the completion is INERT on the legacy side`).toEqual(
        legacyReplay(legacy, files, unlined).findings,
      );
      const twinAfter = finalReplay(policies, twin, label);
      expect(twinAfter.findings, `${tag} — TWIN final findings`).toEqual(sorted(scenario.twinFinal ?? []));
      expect(twinAfter.population, `${tag} — TWIN final population`).toBe(scenario.twinFinalPopulation);
      expect(twinAfter.toolErrors, `${tag} — TWIN final tool errors`).toEqual(sorted(scenario.twinFinalErrors ?? []));
    }
    return scenarios.length;
  };

  return { legacyReplay, finalReplay, runScenarios };
}
