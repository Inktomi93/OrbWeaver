// `pnpm unwired ports` plans each restating member: derive through the owner's door, a kit type for a concept,
// a contracts move across domains, a hand note where a derive would close an import cycle.

import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { PortTarget } from "../../../tooling/src/unwired/index.ts";
import { portCensus } from "../../../tooling/src/unwired/index.ts";
import { JSX_NAMESPACE, LIB } from "./_planted.ts";

const SERVER = "packages/server/src";

const TREE = {
  "packages/server/tsconfig.json": plantedTsconfig({ paths: { "#*": ["./src/*/index.ts"] } }),
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

const SPREAD_TREE = {
  ...TREE,
  [`${SERVER}/entry/http/routes.ts`]: [
    'import { sessions } from "#domain/sessions";',
    'import type { SessionsService } from "#domain/sessions";',
    'import type { AdminSessionOps } from "#domain/admin";',
    "export interface RoutePort {",
    '  readonly lookup: SessionsService["lookup"];',
    "}",
    "export const port: RoutePort = { ...sessions };",
    "export const admin: AdminSessionOps = { ...sessions };",
  ].join("\n"),
};

test("a spread of the owner's ops reports the port that restates one and not the port that derives one", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREAD_TREE);
  const { targets } = portCensus(root, () => undefined);
  const members = targets.filter(({ form }) => form === "member").map(({ kind, file, members: names }) => ({ kind, file, members: names }));
  expect(members).toContainEqual({ kind: "move-to-contracts", file: `${SERVER}/domain/admin/contract/ops.ts`, members: ["revoke"] });
  expect(members.filter(({ file }) => file === `${SERVER}/entry/http/routes.ts`)).toEqual([]);
});

const OVERRIDE_TREE = {
  ...SPREAD_TREE,
  [`${SERVER}/entry/http/routes.ts`]: [
    'import { sessions } from "#domain/sessions";',
    'import type { AdminSessionOps } from "#domain/admin";',
    "declare const override: (token: string) => Promise<void>;",
    "export const admin: AdminSessionOps = { ...sessions, revoke: override };",
  ].join("\n"),
};

test("a property after a spread fills its slot, so the spread's member flow does not reach the census", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(OVERRIDE_TREE);
  const { targets } = portCensus(root, () => undefined);
  const admin = targets.filter(({ file, form }) => file === `${SERVER}/domain/admin/contract/ops.ts` && form === "member");
  expect(admin.map(({ members }) => members[0])).toContain("drop");
  expect(admin.map(({ members }) => members[0])).not.toContain("revoke");
});

// Contracts reaches only kit and zod, so a copy whose signature carries an @orb/db handle can never move there.
const FORGOTTEN_HANDLE_TREE = {
  "packages/server/tsconfig.json": plantedTsconfig({ paths: { "#*": ["./src/*/index.ts"] } }),
  "packages/db/src/wiring.ts": "export interface StatementToken { readonly sql: string; }",
  [`${SERVER}/domain/embeddings/contract/ops.ts`]: [
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export type PlaceStatement = (id: string) => StatementToken;",
    "export type NotificationsEmitOp = (id: string, co?: readonly StatementToken[]) => Promise<void>;",
    "export type HandoffRestampStatements = (chatId: string, pairs: readonly string[]) => readonly StatementToken[];",
  ].join("\n"),
  [`${SERVER}/domain/embeddings/contract/views.ts`]: "export interface AlphaView { readonly id: string; readonly name: string; }",
  [`${SERVER}/domain/embeddings/index.ts`]: [
    'import type { NotificationsEmitOp, PlaceStatement } from "./contract/ops.ts";',
    "export declare const alpha: { readonly place: PlaceStatement; readonly emit: NotificationsEmitOp };",
    "export declare const memoryOps: { readonly storeSegments: (id: string, signal?: AbortSignal) => Promise<void> };",
  ].join("\n"),
  // Chat's own signature over an AbortSignal, which the composition root fills with embeddings' verb.
  [`${SERVER}/domain/chat/contract/store-segments.ts`]: "export type StoreSegmentsOp = (id: string, signal?: AbortSignal) => Promise<void>;",
  [`${SERVER}/domain/chat/contract/service.ts`]: [
    'import type { StoreSegmentsOp } from "./store-segments.ts";',
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "type RestampHandoffDigestsOp = (chatId: string, pairs: readonly string[]) => readonly StatementToken[];",
    "interface BetaRow { readonly id: string; readonly name: string; }",
    "export interface BetaContext {",
    "  readonly place: (id: string) => StatementToken;",
    "  readonly emit: (id: string, co?: readonly StatementToken[]) => Promise<void>;",
    "  readonly restampHandoffDigests: RestampHandoffDigestsOp;",
    "  readonly rows: readonly BetaRow[];",
    "  readonly storeSegments: StoreSegmentsOp;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/chat/index.ts`]: 'export type { BetaContext } from "./contract/service.ts";',
  // D337 names chat's `claimStatement`; the same op name between two domains that do not build it is not ruled.
  [`${SERVER}/domain/atlas/contract/claim.ts`]: [
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export type AtlasClaim = (id: string, seq: number) => StatementToken;",
  ].join("\n"),
  [`${SERVER}/domain/vault/contract/ops.ts`]: [
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export interface VaultOps { readonly claimStatement: (id: string, seq: number) => StatementToken; }",
  ].join("\n"),
  [`${SERVER}/entry/compose/beta.ts`]: [
    'import { alpha, memoryOps } from "#domain/embeddings";',
    'import type { BetaContext } from "#domain/chat";',
    'export const beta: Omit<BetaContext, "restampHandoffDigests" | "rows"> = { place: alpha.place, emit: alpha.emit, storeSegments: memoryOps.storeSegments };',
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
  // A ruled op's name alone rules nothing: the ruled owner domain must be one of the two the handle crosses.
  expect(typeTargets(targets, "AtlasClaim")).toEqual([{ kind: "review", note: expect.not.stringContaining("ruling: D337") }]);
  // A split signature the composition root fills is the consumer's own contract, not a copy to move.
  expect(typeTargets(targets, "StoreSegmentsOp")).toEqual([{ kind: "ruled", note: expect.stringContaining("copies:") }]);
  expect(typeTargets(targets, "StoreSegmentsOp")[0]?.note).toContain("stays with its consumer");
});

test("a look-alike reports distinct once the registry records the pair, and review before", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(FORGOTTEN_HANDLE_TREE);
  const pair = {
    shape: `${SERVER}/domain/embeddings/contract/views.ts#AlphaView`,
    distinctFrom: [`${SERVER}/domain/chat/contract/service.ts#BetaRow`],
  } as const;
  const judged = portCensus(root, () => undefined, [{ ...pair, reason: "planted: two domains' rows that share only {id, name}" }]);
  const unjudged = portCensus(root, () => undefined, []);
  expect(typeTargets(unjudged.targets, "AlphaView")).toEqual([{ kind: "review", note: expect.stringContaining("same shape, no flow") }]);
  expect(typeTargets(judged.targets, "AlphaView")).toEqual([{ kind: "distinct", note: expect.stringContaining("distinct by registry") }]);
});

test("the registry holds only pairs with no flow: a registered pair a flow links stays open work", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(FORGOTTEN_HANDLE_TREE);
  const linked = {
    shape: `${SERVER}/domain/embeddings/contract/ops.ts#PlaceStatement`,
    distinctFrom: [`${SERVER}/domain/chat/contract/service.ts#place`],
  } as const;
  const { targets } = portCensus(root, () => undefined, [{ ...linked, reason: "planted: a wrong judgment over a real flow" }]);
  expect(typeTargets(targets, "PlaceStatement")).toEqual([{ kind: "db-handle-review", note: expect.stringContaining("copies:") }]);
});

// The flows the census follows to join two declarations into one concept, each beside a look-alike no flow reaches.
const CONTRACTS = "packages/contracts/src";
const RECALL_TREE = {
  "packages/server/tsconfig.json": plantedTsconfig(),
  // An async-iterable element flow: the export's zip files feed the infra writer's entries.
  [`${SERVER}/infra/storage/contract.ts`]: [
    "export interface ZipEntry { readonly path: string; readonly bytes: Uint8Array; }",
    "export declare function packZip(entries: AsyncIterable<ZipEntry>): void;",
  ].join("\n"),
  [`${SERVER}/infra/storage/stage.ts`]: "export interface StagedFile { readonly path: string; readonly bytes: Uint8Array; }",
  [`${SERVER}/domain/export/contract/st-profile.ts`]: [
    "export interface StProfileZipFile { readonly path: string; readonly bytes: Uint8Array; }",
    "export declare function stProfileZip(): AsyncGenerator<StProfileZipFile>;",
  ].join("\n"),
  [`${SERVER}/entry/http/export.ts`]: [
    'import { packZip } from "../../infra/storage/contract.ts";',
    'import { stProfileZip } from "../../domain/export/contract/st-profile.ts";',
    "export function exportProfile(): void { packZip(stProfileZip()); }",
  ].join("\n"),
  // An array element flow: the plan's rows feed the marker placer's rows.
  [`${SERVER}/infra/wire/v4.ts`]: [
    "export interface PlanRow { readonly role: string; readonly toolExchange: boolean; readonly text: string; }",
    "export interface WirePlan { readonly rows: readonly PlanRow[]; }",
  ].join("\n"),
  [`${SERVER}/infra/wire/markers.ts`]: [
    "export interface CacheMarkerRow { readonly role: string; readonly toolExchange: boolean; readonly text: string; }",
    "export declare function placeMarkers(input: { readonly rows: readonly CacheMarkerRow[] }): void;",
  ].join("\n"),
  [`${SERVER}/infra/wire/history.ts`]: "export interface HistoryTurn { readonly role: string; readonly toolExchange: boolean; readonly text: string; }",
  [`${SERVER}/infra/wire/chat.ts`]: [
    'import type { WirePlan } from "./v4.ts";',
    'import { placeMarkers } from "./markers.ts";',
    "export function send(plan: WirePlan): void { placeMarkers({ rows: plan.rows }); }",
  ].join("\n"),
  // A handler registered into a tool slot receives the slot's wider execution data.
  [`${CONTRACTS}/tool-use/index.ts`]: [
    "export interface ToolExecutionData { readonly principal: string; readonly chatId: string; readonly turnId: string; }",
    "export interface ToolDefinition {",
    "  readonly name: string;",
    "  readonly handler: (args: string, exec: ToolExecutionData & { readonly signal: AbortSignal }) => Promise<string>;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/chat/contract/react-tool.ts`]: [
    "export interface ReactToolHandlerContext { readonly principal: string; readonly chatId: string; }",
    "export type ReactToolHandler = (args: string, exec: ReactToolHandlerContext) => Promise<string>;",
    "export declare function createReactToolHandler(): ReactToolHandler;",
  ].join("\n"),
  [`${SERVER}/domain/chat/contract/params.ts`]: "export interface ListForChatParams { readonly principal: string; readonly chatId: string; }",
  [`${SERVER}/entry/compose/chat-tools.ts`]: [
    'import type { ToolDefinition } from "../../../../contracts/src/tool-use/index.ts";',
    'import { createReactToolHandler } from "../../domain/chat/contract/react-tool.ts";',
    'export function createReactToolDefinition(): ToolDefinition { return { name: "react", handler: createReactToolHandler() }; }',
  ].join("\n"),
  // A domain contract restating a primitive the composition root wires into it.
  [`${SERVER}/primitives/regex/compile-probe.ts`]: [
    "export interface FindCompileProbe { readonly findRegex: string; readonly flags: string; }",
    "export declare function createFindCompileProbe(): (patterns: readonly FindCompileProbe[]) => Promise<readonly boolean[]>;",
  ].join("\n"),
  [`${SERVER}/domain/regex/contract/portability.ts`]: [
    "export interface FindCompileProbe { readonly findRegex: string; readonly flags: string; }",
    "export type ProbeFindCompilesOp = (patterns: readonly FindCompileProbe[]) => Promise<readonly boolean[]>;",
    "export interface RegexPortabilityContext { readonly probeFindCompiles: ProbeFindCompilesOp; }",
    "export declare function createRegexService(context: RegexPortabilityContext): void;",
  ].join("\n"),
  [`${SERVER}/entry/compose/regex.ts`]: [
    'import { createFindCompileProbe } from "../../primitives/regex/compile-probe.ts";',
    'import { createRegexService } from "../../domain/regex/contract/portability.ts";',
    "export function buildRegex(): void {",
    "  const probeFindCompiles = createFindCompileProbe();",
    "  createRegexService({ probeFindCompiles });",
    "}",
  ].join("\n"),
  // The ports review's true findings, which must keep reporting: a private copy of the chat contract's sink a verb builds
  // and hands on, and a domain taking another domain's pure data row.
  [`${SERVER}/domain/chat/contract/gather.ts`]: [
    "export interface SendRegexSink { readonly scripts: readonly string[]; readonly depth: number; }",
    "export declare function gatherAssembleContext(sink: SendRegexSink): void;",
  ].join("\n"),
  [`${SERVER}/domain/chat/verbs/turn.ts`]: [
    'import { gatherAssembleContext } from "../contract/gather.ts";',
    "interface SendRegexSink { readonly scripts: readonly string[]; readonly depth: number; }",
    "export function runTurn(sink: SendRegexSink): void { gatherAssembleContext(sink); }",
  ].join("\n"),
  [`${SERVER}/domain/workloads/contract/contribution.ts`]: "export interface ActiveWorkloadRow { readonly kind: string; readonly params: string; }",
  [`${SERVER}/domain/workloads/index.ts`]: 'export type { ActiveWorkloadRow } from "./contract/contribution.ts";',
  [`${SERVER}/domain/import/workload-contributions.ts`]: [
    'import type { ActiveWorkloadRow } from "../workloads/index.ts";',
    "export type ActiveRows = readonly ActiveWorkloadRow[];",
  ].join("\n"),
  // A domain and the content package may not import each other, so each declares the plate shape.
  "packages/default-content/src/contract/plates.ts": [
    "export interface SeedBackgroundPlate { readonly slug: string; readonly label: string; }",
    "export declare const SEED_BACKGROUND_PLATES: readonly SeedBackgroundPlate[];",
  ].join("\n"),
  [`${SERVER}/domain/settings/contract/seeder.ts`]: [
    "export interface SeedPlate { readonly slug: string; readonly label: string; }",
    "export interface DefaultBackgroundSeederDeps { readonly plates: readonly SeedPlate[]; }",
    "export declare function createDefaultBackgroundSeeder(deps: DefaultBackgroundSeederDeps): void;",
  ].join("\n"),
  [`${SERVER}/entry/compose/settings.ts`]: [
    'import { SEED_BACKGROUND_PLATES } from "../../../../default-content/src/contract/plates.ts";',
    'import { createDefaultBackgroundSeeder } from "../../domain/settings/contract/seeder.ts";',
    "export function seedBackgrounds(): void { createDefaultBackgroundSeeder({ plates: SEED_BACKGROUND_PLATES }); }",
  ].join("\n"),
};

type TypeTarget = Pick<PortTarget, "kind" | "owner" | "ownerAt" | "note">;

const typeTarget = (targets: readonly PortTarget[], file: string, name: string): TypeTarget | undefined =>
  targets
    .filter((target) => target.form === "type" && target.file === file && target.members[0] === name)
    .map(({ kind, owner, ownerAt, note }) => ({ kind, owner, ownerAt, note }))[0];

test("an element flow through an array or an async iterable joins its two row shapes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(RECALL_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${SERVER}/infra/wire/v4.ts`, "PlanRow")).toMatchObject({
    kind: "forgotten-door-export",
    note: expect.stringContaining(`copies: ${SERVER}/infra/wire/markers.ts:1 CacheMarkerRow`),
  });
  // The export's zip file sits a tier above the infra entry it feeds, so the infra shape owns it.
  expect(typeTarget(targets, `${SERVER}/domain/export/contract/st-profile.ts`, "StProfileZipFile")).toMatchObject({
    kind: "hand",
    owner: "ZipEntry",
    ownerAt: `${SERVER}/infra/storage/contract.ts:1`,
  });
  // The look-alikes no element flow reaches stay shape-only review work.
  expect(typeTarget(targets, `${SERVER}/infra/wire/history.ts`, "HistoryTurn")).toMatchObject({
    kind: "review",
    note: expect.stringContaining("same shape, no flow"),
  });
  expect(typeTarget(targets, `${SERVER}/infra/storage/stage.ts`, "StagedFile")).toMatchObject({
    kind: "review",
    note: expect.stringContaining("same shape, no flow"),
  });
});

test("a handler registered into a slot derives its context from the data the slot passes, not from a look-alike", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(RECALL_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${SERVER}/domain/chat/contract/react-tool.ts`, "ReactToolHandlerContext")).toMatchObject({
    kind: "hand",
    owner: "ToolExecutionData",
    ownerAt: `${CONTRACTS}/tool-use/index.ts:1`,
    note: expect.stringContaining('Pick<ToolExecutionData, "chatId" | "principal">'),
  });
  expect(typeTarget(targets, `${SERVER}/domain/chat/contract/params.ts`, "ListForChatParams")).toMatchObject({
    kind: "review",
    note: expect.stringContaining("same shape, no flow"),
  });
});

test("a domain contract restating a primitive the composition root wires in derives from the primitive", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(RECALL_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${SERVER}/domain/regex/contract/portability.ts`, "FindCompileProbe")).toMatchObject({
    kind: "hand",
    owner: "FindCompileProbe",
    ownerAt: `${SERVER}/primitives/regex/compile-probe.ts:1`,
  });
  // The primitive is the owner: it keeps its own door export and is never told to import the domain's copy.
  expect(typeTarget(targets, `${SERVER}/primitives/regex/compile-probe.ts`, "FindCompileProbe")).toMatchObject({
    kind: "forgotten-door-export",
    note: expect.stringContaining(`copies: ${SERVER}/domain/regex/contract/portability.ts:1 FindCompileProbe`),
  });
});

test("a linked copy neither side may import under a dependency rule is a ruled restatement", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(RECALL_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${SERVER}/domain/settings/contract/seeder.ts`, "SeedPlate")).toMatchObject({
    kind: "ruled",
    note: expect.stringContaining("domain-no-default-content"),
  });
  expect(typeTarget(targets, "packages/default-content/src/contract/plates.ts", "SeedBackgroundPlate")).toMatchObject({
    kind: "ruled",
    note: expect.stringContaining("default-content-cake"),
  });
});

test("the ports review's true findings still report as work", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(RECALL_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${SERVER}/domain/chat/contract/gather.ts`, "SendRegexSink")).toMatchObject({
    kind: "forgotten-door-export",
    note: expect.stringContaining(`copies: ${SERVER}/domain/chat/verbs/turn.ts:2 SendRegexSink`),
  });
  const imports = targets.filter(({ form, file }) => form === "import" && file === `${SERVER}/domain/import/workload-contributions.ts`);
  expect(imports.map(({ kind, members }) => ({ kind, members }))).toEqual([{ kind: "move-to-contracts", members: ["ActiveWorkloadRow"] }]);
});

const CLIENT = "packages/client/src/features/preset";
const JSX_TREE = {
  "packages/client/tsconfig.json": plantedTsconfig({ lib: LIB, jsx: "preserve" }),
  "packages/client/src/jsx.d.ts": JSX_NAMESPACE,
  [`${CLIENT}/params-limits.tsx`]: [
    "export interface ParamsLimitsProps { readonly form: string; readonly limit: number; }",
    "export function ParamsLimits(props: ParamsLimitsProps): JSX.Element { return <div title={props.form} />; }",
  ].join("\n"),
  // Forwards every prop it receives: one concept.
  [`${CLIENT}/params-deck.tsx`]: [
    'import { ParamsLimits } from "./params-limits.tsx";',
    "export interface ParamsDeckProps { readonly form: string; readonly limit: number; }",
    "export function ParamsDeck({ form, limit }: ParamsDeckProps): JSX.Element { return <ParamsLimits form={form} limit={limit} />; }",
  ].join("\n"),
  // Forwards one prop and fills the other itself: two components that share a shape, not a concept.
  [`${CLIENT}/params-preview.tsx`]: [
    'import { ParamsLimits } from "./params-limits.tsx";',
    "export interface ParamsPreviewProps { readonly form: string; readonly limit: number; }",
    "export function ParamsPreview({ form }: ParamsPreviewProps): JSX.Element { return <ParamsLimits form={form} limit={1} />; }",
  ].join("\n"),
};

test("a component that forwards every prop to a child shares the child's props concept", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(JSX_TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(typeTarget(targets, `${CLIENT}/params-deck.tsx`, "ParamsDeckProps")).toMatchObject({
    kind: "forgotten-door-export",
    note: expect.stringContaining(`copies: ${CLIENT}/params-limits.tsx:1 ParamsLimitsProps`),
  });
  expect(typeTarget(targets, `${CLIENT}/params-preview.tsx`, "ParamsPreviewProps")).toMatchObject({
    kind: "review",
    note: expect.stringContaining("same shape, no flow"),
  });
});
