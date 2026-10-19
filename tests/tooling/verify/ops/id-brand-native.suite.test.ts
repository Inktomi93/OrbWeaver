// The id-brand and response-body bans run as native ESLint rules; these controls drive the configured rules through
// the real flat config, one planted source per arm, so a rule that loses its scope or its selector goes red here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { deriveCanonicalBrandTypeNames, ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The first case loads the whole flat config, which dwarfs every later one.
const CONFIG_LOAD_TIMEOUT_MS = scaledBudget(60_000);

const FAKE_DISABLED = "orb/no-fake-disabled-id";
const LOOSE_CAST = "orb/no-loose-id-cast";
const RAW_ID = "orb/no-raw-id";
const WIRE_JSON = "orb/wire-json-parsed-at-consumer";

const CLIENT = "packages/client/src/data/probe.ts";
const SERVER = "packages/server/src/probe.ts";
const CONTRACTS = "packages/contracts/src/probe.ts";

const eslints = new Map<string, ESLint>();
const configs = new Map<string, ReturnType<ESLint["calculateConfigForFile"]>>();

async function configFor(root: string, filename: string): ReturnType<ESLint["calculateConfigForFile"]> {
  const key = `${root}\0${filename}`;
  let config = configs.get(key);
  if (config === undefined) {
    let eslint = eslints.get(root);
    if (eslint === undefined) {
      eslint = new ESLint({ cwd: root });
      eslints.set(root, eslint);
    }
    config = eslint.calculateConfigForFile(filename);
    configs.set(key, config);
  }
  return await config;
}

async function messages(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await configFor(root, filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules?.[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

type Row = readonly [name: string, source: string, count: number];

function rows(rule: string, path: string, table: readonly Row[]): void {
  for (const [name, source, count] of table) {
    test(
      `${rule} ${name}`,
      async ({ repoRoot }) => {
        expect(await messages(repoRoot, rule, source, path)).toHaveLength(count);
      },
      CONFIG_LOAD_TIMEOUT_MS,
    );
  }
}

rows(FAKE_DISABLED, CLIENT, [
  ["direct empty sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId("");\n', 1],
  ["single-quoted sentinel", "import { castId } from '@orb/kit/ids';\nexport const x = castId('');\n", 1],
  ["empty template sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId(``);\n', 1],
  ["typed call keeps the sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId<ChatId>("");\n', 1],
  ["cast operand cannot hide the sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId("" as string);\n', 1],
  ["two stacked assertions cannot hide the sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId("" as string as string);\n', 1],
  [
    "a template under two wrappers cannot hide the sentinel",
    'import { castId } from "@orb/kit/ids";\nexport const x = castId(`` satisfies string as string);\n',
    1,
  ],
  ["satisfies operand cannot hide the sentinel", 'import { castId } from "@orb/kit/ids";\nexport const x = castId("" satisfies string);\n', 1],
  ["namespace member", 'import * as ids from "@orb/kit/ids";\nexport const x = ids.castId("");\n', 1],
  ["computed namespace member", 'import * as ids from "@orb/kit/ids";\nexport const x = ids["castId"]("");\n', 1],
  ["an import alias is itself refused so no spelling hides the seam", 'import { castId as brand } from "@orb/kit/ids";\nexport const x = brand(1);\n', 1],
  ["an unresolvable door cannot hide the sentinel", 'import { castId } from "./nowhere.ts";\nexport const x = castId("");\n', 1],
  ["nonempty id", 'import { castId } from "@orb/kit/ids";\nexport const x = castId("chat_123");\n', 0],
  ["dynamic argument", 'import { castId } from "@orb/kit/ids";\nexport const x = castId(raw);\n', 0],
  ["template with a substitution", 'import { castId } from "@orb/kit/ids";\nexport const x = castId(`${raw}`);\n', 0],
  ["empty argument list", 'import { castId } from "@orb/kit/ids";\nexport const x = castId();\n', 0],
  ["unrelated helper", 'export const x = other("");\n', 0],
]);

rows(FAKE_DISABLED, SERVER, [["the sentinel is a query-key defect, so the server has no version of it", 'export const x = castId("");\n', 0]]);

test(
  `${FAKE_DISABLED} a line permission names the rule and is consumed`,
  async ({ repoRoot }) => {
    const permission = `// eslint-disable-next-line ${FAKE_DISABLED} -- Bounded native permission control.\n`;
    const bad = 'export const x = castId("");\n';
    expect(await messages(repoRoot, FAKE_DISABLED, permission + bad, CLIENT)).toEqual([]);
    expect(await messages(repoRoot, FAKE_DISABLED, `${permission}export const y = 1;\n`, CLIENT)).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  },
  CONFIG_LOAD_TIMEOUT_MS,
);

const BRAND_IMPORT = 'import type { UserId, ChatId } from "@orb/kit/ids";\n';

rows(LOOSE_CAST, SERVER, [
  ["never disables every assignability check", "export const x = value as never;\n", 1],
  ["a parenthesized operand is still a never cast", "export const x = (async () => value) as never;\n", 1],
  ["double cast into a canonical brand", `${BRAND_IMPORT}export const x = value as unknown as UserId;\n`, 1],
  ["double cast into a canonical entity brand", `${BRAND_IMPORT}export const x = value as unknown as ChatId;\n`, 1],
  ["parenthesized inner cast", `${BRAND_IMPORT}export const x = (value as unknown) as UserId;\n`, 1],
  ["parenthesized const-asserted operand", `${BRAND_IMPORT}export const x = ("" as const) as unknown as UserId;\n`, 1],
  ["nested parentheses around the value", `${BRAND_IMPORT}export const x = ((value) as unknown) as UserId;\n`, 1],
  ["satisfies around the completed laundering pair", `${BRAND_IMPORT}export const x = (value as unknown as UserId) satisfies UserId;\n`, 1],
  ["the generic brand constructor", 'import type { Branded } from "@orb/kit/ids";\nexport const x = value as unknown as Branded<"Foo">;\n', 1],
  ["the entity brand constructor", 'import type { TypeIdOf } from "@orb/kit/ids";\nexport const x = value as unknown as TypeIdOf<"chat">;\n', 1],
  ["a namespace-qualified brand", 'import type * as ids from "@orb/kit/ids";\nexport const x = value as unknown as ids.UserId;\n', 1],
  ["the explicit helper is not a broad cast", `${BRAND_IMPORT}export const x = castId<UserId>(value);\n`, 0],
  ["a single cast into a brand stays checked by tsc", `${BRAND_IMPORT}export const x = value as UserId;\n`, 0],
  ["satisfies around a single brand cast", `${BRAND_IMPORT}export const x = (value as UserId) satisfies UserId;\n`, 0],
  ["a double cast to a non-brand is another policy", "export const x = value as unknown as string;\n", 0],
  ["a nullable brand union carries no canonical brand property", `${BRAND_IMPORT}export const x = value as unknown as UserId | null;\n`, 0],
  ["unknown alone is not a brand", "export const x = value as unknown;\n", 0],
]);

rows(LOOSE_CAST, "tests/server/domain/x/verb.test.ts", [
  ["tests are judged: a test-side never is the same disabled check", "export const y = value as never;\n", 1],
]);
rows(LOOSE_CAST, "tests/legacy/server/x/verb.test.ts", [
  ["the legacy tree is judged too: its former waivers are bulk suppressions", "export const y = value as never;\n", 1],
]);
rows(LOOSE_CAST, "scripts/x.ts", [["scripts are outside this population", "export const x = value as never;\n", 0]]);
rows(LOOSE_CAST, "packages/inference/src/x.ts", [["every shipped product root is judged", "export const x = value as never;\n", 1]]);

test(
  `${LOOSE_CAST} a line permission names the rule and is consumed`,
  async ({ repoRoot }) => {
    const permission = `// eslint-disable-next-line ${LOOSE_CAST} -- Bounded native permission control.\n`;
    expect(await messages(repoRoot, LOOSE_CAST, `${permission}export const x = value as never;\n`, SERVER)).toEqual([]);
    expect(await messages(repoRoot, LOOSE_CAST, `${permission}export const y = 1;\n`, SERVER)).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  },
  CONFIG_LOAD_TIMEOUT_MS,
);

test("the canonical brand roster is read from the kit ids home, not retyped", ({ repoRoot }) => {
  const names = deriveCanonicalBrandTypeNames(readFileSync(join(repoRoot, ID_BRAND_HOME), "utf8"));
  expect(names).toEqual(expect.arrayContaining(["Branded", "TypeIdOf", "UserId", "ChatId", "VerifiedUserId"]));
  expect(names).not.toContain("RawIdGenerator");
  expect(deriveCanonicalBrandTypeNames("export type Plain = string;\nexport type Local = Branded<'x'>;\n")).toEqual(["Branded", "TypeIdOf", "Local"]);
});

const ZOD = 'import { z } from "zod";\n';

rows(RAW_ID, CONTRACTS, [
  ["a raw id field loses its brand", `${ZOD}export const schema = z.object({ userId: z.string() });\n`, 1],
  ["wrapper chains cannot hide the raw string root", `${ZOD}export const schema = z.object({ chatId: z.string().nullable().optional() });\n`, 1],
  ["an aliased z", 'import { z as schema } from "zod";\nexport const value = schema.object({ chatId: schema.string().nullable() });\n', 1],
  ["the bare builder export", 'import { string } from "zod";\nexport const schema = { userId: string() };\n', 1],
  ["a renamed bare builder export", 'import { string as text } from "zod";\nexport const schema = { userId: text() };\n', 1],
  ["the namespace spelling", 'import * as z from "zod";\nexport const schema = { userId: z.string() };\n', 1],
  ["a namespace member", 'import * as zod from "zod";\nexport const schema = { userId: zod.z.string() };\n', 1],
  ["a computed builder member", `${ZOD}export const schema = { userId: z["string"]() };\n`, 1],
  ["a string-literal key", `${ZOD}export const schema = { "userId": z.string() };\n`, 1],
  ["a parenthesized builder", `${ZOD}export const schema = { userId: ((z.string))() };\n`, 1],
  ["a zod subpath door", 'import { z } from "zod/v4";\nexport const schema = { userId: z.string() };\n', 1],
  ["the coerce builder is still a raw string", `${ZOD}export const schema = z.object({ ownerId: z.coerce.string() });\n`, 1],
  ["a bare coerce import", 'import { coerce } from "zod";\nexport const schema = { ownerId: coerce.string() };\n', 1],
  ["a const-bound builder", `${ZOD}const str = z.string;\nexport const schema = { chatId: str() };\n`, 1],
  ["a const bound to the coerce builder", `${ZOD}const str = z.coerce.string;\nexport const schema = { chatId: str() };\n`, 1],
  ["a builder rebound through two consts", `${ZOD}const first = z.string;\nconst second = first;\nexport const schema = { chatId: second() };\n`, 1],
  ["a const bound to a project builder is not zod", 'import { text } from "./local-zod";\nconst str = text;\nexport const schema = { chatId: str() };\n', 0],
  ["a reassigned binding is not a stable builder", `${ZOD}let str = z.string;\nstr = () => ({});\nexport const schema = { chatId: str() };\n`, 0],
  ["two raw ids keep two findings", `${ZOD}export const schema = { userId: z.string(), chatId: z.string() };\n`, 2],
  ["the canonical validating schema", 'import { typeIdSchema } from "@orb/kit/ids";\nexport const schema = { userId: typeIdSchema("user") };\n', 0],
  ["ordinary strings with no id position", `${ZOD}export const schema = z.object({ username: z.string() });\n`, 0],
  ["a different builder at an id position", `${ZOD}export const schema = z.object({ userId: z.number() });\n`, 0],
  ["a local same-named builder is not zod evidence", "const z = { string: () => ({}) };\nexport const schema = { userId: z.string() };\n", 0],
  ["an inner binding shadows the import", `${ZOD}{\n  const z = { string: () => ({}) };\n  const value = { shadowId: z.string() };\n}\n`, 0],
  ["a project module spelling itself z is not zod", 'import { z } from "./local-zod";\nexport const schema = { userId: z.string() };\n', 0],
  ["a computed key is not an id name", `${ZOD}const userId = "x";\nexport const schema = { [userId]: z.string() };\n`, 0],
  ["a shorthand property has no builder", `${ZOD}const userId = z.string();\nexport const schema = { userId };\n`, 0],
  ["a lowercase suffix is not an id name", `${ZOD}export const schema = { valid: z.string() };\n`, 0],
]);

rows(RAW_ID, "tooling/src/probe.ts", [["the authored tooling tree is judged too", `${ZOD}export const schema = { runId: z.string() };\n`, 1]]);
rows(RAW_ID, "tests/legacy/x/probe.ts", [["the legacy tree is judged too", `${ZOD}export const schema = { runId: z.string() };\n`, 1]]);

test(
  `${RAW_ID} a line permission names the rule and is consumed`,
  async ({ repoRoot }) => {
    const permission = `// eslint-disable-next-line ${RAW_ID} -- Bounded native permission control.\n`;
    expect(await messages(repoRoot, RAW_ID, `${ZOD}export const s = {\n  ${permission}  requestId: z.string(),\n};\n`, CONTRACTS)).toEqual([]);
    expect(await messages(repoRoot, RAW_ID, `${ZOD}${permission}export const s = 1;\n`, CONTRACTS)).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  },
  CONFIG_LOAD_TIMEOUT_MS,
);

const ROW_TYPE = "interface Row { readonly id: string }\n";

rows(WIRE_JSON, CLIENT, [
  ["an awaited body cast to a hand-spelled shape", `${ROW_TYPE}export const read = async (res: Response): Promise<Row> => (await res.json()) as Row;\n`, 1],
  ["a satisfies over the body", `${ROW_TYPE}export const read = async (res: Response) => (await res.json()) satisfies Row;\n`, 1],
  ["an unawaited Promise cast", `${ROW_TYPE}export const read = (res: Response): Promise<Row> => res.json() as Promise<Row>;\n`, 1],
  [
    "a then callback returning the body, as an expression",
    `${ROW_TYPE}export const load = (u: string): Promise<Row> => fetch(u).then((r) => r.json()) as Promise<Row>;\n`,
    1,
  ],
  [
    "a then callback returning the body, as a final return",
    `${ROW_TYPE}export const load = (u: string): Promise<Row> => fetch(u).then(function (r) {\n  return r.json();\n}) as Promise<Row>;\n`,
    1,
  ],
  ["JSON.parse over the text body", `${ROW_TYPE}export const load = async (res: Response): Promise<Row> => JSON.parse(await res.text()) as Row;\n`, 1],
  [
    "an unknown step does not launder the body",
    `${ROW_TYPE}export async function read(res: Response): Promise<Row> {\n  return (await res.json()) as unknown as Row;\n}\n`,
    1,
  ],
  [
    "a body held in an unreassigned const",
    `${ROW_TYPE}export async function read(res: Response): Promise<Row> {\n  const body = await res.json();\n  return body as Row;\n}\n`,
    1,
  ],
  [
    "a body held in an unreassigned let",
    `${ROW_TYPE}export async function read(res: Response): Promise<Row> {\n  let body = await res.json();\n  return body as Row;\n}\n`,
    1,
  ],
  [
    "a local body inside a then block",
    `${ROW_TYPE}export const inThen = (u: string): Promise<Row> => fetch(u).then(async (r) => {\n  const b = await r.json();\n  return b;\n}) as Promise<Row>;\n`,
    1,
  ],
  [
    "the bracket spelling of the body read",
    `${ROW_TYPE}export async function read(res: Response): Promise<Row> {\n  return (await res["json"]()) as Row;\n}\n`,
    1,
  ],
  [
    "the bracket spelling of the then callback",
    `${ROW_TYPE}export const chained = (u: string): Promise<Row> => fetch(u)["then"]((r) => r["json"]()) as Promise<Row>;\n`,
    1,
  ],
  [
    "the bracket spelling of JSON.parse over text",
    `${ROW_TYPE}export const texted = async (res: Response): Promise<Row> => JSON["parse"](await res["text"]()) as Row;\n`,
    1,
  ],
  [
    "a cast and a satisfies each keep their finding",
    `${ROW_TYPE}export const peek = async (res: Response): Promise<{ readonly error?: string }> => (await res.json()) satisfies { readonly error?: string } as never;\n`,
    1,
  ],
  [
    "the remedy is a schema parse",
    "declare const schema: { parse(value: unknown): { id: string } };\nexport const parsed = async (res: Response) => schema.parse(await res.json());\n",
    0,
  ],
  [
    "the remedy inside a then callback",
    "declare const schema: { parse(value: unknown): { id: string } };\nexport const viaSchema = (u: string): Promise<{ id: string }> => fetch(u).then(async (r) => schema.parse(await r.json()));\n",
    0,
  ],
  [
    "the bracket spelling of the remedy",
    'declare const schema: { parse(value: unknown): { id: string } };\nexport const parsed = async (res: Response) => schema.parse(await res["json"]());\n',
    0,
  ],
  [
    "the bracket spelling of a json method that takes an argument",
    'declare const doc: { json(key: string): unknown };\nexport const other = (): string => doc["json"]("k") as string;\n',
    0,
  ],
  ["the bracket spelling of an unknown target", 'export const opaque = async (res: Response): Promise<unknown> => (await res["json"]()) as unknown;\n', 0],
  ["an unknown target stays opaque", "export const opaque = async (res: Response): Promise<unknown> => (await res.json()) as unknown;\n", 0],
  [
    "an unknown Promise target through then",
    "export const chained = (u: string): Promise<unknown> => fetch(u).then((r) => r.json()) as Promise<unknown>;\n",
    0,
  ],
  [
    "a literal of only unknown members stays opaque",
    "export const open = async (res: Response): Promise<{ readonly error?: unknown }> => (await res.json()) as { readonly error?: unknown; readonly written?: { readonly json?: unknown } };\n",
    0,
  ],
  [
    "a json method that takes an argument",
    'declare const doc: { json(key: string): unknown };\nexport const other = (): string => doc.json("k") as string;\n',
    0,
  ],
  [
    "JSON.parse of a string that is not a text body",
    "declare const stored: string;\nexport const local = (): { id: string } => JSON.parse(stored) as { id: string };\n",
    0,
  ],
  [
    "a reassigned local is not followed",
    "declare const schema: { parse(value: unknown): { id: string } };\nexport async function reassigned(res: Response): Promise<{ id: string }> {\n  let body: unknown = await res.json();\n  body = schema.parse(body);\n  return body as { id: string };\n}\n",
    0,
  ],
  [
    "a parameter shadows an outer body const",
    "const outer = fetch('/x').then((r) => r.json());\nexport const shadow = (outer: unknown): { id: string } => outer as { id: string };\n",
    0,
  ],
  [
    "an inner block binding shadows an outer body const",
    "declare const schema: { parse(value: unknown): { id: string } };\nexport async function inner(res: Response): Promise<{ id: string }> {\n  const body = await res.json();\n  {\n    let body: unknown = schema.parse(await res.json());\n    return body as { id: string };\n  }\n}\n",
    0,
  ],
  [
    "a destructured body is not a single-binding hop",
    `${ROW_TYPE}export async function read(res: Response): Promise<Row> {\n  const { id } = await res.json();\n  return id as Row;\n}\n`,
    0,
  ],
]);

rows(WIRE_JSON, "packages/server/src/infra/upstream/read.ts", [
  ["the former server exclusion is removed", `${ROW_TYPE}export const read = async (res: Response): Promise<Row> => (await res.json()) as Row;\n`, 1],
]);
rows(WIRE_JSON, "packages/inference/src/catalog/read.ts", [
  [
    "inference plain-fetch reads are admitted",
    `${ROW_TYPE}export const read = async (res: Response): Promise<Row> => JSON["parse"](await res["text"]()) as Row;\n`,
    1,
  ],
]);
rows(WIRE_JSON, "tooling/src/probe/x.ts", [
  [
    "tooling is outside the application wire-reader population",
    `${ROW_TYPE}export const read = async (res: Response): Promise<Row> => (await res.json()) as Row;\n`,
    0,
  ],
]);

test(
  `${WIRE_JSON} a line permission names the rule and is consumed`,
  async ({ repoRoot }) => {
    const bad = `${ROW_TYPE}export const read = async (res: Response): Promise<Row> => (await res.json()) as Row;\n`;
    const permission = `// eslint-disable-next-line ${WIRE_JSON} -- Bounded native permission control.\n`;
    expect(await messages(repoRoot, WIRE_JSON, `${ROW_TYPE}${permission}${bad.slice(ROW_TYPE.length)}`, CLIENT)).toEqual([]);
    expect(await messages(repoRoot, WIRE_JSON, `${permission}export const y = 1;\n`, CLIENT)).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  },
  CONFIG_LOAD_TIMEOUT_MS,
);
