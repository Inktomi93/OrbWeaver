import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { CLIENT_MAP_NATIVE_RULE as RULE } from "../../../../tooling/src/verify/lib/client-map-native.ts";

const SUBJECT = "packages/client/src/features/probe/lib/probe.tsx";

async function messages(root: string, source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

for (const [name, source, count] of [
  ["modal object", "const M={command:1,newChat:2};", 1],
  ["group object", "const M={personas:1,appearance:2};", 1],
  ["single object key", "const M={chats:1};", 0],
  ["foreign object key", "const M={chats:1,characters:2,foreign:3};", 0],
  ["object spread is not a named key", "const M={chats:1,...other,characters:2};", 1],
  ["object methods are not named data", "const M={chats:1,characters:2,foreign(){}};", 1],
  ["object getter is not named data", "const M={chats:1,characters:2,get foreign(){return 1}};", 1],
  ["quoted object keys preserve written names", 'const M={"chats":1,"characters":2};', 0],
  ["computed object key is foreign", 'const M={["chats"]:1,characters:2};', 0],
  ["shorthand keys", "const M={chats,characters};", 1],
  ["decoded identifier keys", String.raw`const M={ch\u0061ts:1,characters:2};`, 1],
  ["duplicate object keys count entries", "const M={chats:1,chats:2};", 1],
  ["nested object maps stay deep", "function C(){return {chats:1,characters:2}}", 1],
  ["group id array", 'const M=[{id:"personas"},{id:"appearance"}];', 1],
  ["modal id array", 'const M=[{id:"command"},{id:"newChat"}];', 1],
  ["one id", 'const M=[{id:"chats"}];', 0],
  ["duplicate object ids", 'const M=[{id:"chats"},{id:"chats"}];', 0],
  ["foreign id", 'const M=[{id:"chats"},{id:"characters"},{id:"foreign"}];', 0],
  ["missing id", 'const M=[{id:"chats"},{id:"characters"},{other:1}];', 0],
  ["array spread is not a literal element", 'const M=[{id:"chats"},{id:"characters"},...other];', 0],
  ["parenthesized object element stays indirect", 'const M=[({id:"chats"}),{id:"characters"}];', 0],
  ["asserted object element stays indirect", 'const M=[{id:"chats"} as Entry,{id:"characters"}];', 0],
  ["quoted id field is not a named id", 'const M=[{"id":"chats"},{id:"characters"}];', 0],
  ["computed id field is not a named id", 'const M=[{["id"]:"chats"},{id:"characters"}];', 0],
  ["getter id is not a literal assignment", 'const M=[{get id(){return "chats"}},{id:"characters"}];', 0],
  ["first duplicate id controls the literal", 'const M=[{id:"foreign",id:"chats"},{id:"characters"}];', 0],
  ["decoded id field", String.raw`const M=[{i\u0064:"chats"},{id:"characters"}];`, 1],
  ["wrapped id values", 'const M=[{id:(("chats"! as const) satisfies string)},{id:`characters`}];', 1],
  ["identifier id is not evaluated", 'const id="chats";const M=[{id},{id:"characters"}];', 0],
  ["bare section ids", 'const M=["chats","characters"];', 1],
  ["bare group ids", 'const M=["personas","appearance"];', 1],
  ["bare wrapped ids", 'const M=[("chats"!),(("characters" as const) satisfies string)];', 1],
  ["bare template ids", "const M=[`chats`,`characters`];", 1],
  ["bare decoded escape", String.raw`const M=["ch\u0061ts","characters"];`, 1],
  ["single string id", 'const M=["chats"];', 0],
  ["duplicate string ids", 'const M=["chats","chats"];', 0],
  ["foreign string", 'const M=["chats","characters","foreign"];', 0],
  ["dynamic string", 'const M=["chats",`char${part}acters`];', 0],
  ["identifier string is not evaluated", 'const id="chats";const M=[id,"characters"];', 0],
  ["empty array", "const M=[];", 0],
  ["omitted array element", 'const M=["chats",,"characters"];', 0],
  ["Partial Record", "const M:Partial<Record<ModalSlotId,string>>=build();", 1],
  ["literal and annotation stay separate findings", "const M:Record<SectionId,string>={chats:1,characters:2};", 2],
  ["config Record", "declare const M:Record<ConfigGroupId,string>;", 1],
  ["nested written Record type reference", "const M:Other<Record<SectionId,string>>=build();", 1],
  ["qualified written Record", "const M:Types.Record<SectionId,string>=build();", 1],
  ["render-local accumulator", "function C(){const M:Partial<Record<SectionId,string>>={};return M}", 0],
  ["function annotation consumes a map", "declare const render:(m:Record<SectionId,string>)=>void;", 0],
  ["type alias holds no value", "type M=Record<SectionId,string>;", 0],
  ["renamed id type stays textual", "const M:Record<OtherId,string>=build();", 0],
  ["written whitespace before angle stays distinct", "const M:Record <SectionId,string>=build();", 0],
  ["parenthesized type stays distinct", "const M:(Record<SectionId,string>)=build();", 0],
  ["namespace value is not module-level", "namespace N{export const M:Record<SectionId,string>=build()}", 0],
  ["derived list", "const M=registry.list().filter((d)=>d.mobilePrimary);", 0],
  ["unrelated exported tuple does not replace canonical owners", 'export const SECTION_IDS=["foreign"];const M={chats:1,characters:2};', 1],
  ["repeated chrome zone counts entries", 'const M=[{zone:"rail.nav"},{zone:"rail.nav"}];', 1],
  ["foreign chrome zone", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"},{zone:"setup"}];', 0],
  ["dynamic chrome zone", 'const M=[{zone:"rail.nav"},{zone:value}];', 0],
  ["wrapped chrome zone", 'const M=[{zone:("rail.nav"! as const)},{zone:`rail.brand`}];', 1],
  ["parenthesized chrome element stays indirect", 'const M=[({zone:"rail.nav"}),{zone:"rail.brand"}];', 0],
  ["single chrome element", 'const M=[{zone:"rail.nav"}];', 0],
] as const) {
  test(`native parallel map boundary ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, source)).toHaveLength(count);
  });
}

for (const [path, source, count] of [
  ["packages/client/src/features/x/lib/x-section.tsx", "const M={chats:1,characters:2};", 0],
  ["packages/client/src/features/x/lib/x-modal.tsx", 'const M=["command","newChat"];', 0],
  ["packages/client/src/features/x/lib/x-group.ts", "const M={personas:1,appearance:2};", 0],
  ["packages/client/src/features/x/lib/x-group.ts", "const M={chats:1,characters:2};", 1],
  ["packages/client/src/features/x/lib/nested/x-section.ts", "const M={chats:1,characters:2};", 1],
  ["packages/client/src/features/x/lib/-section.ts", "const M={chats:1,characters:2};", 1],
  ["packages/client/src/state/section-ids.ts", 'const M=["command","newChat"];', 0],
  ["packages/client/src/state/modal-slot-ids.ts", "const M={chats:1,characters:2};", 0],
  ["packages/client/src/state/config-group-ids.ts", "const M:Record<SectionId,string>=build();", 0],
  ["packages/client/src/state/shell-store.ts", "const M={personas:1,appearance:2};", 0],
  ["packages/client/src/compose/assemblies.ts", "const M={chats:1,characters:2};", 0],
  ["packages/client/src/main.tsx", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"}];', 0],
  ["packages/client/src/state/assemble-chrome.ts", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"}];', 0],
  ["packages/client/src/state/assemble-chrome.ts", "const M={chats:1,characters:2};", 1],
  ["packages/client/src/features/x/lib/x-chrome.tsx", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"}];', 0],
  ["packages/client/src/features/x/lib/x-section.tsx", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"}];', 1],
  ["packages/client/src/state/chrome-registry.ts", 'const M=[{zone:"rail.nav"},{zone:"rail.brand"}];', 1],
  ["packages/client/src/features/x/probe.gen.ts", "const M={chats:1,characters:2};", 1],
  ["packages/client/src/features/x/probe.d.ts", "declare const M:Record<SectionId,string>;", 1],
  ["packages/server/src/domain/x/probe.ts", "const M={chats:1,characters:2};", 0],
  ["packages/ui/src/lib/probe.tsx", "const M={chats:1,characters:2};", 0],
  ["tests/client/components/probe.ct.tsx", "const M={chats:1,characters:2};", 0],
] as const) {
  test(`native parallel map population ${path} ${source}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, source, path)).toHaveLength(count);
  });
}

test("native parallel map permissions cannot license another carrier or remain unused", async ({ repoRoot }) => {
  const permission = `// eslint-disable-next-line ${RULE} -- Bounded native permission control.\n`;
  const bad = "const M={chats:1,characters:2};";
  expect(await messages(repoRoot, permission + bad)).toEqual([]);
  expect(await messages(repoRoot, permission + bad + "\nconst N={chats:1,characters:2};")).toMatchObject([{ ruleId: RULE }]);
  expect(await messages(repoRoot, permission + "const clean=1;")).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

for (const [name, source] of [
  ["object map", "export const M={chats:1,characters:2};"],
  ["object id array", 'export const M=[{id:"chats"},{id:"characters"}];'],
  ["bare id array", 'export const M=["command","newChat"];'],
  ["module Record", "export const M:Record<SectionId,string>=build();"],
  ["chrome array", 'export const M=[{zone:"rail.nav"},{zone:"rail.brand"}];'],
] as const) {
  test(`native parallel map founding ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, source)).toMatchObject([{ ruleId: RULE }]);
  });
}
