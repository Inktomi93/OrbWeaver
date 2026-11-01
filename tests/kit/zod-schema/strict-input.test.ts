import { strictTwin } from "@orb/kit/zod-schema";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

test("the twin refuses an undeclared key at every depth the source schema strips it", () => {
  const source = z.object({
    kind: z.discriminatedUnion("k", [z.object({ k: z.literal("a"), n: z.number() }), z.object({ k: z.literal("b") })]),
    rows: z.array(z.object({ id: z.string() })).optional(),
    pair: z.tuple([z.object({ x: z.number() })]),
    byKey: z.record(z.string(), z.object({ on: z.boolean() })),
  });
  const twin = strictTwin(source);
  const valid = { kind: { k: "a", n: 1 }, rows: [{ id: "r" }], pair: [{ x: 1 }], byKey: { a: { on: true } } };
  expect(twin.parse(valid)).toEqual(source.parse(valid));
  for (const extra of [
    { ...valid, top: 1 },
    { ...valid, kind: { k: "a", n: 1, junk: 1 } },
    { ...valid, rows: [{ id: "r", junk: 1 }] },
    { ...valid, pair: [{ x: 1, junk: 1 }] },
    { ...valid, byKey: { a: { on: true, junk: 1 } } },
  ]) {
    expect(source.safeParse(extra).success).toBe(true);
    expect(twin.safeParse(extra).success).toBe(false);
  }
});

test("the twin keeps refinements, defaults, transforms and preprocessing", () => {
  const source = z
    .object({ low: z.number(), high: z.number(), label: z.string().default("x"), size: z.string().transform((s) => s.length) })
    .refine((v) => v.low <= v.high, { error: "low above high" });
  const twin = strictTwin(source);
  expect(twin.parse({ low: 1, high: 2, size: "abc" })).toEqual({ low: 1, high: 2, label: "x", size: 3 });
  expect(twin.safeParse({ low: 3, high: 2, size: "" }).success).toBe(false);
  const preprocessed = strictTwin(z.preprocess((raw) => (typeof raw === "string" ? { name: raw } : raw), z.object({ name: z.string() })));
  expect(preprocessed.parse("lamp")).toEqual({ name: "lamp" });
  expect(preprocessed.safeParse({ name: "lamp", junk: 1 }).success).toBe(false);
});

test("a catch stays a heal boundary and a declared loose object stays open", () => {
  const twin = strictTwin(z.object({ healed: z.object({ a: z.string() }).catch({ a: "fallback" }), open: z.looseObject({ auth: z.string() }) }));
  expect(twin.parse({ healed: { a: "kept", junk: 1 }, open: { auth: "k", extra: 2 } })).toEqual({ healed: { a: "kept" }, open: { auth: "k", extra: 2 } });
});

test("a self-referencing schema resolves through lazy and getter recursion", () => {
  interface Node {
    readonly name: string;
    readonly children?: readonly Node[] | undefined;
  }
  const node: z.ZodType<Node> = z.lazy(() => z.object({ name: z.string(), children: z.array(node).optional() }));
  const tree = z.object({
    name: z.string(),
    get next(): z.ZodOptional<typeof tree> {
      return tree.optional();
    },
  });
  const lazyTwin = strictTwin(node);
  expect(lazyTwin.parse({ name: "a", children: [{ name: "b" }] })).toEqual({ name: "a", children: [{ name: "b" }] });
  expect(lazyTwin.safeParse({ name: "a", children: [{ name: "b", junk: 1 }] }).success).toBe(false);
  const getterTwin = strictTwin(tree);
  expect(getterTwin.parse({ name: "a", next: { name: "b" } })).toEqual({ name: "a", next: { name: "b" } });
  expect(getterTwin.safeParse({ name: "a", next: { name: "b", junk: 1 } }).success).toBe(false);
});

test("a lazy the source has already resolved still twins to a strict inner", () => {
  const node = z.lazy(() => z.object({ name: z.string() }));
  expect(node.parse({ name: "a", junk: 1 })).toEqual({ name: "a" });
  expect(strictTwin(node).safeParse({ name: "a", junk: 1 }).success).toBe(false);
});
