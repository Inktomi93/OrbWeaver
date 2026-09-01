// Integration proof for docs/design/integer-line-boxes.md: the token-arithmetic arm, the CSS vocabulary
// arm with its two-sided exemption row, and the blindness floors — driven over a REAL temp dir because
// the gate is fsBacked (tokens.json and stylesheets are read off disk, not from the ts-morph project).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project, ScriptKind } from "ts-morph";
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePassResult } from "../../../../tooling/src/verify/contract/pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/integer-line-boxes.ts";
import type { GateRunCtx } from "../../../../tooling/src/verify/index.ts";
import { runPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TOKENS_JSON_REL = "packages/ui/src/tokens/tokens.json";
const ANCHOR_REL = "packages/ui/src/lib/class-merge.ts";

const SNAPPED_SCALE = JSON.stringify({
  text: {
    label: { $type: "dimension", $value: { value: 0.8125, unit: "rem" } },
    micro: { $type: "dimension", $value: { value: 0.656_25, unit: "rem" } },
  },
  leading: {
    none: { $type: "number", $value: 1 },
    label: { $type: "dimension", $value: { value: 1, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } },
    micro: { $type: "dimension", $value: { value: 0.8125, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } },
  },
});

function passFor(files: Readonly<Record<string, string>>): GatePassResult {
  const root = mkdtempSync(join(tmpdir(), "integer-line-boxes-"));
  try {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
    const sources: import("ts-morph").SourceFile[] = [];
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
      if (rel.endsWith(".ts") || rel.endsWith(".tsx")) {
        sources.push(project.createSourceFile(`${root}/${rel}`, text, { scriptKind: rel.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS }));
      }
    }
    const base: Omit<GateRunCtx, "report" | "scan"> = {
      root,
      project,
      scope: { kind: "project" },
      files: sources,
      checker: () => project.getTypeChecker(),
    };
    const result = runPass([gate], base);
    expect(result.toolErrors).toEqual([]);
    const pass = result.gates[0];
    expect(pass).toBeDefined();
    return pass as GatePassResult;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function findings(files: Readonly<Record<string, string>>): readonly Finding[] {
  return passFor(files).findings;
}

test("ARM T: a fractional authored leading is RED with the resolved px named; a snapped integer scale is silent", () => {
  const fractional = JSON.stringify({
    text: {},
    leading: { label: { $type: "dimension", $value: { value: 1.015_625, unit: "rem" }, $extensions: { "orb.output": { kind: "snapped" } } } },
  });
  const red = findings({ [TOKENS_JSON_REL]: fractional });
  expect(red.some((finding) => finding.message?.includes("16.25px") === true && finding.message.includes("fractional line box"))).toBe(true);
  expect(findings({ [TOKENS_JSON_REL]: SNAPPED_SCALE })).toEqual([]);
});

test("ARM C: a literal stylesheet line-height is RED at its line; the vocabulary and tier-alias forms pass", () => {
  const got = findings({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    "packages/ui/src/styles/extra.css":
      ".a {\n  line-height: var(--leading-label);\n}\n.b {\n  line-height: 1.4;\n}\n.c {\n  --orb-tier-row-title-leading: var(--leading-micro);\n  line-height: var(--orb-tier-row-title-leading);\n}\n",
  });
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ file: "packages/ui/src/styles/extra.css", line: 5, token: "1.4" });
});

test("the reading-surface exemption row is honored where it lives and STALE-red on the anchored tree when unused", () => {
  // The row's exact key present: exempt, no finding — even with the real-tree anchor loaded.
  const honored = findings({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    [ANCHOR_REL]: "export const anchor = 1;\n",
    "packages/client/src/styles/globals.css": ".bubble {\n  line-height: var(--reading-line-height);\n}\n",
  });
  expect(honored.filter((finding) => finding.token === "var(--reading-line-height)")).toEqual([]);
  // Anchor loaded but the exempted declaration gone: the row itself must go RED (two-sided promise).
  const stale = findings({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    [ANCHOR_REL]: "export const anchor = 1;\n",
  });
  expect(stale.some((finding) => finding.message?.includes("stale row") === true)).toBe(true);
});

test("blindness floors fire on the anchored tree: a tiny census is blind, not clean; an unanchored mini stays silent", () => {
  const anchored = findings({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    [ANCHOR_REL]: "export const anchor = 1;\n",
    "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
    "packages/client/src/styles/globals.css": ".bubble {\n  line-height: var(--reading-line-height);\n}\n",
  });
  expect(anchored.some((finding) => finding.message?.includes("census below the real-tree floor") === true)).toBe(true);
  const unanchored = findings({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    "packages/ui/src/x.tsx": 'export const G = <div className="text-label leading-label" />;\n',
  });
  expect(unanchored).toEqual([]);
});

test("scan declaration counts class candidates plus stylesheets so the harness row shows what was actually read", () => {
  const pass = passFor({
    [TOKENS_JSON_REL]: SNAPPED_SCALE,
    "packages/ui/src/x.tsx": 'export const G = <div className="text-micro leading-micro" />;\n',
    "packages/ui/src/styles/extra.css": ".a {\n  line-height: var(--leading-label);\n}\n",
  });
  expect(pass.scan.declared?.unit).toBe("line-box carrier");
  expect(pass.scan.declared?.scanned).toBe(2);
});
