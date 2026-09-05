// spelling-twins.ts (#1506) — the respeller behind the authoring control. Its two failure directions are
// opposite and both matter: a twin that does NOT respell what the gate reported makes the control vacuous
// (a green that means "I could not measure"), and a twin that respells something it must not — a JSX tag,
// a shorthand property — feeds the gate a DIFFERENT program and manufactures a false blind verdict.
// So every case here asserts the produced SOURCE, not just that something changed.
import { bracketTwinOnLines, namespaceTwinOnLines, spellingTwinsOf } from "../../../../tooling/src/verify/lib/spelling-twins.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ALL = new Set([1, 2, 3, 4, 5]);

test("the bracket twin respells every member read on a focused line, including an optional chain", () => {
  expect(bracketTwinOnLines("export const a = db.insert(schema.chatDigests);\n", ALL)).toBe('export const a = db["insert"](schema["chatDigests"]);\n');
  expect(bracketTwinOnLines("export const a = db?.insert;\n", ALL)).toBe('export const a = db?.["insert"];\n');
});

test("the bracket twin touches ONLY the focused lines — the focus is what keeps the control honest", () => {
  const source = "export const a = one.two;\nexport const b = three.four;\n";
  expect(bracketTwinOnLines(source, new Set([2]))).toBe('export const a = one.two;\nexport const b = three["four"];\n');
});

test("the bracket twin REFUSES a fixture with nothing to respell, rather than returning it unchanged", () => {
  // undefined is the refusal the caller counts; returning the source would read as "twin passed".
  expect(bracketTwinOnLines('export const a = "plain";\n', ALL)).toBeUndefined();
});

test("the bracket twin leaves a JSX tag name alone — `<Foo.Bar />` cannot take bracket syntax at all", () => {
  expect(bracketTwinOnLines("export const G = <Foo.Bar prop={x.y} />;\n", ALL, ".tsx")).toBe('export const G = <Foo.Bar prop={x["y"]} />;\n');
});

test("the namespace twin converts a named import and rewrites its references, alias included", () => {
  expect(namespaceTwinOnLines('import { users as u } from "@orb/db";\nexport const a = u;\n', new Set([1, 2]))).toBe(
    'import * as __twin0 from "@orb/db";\nexport const a = __twin0.users;\n',
  );
});

test("the namespace twin REFUSES a shorthand property reference — the rewrite would change what it means", () => {
  // `{ users }` becomes `{ __twin0.users }`, which is not a program. A refusal, never a broken twin.
  expect(namespaceTwinOnLines('import { users } from "@orb/db";\nexport const a = { users };\n', new Set([1, 2]))).toBeUndefined();
});

test("the namespace twin refuses a TYPE-ONLY import — there is no runtime namespace member to read", () => {
  expect(namespaceTwinOnLines('import type { User } from "@orb/db";\nexport const a: User = x;\n', new Set([1, 2]))).toBeUndefined();
});

test("spellingTwinsOf reports each arm independently, and refuses the arm a fixture has nothing for", () => {
  const files = { "packages/server/src/domain/x/x.ts": 'import { users } from "@orb/db";\nexport const a = users.id;\n' };
  const reported = new Map([["packages/server/src/domain/x/x.ts", new Set([2])]]);
  const twins = spellingTwinsOf(files, reported);
  expect(twins.bracket).toEqual({ "packages/server/src/domain/x/x.ts": 'import { users } from "@orb/db";\nexport const a = users["id"];\n' });
  expect(twins.namespace).toEqual({
    "packages/server/src/domain/x/x.ts": 'import * as __twin0 from "@orb/db";\nexport const a = __twin0.users.id;\n',
  });

  // A file whose reported line carries neither shape yields BOTH arms undefined — the caller must not read
  // that as "the gate is fine".
  const inert = { "packages/server/src/domain/x/y.ts": 'export const a = "plain";\n' };
  const inertTwins = spellingTwinsOf(inert, new Map([["packages/server/src/domain/x/y.ts", new Set([1])]]));
  expect([inertTwins.bracket, inertTwins.namespace]).toEqual([undefined, undefined]);
});
