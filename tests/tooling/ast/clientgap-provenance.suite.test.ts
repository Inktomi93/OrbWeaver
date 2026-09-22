import { Project } from "ts-morph";
import { describe } from "vitest";
import { collectAppRouterOutputProvenance } from "../../../tooling/src/ast/lib/app-router-provenance.ts";
import { declKey } from "../../../tooling/src/ast/lib/keys.ts";
import { collectServerProcedures } from "../../../tooling/src/ast/ops/wiring.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const ROOT = "/repo";

function projectOf(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function exportedKey(project: Project, path: string, name: string): string {
  const declarations = project.getSourceFileOrThrow(`${ROOT}/${path}`).getExportedDeclarations().get(name);
  const declaration = declarations?.[0];
  if (declaration === undefined) {
    throw new Error(`missing exported fixture declaration ${path}::${name}`);
  }
  return declKey(declaration);
}

describe("clientgap AppRouter output provenance suite", () => {
  test("follows service returns, re-export barrels, Zod inferred aliases, nested constituents, and intersections", () => {
    const project = projectOf({
      "packages/contracts/src/probe/views.ts": `
export interface DirectView { direct: string }
export interface NestedItemView { nested: string }
export interface BaseView { base: string }
export interface ExtraView { extra: string }
export interface ComposedView { composed: string }
export interface UnrelatedServerOnlyView { unrelated: string }
export interface ServerOnlyView { secret: string }
export interface PresenceView { online: boolean; lastSeenAt: number }
export interface PresenceSnapshot { onlineUserIds: readonly string[] }
`,
      "packages/contracts/src/probe/zod.ts": `
declare namespace z { type infer<T> = T extends { _output: infer O } ? O : never }
export const zodViewSchema = null as unknown as { _output: { zed: string } };
export type ZodView = z.infer<typeof zodViewSchema>;
`,
      "packages/contracts/src/probe/index.ts": `
export { type DirectView as BarrelView, type NestedItemView, type BaseView, type ExtraView, type ComposedView, type UnrelatedServerOnlyView, type ServerOnlyView, type PresenceView, type PresenceSnapshot } from "./views";
export { type ZodView } from "./zod";
`,
      "packages/server/src/domain/probe/service.ts": `
import type { BarrelView, ServerOnlyView } from "../../../../contracts/src/probe/index";
export interface ProbeService { readDirect: () => Promise<BarrelView> }
export function readServerOnly(): ServerOnlyView { return { secret: "server" }; }
`,
      "packages/server/src/transport/trpc/router.ts": `
import type { BaseView, ExtraView, NestedItemView, ServerOnlyView, ZodView } from "../../../../contracts/src/probe/index";
import type { PresenceSnapshot, PresenceView } from "../../../../contracts/src/probe";
import type { ProbeService } from "../../domain/probe/service";
import { readServerOnly } from "../../domain/probe/service";
import type { ComposedView, UnrelatedServerOnlyView } from "../../../../contracts/src/probe";
type Procedure<Output> = { _def: { procedure: true; $types: { input: void; output: Output } } };
declare const t: { router<T>(record: T): T };
declare const p: { query<T>(callback: () => T): Procedure<T> };
declare const zod: ZodView;
declare const nested: { items: readonly NestedItemView[] };
declare const intersection: BaseView & ExtraView;
declare const services: { probe: ProbeService };
export async function composeResult(): Promise<readonly (ComposedView & { userId: string })[]> { return []; }
export async function unrelatedResult(): Promise<readonly (ComposedView & UnrelatedServerOnlyView & { userId: string })[]> { return []; }
interface ComposedService { read: () => ReturnType<typeof composeResult> }
declare const composedService: ComposedService;
function readDisclosure(registry: { read: () => PresenceView }): PresenceSnapshot { return registry.read().online ? { onlineUserIds: ["online"] } : { onlineUserIds: [] }; }
declare const registry: { read: () => PresenceView };
const probeRouter = t.router({
  service: p.query(() => services.probe.readDirect()),
  zod: p.query(() => zod),
  nested: p.query(() => nested),
  intersection: p.query(() => intersection),
  composed: p.query(() => composedService.read()),
  serverOnly: p.query(() => readServerOnly()),
  presence: p.query(() => readDisclosure(registry)),
});
export const appRouter = t.router({ probe: probeRouter });
export type AppRouter = {
  probe: {
    service: Procedure<Awaited<ReturnType<ProbeService["readDirect"]>>>;
    zod: Procedure<ZodView>;
    nested: Procedure<{ items: readonly NestedItemView[] }>;
    intersection: Procedure<BaseView & ExtraView>;
    composed: Procedure<readonly { composed: string; userId: string }[]>;
    serverOnly: Procedure<ReturnType<typeof readServerOnly> & ServerOnlyView>;
    presence: Procedure<PresenceSnapshot>;
  };
};
`,
    });

    const result = collectAppRouterOutputProvenance(
      project,
      new Set(["probe.service", "probe.zod", "probe.nested", "probe.intersection", "probe.composed", "probe.presence"]),
      collectServerProcedures(project),
    );
    expect(result?.unresolvedProcedures).toEqual([]);
    const expected = [
      ["packages/contracts/src/probe/views.ts", "DirectView"],
      ["packages/contracts/src/probe/views.ts", "NestedItemView"],
      ["packages/contracts/src/probe/views.ts", "BaseView"],
      ["packages/contracts/src/probe/views.ts", "ExtraView"],
      ["packages/contracts/src/probe/views.ts", "ComposedView"],
      ["packages/contracts/src/probe/zod.ts", "ZodView"],
    ] as const;
    expect(expected.filter(([path, name]) => result?.contractKeys.has(exportedKey(project, path, name)) !== true).map(([, name]) => name)).toEqual([]);
    expect(result?.contractKeys.has(exportedKey(project, "packages/contracts/src/probe/views.ts", "ServerOnlyView"))).toBe(false);
    expect(result?.contractKeys.has(exportedKey(project, "packages/contracts/src/probe/views.ts", "PresenceView"))).toBe(false);
    expect(result?.contractKeys.has(exportedKey(project, "packages/contracts/src/probe/views.ts", "UnrelatedServerOnlyView"))).toBe(false);
  });

  test("reports an unresolved consumed procedure instead of returning an empty provenance set", () => {
    const project = projectOf({
      "packages/server/src/transport/trpc/router.ts": `
type Procedure<Output> = { _def: { procedure: true; $types: { input: void; output: Output } } };
export type AppRouter = { probe: { live: Procedure<{ ok: true }> } };
`,
    });
    expect(collectAppRouterOutputProvenance(project, new Set(["probe.deleted"]))?.unresolvedProcedures).toEqual(["probe.deleted"]);
  });

  test("shares declaration-type provenance across a high-cardinality procedure surface", () => {
    const count = 300;
    const procedures = Array.from({ length: count }, (_, index) => `p${index}`);
    const project = projectOf({
      "packages/contracts/src/probe/views.ts": "export interface SharedView { shared: string }",
      "packages/server/src/transport/trpc/router.ts": `
import type { SharedView } from "../../../../contracts/src/probe/views";
type Procedure<Output> = { _def: { procedure: true; $types: { input: void; output: Output } } };
declare const t: { router<T>(record: T): T };
declare const p: { query<T>(callback: () => T): Procedure<T> };
interface SharedService { read: () => Promise<SharedView> }
declare const service: SharedService;
const probeRouter = t.router({ ${procedures.map((name) => `${name}: p.query(() => service.read())`).join(",")} });
export const appRouter = t.router({ probe: probeRouter });
export type AppRouter = { probe: { ${procedures.map((name) => `${name}: Procedure<SharedView>`).join(";")} } };
`,
    });
    const result = collectAppRouterOutputProvenance(project, new Set(procedures.map((name) => `probe.${name}`)), collectServerProcedures(project));
    expect(result?.unresolvedProcedures).toEqual([]);
    expect(result?.contractKeys).toEqual(new Set([exportedKey(project, "packages/contracts/src/probe/views.ts", "SharedView")]));
  });

  test("follows contextually typed service implementations to their composed contract constituent", () => {
    const project = projectOf({
      "packages/contracts/src/session/index.ts": "export interface SessionView { id: string; createdAt: number }",
      "packages/server/src/domain/admin.ts": `
export interface SessionAdminView { id: string; userId: string; createdAt: number }
export interface AdminContext { sessions: { listForUser: () => Promise<readonly SessionAdminView[]> } }
export interface AdminService { listSessions: () => Promise<readonly SessionAdminView[]> }
export function createSessions(ctx: AdminContext) {
  const listSessions: AdminService["listSessions"] = async () => ctx.sessions.listForUser();
  return { listSessions };
}
`,
      "packages/server/src/entry/compose.ts": `
import type { SessionView } from "../../../contracts/src/session/index";
import type { AdminContext } from "../domain/admin";
declare function createAdmin(context: AdminContext): void;
declare const sessions: { listForUser: () => Promise<readonly SessionView[]> };
createAdmin({ sessions: { listForUser: async (): Promise<readonly (SessionView & { userId: string })[]> =>
  (await sessions.listForUser()).map((view) => ({ ...view, userId: "user" })) } });
`,
      "packages/server/src/transport/trpc/router.ts": `
import type { AdminService, SessionAdminView } from "../../domain/admin";
type Procedure<Output> = { _def: { procedure: true; $types: { input: void; output: Output } } };
declare const t: { router<T>(record: T): T };
declare const p: { query<T>(callback: () => T): Procedure<T> };
declare const services: { admin: AdminService };
const adminRouter = t.router({ listSessions: p.query(() => services.admin.listSessions()) });
export const appRouter = t.router({ admin: adminRouter });
export type AppRouter = { admin: { listSessions: Procedure<readonly SessionAdminView[]> } };
`,
    });
    const result = collectAppRouterOutputProvenance(project, new Set(["admin.listSessions"]), collectServerProcedures(project));
    expect(result?.contractKeys.has(exportedKey(project, "packages/contracts/src/session/index.ts", "SessionView"))).toBe(true);
  });

  test("returns no provenance contract when AppRouter itself cannot be resolved", () => {
    expect(
      collectAppRouterOutputProvenance(
        projectOf({ "packages/contracts/src/probe/views.ts": "export interface LostView { lost: true }" }),
        new Set(["probe.lost"]),
      ),
    ).toBeUndefined();
  });
});
