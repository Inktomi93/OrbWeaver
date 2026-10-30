// The census plans each restating member against its owner: never a target a typecheck would refuse (a wider owner,
// a renamed member, an optional owner raw, a cycle, a missing door), and a named kind for each shape a leg handles first.
import { expect, test } from "@orb/testkit/tooling";
import type { PortTarget } from "../../../tooling/src/unwired/index.ts";
import { portCensus } from "../../../tooling/src/unwired/index.ts";

const COMPILER = {
  strict: true,
  target: "ESNext",
  lib: ["ESNext", "DOM"],
  module: "ESNext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
};
const SERVER = "packages/server/src";

const TREE = {
  "packages/server/tsconfig.json": JSON.stringify({
    compilerOptions: {
      ...COMPILER,
      paths: { "#*": ["./src/*/index.ts"], "@orb/inference": ["../inference/src/index.ts"], "@orb/contracts/preset": ["../contracts/src/preset/index.ts"] },
    },
    include: ["src"],
  }),
  "packages/inference/package.json": JSON.stringify({ name: "@orb/inference", exports: { ".": "./src/index.ts" } }),
  "packages/inference/tsconfig.json": JSON.stringify({ compilerOptions: COMPILER, include: ["src"] }),
  "packages/inference/src/index.ts":
    'export type { ProviderExecutor } from "./contract/backend.ts";\nexport type { SideGenSampling } from "./contract/side-gen.ts";',
  "packages/inference/src/contract/backend.ts": "export interface ProviderExecutor {\n  run: (prompt: string) => Promise<string>;\n}",
  "packages/inference/src/contract/side-gen.ts":
    'import type { RolePresetParams } from "../../../contracts/src/preset/index.ts";\nexport type SideGenSampling = RolePresetParams;',
  "packages/contracts/src/preset/index.ts": "export interface RolePresetParams { readonly temperature: number; }",
  [`${SERVER}/transport/rate-limit.ts`]: "export interface RateLimitConfig {\n  readonly points: number | (() => number);\n}",
  [`${SERVER}/transport/index.ts`]: 'export type { RateLimitConfig } from "./rate-limit.ts";',
  [`${SERVER}/domain/sessions/contract/service.ts`]: [
    "export interface SessionsService {",
    "  lookup: (id: string) => Promise<string>;",
    "  revokeAll: (id: string) => Promise<number>;",
    "  onAddCondition: (id: string) => void;",
    "  onRemoveCondition: (id: string) => void;",
    "  pick?: (id: string) => string;",
    "}",
    "export interface Mutation<T> {",
    "  mutate: (input: T) => void;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/sessions/index.ts`]: [
    'export type { Mutation, SessionsService } from "./contract/service.ts";',
    'export declare const sessions: import("./contract/service.ts").SessionsService;',
    'export declare const mutation: import("./contract/service.ts").Mutation<string>;',
  ].join("\n"),
  [`${SERVER}/domain/preset/contract/side-gen-params.ts`]:
    'import type { SideGenSampling } from "@orb/inference";\nexport type ResolveUtilityPresetParams = (userId: string) => Promise<SideGenSampling | undefined>;',
  [`${SERVER}/domain/preset/index.ts`]: "export {};",
  [`${SERVER}/domain/preset/verbs/side-gen.ts`]:
    'import type { SideGenSampling } from "@orb/inference";\nexport interface SideGenDeps {\n  readonly resolveParams: (userId: string) => Promise<SideGenSampling | undefined>;\n}',
  [`${SERVER}/domain/refinery/contract/service.ts`]:
    'import type { SideGenSampling } from "@orb/inference";\nexport interface RefineryContext {\n  readonly resolveUtilityPresetParams: (userId: string) => Promise<SideGenSampling | undefined>;\n}',
  [`${SERVER}/entry/http/routes.ts`]: [
    'import { mutation, sessions } from "#domain/sessions";',
    'import type { RateLimitConfig } from "#transport";',
    'import type { ProviderExecutor } from "@orb/inference";',
    "export interface RoutePort {",
    "  readonly lookup: (id: string) => Promise<string | null>;",
    "  readonly revokeAll: (id: string) => Promise<number>;",
    "  readonly pick: (id: string) => string;",
    "  readonly change: (input: string) => void;",
    "  readonly resolveLoginLimit: () => number;",
    "  readonly run: (prompt: string) => Promise<string>;",
    "}",
    "export interface Tracker {",
    "  readonly onAdd: (id: string) => void;",
    "  readonly onRemove: (id: string) => void;",
    "}",
    "export declare const executor: ProviderExecutor;",
    "export declare const port: RoutePort;",
    "export const limit: RateLimitConfig = { points: () => port.resolveLoginLimit() };",
    "export const built: RoutePort = {",
    "  lookup: sessions.lookup,",
    "  revokeAll: async (id) => {",
    "    const revoked = await sessions.revokeAll(id);",
    "    return revoked;",
    "  },",
    "  pick: (id) => sessions.pick?.(id) ?? id,",
    "  change: mutation.mutate,",
    "  resolveLoginLimit: () => 3,",
    "  run: executor.run,",
    "};",
    'export const back: Pick<import("#domain/sessions").SessionsService, "pick"> = { pick: port.pick };',
    "export const tracker: Tracker = { onAdd: sessions.onAddCondition, onRemove: sessions.onRemoveCondition };",
  ].join("\n"),
  [`${SERVER}/entry/http/index.ts`]: 'export type { RoutePort } from "./routes.ts";',
  [`${SERVER}/entry/app.ts`]:
    'import type { RoutePort } from "#entry/http";\nexport interface AppDeps {\n  readonly isShuttingDown: () => boolean;\n  readonly routes: RoutePort;\n}',
  [`${SERVER}/entry/http/healthz.ts`]: [
    'import type { AppDeps } from "../app.ts";',
    "export interface HealthzDeps {",
    "  readonly isShuttingDown: () => boolean;",
    "}",
    "export declare const app: AppDeps;",
    "export const healthz: HealthzDeps = app;",
  ].join("\n"),
};

const ROUTES = `${SERVER}/entry/http/routes.ts`;

function plan(targets: readonly PortTarget[], file: string, member: string): readonly Pick<PortTarget, "kind" | "type">[] {
  return targets.filter((target) => target.file === file && target.members.includes(member)).map(({ kind, type }) => ({ kind, type }));
}

test("the census plans every restating member against a real owner", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  // A member only passed into a wider slot is its own op.
  expect(plan(targets, ROUTES, "resolveLoginLimit")).toEqual([]);
  // Only the return narrows: the parameters derive.
  expect(plan(targets, ROUTES, "lookup")).toEqual([
    { kind: "derive-params", type: '(...args: Parameters<SessionsService["lookup"]>) => Promise<string | null>' },
  ]);
  // An adapter that wraps one call of its own name still restates that member.
  expect(plan(targets, ROUTES, "revokeAll")).toEqual([{ kind: "derive", type: 'SessionsService["revokeAll"]' }]);
  // A renamed owner member derives by the owner's name and never collapses into a Pick of the port's names.
  expect(plan(targets, ROUTES, "onAdd")).toEqual([{ kind: "derive", type: 'SessionsService["onAddCondition"]' }]);
  // An optional owner member derives through NonNullable where the port's member is required.
  expect(plan(targets, ROUTES, "pick")).toEqual([{ kind: "derive", type: 'NonNullable<SessionsService["pick"]>' }]);
  // A generic owner has no shape to derive from until its type is named.
  expect(plan(targets, ROUTES, "change")).toEqual([{ kind: "name-owner-type", type: null }]);
  // The package's root door counts.
  expect(targets.filter((target) => target.file === ROUTES && target.members.includes("run")).map(({ imports }) => imports)).toEqual([
    [{ name: "ProviderExecutor", from: "@orb/inference" }],
  ]);
  // A derive through a door that would close a cycle moves the shape down instead.
  expect(plan(targets, `${SERVER}/entry/http/healthz.ts`, "isShuttingDown")).toEqual([{ kind: "move-down", type: null }]);
});

test("a forgotten door export with a same-shape copy, and a synonym alias seen through", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const forgotten = targets.filter((target) => target.form === "type").map(({ kind, file, members }) => ({ kind, file, members }));
  // The copy in refinery is another domain, so the shape moves to contracts; the alias chain reaches contracts, so it is not a split.
  expect(forgotten).toEqual([
    { kind: "move-to-contracts", file: `${SERVER}/domain/preset/contract/side-gen-params.ts`, members: ["ResolveUtilityPresetParams"] },
  ]);
});
