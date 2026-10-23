// D1/D40/D19: the effective native lint and import rules own Principal construction and engine blindness.
// @subject packages/server/src/entry/auth/principal-mint.ts
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../..");
const ordinary = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
const SERVER = "packages/server/src";
const VERB = `${SERVER}/domain/chat/verbs/principal-probe.ts`;
const ENGINE = `${SERVER}/domain/chat/engine/principal-probe.ts`;
const MINT = `${SERVER}/entry/auth/principal-mint.ts`;
const SEAM = `${SERVER}/entry/auth/seam.ts`;
const BRIDGE = `${SERVER}/entry/compose/chat.ts`;
const ASSERTION = "orb/principal-assertion";
const RETURN = "orb/principal-return-site";
const SYNTHETIC = "orb/principal-synthetic-role";
const LITERAL = "orb/principal-literal";
const MINT_SITE = "orb/principal-mint-site";
const BLIND = "orb/turn-identity-principal";
const LAUNDER = "orb/principal-brand-launder";
const ALIAS = "orb/principal-alias";
const PRINCIPAL_RULES = [ASSERTION, RETURN, SYNTHETIC, LITERAL, MINT_SITE, LAUNDER, ALIAS];
const IDENTITY = 'from "@orb/contracts/identity"';
// The first config resolution loads the whole flat config; pay it at import, not inside the first row's timeout.
await ordinary.calculateConfigForFile(join(ROOT, VERB));

/** Runs one configured rule without building a TypeScript program for the deliberately invalid snippets. */
async function findings(path: string, source: string, ruleId: string): Promise<readonly (string | null)[]> {
  const config = await ordinary.calculateConfigForFile(join(ROOT, path));
  const rule = config.rules[ruleId];
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: rule === undefined ? {} : { [ruleId]: rule },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.map(({ ruleId: id }) => id);
}

const SHAPE = '{ userId: id, role: "user", handle: id, externalId: null, via: "fallback" }';

test.for([
  { name: "asserted unknown row", rule: ASSERTION, source: "export const mint = (row: unknown) => row as Principal;", count: 1 },
  { name: "angle assertion", rule: ASSERTION, source: "export const mint = (row: unknown) => <Principal>row;", count: 1 },
  { name: "double assertion", rule: ASSERTION, source: "export const mint = (row: object) => row as unknown as Principal;", count: 1 },
  { name: "namespace assertion", rule: ASSERTION, source: "export const mint = (row: unknown) => row as identity.Principal;", count: 1 },
  { name: "inference assertion", rule: ASSERTION, path: "packages/inference/src/principal-probe.ts", source: "export const p = {} as Principal;", count: 1 },
  { name: "the mint home", rule: ASSERTION, path: MINT, source: "export const mintPrincipal = (fields: object) => fields as Principal;", count: 0 },
  {
    name: "a second cast beside the constructor",
    rule: ASSERTION,
    path: MINT,
    source: "export function mintPrincipal(fields: object) { return fields as Principal; }\nexport const forgeAny = (row: unknown) => row as Principal;",
    count: 1,
  },
  {
    name: "an assertion in the request seam",
    rule: ASSERTION,
    path: SEAM,
    source: "function principalFromRow(row: unknown) { return row as Principal; }",
    count: 1,
  },
  {
    name: "annotations name without minting",
    rule: ASSERTION,
    source: "export function use(caller: Principal, other: Principal | null): Principal[] { return other === null ? [caller] : [caller, other]; }",
    count: 0,
  },
  { name: "lookalike type", rule: ASSERTION, source: "export const p = {} as PrincipalFields;", count: 0 },
  { name: "asserted collection", rule: ASSERTION, source: "export const first = (rows: unknown) => { const [p] = rows as Principal[]; return p; };", count: 1 },
  { name: "asserted nullable", rule: ASSERTION, source: "export const one = (row: unknown) => { const p = row as Principal | null; return p; };", count: 1 },
  { name: "asserted readonly list", rule: ASSERTION, source: "export const all = (rows: unknown) => rows as readonly identity.Principal[];", count: 1 },
  { name: "asserted generic wrapper", rule: ASSERTION, source: "export const later = (row: unknown) => row as Promise<Principal>;", count: 1 },
  { name: "satisfied spread", rule: ASSERTION, source: 'export const p = (base: any) => ({ ...base, role: "user" }) satisfies Principal;', count: 1 },
  {
    name: "Principal inside an assertion's operand",
    rule: ASSERTION,
    source: "export const read = ((fn: (p: Principal) => string) => fn) as Reader;",
    count: 0,
  },
  { name: "const assertion", rule: ASSERTION, source: 'export const roles = ["user"] as const;', count: 0 },
  { name: "any-spread binding", rule: LITERAL, source: 'declare const base: any; export const p: Principal = { ...base, role: "user" };', count: 1 },
  { name: "namespace binding", rule: LITERAL, source: "export const p = (base: any) => { let q: identity.Principal = { ...base }; return q; };", count: 1 },
  {
    name: "asserted literal binding",
    rule: LITERAL,
    source: "export const p = (base: any) => { const q: Principal = { ...base } as Caller; return q; };",
    count: 1,
  },
  { name: "parameter default", rule: LITERAL, source: "export function use(base: any, p: Principal = { ...base }) { return p; }", count: 1 },
  {
    name: "class field",
    rule: LITERAL,
    source: "export class Holder { constructor(private readonly base: any) {} p: Principal = { ...this.base }; }",
    count: 1,
  },
  {
    name: "literal returned in the request seam",
    rule: LITERAL,
    path: `${SERVER}/entry/auth/seam.ts`,
    source: 'function mint(base: any, cookie: boolean): Principal { if (cookie) { return { ...base, via: "cookie" }; } return { ...base }; }',
    count: 2,
  },
  {
    name: "arrow body in the host bridge",
    rule: LITERAL,
    path: `${SERVER}/entry/compose/chat.ts`,
    source: "const host = (base: any): Principal => ({ ...base });",
    count: 1,
  },
  {
    name: "inference binding",
    rule: LITERAL,
    path: "packages/inference/src/principal-probe.ts",
    source: "export const p = (base: any) => { const q: Principal = { ...base }; return q; };",
    count: 1,
  },
  {
    name: "intersection graft",
    rule: LITERAL,
    source: "export const forge = (caller: Principal, victim: string) => Object.assign({}, caller, { userId: victim });",
    count: 1,
  },
  { name: "computed graft", rule: LITERAL, source: 'export const forge = (target: object, caller: Principal) => Object["assign"](target, caller);', count: 1 },
  {
    name: "minted and received Principals",
    rule: LITERAL,
    path: `${SERVER}/entry/auth/seam.ts`,
    source:
      "function own(fields: Fields): Principal { const p: Principal = mintPrincipal({ ...fields }); return p; } export const all = (caller: Principal): Principal[] => [caller]; const list: Principal[] = [];",
    count: 0,
  },
  {
    name: "chat message literal",
    rule: LITERAL,
    source: 'export const turn = (caller: Principal, text: string): Message => ({ role: "user", content: text, by: caller.userId });',
    count: 0,
  },
  {
    name: "a literal in the mint home",
    rule: LITERAL,
    path: MINT,
    source: "export const mintPrincipal = (fields: Fields): Principal => ({ ...fields });",
    count: 1,
  },
  {
    name: "userId forge through stacked assertions",
    rule: LITERAL,
    source:
      "export const forge = (caller: Principal, victim: string) => { const p: Principal = { ...caller, userId: victim } as unknown as never; return p; };",
    count: 1,
  },
  {
    name: "stacked assertions in the request seam",
    rule: LITERAL,
    path: `${SERVER}/entry/auth/seam.ts`,
    source: "function forge(caller: Principal, victim: string) { const p: Principal = { ...caller, userId: victim } as unknown as never; return p; }",
    count: 1,
  },
  {
    name: "angle-asserted literal binding",
    rule: LITERAL,
    source: "export const p = (base: any) => { const q: Principal = <never>{ ...base }; return q; };",
    count: 1,
  },
  {
    name: "satisfies and non-null layers",
    rule: LITERAL,
    source: "export const p = (base: any) => { const q: Principal = ({ ...base } satisfies object)! as Caller; return q; };",
    count: 1,
  },
  {
    name: "stacked parameter default",
    rule: LITERAL,
    source: "export function use(base: any, p: Principal = { ...base } as unknown as never) { return p; }",
    count: 1,
  },
  {
    name: "stacked class field",
    rule: LITERAL,
    source: "export class Holder { constructor(private readonly base: any) {} p: Principal = { ...this.base } as unknown as never; }",
    count: 1,
  },
  {
    name: "stacked return",
    rule: LITERAL,
    source: 'export function elevate(base: Principal): Principal { return { ...base, role: "user" } as unknown as never; }',
    count: 1,
  },
  {
    name: "stacked arrow body",
    rule: LITERAL,
    source: "export const elevate = (base: Principal): Principal => ({ ...base }) as unknown as typeof base;",
    count: 1,
  },
  {
    name: "never at a call",
    rule: LAUNDER,
    source: "export const forge = (caller: Principal, victim: string) => actAs({ ...caller, userId: victim } as never);",
    count: 1,
  },
  {
    name: "angle never at a call",
    rule: LAUNDER,
    source: "export const forge = (caller: Principal, victim: string) => actAs(<never>{ ...caller, userId: victim });",
    count: 1,
  },
  { name: "never on a value", rule: LAUNDER, source: "export const pass = (row: unknown) => actAs(row as never);", count: 1 },
  {
    name: "literal through two casts at a call",
    rule: LAUNDER,
    source: "export const forge = (caller: Principal, victim: string) => actAs({ ...caller, userId: victim } as unknown as typeof caller);",
    count: 1,
  },
  {
    name: "satisfies between the literal and its casts",
    rule: LAUNDER,
    source: "export const forge = (caller: Principal) => actAs(({ ...caller } satisfies object) as unknown as typeof caller);",
    count: 1,
  },
  { name: "inference never", rule: LAUNDER, path: "packages/inference/src/principal-probe.ts", source: "export const p = actAs({} as never);", count: 1 },
  { name: "never-element array", rule: LAUNDER, source: "export const sources = [] as never[];", count: 0 },
  { name: "value through unknown", rule: LAUNDER, source: "export const read = (state: object) => state as unknown as Record<string, unknown>;", count: 0 },
  { name: "single literal assertion", rule: LAUNDER, source: "export const write = (merged: object) => ({ ...merged, v: 1 }) as JsonValue;", count: 0 },
  {
    name: "never as a type argument",
    rule: LAUNDER,
    source: 'export const barrier = Promise.withResolvers<never>(); export const fail = async (): Promise<never> => { throw new Error("x"); };',
    count: 0,
  },
  {
    name: "accessor field forge",
    rule: LITERAL,
    source:
      "export class Holder { constructor(private readonly caller: Principal, private readonly victim: UserId) {} accessor held: Principal = { ...this.caller, userId: this.victim } as typeof this.caller; }",
    count: 1,
  },
  {
    name: "accessor field role demotion",
    rule: LITERAL,
    source:
      'export class Holder { constructor(private readonly base: Principal) {} accessor demoted: Principal = { ...this.base, role: "user" } as typeof this.base; }',
    count: 1,
  },
  {
    name: "static accessor field",
    rule: LITERAL,
    source: "export class Holder { static accessor held: identity.Principal = { ...base } as Caller; }",
    count: 1,
  },
  {
    name: "seven wrappers and one cast",
    rule: LITERAL,
    source: `export const forge = (caller: Principal, victim: UserId) => { const sevenSat: Principal = { ...caller, userId: victim }${" satisfies object".repeat(6)} as typeof caller; return sevenSat; };`,
    count: 1,
  },
  {
    name: "six non-null layers and one cast",
    rule: LITERAL,
    source:
      "export const forge = (caller: Principal, victim: UserId) => { const p: Principal = { ...caller, userId: victim }!!!!!! as typeof caller; return p; };",
    count: 1,
  },
  {
    name: "twelve mixed wrappers in a return",
    rule: LITERAL,
    source: `export function forge(caller: Principal): Principal { return ({ ...caller }${" satisfies object as object".repeat(5)} as typeof caller)!; }`,
    count: 1,
  },
  {
    name: "member read of a literal",
    rule: LITERAL,
    source:
      "export const forge = (caller: Principal, victim: UserId) => { const p: Principal = { held: { ...caller, userId: victim } as typeof caller }.held; return p; };",
    count: 1,
  },
  {
    name: "conditional branch",
    rule: LITERAL,
    source: "export const forge = (caller: Principal, flag: boolean) => { const p: Principal = flag ? ({ ...caller } as typeof caller) : caller; return p; };",
    count: 1,
  },
  {
    name: "logical fallback",
    rule: LITERAL,
    source: "export const forge = (caller: Principal | null, base: Principal) => { const p: Principal = caller ?? ({ ...base } as typeof base); return p; };",
    count: 1,
  },
  {
    name: "sequence and assignment",
    rule: LITERAL,
    source: "export const forge = (caller: Principal) => { let q; const p: Principal = (0, q = { ...caller } as typeof caller); return p; };",
    count: 1,
  },
  {
    name: "awaited literal in an async return",
    rule: LITERAL,
    source: "export async function forge(caller: Principal): Promise<Principal> { const p: Principal = await ({ ...caller } as typeof caller); return p; }",
    count: 1,
  },
  {
    name: "return inside a nested block",
    rule: LITERAL,
    source:
      "export function forge(caller: Principal, flag: boolean): Principal { if (flag) { for (;;) { return { ...caller } as typeof caller; } } return caller; }",
    count: 1,
  },
  {
    name: "parameter property default",
    rule: LITERAL,
    source: "export class Holder { constructor(private readonly p: Principal = { ...base } as Caller) {} }",
    count: 1,
  },
  {
    name: "a nested function's message literal",
    rule: LITERAL,
    source: 'export function own(caller: Principal, text: string): Principal { const say = () => ({ role: "user", content: text }); void say; return caller; }',
    count: 0,
  },
  {
    name: "a received value and a resolver call",
    rule: LITERAL,
    source:
      "export async function own(ctx: { principal: Principal }, resolve: (id: string) => Promise<Principal>) { const a: Principal = ctx.principal; const b: Principal = await resolve(a.userId); return [a, b]; }",
    count: 0,
  },
  {
    name: "eight wrappers and two casts at a call",
    rule: LAUNDER,
    source: `export const forge = (caller: Principal) => actAs(({ ...caller }${" satisfies object".repeat(6)}) as unknown as typeof caller);`,
    count: 1,
  },
  { name: "any-valued arrow mint", rule: RETURN, source: "export const mint = (s: string): Principal => JSON.parse(s);", count: 1 },
  { name: "named function mint", rule: RETURN, source: "export function mint(row: any): Principal { return row; }", count: 1 },
  { name: "method mint", rule: RETURN, source: "export class Minter { mint(row: any): identity.Principal { return row; } }", count: 1 },
  { name: "inference return", rule: RETURN, path: "packages/inference/src/principal-probe.ts", source: "export declare function mint(): Principal;", count: 1 },
  { name: "a new return site in the request seam", rule: RETURN, path: SEAM, source: "function mint(row: any): Principal { return row; }", count: 1 },
  { name: "a new return site in the host bridge", rule: RETURN, path: BRIDGE, source: "const mint = (row: any): Principal => row;", count: 1 },
  { name: "the registered row mapper", rule: RETURN, path: SEAM, source: "function principalFromRow(row: any): Principal { return row; }", count: 0 },
  { name: "the registered host floor", rule: RETURN, path: BRIDGE, source: "const hostPrincipal = (row: any): Principal => row;", count: 0 },
  { name: "the constructor's name outside its home", rule: RETURN, source: "export function mintPrincipal(row: any): Principal { return row; }", count: 1 },
  { name: "a registered name in a domain verb", rule: RETURN, source: "export function principalFromRow(row: any): Principal { return row; }", count: 1 },
  {
    name: "an overload signature in the seam",
    rule: RETURN,
    path: SEAM,
    source: "function principalFromRow(row: string): Principal;\nfunction principalFromRow(row: any) { return row; }",
    count: 1,
  },
  {
    name: "mint call in a new seam function",
    rule: MINT_SITE,
    path: SEAM,
    source: 'import { mintPrincipal } from "./principal-mint.ts";\nfunction forge(fields: any) { return mintPrincipal(fields); }',
    count: 1,
  },
  {
    name: "mint call in a registered seam function",
    rule: MINT_SITE,
    path: SEAM,
    source:
      'import { mintPrincipal } from "./principal-mint.ts";\nasync function resolveCookiePrincipal(fields: any) { return { principal: mintPrincipal(fields) }; }',
    count: 0,
  },
  {
    name: "mint call in a callback nested inside a registered site",
    rule: MINT_SITE,
    path: SEAM,
    source: 'import { mintPrincipal } from "./principal-mint.ts";\nfunction principalFromRow(rows: any[]) { return rows.map((row) => mintPrincipal(row)); }',
    count: 1,
  },
  {
    name: "mint call in the host floor",
    rule: MINT_SITE,
    path: BRIDGE,
    source: 'import { mintPrincipal } from "../auth/principal-mint.ts";\nconst hostPrincipal = (fields: any) => mintPrincipal(fields);',
    count: 0,
  },
  {
    name: "aliased mint import",
    rule: MINT_SITE,
    path: SEAM,
    source: 'import { mintPrincipal as forge } from "./principal-mint.ts";\nexport const x = forge;',
    count: 1,
  },
  {
    name: "string-named mint import",
    rule: MINT_SITE,
    path: SEAM,
    source: 'import { "mintPrincipal" as forge } from "./principal-mint.ts";\nexport const x = forge;',
    count: 1,
  },
  {
    name: "computed namespace mint read",
    rule: MINT_SITE,
    path: SEAM,
    source: 'import * as mint from "./principal-mint.ts";\nfunction forge(fields: any) { return mint["mintPrincipal"](fields); }',
    count: 1,
  },
  { name: "mint passed as a value", rule: MINT_SITE, path: BRIDGE, source: "export const forge = mintPrincipal;", count: 1 },
  {
    name: "mint republished from its home",
    rule: MINT_SITE,
    path: MINT,
    source: "export function mintPrincipal(fields: any) { return fields; }\nexport { mintPrincipal as forge };",
    count: 1,
  },
  { name: "mint call in a domain verb", rule: MINT_SITE, source: "export const forge = (fields: any) => mintPrincipal(fields);", count: 1 },
  {
    name: "mint call in inference",
    rule: MINT_SITE,
    path: "packages/inference/src/principal-probe.ts",
    source: "export const forge = (fields: any) => mintPrincipal(fields);",
    count: 1,
  },
  { name: "a mint-named string in prose", rule: MINT_SITE, source: 'export const note = "mintPrincipal lives in entry/auth";', count: 0 },
  {
    name: "async and collection returns",
    rule: RETURN,
    source: "export const load = async (): Promise<Principal> => caller; export const all = (): Principal[] => [caller];",
    count: 0,
  },
  { name: "laundered synthetic", rule: SYNTHETIC, source: `export const mint = (id: string) => (${SHAPE} as unknown as Caller);`, count: 1 },
  {
    name: "quoted synthetic keys",
    rule: SYNTHETIC,
    source: 'export const p = { "userId": "x", "role": "user", "handle": "x", "externalId": null, "via": "fallback" };',
    count: 1,
  },
  {
    name: "inference synthetic",
    rule: SYNTHETIC,
    path: "packages/inference/src/principal-probe.ts",
    source: `export const p = (id: string) => (${SHAPE});`,
    count: 1,
  },
  {
    name: "entry floor",
    rule: SYNTHETIC,
    path: `${SERVER}/entry/compose/principal-probe.ts`,
    source: `export const p = (id: string) => (${SHAPE});`,
    count: 0,
  },
  { name: "chat message", rule: SYNTHETIC, source: 'export const turn = (text: string) => ({ role: "user", content: text });', count: 0 },
  {
    name: "row-read role",
    rule: SYNTHETIC,
    source: "export const p = (id: string, role: unknown) => ({ userId: id, role, externalId: null, via: 'cookie' });",
    count: 0,
  },
  { name: "string spelling", rule: SYNTHETIC, source: `export const s = '{ "role": "user", "externalId": null, "via": "fallback" }';`, count: 0 },
  { name: "canonical import", rule: BLIND, path: ENGINE, source: `import type { Principal } ${IDENTITY};`, count: 1 },
  { name: "renamed import", rule: BLIND, path: ENGINE, source: `import type { Principal as Caller } ${IDENTITY};`, count: 1 },
  { name: "string import name", rule: BLIND, path: ENGINE, source: `import type { "Principal" as Caller } ${IDENTITY};`, count: 1 },
  { name: "contracts barrel", rule: BLIND, path: ENGINE, source: 'import type { Principal } from "@orb/contracts";', count: 1 },
  { name: "server barrel", rule: BLIND, path: ENGINE, source: 'import type { Principal } from "../contract/index.ts";', count: 1 },
  { name: "unresolvable door", rule: BLIND, path: ENGINE, source: 'import type { Principal } from "./missing.ts";', count: 1 },
  { name: "namespace member", rule: BLIND, path: ENGINE, source: `import type * as identity ${IDENTITY}; export type P = identity.Principal;`, count: 1 },
  // A heritage clause names its type through a member expression, not a qualified name, and tsc accepts it.
  {
    name: "namespace member in an extends clause",
    rule: BLIND,
    path: ENGINE,
    source: `import type * as identity ${IDENTITY}; export interface Caller extends identity.Principal {}`,
    count: 1,
  },
  {
    name: "namespace member in an implements clause",
    rule: BLIND,
    path: ENGINE,
    source: `import type * as identity ${IDENTITY}; export abstract class Caller implements identity.Principal {}`,
    count: 1,
  },
  {
    name: "nested namespace member in an extends clause",
    rule: BLIND,
    path: ENGINE,
    source: 'import type * as contracts from "@orb/contracts"; export interface Caller extends contracts.identity.Principal {}',
    count: 1,
  },
  { name: "type import", rule: BLIND, path: ENGINE, source: 'export type P = import("@orb/contracts/identity").Principal;', count: 1 },
  { name: "reexport door", rule: BLIND, path: ENGINE, source: `export type { Principal } ${IDENTITY};`, count: 1 },
  { name: "generated engine source", rule: BLIND, path: ENGINE.replace(/\.ts$/u, ".gen.ts"), source: `import type { Principal } ${IDENTITY};`, count: 1 },
  { name: "local object key", rule: BLIND, path: ENGINE, source: "const bag = { Principal: 1 }; export const n = bag.Principal;", count: 0 },
  {
    name: "resolved triple",
    rule: BLIND,
    path: ENGINE,
    source: "export const run = (identity: { readonly runAsUserId: string; readonly triggeredBy: string }) => identity.runAsUserId;",
    count: 0,
  },
  { name: "verb layer", rule: BLIND, source: `import type { Principal } ${IDENTITY}; export const ok = (caller: Principal) => caller.userId;`, count: 0 },
  // The engine derives no type from a value and reads nothing from the verb layer: either can carry a Principal unnamed.
  { name: "engine re-export through a verb", rule: BLIND, path: ENGINE, source: 'import type { Caller } from "../verbs/caller-alias.ts";', count: 1 },
  {
    name: "engine parameter derived from a verb",
    rule: BLIND,
    path: ENGINE,
    source: 'import type { send } from "../verbs/send.ts"; export const run = (c: Parameters<typeof send>[0]) => c;',
    count: 1,
  },
  {
    name: "engine types derived from its own pipeline",
    rule: BLIND,
    path: ENGINE,
    source: 'import type { runTurnPipeline } from "./pipeline.ts"; export type Turn = Awaited<ReturnType<typeof runTurnPipeline>>;',
    count: 0,
  },
  { name: "engine value typeof", rule: BLIND, path: ENGINE, source: 'export const isText = (v: unknown) => typeof v === "string";', count: 0 },
  // Every other Principal rule keys on the name, so no spelling may rename it.
  { name: "renamed import", rule: ALIAS, source: `import type { Principal as P } ${IDENTITY}; export const mint = (row: unknown) => row as P;`, count: 1 },
  { name: "string-named renamed import", rule: ALIAS, source: `import type { "Principal" as P } ${IDENTITY};`, count: 1 },
  { name: "renamed re-export", rule: ALIAS, source: `export type { Principal as Caller } ${IDENTITY};`, count: 1 },
  { name: "renamed local export", rule: ALIAS, source: `import type { Principal } ${IDENTITY}; export type { Principal as Caller };`, count: 1 },
  {
    name: "local type alias",
    rule: ALIAS,
    source: `import type { Principal } ${IDENTITY}; type P = Principal; export const mint = (row: unknown) => row as P;`,
    count: 1,
  },
  { name: "nullable type alias", rule: ALIAS, source: `import type { Principal } ${IDENTITY}; export type P = Principal | null;`, count: 1 },
  { name: "namespace array alias", rule: ALIAS, source: `import type * as identity ${IDENTITY}; export type Ps = readonly identity.Principal[];`, count: 1 },
  { name: "interface heritage", rule: ALIAS, source: `import type { Principal } ${IDENTITY}; export interface Caller extends Principal {}`, count: 1 },
  { name: "class heritage", rule: ALIAS, source: `import type { Principal } ${IDENTITY}; export abstract class Caller implements Principal {}`, count: 1 },
  {
    name: "type parameter bound",
    rule: ALIAS,
    source: `import type { Principal } ${IDENTITY}; export function mint<T extends Principal>(row: unknown): T { return row as T; }`,
    count: 1,
  },
  {
    name: "assertion through typeof",
    rule: ALIAS,
    source: `import type { Principal } ${IDENTITY}; declare const caller: Principal; export const mint = (row: unknown) => row as typeof caller;`,
    count: 1,
  },
  {
    name: "return type through typeof a Principal binding",
    rule: ALIAS,
    source: `import type { Principal } ${IDENTITY}; declare const caller: Principal; export function mint(row: any): typeof caller { return row; }`,
    count: 1,
  },
  {
    name: "an op type taking a Principal",
    rule: ALIAS,
    source: `import type { Principal } ${IDENTITY}; export type ResolveOp = (principal: Principal) => Promise<void>;`,
    count: 0,
  },
  { name: "a return type through typeof fetch", rule: ALIAS, source: "export function wrap(inner: typeof fetch): typeof fetch { return inner; }", count: 0 },
  {
    name: "an assertion to a typeof of a non-Principal binding",
    rule: ALIAS,
    source: "declare const columns: { a: number }; export const pick = (name: string) => columns[name as keyof typeof columns];",
    count: 0,
  },
  {
    name: "an assertion to a parameter type of an imported function",
    rule: ALIAS,
    source: 'import { createLocalJWKSet } from "jose"; export const read = (raw: unknown) => raw as Parameters<typeof createLocalJWKSet>[0];',
    count: 0,
  },
  { name: "a plain import", rule: ALIAS, source: `import type { Principal } ${IDENTITY}; export const ok = (caller: Principal) => caller.userId;`, count: 0 },
] as const)("native Principal lint judges $name", async (row) => {
  const path = "path" in row ? row.path : VERB;
  expect(await findings(path, row.source, row.rule)).toEqual(Array.from({ length: row.count }, () => row.rule));
});

// The retired custom policies' own mustFlag and mustPass rows, verbatim, against the native rules that succeed them.
// Three of their mustPass rows were waiver or foreign-name acquittals; the native rules refuse those on purpose.
const VERBS = `${SERVER}/domain/chat/verbs`;
const RELATIVE_IDENTITY = '"../../../../../contracts/src/identity/index.ts"';
const SYNTHETIC_MINT = '{ userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" }';
test.for([
  {
    name: "synthetic mustFlag: five-field domain mint",
    path: `${VERBS}/sneaky.ts`,
    source: `import type { Principal } ${IDENTITY};\nconst p: Principal = ${SYNTHETIC_MINT};\nexport const x = p;\n`,
    expected: { [SYNTHETIC]: 1, [LITERAL]: 1, [RETURN]: 0, [ASSERTION]: 0 },
  },
  {
    name: "synthetic mustFlag: spread-built return mint",
    path: `${VERBS}/spread.ts`,
    source: `import type { Principal } ${IDENTITY};\nexport function elevate(base: Principal): Principal {\n  return { ...base, role: "user" };\n}\n`,
    expected: { [RETURN]: 1, [LITERAL]: 1, [SYNTHETIC]: 0 },
  },
  {
    name: "synthetic arm b: role literal walked up through stacked assertions to a Principal binding",
    path: `${VERBS}/v2pb-plant-verb.ts`,
    source: `import type { Principal } ${IDENTITY};\ndeclare const base: Principal;\nexport const p: Principal = { ...base, role: "user" } as unknown as never;\n`,
    expected: { [LITERAL]: 1, [LAUNDER]: 2, [SYNTHETIC]: 0, [ASSERTION]: 0 },
  },
  {
    name: "synthetic mustPass: chat message beside a Principal",
    path: `${VERBS}/message.ts`,
    source: `import type { Principal } ${IDENTITY};\nexport function turn(caller: Principal, text: string) {\n  return { role: "user", content: text, by: caller.userId };\n}\n`,
    expected: { [SYNTHETIC]: 0, [LITERAL]: 0, [RETURN]: 0, [ASSERTION]: 0 },
  },
  {
    name: "synthetic mustPass: plain message",
    path: `${VERBS}/msg.ts`,
    source: 'const msg = { role: "user", content: "hello" };\nexport const x = msg;\n',
    expected: { [SYNTHETIC]: 0 },
  },
  {
    name: "synthetic mustPass: prose",
    path: `${VERBS}/comment.ts`,
    source: '// The Principal gets role: "user" from the DB, never externalId/via fabricated here.\nexport const x = 1;\n',
    expected: { [SYNTHETIC]: 0, [RETURN]: 0, [ASSERTION]: 0 },
  },
  {
    name: "synthetic mustPass: quoted key and string",
    path: `${VERBS}/quoted.ts`,
    source: 'export const q = { "role": "user", content: "x" };\nexport const s = \'{ "role": "user", "externalId": null, "via": "fallback" }\';\n',
    expected: { [SYNTHETIC]: 0 },
  },
  {
    name: "mint mustFlag: arrow returning Principal",
    path: `${VERBS}/sneaky.ts`,
    source: `const hostP = (id: string): Principal => (${SHAPE});\nexport const x = hostP;\n`,
    expected: { [RETURN]: 1, [LITERAL]: 1, [SYNTHETIC]: 1 },
  },
  {
    name: "mint mustFlag: satisfies",
    path: `${VERBS}/satisfied.ts`,
    source: `export function mint(id: string) {\n  return ${SHAPE} satisfies Principal;\n}\n`,
    expected: { [SYNTHETIC]: 1, [ASSERTION]: 1 },
  },
  {
    name: "mint pattern `: Principal = {`: a userId forge behind stacked assertions",
    path: `${VERBS}/v2pb-plant-verb.ts`,
    source: `import type { Principal } ${IDENTITY};\nimport type { UserId } from "@orb/kit/ids";\ndeclare const caller: Principal;\ndeclare const victim: UserId;\nexport const p: Principal = { ...caller, userId: victim } as unknown as never;\n`,
    expected: { [LITERAL]: 1, [LAUNDER]: 2, [ASSERTION]: 0 },
  },
  {
    name: "mint pattern `: Principal = {` inside entry/auth",
    path: `${SERVER}/entry/auth/v2pb-plant-entry.ts`,
    source: `import type { Principal } ${IDENTITY};\ndeclare const caller: Principal;\nexport const p: Principal = { ...caller, userId: "victim" } as unknown as never;\n`,
    expected: { [LITERAL]: 1, [LAUNDER]: 2 },
  },
  {
    name: "mint mustFlag: assertion",
    path: `${VERBS}/asserted.ts`,
    source: "export function mint(row: unknown) {\n  return row as Principal;\n}\n",
    expected: { [ASSERTION]: 1 },
  },
  {
    name: "family case: asserted synthetic mint",
    path: `${VERBS}/asr.ts`,
    source: `export function mint(id: string) {\n  return ${SHAPE} as Principal;\n}\n`,
    expected: { [ASSERTION]: 1, [SYNTHETIC]: 1 },
  },
  {
    name: "family case: an unannotated spread stays the brand's job",
    path: `${VERBS}/spread.ts`,
    source: 'function elevate(base: Principal) {\n  const out = { ...base, role: "user" };\n  return out;\n}\nexport const x = elevate;\n',
    expected: { [ASSERTION]: 0, [LITERAL]: 0, [RETURN]: 0, [SYNTHETIC]: 0 },
  },
  {
    name: "mint mustPass: waived entry/auth arrow is now refused outside the registered sites",
    path: `${SERVER}/entry/auth/ok.ts`,
    source: `// @orb-waive one-principal-mint-population(Principal): the canonical cookie principal resolver; ends never (auth/seam.ts owns the cookie mint)\nconst hostP = (id: string): Principal => (${SHAPE});\nexport const x = hostP;\n`,
    expected: { [RETURN]: 1, [LITERAL]: 1, [SYNTHETIC]: 0 },
  },
  {
    name: "mint mustPass: prose",
    path: `${VERBS}/comment.ts`,
    source: "// The principalFromRow function returns a Principal.\nexport const x = 1;\n",
    expected: { [RETURN]: 0, [ASSERTION]: 0 },
  },
  {
    name: "mint mustPass: mentions are not mints",
    path: `${VERBS}/consume.ts`,
    source:
      'export function use(caller: Principal, other: Principal | null): string {\n  const list: Principal[] = other === null ? [caller] : [caller, other];\n  return list.map((p) => p.userId).join(",");\n}\n',
    expected: { [RETURN]: 0, [ASSERTION]: 0, [LITERAL]: 0, [SYNTHETIC]: 0 },
  },
  {
    name: "turn mustFlag: founding import",
    path: `${SERVER}/domain/chat/engine/a.ts`,
    source: `import type { Principal } from ${RELATIVE_IDENTITY};\nexport const p: Principal = { userId: "u" };\n`,
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustFlag: alias",
    path: `${SERVER}/domain/chat/engine/alias.ts`,
    source: `import type { Principal as Caller } from ${RELATIVE_IDENTITY};\nexport const p: Caller = { userId: "u" };\n`,
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustFlag: contracts barrel",
    path: `${SERVER}/domain/chat/engine/reexport.ts`,
    source: 'import type { Principal } from "../../../../../contracts/src/index.ts";\nexport const p: Principal = { userId: "u" };\n',
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustFlag: unreadable door",
    path: `${SERVER}/domain/chat/engine/unreadable.ts`,
    source: 'import type { Principal } from "./missing.ts";\nexport type P = Principal;\n',
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustPass: local object key",
    path: `${SERVER}/domain/chat/engine/local-bag.ts`,
    source: "const bag = { Principal: 1 };\nexport const n = bag.Principal;\n",
    expected: { [BLIND]: 0 },
  },
  {
    name: "turn mustPass: verb layer",
    path: `${VERBS}/c.ts`,
    source: `import type { Principal } from ${RELATIVE_IDENTITY};\nexport function ok(principal: Principal): string {\n  return principal.userId;\n}\n`,
    expected: { [BLIND]: 0 },
  },
  {
    name: "turn mustPass: a foreign same-named Principal is now refused in the engine",
    path: `${SERVER}/domain/chat/engine/foreign.ts`,
    source: 'import type { Principal } from "./lib/wire.ts";\nexport type P = Principal;\n',
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustPass: the waiver door is gone",
    path: `${SERVER}/domain/chat/engine/waived.ts`,
    source: `// @orb-waive turn-identity(Principal): the engine's own re-export shim during the D19 migration; ends when the shim is deleted.\nimport type { Principal } from ${RELATIVE_IDENTITY};\nexport type P = Principal;\n`,
    expected: { [BLIND]: 1 },
  },
  {
    name: "turn mustPass: resolved triple",
    path: `${SERVER}/domain/chat/engine/triple.ts`,
    source: "export function run(identity: { readonly runAsUserId: string; readonly triggeredBy: string }): string {\n  return identity.runAsUserId;\n}\n",
    expected: { [BLIND]: 0 },
  },
] as const)("retired policy row: $name", async (row) => {
  for (const [rule, count] of Object.entries(row.expected)) {
    expect(await findings(row.path, row.source, rule), `${rule} on ${row.source}`).toEqual(Array.from({ length: count }, () => rule));
  }
});

test.for([
  { name: "seam re-export", path: `${SERVER}/entry/auth/seam.ts`, source: 'export { mintPrincipal } from "./principal-mint.ts";' },
  { name: "seam wrapper export", path: `${SERVER}/entry/auth/seam.ts`, source: "export const forge = mintPrincipal;" },
  { name: "bridge re-export", path: `${SERVER}/entry/compose/chat.ts`, source: 'export { mintPrincipal as hostMint } from "../auth/principal-mint.ts";' },
] as const)("an allowed mint importer cannot republish the mint: $name", async (row) => {
  const config = await ordinary.calculateConfigForFile(join(ROOT, row.path));
  const surfaces = Object.keys(config.rules).filter((id) => id.startsWith("orb/role-data-export-surface-"));
  expect(surfaces).toHaveLength(1);
  const [surface] = surfaces;
  expect(await findings(row.path, row.source, surface ?? "")).toEqual([surface]);
});

test.for([
  { name: "domain verb", path: VERB, off: [] },
  { name: "request seam", path: SEAM, off: [SYNTHETIC] },
  { name: "the mint home", path: MINT, off: [SYNTHETIC] },
  { name: "inference package", path: "packages/inference/src/principal-probe.ts", off: [] },
] as const)("the normal config enables the Principal construction rules: $name", async (row) => {
  const rules = (await ordinary.calculateConfigForFile(join(ROOT, row.path))).rules;
  expect(PRINCIPAL_RULES.filter((rule) => rules[rule] === undefined)).toEqual(row.off);
});

// Each registered site earns its exemption: under another name, the real function draws the findings it is excused from.
test.for([
  { site: "principalFromRow", path: SEAM, declaration: "function principalFromRow(", rules: [MINT_SITE, RETURN] },
  { site: "resolveCookiePrincipal", path: SEAM, declaration: "async function resolveCookiePrincipal(", rules: [MINT_SITE] },
  { site: "resolveHeaderOrFallbackPrincipal", path: SEAM, declaration: "async function resolveHeaderOrFallbackPrincipal(", rules: [MINT_SITE] },
  { site: "hostPrincipal", path: BRIDGE, declaration: "const hostPrincipal = (", rules: [MINT_SITE, RETURN] },
  { site: "mintPrincipal", path: MINT, declaration: "export function mintPrincipal(", rules: [ASSERTION, RETURN] },
] as const)("the registered Principal site is live and earned: $site", async (row) => {
  const live = readFileSync(join(ROOT, row.path), "utf8");
  expect(live.split(row.declaration)).toHaveLength(2);
  const renamed = live.replace(row.declaration, row.declaration.replace(row.site, `${row.site}Unregistered`));
  for (const rule of PRINCIPAL_RULES) {
    expect(await findings(row.path, live, rule), `${rule} on the live ${row.path}`).toEqual([]);
    expect((await findings(row.path, renamed, rule)).length > 0, `${rule} on the renamed ${row.site}`).toBe(row.rules.includes(rule));
  }
});

test.for([
  { name: "domain verb", from: VERB, blocked: true },
  { name: "entry barrel", from: `${SERVER}/entry/auth/index.ts`, blocked: true },
  { name: "composition services", from: `${SERVER}/entry/compose/services.ts`, blocked: true },
  { name: "inference package", from: "packages/inference/src/principal-probe.ts", blocked: true },
  { name: "test tree", from: "tests/server/principal-probe.ts", blocked: true },
  { name: "dynamic domain import", from: VERB, dynamic: true, blocked: true },
  { name: "request seam", from: `${SERVER}/entry/auth/seam.ts`, blocked: false },
  { name: "frozen-host bridge", from: `${SERVER}/entry/compose/chat.ts`, blocked: false },
] as const)("the native Principal mint boundary judges $name", async (row, { plantedTree, repoRoot }) => {
  const specifier = relative(dirname(row.from), MINT);
  const source = JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`);
  const root = await plantedTree({
    [MINT]: "export const mintPrincipal=(fields:object)=>fields;",
    [row.from]:
      "dynamic" in row
        ? `export const read=import(${source}).then(m=>m.mintPrincipal);`
        : `import { mintPrincipal } from ${source}; export const read=mintPrincipal;`,
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [row.from, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status === 0, output).toBe(!row.blocked);
  expect(output.includes("principal-mint-owners"), output).toBe(row.blocked);
});
