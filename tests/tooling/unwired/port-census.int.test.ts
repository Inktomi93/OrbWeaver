// `pnpm unwired ports` plans each restating member: derive through the owner's door, a kit type for a concept,
// a contracts move across domains, a hand note where a derive would close an import cycle.
import { expect, test } from "@orb/testkit/tooling";
import type { PortTarget } from "../../../tooling/src/unwired/index.ts";
import { portCensus } from "../../../tooling/src/unwired/index.ts";

const SERVER = "packages/server/src";

const TREE = {
  "packages/server/tsconfig.json": JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ESNext",
      lib: ["ESNext", "DOM"],
      module: "ESNext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      noEmit: true,
      types: [],
      paths: { "#*": ["./src/*/index.ts"] },
    },
    include: ["src"],
  }),
  [`${SERVER}/domain/sessions/contract/service.ts`]: [
    "export interface SessionsService {",
    "  revoke: (token: string) => Promise<void>;",
    "  lookup: (id: string) => Promise<string | null>;",
    "  drop: (input: DropInput, signal: AbortSignal) => Promise<void>;",
    "  statement: (id: string) => StatementToken;",
    "}",
    "export interface DropInput { readonly token: string; }",
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export interface SessionsContext {",
    "  now: () => number;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/sessions/index.ts`]:
    'export type { DropInput, SessionsService } from "./contract/service.ts";\nexport declare const sessions: import("./contract/service.ts").SessionsService;',
  "packages/db/src/wiring.ts": "export interface StatementToken { readonly sql: string; }",
  [`${SERVER}/domain/admin/contract/ops.ts`]: [
    'import type { DropInput } from "../../sessions/contract/service.ts";',
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export interface AdminSessionOps {",
    "  revoke: (token: string) => Promise<void>;",
    "  drop: (input: DropInput, signal: AbortSignal) => Promise<void>;",
    "  statement: (id: string) => StatementToken;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/admin/index.ts`]: 'export type { AdminSessionOps } from "./contract/ops.ts";',
  [`${SERVER}/domain/admin/verbs/kick.ts`]: 'import type { DropInput } from "#domain/sessions";\nexport type Kick = DropInput["token"];',
  [`${SERVER}/entry/http/routes.ts`]: [
    'import { sessions } from "#domain/sessions";',
    'import type { AdminSessionOps } from "#domain/admin";',
    "export interface RoutePort {",
    "  readonly lookup: (id: string) => Promise<string | null>;",
    "  readonly now: () => number;",
    "}",
    "export const port: RoutePort = { lookup: sessions.lookup, now: () => 0 };",
    "export const admin: AdminSessionOps = sessions;",
  ].join("\n"),
};

test("the port census splits runtime-typed shapes and sends db handles to ledger review", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const admin = targets.filter(({ file, form }) => file === `${SERVER}/domain/admin/contract/ops.ts` && form === "member");
  expect(admin.map(({ kind, members, note }) => ({ kind, members, note }))).toEqual(
    expect.arrayContaining([
      { kind: "split", members: ["drop"], note: "data to contracts: DropInput; platform: AbortSignal" },
      { kind: "db-handle-review", members: ["statement"], note: "@orb/db: StatementToken; ruling: unruled" },
    ]),
  );
});

test("the port census plans derive, concept, cross-domain and import targets", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const plan = targets.map(({ kind, form, file, members, type, imports, exports }) => ({ kind, form, file, members, type, imports, exports }));
  expect(plan).toEqual(
    expect.arrayContaining([
      {
        kind: "derive",
        form: "member",
        file: `${SERVER}/entry/http/routes.ts`,
        members: ["lookup"],
        type: 'SessionsService["lookup"]',
        imports: [{ name: "SessionsService", from: "#domain/sessions" }],
        exports: [],
      },
      {
        kind: "concept",
        form: "member",
        file: `${SERVER}/entry/http/routes.ts`,
        members: ["now"],
        type: "Clock",
        imports: [{ name: "Clock", from: "@orb/kit/time" }],
        exports: [],
      },
      {
        kind: "move-to-contracts",
        form: "member",
        file: `${SERVER}/domain/admin/contract/ops.ts`,
        members: ["revoke"],
        type: null,
        imports: [],
        exports: [],
      },
      {
        kind: "move-to-contracts",
        form: "import",
        file: `${SERVER}/domain/admin/verbs/kick.ts`,
        members: ["DropInput"],
        type: null,
        imports: [],
        exports: [],
      },
    ]),
  );
});

// Contracts reaches only kit and zod, so a copy whose signature carries an @orb/db handle can never move there.
const FORGOTTEN_HANDLE_TREE = {
  "packages/server/tsconfig.json": JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ESNext",
      lib: ["ESNext", "DOM"],
      module: "ESNext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      noEmit: true,
      types: [],
      paths: { "#*": ["./src/*/index.ts"] },
    },
    include: ["src"],
  }),
  "packages/db/src/wiring.ts": "export interface StatementToken { readonly sql: string; }",
  [`${SERVER}/domain/alpha/contract/ops.ts`]: [
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export type PlaceStatement = (id: string) => StatementToken;",
    "export type NotificationsEmitOp = (id: string, co?: readonly StatementToken[]) => Promise<void>;",
    "export type HandoffRestampStatements = (chatId: string, pairs: readonly string[]) => readonly StatementToken[];",
  ].join("\n"),
  [`${SERVER}/domain/alpha/contract/views.ts`]: "export interface AlphaView { readonly id: string; readonly name: string; }",
  [`${SERVER}/domain/alpha/index.ts`]: [
    'import type { NotificationsEmitOp, PlaceStatement } from "./contract/ops.ts";',
    "export declare const alpha: { readonly place: PlaceStatement; readonly emit: NotificationsEmitOp };",
  ].join("\n"),
  [`${SERVER}/domain/beta/contract/service.ts`]: [
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "type RestampHandoffDigestsOp = (chatId: string, pairs: readonly string[]) => readonly StatementToken[];",
    "interface BetaRow { readonly id: string; readonly name: string; }",
    "export interface BetaContext {",
    "  readonly place: (id: string) => StatementToken;",
    "  readonly emit: (id: string, co?: readonly StatementToken[]) => Promise<void>;",
    "  readonly restampHandoffDigests: RestampHandoffDigestsOp;",
    "  readonly rows: readonly BetaRow[];",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/beta/index.ts`]: 'export type { BetaContext } from "./contract/service.ts";',
  [`${SERVER}/entry/compose/beta.ts`]: [
    'import { alpha } from "#domain/alpha";',
    'import type { BetaContext } from "#domain/beta";',
    'export const beta: Omit<BetaContext, "restampHandoffDigests" | "rows"> = { place: alpha.place, emit: alpha.emit };',
  ].join("\n"),
};

const typeTargets = (targets: readonly PortTarget[], name: string): readonly Pick<PortTarget, "kind" | "note">[] =>
  targets.filter(({ form, members }) => form === "type" && members[0] === name).map(({ kind, note }) => ({ kind, note }));

test("a handle-carrying type reports ruled only when it resolves to an op the ledger names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(FORGOTTEN_HANDLE_TREE);
  const { targets } = portCensus(root, () => undefined);
  // Unruled: no name of the op is in the ledger tuple, and contracts can never hold its handle.
  expect(typeTargets(targets, "PlaceStatement")).toEqual([
    { kind: "db-handle-review", note: expect.stringContaining("@orb/db: StatementToken; ruling: unruled") },
  ]);
  // Ruled by its own name, as D337's table writes it.
  expect(typeTargets(targets, "NotificationsEmitOp")).toEqual([{ kind: "ruled", note: expect.stringContaining("ruling: D337") }]);
  // Ruled through the consumer's alias, which types the op member D337 names.
  expect(typeTargets(targets, "HandoffRestampStatements")).toEqual([{ kind: "ruled", note: expect.stringContaining("ruling: D337") }]);
});

test("a look-alike reports distinct once the registry records the pair, and review before", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(FORGOTTEN_HANDLE_TREE);
  const pair = { shape: `${SERVER}/domain/alpha/contract/views.ts#AlphaView`, distinctFrom: [`${SERVER}/domain/beta/contract/service.ts#BetaRow`] } as const;
  const judged = portCensus(root, () => undefined, [{ ...pair, reason: "planted: two domains' rows that share only {id, name}" }]);
  const unjudged = portCensus(root, () => undefined, []);
  expect(typeTargets(unjudged.targets, "AlphaView")).toEqual([{ kind: "review", note: expect.stringContaining("same shape, no flow") }]);
  expect(typeTargets(judged.targets, "AlphaView")).toEqual([{ kind: "distinct", note: expect.stringContaining("distinct by registry") }]);
});
