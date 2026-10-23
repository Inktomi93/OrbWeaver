import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

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
]);

test.for(CASES)("the native satellite boundary judges $owner importing $library (blocked=$blocked)", async (row, { plantedTree, repoRoot }) => {
  const entry = `packages/ui/src/${row.owner}/probe.ts`;
  const root = await plantedTree({
    "packages/ui/package.json": JSON.stringify({ name: "@orb/ui", dependencies: { [row.library]: "1.0.0" } }),
    [`node_modules/${row.library}/package.json`]: JSON.stringify({ name: row.library, version: "1.0.0", main: "index.js" }),
    [`node_modules/${row.library}/index.js`]: "export const value = 1;",
    [entry]: `export { value } from "${row.library}";`,
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [entry, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status === 0, output).toBe(!row.blocked);
  expect(output.includes("ui-satellite-seals"), output).toBe(row.blocked);
});
