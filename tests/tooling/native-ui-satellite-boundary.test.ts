import { expect, test } from "@orb/testkit/tooling";
import dependencyCruiser from "../../.dependency-cruiser.ts";
import { cruiseRules, unresolvable } from "./_native-cruise.ts";

const SATELLITES = [
  { library: "echarts", owners: ["charts"] },
  { library: "echarts-for-react", owners: ["charts"] },
  { library: "@tanstack/react-virtual", owners: ["primitives/virtual-list", "primitives/message-list", "primitives/media-grid"] },
  { library: "@tanstack/virtual-core", owners: ["primitives/virtual-list", "primitives/message-list", "primitives/media-grid"] },
  { library: "codemirror", owners: ["code-editor"] },
  { library: "@codemirror/state", owners: ["code-editor"] },
  { library: "streamdown", owners: ["markdown"] },
  { library: "remark-gfm", owners: ["markdown"] },
  { library: "strip-markdown", owners: ["markdown"] },
  { library: "shiki", owners: ["markdown"] },
  { library: "@shikijs/core", owners: ["markdown"] },
  { library: "cmdk", owners: ["primitives/command"] },
  { library: "@dnd-kit/react", owners: ["primitives/sortable"] },
  { library: "diff", owners: ["diff"] },
  { library: "lucide-react", owners: ["primitives/icons"] },
  { library: "minisearch", owners: ["primitives/macro-textarea", "fuzzy-search"] },
] as const;

const CASES = SATELLITES.flatMap(({ library, owners }) => [
  ...owners.map((owner) => ({ library, owner, blocked: false })),
  { library, owner: owners.some((owner) => owner === "charts") ? "code-editor" : "charts", blocked: true },
  { library, owner: "lib", blocked: true },
]).map((row, index) => ({ ...row, entry: `packages/ui/src/${row.owner}/satellite-probe-${String(index)}.ts` }));

// Each library family has its own seal rule, named with this prefix.
const SEAL_RULE = "ui-satellite-seals";
const SEAL_RULES = dependencyCruiser.forbidden.flatMap(({ name }) => (name?.startsWith(SEAL_RULE) === true ? [name] : []));

// One planted tree and one run for every case: a case owns its own entry file, so its verdict is read off the shared
// run by path.
test("the native satellite boundary seals each library to its owning folders", async ({ plantedTree }) => {
  const root = await plantedTree({
    "packages/ui/package.json": JSON.stringify({ name: "@orb/ui", dependencies: Object.fromEntries(SATELLITES.map(({ library }) => [library, "1.0.0"])) }),
    ...Object.fromEntries(
      SATELLITES.flatMap(({ library }) => [
        [`node_modules/${library}/package.json`, JSON.stringify({ name: library, version: "1.0.0", main: "index.js" })],
        [`node_modules/${library}/index.js`, "export const value = 1;"],
      ]),
    ),
    ...Object.fromEntries(CASES.map(({ entry, library }) => [entry, `export { value } from "${library}";`])),
  });
  const violations = await cruiseRules(
    root,
    CASES.map(({ entry }) => entry),
    SEAL_RULES,
  );
  expect(unresolvable(violations)).toEqual([]);
  const sealed = new Set(violations.filter(({ rule }) => rule.startsWith(SEAL_RULE)).map(({ from }) => from));
  const verdicts = CASES.map(({ entry, library, owner }) => ({ library, owner, blocked: sealed.has(entry) }));
  expect(verdicts).toEqual(CASES.map(({ library, owner, blocked }) => ({ library, owner, blocked })));
});
