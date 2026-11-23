// Each syntactic form a member use takes, as one row of a table: the member bucket it leaves a member in, or null when
// the form reads the member. Bumps and deletes follow roles.ts; a key test touches a member without reading it, and
// reflection hands the value on whole.
import { expect, test } from "@orb/testkit/tooling";
import type { MemberBucket } from "../../../tooling/src/unwired/index.ts";
import { MEMBER_BUCKETS } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/forms.ts`;

const FORMS = [
  "read",
  "write",
  "compound",
  "postfix",
  "prefix",
  "used-bump",
  "object-destructuring-target",
  "array-destructuring-target",
  "for-of-target",
  "delete",
  "destructured-read",
  "element-write",
  "optional-read",
  "contextual-literal",
  "shorthand-literal",
  "spread",
  "in-test",
  "typed-in-test",
  "object-keys",
] as const;
type Form = (typeof FORMS)[number];

// Each form's use of its own holder's member `m`: the holder is `o`, a `Box` of that form's name.
const ROWS: { readonly [F in Form]: { readonly use: string; readonly bucket: MemberBucket | null } } = {
  read: { use: "console.log(o.m);", bucket: null },
  write: { use: "o.m = 1;", bucket: "member-write-only" },
  compound: { use: "o.m += 1;", bucket: "member-write-only" },
  postfix: { use: "o.m++;", bucket: "member-write-only" },
  prefix: { use: "--o.m;", bucket: "member-write-only" },
  "used-bump": { use: "console.log(o.m++);", bucket: null },
  "object-destructuring-target": { use: "({ a: o.m } = src);", bucket: "member-write-only" },
  "array-destructuring-target": { use: "[o.m] = list;", bucket: "member-write-only" },
  "for-of-target": { use: "for (o.m of list) {}", bucket: "member-write-only" },
  delete: { use: "delete (o as Partial<typeof o>).m;", bucket: null },
  "destructured-read": { use: "const { m } = o; console.log(m);", bucket: null },
  "element-write": { use: 'o["m"] = 2;', bucket: "member-write-only" },
  "optional-read": { use: "console.log(o?.m);", bucket: null },
  "contextual-literal": { use: "take({ m: 1 }, o);", bucket: "member-write-only" },
  "shorthand-literal": { use: "const m = 3; take({ m }, o);", bucket: "member-write-only" },
  spread: { use: "console.log({ ...o }.m);", bucket: null },
  "in-test": { use: 'if ("m" in o) {}', bucket: null },
  "typed-in-test": { use: 'const key: "m" | "n" = "m"; if (key in o) {}', bucket: null },
  "object-keys": { use: "console.log(Object.keys(o));", bucket: "member-sent-only" },
};

const holder = (form: Form): string => `Box_${form.replaceAll("-", "_")}`;

const planted = FORMS.flatMap((form) => {
  const box = holder(form);
  return [`export interface ${box} { m: number }`, `export function ${box.toLowerCase()}(o: ${box}): void {`, `  ${ROWS[form].use}`, "}"];
});

test("each member form leaves its member in the bucket its row names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "declare const src: { a: number }; declare const list: number[];",
      "declare function take<T>(value: Partial<T>, _like: T): void;",
      ...planted,
    ].join("\n"),
  });
  const bucketOf = new Map(MEMBER_BUCKETS.flatMap((bucket) => labelsIn(scan, bucket, FILE).map((label) => [label.split("  ")[0] ?? label, bucket] as const)));
  const found = Object.fromEntries(FORMS.map((form) => [form, bucketOf.get(`${holder(form)}.m`) ?? null]));
  expect(found).toEqual(Object.fromEntries(FORMS.map((form) => [form, ROWS[form].bucket])));
});
