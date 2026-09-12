// Canonical module, callable, and ambient-global facts retain both proof and loud refusal controls.
import type { CallExpression, Node as MorphNode, NewExpression, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ReferenceFact, ResolvedReferenceFact } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import { resolveGlobalMemberOrigin, resolveModuleMemberOrigin, resolveStableExpression } from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { resolveCallableOrigin } from "../../../../tooling/src/verify/lib/reference-fact-call.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// TWO FIXTURE LINES HOISTED OUT OF THEIR TEMPLATES (#1975, 2026-09-11) — the fixture TEXT is unchanged;
// only its markability is. `test-determinism` is a syntax LINE SCANNER whose per-site waiver binds to the
// line IMMEDIATELY ABOVE the finding (verify/lib/gate-ignore.ts `findGateIgnoreAtLine`), and a finding
// inside a multi-line template literal has no such line: every candidate is itself inside the literal
// span, which the marker's mention fence correctly refuses. So a violation there is UNWAIVABLE where it
// stands — a structural hole in every line-adjacent escape grammar, not a property of these two sites.
// Interpolating the one flagged line gives the waiver a markable statement. The calls are spelled on
// purpose: this suite's subject is that a WRITE to an ambient member poisons the origin of the read.
// @orb-waive test-determinism(Math.random): FIXTURE SOURCE parsed by ts-morph to prove the origin reader, never evaluated.
const AMBIENT_RANDOM_READ = "export const result = Math.random();";
// @orb-waive test-determinism(Date.now): FIXTURE SOURCE parsed by ts-morph to prove the origin reader, never evaluated.
const AMBIENT_CLOCK_READ = "export const result = Date.now();";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(
    "/node_modules/typescript/lib/lib.es5.d.ts",
    `
      interface Date {}
      interface DateConstructor { new(): Date; now(): number }
      declare var Date: DateConstructor;
      interface Math { random(): number }
      declare var Math: Math;
      interface Map<K, V> {}
      interface MapConstructor { new<K, V>(): Map<K, V> }
      declare var Map: MapConstructor;
      declare function fetch(input: string): Promise<object>;
      declare var globalThis: { fetch: typeof fetch };
    `,
    { overwrite: true },
  );
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`/repo/${path}`, source);
  }
  return project;
}

function sourceOf(code: string): SourceFile {
  return projectOf({ "use.ts": code }).getSourceFileOrThrow("/repo/use.ts");
}

function expectResolved<T>(fact: ReferenceFact<T>): ResolvedReferenceFact<T> {
  if (fact.kind === "unresolved") {
    throw new Error(fact.detail);
  }
  expect(fact.kind).toBe("resolved");
  return fact;
}

test("module facts retain the authored door and expose the canonical leaf export", () => {
  const project = projectOf({
    "api.ts": "export const record = () => 1;",
    "barrel.ts": 'export { record as register } from "./api.ts";',
    "use.ts": 'import * as registry from "./barrel.ts";\nexport const result = registry["register"]();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const fact = expectResolved(resolveModuleMemberOrigin(call.getExpression()));

  expect(fact.value).toMatchObject({
    moduleSpecifier: "./barrel.ts",
    exportedName: "register",
    memberPath: [],
    canonical: { kind: "project", exportedName: "record" },
  });
  expect(fact.value.canonical.declaration.getSourceFile().getBaseName()).toBe("api.ts");
});

test("local export aliases retain the declaring module's public export name", () => {
  const project = projectOf({
    "api.ts": "const implementation = () => 1; export { implementation as record };",
    "use.ts": 'import { record } from "./api.ts"; export const result = record();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const fact = expectResolved(resolveCallableOrigin(call));

  expect(fact.value.target).toMatchObject({
    kind: "module",
    moduleSpecifier: "./api.ts",
    exportedName: "record",
    canonical: { kind: "project", exportedName: "record" },
  });
  const declaration = fact.value.target.kind === "module" ? fact.value.target.canonical.declaration : undefined;
  expect(declaration?.getText()).toContain("implementation");
});

test("barrels refuse a public alias name that the canonical leaf does not export", () => {
  const project = projectOf({
    "leaf.ts": "export const record = () => 1;",
    "barrel.ts": 'import { record as internal } from "./leaf.ts"; export { internal as public };',
    "use.ts": 'import { public as invoke } from "./barrel.ts"; export const result = invoke();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(call)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("barrels refuse wrapped local aliases of imported bindings", () => {
  const project = projectOf({
    "leaf.ts": "export const record = () => 1;",
    "barrel.ts":
      'import { record as internal } from "./leaf.ts"; const alias = ((internal as typeof internal) satisfies typeof internal); export { alias as public };',
    "use.ts": 'import { public as invoke } from "./barrel.ts"; export const result = invoke();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(call)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("external package doors are explicit syntax-only origins while missing relative doors refuse", () => {
  const sf = sourceOf(`
    import { thing } from "external-package";
    import { absent } from "./missing.ts";
    import * as external from "external-package";
    import * as missingRelative from "./missing-namespace.ts";
    import * as missingInternal from "#missing-namespace";
    export const values = [thing, absent, external.thing, missingRelative.thing, missingInternal.thing];
  `);
  const values = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(resolveModuleMemberOrigin(values[0] as MorphNode)).toMatchObject({
    kind: "resolved",
    value: {
      moduleSpecifier: "external-package",
      exportedName: "thing",
      canonical: { kind: "external-door", moduleSpecifier: "external-package", exportedName: "thing" },
    },
  });
  expect(resolveModuleMemberOrigin(values[1] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveModuleMemberOrigin(values[2] as MorphNode)).toMatchObject({
    kind: "resolved",
    value: { kind: "module", moduleSpecifier: "external-package", exportedName: "thing", canonical: { kind: "external-door" } },
  });
  expect(resolveModuleMemberOrigin(values[3] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveModuleMemberOrigin(values[4] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("terminal re-export doors require local sources but retain bare external package syntax", () => {
  const project = projectOf({
    "relative.ts": 'export { thing as relativeThing } from "./missing.ts";',
    "internal.ts": 'export { thing as internalThing } from "#missing";',
    "external.ts": 'export { thing as externalThing } from "external-package";',
    "use.ts": `
      import { relativeThing } from "./relative.ts";
      import { internalThing } from "./internal.ts";
      import { externalThing } from "./external.ts";
      export const values = [relativeThing, internalThing, externalThing];
    `,
  });
  const values = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(resolveModuleMemberOrigin(values[0] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveModuleMemberOrigin(values[1] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveModuleMemberOrigin(values[2] as MorphNode)).toMatchObject({
    kind: "resolved",
    value: { canonical: { kind: "external-door", moduleSpecifier: "external-package", exportedName: "thing" } },
  });
});

test("default imports resolve directly while call/apply/bind wrappers refuse without Function identity proof", () => {
  const project = projectOf({
    "api.ts": "export default function invoke() { return 1; }",
    "use.ts": 'import run from "./api.ts";\nexport const values = [run(), run.call(undefined), run.apply(undefined, []), run.bind(undefined)];',
  });
  const calls = project.getSourceFileOrThrow("/repo/use.ts").getDescendantsOfKind(SyntaxKind.CallExpression);
  expect(expectResolved(resolveCallableOrigin(calls[0] as CallExpression)).value.target).toMatchObject({
    moduleSpecifier: "./api.ts",
    exportedName: "default",
    canonical: { exportedName: "default" },
  });
  expect(resolveCallableOrigin(calls[1] as CallExpression)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(resolveCallableOrigin(calls[2] as CallExpression)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(resolveCallableOrigin(calls[3] as CallExpression)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("default imported objects retain default as the canonical export and members as a path", () => {
  const project = projectOf({
    "api.ts": "const api = { forwardRef() {} }; export default api;",
    "use.ts": 'import React from "./api.ts";\nexport const result = React.forwardRef();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(call)).toMatchObject({
    kind: "resolved",
    value: {
      target: {
        moduleSpecifier: "./api.ts",
        exportedName: "default",
        memberPath: ["forwardRef"],
        canonical: { kind: "project", exportedName: "default" },
      },
    },
  });
});

test("a local exported alias refuses instead of claiming the alias declaration is the leaf origin", () => {
  const project = projectOf({
    "api.ts": "export const record = () => 1;",
    "barrel.ts": 'import { record } from "./api.ts"; export const alias = record;',
    "use.ts": 'import { alias } from "./barrel.ts"; export const result = alias();',
  });
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(call)).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("destructuring defaults and writes through imported objects refuse their unstable origin", () => {
  const sf = sourceOf(`
    import * as api from "external-package";
    const { run = fallback } = api;
    const alias = api;
    const captured = api.run;
    alias.run = fallback;
    export const values = [run, api.run, captured];
  `);
  const values = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(resolveModuleMemberOrigin(values[0] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "dynamic" });
  expect(resolveModuleMemberOrigin(values[1] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveModuleMemberOrigin(values[2] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("writes through destructured imported-object aliases poison the original module path", () => {
  const project = projectOf({
    "api.ts": "export const config = { nested: { run() {} } };",
    "use.ts": `
      import { config } from "./api.ts";
      declare const other: () => void;
      const { nested } = (config as typeof config);
      nested.run = other;
      export const result = config.nested.run;
    `,
  });
  const initializer = project.getSourceFileOrThrow("/repo/use.ts").getVariableDeclarationOrThrow("result").getInitializerOrThrow();

  expect(resolveModuleMemberOrigin(initializer)).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("mutable reverse aliases poison originals only when the alias is written", () => {
  const files = { "api.ts": "export const config = { nested: { run() {} } };" };
  const clean = projectOf({
    ...files,
    "use.ts": 'import { config } from "./api.ts"; let alias = config; export const result = config.nested.run;',
  });
  const memberWrite = projectOf({
    ...files,
    "use.ts": `
      import { config } from "./api.ts";
      declare const other: () => void;
      let alias = config;
      alias.nested.run = other;
      export const result = config.nested.run;
    `,
  });
  const reassigned = projectOf({
    ...files,
    "use.ts": `
      import { config } from "./api.ts";
      declare const replacement: typeof config;
      let alias = config;
      alias = replacement;
      alias.nested.run = () => undefined;
      export const result = config.nested.run;
    `,
  });
  const result = (project: Project): MorphNode => project.getSourceFileOrThrow("/repo/use.ts").getVariableDeclarationOrThrow("result").getInitializerOrThrow();

  expect(resolveModuleMemberOrigin(result(clean))).toMatchObject({ kind: "resolved" });
  expect(resolveModuleMemberOrigin(result(memberWrite))).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveModuleMemberOrigin(result(reassigned))).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("assignment-established aliases propagate member writes without poisoning a plain rebinding", () => {
  const files = { "api.ts": "export const config = { nested: { run() {} } };" };
  const clean = projectOf({
    ...files,
    "use.ts": `
      import { config } from "./api.ts";
      let alias;
      alias = config;
      export const result = config.nested.run;
    `,
  });
  const written = projectOf({
    ...files,
    "use.ts": `
      import { config } from "./api.ts";
      declare const other: () => void;
      let alias;
      alias = config;
      alias.nested.run = other;
      export const result = config.nested.run;
    `,
  });
  const result = (project: Project): MorphNode => project.getSourceFileOrThrow("/repo/use.ts").getVariableDeclarationOrThrow("result").getInitializerOrThrow();

  expect(resolveModuleMemberOrigin(result(clean))).toMatchObject({ kind: "resolved" });
  expect(resolveModuleMemberOrigin(result(written))).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("destructuring assignment aliases propagate member writes without poisoning a clean assignment", () => {
  const files = { "api.ts": "export const config = { nested: { run() {} } };" };
  const clean = projectOf({
    ...files,
    "use.ts": 'import { config } from "./api.ts"; let nested; ({ nested } = config); export const result = config.nested.run;',
  });
  const written = projectOf({
    ...files,
    "use.ts": `
      import { config } from "./api.ts";
      declare const other: () => void;
      let nested;
      ({ nested } = config);
      nested.run = other;
      export const result = config.nested.run;
    `,
  });
  const result = (project: Project): MorphNode => project.getSourceFileOrThrow("/repo/use.ts").getVariableDeclarationOrThrow("result").getInitializerOrThrow();

  expect(resolveModuleMemberOrigin(result(clean))).toMatchObject({ kind: "resolved" });
  expect(resolveModuleMemberOrigin(result(written))).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("ambient globals resolve through aliases, computed members, destructuring, and constructors", () => {
  const sf = sourceOf(`
    const clock = Date;
    const KEY = "random";
    const { random: randomFn } = Math;
    export const values = [clock.now(), Math[KEY](), randomFn(), new Map()];
  `);
  const calls = sf.getDescendants().filter((node): node is CallExpression | NewExpression => Node.isCallExpression(node) || Node.isNewExpression(node));
  const facts = calls.map((call) => expectResolved(resolveCallableOrigin(call)));

  expect(facts.map((fact) => fact.value)).toEqual([
    expect.objectContaining({ invocation: "call", target: expect.objectContaining({ kind: "global", globalName: "Date", memberPath: ["now"] }) }),
    expect.objectContaining({ invocation: "call", target: expect.objectContaining({ kind: "global", globalName: "Math", memberPath: ["random"] }) }),
    expect.objectContaining({ invocation: "call", target: expect.objectContaining({ kind: "global", globalName: "Math", memberPath: ["random"] }) }),
    expect.objectContaining({ invocation: "construct", target: expect.objectContaining({ kind: "global", globalName: "Map", memberPath: [] }) }),
  ]);
});

test("ambient member writes poison direct and captured global origins", () => {
  const direct = sourceOf(`
    declare const replacement: () => number;
    Math.random = replacement;
    ${AMBIENT_RANDOM_READ}
  `).getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const capturedSource = sourceOf(`
    declare const replacement: () => number;
    const random = Math.random;
    Math.random = replacement;
    export const result = random();
  `);
  const captured = capturedSource.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  const reverseSource = sourceOf(`
    declare const replacement: () => number;
    const clock = Date;
    clock.now = replacement;
    ${AMBIENT_CLOCK_READ}
  `);
  const reverse = reverseSource.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(direct)).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveCallableOrigin(captured)).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveCallableOrigin(reverse)).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("globalThis carrier writes poison carrier and bare global spellings", () => {
  const sf = sourceOf(`
    globalThis.Date.now = () => 0;
    export const carrier = globalThis.Date.now;
    export const bare = Date.now;
  `);

  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("carrier").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("bare").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "write" });

  const reverse = sourceOf(`
    Date.now = () => 0;
    export const carrier = globalThis.Date.now;
    export const computed = globalThis["Date"].now;
  `);
  expect(resolveGlobalMemberOrigin(reverse.getVariableDeclarationOrThrow("carrier").getInitializerOrThrow())).toMatchObject({
    kind: "unresolved",
    reason: "write",
  });
  expect(resolveGlobalMemberOrigin(reverse.getVariableDeclarationOrThrow("computed").getInitializerOrThrow())).toMatchObject({
    kind: "unresolved",
    reason: "write",
  });
});

test("a nonexistent destructured global member refuses instead of trusting the local binding", () => {
  const sf = sourceOf("const { missing } = Math; export const result = missing;");

  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("result").getInitializerOrThrow())).toMatchObject({
    kind: "unresolved",
    reason: "missing",
  });
});

test("globalThis carriers normalize to the ambient member while local shadows remain unresolved", () => {
  const sf = sourceOf(`
    export const ambient = globalThis.fetch;
    export function shadow(fetch: () => void, Math: object) { return [fetch, Math["random"]]; }
  `);
  const globalRead = sf.getVariableDeclarationOrThrow("ambient").getInitializerOrThrow();
  const returned = sf.getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();

  expect(resolveGlobalMemberOrigin(globalRead)).toMatchObject({
    kind: "resolved",
    value: { kind: "global", globalName: "fetch", memberPath: [] },
  });
  expect(resolveGlobalMemberOrigin(returned[0] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(resolveGlobalMemberOrigin(returned[1] as MorphNode)).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("project-authored ambient declarations do not become trusted global origins", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  project.createSourceFile("/repo/fake.d.ts", "declare const OrbFakeGlobal: { run(): number };");
  project.createSourceFile("/repo/use.ts", "export const value = OrbFakeGlobal.run();");
  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);

  expect(resolveCallableOrigin(call)).toMatchObject({ kind: "unresolved", reason: "missing" });
});

// #2037: `isAmbientGlobalDeclaration` is `trusted && isDeclFile && (scriptGlobal || isGlobalAugmentation)`,
// and `||` SHORT-CIRCUITS. Every fixture the gate corpus plants — `_proof/node-types.ts`'s `process` subject,
// both lookalikes — AND the installed `@types/node/process.d.ts` itself have ZERO top-level import/export
// declarations (the package's imports sit inside `declare module`), so `scriptGlobal` is true for all of them
// and the AUGMENTATION branch is never evaluated by any proof row. The plant header and guide §4.8b both
// claimed the corpus exercised both branches; it did not, and a branch nothing reaches is a branch that can
// rot silently. This is the only shape that can be admitted by the second branch alone.
test("a trusted declaration file with a TOP-LEVEL import reaches the global-augmentation branch alone", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  project.createSourceFile("/node_modules/@types/augmented/marker.d.ts", "export interface Marker {\n  readonly id: string;\n}\n");
  const plant = project.createSourceFile(
    "/node_modules/@types/augmented/index.d.ts",
    'import type { Marker } from "./marker.js";\ndeclare global {\n  var augmented: { readonly marker: Marker; run(): number };\n}\nexport {};\n',
  );
  project.createSourceFile("/repo/use.ts", "export const value = augmented.run();");

  // THE MECHANISM, asserted rather than assumed: a top-level import makes this file a MODULE, so the
  // script-global branch cannot be what admits it.
  expect(plant.getImportDeclarations()).toHaveLength(1);
  expect(plant.isDeclarationFile()).toBe(true);

  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  expect(resolveCallableOrigin(call)).toMatchObject({
    kind: "resolved",
    value: expect.objectContaining({ target: expect.objectContaining({ kind: "global", globalName: "augmented", memberPath: ["run"] }) }),
  });
});

// The control isolates the TRUST fence, so its global is `const`: a project-authored `var` global refuses
// first as a mutable-write hazard, which would pass this test for the wrong reason.
test("the augmentation branch does not widen TRUST — the same shape outside @types still refuses", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  project.createSourceFile("/repo/marker.d.ts", "export interface Marker {\n  readonly id: string;\n}\n");
  project.createSourceFile(
    "/repo/augmented.d.ts",
    'import type { Marker } from "./marker.js";\ndeclare global {\n  const augmented: { readonly marker: Marker; run(): number };\n}\nexport {};\n',
  );
  project.createSourceFile("/repo/use.ts", "export const value = augmented.run();");

  const call = project.getSourceFileOrThrow("/repo/use.ts").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
  expect(resolveCallableOrigin(call)).toMatchObject({ kind: "unresolved", reason: "missing" });
});

test("standard DOM declarations normalize window and self carriers beside lexical shadows", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/dom.ts",
    "export const values = [window.matchMedia, self.fetch]; export function shadow(window: Window, self: Window) { return [window.matchMedia, self.fetch]; } ({ Date } = globalThis); export const rebound = Date;",
  );
  const arrays = source.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression);
  const ambient = arrays[0]?.getElements().map(resolveGlobalMemberOrigin);
  const shadows = arrays[1]?.getElements().map(resolveGlobalMemberOrigin);

  expect(project.getPreEmitDiagnostics()).toHaveLength(0);
  expect(ambient).toEqual([
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ globalName: "matchMedia", memberPath: [] }) }),
    expect.objectContaining({ kind: "resolved", value: expect.objectContaining({ globalName: "fetch", memberPath: [] }) }),
  ]);
  expect(shadows).toEqual([
    expect.objectContaining({ kind: "unresolved", reason: "missing" }),
    expect.objectContaining({ kind: "unresolved", reason: "missing" }),
  ]);
  expect(resolveGlobalMemberOrigin(source.getVariableDeclarationOrThrow("rebound").getInitializerOrThrow())).toMatchObject({
    kind: "unresolved",
    reason: "write",
  });
});

test("global aliases refuse writes, cycles, dynamic keys, and non-call inputs loudly", () => {
  const dynamicKey = ["$", "{", "key", "}"].join("");
  const code = `
    const clock = Date;
    clock.now = () => 0;
    const left = right;
    const right = left;
    export const written = clock.now;
    export const cycled = left;
    export const dynamic = Math[`;
  const sf = sourceOf(`${code}\`${dynamicKey}\`];`);

  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("written").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("cycled").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "cycle" });
  expect(resolveGlobalMemberOrigin(sf.getVariableDeclarationOrThrow("dynamic").getInitializerOrThrow())).toMatchObject({
    kind: "unresolved",
    reason: "dynamic",
  });
  expect(resolveCallableOrigin(sf.getVariableDeclarationOrThrow("written"))).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(resolveStableExpression(sf.getVariableDeclarationOrThrow("written").getInitializerOrThrow())).toMatchObject({ kind: "unresolved", reason: "dynamic" });
});
