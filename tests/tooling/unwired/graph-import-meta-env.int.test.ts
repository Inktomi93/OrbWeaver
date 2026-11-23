// Vite's import.meta.env keys are members of the tree's own ImportMetaEnv: a key read through import.meta.env is read,
// and a declared key nothing reads is reported like any member nothing reads.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const ENV = `${GRAPH_SOURCE}/env.d.ts`;
const MAIN = `${GRAPH_SOURCE}/main.ts`;

test("an import.meta.env key nothing reads is untouched; one read is read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [ENV]: [
        "interface ImportMetaEnv { readonly VITE_READ: string; readonly VITE_SPARE: string }",
        "interface ImportMeta { readonly env: ImportMetaEnv }",
      ].join("\n"),
      [MAIN]: "export {};\nvoid import.meta.env.VITE_READ;",
    },
    { entries: [MAIN] },
  );
  expect(labelsIn(scan, "member-untouched", ENV)).toEqual(["ImportMetaEnv.VITE_SPARE"]);
});
