// Self-test for the LIVE `zustand-selector-derived` gate (scripts/check/gates/
// zustand-selector-derived.ts, registered in report.ts's ALL_CHECKS) — the Layer-3 structural half of
// the two-layer Zustand-selector-stability belt (Layer 2 = tools/grit/zustand-selector-stability.grit,
// which only catches the narrow "arrow concise-body IS an object/array literal" shape). Drives the
// Check directly over an in-memory ts-morph project (never the real tree), proving each FLAG shape
// (fresh object/array literal, block-bodied return, ternary/`??` branch, Object.keys/values/entries,
// array-rebuilding .map/.filter, the vanilla `useStore(store, selector)` call shape) fires, and each
// PASS shape (single-field, frozen-constant identifier, useShallow-wrapped — either call shape,
// non-store calls, by-reference selectors) stays clean.
import { Project } from "ts-morph";
import { zustandSelectorDerived } from "../../scripts/check/gates/zustand-selector-derived.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

const STATE = "packages/client/src/state";

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a selector returning a fresh object literal", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("fresh object literal"))).toBe(true);
});

test("fires on a selector returning a fresh array literal", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => [s.a, s.b]);\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("fresh array literal"))).toBe(true);
});

test("fires on a block-bodied selector that `return`s a fresh object literal", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  return { a: s.a };\n});\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("fresh object literal"))).toBe(true);
});

test("fires when the FRESH branch is on the far side of a `??`/ternary (the stable-default branch alone can't mask it)", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { items: readonly number[] | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items ?? []);\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("fresh array literal"))).toBe(true);
});

test("fires on Object.keys/values/entries derivations", () => {
  const ctx = ctxFor({
    [`${STATE}/keys.ts`]:
      "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const k = useXStore((s) => Object.keys(s.m));\n",
    [`${STATE}/values.ts`]:
      "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const vals = useXStore((s) => Object.values(s.m));\n",
    [`${STATE}/entries.ts`]:
      "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const e = useXStore((s) => Object.entries(s.m));\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.filter((x) => x.message.includes("Object.")).length).toBe(3);
});

test("fires on a .map()-rebuilt array (spread/derive-a-new-array footgun)", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { items: readonly number[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.map((n) => n * 2));\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("array-rebuilding"))).toBe(true);
});

test("fires on the vanilla useStore(store, selector) call shape (createEntityDraftStore's adapter)", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useStore: (store: unknown, sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, (s) => ({ a: s.a, b: s.b }));\n",
  });
  const v = zustandSelectorDerived.run(ctx);
  expect(v.some((x) => x.message.includes("fresh object literal"))).toBe(true);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on a single-field selector", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.a);\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("clean on a selector returning a frozen module constant (identifier, not a literal)", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "const EMPTY = Object.freeze({});\ndeclare const useXStore: (sel: (s: { m: Record<string, number> | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.m ?? EMPTY);\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("clean when the derived selector is wrapped in useShallow — the hook-store call shape", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useXStore: (sel: unknown) => unknown;\ndeclare const useShallow: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore(useShallow((s) => ({ a: s.a, b: s.b })));\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("clean when the derived selector is wrapped in useShallow — the vanilla useStore(store, selector) call shape", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useStore: (store: unknown, sel: unknown) => unknown;\ndeclare const useShallow: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, useShallow((s) => ({ a: s.a, b: s.b })));\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("clean on a ternary selector whose branches are both stable references (no fresh literal on either side)", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "const IDLE = { phase: 'idle' } as const;\ndeclare const useXStore: (sel: (s: { id: string | null; turns: Record<string, unknown> }) => unknown) => unknown;\nexport const v = useXStore((s) => (s.id === null ? IDLE : (s.turns[s.id] ?? IDLE)));\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("ignores a non-store call (callee doesn't match use<X>Store / useStore) — scope", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "declare const useMemo: (fn: () => unknown, deps: unknown[]) => unknown;\nexport const v = useMemo(() => ({ a: 1 }), []);\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("ignores an indirect (by-reference) selector — out of this AST-only gate's reach", () => {
  const ctx = ctxFor({
    [`${STATE}/x.ts`]:
      "function selectAB(s: { a: number; b: number }) {\n  return { a: s.a, b: s.b };\n}\ndeclare const useXStore: (sel: typeof selectAB) => unknown;\nexport const v = useXStore(selectAB);\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});

test("ignores non-client files (scope — only packages/client/src is scanned)", () => {
  const ctx = ctxFor({
    "packages/server/src/domain/x/verbs/act.ts":
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });
  expect(zustandSelectorDerived.run(ctx)).toEqual([]);
});
