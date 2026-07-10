// Self-test for the LIVE `state-files` gate (scripts/check/gates/state-files.ts, registered in
// report.ts's ALL_CHECKS). Drives the Check directly over an in-memory ts-morph project (the gate
// reads NO fs — it only walks ASTs by file path), never the real tree, proving each of the three rules
// FIRES on a violation AND stays clean on a well-formed store.
import { stateFiles } from "../../scripts/check/gates/state-files.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const STATE = "packages/client/src/state";

test("clean on a well-formed single unexported store (1 mint, ≤10 fields, no exported handle)", () => {
  const ctx = ctxFor({
    [`${STATE}/ok.ts`]:
      'const useX = createGatedStore("x", () => ({ a: 1, b: 2 }));\nexport const val = () => useX();\n',
  });
  expect(stateFiles.run(ctx)).toEqual([]);
});

test("fires on two store-minting calls in one file (rule 1 — one store per file)", () => {
  const ctx = ctxFor({
    [`${STATE}/two.ts`]:
      'const a = createGatedStore("a", () => ({ n: 0 }));\nconst b = createGatedStore("b", () => ({ n: 0 }));\nexport const v = () => a() + b();\n',
  });
  const v = stateFiles.run(ctx);
  expect(v.some((x) => x.message.includes("store-minting calls in one file"))).toBe(true);
});

test("fires on a store initializer with >10 top-level fields (rule 2 — field cap)", () => {
  const fields = Array.from({ length: 11 }, (_v, i) => `f${i}: 0`).join(", ");
  const ctx = ctxFor({
    [`${STATE}/big.ts`]: `const useX = createGatedStore("x", () => ({ ${fields} }));\nexport const v = () => useX();\n`,
  });
  const v = stateFiles.run(ctx);
  expect(v.some((x) => x.message.includes("top-level fields"))).toBe(true);
});

test("does NOT fire at exactly 10 fields (boundary — cap is >10)", () => {
  const fields = Array.from({ length: 10 }, (_v, i) => `f${i}: 0`).join(", ");
  const ctx = ctxFor({
    [`${STATE}/edge.ts`]: `const useX = createGatedStore("x", () => ({ ${fields} }));\nexport const v = () => useX();\n`,
  });
  expect(stateFiles.run(ctx)).toEqual([]);
});

test("fires on an exported minted store handle (rule 3 — no exported handle)", () => {
  const ctx = ctxFor({
    [`${STATE}/leak.ts`]: 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
  });
  const v = stateFiles.run(ctx);
  expect(v.some((x) => x.message.includes("minted store handle is exported"))).toBe(true);
});

test("catches a wrapped exported handle (create<T>()(...) application form)", () => {
  const ctx = ctxFor({
    [`${STATE}/wrapped.ts`]: "export const s = create<{ n: number }>()(() => ({ n: 0 }));\n",
  });
  const v = stateFiles.run(ctx);
  expect(v.some((x) => x.message.includes("minted store handle is exported"))).toBe(true);
});

test("ignores nested state buckets + index.ts + non-state files (scope)", () => {
  const ctx = ctxFor({
    [`${STATE}/sub/nested.ts`]: 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
    [`${STATE}/index.ts`]: 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
    "packages/client/src/data/x.ts":
      'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
  });
  expect(stateFiles.run(ctx)).toEqual([]);
});
