import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { tanstackQueryProof, vendorLookalikeProof } from "../../../../tooling/src/verify/gates/_proof/client-vendors.ts";

const RULE = "orb/test-factory-contract";
const FACTORY = "tests/support/node/factories/example.ts";

test("native ambient policies preserve the complete clock/random founding and nearest-legal corpus", async ({ scratch, repoRoot }) => {
  const path = "packages/server/src/domain/feature/ambient.ts";
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, path));
  const cases = [
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-clock", "export const stamp=Date.now();", 1],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-clock", "export const stamp=new Date();", 1],
    ["no-raw-clock", "const clock=Date;export const stamp=clock.now();", 1],
    ["no-raw-clock", "export const stamp=Date['now']();", 1],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-clock", "export const a=Date.now(),b=Date.now();", 1],
    ["no-raw-clock", "const now=Date.now;export const stamp=now();", 1],
    ["no-raw-clock", "const {now}=Date;export const stamp=now();", 1],
    ["no-raw-clock", "const D=Date;export const stamp=new D();", 1],
    ["no-raw-clock", "declare function opaque():any;export const stamp=opaque().now();", 1],
    ["no-raw-clock", "class Session{};export const session=new Session();", 0],
    ["no-raw-clock", "export const stamp=new Date(0);", 0],
    ["no-raw-clock", "export const elapsed=(deps:{now:()=>number})=>deps.now();", 0],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-clock", "class Date{static now(){return 0;}}export const stamp=Date.now();", 0],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-clock", "declare const performance:{now:()=>number};export const stamp=performance.now();", 0],
    ["no-raw-clock", "let D=Date;D=Date;export const stamp=new D();", 0],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-random", "export const draw=Math.random();", 1],
    ["no-raw-random", "const rng=Math;export const draw=rng.random();", 1],
    ["no-raw-random", "export const draw=Math['random']();", 1],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-random", "export const a=Math.random(),b=Math.random();", 1],
    ["no-raw-random", "const random=Math.random;export const draw=random();", 1],
    ["no-raw-random", "const {random}=Math;export const draw=random();", 1],
    ["no-raw-random", "declare function opaque():any;export const draw=opaque().random();", 1],
    ["no-raw-random", "export const draw=(prng:()=>number)=>prng();", 0],
    // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
    ["no-raw-random", "const Math={random:()=>0};export const draw=Math.random();", 0],
    ["no-raw-random", "export const injected={prng:Math.random};", 0],
  ] as const;
  for (const [name, source, count] of cases) {
    const messages = lint([config, `orb/${name}`], source, join(scratch, path), { withLib: true });
    expect(messages, source).toHaveLength(count);
    expect(messages.filter((message) => message.message.includes("CANNOT be established"))).toHaveLength(source.includes("opaque") ? 1 : 0);
  }
  const eslint = new ESLint({ cwd: repoRoot });
  const tooling = await eslint.calculateConfigForFile(join(repoRoot, "tooling/src/example.ts"));
  expect(tooling.rules["orb/no-raw-random"]).toEqual([2]);
  expect(tooling.rules["orb/no-raw-clock"]).toBeUndefined();
  for (const name of ["no-raw-clock", "no-raw-random"]) {
    expect((await eslint.calculateConfigForFile(join(repoRoot, "packages/server/src/example.test.ts"))).rules[`orb/${name}`]).toBeUndefined();
  }
});

function lint(
  [config, rule]: readonly [Linter.Config, string],
  source: string,
  path: string,
  inputs: { readonly withLib?: boolean; readonly files?: Readonly<Record<string, string>> } = {},
): readonly Linter.LintMessage[] {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  for (const [file, content] of Object.entries(inputs.files ?? {})) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const program = ts.createProgram([path, ...Object.keys(inputs.files ?? {})], {
    noLib: inputs.withLib !== true,
    types: [],
    ...(inputs.withLib === true ? { lib: ["lib.es5.d.ts"] } : {}),
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.Preserve,
  });
  return new Linter({ cwd: dirname(path) }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true }, programs: [program], projectService: false } },
      ...(config.plugins === undefined ? {} : { plugins: config.plugins }),
      rules: { [rule]: config.rules?.[rule] ?? "off" },
      ...(config.linterOptions === undefined ? {} : { linterOptions: config.linterOptions }),
    },
    { filename: path },
  );
}

test("native factory contracts preserve name, native type display, exports and declared arrow limits", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, FACTORY));
  expect(config.rules[RULE]).toEqual([2]);
  const cases = [
    ["export declare function makeDeclared(db: unknown): void;", 1, "PURE builder accepts a db"],
    ["export function makeUser(db: unknown) { return db; }", 1, "PURE builder accepts a db"],
    ["export function seedUser() { return {}; }", 1, "PERSISTED builder has no `db` parameter"],
    ["interface Database {} export function makeNested(connection: Database) { return connection; }", 1, "PURE builder accepts a db"],
    ["export function makeUser() { return {}; }", 0, ""],
    ["export function seedUser(db: unknown) { return db; }", 0, ""],
    ["export const makeUser = (db: unknown) => db; export const seedUser = () => ({});", 0, ""],
    ["function makeUser(db: unknown) { return db; } export const unrelated = true;", 0, ""],
    ["function makeUser(db: unknown) { return db; } export { makeUser as build };", 1, "PURE builder accepts a db"],
    ["export default function makeUser(db: unknown) { return db; }", 1, "PURE builder accepts a db"],
    ["export namespace Factories { export function makeNested(db: unknown) { return db; } }", 1, "PURE builder accepts a db"],
    ["export function buildUser(db: unknown) { return db; }", 0, ""],
    ["export function makeUser(database: unknown) { return database; }", 0, ""],
    ["export function seedUser(database: unknown) { return database; }", 1, "PERSISTED builder has no `db` parameter"],
  ] as const;
  for (const [source, count, message] of cases) {
    const messages = lint([config, RULE], source, join(scratch, FACTORY));
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages).toMatchObject([{ ruleId: RULE, severity: 2, message: expect.stringContaining(message) }].slice(0, count));
  }
});

test("native factory scope preserves root, nested authored, and outside-population cases", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of [FACTORY, "tooling/src/example/tests/support/node/factories/nested.ts"]) {
    expect((await eslint.calculateConfigForFile(join(repoRoot, path))).rules[RULE], path).toEqual([2]);
  }
  for (const path of ["packages/client/src/features/x/lib/factories.ts", "tests/legacy/support/node/factories/example.ts"]) {
    expect((await eslint.calculateConfigForFile(join(repoRoot, path))).rules[RULE], path).toBeUndefined();
  }
});

const OPAQUE_RULE = "orb/no-opaque-test-fixture";
const FIXTURE = "tests/support/rpg.fixtures.ts";

test("native fixture outputs preserve exact unknown, aliases, inference, and non-unwrapped returns", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, FIXTURE));
  expect(config.rules[OPAQUE_RULE]).toEqual([2]);
  const cases = [
    ["export declare function makeDeclared(): unknown;", 1, "unknown"],
    ["export function makeGame(): unknown { return {}; }", 1, "unknown"],
    ["export const makeGame = (): unknown => ({});", 1, "unknown"],
    ["export const GAME: unknown = {};", 1, "unknown"],
    ["type Opaque = unknown; export function makeGame(): Opaque { return {}; }", 1, "Opaque"],
    ["export function makeGame() { return {} as unknown; }", 1, "makeGame"],
    ["export const makeGame = function (): unknown { return {}; };", 1, "unknown"],
    ["interface Game { readonly ruleset: string } export function makeGame(): Game { return { ruleset: 'd20' }; }", 0, ""],
    ["function localMake(): unknown { return {}; } export function makeGame(): string { return ''; }", 0, ""],
    ["export function narrow(input: unknown): string { return ''; }", 0, ""],
    ["export function makeGame(): any { return {}; }", 0, ""],
    ["interface Promise<T> { then: (fn: (value: T) => void) => void } export function makeGame(): Promise<unknown> { throw 'unavailable'; }", 0, ""],
    ["export function makeGame(): (unknown) { return {}; }", 0, ""],
  ] as const;
  for (const [source, count, token] of cases) {
    const messages = lint([config, OPAQUE_RULE], source, join(scratch, FIXTURE));
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages.map(({ ruleId, severity }) => ({ ruleId, severity }))).toEqual([{ ruleId: OPAQUE_RULE, severity: 2 }].slice(0, count));
    expect(messages.map(({ column, endColumn }) => source.slice(column - 1, (endColumn ?? column) - 1))).toEqual([token].slice(0, count));
  }
});

test("native declaration permissions retain line-local stale and wrong-rule failures", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, FIXTURE));
  expect(config.rules[OPAQUE_RULE]).toEqual([2]);
  const directive = `// eslint-disable-next-line ${OPAQUE_RULE} -- Intentional opaque parser-boundary output.\n`;
  const invalid = "export function makeGame(): unknown { return {}; }";
  expect(lint([config, OPAQUE_RULE], directive + invalid, join(scratch, FIXTURE))).toEqual([]);
  expect(lint([config, OPAQUE_RULE], `${directive}export function makeGame(): string { return ''; }`, join(scratch, FIXTURE))).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
  expect(lint([config, OPAQUE_RULE], `${directive + invalid}\n${invalid.replace("makeGame", "makeOther")}`, join(scratch, FIXTURE))).toMatchObject([
    { ruleId: OPAQUE_RULE },
  ]);
  expect(lint([config, OPAQUE_RULE], directive.replace(OPAQUE_RULE, `${OPAQUE_RULE}-wrong`) + invalid, join(scratch, FIXTURE))).toMatchObject([
    { ruleId: `${OPAQUE_RULE}-wrong` },
    { ruleId: OPAQUE_RULE },
  ]);
});

const CONTEXT_RULE = "orb/no-context-returntype";
const CONTEXT = "packages/client/src/features/chat/context.ts";

test("native context utility identity preserves ambient, local, imported and unreadable answers", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, CONTEXT));
  expect(config.rules[CONTEXT_RULE]).toEqual([2]);
  const cases = [
    ["declare function makeCtx(): { db: number }; export type Ctx = ReturnType<typeof makeCtx>;", 1, "hand-written interface"],
    [
      "declare function makeCtx(): { db: number }; export type Ctx = ReturnType<typeof makeCtx>; export type Aux = ReturnType<typeof makeCtx>;",
      2,
      "hand-written interface",
    ],
    ["export const value: unknown = ReturnType;", 1, "CANNOT be established"],
    ["export interface Ctx { db: number }", 0, ""],
    ["type ReturnType<F> = { reflected: F }; declare function makeCtx(): { db: number }; export type Ctx = ReturnType<typeof makeCtx>;", 0, ""],
    ['import type { ReturnType } from "./reflect.ts"; declare function makeCtx(): { db: number }; export type Ctx = ReturnType<typeof makeCtx>;', 0, ""],
    ['import type { Reflected } from "./alias.ts"; declare function makeCtx(): { db: number }; export type Ctx = Reflected<typeof makeCtx>;', 0, ""],
  ] as const;
  const path = join(scratch, CONTEXT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(join(dirname(path), "reflect.ts"), "export type ReturnType<F> = { reflected: F };");
  writeFileSync(join(dirname(path), "alias.ts"), "export type Reflected<F extends () => unknown> = ReturnType<F>;");
  for (const [source, count, message] of cases) {
    const messages = lint([config, CONTEXT_RULE], source, path, { withLib: true });
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages).toMatchObject(Array.from({ length: count }, () => ({ ruleId: CONTEXT_RULE, severity: 2, message: expect.stringContaining(message) })));
  }
});

const BRAND_RULE = "orb/brand-in-name-position";
const BRAND_SUBJECT = "packages/server/src/domain/chat/verbs/post.ts";
const BRAND_BASE =
  "declare const brand: unique symbol; export type Branded<B extends string> = string & { readonly [brand]: B }; export type TypeIdOf<P extends string> = Branded<P>; export type SandboxWireId<Id extends Branded<string>> = Id extends string ? string : never;";
const BRAND_IDS = 'import type { ChatId, SandboxWireId, SessionId } from "../../../../../kit/src/ids/index";';

test("native signature brands derive canonical declarations and preserve exact signature and syntax limits", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, BRAND_SUBJECT));
  expect(config.rules[BRAND_RULE]).toEqual([2]);
  const ids = join(scratch, "packages/kit/src/ids/index.ts");
  const cases = [
    ["export function post(chatId: string): void {}", 1],
    ["export interface Row { readonly chatId: string | null; }", 1],
    ["export class Row { chatId!: (string | undefined); }", 1],
    ["export function post(sessionToken: string): void {}", 1],
    ["export function post(chatId: string, sessionId: string): void {}", 2],
    ["export function post(chatId: ChatId): void {}", 0],
    ["export function post(fromChatId: string, ownerId: string): void {}", 0],
    ["export function post(): void { const chatId: string = 'x'; }", 0],
    ["export function post(chatId: string | number): void {}", 0],
    ["export function post(roomId: string): void {}", 0],
    ['export interface Row { readonly "chatId": string; }', 0],
    ["export type chatId = string;", 0],
    ['type Branded<B> = string & { readonly localBrand: B }; type RoomId = Branded<"RoomId">; export function post(roomId: string): void {}', 0],
    ["type Text = string; export function post(chatId: Text): void {}", 1],
    ["type Text = string | null; export interface Row { readonly chatId: Text; }", 1],
    ["type Inner = string; type Outer = Inner; export function post(chatId: Outer | undefined): void {}", 1],
    ["type Loose<T> = string; export function post(chatId: Loose<number>): void {}", 1],
    ['import type { Text } from "../text"; export function post(chatId: Text): void {}', 1],
    ["type Maybe<T> = T | null; export function post(chatId: Maybe<number>): void {}", 0],
    ["type SandboxWireId<T> = string; export function post(chatId: SandboxWireId<ChatId>): void {}", 1],
    [`${BRAND_IDS} export function post(chatId: SandboxWireId<ChatId>): void {}`, 0],
    [`${BRAND_IDS} export interface Row { readonly chatId: SandboxWireId<ChatId> | null; }`, 0],
    [`${BRAND_IDS} type Wire = SandboxWireId<ChatId>; export function post(chatId: Wire): void {}`, 0],
    [`${BRAND_IDS} export function post(chatId: SandboxWireId<SessionId>): void {}`, 1],
    [`${BRAND_IDS} export function post(chatId: SandboxWireId<ChatId> | string): void {}`, 1],
    [`${BRAND_IDS} export function post(handle: SandboxWireId<ChatId>): void {}`, 0],
  ] as const;
  for (const [source, count] of cases) {
    const messages = lint([config, BRAND_RULE], source, join(scratch, BRAND_SUBJECT), {
      files: {
        [ids]:
          BRAND_BASE +
          'export type ChatId = TypeIdOf<"chat">; export type SessionId = TypeIdOf<"session">; export type SessionToken = Branded<"SessionToken">;',
        [join(scratch, "packages/server/src/domain/chat/text.ts")]: "export type Text = string;",
      },
    });
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: count }, () => BRAND_RULE));
  }
  const wireMismatch = lint([config, BRAND_RULE], `${BRAND_IDS} export function post(chatId: SandboxWireId<SessionId>): void {}`, join(scratch, BRAND_SUBJECT));
  expect(wireMismatch).toMatchObject([{ message: expect.stringContaining("carries SandboxWireId<SessionId>, but canonical ChatId") }]);
  expect(() => lint([config, BRAND_RULE], "export function post(chatId: string): void {}", join(scratch, BRAND_SUBJECT))).toThrow(
    "canonical brand vocabulary is absent",
  );
  const unwired = `${BRAND_BASE.replace(/ export type SandboxWireId.*$/u, "")} export type ChatId = TypeIdOf<"chat">;`;
  expect(() =>
    lint([config, BRAND_RULE], "export function post(chatId: string): void {}", join(scratch, BRAND_SUBJECT), { files: { [ids]: unwired } }),
  ).toThrow("declares no SandboxWireId");
});

const QUERY_SURFACE = "packages/client/src/features/example/surfaces/example.tsx";
const QUERY_RULES = ["orb/no-inline-invalidate-outside-seam", "orb/client-cache-surgery-only-in-data", "orb/no-inline-optimistic-in-surface"] as const;
const QUERY_RULE_INDEX = {
  [QUERY_RULES[0]]: 0,
  [QUERY_RULES[1]]: 1,
  [QUERY_RULES[2]]: 2,
} as const satisfies Record<(typeof QUERY_RULES)[number], number>;

test("native query seams preserve package identity, every founding catch, casts, unreadable receivers and computed-key limits", async ({
  scratch,
  repoRoot,
}) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const fixture = { ...tanstackQueryProof(), ...vendorLookalikeProof() };
  const files = Object.fromEntries(Object.entries(fixture).map(([path, source]) => [join(scratch, path), source]));
  const imported = 'import { useQueryClient } from "@tanstack/react-query";';
  const cases = [
    [`${imported}export function run() { useQueryClient().invalidateQueries(); }`, [1, 1, 0], false],
    [`${imported}export function run() { useQueryClient()["invalidateQueries"](); }`, [1, 1, 0], false],
    [`${imported}export function run() { (useQueryClient() as { invalidateQueries(): void }).invalidateQueries(); }`, [1, 1, 0], false],
    [`${imported}export function run() { const client = useQueryClient(); client.setQueryData(['k'], 1); }`, [0, 1, 1], false],
    [`${imported}export function run() { const client = useQueryClient(); client.cancelQueries(); client.setQueryData(['k'], 1); }`, [0, 2, 2], false],
    [`${imported}export function run() { useQueryClient()["setQueryData"](["k"], 1); }`, [0, 1, 1], false],
    [
      `${imported}export function run() { (useQueryClient() as { setQueryData(key: unknown, value: unknown): void }).setQueryData(['k'], 1); }`,
      [0, 1, 1],
      false,
    ],
    ["declare function opaque(): any; export function run() { opaque().invalidateQueries(); opaque().setQueryData(['k'], 1); }", [1, 2, 1], true],
    [
      "interface Local { invalidateQueries(): void; setQueryData(key: string, value: unknown): void } export function run(client: Local) { client.invalidateQueries(); client.setQueryData('k', 1); }",
      [0, 0, 0],
      false,
    ],
    [
      'import { useQueryClient } from "vendor-lookalike"; export function run() { useQueryClient().invalidateQueries(); useQueryClient().setQueryData("k", 1); }',
      [0, 0, 0],
      false,
    ],
    [`${imported}export const handle = () => useQueryClient().invalidateQueries;`, [0, 0, 0], false],
    [`${imported}export function run() { const client = useQueryClient(); client.setQueryData(['a'], 1); client.setQueryData(['b'], 2); }`, [0, 1, 2], false],
    [`${imported}const setQueryData = 'not-a-key'; export function run() { useQueryClient()[setQueryData](['k'], 1); }`, [0, 0, 0], false],
    [`${imported}export function run() { useQueryClient().getQueryDataSafely?.(); }`, [0, 0, 0], false],
    [
      imported +
        "export function run() { const a = useQueryClient() as { setQueryData(key: unknown, value: unknown): void }; const b = a; const c = b; const d = c; d.setQueryData(['k'], 1); }",
      [0, 1, 1],
      false,
    ],
    [
      imported +
        "export function run() { const a = useQueryClient() as { setQueryData(key: unknown, value: unknown): void }; const b = a; const c = b; const d = c; const e = d; e.setQueryData(['k'], 1); }",
      [0, 0, 0],
      false,
    ],
  ] as const;
  for (const rule of QUERY_RULES) {
    const index = QUERY_RULE_INDEX[rule];
    const config = await eslint.calculateConfigForFile(join(repoRoot, QUERY_SURFACE));
    expect(config.rules[rule], rule).toEqual([2]);
    for (const [source, counts, unreadable] of cases) {
      const messages = lint([config, rule], source, join(scratch, QUERY_SURFACE), { files });
      expect(
        messages.filter(({ fatal }) => fatal),
        source,
      ).toEqual([]);
      expect(messages, rule + source).toHaveLength(counts[index]);
      expect(messages.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: counts[index] }, () => rule));
      expect(messages.map(({ message }) => message.includes("CANNOT be established"))).toEqual(Array.from({ length: counts[index] }, () => unreadable));
    }
  }
});

test("native query populations and operation-grain reporting preserve the sanctioned-subject distinction", async ({ scratch, repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/client/src/data/invalidation.ts", "packages/client/src/data/new-seam.ts"]) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(QUERY_RULES.slice(0, 2).map((ruleId) => config.rules[ruleId])).toEqual([[2], [2]]);
  }
  expect(
    (await eslint.calculateConfigForFile(join(repoRoot, "packages/client/src/features/example/hooks/use-thing.ts"))).rules[QUERY_RULES[2]],
  ).toBeUndefined();
  expect((await eslint.calculateConfigForFile(join(repoRoot, QUERY_SURFACE.replace(".tsx", ".test.tsx")))).rules[QUERY_RULES[1]]).toBeUndefined();
  const rule = QUERY_RULES[1];
  const config = await eslint.calculateConfigForFile(join(repoRoot, QUERY_SURFACE));
  const files = Object.fromEntries(Object.entries(tanstackQueryProof()).map(([path, content]) => [join(scratch, path), content]));
  const source =
    'import { useQueryClient } from "@tanstack/react-query";\nconst client = useQueryClient();\nclient.setQueryData(["a"], 1);\nclient.setQueryData(["b"], 2);';
  expect(lint([config, rule], source, join(scratch, QUERY_SURFACE), { files })).toMatchObject([{ message: expect.stringContaining("Line(s): 3, 4.") }]);
});

const PORTAL_RULE = "orb/baseui-portal-container-seam";
const PORTAL_SUBJECT = "packages/ui/src/primitives/dialog/probe-dialog.tsx";

test("native Base UI portals retain both dead-seam arms and direct owning-parameter wiring", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, PORTAL_SUBJECT));
  expect(config.rules[PORTAL_RULE]).toEqual([2]);
  const prefix = 'import { Dialog as BaseDialog } from "@base-ui/react/dialog";';
  const prop = "interface Props { container?: unknown }";
  const cases = [
    [
      "interface Props { className?: string } export const P = (_props: Props) => <BaseDialog.Portal><BaseDialog.Popup /></BaseDialog.Portal>;",
      1,
      "accepts no `container` prop at all",
      "BaseDialog.Portal",
    ],
    [`${prop}export const P = (_props: Props) => <BaseDialog.Portal><BaseDialog.Popup /></BaseDialog.Portal>;`, 1, "does not consume it", "BaseDialog.Portal"],
    [`${prop}export const P = (_props: Props) => <BaseDialog.Portal container={document.body} />;`, 1, "does not consume it", "container"],
    [
      `${prop}export const P = ({container}: Props) => <BaseDialog.Portal container={container} />; export const Q = (_props: Props) => <BaseDialog.Portal />;`,
      1,
      "does not consume it",
      "BaseDialog.Portal",
    ],
    [`${prop}export const P = ({container}: Props) => <BaseDialog.Portal container={undefined} />;`, 1, "does not consume it", "container"],
    [
      `${prop}const portalContainer = null; export const P = (_props: Props) => <BaseDialog.Portal container={portalContainer} />;`,
      1,
      "does not consume it",
      "container",
    ],
    [`${prop}export const P = ({container}: Props) => <BaseDialog.Portal container={container} />;`, 0, "", ""],
    [`${prop}export const P = (props: Props) => <BaseDialog.Portal container={props.container} />;`, 0, "", ""],
    [`${prop}export const P = (props: Props) => { const {container} = props; return <BaseDialog.Portal container={container} />; };`, 0, "", ""],
    [`${prop}export const P = ({container}: Props) => <BaseDialog.Portal container={container ?? null} />;`, 0, "", ""],
    [`${prop}export const P = ({container}: Props) => <BaseDialog.Portal container={container ?? document.body} />;`, 1, "does not consume it", "container"],
    [
      `${prop}export const P = ({container}: Props) => { const target = container; return <BaseDialog.Portal container={target} />; };`,
      1,
      "does not consume it",
      "container",
    ],
    [
      `${prop}export const P = ({container}: Props) => { return function inner() { return <BaseDialog.Portal container={container} />; }; };`,
      1,
      "accepts no `container` prop at all",
      "BaseDialog.Portal",
    ],
    ["export const P = () => <div />;", 0, "", ""],
  ] as const;
  for (const [source, count, message, token] of cases) {
    const input = prefix + source;
    const messages = lint([config, PORTAL_RULE], input, join(scratch, PORTAL_SUBJECT));
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages).toMatchObject(Array.from({ length: count }, () => ({ ruleId: PORTAL_RULE, message: expect.stringContaining(message) })));
    expect(messages.map(({ column, endColumn }) => input.slice(column - 1, (endColumn ?? column) - 1))).toEqual([token].slice(0, count));
  }
  const typeOnly = 'import type { Dialog as BaseDialog } from "@base-ui/react/dialog"; export const P = () => <BaseDialog.Portal />;';
  expect(lint([config, PORTAL_RULE], typeOnly, join(scratch, PORTAL_SUBJECT))).toEqual([]);
  expect(
    lint([config, PORTAL_RULE], "const BaseDialog = {Portal: () => null}; export const P = () => <BaseDialog.Portal />;", join(scratch, PORTAL_SUBJECT)),
  ).toEqual([]);
  expect((await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, QUERY_SURFACE))).rules[PORTAL_RULE]).toBeUndefined();
});

test("typed native movement retains generated owner routing and refuses missing parser Programs", async ({ scratch, repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/client/src/features/example/surfaces/example.gen.ts", "packages/ui/src/primitives/dialog/example.gen.tsx"]) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.languageOptions.parserOptions.projectService, path).toBe(true);
    expect(config.linterOptions.reportUnusedDisableDirectives, path).toBe(2);
  }
  const fixtureConfig = await eslint.calculateConfigForFile(join(repoRoot, "tests/support/example.fixtures.gen.ts"));
  expect(fixtureConfig.languageOptions.parserOptions.projectService).toBe(false);
  expect(fixtureConfig.languageOptions.parserOptions.project).toEqual(["tsconfig.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"]);
  const config = await eslint.calculateConfigForFile(join(repoRoot, FIXTURE));
  expect(() =>
    new Linter({ cwd: scratch }).verify(
      "export function makeGame(): unknown { return {}; }",
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser },
        plugins: config.plugins,
        rules: { [OPAQUE_RULE]: "error" },
      },
      { filename: "example.ts" },
    ),
  ).toThrow("owning TypeScript Program");
});

test("native brand permissions remain occurrence-local after the required multiline parameter migration", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, BRAND_SUBJECT));
  const files = {
    [join(scratch, "packages/kit/src/ids/index.ts")]: `${BRAND_BASE}export type ChatId = TypeIdOf<"chat">; export type SessionId = TypeIdOf<"session">;`,
  };
  const source = `export function record(\n  chatId: string,\n  // eslint-disable-next-line ${BRAND_RULE} -- The SDK owns this foreign session id; ends if it becomes an Orb row.\n  sessionId: string,\n): void {}`;
  expect(lint([config, BRAND_RULE], source, join(scratch, BRAND_SUBJECT), { files })).toMatchObject([
    { ruleId: BRAND_RULE, line: 2, message: expect.stringContaining("canonical ChatId") },
  ]);
  const stale = source.replace("sessionId: string", "sessionId: SessionId");
  expect(lint([config, BRAND_RULE], stale, join(scratch, BRAND_SUBJECT), { files })).toMatchObject([
    { ruleId: BRAND_RULE },
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test("native ordinary permissions preserve correct, stale, wrong-rule and adjacent occurrence controls", async ({ scratch, repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const queryFiles = Object.fromEntries(Object.entries(tanstackQueryProof()).map(([path, content]) => [join(scratch, path), content]));
  const cases = [
    [
      RULE,
      FACTORY,
      "",
      "export function makeUser(db: unknown) { return db; }",
      "export function makeUser() { return {}; }",
      "export function makeOther(db: unknown) { return db; }",
    ],
    [
      CONTEXT_RULE,
      CONTEXT,
      "declare function makeCtx(): {db: number};\n",
      "export type Ctx = ReturnType<typeof makeCtx>;",
      "export interface Ctx {db: number}",
      "export type Other = ReturnType<typeof makeCtx>;",
    ],
    [
      PORTAL_RULE,
      PORTAL_SUBJECT,
      'import {Dialog as BaseDialog} from "@base-ui/react/dialog";\n',
      "export const P = () => <BaseDialog.Portal />;",
      "export const P = () => <div />;",
      "export const Q = () => <BaseDialog.Portal />;",
    ],
    [
      QUERY_RULES[2],
      QUERY_SURFACE,
      'import {useQueryClient} from "@tanstack/react-query";\n',
      "export const run = () => useQueryClient().setQueryData(['k'], 1);",
      "export const run = () => null;",
      "export const other = () => useQueryClient().setQueryData(['k'], 1);",
    ],
    [
      "orb/no-interactive-role-in-features",
      "packages/client/src/features/demo/thing.tsx",
      "",
      'export const G = <Row role="button" />;',
      'export const G = <Row role="list" />;',
      'export const Other = <Row role="button" />;',
    ],
    [
      "orb/no-multiplexed-mutation-error",
      "packages/client/src/features/example/errors.tsx",
      'import type {EntityMutationResult} from "../../data/create-entity-mutation";\n',
      "export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.error??b.error;",
      "export const g=(a:EntityMutationResult)=>a.error;",
      "export const other=(a:EntityMutationResult,b:EntityMutationResult)=>a.error??b.error;",
    ],
  ] as const;
  for (const [rule, path, prefix, invalid, valid, adjacent] of cases) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    const directive = `// eslint-disable-next-line ${rule} -- The proof's exact deliberate occurrence; ends when this defect is removed.\n`;
    const options = {
      withLib: rule === CONTEXT_RULE,
      files: rule === "orb/no-multiplexed-mutation-error" ? { [join(scratch, MUTATION_HOME)]: MUTATION_TYPE } : queryFiles,
    };
    expect(lint([config, rule], prefix + directive + invalid, join(scratch, path), options), rule).toEqual([]);
    expect(lint([config, rule], prefix + directive + valid, join(scratch, path), options), rule).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
    expect(lint([config, rule], `${prefix + directive + invalid}\n${adjacent}`, join(scratch, path), options), rule).toMatchObject([{ ruleId: rule }]);
    expect(lint([config, rule], prefix + directive.replace(rule, `${rule}-wrong`) + invalid, join(scratch, path), options), rule).toMatchObject([
      { ruleId: `${rule}-wrong` },
      { ruleId: rule },
    ]);
  }
});

test("native reviewed-operation permission licenses its operation without licensing the adjacent different operation", async ({ scratch, repoRoot }) => {
  const rule = QUERY_RULES[1];
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, QUERY_SURFACE));
  const files = Object.fromEntries(Object.entries(tanstackQueryProof()).map(([path, content]) => [join(scratch, path), content]));
  const source = `import {useQueryClient} from "@tanstack/react-query";\nconst client = useQueryClient();\n// eslint-disable-next-line ${rule} -- The seam's optimistic cache write; ends when the write is removed.\nclient.setQueryData(['k'], 1);\nclient.setQueryData(['other'], 2);\nclient.cancelQueries();`;
  expect(lint([config, rule], source, join(scratch, QUERY_SURFACE), { files })).toMatchObject([
    { ruleId: rule, line: 6, message: expect.stringContaining("cancelQueries") },
  ]);
});

const ROLE_RULE = "orb/no-interactive-role-in-features";
const ROLE_SUBJECT = "packages/client/src/features/demo/thing.tsx";

test("native feature roles retain authored aliases and conditional literals without accusing dynamic literal-typed props", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, ROLE_SUBJECT));
  expect(config.rules[ROLE_RULE]).toEqual([2]);
  const cases = [
    ['export const G = <Row role="button" tabIndex={0} />;', 1],
    ['export const G = <Row role={"checkbox"} />;', 1],
    ['const ROLE="button"; export const G = <Row role={ROLE} />;', 1],
    ['const A="button", B=A, C=B, D=C, E=D, F=E; export const G=<Row role={F}/>;', 1],
    ['const ROLE="button"; export function G(ROLE:string) { return <Row role={ROLE}/>; }', 0],
    ['export const G = <Row role={cond ? "button" : undefined} />;', 1],
    ...["menuitem", "tab", "slider", "treeitem", "gridcell"].map((role) => [`export const G = <Row role="${role}" />;`, 1] as const),
    ['export const G = <div role="list" />;', 0],
    ['export const G = <div role="img" />;', 0],
    ["export const G = (props:{role?:string}) => <Row role={props.role} />;", 0],
    ['export const G = (props:{role:"button"}) => <Row role={props.role} />;', 0],
    ['export const G = <div data-role="button" />;', 0],
    ['export const G = <Row role={<Child label="button" />} />;', 0],
    ['let ROLE="button"; export const G = <Row role={ROLE} />;', 0],
    ['const ROLE="button"; ROLE="link"; export const G = <Row role={ROLE} />;', 0],
  ] as const;
  for (const [source, count] of cases) {
    const messages = lint([config, ROLE_RULE], source, join(scratch, ROLE_SUBJECT));
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: count }, () => ROLE_RULE));
  }
  const files = { [join(scratch, "packages/client/src/features/demo/role.ts")]: 'export const ROLE="button";' };
  expect(
    lint([config, ROLE_RULE], 'import {ROLE as role} from "./role"; export const G=<Row role={role} />;', join(scratch, ROLE_SUBJECT), { files }),
  ).toMatchObject([{ ruleId: ROLE_RULE }]);
  expect(
    (await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, "packages/ui/src/primitives/list-row/list-row.tsx"))).rules[ROLE_RULE],
  ).toBeUndefined();
});

test("typed native rows preserve D320 legacy exclusion without excluding strict test subjects", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of [
    "tests/legacy/support/fixtures.ts",
    "tests/legacy/features/demo/context.ts",
    "tests/legacy/example/tests/support/node/factories/example.ts",
  ]) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(
      [RULE, OPAQUE_RULE, CONTEXT_RULE, BRAND_RULE, QUERY_RULES[2]].map((rule) => config.rules[rule]),
      path,
    ).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(config.languageOptions.parserOptions.projectService, path).toBe(false);
  }
  const strict = await eslint.calculateConfigForFile(join(repoRoot, FIXTURE));
  expect(strict.rules[OPAQUE_RULE]).toEqual([2]);
  expect(strict.languageOptions.parserOptions.project).toEqual(["tsconfig.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"]);
});

const MUTATION_RULE = "orb/no-multiplexed-mutation-error";
const MUTATION_HOME = "packages/client/src/data/create-entity-mutation.ts";
const MUTATION_SUBJECT = "packages/client/src/features/example/errors.tsx";
const MUTATION_TYPE = "export interface EntityMutationResult { readonly error: unknown; readonly clearError: () => void }";

test("native mutation errors retain both sticky homes, both operands, aliases, foreign types and unreadable outcomes", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, MUTATION_SUBJECT));
  expect(config.rules[MUTATION_RULE]).toEqual([2]);
  const prefix = 'import type {EntityMutationResult} from "../../data/create-entity-mutation";';
  const cases = [
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.error??b.error;`, 1, false],
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.error||b.error;`, 1, false],
    [
      'import type {MutationObserverResult} from "@tanstack/react-query"; export const g=(a:MutationObserverResult,b:MutationObserverResult)=>a.error??b.error;',
      1,
      false,
    ],
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a["error"]??b["error"];`, 1, false],
    ["declare const a:any; declare const b:any; export const g=a.error??b.error;", 1, true],
    [`${prefix}export const g=(a:EntityMutationResult)=>a.error;`, 0, false],
    ["interface Row {error:string|null} export const g=(a:Row,b:Row)=>a.error??b.error;", 0, false],
    [
      'import type {MutationObserverResult} from "vendor-lookalike"; export const g=(a:{error:unknown},b:{error:unknown})=>a.error??b.error;export type Unused=MutationObserverResult;',
      0,
      false,
    ],
    [`${prefix}interface Row {error:string|null} export const g=(a:EntityMutationResult,b:Row)=>a.error??b.error;`, 0, false],
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.error&&b.error;`, 0, false],
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.clearError??b.clearError;`, 0, false],
    [`${prefix}const KEY="error";export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a[KEY]??b[KEY];`, 1, false],
    [`${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>(a as {error:unknown}).error??b.error;`, 0, false],
  ] as const;
  const files = Object.fromEntries(
    Object.entries({ ...tanstackQueryProof(), ...vendorLookalikeProof(), [MUTATION_HOME]: MUTATION_TYPE }).map(([path, content]) => [
      join(scratch, path),
      content,
    ]),
  );
  for (const [source, count, unreadable] of cases) {
    const messages = lint([config, MUTATION_RULE], source, join(scratch, MUTATION_SUBJECT), { files });
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    expect(messages, source).toHaveLength(count);
    expect(messages.map(({ message }) => message.includes("CANNOT be established"))).toEqual(Array.from({ length: count }, () => unreadable));
  }
  expect(() => lint([config, MUTATION_RULE], "export const unrelated=1;", join(scratch, MUTATION_SUBJECT))).toThrow("EntityMutationResult home/export");
  const missing = { [join(scratch, MUTATION_HOME)]: "export interface Renamed {readonly error:unknown}" };
  expect(() =>
    lint(
      [config, MUTATION_RULE],
      `${prefix}export const g=(a:EntityMutationResult,b:EntityMutationResult)=>a.error??b.error;`,
      join(scratch, MUTATION_SUBJECT),
      { files: missing },
    ),
  ).toThrow("EntityMutationResult home/export");
  expect(
    (await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, MUTATION_SUBJECT.replace(".tsx", ".test.tsx")))).rules[MUTATION_RULE],
  ).toBeUndefined();
});
