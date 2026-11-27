// `orb/derived-port-member` refuses a port member whose hand-written function type is identical to the member flowing
// into it, names the higher-tier member as the restatement, and sends a cross-domain pair to packages/contracts.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { derivedPortMemberRule } from "../../tooling/src/eslint/derived-port.ts";
import { DRIZZLE_PACKAGE } from "../../tooling/src/eslint/library-source.ts";
import { resolvedConfig } from "./_eslint-config.ts";
import type { Link } from "./_library-link.ts";
import { LINKS, lintLinked, plantLinked } from "./_library-link.ts";

const RULE = "orb/derived-port-member";
const SERVICE = "packages/server/src/domain/sessions/contract/service.ts";
const CLOCK = "packages/kit/src/time/index.ts";
const SITE = "packages/server/src/entry/compose/probe.ts";
const CROSS = "packages/server/src/domain/admin/contract/probe.ts";
const DATA = "packages/client/src/data/create-entity-mutation.ts";
const CLIENT = "packages/client/src/data/probe.ts";

const OWNERS = {
  [SERVICE]: [
    "export interface SessionsService {",
    "  create: (userId: string) => Promise<{ token: string; expiresAt: number }>;",
    "  revoke: (token: string) => Promise<void>;",
    "  onSettled: () => void;",
    "  cancel: (input: RevokeInput, signal: AbortSignal) => Promise<void>;",
    "  resolve: (input: RevokeInput) => Promise<ResolveOutcome>;",
    "  drop: (input: DropInput, signal: AbortSignal) => Promise<void>;",
    "  statement: (id: string) => StatementToken;",
    "  revokeAllForUserStatement: (id: string) => StatementToken;",
    "  register: (spec: RegisterSpec) => void;",
    "}",
    "export interface RegisterSpec { readonly token: string; readonly invoke: (signal?: AbortSignal) => Promise<void>; }",
    'import type { StatementToken } from "../../../../../db/src/wiring.ts";',
    "export interface DropInput { readonly token: string; }",
    'import type { RevokeInput } from "../../../../../contracts/src/sessions.ts";',
    'import type { ResolveOutcome } from "../../../../../inference/src/resolve.ts";',
    "export declare const sessions: SessionsService;",
  ].join("\n"),
  "packages/contracts/src/sessions.ts": "export interface RevokeInput { readonly token: string; }",
  "packages/db/src/wiring.ts": "export interface StatementToken { readonly sql: string; }",
  "packages/inference/src/resolve.ts": "export interface ResolveOutcome { readonly ok: boolean; }",
  "packages/contracts/src/rooms.ts": [
    "export interface RoomSummary { readonly id: string; readonly lastTurnAt: number | null; readonly role: 'host' | 'member'; readonly title: string }",
    "export declare const rooms: readonly RoomSummary[];",
    "export declare const room: RoomSummary;",
  ].join("\n"),
  [CLOCK]: "export type Clock = () => number;\nexport interface Seams { readonly now: Clock; }\nexport declare const seams: Seams;",
  "packages/contracts/src/chat.ts": [
    "export interface ReapInput { readonly chatId: string }",
    "export interface ReapResult { readonly reaped: number }",
    "export interface DuplicateInput { readonly chatId: string; readonly messageId: string }",
    "export interface RuleIdInput { readonly ruleId: string }",
    "export interface SetEnabledInput { readonly ruleId: string; readonly enabled: boolean }",
    "export interface ForkResult { readonly chatId: string; readonly title: string }",
    "export interface ChatRef { readonly chatId: string; readonly title: string }",
    "export interface SectionInput { readonly section: 'theme' | 'chat'; readonly patch: Record<string, unknown> }",
    "export declare const reaped: ReapResult;",
  ].join("\n"),
  [DATA]: [
    'import type { MutationOptions, Procedure } from "@trpc/tanstack-react-query";',
    'import type { DuplicateInput, ForkResult, ReapInput, ReapResult, RuleIdInput, SectionInput, SetEnabledInput } from "../../../contracts/src/chat.ts";',
    "export declare const trpc: { readonly chat: { readonly reapHusks: Procedure<ReapInput, ReapResult>; readonly duplicate: Procedure<DuplicateInput, void>; readonly fork: Procedure<RuleIdInput, ForkResult>; readonly deleteRule: Procedure<RuleIdInput, void>; readonly setEnabled: Procedure<SetEnabledInput, void>; readonly updateSection: Procedure<SectionInput, void> } };",
    "export declare function createEntityMutation<TVars, TData>(config: { readonly options: () => MutationOptions<TVars, TData> }): void;",
    "export declare function withProcedureInput<TVars, TInput, TData>(base: MutationOptions<TInput, TData>, input: (vars: TVars) => TInput): MutationOptions<TVars, TData>;",
  ].join("\n"),
};

// The tRPC client's TypeHelper protocol, planted as the library it is: a decorated procedure carries `~types`, and its
// options factory binds the procedure's input and output to the query library's variables and data.
const TRPC_LIBRARY = {
  "node_modules/@trpc/tanstack-react-query/package.json": JSON.stringify({ name: "@trpc/tanstack-react-query", types: "./index.d.ts" }),
  "node_modules/@trpc/tanstack-react-query/index.d.ts": [
    "export interface MutationOptions<TVars, TData> { readonly mutationFn: (vars: TVars) => Promise<TData> }",
    'export interface Procedure<TInput, TOutput> { readonly "~types": { readonly input: TInput; readonly output: TOutput }; readonly mutationOptions: () => MutationOptions<TInput, TOutput> }',
    'type Typed = { readonly "~types": { readonly input: unknown; readonly output: unknown } };',
    'export type inferInput<P extends Typed> = P["~types"]["input"];',
    'export type inferOutput<P extends Typed> = P["~types"]["output"];',
  ].join("\n"),
};

const TRPC_IMPORTS =
  'import { createEntityMutation, trpc, withProcedureInput } from "./create-entity-mutation.ts";\nimport type { inferInput, inferOutput, MutationOptions } from "@trpc/tanstack-react-query";\nimport type { ReapResult } from "../../../contracts/src/chat.ts";';

const IMPORTS =
  'import { sessions } from "../../domain/sessions/contract/service.ts";\nimport type { SessionsService } from "../../domain/sessions/contract/service.ts";\nimport { seams } from "../../../../kit/src/time/index.ts";';

function lint(root: string, file: string, source: string, rule: NonNullable<ESLint.Plugin["rules"]>[string]): readonly Linter.LintMessage[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: [...Object.keys(OWNERS), file].map((path) => join(root, path)), options });
  const found = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "derived-port-member": rule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

// A lint message carries its messageId but not its data, so a row's data is checked the way RuleTester checks it: filled
// into the rule's own template for that id and compared with the reported message.
type Reported = Pick<Linter.LintMessage, "messageId" | "message">;

function reported({ messageId, data }: { readonly messageId: string; readonly data: Readonly<Record<string, string>> }): Reported {
  const template = derivedPortMemberRule.meta.messages?.[messageId] ?? "";
  return { messageId, message: template.replaceAll(/\{\{\s*(\w+)\s*\}\}/gu, (_: string, key: string) => data[key] ?? `{{${key}}}`) };
}

test.for([
  {
    name: "a whole port restated by hand",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly create: (userId: string) => Promise<{ token: string; expiresAt: number }>; }\nexport const deps: { sessions: Port } = { sessions };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.create", owner: "SessionsService.create" } }],
  },
  {
    name: "a member forwarded through a lambda",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { revoke(token: string): Promise<void>; }\nexport const port: Port = { revoke: (token) => sessions.revoke(token) };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a clock restated beside the named kit type",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly now: () => number; }\nexport const port: Port = seams;`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.now", owner: "Seams.now" } }],
  },
  {
    name: "a port in one domain restating another domain's member",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nexport const port: Port = sessions;',
    findings: [{ messageId: "crossDomainShape", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a cross-domain signature that still names the owner's domain data",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { DropInput } from "../../sessions/contract/service.ts";\ninterface Port { readonly drop: (input: DropInput, signal: AbortSignal) => Promise<void>; }\nexport const port: Port = sessions;',
    findings: [{ messageId: "crossDomainData", data: { restating: "Port.drop", owner: "SessionsService.drop", types: "DropInput" } }],
  },
  {
    name: "a cross-domain signature that passes a db handle",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { StatementToken } from "../../../../../db/src/wiring.ts";\ninterface Port { readonly statement: (id: string) => StatementToken; }\nexport const port: Port = sessions;',
    findings: [{ messageId: "crossDomainDbHandle", data: { restating: "Port.statement", owner: "SessionsService.statement", handles: "StatementToken" } }],
  },
  {
    name: "a cross-domain db handle the ledger rules as a joint batch",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { StatementToken } from "../../../../../db/src/wiring.ts";\ninterface Port { readonly revokeAllForUserStatement: (id: string) => StatementToken; }\nexport const port: Port = sessions;',
    findings: [],
  },
  {
    name: "a ruled op the consumer names by its own alias",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { StatementToken } from "../../../../../db/src/wiring.ts";\ntype KickAllOp = (id: string) => StatementToken;\ninterface Port { readonly kickAll: KickAllOp; }\nexport const port: Port = { kickAll: sessions.revokeAllForUserStatement };',
    findings: [],
  },
  {
    name: "an owner verb over its own domain data that satisfies a consumer's split alias",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { RevokeInput } from "../../../../../contracts/src/sessions.ts";\ntype RegisterOp = (spec: RevokeInput & { readonly invoke: (signal?: AbortSignal) => Promise<void> }) => void;\ninterface Port { readonly register: RegisterOp; }\nexport const port: Port = sessions;',
    findings: [],
  },
  {
    name: "a split cross-domain signature: contracts data and a platform global",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { RevokeInput } from "../../../../../contracts/src/sessions.ts";\ninterface Port { readonly cancel: (input: RevokeInput, signal: AbortSignal) => Promise<void>; }\nexport const port: Port = sessions;',
    findings: [],
  },
  {
    name: "a split cross-domain signature: contracts data and an inference type",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\nimport type { RevokeInput } from "../../../../../contracts/src/sessions.ts";\nimport type { ResolveOutcome } from "../../../../../inference/src/resolve.ts";\ninterface Port { readonly resolve: (input: RevokeInput) => Promise<ResolveOutcome>; }\nexport const port: Port = sessions;',
    findings: [],
  },
  {
    name: "a port derived from its owner",
    file: SITE,
    source: `${IMPORTS}\ntype Port = Pick<SessionsService, "create" | "revoke">;\nexport const port: Port = sessions;`,
    findings: [],
  },
  {
    name: "a member derived by index",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: SessionsService["revoke"]; }\nexport const port: Port = { revoke: (token) => sessions.revoke(token) };`,
    findings: [],
  },
  {
    name: "a concept-free notification callback",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly onSettled: () => void; }\nexport const port: Port = sessions;`,
    findings: [],
  },
  {
    name: "a port that narrows the return but hand-copies the parameters",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly create: (userId: string) => Promise<{ token: string }>; }\nexport const port: Port = sessions;`,
    findings: [{ messageId: "copiedParameters", data: { restating: "Port.create", owner: "SessionsService.create" } }],
  },
  {
    name: "a port that derives the parameters and narrows only the return",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly create: (...args: Parameters<SessionsService["create"]>) => Promise<{ token: string }>; }\nexport const port: Port = sessions;`,
    findings: [],
  },
  {
    name: "a whole port restated by hand and wired by a spread",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nexport const port: Port = { ...sessions };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a spread into an argument literal",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\ndeclare function wire(port: Port): void;\nwire({ ...sessions });`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a cross-domain port restated behind a spread",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nexport const port: Port = { ...sessions };',
    findings: [{ messageId: "crossDomainShape", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a spread into a port derived from its owner",
    file: SITE,
    source: `${IMPORTS}\ntype Port = Pick<SessionsService, "create" | "revoke">;\nexport const port: Port = { ...sessions };`,
    findings: [],
  },
  {
    name: "a spread into a port whose member is derived by index",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: SessionsService["revoke"]; }\nexport const port: Port = { ...sessions };`,
    findings: [],
  },
  {
    name: "a member a later property overrides after the spread",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\ndeclare const other: (token: string) => Promise<void>;\nexport const port: Port = { ...sessions, revoke: other };`,
    findings: [],
  },
  {
    name: "a spread whose other member no later property overrides",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; readonly create: (userId: string) => Promise<{ token: string; expiresAt: number }>; }\ndeclare const other: (userId: string) => Promise<{ token: string; expiresAt: number }>;\nexport const port: Port = { ...sessions, create: other };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a spread nested in a literal property",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\ninterface Outer { readonly inner: Port; }\nexport const outer: Outer = { inner: { ...sessions } };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "two spreads of one owner",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nexport const port: Port = { ...sessions, ...sessions };`,
    findings: [{ messageId: "handRestated", data: { restating: "Port.revoke", owner: "SessionsService.revoke" } }],
  },
  {
    name: "a member a let hop carries to the port",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nlet hop: SessionsService["revoke"] = sessions.revoke;\nexport const port: Port = { revoke: (token) => hop(token) };`,
    findings: [],
  },
  {
    name: "a port whose own op is passed into a wider slot",
    file: SITE,
    source: `${IMPORTS}\ninterface Limits { readonly points: number | (() => number); }\ninterface Port { readonly limit: () => number; }\nexport declare const port: Port;\nexport const limits: Limits = { points: () => port.limit() };`,
    findings: [],
  },
  {
    name: "a local candidate type behind a generic constraint over contract rows",
    file: SITE,
    source:
      'import { rooms } from "../../../../contracts/src/rooms.ts";\ninterface Candidate { readonly id: string; readonly lastTurnAt: number | null }\nfunction split<Room extends Candidate>(items: readonly Room[]): Room | undefined {\n  return items[0];\n}\nexport const first = split(rooms);',
    findings: [{ messageId: "restatedFields", data: { local: "Candidate", fields: "id, lastTurnAt" } }],
  },
  {
    name: "a local type taking a contract value as a call argument",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\ntype Shown = { readonly id: string; readonly title: string };\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport const text = show(room);',
    findings: [{ messageId: "restatedFields", data: { local: "Shown", fields: "id, title" } }],
  },
  {
    name: "two calls of one restating local type",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\ninterface Shown { readonly id: string; readonly title: string }\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport const both = [show(room), show(room)];',
    findings: [{ messageId: "restatedFields", data: { local: "Shown", fields: "id, title" } }],
  },
  {
    name: "a local helper type inside a contract file",
    file: CROSS,
    source:
      'import { room } from "../../../../../contracts/src/rooms.ts";\ninterface Shown { readonly id: string; readonly title: string }\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "an exported look-alike of a contract type",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\nexport interface Shown { readonly id: string; readonly title: string }\nexport function show(value: Shown): string {\n  return value.title;\n}\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "a local type exported by name list",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\ninterface Shown { readonly id: string; readonly title: string }\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport { Shown };\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "a local type with a field the contract lacks",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\ninterface Shown { readonly id: string; readonly extra?: string }\nfunction show(value: Shown): string {\n  return value.id;\n}\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "a local type of one field",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\ninterface Shown { readonly id: string }\nfunction show(value: Shown): string {\n  return value.id;\n}\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "a local type fed a value that is not a contract type",
    file: SITE,
    source:
      "interface Shown { readonly id: string; readonly title: string }\ndeclare const row: { readonly id: string; readonly title: string; readonly ownerId: string };\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport const text = show(row);",
    findings: [],
  },
  {
    name: "a local type derived from the contract type",
    file: SITE,
    source:
      'import { room } from "../../../../contracts/src/rooms.ts";\nimport type { RoomSummary } from "../../../../contracts/src/rooms.ts";\ntype Shown = Pick<RoomSummary, "id" | "title">;\nfunction show(value: Shown): string {\n  return value.title;\n}\nexport const text = show(room);',
    findings: [],
  },
  {
    name: "a one-field local type that is the contract's whole shape",
    file: SITE,
    source:
      'import { reaped } from "../../../../contracts/src/chat.ts";\ninterface Count { readonly reaped: number }\nfunction show(value: Count): number {\n  return value.reaped;\n}\nexport const count = show(reaped);',
    findings: [{ messageId: "restatedFields", data: { local: "Count", fields: "reaped" } }],
  },
  {
    name: "a hand-written type argument the library binds to a procedure's output",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\nexport const useFork = createEntityMutation<inferInput<typeof trpc.chat.fork>, { readonly chatId: string; readonly title: string }>({ options: () => trpc.chat.fork.mutationOptions() });`,
    findings: [{ messageId: "restatedProcedure", data: { written: "This inline type", side: "output", procedure: "trpc.chat.fork", fields: "chatId, title" } }],
  },
  {
    name: "a one-field type argument that is a procedure's whole result",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\nexport const useReap = createEntityMutation<inferInput<typeof trpc.chat.reapHusks>, { readonly reaped: number }>({ options: () => trpc.chat.reapHusks.mutationOptions() });`,
    findings: [{ messageId: "restatedProcedure", data: { written: "This inline type", side: "output", procedure: "trpc.chat.reapHusks", fields: "reaped" } }],
  },
  {
    name: "an inline variables type that restates the procedure input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\nexport const useDuplicate = createEntityMutation<{ readonly chatId: string; readonly messageId: string }, void>({ options: () => trpc.chat.duplicate.mutationOptions() });`,
    findings: [
      { messageId: "restatedProcedure", data: { written: "This inline type", side: "input", procedure: "trpc.chat.duplicate", fields: "chatId, messageId" } },
    ],
  },
  {
    name: "a hand-written type argument on another generic that binds the procedure",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ndeclare function wrap<TVars, TData>(base: MutationOptions<TVars, TData>): MutationOptions<TVars, TData>;\nexport const options = wrap<{ readonly chatId: string; readonly messageId: string }, void>(trpc.chat.duplicate.mutationOptions());`,
    findings: [
      { messageId: "restatedProcedure", data: { written: "This inline type", side: "input", procedure: "trpc.chat.duplicate", fields: "chatId, messageId" } },
    ],
  },
  {
    name: "a vars interface that restates the input of the procedure it is sent to",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ninterface DuplicateVars { readonly chatId: string; readonly messageId: string }\nexport const useDuplicate = createEntityMutation<DuplicateVars, void>({ options: () => trpc.chat.duplicate.mutationOptions() });`,
    findings: [
      { messageId: "restatedProcedure", data: { written: "DuplicateVars", side: "input", procedure: "trpc.chat.duplicate", fields: "chatId, messageId" } },
    ],
  },
  {
    name: "a hand-written composite vars type mapped onto the procedure input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ninterface RuleActionVars { readonly ruleId: string; readonly chatId: string | null }\nexport const useDelete = createEntityMutation<RuleActionVars, void>({ options: () => withProcedureInput(trpc.chat.deleteRule.mutationOptions(), (vars: RuleActionVars) => ({ ruleId: vars.ruleId })) });`,
    findings: [{ messageId: "restatedProcedure", data: { written: "RuleActionVars", side: "input", procedure: "trpc.chat.deleteRule", fields: "ruleId" } }],
  },
  {
    name: "a client-only composite vars type that composes the procedure input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ntype RuleActionVars = inferInput<typeof trpc.chat.deleteRule> & { readonly chatId: string | null };\nexport const useDelete = createEntityMutation<RuleActionVars, void>({ options: () => withProcedureInput(trpc.chat.deleteRule.mutationOptions(), (vars: RuleActionVars) => ({ ruleId: vars.ruleId })) });`,
    findings: [],
  },
  {
    name: "a composite vars type that narrows a procedure input field",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ntype DuplicateVars = inferInput<typeof trpc.chat.duplicate> & { readonly chatId: "chat_1" };\nexport const useDuplicate = createEntityMutation<DuplicateVars, void>({ options: () => trpc.chat.duplicate.mutationOptions() });`,
    findings: [],
  },
  {
    name: "type arguments derived from the procedure and from its contracts type",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\nexport const useReap = createEntityMutation<inferInput<typeof trpc.chat.reapHusks>, inferOutput<typeof trpc.chat.reapHusks>>({ options: () => trpc.chat.reapHusks.mutationOptions() });\nexport const useReapAgain = createEntityMutation<inferInput<typeof trpc.chat.reapHusks>, ReapResult>({ options: () => trpc.chat.reapHusks.mutationOptions() });`,
    findings: [],
  },
  {
    name: "a one-field vars type picked from a wider procedure input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ninterface Toggle { readonly ruleId: string }\nexport const useEnable = createEntityMutation<Toggle, void>({ options: () => withProcedureInput(trpc.chat.setEnabled.mutationOptions(), (vars: Toggle) => ({ ...vars, enabled: true })) });`,
    findings: [],
  },
  {
    name: "a contracts type in the shape of a procedure's output",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\nimport type { ChatRef } from "../../../contracts/src/chat.ts";\nexport const useFork = createEntityMutation<inferInput<typeof trpc.chat.fork>, ChatRef>({ options: () => trpc.chat.fork.mutationOptions() });`,
    findings: [],
  },
  {
    name: "a vars type that types an open-record field and keeps the rest of the input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ntype SectionVars = Omit<inferInput<typeof trpc.chat.updateSection>, "patch"> & { readonly section: "theme"; readonly patch: { readonly accent?: string } };\nexport const useSection = createEntityMutation<SectionVars, void>({ options: () => trpc.chat.updateSection.mutationOptions() });`,
    findings: [],
  },
  {
    name: "a vars type that types an open-record field and hand-copies the rest of the input",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ninterface SectionVars { readonly section: "theme"; readonly patch: { readonly accent?: string } }\nexport const useSection = createEntityMutation<SectionVars, void>({ options: () => trpc.chat.updateSection.mutationOptions() });`,
    findings: [{ messageId: "restatedProcedure", data: { written: "SectionVars", side: "input", procedure: "trpc.chat.updateSection", fields: "section" } }],
  },
  {
    name: "a vars type with no procedure behind it",
    file: CLIENT,
    source: `${TRPC_IMPORTS}\ndeclare const local: () => MutationOptions<{ readonly chatId: string; readonly messageId: string }, void>;\nexport const useLocal = createEntityMutation<{ readonly chatId: string; readonly messageId: string }, void>({ options: local });`,
    findings: [],
  },
] as const)("derived-port-member judges $name", async ({ file, source, findings }, { plantedTree }) => {
  const root = await plantedTree({ ...OWNERS, ...TRPC_LIBRARY, [file]: source });
  const found = lint(root, file, source, derivedPortMemberRule).map(({ messageId, message }) => ({ messageId, message }));
  expect(found).toEqual(findings.map(reported));
});

// The cases above register the rule by hand to give it a planted program; this one takes the rule the production config
// registers under the name, so a name mapped to another rule fails the planted restatement.
test("the production config registers derived-port-member as an error on server compose files", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = join(import.meta.dirname, "../..");
  const config = await resolvedConfig(
    new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root }),
    join(root, "packages/server/src/entry/compose/chat.ts"),
  );
  expect(config.rules[RULE]).toEqual([2]);
  const registered = config.plugins["orb"]?.rules?.["derived-port-member"];
  if (registered === undefined) {
    throw new Error("The production config registers no orb/derived-port-member rule.");
  }
  const source = `${IMPORTS}\ninterface Port { readonly create: (userId: string) => Promise<{ token: string; expiresAt: number }>; }\nexport const deps: { sessions: Port } = { sessions };`;
  const planted = await plantedTree({ ...OWNERS, [SITE]: source });
  // The source rule's own finding on the plant is the expected value, so the registered rule must judge it the same.
  const expected = lint(planted, SITE, source, derivedPortMemberRule);
  expect(expected).toHaveLength(1);
  expect(lint(planted, SITE, source, registered)).toEqual(expected);
});

// A cross-domain signature's foreign types are classified by the package the program loaded each from: a store-linked
// drizzle outside every node_modules directory still hands over a db handle, and a workspace package exporting the same
// name hands over a runtime type, which leaves the consumer a split signature of its own.
const LINKED_SERVICE = "packages/server/src/domain/sessions/contract/linked-service.ts";
const LINKED_SITE = "packages/server/src/domain/admin/contract/linked-probe.ts";
const LINKED_FINDINGS: Readonly<Record<Link, readonly Reported[]>> = {
  workspace: [],
  dependency: [reported({ messageId: "crossDomainDbHandle", data: { restating: "Port.raw", owner: "LinkedService.raw", handles: "SQL" } })],
};

test.for(LINKS)("a cross-domain op returning SQL from a %s named drizzle-orm", async (link, { plantedTree }) => {
  const root = await plantLinked(
    plantedTree,
    link,
    { name: DRIZZLE_PACKAGE, files: { "index.d.ts": "export interface SQL {\n  readonly text: string;\n}" } },
    {
      [LINKED_SERVICE]: [
        `import type { SQL } from "${DRIZZLE_PACKAGE}";`,
        "export interface LinkedService {",
        "  raw: (id: string) => SQL;",
        "}",
        "export declare const linked: LinkedService;",
      ].join("\n"),
      [LINKED_SITE]: [
        'import { linked } from "../../sessions/contract/linked-service.ts";',
        `import type { SQL } from "${DRIZZLE_PACKAGE}";`,
        "interface Port {",
        "  readonly raw: (id: string) => SQL;",
        "}",
        "export const port: Port = linked;",
      ].join("\n"),
    },
  );
  const found = lintLinked(root, LINKED_SITE, { "derived-port-member": derivedPortMemberRule }, { files: [LINKED_SERVICE, LINKED_SITE] });
  expect(found.map(({ messageId, message }) => ({ messageId, message }))).toEqual(LINKED_FINDINGS[link]);
});
