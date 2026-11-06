import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { PRINCIPAL_RULES } from "../../tooling/src/eslint/principal.ts";
import { ROLE_DATA_RESTRICTIONS } from "../../tooling/src/eslint/security-policy.ts";
import { levelOf, resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

test("ambient declarations use their compiler projects without enabling async rules", { tags: ["slow"] }, async () => {
  const path = "tests/support/vitest-tags.d.ts";
  const { rules } = await resolvedConfig(eslint, join(ROOT, path));
  expect(levelOf(rules["orb/no-raw-id"])).toBe(2);
  expect(rules["@typescript-eslint/no-floating-promises"]).toBeUndefined();
  const results = await eslint.lintFiles([join(ROOT, path)]);
  expect(results).toHaveLength(1);
  expect(results.flatMap(({ messages }) => messages)).toEqual([]);
});

test.for(["tests/server/transport/trpc/procedure-input.test-d.ts", "tests/client/forms/editor/autosave-reset-strip.dom.test-d.ts"])(
  "type tests retain their compiler and async rule settings: %s",
  async (path) => {
    const { languageOptions, rules } = await resolvedConfig(eslint, join(ROOT, path));
    expect(languageOptions.parserOptions).toMatchObject({
      project: ["tsconfig.node.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"],
      projectService: false,
    });
    expect(levelOf(rules["orb/no-raw-id"])).toBe(2);
    expect(levelOf(rules["@typescript-eslint/no-floating-promises"])).toBe(2);
  },
);

async function judge(path: string, rule: string, source: string): Promise<number> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const entry = config.rules[rule];
  if (entry === undefined) {
    return 0;
  }
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true }, project: false, projectService: false } },
      plugins: config.plugins,
      rules: { [rule]: entry },
    },
    { filename: path },
  );
  expect(messages.filter(({ fatal }) => fatal)).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === rule).length;
}

test("each registered role-data surface is enabled at its own path", async () => {
  for (const { id, path } of ROLE_DATA_RESTRICTIONS) {
    const { rules } = await resolvedConfig(eslint, join(ROOT, "packages/server/src", path));
    expect(Object.keys(rules).filter((rule) => rule.startsWith("orb/role-data-export-surface-"))).toEqual([`orb/${id}`]);
    expect(levelOf(rules[`orb/${id}`])).toBe(2);
  }
});

test.for([
  { path: "packages/server/src/domain/chat/verbs/read.ts", entry: false, enabled: true },
  { path: "packages/server/src/entry/auth/seam.ts", entry: true, enabled: true },
  { path: "packages/inference/src/index.ts", entry: false, enabled: true },
  { path: "packages/client/src/index.ts", entry: false, enabled: false },
])("Principal registration follows scope for $path", async ({ path, entry, enabled }) => {
  const { rules } = await resolvedConfig(eslint, join(ROOT, path));
  for (const row of PRINCIPAL_RULES) {
    expect(levelOf(rules[`orb/${row.id}`]) === 2, row.id).toBe(enabled && !(entry && row.scope === "outside-entry"));
  }
});

test.for([
  "packages/server/src/domain/settings/seed-themes.ts",
  "packages/inference/src/index.ts",
  "packages/db/src/schema/index.ts",
  "packages/client/src/features/chat/lib/chat-track.tsx",
  "packages/client/src/features/config/surfaces/config-content-surface.tsx",
  "packages/ui/src/primitives/button.tsx",
  "tooling/src/floor/process/example.ts",
  "tests/tooling/example.test.ts",
  "tests/client/example.ct.tsx",
])("control characters remain restricted after overrides in %s", async (path) => {
  const rule = "no-restricted-syntax";
  expect(await judge(path, rule, `const value = "a${String.fromCodePoint(0x20_2e)}b";`)).toBe(1);
  expect(await judge(path, rule, String.raw`const value = "a\u202eb";`)).toBe(0);
});

test.for([
  {
    id: "dialog-via-composite",
    inside: "packages/client/src/features/chat/lib/dialog-probe.ts",
    outside: "packages/client/src/components/dialog-probe.ts",
    bad: `import { Dialog } from "@orb/ui/dialog";`,
    good: `import { ConfirmDialog } from "#components";`,
  },
  {
    id: "config-host-no-feature-import",
    inside: "packages/client/src/features/config/surfaces/config-content-surface.tsx",
    outside: "packages/client/src/features/config/surfaces/other.tsx",
    bad: `import { x } from "#features/chat";`,
    good: `import { x } from "#data";`,
  },
  {
    id: "no-raw-matchmedia",
    inside: "packages/client/src/entry.ts",
    outside: "packages/ui/src/lib/use-prefers-light-color-scheme.ts",
    bad: `matchMedia("(min-width: 1px)");`,
    good: "matchMedia(MEDIA_QUERIES.desktop);",
  },
  {
    id: "db-enum-from-tuple",
    inside: "packages/db/src/schema/example.ts",
    outside: "packages/db/src/example.ts",
    bad: `const column = { enum: ["a", "b"] };`,
    good: "const column = { enum: VALUES };",
  },
])("native $id enforces its configured scope", async ({ id, inside, outside, bad, good }) => {
  const rule = `orb/${id}`;
  expect(await judge(inside, rule, bad)).toBeGreaterThan(0);
  expect(await judge(inside, rule, good)).toBe(0);
  expect(await judge(outside, rule, bad)).toBe(0);
});
