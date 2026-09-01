// Gate: tooling-instrument-proof (docs/architecture/core/Core-Tooling-Law.md §4.5) — an instrument-classed tool
// (INSTRUMENT_TOOLS, tooling/src/_shared/instruments.ts) owes TWO proof classes in tests/tooling/<tool>/:
// `@instrument-proof:` (a planted DEFECT must RED) and `@instrument-absence-proof:` (a removed apparatus /
// empty population must NOT read clean). Arms per class: (B) a member with no marker; (C) a marker in a
// NON-member's tree; (D) a malformed bare marker. Plus (A) a member with no tooling/src/<tool>/ dir and
// (E) an unreadable registry; (F) a member bypassing the shared printVerdict denominator door.
// comments-INTENDED: the marker IS a comment; the matcher anchors on the comment OPENER (mention-fence).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const REGISTRY = "tooling/src/_shared/instruments.ts";
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const TESTS_PREFIX = "tests/tooling/";

/** The TWO proof classes. A planted-defect proof answers "does the instrument bite?"; an ABSENCE proof
 *  answers the strictly harder question "when the instrument could not measure, does it say so?" — the
 *  #409 class, where a blind zero renders as a clean verdict. Neither substitutes for the other: an
 *  instrument can red correctly on a plant and still report `0 findings, PASS` over a page it never
 *  censused, and that second failure is the one nobody notices.
 *
 *  Comment-OPENER match only (the mention fence): a prose/string mention of either marker never counts.
 *  A Record, not a switch — a third proof class is a row, and tsc then requires every consumer to handle it. */
const PROOF_CLASSES = {
  defect: {
    marker: "@instrument-proof",
    re: /^\s*\/\/ @instrument-proof:(?<reason>.*)$/u,
    owes: "a planted-defect proof (plant the defect class, assert the instrument REDs)",
  },
  absence: {
    marker: "@instrument-absence-proof",
    re: /^\s*\/\/ @instrument-absence-proof:(?<reason>.*)$/u,
    owes: "an ABSENCE proof (remove the apparatus or empty the population, assert the run does NOT read clean)",
  },
} as const;

type ProofClass = keyof typeof PROOF_CLASSES;
const PROOF_CLASS_NAMES = Object.keys(PROOF_CLASSES) as readonly ProofClass[];

interface MarkerHit {
  readonly file: string;
  readonly line: number;
  readonly tool: string;
  readonly kind: ProofClass;
  readonly malformed: boolean;
}

interface State {
  members: { readonly name: string; readonly file: string; readonly line: number }[];
  registrySeen: boolean;
  markers: MarkerHit[];
  bypasses: { readonly file: string; readonly line: number; readonly tool: string }[];
}

const state: State = { members: [], registrySeen: false, markers: [], bypasses: [] };

function relOf(sf: SourceFile): string {
  const abs = sf.getFilePath().replace(/\\/gu, "/");
  const t = abs.indexOf(`/${TESTS_PREFIX}`);
  if (t !== -1) {
    return abs.slice(t + 1);
  }
  const r = abs.indexOf("/tooling/src/");
  return r === -1 ? abs : abs.slice(r + 1);
}

function collectMembers(sf: SourceFile): void {
  const decl = sf.getVariableDeclaration("INSTRUMENT_TOOLS");
  if (decl === undefined) {
    return;
  }
  state.registrySeen = true;
  const init = decl.getInitializer();
  if (init === undefined) {
    return;
  }
  const arr = unwrapExpression(init);
  if (!arr.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return;
  }
  for (const el of arr.getElements()) {
    const name = readStringValue(el);
    if (name !== undefined) {
      state.members.push({ name, file: relOf(sf), line: el.getStartLineNumber() });
    }
  }
}

function collectMarkers(sf: SourceFile, rel: string): void {
  const tool = rel.slice(TESTS_PREFIX.length).split("/")[0] ?? "";
  if (tool === "" || tool.endsWith(".ts") || tool.endsWith(".tsx")) {
    return; // flat tests/tooling files belong to no tool mirror
  }
  const lines = sf.getFullText().split("\n");
  for (const [i, lineText] of lines.entries()) {
    for (const kind of PROOF_CLASS_NAMES) {
      const m = PROOF_CLASSES[kind].re.exec(lineText);
      if (m !== null) {
        state.markers.push({ file: rel, line: i + 1, tool, kind, malformed: (m.groups?.["reason"] ?? "").trim() === "" });
      }
    }
  }
}

function instrumentToolOf(rel: string): string | null {
  if (!rel.startsWith("tooling/src/")) {
    return null;
  }
  const tool = rel.slice("tooling/src/".length).split("/")[0] ?? "";
  return tool === "" || tool === "_shared" || tool === "verify" ? null : tool;
}

function printResultLocalNames(sf: SourceFile): ReadonlySet<string> {
  const localNames = new Set<string>();
  for (const declaration of sf.getImportDeclarations()) {
    if (!(declaration.getModuleSpecifierValue().endsWith("_shared/artifacts") || declaration.getModuleSpecifierValue().endsWith("_shared/artifacts.ts"))) {
      continue;
    }
    for (const named of declaration.getNamedImports()) {
      if (named.getName() === "printResult") {
        localNames.add(named.getAliasNode()?.getText() ?? named.getName());
      }
    }
  }
  return localNames;
}

function collectVerdictBypasses(sf: SourceFile, rel: string): void {
  const tool = instrumentToolOf(rel);
  if (tool === null) {
    return;
  }
  const localNames = printResultLocalNames(sf);
  if (localNames.size === 0) {
    return;
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    if (Node.isIdentifier(expression) && localNames.has(expression.getText())) {
      state.bypasses.push({ file: rel, line: call.getStartLineNumber(), tool });
    }
  }
}

type RunContext = Parameters<NonNullable<GateDescriptor["run"]>>[0];

function reportMemberProofs(ctx: RunContext, memberNames: ReadonlySet<string>): void {
  for (const member of state.members) {
    if (!existsSync(join(ctx.root, "tooling/src", member.name))) {
      ctx.report({
        file: member.file,
        line: member.line,
        column: 0,
        message: `INSTRUMENT_TOOLS names "${member.name}" but tooling/src/${member.name}/ does not exist — a dead registry row is a loaded gun (docs/architecture/core/Core-Tooling-Law.md §4.5).`,
      });
      continue;
    }
    for (const kind of PROOF_CLASS_NAMES) {
      const proven = state.markers.some((hit) => hit.tool === member.name && hit.kind === kind && !hit.malformed);
      if (!proven) {
        ctx.report({
          file: member.file,
          line: member.line,
          column: 0,
          message: `instrument "${member.name}" has no \`${PROOF_CLASSES[kind].marker}\` test — it owes ${PROOF_CLASSES[kind].owes}; without it a verdict tool ships a green that cannot fail (docs/architecture/core/Core-Tooling-Law.md §4.5).`,
        });
      }
    }
  }
  for (const bypass of state.bypasses) {
    if (memberNames.has(bypass.tool)) {
      ctx.report({
        file: bypass.file,
        line: bypass.line,
        column: 0,
        message: `registered instrument "${bypass.tool}" calls printResult directly — route its verdict through printVerdict with declared denominators so an empty population cannot read clean (arm F; docs/architecture/core/Core-Tooling-Law.md §4.5).`,
      });
    }
  }
}

function reportMarkerIntegrity(ctx: RunContext, memberNames: ReadonlySet<string>): void {
  for (const hit of state.markers) {
    if (hit.malformed) {
      ctx.report({
        file: hit.file,
        line: hit.line,
        column: 0,
        message: `malformed \`${PROOF_CLASSES[hit.kind].marker}\` marker — the reason (${PROOF_CLASSES[hit.kind].owes}) is REQUIRED (docs/architecture/core/Core-Tooling-Law.md §4.5).`,
      });
    } else if (!memberNames.has(hit.tool)) {
      ctx.report({
        file: hit.file,
        line: hit.line,
        column: 0,
        message: `\`${PROOF_CLASSES[hit.kind].marker}\` marker in "${hit.tool}"'s tree, but "${hit.tool}" is not in INSTRUMENT_TOOLS — register it or delete the marker (docs/architecture/core/Core-Tooling-Law.md §4.5).`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "tooling-instrument-proof",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.5)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the instrument-proof contract is broken — every INSTRUMENT_TOOLS member owes BOTH proof classes, both vocabularies are two-sided, the registry must stay readable, and registered tools must enter the shared printVerdict denominator door instead of calling printResult directly (docs/architecture/core/Core-Tooling-Law.md §4.5).",
  fix: "add the missing marker-carrying proof test, register the tool, delete the stale/malformed marker, or route the registered instrument's RESULT through printVerdict with declared denominators.",
  scanRoot: (p) => p === REGISTRY || p.startsWith(TESTS_PREFIX) || p.startsWith("tooling/src/"),
  visitFile: (sf, _ctx) => {
    const rel = relOf(sf);
    if (rel === REGISTRY) {
      collectMembers(sf);
      return;
    }
    if (rel.startsWith(TESTS_PREFIX)) {
      collectMarkers(sf, rel);
    }
    collectVerdictBypasses(sf, rel);
  },
  begin: () => {
    state.members = [];
    state.registrySeen = false;
    state.markers = [];
    state.bypasses = [];
  },
  run: (ctx) => {
    const anchored = fileLoaded(ctx, ANCHOR);
    if (anchored && !state.registrySeen) {
      ctx.report({
        file: REGISTRY,
        line: 0,
        column: 0,
        message:
          "INSTRUMENT_TOOLS could not be read — the registry moved/renamed and this gate is blind. Re-point the gate (docs/architecture/core/Core-Tooling-Law.md §4.5).",
      });
      return;
    }
    const memberNames = new Set(state.members.map((m) => m.name));
    reportMemberProofs(ctx, memberNames);
    reportMarkerIntegrity(ctx, memberNames);
  },
  mustFlag: [
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["ghost"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
      },
      expect: { messageIncludes: "does not exist" },
      why: "a registry row naming a tool with no dir — the rename tripwire (arm A)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const t = 1;\n",
      },
      expect: { count: 2 },
      why: "a registered instrument whose mirror tree carries NEITHER proof class — one finding per class, so a missing absence proof can never hide behind a present defect proof (arm B ×2)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a contrast failure and asserts the audit reds\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "@instrument-absence-proof" },
      why: "THE FOUNDING SHAPE OF THE ABSENCE ARM — an instrument that proves it BITES but never proves it refuses to report clean when it measured nothing (#409's class). Before this arm, exactly this shape was fully compliant",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": "export const INSTRUMENT_TOOLS = [] as const;\n",
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tests/tooling/rogue/x.test.ts":
          "// @instrument-absence-proof: empties the population and asserts the run refuses to read clean\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "not in INSTRUMENT_TOOLS" },
      why: "an ABSENCE marker in an unregistered tool's tree — the second vocabulary is two-sided from birth, exactly like the first (arm C)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof:\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "malformed" },
      why: "a bare ABSENCE marker with no reason — must red as its own flavour, never sit there looking like protection (arm D)",
    },
    {
      files: {
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
      },
      expect: { messageIncludes: "could not be read" },
      why: "the anchor present but the registry gone — the blindness tripwire (arm E)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts":
          'import { printResult as emit } from "../../_shared/artifacts.ts";\nexport function run(): void { emit("snapx", [["findings", 0]]); }\n',
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "calls printResult directly" },
      why: "a registered instrument bypassing the shared denominator door through an aliased printResult import — the sanctioned-door arm F",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a dead class in a fixture tree and asserts the scan REDs on it\nexport const t = 1;\n",
        "tests/tooling/snapx/absence.test.ts":
          "// @instrument-absence-proof: removes the in-page collector and asserts the run reports an INSTRUMENT ERROR, never 0 findings\nexport const t = 1;\n",
      },
      why: "a registered instrument carrying BOTH reasoned proof markers — the honourable shape. The two may live in one file or two; the gate asks for the CLASSES, not a file layout",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": "export const INSTRUMENT_TOOLS = [] as const;\n",
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
      },
      why: "an EMPTY registry is legal-armed (P1 state — members join as their tools land); emptiness is not blindness",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          '// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nconst doc = "the grammar is `// @instrument-absence-proof: <reason>`";\nexport const t = doc;\n',
      },
      why: "DECLARED LIMIT, written down: a marker QUOTED inside a string is a MENTION, not a use — the matcher anchors on the comment OPENER, so documentation of the vocabulary never registers a proof nor trips the two-sided arm",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts":
          'import { printVerdict } from "../../_shared/evidence.ts";\nexport function run(): number { return printVerdict("snapx", { verdict: 0, denominators: { scanned: { value: 1, refuseWhen: "zero" } }, pairs: [["findings", 0]] }); }\n',
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "a registered instrument entering the shared verdict door with an explicit non-zero denominator — the honourable arm F shape",
    },
  ],
};
