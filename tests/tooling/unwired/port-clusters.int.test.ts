// The census plans each concept once, from its real owner: a derived form is derived, a shape-only match goes to
// review, a consumer plans only the ops it calls, a member typed by a contracts alias owns its chain, and every target
// lands in the cluster of the concept it is about.
import { expect, test } from "@orb/testkit/tooling";
import type { PortTarget } from "../../../tooling/src/unwired/index.ts";
import { portCensus } from "../../../tooling/src/unwired/index.ts";

const S = "packages/server/src";

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
      paths: { "#*": ["./src/*/index.ts"], "@orb/contracts/*": ["../contracts/src/*/index.ts"], "@orb/kit/regex": ["../kit/src/regex/index.ts"] },
    },
    include: ["src"],
  }),
  "packages/contracts/package.json": JSON.stringify({
    name: "@orb/contracts",
    exports: {
      "./inference": "./src/inference/index.ts",
      "./preset": "./src/preset/index.ts",
      "./regex": "./src/regex/index.ts",
      "./role-clients": "./src/role-clients/index.ts",
    },
  }),
  "packages/contracts/src/inference/index.ts": "export type TaskAvailabilityOp = (task: string) => boolean;",
  "packages/contracts/src/preset/index.ts": "export type ResolveUtilityPresetParams = (userId: string) => Promise<number | undefined>;",
  "packages/contracts/src/regex/index.ts": "export type ExportCardScripts = (characterId: string) => Promise<string>;",
  "packages/contracts/src/role-clients/index.ts":
    "export interface RoleClients {\n  embed: (input: string, opts?: { instruction?: string }) => Promise<number>;\n}",
  "packages/kit/src/regex/index.ts": [
    "export interface RegexExecuteOptions {",
    "  applyReplace?: (text: string, pattern: RegExp) => string;",
    "}",
    "export declare function executeRegex(text: string, opts: RegexExecuteOptions): string;",
  ].join("\n"),
  [`${S}/foundation/debug.ts`]: "export interface DebugOptions {\n  effectiveConfig?: () => number;\n}",

  // Derived forms: NonNullable of an indexed access, a local alias of one, and Parameters/ReturnType/Awaited.
  [`${S}/domain/chat/contract/service.ts`]:
    "export interface ChatService {\n  listParticipants: (chatId: string) => Promise<readonly { readonly id: string }[]>;\n}",
  [`${S}/domain/chat/contract/engine-context.ts`]: [
    'import type { RegexExecuteOptions } from "@orb/kit/regex";',
    'import type { DebugOptions } from "../../../foundation/debug.ts";',
    'import type { ChatService } from "./service.ts";',
    'export type ApplyRegexReplaceOp = NonNullable<RegexExecuteOptions["applyReplace"]>;',
    "export type ReserveReceiptEventsOp = (count: number) => number;",
    "export interface PipelineDeps {",
    "  readonly applyRegexReplace: ApplyRegexReplaceOp;",
    '  readonly getEffectiveConfig: NonNullable<DebugOptions["effectiveConfig"]>;',
    '  readonly participants: (...args: Parameters<ChatService["listParticipants"]>) => Promise<Awaited<ReturnType<ChatService["listParticipants"]>>>;',
    "}",
  ].join("\n"),
  [`${S}/domain/chat/engine/pipeline.ts`]: [
    'import { executeRegex } from "@orb/kit/regex";',
    'import type { DebugOptions } from "../../../foundation/debug.ts";',
    'import type { PipelineDeps } from "../contract/engine-context.ts";',
    'import type { ChatService } from "../contract/service.ts";',
    "export declare const deps: PipelineDeps;",
    "export declare const chat: ChatService;",
    'export const out = executeRegex("x", { applyReplace: deps.applyRegexReplace });',
    "export const debug: DebugOptions = { effectiveConfig: deps.getEffectiveConfig };",
    "export const wired: PipelineDeps = { ...deps, participants: chat.listParticipants };",
  ].join("\n"),
  [`${S}/domain/chat/contract/context.ts`]: [
    "type ResolveUtilityPresetParamsOp = (userId: string) => Promise<number | undefined>;",
    "export interface ChatContext {",
    "  readonly resolveUtilityPresetParams: ResolveUtilityPresetParamsOp;",
    "}",
  ].join("\n"),
  [`${S}/domain/chat/index.ts`]: 'export type { ChatContext } from "./contract/context.ts";',

  // An owner without the port's optional `signal` field is a narrower op, never a derive.
  [`${S}/domain/embeddings/contract/service.ts`]: [
    "export interface EmbeddingConnectionSnapshot {",
    "  readonly embed: (input: string, opts?: { instruction?: string; signal?: AbortSignal }) => Promise<number>;",
    "}",
  ].join("\n"),
  [`${S}/domain/embeddings/verbs/snapshot.ts`]: [
    'import type { RoleClients } from "@orb/contracts/role-clients";',
    'import type { EmbeddingConnectionSnapshot } from "../contract/service.ts";',
    "export declare const clients: RoleClients;",
    "export const snapshot: EmbeddingConnectionSnapshot = { embed: clients.embed };",
  ].join("\n"),

  // Shape-only look-alikes, and one pair a flow links.
  [`${S}/domain/databank/contract/params.ts`]: "export interface ListActiveForChatParams {\n  readonly principal: string;\n  readonly chatId: string;\n}",
  [`${S}/domain/databank/index.ts`]: "export {};",
  [`${S}/domain/automation/contract/params.ts`]: "export interface ListRulesParams {\n  readonly principal: string;\n  readonly chatId: string;\n}",
  [`${S}/domain/automation/contract/runtime-ops.ts`]:
    "export interface AutomationRuntimeDeps {\n  readonly resolveUtilityPresetParams: (userId: string) => Promise<number | undefined>;\n}",
  [`${S}/domain/automation/index.ts`]: 'export type { AutomationRuntimeDeps } from "./contract/runtime-ops.ts";',
  [`${S}/domain/rpg/contract/service.ts`]: "export interface RpgDice {\n  readonly randomInt: (max: number) => number;\n}",
  [`${S}/domain/persona/contract/params.ts`]: "export interface GetPersonaParams {\n  readonly principal: string;\n  readonly personaId: string;\n}",
  [`${S}/domain/persona/contract/service.ts`]:
    'import type { GetPersonaParams } from "./params.ts";\nexport interface PersonaService {\n  get: (params: GetPersonaParams) => Promise<number>;\n}',
  [`${S}/domain/persona/index.ts`]:
    'export type { PersonaService } from "./contract/service.ts";\nexport declare const persona: import("./contract/service.ts").PersonaService;',
  [`${S}/domain/world-info/contract/params.ts`]: "export interface ListForPersonaParams {\n  readonly principal: string;\n  readonly personaId: string;\n}",
  [`${S}/domain/world-info/contract/ports.ts`]:
    'import type { ListForPersonaParams } from "./params.ts";\nexport interface WorldInfoPersonaPort {\n  readonly listForPersona: (params: ListForPersonaParams) => Promise<number>;\n}',
  [`${S}/domain/world-info/index.ts`]: 'export type { WorldInfoPersonaPort } from "./contract/ports.ts";',
  [`${S}/entry/compose/world-info.ts`]: [
    'import { persona } from "#domain/persona";',
    'import type { WorldInfoPersonaPort } from "#domain/world-info";',
    "export const port: WorldInfoPersonaPort = { listForPersona: persona.get };",
  ].join("\n"),

  // A service a consumer calls one op of, and one a consumer reads nothing off.
  [`${S}/domain/character/contract/service.ts`]: [
    "export interface CharacterCard {\n  readonly id: string;\n  readonly name: string;\n}",
    "export interface CharacterService {",
    "  getCard: (id: string) => Promise<CharacterCard>;",
    "  deleteCard: (id: string, signal: AbortSignal) => Promise<void>;",
    "}",
  ].join("\n"),
  [`${S}/domain/character/index.ts`]: 'export type { CharacterCard, CharacterService } from "./contract/service.ts";',
  [`${S}/domain/rpg/contract/ops.ts`]:
    'import type { CharacterService } from "#domain/character";\nexport interface RpgCharacterDeps {\n  readonly character: Pick<CharacterService, "getCard">;\n}',
  [`${S}/domain/rpg/verbs/load.ts`]:
    'import type { RpgCharacterDeps } from "../contract/ops.ts";\nexport const load = (deps: RpgCharacterDeps): Promise<unknown> => deps.character.getCard("c");',
  [`${S}/domain/stats/contract/ops.ts`]:
    'import type { CharacterService } from "#domain/character";\nexport interface StatsDeps {\n  readonly character: CharacterService;\n}',

  // The tool registry: definition data moves, the handler signature and the resolved set stay.
  [`${S}/domain/tool-use/contract/params.ts`]: [
    'export type ToolSource = "builtin" | "plugin";',
    "export interface ToolExecutionContext {\n  readonly principal: string;\n  readonly signal?: AbortSignal;\n}",
    "export type ToolHandler<A> = (args: A, exec: ToolExecutionContext) => Promise<string>;",
    "export interface ToolDefinition<A = unknown> {",
    "  readonly name: string;",
    "  readonly description: string;",
    "  readonly source: ToolSource;",
    "  readonly handler: ToolHandler<A>;",
    "}",
  ].join("\n"),
  [`${S}/domain/tool-use/index.ts`]: 'export type { ToolDefinition } from "./contract/params.ts";',
  [`${S}/domain/imagery/tool/index.ts`]: 'import type { ToolDefinition } from "#domain/tool-use";\nexport declare const tools: readonly ToolDefinition[];',

  // A chain whose owner is a contracts alias, reached through a destructured binding.
  [`${S}/domain/preset/contract/side-gen.ts`]: [
    'import type { ResolveUtilityPresetParams } from "@orb/contracts/preset";',
    "export interface SideGenParams {\n  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;\n}",
  ].join("\n"),
  [`${S}/domain/preset/index.ts`]:
    'export type { SideGenParams } from "./contract/side-gen.ts";\nexport declare function buildSideGenParams(): import("./contract/side-gen.ts").SideGenParams;',
  [`${S}/entry/compose/services.ts`]: [
    'import type { AutomationRuntimeDeps } from "#domain/automation";',
    'import type { ChatContext } from "#domain/chat";',
    'import { buildSideGenParams } from "#domain/preset";',
    "const { resolveUtilityPresetParams } = buildSideGenParams();",
    "export const automation: AutomationRuntimeDeps = { resolveUtilityPresetParams };",
    "export const chat: ChatContext = { resolveUtilityPresetParams };",
  ].join("\n"),

  // A composition member typed by a contracts alias owns the op; the domain's hand-typed copy derives from the alias.
  [`${S}/domain/export/contract/service.ts`]: "export interface ExportContext {\n  readonly exportCardScripts: (characterId: string) => Promise<string>;\n}",
  [`${S}/domain/export/index.ts`]: 'export declare function createExportService(ctx: import("./contract/service.ts").ExportContext): void;',
  [`${S}/entry/compose/regex.ts`]:
    'import type { ExportCardScripts } from "@orb/contracts/regex";\nexport interface RegexComposeResult {\n  readonly exportCardScripts: ExportCardScripts;\n}',
  [`${S}/entry/compose/export.ts`]: [
    'import { createExportService } from "#domain/export";',
    'import type { RegexComposeResult } from "./regex.ts";',
    "export declare const regex: RegexComposeResult;",
    "createExportService({ exportCardScripts: regex.exportCardScripts });",
  ].join("\n"),

  // A derive against a contracts op whose area names no cluster folds into the editing domain's cluster.
  [`${S}/domain/connection/contract/service.ts`]: "export interface ConnectionService {\n  readonly availability: (task: string) => boolean;\n}",
  [`${S}/domain/connection/index.ts`]: 'export type { ConnectionService } from "./contract/service.ts";',
  [`${S}/entry/compose/connection.ts`]: [
    'import type { TaskAvailabilityOp } from "@orb/contracts/inference";',
    'import type { ConnectionService } from "#domain/connection";',
    "export interface InferenceOps {\n  readonly availability: TaskAvailabilityOp;\n}",
    "export declare const connection: ConnectionService;",
    "export const ops: InferenceOps = { availability: connection.availability };",
  ].join("\n"),
};

type Seen = Pick<PortTarget, "kind" | "form" | "members" | "type" | "cluster" | "clusterGroup">;

const seen = ({ kind, form, members, type, cluster, clusterGroup }: PortTarget): Seen => ({ kind, form, members, type, cluster, clusterGroup });

const at = (targets: readonly PortTarget[], file: string): readonly Seen[] => targets.filter((target) => target.file === file).map(seen);

test("a derived form, a narrower owner and an alias typed by its owner restate nothing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(at(targets, `${S}/domain/chat/contract/engine-context.ts`).filter(({ form }) => form !== "type")).toEqual([]);
  expect(at(targets, `${S}/domain/embeddings/contract/service.ts`)).toEqual([]);
  expect(at(targets, `${S}/entry/compose/regex.ts`)).toEqual([]);
  expect(targets.filter(({ kind, file }) => kind === "add-door-export" && file === `${S}/domain/export/index.ts`)).toEqual([]);
});

test("a shape-only match goes to review and a flow-linked copy moves to contracts", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const forgotten = (file: string): readonly Pick<PortTarget, "kind" | "members" | "clusterGroup">[] =>
    targets.filter((target) => target.file === file && target.form === "type").map(({ kind, members, clusterGroup }) => ({ kind, members, clusterGroup }));
  expect(forgotten(`${S}/domain/databank/contract/params.ts`)).toEqual([{ kind: "review", members: ["ListActiveForChatParams"], clusterGroup: "other" }]);
  expect(forgotten(`${S}/domain/automation/contract/params.ts`)).toEqual([{ kind: "review", members: ["ListRulesParams"], clusterGroup: "other" }]);
  expect(forgotten(`${S}/domain/chat/contract/engine-context.ts`)).toEqual([{ kind: "review", members: ["ReserveReceiptEventsOp"], clusterGroup: "other" }]);
  expect(forgotten(`${S}/domain/persona/contract/params.ts`)).toEqual([{ kind: "move-to-contracts", members: ["GetPersonaParams"], clusterGroup: "other" }]);
});

test("a consumer plans only the ops it calls, never the whole service", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  expect(at(targets, `${S}/domain/rpg/contract/ops.ts`)).toEqual([
    { kind: "move-to-contracts", form: "import", members: ["getCard"], type: null, cluster: "character:getCard", clusterGroup: "character-ops" },
  ]);
  expect(at(targets, `${S}/domain/stats/contract/ops.ts`)).toEqual([
    { kind: "review", form: "import", members: ["CharacterService"], type: null, cluster: "character:CharacterService", clusterGroup: "other" },
  ]);
  const tools = targets.filter(({ file }) => file === `${S}/domain/imagery/tool/index.ts`);
  expect(tools.map(seen)).toEqual([
    { kind: "split", form: "import", members: ["ToolDefinition"], type: null, cluster: "tool-use:ToolDefinition", clusterGroup: "tool-registry" },
  ]);
  expect(tools[0]?.note).toContain("data to contracts: ToolSource; stays by ruling: ToolHandler");
});

test("a chain owned by a contracts alias derives from that alias in every domain", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const plan = (file: string): readonly Pick<PortTarget, "kind" | "form" | "members" | "type" | "imports" | "clusterGroup">[] =>
    targets
      .filter((target) => target.file === file)
      .map(({ kind, form, members, type, imports, clusterGroup }) => ({ kind, form, members, type, imports, clusterGroup }));
  const preset = [{ name: "ResolveUtilityPresetParams", from: "@orb/contracts/preset" }];
  expect(plan(`${S}/domain/automation/contract/runtime-ops.ts`)).toEqual([
    {
      kind: "derive",
      form: "member",
      members: ["resolveUtilityPresetParams"],
      type: "ResolveUtilityPresetParams",
      imports: preset,
      clusterGroup: "remaining-derives",
    },
  ]);
  expect(plan(`${S}/domain/chat/contract/context.ts`)).toEqual([
    {
      kind: "derive",
      form: "type",
      members: ["ResolveUtilityPresetParamsOp"],
      type: "ResolveUtilityPresetParams",
      imports: preset,
      clusterGroup: "remaining-derives",
    },
  ]);
  expect(plan(`${S}/domain/export/contract/service.ts`)).toEqual([
    {
      kind: "derive",
      form: "member",
      members: ["exportCardScripts"],
      type: "ExportCardScripts",
      imports: [{ name: "ExportCardScripts", from: "@orb/contracts/regex" }],
      clusterGroup: "remaining-derives",
    },
  ]);
  expect(plan(`${S}/domain/connection/contract/service.ts`)).toEqual([
    {
      kind: "derive",
      form: "member",
      members: ["availability"],
      type: "TaskAvailabilityOp",
      imports: [{ name: "TaskAvailabilityOp", from: "@orb/contracts/inference" }],
      clusterGroup: "platform",
    },
  ]);
});
