// Instrument proof contract (docs/law/Core-Tooling-Law.md §4.5). A tool in INSTRUMENT_TOOLS reports a VERDICT about
// the app, where a blind zero reads as a pass, so it owes two proof classes under tests/tooling/<tool>/: a
// planted-defect proof (the instrument REDs) and an absence proof (an empty population must not read clean). Its
// result goes through the shared printVerdict denominator door, never printResult directly.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { readAuthoredRepositoryInventory } from "../../tooling/src/floor/compiler/authored-repository.ts";
import { INSTRUMENT_TOOLS } from "../../tooling/src/floor/instrument/instruments.ts";
import { scaledBudget } from "./_load-budget.ts";

const TOOLING_SRC = "tooling/src/";
const TESTS_PREFIX = "tests/tooling/";

// A Record, not a switch: a third proof class is a row, and tsc then requires every consumer to handle it.
const PROOF_CLASSES = {
  defect: /^\s*\/\/ @instrument-proof:(?<reason>.*)$/u,
  absence: /^\s*\/\/ @instrument-absence-proof:(?<reason>.*)$/u,
} as const;
type ProofClass = keyof typeof PROOF_CLASSES;
const PROOF_CLASS_NAMES = Object.keys(PROOF_CLASSES) as readonly ProofClass[];

type Rule = "dead-row" | "missing-proof" | "unregistered-marker" | "malformed-marker";

interface Violation {
  readonly rule: Rule;
  readonly subject: string;
  readonly detail?: ProofClass;
}

interface Marker {
  readonly tool: string;
  readonly kind: ProofClass;
  readonly malformed: boolean;
}

function markersIn(path: string, text: string): readonly Marker[] {
  const tool = path.slice(TESTS_PREFIX.length).split("/")[0] ?? "";
  // A flat tests/tooling file mirrors no tool.
  if (tool === "" || /\.tsx?$/u.test(tool)) {
    return [];
  }
  return text.split(/\r?\n/u).flatMap((line) =>
    PROOF_CLASS_NAMES.flatMap((kind) => {
      const match = PROOF_CLASSES[kind].exec(line);
      return match === null ? [] : [{ tool, kind, malformed: (match.groups?.["reason"] ?? "").trim() === "" }];
    }),
  );
}

/** Judge the registry against the authored tree: files maps every authored path to its text. */
function proofViolations(members: readonly string[], files: Readonly<Record<string, string>>): readonly Violation[] {
  const paths = Object.keys(files);
  // A member's home is a DIRECTORY; a file or symlink of that name is a dead row.
  const live = (member: string): boolean => paths.some((path) => path.startsWith(`${TOOLING_SRC}${member}/`));
  const markers = paths.filter((path) => path.startsWith(TESTS_PREFIX) && /\.tsx?$/u.test(path)).flatMap((path) => markersIn(path, files[path] ?? ""));
  const out: Violation[] = [];
  for (const member of members) {
    if (!live(member)) {
      out.push({ rule: "dead-row", subject: member });
      continue;
    }
    for (const kind of PROOF_CLASS_NAMES) {
      if (!markers.some((marker) => marker.tool === member && marker.kind === kind && !marker.malformed)) {
        out.push({ rule: "missing-proof", subject: member, detail: kind });
      }
    }
  }
  for (const marker of markers) {
    if (marker.malformed) {
      out.push({ rule: "malformed-marker", subject: marker.tool, detail: marker.kind });
    } else if (!members.includes(marker.tool)) {
      out.push({ rule: "unregistered-marker", subject: marker.tool, detail: marker.kind });
    }
  }
  return out;
}

const BOTH =
  "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n";
const SNAPX_PROOF = { "tooling/src/snapx/index.ts": "export {};\n", "tests/tooling/snapx/proof.test.ts": BOTH } as const;

test("a registry row without a directory, a missing proof class, a stale marker and a bare marker are each reported", () => {
  expect(proofViolations(["ghost"], {})).toEqual([{ rule: "dead-row", subject: "ghost" }]);
  // A file of that name does not prove a directory claim, and neither does a symlink (an authored path, never a directory).
  expect(proofViolations(["ghost"], { "tooling/src/ghost.ts": "export {};\n" })).toEqual([{ rule: "dead-row", subject: "ghost" }]);
  expect(proofViolations(["ghost"], { "tooling/src/ghost": "" })).toEqual([{ rule: "dead-row", subject: "ghost" }]);

  // One finding per class, so a missing absence proof can never hide behind a present defect proof.
  expect(proofViolations(["snapx"], { "tooling/src/snapx/index.ts": "", "tests/tooling/snapx/cli.test.ts": "export const t = 1;\n" })).toEqual([
    { rule: "missing-proof", subject: "snapx", detail: "defect" },
    { rule: "missing-proof", subject: "snapx", detail: "absence" },
  ]);
  expect(
    proofViolations(["snapx"], {
      "tooling/src/snapx/index.ts": "",
      "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a contrast failure and asserts the audit reds\nexport const t = 1;\n",
    }),
  ).toEqual([{ rule: "missing-proof", subject: "snapx", detail: "absence" }]);

  expect(proofViolations([], { "tests/tooling/rogue/x.test.ts": "// @instrument-absence-proof: empties the population and asserts no clean read\n" })).toEqual([
    { rule: "unregistered-marker", subject: "rogue", detail: "absence" },
  ]);
  // A bare marker reds as its own flavour and does not satisfy the class it names.
  expect(
    proofViolations(["snapx"], {
      "tooling/src/snapx/index.ts": "",
      "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof:\nexport const t = 1;\n",
    }),
  ).toEqual([
    { rule: "missing-proof", subject: "snapx", detail: "absence" },
    { rule: "malformed-marker", subject: "snapx", detail: "absence" },
  ]);
});

test("a fully proven member, an empty registry, a quoted mention and a flat-file marker pass", () => {
  expect(proofViolations(["snapx"], SNAPX_PROOF)).toEqual([]);
  // The two classes may live in one file or two.
  expect(
    proofViolations(["snapx"], {
      "tooling/src/snapx/index.ts": "",
      "tests/tooling/snapx/proof.test.ts": "// @instrument-proof: plants a dead class and asserts the scan REDs on it\n",
      "tests/tooling/snapx/absence.test.ts": "// @instrument-absence-proof: removes the collector and asserts an INSTRUMENT ERROR\n",
    }),
  ).toEqual([]);
  expect(proofViolations([], {})).toEqual([]);
  // A marker QUOTED inside a string is a mention, not a use: the matcher anchors on the comment opener.
  expect(
    proofViolations(["snapx"], {
      ...SNAPX_PROOF,
      "tests/tooling/snapx/doc.test.ts": 'const doc = "the grammar is `// @instrument-absence-proof: <reason>`";\n',
    }),
  ).toEqual([]);
  // tests/tooling/<file>.test.ts mirrors no tool, so a marker there is not a tool literally called "smoke.test.ts".
  expect(
    proofViolations(["snapx"], { ...SNAPX_PROOF, "tests/tooling/smoke.test.ts": "// @instrument-absence-proof: a marker in a FLAT tests/tooling file\n" }),
  ).toEqual([]);
});

test("every INSTRUMENT_TOOLS member has a live directory and both reasoned proof classes", ({ repoRoot }) => {
  const paths = readAuthoredRepositoryInventory(repoRoot).paths;
  const files = Object.fromEntries(
    paths
      .filter((path) => path.startsWith(TOOLING_SRC) || (path.startsWith(TESTS_PREFIX) && /\.tsx?$/u.test(path)))
      .map((path) => [path, path.startsWith(TESTS_PREFIX) ? readFileSync(join(repoRoot, path), "utf8") : ""]),
  );
  // A registry that reads empty would make every census agree with nothing.
  expect(INSTRUMENT_TOOLS.length).toBeGreaterThan(0);
  expect(proofViolations(INSTRUMENT_TOOLS, files)).toEqual([]);
});

const RULE = "orb/instrument-verdict-door";
const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: ROOT });
const ARTIFACTS = "../../floor/artifacts/artifacts.ts";

async function findings(path: string, source: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("a registered instrument cannot reach printResult by name, alias, namespace, re-export or barrel", { timeout: scaledBudget(120_000) }, async () => {
  const tool = INSTRUMENT_TOOLS[0];
  const path = `${TOOLING_SRC}${tool}/ops/probe.ts`;
  for (const source of [
    `import { printResult } from "${ARTIFACTS}";`,
    `import { printResult as emit } from "${ARTIFACTS}";`,
    `import * as artifacts from "${ARTIFACTS}";`,
    `import { printResult as viaBarrel } from "../../floor/artifacts/artifacts-barrel.ts";`,
    `export { printResult } from "${ARTIFACTS}";`,
    `export * from "${ARTIFACTS}";`,
  ]) {
    expect(await findings(path, source), source).toHaveLength(1);
  }
  for (const source of [
    `import { print, REPO_ROOT } from "${ARTIFACTS}";`,
    `import { printVerdict } from "../../floor/verdict/evidence.ts";`,
    `import { print } from "@orb/tooling/floor/artifacts/artifacts";`,
  ]) {
    expect(await findings(path, source), source).toEqual([]);
  }
  // The shared layer and non-instrument tools are not instruments.
  for (const outside of ["tooling/src/floor/verdict/evidence.ts", "tooling/src/verify/reporting.ts", "tooling/src/seed/ops/probe.ts"]) {
    expect(await findings(outside, `import { printResult } from "${ARTIFACTS}";`), outside).toEqual([]);
  }
});
