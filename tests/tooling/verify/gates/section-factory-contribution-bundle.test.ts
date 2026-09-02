// section-factory-contribution-bundle (#947) — a registry parameter reached through a type ALIAS is the
// same positional seam wearing a name. The gate used to compare the parameter's TEXT and recorded that
// escape as a DECLARED LIMIT with its own `mustPass` row — a proof that BLESSED the false negative. The
// alias resolution's red/green pair is pinned by conformance; this file pins the REFUSALS (a cycle, an
// over-deep chain), which a conformance row cannot express because a throwing example is a failed proof.
import { gate } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const SECTION = "packages/client/src/features/chat/lib/chats-section.tsx";

function toolErrors(files: Readonly<Record<string, string>>): readonly string[] {
  const { project, root } = ctxFor({ ...files });
  const pass = runPass([gate], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return pass.toolErrors.map((error) => error.message);
}

test("a type-alias CYCLE refuses instead of recursing while resolving a parameter type", () => {
  expect(
    toolErrors({
      "packages/client/src/features/chat/lib/types.ts": "export type A = B;\nexport type B = A;\n",
      [SECTION]: 'import type { A, B } from "./types";\nexport function makeChatsSection(a: A, b: B): SectionDefinition {\n  return null as never;\n}\n',
    })[0],
  ).toContain("type-alias cycle");
});

test("an alias chain deeper than the declared hop budget refuses — it is no longer honest authoring", () => {
  const chain = Array.from({ length: 10 }, (_, i) => `export type T${i} = T${i + 1};`).join("\n");
  expect(
    toolErrors({
      "packages/client/src/features/chat/lib/types.ts": `${chain}\nexport type T10 = ContributorRegistry<X>;\n`,
      [SECTION]: 'import type { T0 } from "./types";\nexport function makeChatsSection(a: T0, b: T0): SectionDefinition {\n  return null as never;\n}\n',
    })[0],
  ).toContain("type-alias chain deeper than");
});
