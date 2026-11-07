// `orb/derived-port-member` refuses a port member whose hand-written function type is identical to the member flowing
// into it, names the higher-tier member as the restatement, and sends a cross-domain pair to packages/contracts.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { derivedPortMemberRule } from "../../tooling/src/eslint/derived-port.ts";
import { resolvedConfig } from "./_eslint-config.ts";

const RULE = "orb/derived-port-member";
const SERVICE = "packages/server/src/domain/sessions/contract/service.ts";
const CLOCK = "packages/kit/src/time/index.ts";
const SITE = "packages/server/src/entry/compose/probe.ts";
const CROSS = "packages/server/src/domain/admin/contract/probe.ts";

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
};

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

function reported({ messageId, data }: { readonly messageId: NonNullable<Reported["messageId"]>; readonly data: Readonly<Record<string, string>> }): Reported {
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
] as const)("derived-port-member judges $name", async ({ file, source, findings }, { plantedTree }) => {
  const root = await plantedTree({ ...OWNERS, [file]: source });
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
