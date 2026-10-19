import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptsNamedToolChoice,
  acceptsRequiredToolChoice,
  checkWireSchema,
  countWireSchemas,
  STRUCTURED_VEHICLES,
  scrubViolations,
  scrubWireSchema,
  WIRE_SCHEMA_KEYWORD_VOCABULARY,
} from "@orb/contracts/inference";
import { createMacroContext, evaluateMacros, processMacros, resolveRowMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { MODEL_PROSE_SEAM_FILES, MODEL_PROSE_SEAM_PREFIXES } from "../../../../tooling/src/verify/contract/model-prose-seam.ts";
import { scaledBudget } from "../../_load-budget.ts";

const STRUCTURED = "orb/structured-plan-one-home";
const WIRE_VOCABULARY = "orb/wire-schema-vocab-one-home";
const MACRO = "orb/macro-resolution-home";
const CONTENT_PART = "orb/content-part-seam";
const PROSE = "orb/no-hardcoded-model-prose";

async function messages(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      settings: config.settings,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

type Row = readonly [name: string, rule: string, path: string, source: string, count: number];

function each(rows: readonly Row[]): void {
  for (const [name, rule, path, source, count] of rows) {
    test(
      `${rule} ${name}`,
      async ({ repoRoot }) => {
        const found = await messages(repoRoot, rule, source, path);
        expect(found).toHaveLength(count);
        expect(found.every(({ ruleId }) => ruleId === rule)).toBe(true);
      },
      scaledBudget(60_000),
    );
  }
}

const SERVER_FILE = "packages/server/src/domain/x/probe.ts";
const CLIENT_FILE = "packages/client/src/features/x/probe.tsx";

// ── structured-plan-one-home ────────────────────────────────────────────────────────────────────────────
const PLANNER_INTERNALS = ["scrubWireSchema", "scrubViolations", "countWireSchemas", "acceptsNamedToolChoice", "acceptsRequiredToolChoice"] as const;

test("the planner internals the ban names are still exported by the inference contract", () => {
  const exported: Readonly<Record<(typeof PLANNER_INTERNALS)[number], unknown>> = {
    scrubWireSchema,
    scrubViolations,
    countWireSchemas,
    acceptsNamedToolChoice,
    acceptsRequiredToolChoice,
  };
  for (const name of PLANNER_INTERNALS) {
    expect(typeof exported[name], name).toBe("function");
  }
  expect(typeof checkWireSchema).toBe("function");
  expect(STRUCTURED_VEHICLES.length).toBeGreaterThan(0);
});

each([
  ...PLANNER_INTERNALS.map(
    (name): Row => [
      `flags a named import of ${name}`,
      STRUCTURED,
      SERVER_FILE,
      `import { ${name} } from "@orb/contracts/inference";\nexport const x = ${name};\n`,
      1,
    ],
  ),
  ["flags an aliased import", STRUCTURED, SERVER_FILE, 'import { scrubWireSchema as scrub } from "@orb/contracts/inference";\nexport const x = scrub;\n', 1],
  ["flags a type-only import specifier", STRUCTURED, SERVER_FILE, 'import { type scrubWireSchema } from "@orb/contracts/inference";\n', 1],
  ["flags the inference package door", STRUCTURED, SERVER_FILE, 'import { scrubViolations } from "@orb/inference";\nexport const x = scrubViolations;\n', 1],
  [
    "flags a relative path into the inference folder",
    STRUCTURED,
    SERVER_FILE,
    'import { countWireSchemas } from "../../../../contracts/src/inference/wire-limits.ts";\n',
    1,
  ],
  ["flags a re-export under an alias", STRUCTURED, SERVER_FILE, 'export { scrubWireSchema as scrub } from "@orb/contracts/inference";\n', 1],
  ["flags a namespace member", STRUCTURED, SERVER_FILE, 'import * as inf from "@orb/contracts/inference";\nexport const x = inf.scrubWireSchema;\n', 1],
  [
    "flags a bracket namespace member",
    STRUCTURED,
    SERVER_FILE,
    'import * as inf from "@orb/contracts/inference";\nexport const x = inf["countWireSchemas"];\n',
    1,
  ],
  [
    "passes the allowed check API",
    STRUCTURED,
    SERVER_FILE,
    'import { checkWireSchema } from "@orb/contracts/inference";\nexport const x = checkWireSchema;\n',
    0,
  ],
  [
    "passes the allowed namespace member",
    STRUCTURED,
    SERVER_FILE,
    'import * as inf from "@orb/contracts/inference";\nexport const x = inf.checkWireSchema;\n',
    0,
  ],
  [
    "passes the same name from a module outside inference",
    STRUCTURED,
    SERVER_FILE,
    'import { scrubWireSchema } from "./local.ts";\nexport const x = scrubWireSchema;\n',
    0,
  ],
  ...STRUCTURED_VEHICLES.map(
    (vehicle): Row => [`flags the vehicle literal ${vehicle}`, STRUCTURED, SERVER_FILE, `export const format = { vehicle: "${vehicle}" };\n`, 1],
  ),
  ["flags a substitution-free template vehicle", STRUCTURED, SERVER_FILE, "export const v = `forced-tool`;\n", 1],
  ["flags a vehicle literal in a type position", STRUCTURED, SERVER_FILE, 'export type V = "response-format";\n', 1],
  ["passes a vehicle word in a comment", STRUCTURED, SERVER_FILE, '// the forced-tool vehicle collapses the map\nexport const x = "response format";\n', 0],
  ["flags a toolChoice object member", STRUCTURED, SERVER_FILE, 'export const request = { tools: [], toolChoice: { mode: "required" } };\n', 1],
  ["flags a shorthand toolChoice member", STRUCTURED, SERVER_FILE, "const toolChoice = 1;\nexport const request = { toolChoice };\n", 1],
  ["flags a quoted toolChoice key", STRUCTURED, SERVER_FILE, 'export const request = { "toolChoice": "auto" };\n', 1],
  ["flags a toolChoice assignment", STRUCTURED, CLIENT_FILE, 'export function f(req: { toolChoice?: string }): void {\n  req.toolChoice = "auto";\n}\n', 1],
  [
    "flags a quoted bracket toolChoice assignment",
    STRUCTURED,
    CLIENT_FILE,
    'export function f(req: { toolChoice?: string }): void {\n  req["toolChoice"] = "auto";\n}\n',
    1,
  ],
  [
    "flags a substitution-free template key assignment",
    STRUCTURED,
    CLIENT_FILE,
    "export function f(req: { toolChoice?: string }): void {\n  req[`toolChoice`] = 'auto';\n}\n",
    1,
  ],
  [
    "flags a const-bound key assignment",
    STRUCTURED,
    CLIENT_FILE,
    'const KEY = "toolChoice";\nexport function f(req: { toolChoice?: string }): void {\n  req[KEY] = "auto";\n}\n',
    1,
  ],
  [
    "flags a const-bound key behind as const in an object literal",
    STRUCTURED,
    SERVER_FILE,
    'const KEY = "toolChoice" as const;\nexport const request = { [KEY]: "auto" };\n',
    1,
  ],
  [
    "passes a let binding, a non-literal const and a const naming another member",
    STRUCTURED,
    CLIENT_FILE,
    'let mutable = "toolChoice";\nconst computed = String(mutable);\nconst OTHER = "label";\nexport function f(req: { label?: string }): void {\n  req[mutable] = "auto";\n  req[computed] = "auto";\n  req[OTHER] = "auto";\n}\n',
    0,
  ],
  [
    "passes a for-of const binding that has no initializer",
    STRUCTURED,
    CLIENT_FILE,
    "export function f(req: Record<string, string>, keys: readonly string[]): void {\n  for (const key of keys) {\n    req[key] = 'auto';\n  }\n}\n",
    0,
  ],
  [
    "passes a shadowing parameter that hides the const key",
    STRUCTURED,
    CLIENT_FILE,
    'const KEY = "toolChoice";\nexport function f(req: Record<string, string>, KEY: string): void {\n  req[KEY] = "auto";\n}\n',
    0,
  ],
  [
    "passes reads, destructuring, other members and a dynamic key",
    STRUCTURED,
    CLIENT_FILE,
    'export function f(req: { toolChoice?: string; label?: string }, key: string): string | undefined {\n  const { toolChoice } = req;\n  req["label"] = "auto";\n  req[key] = "auto";\n  return req.toolChoice ?? req["toolChoice"] ?? toolChoice;\n}\n',
    0,
  ],
  ["passes a toolChoice type member", STRUCTURED, SERVER_FILE, "export interface Request { toolChoice?: string }\n", 0],
  ["covers the contracts package", STRUCTURED, "packages/contracts/src/refinery/x.ts", 'export const x = "forced-tool";\n', 1],
  ["covers the kit package", STRUCTURED, "packages/kit/src/json-schema/x.ts", 'export const x = "offered-tool";\n', 1],
  ["leaves the inference contract folder alone", STRUCTURED, "packages/contracts/src/inference/x.ts", 'export const x = "forced-tool";\n', 0],
  ["leaves tests alone", STRUCTURED, "packages/server/src/domain/x/probe.test.ts", 'export const request = { toolChoice: "forced-tool" };\n', 0],
  [
    "leaves the inference package alone",
    STRUCTURED,
    "packages/inference/src/structured/probe.ts",
    'export const request = { toolChoice: "forced-tool" };\n',
    0,
  ],
]);

// ── wire-schema-vocab-one-home ──────────────────────────────────────────────────────────────────────────
const VOCABULARY = WIRE_SCHEMA_KEYWORD_VOCABULARY;
const [FIRST, SECOND] = VOCABULARY;
const LIFT = "packages/kit/src/json-schema/lift.ts";
const ENGINE_FILE = "packages/server/src/infra/probe.ts";

test("the wire vocabulary has the keywords of every engine tuple", () => {
  expect(VOCABULARY).toEqual(expect.arrayContaining(["minLength", "$schema", "title"]));
});

each([
  ...VOCABULARY.map((keyword): Row => {
    const partner = keyword === "title" ? "default" : "title";
    return [`flags ${keyword} spelled beside a second keyword`, WIRE_VOCABULARY, ENGINE_FILE, `export const DROP = ["${keyword}", "${partner}"];\n`, 1];
  }),
  [
    "flags two keywords in separate statements as one finding",
    WIRE_VOCABULARY,
    ENGINE_FILE,
    `export const a = "${FIRST}";\nexport const b = "${SECOND}";\nexport const c = "minLength";\n`,
    1,
  ],
  ["flags substitution-free templates", WIRE_VOCABULARY, ENGINE_FILE, `export const a = \`${FIRST}\`;\nexport const b = \`${SECOND}\`;\n`, 1],
  ["covers the kit package", WIRE_VOCABULARY, "packages/kit/src/wire/subset2.ts", 'export const TABLE = ["minLength", "title"];\n', 1],
  [
    "covers the inference package",
    WIRE_VOCABULARY,
    "packages/inference/src/backends/vendor/schema.ts",
    'export const DROP = ["minLength", "maxLength", "$schema"];\n',
    1,
  ],
  ["passes one ordinary-English keyword", WIRE_VOCABULARY, ENGINE_FILE, 'export const DEFAULT_LABEL = "default";\n', 0],
  ["passes one keyword spelled twice", WIRE_VOCABULARY, ENGINE_FILE, 'export const a = "title";\nexport const b = "title";\n', 0],
  ["passes a template with an interpolation", WIRE_VOCABULARY, ENGINE_FILE, 'export const a = `title ${x}`;\nexport const b = "default";\n', 0],
  ["passes keywords used as identifiers", WIRE_VOCABULARY, ENGINE_FILE, "export const title = 1;\nexport const pattern = 2;\n", 0],
  ["leaves the inverse lift reader alone", WIRE_VOCABULARY, LIFT, 'export const bounds = ["minLength", "maxLength"];\n', 0],
  ["leaves tests alone", WIRE_VOCABULARY, "packages/server/src/infra/probe.test.ts", 'export const bounds = ["minLength", "maxLength"];\n', 0],
  ["leaves the engine package alone", WIRE_VOCABULARY, "packages/contracts/src/inference/other.ts", 'export const bounds = ["minLength", "maxLength"];\n', 0],
  ["leaves the client alone", WIRE_VOCABULARY, CLIENT_FILE, 'export const bounds = ["minLength", "maxLength"];\n', 0],
]);

test("the inverse lift reader still spells the wire vocabulary, so its home entry is live", () => {
  const spelled = VOCABULARY.filter((keyword) => readFileSync(LIFT, "utf8").includes(`"${keyword}"`));
  expect(spelled.length).toBeGreaterThanOrEqual(2);
});

// ── macro-resolution-home ───────────────────────────────────────────────────────────────────────────────
const MACRO_RESOLVERS = ["resolveRowMacros", "processMacros", "createMacroContext", "evaluateMacros", "renderMessageForDisplay"] as const;
const MACRO_HOMES = [
  "packages/client/src/features/chat/components/ghost-message-row.tsx",
  "packages/client/src/features/chat/components/message-content.tsx",
  "packages/client/src/lib/message-render.ts",
  "packages/client/src/features/chat/components/message-row-parts.tsx",
] as const;
const EDITOR = "packages/client/src/features/preset/probe.tsx";

test("every macro resolver the ban names is still declared", () => {
  expect([resolveRowMacros, processMacros, createMacroContext, evaluateMacros].map((resolver) => typeof resolver)).toEqual([
    "function",
    "function",
    "function",
    "function",
  ]);
  expect(readFileSync("packages/client/src/lib/message-render.ts", "utf8")).toContain("export function renderMessageForDisplay(");
});

test("each read-only macro home still names a resolver, so its home entry is live", () => {
  for (const home of MACRO_HOMES) {
    expect(existsSync(home), home).toBe(true);
    expect(
      MACRO_RESOLVERS.some((name) => readFileSync(home, "utf8").includes(name)),
      home,
    ).toBe(true);
  }
});

each([
  ...MACRO_RESOLVERS.map(
    (name): Row => [`flags an import of ${name}`, MACRO, EDITOR, `import { ${name} } from "@orb/kit/macro";\nexport const x = ${name};\n`, 1],
  ),
  ...MACRO_RESOLVERS.map(
    (name): Row => [`flags a bare call of ${name}`, MACRO, EDITOR, `declare function ${name}(...args: unknown[]): unknown;\n${name}();\n`, 1],
  ),
  ["flags an aliased import", MACRO, EDITOR, 'import { processMacros as run } from "@orb/kit/macro";\nexport const x = run;\n', 1],
  ["flags an import and its call as two sites", MACRO, EDITOR, 'import { processMacros } from "@orb/kit/macro";\nprocessMacros("{{user}}");\n', 2],
  [
    "covers the ui package",
    MACRO,
    "packages/ui/src/primitives/probe.tsx",
    'import { processMacros } from "@orb/kit/macro";\nexport const x = processMacros;\n',
    1,
  ],
  ["passes the tokenizer", MACRO, EDITOR, 'import { scanMacroRuns } from "@orb/kit/macro";\nscanMacroRuns("{{user}}");\n', 0],
  ["passes a namespace member call", MACRO, EDITOR, 'import * as macro from "@orb/kit/macro";\nmacro.processMacros("{{user}}");\n', 0],
  [
    "leaves the server alone",
    MACRO,
    "packages/server/src/domain/chat/assembly/probe.ts",
    'import { processMacros } from "@orb/kit/macro";\nprocessMacros("x");\n',
    0,
  ],
  ...MACRO_HOMES.map(
    (home): Row => [`leaves the home ${home} alone`, MACRO, home, 'import { processMacros } from "@orb/kit/macro";\nprocessMacros("x");\n', 0],
  ),
]);

// ── content-part-seam ───────────────────────────────────────────────────────────────────────────────────
const CONTENT_PART_HOMES = [
  "packages/server/src/domain/chat/contract/results.ts",
  "packages/server/src/domain/chat/substrate/wire-history.ts",
  "packages/inference/src/contract/chat.ts",
  "packages/inference/src/backends/wire/history.ts",
  "packages/inference/src/backends/v4/prompt.ts",
] as const;
const VERB_FILE = "packages/server/src/domain/chat/verbs/probe.ts";

test("the chat contracts home still declares the content part, so the ban has a subject", () => {
  const home = "packages/contracts/src/chat";
  const declared = readdirSync(home).filter((file) => file.endsWith(".ts") && /export type ChatContentPart\b/u.test(readFileSync(join(home, file), "utf8")));
  expect(declared.length).toBeGreaterThan(0);
});

test("each sealed content-part consumer still names the type, so its home entry is live", () => {
  for (const home of CONTENT_PART_HOMES) {
    expect(existsSync(home), home).toBe(true);
    expect(readFileSync(home, "utf8"), home).toContain("ChatContentPart");
  }
});

each([
  ["flags the founding import", CONTENT_PART, VERB_FILE, 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type T = ChatContentPart;\n', 1],
  ["flags an aliased import", CONTENT_PART, VERB_FILE, 'import type { ChatContentPart as Part } from "@orb/contracts/chat";\nexport type T = Part;\n', 1],
  [
    "flags an import through a relative barrel",
    CONTENT_PART,
    VERB_FILE,
    'import type { ChatContentPart } from "../../../../../contracts/src/chat/index.ts";\n',
    1,
  ],
  ["flags an inline type specifier", CONTENT_PART, VERB_FILE, 'import { type ChatContentPart } from "@orb/contracts/chat";\n', 1],
  [
    "flags a namespace-qualified type",
    CONTENT_PART,
    VERB_FILE,
    'import type * as chat from "@orb/contracts/chat";\nexport type T = chat.ChatContentPart;\n',
    1,
  ],
  ["flags an import type query", CONTENT_PART, VERB_FILE, 'export type T = import("@orb/contracts/chat").ChatContentPart;\n', 1],
  ["covers the client", CONTENT_PART, CLIENT_FILE, 'import type { ChatContentPart } from "@orb/contracts/chat";\n', 1],
  [
    "covers the inference package",
    CONTENT_PART,
    "packages/inference/src/backends/other/probe.ts",
    'import type { ChatContentPart } from "@orb/contracts/chat";\n',
    1,
  ],
  ["passes a sibling chat export", CONTENT_PART, VERB_FILE, 'import type { MessageView } from "@orb/contracts/chat";\nexport type T = MessageView;\n', 0],
  [
    "passes a local declaration that nobody imports",
    CONTENT_PART,
    VERB_FILE,
    "export type ChatContentPart = { readonly other: number };\nexport type T = ChatContentPart;\n",
    0,
  ],
  [
    "passes the barrel re-export in the contracts home",
    CONTENT_PART,
    "packages/contracts/src/chat/index.ts",
    'export type { ChatContentPart } from "./bus.ts";\n',
    0,
  ],
  ["leaves tests alone", CONTENT_PART, "tests/server/domain/chat/probe.test.ts", 'import type { ChatContentPart } from "@orb/contracts/chat";\n', 0],
  ["leaves scripts alone", CONTENT_PART, "scripts/probes/probe.ts", 'import type { ChatContentPart } from "@orb/contracts/chat";\n', 0],
  ...CONTENT_PART_HOMES.map(
    (home): Row => [`leaves the home ${home} alone`, CONTENT_PART, home, 'import type { ChatContentPart } from "@orb/contracts/chat";\n', 0],
  ),
]);

// ── no-hardcoded-model-prose ────────────────────────────────────────────────────────────────────────────
const TWELVE = "one two three four five six seven eight nine ten eleven twelve";
const ELEVEN = "one two three four five six seven eight nine ten eleven";
const SEAM_DIR = "packages/server/src/domain/rpg/substrate/probe.ts";
const SEAM_TOOLS = "packages/server/src/domain/rpg/tools/rounds/probe.ts";
const SEAM_FILE = "packages/server/src/domain/chat/verbs/compaction.ts";

test("every registered model-prose seam still exists, so the registry has no dead path", () => {
  for (const path of [...MODEL_PROSE_SEAM_PREFIXES, ...MODEL_PROSE_SEAM_FILES]) {
    expect(existsSync(path), path).toBe(true);
  }
});

each([
  ...MODEL_PROSE_SEAM_PREFIXES.map(
    (prefix): Row => [`flags prose under the registered seam ${prefix}`, PROSE, `${prefix}probe.ts`, `export const t = "${TWELVE}";\n`, 1],
  ),
  ...MODEL_PROSE_SEAM_FILES.map((file): Row => [`flags prose in the registered seam file ${file}`, PROSE, file, `export const t = "${TWELVE}";\n`, 1]),
  [
    "flags a refusal-shaped sentence; a reason key is not an exemption",
    PROSE,
    SEAM_TOOLS,
    'export function operatorRefusal() {\n  return { ok: false, reason: "A bound RPG character card supplies the extractor target, so scene extraction cannot run without one selected for this room." };\n}\n',
    1,
  ],
  [
    "flags a fresh teach at a seam",
    PROSE,
    SEAM_DIR,
    'export const NEW_TEACH =\n  "When the scene calls for it, teach the model to answer in the voice of the narrator and keep it steady.";\n',
    1,
  ],
  [
    "flags a tool description",
    PROSE,
    SEAM_TOOLS,
    'export const DESC = {\n  description: "Use this tool whenever the story needs a dice roll and report the result in plain words.",\n};\n',
    1,
  ],
  [
    "flags a plus-chunked dodge as one unit",
    PROSE,
    "packages/server/src/domain/chat/assembly/probe.ts",
    'export const SPLIT = "Record only what the story actually " + "establishes and never invent numbers, " + "items, or events it does not show.";\n',
    1,
  ],
  [
    "flags an array join as one unit",
    PROSE,
    "packages/server/src/domain/chat/memory/generate/substrate/probe.ts",
    'export const JOINED = [\n  "You distill a block of roleplay transcript",\n  "into a compact retrieval-optimized memory unit",\n  "and never add commentary or markdown headers.",\n].join("\\n");\n',
    1,
  ],
  ["flags a template with interpolations around static prose", PROSE, SEAM_DIR, `export const t = (a: string) => \`\${a} ${TWELVE} \${a}\`;\n`, 1],
  ["flags a nested array join under a plus chain once", PROSE, SEAM_DIR, `export const t = ["${ELEVEN}"].join(" ") + " twelve";\n`, 1],
  ["flags at the twelve-word floor", PROSE, SEAM_DIR, `export const t = "${TWELVE}";\n`, 1],
  ["flags the imagery seams", PROSE, "packages/server/src/domain/imagery/tool/probe.ts", `export const t = "${TWELVE}";\n`, 1],
  ["flags a named seam file outside the prefixes", PROSE, SEAM_FILE, `export const t = "${TWELVE}";\n`, 1],
  ["flags the extraction prompt seam file", PROSE, "packages/contracts/src/rpg/extraction-prompt.ts", `export const t = "${TWELVE}";\n`, 1],
  ["passes one word under the floor", PROSE, SEAM_DIR, `export const t = "${ELEVEN}";\n`, 0],
  ["passes words with no lowercase run", PROSE, SEAM_DIR, 'export const t = "A B C D E F G H I J K L";\n', 0],
  [
    "passes a logger argument",
    PROSE,
    "packages/server/src/domain/chat/assembly/probe.ts",
    `import { logger } from "#foundation";\nexport const f = () => logger.warn({ n: 1 }, "${TWELVE}");\n`,
    0,
  ],
  ["passes a console argument", PROSE, SEAM_DIR, `export const f = () => console.log("${TWELVE}");\n`, 0],
  ["passes a getLog call argument", PROSE, SEAM_DIR, `export const f = () => getLog().warn("${TWELVE}");\n`, 0],
  ["passes a thrown error", PROSE, SEAM_DIR, `export function f(x: number) {\n  if (x > 1) throw new Error("${TWELVE}");\n  return x;\n}\n`, 0],
  ["passes a typed error construction", PROSE, SEAM_DIR, `export const e = new RangeError("${TWELVE}");\n`, 0],
  ["passes a throw of a plain string", PROSE, SEAM_DIR, `export function f(): never {\n  throw "${TWELVE}";\n}\n`, 0],
  [
    "passes sub-floor labels and stubs",
    PROSE,
    "packages/server/src/domain/chat/assembly/probe.ts",
    'export const LABEL = "Party:";\nexport const STUB = "[image omitted]";\n',
    0,
  ],
  [
    "passes short joins and templates",
    PROSE,
    SEAM_TOOLS,
    'export const V = ["a", "b"].join(", ");\nexport const SHORT = `only a few short template words here`;\n',
    0,
  ],
  ["leaves a path outside every seam alone", PROSE, "packages/server/src/domain/chat/verbs/other.ts", `export const t = "${TWELVE}";\n`, 0],
  ["leaves a prose catalog alone", PROSE, "packages/contracts/src/chat/prose.ts", `export const t = "${TWELVE}";\n`, 0],
]);
