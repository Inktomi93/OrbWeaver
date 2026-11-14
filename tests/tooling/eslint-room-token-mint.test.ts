// `orb/room-token-mint`: a room token mints only at a site ROOM_TOKEN_MINT_SITES lists, and no cast produces one. The
// planted program imports the shipped token types and mint module, so the rule reads the production tokens.
// @subject tooling/src/eslint/room-token-mint.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { ROOM_TOKEN_HOME, ROOM_TOKEN_MINT_SITES, roomTokenMintRule } from "../../tooling/src/eslint/room-token-mint.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/room-token-mint";
const VERB = "packages/server/src/domain/chat/verbs/room-token-probe.ts";
const GATE = ROOM_TOKEN_MINT_SITES.mintRoomAdmission.find(({ name }) => name === "requireParticipant");
if (GATE === undefined) {
  throw new Error("the chat membership gate is no longer a listed admission site");
}

const preamble = [
  `import type { RoomAdmission, RoomClaim } from "${join(ROOT, "packages/contracts/src/chat/rpg-ops.ts")}";`,
  `import type { RoomWriteLicence } from "${join(ROOT, "packages/server/src/domain/chat/contract/room-write.ts")}";`,
  `import type { ChatId } from "${join(ROOT, "packages/kit/src/ids/index.ts")}";`,
  "export type Tokens = [RoomAdmission, RoomClaim, RoomWriteLicence, ChatId];",
].join("\n");
const MINTS = `"${join(ROOT, ROOM_TOKEN_HOME)}"`;

function lint(root: string, path: string, source: string): readonly (string | null)[] {
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
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "room-token-mint": roomTokenMintRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
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

test("an aliased import of a mint is still the mint", ({ scratch }) => {
  const source = [`import { mintRoomClaim as settle } from ${MINTS};`, "export const forged = (id: ChatId): RoomClaim => settle(id);"].join("\n");
  expect(lint(scratch, VERB, source)).toEqual([RULE]);
});

test.for([
  { name: "an admission", target: "RoomAdmission", found: [RULE] },
  { name: "a claim", target: "RoomClaim", found: [RULE] },
  { name: "a licence union", target: "RoomWriteLicence", found: [RULE] },
  { name: "a plain room shape", target: "{ readonly chatId: ChatId }", found: [] },
])("a cast to $name is judged by its type", ({ target, found }, { scratch }) => {
  expect(lint(scratch, VERB, `export const cast = (id: ChatId) => ({ chatId: id }) as ${target};`)).toEqual(found);
});
