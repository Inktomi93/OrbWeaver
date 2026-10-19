// Service verbs resolve to their implementing functions through every assembly spelling the domains use, and
// the coverage judge reads a verb as executed only when a shard counted a call of one of those functions.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { ResolvedServiceVerb } from "@orb/tooling/floor/testing/service-verbs";
import { readServiceVerbs } from "@orb/tooling/floor/testing/service-verbs";
import type { CoverageReport } from "@orb/tooling/floor/testing/verb-coverage";
import { judgeVerbCoverage } from "@orb/tooling/floor/testing/verb-coverage";
import { Node, Project } from "ts-morph";

const ROOT = "/repo";
const DOMAIN = `${ROOT}/packages/server/src/domain/hub`;
const SOURCES = {
  [`${DOMAIN}/contract/base.ts`]: "export interface HubBaseService {\n  inherited(): void;\n}\n",
  [`${DOMAIN}/contract/service.ts`]: [
    'import type { HubBaseService } from "./base.ts";',
    "export interface HubService extends HubBaseService {",
    "  inline(): void;",
    "  readonly viaFactory: () => void;",
    "  viaBundle(): void;",
    "  viaDestructure(): void;",
    "  viaSpread(): void;",
    "  viaMethod(): void;",
    "  viaImport(): void;",
    "  viaParameter(): void;",
    "  wrappedA(): Promise<void>;",
    "  wrappedB(): Promise<void>;",
    "  doubleWrapped(): Promise<void>;",
    "  aliasA(): void;",
    "  aliasB(): void;",
    "  readonly viaAlias: HubOp;",
    "  readonly mixed: (() => void) | string;",
    "  readonly label: string;",
    "}",
    "export type HubOp = (id: string) => void;",
    "export interface HubServiceDeps {",
    "  readonly external: () => void;",
    "}",
    "export interface OwnedHubService extends HubService, AsyncDisposable {}",
  ].join("\n"),
  [`${DOMAIN}/verbs/bundle.ts`]: [
    "export function createViaFactory(): () => void {",
    "  return () => undefined;",
    "}",
    "export function createBundle() {",
    "  const viaBundle = (): void => undefined;",
    "  return { viaBundle, viaDestructure: (): void => undefined };",
    "}",
    "export function createSpread() {",
    "  return { viaSpread: (): void => undefined, inherited: (): void => undefined };",
    "}",
    "export function viaImport(): void {}",
  ].join("\n"),
  [`${DOMAIN}/contract/portability.ts`]: "export interface HubPortabilityService {\n  exportAll(): void;\n}\n",
  [`${DOMAIN}/service.ts`]: [
    'import type { HubServiceDeps, OwnedHubService } from "./contract/service.ts";',
    'import type { HubPortabilityService } from "./contract/portability.ts";',
    'import { createBundle, createSpread, createViaFactory, viaImport } from "./verbs/bundle.ts";',
    "function wrap<R>(verb: () => Promise<R>): () => Promise<R> {",
    "  return async () => {",
    "    return await verb();",
    "  };",
    "}",
    "function pair<R>(left: () => Promise<R>, right: () => Promise<R>): () => Promise<R> {",
    "  return async () => {",
    "    await left();",
    "    return await right();",
    "  };",
    "}",
    "const shared = (): void => undefined;",
    "export function createHubPortability(): HubPortabilityService {",
    "  return { exportAll: () => undefined };",
    "}",
    "export function createHubService(deps: HubServiceDeps): OwnedHubService {",
    "  const bundle = createBundle();",
    "  const { viaDestructure } = createBundle();",
    "  return {",
    "    ...createSpread(),",
    "    inline: () => undefined,",
    "    viaFactory: createViaFactory(),",
    "    viaBundle: bundle.viaBundle,",
    "    viaDestructure,",
    "    viaMethod() {},",
    "    viaImport,",
    "    viaParameter: deps.external,",
    "    wrappedA: wrap(async () => undefined),",
    "    wrappedB: wrap(async () => undefined),",
    "    doubleWrapped: pair(async () => undefined, async () => undefined),",
    "    aliasA: shared,",
    "    aliasB: shared,",
    "    viaAlias: (_id) => undefined,",
    "    mixed: () => undefined,",
    '    label: "hub",',
    "    [Symbol.asyncDispose]: async () => undefined,",
    "  };",
    "}",
  ].join("\n"),
};

function census(): ReturnType<typeof readServiceVerbs> {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: 99, lib: ["lib.esnext.d.ts"] } });
  for (const [path, text] of Object.entries(SOURCES)) {
    project.createSourceFile(path, text);
  }
  return readServiceVerbs(project);
}

/** One report entry per resolved function, counted as called unless its verb is listed as unrun. V8 starts a
 *  remapped function at its body (the brace, or a concise body's first token), not at its first token. */
function report(verbs: readonly ResolvedServiceVerb[], unrun: ReadonlySet<string>): CoverageReport {
  const files: Record<string, { fnMap: CoverageReport[string]["fnMap"]; f: Record<string, number> }> = {};
  for (const verb of verbs) {
    for (const fn of verb.functions) {
      const source = fn.getSourceFile();
      const body = Node.isBodied(fn) || Node.isBodyable(fn) ? fn.getBody() : undefined;
      const start = source.getLineAndColumnAtPos((body ?? fn).getStart());
      const file = files[source.getFilePath()] ?? { fnMap: {}, f: {} };
      files[source.getFilePath()] = file;
      const id = String(Object.keys(file.fnMap).length);
      const loc = { start: { line: start.line, column: start.column - 1 }, end: { line: start.line, column: null } };
      file.fnMap[id] = { name: verb.verb, loc };
      file.f[id] = unrun.has(verb.verb) ? 0 : 1;
    }
  }
  return files;
}

test("every assembly spelling resolves to its own function; wrapped verbs resolve to their own bodies; undecidable verbs are unjudged", () => {
  const { resolved, unjudged } = census();
  const implementations = Object.fromEntries(
    resolved.map((verb) => [verb.verb, verb.functions.map((fn) => `${fn.getSourceFile().getBaseName()}:${String(fn.getStartLineNumber())}`)]),
  );
  expect(implementations).toEqual({
    inline: ["service.ts:24"],
    viaFactory: ["bundle.ts:2"],
    viaBundle: ["bundle.ts:5"],
    viaDestructure: ["bundle.ts:6"],
    viaSpread: ["bundle.ts:9"],
    inherited: ["bundle.ts:9"],
    viaMethod: ["service.ts:28"],
    viaImport: ["bundle.ts:11"],
    wrappedA: ["service.ts:31"],
    wrappedB: ["service.ts:32"],
    viaAlias: ["service.ts:36"],
    exportAll: ["service.ts:17"],
  });
  expect(resolved.find(({ verb }) => verb === "inherited")?.declaredIn).toBe("HubBaseService");
  expect(Object.fromEntries(unjudged.map(({ verb, reason }) => [verb, reason]))).toEqual({
    viaParameter: expect.stringContaining("parameter deps"),
    doubleWrapped: expect.stringContaining("takes several functions"),
    aliasA: expect.stringContaining("with aliasB"),
    aliasB: expect.stringContaining("with aliasA"),
    mixed: expect.stringContaining("neither callable nor data"),
  });
});

test("a verb no shard ran fails, a run verb passes, and a verb the reports cannot place is unreadable rather than run", () => {
  const { resolved } = census();
  const runAll = judgeVerbCoverage(census(), [report(resolved, new Set())], ROOT);
  expect(runAll.verdicts.every(({ kind }) => kind === "executed")).toBe(true);

  const planted = judgeVerbCoverage(census(), [report(resolved, new Set(["viaMethod"]))], ROOT);
  expect(planted.verdicts.filter(({ kind }) => kind !== "executed").map(({ verb, kind }) => [verb, kind])).toEqual([["viaMethod", "not-executed"]]);

  // Two shards: the verb one shard missed and another ran is executed.
  const split = judgeVerbCoverage(census(), [report(resolved, new Set(["viaMethod"])), report(resolved, new Set(["inline"]))], ROOT);
  expect(split.verdicts.every(({ kind }) => kind === "executed")).toBe(true);

  const withoutService = report(resolved, new Set());
  delete withoutService[`${DOMAIN}/service.ts`];
  expect(
    judgeVerbCoverage(census(), [withoutService], ROOT)
      .verdicts.filter(({ kind }) => kind === "uncollected")
      .map(({ verb }) => verb),
  ).toEqual(["exportAll", "inline", "viaMethod", "wrappedA", "wrappedB", "viaAlias"]);

  const shifted = report(resolved, new Set());
  for (const entry of Object.values(shifted[`${DOMAIN}/verbs/bundle.ts`]?.fnMap ?? {})) {
    entry.loc.start.line += 40;
  }
  expect(
    judgeVerbCoverage(census(), [shifted], ROOT)
      .verdicts.filter(({ kind }) => kind === "unmatched")
      .map(({ verb }) => verb)
      .toSorted(),
  ).toEqual(["inherited", "viaBundle", "viaDestructure", "viaFactory", "viaImport", "viaSpread"]);
});
