import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { BUTTON_SIZE_OVERFLOW } from "../../../../packages/ui/src/primitives/button/size-hit-area.ts";
import { gate as suppressionGate } from "../../../../tooling/src/verify/gates/suppressions.ts";
import {
  affectsClientLexicalNativeLint,
  CLIENT_LEXICAL_NATIVE_INPUT_PATHS,
  CLIENT_LEXICAL_NATIVE_RULES,
} from "../../../../tooling/src/verify/lib/client-lexical-native.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/no-floorless-control-in-wrap";
const SUBJECT = "packages/client/src/features/rpg/components/probe.tsx";
const ROWS = [
  {
    files: {
      "packages/client/src/features/rpg/components/icon-grid.tsx":
        "const ICONS = ['a', 'b', 'c'];\nexport function IconGrid() {\n  return (\n    <div className=\"max-w-64 flex-wrap\">\n      {ICONS.map((name) => (\n        <Button key={name} size=\"glyph-lg\">{name}</Button>\n      ))}\n    </div>\n  );\n}\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/features/preset/components/two-verbs.tsx":
        'export function TwoVerbs() {\n  return (\n    <div className="flex-wrap">\n      <Button size="inline">a</Button>\n      <Button size="inline">b</Button>\n    </div>\n  );\n}\n',
    },
    count: 2,
  },
  {
    files: {
      "packages/client/src/features/rpg/components/pitch-editor.tsx":
        'const ATTRS = [\'a\', \'b\'];\nfunction AttributeRow({ k }: { k: string }) {\n  return (\n    <Row gap="field">\n      <span>{k}</span>\n      <Button size="inline">edit</Button>\n    </Row>\n  );\n}\nexport function Editor() {\n  return (\n    <Stack gap="field">\n      {ATTRS.map((k) => (\n        <AttributeRow key={k} k={k} />\n      ))}\n    </Stack>\n  );\n}\n',
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/features/preset/components/two-rows.tsx":
        'export function TwoRows() {\n  return (\n    <Stack gap="field">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/features/preset/components/floored-stack.tsx":
        'export function TwoRows() {\n  return (\n    <Stack gap="field" rows="control">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/features/preset/components/fenced-rows.tsx":
        'export function FencedRows() {\n  return (\n    <Stack gap="field">\n      <Row className="pointer-coarse:min-h-touch-target"><Button size="inline">a</Button></Row>\n      <Row className="min-h-control-sm"><Button size="inline">b</Button></Row>\n    </Stack>\n  );\n}\n',
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/features/preset/components/one-row.tsx":
        'export function OneRow() {\n  return (\n    <Stack gap="field">\n      <Row><Button size="inline">a</Button></Row>\n      <Row><span>plain text row</span></Row>\n    </Stack>\n  );\n}\n',
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/features/rpg/components/cross-file-rows.tsx":
        "import { TrackerValue } from \"#components/tracker-blocks\";\nconst XS = ['a', 'b'];\nexport function CrossFile() {\n  return (\n    <Stack gap=\"field\">\n      {XS.map((x) => (\n        <TrackerValue key={x} />\n      ))}\n    </Stack>\n  );\n}\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/components/tracker-blocks/ambient-strip.tsx":
        "const SKIES = ['clear', 'snow'];\nexport function Picker() {\n  return (\n    <div className=\"flex-wrap\">\n      {SKIES.map((s) => (\n        <Button key={s} size=\"sm\">{s}</Button>\n      ))}\n    </div>\n  );\n}\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/components/tracker-blocks/tracker-value.tsx":
        'export function Strip() {\n  return (\n    <div className="flex-wrap">\n      <span>Label</span>\n      <Button size="inline">the datum</Button>\n    </div>\n  );\n}\n',
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/features/databank/components/databank-library-row.tsx":
        "const CHIPS = ['a', 'b'];\nexport function Chips() {\n  return (\n    <div className=\"flex-wrap\">\n      {CHIPS.map((c) => (\n        <Badge key={c} size=\"inline\">{c}</Badge>\n      ))}\n    </div>\n  );\n}\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/features/rpg/components/no-wrap-grid.tsx":
        "const ICONS = ['a', 'b'];\nexport function Grid() {\n  return (\n    <div className=\"grid\">\n      {ICONS.map((c) => (\n        <Button key={c} size=\"glyph-md\">{c}</Button>\n      ))}\n    </div>\n  );\n}\n",
    },
    count: 0,
  },
] as const;

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await new ESLint({ cwd: ROOT }).calculateConfigForFile(join(ROOT, path));
  expect(config).toBeDefined();
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [RULE]: config.rules[RULE] ?? "off" },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

test("native floorless ownership preserves every declared collision and safe geometry case", async () => {
  for (const row of ROWS) {
    const [path, source] = Object.entries(row.files)[0] ?? [];
    if (path === undefined || source === undefined) {
      throw new Error("floorless fixture has no authored source");
    }
    expect(await findings(source, path), source).toHaveLength(row.count);
  }
});

test("same-file bodies, direct map grammar and literal carriers retain their declared limits", async () => {
  const row = '<Row><Button size="inline" /></Row>';
  const cases = [
    [`const Item = () => ${row}; const G=<Stack>{xs.map(x=><Item/>)}</Stack>;`, 1],
    [`const Item = function () {return ${row};}; const G=<Stack>{xs.map(x=><Item/>)}</Stack>;`, 1],
    [`function G(){const Item=()=>${row};return <Stack>{xs.map(x=><Item/>)}</Stack>;}`, 0],
    [`const Inner=()=>${row};const Outer=()=> <Inner/>;const G=<Stack>{xs.map(x=><Outer/>)}</Stack>;`, 0],
    [`const Item=(()=>${row});const G=<Stack>{xs.map(x=><Item/>)}</Stack>;`, 0],
    ['const G=<Row className="flex-wrap">{xs.map(((x)=><Button size="inline"/>))}</Row>;', 0],
    [`const G=<Stack>{xs.map(x=>((${row})))}</Stack>;`, 0],
    [`const G=<Stack>{(xs.map(x=>${row}))}</Stack>;`, 0],
    ['const G=<Row className="flex-wrap">{xs. map(x=><Button size="inline"/>)}</Row>;', 0],
    ['const G=<Row className="flex-wrap">{xs.map?.(x=><Button size="inline"/>)}</Row>;', 1],
    ['const G=<Row className="flex-wrap">{xs["map"](x=><Button size="inline"/>)}</Row>;', 0],
    ['const G=<Row className="flex-wrap">{xs.map(x=><Button size={"inline"}/>)}</Row>;', 0],
    ['const G=<Row className="flex-wrap">{xs.map(x=><Action size="inline"/>)}</Row>;', 0],
    ['const G=<Row className="flex-wrap">{xs.map(x=><UI.Button size="inline"/>)}</Row>;', 0],
    ['const G=<Stack><Row className={cn("min-h-control-sm")}><Button size="inline"/></Row><Row><Button size="inline"/></Row></Stack>;', 0],
    ['const G=<Row className="flex-wrap"><Button size="inline"/><Row className="flex-wrap"><Button size="inline"/></Row></Row>;', 1],
    ['const G=<Row className="flex-wrap">{xs.map(x=><Button size="inline-body"/>)}</Row>;', 1],
  ] as const;
  for (const [source, count] of cases) {
    expect(await findings(source), source).toHaveLength(count);
  }
});

test("every production size classification reaches native lint, including the prose recovery size", async () => {
  for (const [size, overflows] of Object.entries(BUTTON_SIZE_OVERFLOW)) {
    const source = `const G=<Row className="flex-wrap">{xs.map(x=><Button size="${size}"/>)}</Row>;`;
    expect(await findings(source), size).toHaveLength(overflows ? 1 : 0);
  }
});

const PERMISSIONS = [
  ["packages/client/src/features/rpg/components/rpg-actor-trackers.tsx", "glyph-xs"],
  ["packages/client/src/features/rpg/components/rpg-pack-rows.tsx", "glyph-lg"],
] as const;

test("the two coarse geometry exceptions are live native lines, not file or token exemptions", async () => {
  for (const [path, token] of PERMISSIONS) {
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(source).not.toContain("@orb-waive no-floorless-control-in-wrap");
    expect(await findings(source, path), path).toEqual([]);
    const bare = source.replace(/^.*eslint-disable-next-line orb\/no-floorless-control-in-wrap.*\r?\n/gmu, "");
    expect(await findings(bare, path), path).toMatchObject([{ ruleId: RULE }]);
    const marker = source.indexOf(`eslint-disable-next-line ${RULE}`);
    expect(marker).toBeGreaterThan(0);
    const fixed = source.slice(0, marker) + source.slice(marker).replace(`size="${token}"`, 'size="sm"');
    expect(await findings(fixed, path), path).toMatchObject([{ ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") }]);
    const fresh = `${source}\nexport const Unsafe=<Row className="flex-wrap">{xs.map(x=><Button size="inline"/>)}</Row>;`;
    expect(await findings(fresh, path), path).toMatchObject([{ ruleId: RULE }]);
  }
  const body = 'const G=<Row className="flex-wrap"><Button size="inline"/><Button size="glyph-lg"/></Row>;';
  expect(await findings(`// eslint-disable-next-line ${RULE} -- A native directive covers its line, not an individual token.\n${body}`)).toEqual([]);
  expect(await findings(`// eslint-disable-next-line ${RULE}-wrong -- Unknown native rule.\n${body}`)).toMatchObject([
    { ruleId: `${RULE}-wrong`, message: expect.stringContaining("was not found") },
    { ruleId: RULE },
    { ruleId: RULE },
  ]);
  expect(await findings(`// eslint-disable-next-line ${RULE} -- Stale source line.\nconst safe=1;\n${body}`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    { ruleId: RULE },
    { ruleId: RULE },
  ]);
});

test("native exception authority licenses exactly the reviewed source class and rejects a missing grant", () => {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const root = "/floorless-native-authority";
  for (const [path] of PERMISSIONS) {
    project.createSourceFile(`${root}/${path}`, readFileSync(join(ROOT, path), "utf8"));
  }
  const known = [suppressionGate];
  const grants = REVIEWED_GRANTS.filter((grant) => grant.policyId === suppressionGate.id);
  const run = (reviewedGrants: typeof grants): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({ knownPolicies: known, policies: known, project, root, reviewedGrants, failOnWarnings: false });
  const licensed = run(grants);
  expect(licensed.toolErrors).toEqual([]);
  const ruled = licensed.authority.grantedFindings.filter(({ finding }) => finding.subject === RULE);
  expect(ruled).toHaveLength(1);
  expect(ruled[0]?.finding.message).toContain(PERMISSIONS[0][0]);
  expect(ruled[0]?.finding.message).toContain(PERMISSIONS[1][0]);
  expect(licensed.authority.effectiveFindings.filter(({ subject }) => subject === RULE)).toEqual([]);
  const unlicensed = run(grants.filter(({ subject }) => subject !== RULE));
  expect(unlicensed.authority.effectiveFindings.filter(({ subject }) => subject === RULE)).toHaveLength(1);
});

test("ordinary scope and existing metadata admission own the canonical frontend population", async () => {
  const eslint = new ESLint({ cwd: ROOT });
  for (const path of [SUBJECT, "packages/ui/src/primitives/probe.tsx", "packages/client/src/probe.gen.tsx", "packages/ui/src/probe.d.ts"]) {
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config.rules[RULE], path).toEqual([2]);
  }
  for (const path of ["packages/server/src/probe.tsx", "tests/client/probe.ct.tsx", "tooling/src/probe.tsx"]) {
    expect(await findings('const G=<Row className="flex-wrap">{xs.map(x=><Button size="inline"/>)}</Row>;', path), path).toEqual([]);
  }
  const input = "packages/ui/src/primitives/button/size-hit-area.ts";
  expect(CLIENT_LEXICAL_NATIVE_RULES).toContain(RULE);
  expect(CLIENT_LEXICAL_NATIVE_INPUT_PATHS).toContain(input);
  expect(affectsClientLexicalNativeLint(input)).toBe(true);
  expect(affectsClientLexicalNativeLint("packages/ui/src/primitives/button")).toBe(true);
  const config = await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
  const expected = createHash("sha256")
    .update(JSON.stringify(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(ROOT, path), "utf8")])))
    .digest("hex");
  expect(config.settings["orb/client-lexical-inputs"]).toBe(expected);
  const ui = JSON.parse(readFileSync(join(ROOT, "packages/ui/package.json"), "utf8"));
  expect(ui).toHaveProperty(["exports", "./button/size-hit-area"], "./src/primitives/button/size-hit-area.ts");
  const recovery = "packages/client/src/features/chat/components/composer-next-turn-line.tsx";
  expect(await findings(readFileSync(join(ROOT, recovery), "utf8"), recovery)).toEqual([]);
});

test("generic map calls keep direct callbacks and reject parenthesized callback or return wrappers", async () => {
  const row = '<Row><Button size="inline"/></Row>';
  const cases = [
    ['const G=<Row className="flex-wrap">{xs.map<unknown>(x=><Button size="inline"/>)}</Row>;', 1],
    [`const G=<Stack>{xs.map<unknown>(x=>(${row}))}</Stack>;`, 1],
    ['const G=<Row className="flex-wrap">{xs.map?.<unknown>(x=><Button size="inline"/>)}</Row>;', 1],
    ['const G=<Row className="flex-wrap">{xs.map<unknown>((x=><Button size="inline"/>))}</Row>;', 0],
    [`const G=<Stack>{xs.map<unknown>(((x)=>${row}))}</Stack>;`, 0],
    [`const G=<Stack>{xs.map<unknown>(x=>((${row})))}</Stack>;`, 0],
  ] as const;
  for (const [source, count] of cases) {
    expect(await findings(source), source).toHaveLength(count);
  }
});
