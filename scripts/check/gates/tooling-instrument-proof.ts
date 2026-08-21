// Gate: tooling-instrument-proof (docs/design/tooling-package.md §4.5) — an instrument-classed tool
// (INSTRUMENT_TOOLS, tooling/src/_shared/instruments.ts) owes ≥1 planted-defect proof test carrying the
// `@instrument-proof: <reason>` marker in tests/tooling/<tool>/. Arms: (A) a member with no
// tooling/src/<tool>/ dir (rename tripwire); (B) a member whose mirror tree carries no marker; (C) a
// marker in a NON-member's tree (two-sided vocabulary); (D) a malformed bare marker; (E) the registry
// file unreadable on the real tree (blindness tripwire). comments-INTENDED: the marker IS a comment; the matcher anchors on the comment OPENER (mention-fence).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const REGISTRY = "tooling/src/_shared/instruments.ts";
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const TESTS_PREFIX = "tests/tooling/";
// Comment-OPENER match only (the mention fence): a prose/string mention never counts.
const MARKER_RE = /^\s*\/\/ @instrument-proof:(?<reason>.*)$/u;

interface MarkerHit {
  readonly file: string;
  readonly line: number;
  readonly tool: string;
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
    const m = MARKER_RE.exec(lineText);
    if (m !== null) {
      state.markers.push({ file: rel, line: i + 1, tool, malformed: (m.groups?.["reason"] ?? "").trim() === "" });
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
    "the instrument-proof contract is broken — every INSTRUMENT_TOOLS member owes a planted-defect proof test (`@instrument-proof: <what is planted and what must red>`) in tests/tooling/<tool>/, the vocabulary is two-sided, and the registry must stay readable (docs/design/tooling-package.md §4.5).",
  fix: "add the marker-carrying proof test (plant the defect class, assert the instrument REDs), register the tool, or delete the stale/malformed marker.",
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
      const proven = state.markers.some((h) => h.tool === m.name && !h.malformed);
      if (!proven) {
        ctx.report({
          file: `tests/tooling/${m.name}`,
          line: 0,
          column: 0,
          message: `instrument "${m.name}" has no @instrument-proof test — a verdict tool without a planted-defect proof is a green that cannot fail (docs/design/tooling-package.md §4.5).`,
        });
      }
    }
    for (const h of state.markers) {
      if (h.malformed) {
        ctx.report({
          file: h.file,
          line: h.line,
          column: 0,
          message: "malformed @instrument-proof marker — the reason (what is planted and what must red) is REQUIRED (docs/design/tooling-package.md §4.5).",
        });
      } else if (!memberNames.has(h.tool)) {
        ctx.report({
          file: h.file,
          line: h.line,
          column: 0,
          message: `@instrument-proof marker in "${h.tool}"'s tree, but "${h.tool}" is not in INSTRUMENT_TOOLS — register it or delete the marker (docs/design/tooling-package.md §4.5).`,
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
      expect: { messageIncludes: "no @instrument-proof test" },
      why: "a registered instrument whose mirror tree carries no proof marker (arm B)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": "export const INSTRUMENT_TOOLS = [] as const;\n",
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tests/tooling/rogue/x.test.ts": "// @instrument-proof: plants a fake stutter and asserts red\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "not in INSTRUMENT_TOOLS" },
      why: "a proof marker in an unregistered tool's tree — the two-sided vocabulary arm (arm C)",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": 'export const INSTRUMENT_TOOLS = ["snapx"] as const;\n',
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "// @instrument-proof:\nexport const t = 1;\n",
      },
      expect: { messageIncludes: "malformed" },
      why: "a bare marker with no reason — must red as its own flavour, never sit there looking like protection (arm D)",
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
      },
      why: "a registered instrument with a reasoned proof marker — the honourable shape",
    },
    {
      files: {
        "tooling/src/_shared/instruments.ts": "export const INSTRUMENT_TOOLS = [] as const;\n",
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = 0;\n",
      },
      why: "an EMPTY registry is legal-armed (P1 state — members join as their tools land); emptiness is not blindness",
    },
  ],
};
