import { join } from "node:path";
import { CHAT_APIS } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/domain-inference-dispatch";
const PROBE = "packages/server/src/domain/connection/verbs/probe.ts";
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PROBE));
}, 120_000);

async function findings(source: string, path = PROBE): Promise<number> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).length;
}

test.for([
  ["a wire equality", 'declare const row: { wire: string }; if (row.wire === "local-light") {}'],
  ["an API inequality through a renamed binding", 'declare const route: string; if (route !== "agent-sdk") {}'],
  ["the literal on the left", 'declare const api: string; if ("chat-completions" == api) {}'],
  ["the connection auto api", 'declare const api: string; if (api === "auto") {}'],
  ["a switch case", 'declare const route: string; switch (route) { case "agent-sdk": break; }'],
  ["a substitution-free template", "declare const wire: string; if (wire === `openai-compat`) {}"],
  ["an opaque comparison", 'declare const opaque: unknown; if (opaque === "agent-sdk") {}'],
] as const)("the rule reports %s", async ([, source]) => {
  expect(await findings(source)).toBe(1);
});

test("every chat API in the contract vocabulary is an axis value", async () => {
  for (const api of CHAT_APIS) {
    expect(await findings(`declare const api: string; if (api === "${api}") {}`), api).toBe(1);
  }
});

test.for([
  ["object identity", "declare const first: object; declare const second: object; if (first === second) {}"],
  ["a presence test", "declare const api: string | undefined; if (api !== undefined) {}"],
  ["an unrelated vocabulary", 'declare const api: string; if (api === "rest") {}'],
  ["a data projection", 'declare const api: string; export const projection = { api, wire: "local-light" };'],
] as const)("the rule passes %s", async ([, source]) => {
  expect(await findings(source)).toBe(0);
});

test("the runtime owns protocol dispatch; only domain code is judged", async () => {
  const severity = async (path: string): Promise<unknown> => (await eslint.calculateConfigForFile(join(ROOT, path)))?.rules?.[RULE]?.[0];
  expect(await severity(PROBE)).toBe(2);
  expect(await severity("packages/inference/src/resolve/probe.ts")).toBeUndefined();
  expect(await severity("packages/server/src/entry/compose/probe.ts")).toBeUndefined();
});

test("the HARD profile cannot be disabled by a subject comment", async () => {
  const [result] = await eslint.lintText(`/* eslint-disable ${RULE} -- Attempted bypass. */\ndeclare const w: string;\nif (w === "local-light") {}\n`, {
    filePath: join(ROOT, PROBE),
  });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === RULE)).toHaveLength(1);
});
