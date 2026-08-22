// Gate: tooling-instrument-proof (docs/design/tooling-package.md §4.5) — an instrument-classed tool
// (INSTRUMENT_TOOLS, tooling/src/_shared/instruments.ts) owes TWO proof classes in tests/tooling/<tool>/:
// `@instrument-proof:` (a planted DEFECT must RED) and `@instrument-absence-proof:` (a removed apparatus /
// empty population must NOT read clean). Arms per class: (B) a member with no marker; (C) a marker in a
// NON-member's tree; (D) a malformed bare marker. Plus (A) a member with no tooling/src/<tool>/ dir and
// (E) an unreadable registry. comments-INTENDED: the marker IS a comment; the matcher anchors on the comment OPENER (mention-fence).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
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
}

const state: State = { members: [], registrySeen: false, markers: [] };

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

export const gate: GateDescriptor = {
  name: "tooling-instrument-proof",
  docRow: "Core-Enforcement-Active-Gates.md (docs/design/tooling-package.md §4.5)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the instrument-proof contract is broken — every INSTRUMENT_TOOLS member owes BOTH a planted-defect proof (`@instrument-proof: <what is planted and what must red>`) AND an absence proof (`@instrument-absence-proof: <what apparatus/population is removed and what must NOT read clean>`) in tests/tooling/<tool>/, both vocabularies are two-sided, and the registry must stay readable (docs/design/tooling-package.md §4.5).",
  fix: "add the missing marker-carrying proof test (plant the defect, or remove the apparatus and assert the run refuses to read clean), register the tool, or delete the stale/malformed marker.",
  scanRoot: (p) => p === REGISTRY || p.startsWith(TESTS_PREFIX),
  visitFile: (sf, _ctx) => {
    const rel = relOf(sf);
    if (rel === REGISTRY) {
      collectMembers(sf);
      return;
    }
    if (rel.startsWith(TESTS_PREFIX)) {
      collectMarkers(sf, rel);
    }
  },
  begin: () => {
    state.members = [];
    state.registrySeen = false;
    state.markers = [];
  },
  run: (ctx) => {
    const anchored = fileLoaded(ctx, ANCHOR);
    if (anchored && !state.registrySeen) {
      ctx.report({
        file: REGISTRY,
        line: 0,
        column: 0,
        message:
          "INSTRUMENT_TOOLS could not be read — the registry moved/renamed and this gate is blind. Re-point the gate (docs/design/tooling-package.md §4.5).",
      });
      return;
    }
    const memberNames = new Set(state.members.map((m) => m.name));
    for (const m of state.members) {
      if (!existsSync(join(ctx.root, "tooling/src", m.name))) {
        ctx.report({
          file: m.file,
          line: m.line,
          column: 0,
          message: `INSTRUMENT_TOOLS names "${m.name}" but tooling/src/${m.name}/ does not exist — a dead registry row is a loaded gun (docs/design/tooling-package.md §4.5).`,
        });
        continue;
      }
      for (const kind of PROOF_CLASS_NAMES) {
        const proven = state.markers.some((h) => h.tool === m.name && h.kind === kind && !h.malformed);
        if (!proven) {
          ctx.report({
            file: `tests/tooling/${m.name}`,
            line: 0,
            column: 0,
            message: `instrument "${m.name}" has no \`${PROOF_CLASSES[kind].marker}\` test — it owes ${PROOF_CLASSES[kind].owes}; without it a verdict tool ships a green that cannot fail (docs/design/tooling-package.md §4.5).`,
          });
        }
      }
    }
    for (const h of state.markers) {
      if (h.malformed) {
        ctx.report({
          file: h.file,
          line: h.line,
          column: 0,
          message: `malformed \`${PROOF_CLASSES[h.kind].marker}\` marker — the reason (${PROOF_CLASSES[h.kind].owes}) is REQUIRED (docs/design/tooling-package.md §4.5).`,
        });
      } else if (!memberNames.has(h.tool)) {
        ctx.report({
          file: h.file,
          line: h.line,
          column: 0,
          message: `\`${PROOF_CLASSES[h.kind].marker}\` marker in "${h.tool}"'s tree, but "${h.tool}" is not in INSTRUMENT_TOOLS — register it or delete the marker (docs/design/tooling-package.md §4.5).`,
        });
      }
    }
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
  ],
};
