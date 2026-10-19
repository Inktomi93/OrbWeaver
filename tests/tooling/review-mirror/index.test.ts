import { readFileSync } from "node:fs";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { ReviewMirrorEvidence } from "../../../tooling/src/review-mirror/index.ts";
import { assertReviewEvidence, censusPendingGuards, reviewEvidenceGaps, stripComments } from "../../../tooling/src/review-mirror/index.ts";

const ROOT = "/review-fixture";

function evidence(): ReviewMirrorEvidence {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-25T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    mirror: {
      target: "/tmp/mirror",
      tracked: 10,
      mirroredFiles: 8,
      mirroredCode: 6,
      mirroredBytes: 100,
      stripped: 5,
      copied: 3,
      dropped: 2,
      errors: [],
      missingCode: [],
    },
    reviewFocus: [
      { id: "e5", family: "E5", title: "x", path: "x.ts", symbol: "x", why: "x", line: 1 },
      { id: "e6", family: "E6", title: "y", path: "y.ts", symbol: "y", why: "y", line: 1 },
    ],
    pendingGuard: {
      scannedTsx: 1,
      directControls: 1,
      reviewResiduals: 1,
      rows: [
        {
          path: "packages/client/src/x.tsx",
          line: 1,
          component: "X",
          control: "Button",
          handler: "<inline:1>",
          mutations: ["mutate"],
          disabled: null,
          classification: "missing",
        },
      ],
      totals: { "direct-pending": 0, "derived-pending": 0, epoch: 0, missing: 1, "other-guard": 0 },
    },
  };
}

test("TS stripping PRESERVES a suppression/directive marker instead of erasing gate-ownership evidence (#1496)", () => {
  const source =
    "// @orb-waive caught-failure-ownership(err): optional read\n" +
    "const x = 1; // biome-ignore lint/x: reason\n" +
    "// @ts-expect-error narrow union\n" +
    "const y = 2; // plain narration, drop this\n";
  const stripped = stripComments("sample.ts", source);
  expect(stripped).toContain("@orb-waive caught-failure-ownership");
  expect(stripped).toContain("biome-ignore lint/x: reason");
  expect(stripped).toContain("@ts-expect-error narrow union");
  expect(stripped).not.toContain("plain narration");
});

test("TS stripping removes comments without corrupting regex, template or line positions", () => {
  const source = readFileSync(new URL("./template-literal-source.txt", import.meta.url), "utf8");
  const templateRead = source.split("\n")[1]?.replace("const value = ", "").replace(/;$/u, "") ?? "";
  const stripped = stripComments("sample.ts", source);
  expect(stripped).toContain("/https?:\\/\\//u");
  expect(stripped).toContain(templateRead);
  expect(stripped).not.toContain("prose");
  expect(stripped).not.toContain("comment");
  expect(stripped.split("\n")).toHaveLength(source.split("\n").length);
});

test("CSS and SCSS stripping preserves directive comments but removes prose without touching quoted literals", () => {
  const source =
    "/* biome-ignore lint/x: intentional */\n" +
    ".a { color: red; } /* ordinary prose */\n" +
    "/* eslint-disable lint/y */\n" +
    '.b { content: "/* biome-ignore lint/z: literal */"; }\n' +
    "/* eslint-enable lint/y */\n";
  for (const extension of ["css", "scss"]) {
    const stripped = stripComments(`sample.${extension}`, source);
    expect(stripped).toContain("/* biome-ignore lint/x: intentional */");
    expect(stripped).toContain("/* eslint-disable lint/y */");
    expect(stripped).toContain("/* eslint-enable lint/y */");
    expect(stripped).toContain('.b { content: "/* biome-ignore lint/z: literal */"; }');
    expect(stripped).not.toContain("ordinary prose");
    expect(stripped.split("\n")).toHaveLength(source.split("\n").length);
  }
});

// @instrument-proof: corrupt mirror and pending-guard populations are planted and the evidence door must reject the review verdict.
// @instrument-absence-proof: tracked, mirrored-code, and E7 census populations are emptied and must never read as a clean review sweep.
test("missing or empty generation evidence is an instrument error, never a clean zero", () => {
  const valid = evidence();
  expect(reviewEvidenceGaps(valid)).toEqual([]);
  expect(reviewEvidenceGaps({ ...valid, pendingGuard: { ...valid.pendingGuard, reviewResiduals: 0 } })).toContain(
    "E7 review-residual count does not equal missing plus unclassified and generation-guard controls",
  );
  const empty: ReviewMirrorEvidence = {
    ...valid,
    mirror: { ...valid.mirror, tracked: 0, mirroredFiles: 0, mirroredCode: 0, mirroredBytes: 0, missingCode: ["x.ts"] },
    pendingGuard: { ...valid.pendingGuard, scannedTsx: 0, directControls: 0, reviewResiduals: 0, rows: [] },
  };
  expect(reviewEvidenceGaps(empty)).toEqual(
    expect.arrayContaining([
      "git tracked-file census is empty",
      "mirror generation produced empty file/code/byte evidence",
      "mirror is missing 1 tracked code file(s)",
      "E7 Button/Switch pending-guard census is empty",
    ]),
  );
  expect(() => assertReviewEvidence(empty)).toThrow("review-mirror evidence is not a verdict");
});

test("the E7 census distinguishes direct, derived, epoch and genuinely missing guards", () => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(
    `${ROOT}/packages/client/src/example.tsx`,
    `export function Example() {
      const save = () => mutation.mutate();
      const busy = mutation.isPending || other;
      const epochSave = () => { if (requestEpoch !== currentEpoch) return; mutation.mutate(); };
      const requestIdSave = () => { const requestId = "request_fixture"; mutation.mutate({ requestId }); };
      const visibleSave = () => mutation.mutate();
      const nestedOnly = () => { queueMicrotask(() => mutation.mutate()); };
      return <>
        <Button onClick={() => mutation.mutate()} />
        <Button onClick={save} disabled={busy} />
        <Switch onCheckedChange={() => mutation.mutateAsync()} disabled={mutation.isPending} />
        <Button onClick={epochSave} />
        <Button onClick={requestIdSave} />
        <Button onClick={visibleSave} disabled={isPendingLabelVisible} />
        <Button onClick={save} disabled={canSave} />
        <Button onClick={nestedOnly} />
      </>;
    }
    `,
  );
  const census = censusPendingGuards(project, ROOT);
  expect(census.scannedTsx).toBe(1);
  expect(census.directControls).toBe(7);
  expect(census.reviewResiduals).toBe(5);
  expect(census.totals).toEqual({ "direct-pending": 1, "derived-pending": 1, epoch: 1, missing: 2, "other-guard": 2 });
  expect(census.rows.map((row) => row.line)).toEqual([9, 10, 11, 12, 13, 14, 15]);
});

const LEXICAL_CASES = [
  {
    name: "CSS escaped quotes retain comment-looking text",
    path: "fixture.css",
    source: '.a { content: "a\\"/* literal */"; } /* prose */\n',
    expected: '.a { content: "a\\"/* literal */"; }\n',
  },
  {
    name: "CSS escaped backslash still allows a closing quote",
    path: "fixture.scss",
    source: ".a { content: 'a\\\\'; } /* prose */\n",
    expected: ".a { content: 'a\\\\'; }\n",
  },
  {
    name: "CSS CRLF block comments preserve newline positions",
    path: "fixture.css",
    source: ".a {} /* prose\r\nnext\n*/ .b {}\r\n",
    expected: ".a {}\n\n .b {}\r\n",
  },
  {
    name: "CSS unterminated quoted backslash remains literal",
    path: "fixture.css",
    source: '.a { content: "unfinished\\',
    expected: '.a { content: "unfinished\\',
  },
  {
    name: "CSS unterminated prose retains its line hole",
    path: "fixture.scss",
    source: ".a {}/* prose\nrest",
    expected: ".a {}\n",
  },
  {
    name: "CSS unterminated directive remains observable",
    path: "fixture.css",
    source: "/* biome-ignore lint/x: retained\nrest",
    expected: "/* biome-ignore lint/x: retained\nrest",
  },
  {
    name: "CSS directive range keeps its exact ownership",
    path: "fixture.scss",
    source: "/* biome-ignore-start lint/x: retained */\n.a {} /* prose */\n/* biome-ignore-end lint/x: retained */\n",
    expected: "/* biome-ignore-start lint/x: retained */\n.a {}\n/* biome-ignore-end lint/x: retained */\n",
  },
  {
    name: "SQL doubled quote protects comment-looking text",
    path: "fixture.sql",
    source: "select 'can''t -- /* literal */'; -- prose\nselect 1/* prose\nrest */;",
    expected: "select 'can''t -- /* literal */';\nselect 1\n;",
  },
  {
    name: "SQL backslash is not a quote escape",
    path: "fixture.sql",
    source: "select 'back\\' /* prose */;",
    expected: "select 'back\\' ;",
  },
  {
    name: "SQL CRLF line comment stops at the newline",
    path: "fixture.sql",
    source: "select 1; -- prose\r\nselect 2;\r\n",
    expected: "select 1;\nselect 2;\r\n",
  },
  {
    name: "SQL unterminated quoted comment stays literal",
    path: "fixture.sql",
    source: "select 'unfinished -- /* literal */\nrest",
    expected: "select 'unfinished -- /* literal */\nrest",
  },
  {
    name: "SQL unterminated block preserves only its newlines",
    path: "fixture.sql",
    source: "select 1;/* prose\nrest",
    expected: "select 1;\n",
  },
] as const;

for (const { name, path, source, expected } of LEXICAL_CASES) {
  test(name, () => {
    const stripped = stripComments(path, source);
    expect(stripped).toBe(expected);
    expect(stripped.split("\n")).toHaveLength(source.split("\n").length);
  });
}
