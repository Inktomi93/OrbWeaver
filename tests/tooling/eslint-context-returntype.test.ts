// orb/no-context-returntype refuses TypeScript's reflected `ReturnType` by where the checker binds it: the standard
// library or an `@types` package the program loaded as a library, store-linked or not. A workspace package published
// under an `@types` name declares a local type, which passes.
import { expect, test } from "@orb/testkit/tooling";
import { TYPES_SCOPE } from "../../tooling/src/eslint/library-source.ts";
import { contextReturnTypeRule } from "../../tooling/src/eslint/native.ts";
import type { Link } from "./_library-link.ts";
import { LINKS, lintLinked, plantLinked } from "./_library-link.ts";

const RULE = "orb/no-context-returntype";
const PROBE = "app/probe.ts";
const TYPES_NAME = "probe";
const FINDINGS: Readonly<Record<Link, readonly string[]>> = { workspace: [], dependency: [RULE] };

test.for(LINKS)("a global ReturnType declared by a %s in the @types scope", async (link, { plantedTree }) => {
  const root = await plantLinked(
    plantedTree,
    link,
    {
      name: `${TYPES_SCOPE}${TYPES_NAME}`,
      files: { "index.d.ts": "export {};\ndeclare global {\n  type ReturnType<T> = T extends (...args: never[]) => infer R ? R : never;\n}" },
    },
    { [PROBE]: `import "${TYPES_NAME}";\nexport type Built = ReturnType<() => string>;` },
  );
  // No standard library, so the planted package is the only declaration the checker can bind; the bare import resolves
  // to the `@types` package through node_modules.
  const found = lintLinked(root, PROBE, { "no-context-returntype": contextReturnTypeRule }, { options: { noLib: true } });
  expect(found.map(({ ruleId }) => ruleId)).toEqual(FINDINGS[link]);
});
