import { Node, Project, SyntaxKind } from "ts-morph";
import { collectByKinds } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { FixturePathOrigin } from "../../../../tooling/src/verify/contract/fixture-path-origin.ts";
import { createFixturePathOriginReader } from "../../../../tooling/src/verify/lib/fixture-path-origin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/fixture-path-origin";
const SUPPORT = `${ROOT}/tests/support/tool-fixtures.ts`;
const SUBJECT = `${ROOT}/tests/tooling/verify/gates/probe.test.ts`;

function origins(source: string): readonly FixturePathOrigin[] {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    SUPPORT,
    "export function test(name: string, body: (fixtures: { scratch: string; repoRoot: string }) => unknown): void { void name; void body; }\nexport function fixturePath(root: string, ...parts: string[]): string { return [root, ...parts].join('/'); }\n",
  );
  const subject = project.createSourceFile(SUBJECT, source);
  const reader = createFixturePathOriginReader();
  collectByKinds(
    project.getSourceFiles(),
    new Map([
      [
        SyntaxKind.CallExpression,
        [
          (node): void => {
            if (Node.isCallExpression(node)) {
              reader.visitCall(node);
            }
          },
        ],
      ],
      [
        SyntaxKind.Identifier,
        [
          (node): void => {
            if (Node.isIdentifier(node)) {
              reader.visitIdentifier(node);
            }
          },
        ],
      ],
    ]),
  );
  return subject
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText().includes("writeFileSync"))
    .flatMap((call) => {
      const argument = call.getArguments()[0];
      return argument === undefined ? [] : [reader.read(argument)];
    });
}

const PRELUDE =
  'import { writeFileSync, mkdtempSync } from "node:fs";\nimport { tmpdir } from "node:os";\nimport { join, resolve } from "node:path";\nimport { test } from "../../../support/tool-fixtures.ts";\n';

test("canonical fixture identity and complete helper callers determine the root", () => {
  expect(
    origins(
      `${PRELUDE}test("x", ({ scratch, repoRoot }) => { function plant(root: string): void { writeFileSync(join(root, "x"), "x"); } plant(scratch); plant(scratch); });\n`,
    ).map(({ kind }) => kind),
  ).toEqual(["scratch"]);

  expect(
    origins(
      `${PRELUDE}test("x", ({ scratch, repoRoot }) => { function plant(root: string): void { writeFileSync(join(root, "x"), "x"); } plant(scratch); plant(repoRoot); });\n`,
    ).map(({ kind }) => kind),
  ).toEqual(["checkout"]);
});

test("path composition rejects root escape, absolute reset, and unreadable dynamic suffixes", () => {
  const result = origins(
    `${PRELUDE}test("x", ({ scratch }) => {
      writeFileSync(join(scratch, "a", "..", "b"), "x");
      writeFileSync(join(scratch, "..", "b"), "x");
      writeFileSync(resolve(scratch, process.cwd()), "x");
      function plant(rel: string): void { writeFileSync(join(scratch, rel), "x"); }
      exportIdentity(plant);
    });
    declare function exportIdentity(value: unknown): void;
    `,
  );
  expect(result.map(({ kind }) => kind)).toEqual(["scratch", "unreadable", "checkout", "unreadable"]);
});

test("only a unique mkdtemp below canonical tmpdir is owned", () => {
  const result = origins(
    `${PRELUDE}writeFileSync(join(tmpdir(), "shared"), "x");
    const misplaced = mkdtempSync(tmpdir());
    writeFileSync(join(misplaced, "not-below-tmpdir"), "x");
    const scratch = mkdtempSync(join(tmpdir(), "orb-fixture-"));
    writeFileSync(join(scratch, "owned"), "x");
    `,
  );
  expect(result.map(({ kind }) => kind)).toEqual(["unreadable", "unreadable", "scratch"]);
});

test("a local callback property named scratch does not mint provenance", () => {
  const result = origins(
    `${PRELUDE}function fakeTest(_name: string, body: (fixtures: { scratch: string }) => void): void { body({ scratch: "/tmp/fake" }); }
    fakeTest("x", ({ scratch }) => writeFileSync(join(scratch, "x"), "x"));
    `,
  );
  expect(result.map(({ kind }) => kind)).toEqual(["unreadable"]);
});

test("the canonical checked fixturePath preserves root authority across a dynamic suffix", () => {
  const result = origins(
    `${PRELUDE}import { fixturePath } from "../../../support/tool-fixtures.ts";
    test("x", ({ scratch, repoRoot }) => {
      writeFileSync(fixturePath(scratch, runtimeKey()), "x");
      writeFileSync(fixturePath(repoRoot, runtimeKey()), "x");
    });
    declare function runtimeKey(): string;
    `,
  );
  expect(result.map(({ kind }) => kind)).toEqual(["scratch", "checkout"]);
});
