// `orb/room-token-mint`: a room token mints only at a site ROOM_TOKEN_MINT_SITES lists, and no cast, type predicate or
// assertion signature produces one; the two principal rules the rule's header names refuse `Object.assign` and `as never`.
// The planted program imports the shipped token types and mint module, so the rules read the production tokens.
// @subject tooling/src/eslint/room-token-mint.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { PRINCIPAL_RULES } from "../../tooling/src/eslint/principal.ts";
import { ROOM_TOKEN_HOME, ROOM_TOKEN_MINT_SITES, roomTokenMintRule } from "../../tooling/src/eslint/room-token-mint.ts";
import type { OrbRule } from "../../tooling/src/eslint/syntax.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/room-token-mint";
const LITERAL = "principal-literal";
const LAUNDER = "principal-brand-launder";
const VERB = "packages/server/src/domain/chat/verbs/room-token-probe.ts";

function site<T extends { readonly name: string }>(sites: readonly T[], name: string): T {
  const found = sites.find((row) => row.name === name);
  if (found === undefined) {
    throw new Error(`${name} is no longer a listed room-token mint site`);
  }
  return found;
}

function principalRule(id: string): OrbRule {
  const row = PRINCIPAL_RULES.find((entry) => entry.id === id);
  if (row === undefined) {
    throw new Error(`${id} is no longer a principal rule`);
  }
  return row.rule;
}

const GATE = site(ROOM_TOKEN_MINT_SITES.mintRoomAdmission, "requireParticipant");
const CLAIM_SITE = site(ROOM_TOKEN_MINT_SITES.mintRoomClaim, "claim");
const EXEMPT_SITE = site(ROOM_TOKEN_MINT_SITES.mintClaimExempt, "restoreContinue");

const preamble = [
  `import type { RoomAdmission, RoomClaim } from "${join(ROOT, "packages/contracts/src/chat/rpg-ops.ts")}";`,
  `import type { ClaimExempt, RoomWriteLicence } from "${join(ROOT, "packages/server/src/domain/chat/contract/room-write.ts")}";`,
  `import type { ChatId } from "${join(ROOT, "packages/kit/src/ids/index.ts")}";`,
  "export type Tokens = [RoomAdmission, RoomClaim, ClaimExempt, RoomWriteLicence, ChatId];",
].join("\n");
const MINTS = `"${join(ROOT, ROOM_TOKEN_HOME)}"`;

function lint(root: string, path: string, source: string, principal: readonly string[] = []): readonly (string | null)[] {
  const text = `${preamble}\n${source}`;
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: [file], options });
  expect(program.getSemanticDiagnostics(program.getSourceFile(file)).map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"))).toEqual([]);
  const extra = Object.fromEntries(principal.map((id) => [id, principalRule(id)]));
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "room-token-mint": roomTokenMintRule, ...extra } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error", ...Object.fromEntries(principal.map((id) => [`orb/${id}`, "error"])) },
    },
    { filename: file },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ ruleId }) => ruleId);
}

const MINT_IN = (name: string): string =>
  [`import { mintRoomAdmission } from ${MINTS};`, `export function ${name}(id: ChatId): RoomAdmission {`, "  return mintRoomAdmission(id);", "}"].join("\n");

test("a verb that mints its own admission is refused at the call", ({ scratch }) => {
  expect(lint(scratch, VERB, MINT_IN("admitMyself"))).toEqual([RULE]);
});

test("a listed gate may mint, and only inside its listed function", ({ scratch }) => {
  expect(lint(scratch, GATE.path, MINT_IN(GATE.name))).toEqual([]);
  expect(lint(scratch, GATE.path, MINT_IN(`${GATE.name}Twin`))).toEqual([RULE]);
});

test("the claim and exemption mints are allowed only at their listed sites", ({ scratch }) => {
  const claimIn = (name: string): string =>
    [`import { mintRoomClaim } from ${MINTS};`, `export const ${name} = (id: ChatId): RoomClaim => mintRoomClaim(id);`].join("\n");
  const exemptIn = (name: string): string =>
    [`import { mintClaimExempt } from ${MINTS};`, `export function ${name}(id: ChatId): ClaimExempt {`, "  return mintClaimExempt(id);", "}"].join("\n");
  expect(lint(scratch, CLAIM_SITE.path, claimIn(CLAIM_SITE.name))).toEqual([]);
  expect(lint(scratch, VERB, claimIn(CLAIM_SITE.name))).toEqual([RULE]);
  expect(lint(scratch, EXEMPT_SITE.path, exemptIn(EXEMPT_SITE.name))).toEqual([]);
  expect(lint(scratch, VERB, exemptIn(EXEMPT_SITE.name))).toEqual([RULE]);
});

test.for([
  { name: "an aliased import", source: [`import { mintRoomClaim as settle } from ${MINTS};`, "export const forged = (id: ChatId): RoomClaim => settle(id);"] },
  {
    name: "a computed namespace member",
    source: [`import * as tokens from ${MINTS};`, 'export const forged = (id: ChatId): RoomClaim => tokens["mintRoomClaim"](id);'],
  },
  {
    name: "a string import name",
    source: [`import { "mintRoomClaim" as settle } from ${MINTS};`, "export const forged = (id: ChatId): RoomClaim => settle(id);"],
  },
])("a mint spelled through $name is refused", ({ source }, { scratch }) => {
  expect(lint(scratch, VERB, source.join("\n"))).toEqual([RULE]);
});

test.for([
  { name: "an admission", target: "RoomAdmission", found: [RULE] },
  { name: "a claim", target: "RoomClaim", found: [RULE] },
  { name: "an exemption", target: "ClaimExempt", found: [RULE] },
  { name: "a licence union", target: "RoomWriteLicence", found: [RULE] },
  { name: "a plain room shape", target: "{ readonly chatId: ChatId }", found: [] },
])("a cast to $name is judged by its type", ({ target, found }, { scratch }) => {
  expect(lint(scratch, VERB, `export const cast = (id: ChatId) => ({ chatId: id }) as ${target};`)).toEqual(found);
});

test("an angle-bracket assertion to a token is a cast too", ({ scratch }) => {
  expect(lint(scratch, VERB, "export const cast = (id: ChatId) => <RoomClaim>{ chatId: id };")).toEqual([RULE]);
});

test.for([
  { name: "a type predicate", signature: "(value: unknown): value is RoomClaim", body: "return value !== null;", found: [RULE] },
  { name: "an assertion signature", signature: "(value: unknown): asserts value is RoomClaim", body: "if (value === null) throw new Error();", found: [RULE] },
  { name: "a predicate to a plain shape", signature: "(value: unknown): value is { readonly chatId: ChatId }", body: "return value !== null;", found: [] },
])("$name is judged by the type it narrows to", ({ signature, body, found }, { scratch }) => {
  expect(lint(scratch, VERB, [`export function narrow${signature} {`, `  ${body}`, "}"].join("\n"))).toEqual(found);
});

test.for([
  {
    name: "Object.assign over a real admission",
    source: "export const retarget = (admission: RoomAdmission, id: ChatId) => Object.assign({}, admission, { chatId: id });",
    found: [`orb/${LITERAL}`],
  },
  { name: "a cast to never", source: "export const laundered = (id: ChatId): RoomClaim => ({ chatId: id }) as never;", found: [`orb/${LAUNDER}`] },
])("$name is refused by the principal rule the header names", ({ source, found }, { scratch }) => {
  expect(lint(scratch, VERB, source, [LITERAL, LAUNDER])).toEqual(found);
});
