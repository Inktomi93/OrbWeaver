import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

test("the configured PNG import restriction preserves aliases, nested doors and sanctioned homes", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  const cases = [
    ["packages/server/src/domain/character/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/alias.ts", 'import { readCardChunk as read } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/nested.ts", 'import { isPng } from "@orb/kit/png-card-chunk/nested";', 1],
    ["packages/server/src/domain/character/namespace.ts", 'import * as chunk from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/barrel.ts", 'export { writeCardChunk } from "@orb/kit/png-card-chunk";', 1],
    ["packages/server/src/domain/character/other-symbol.ts", 'import { encodeCard } from "@orb/kit/png-card-chunk";', 0],
    ["packages/server/src/domain/character/other-door.ts", 'import { readCardChunk } from "@orb/kit/other-engine";', 0],
    ["packages/server/src/domain/import/substrate/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 0],
    ["packages/server/src/domain/export/verbs/probe.ts", 'import { writeCardChunk } from "@orb/kit/png-card-chunk";', 0],
    ["packages/client/src/features/character/probe.ts", 'import { readCardChunk } from "@orb/kit/png-card-chunk";', 0],
  ] as const;
  for (const [path, source, expected] of cases) {
    const config = await eslint.calculateConfigForFile(path);
    const messages = linter.verify(
      source,
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: { parser: tseslint.parser },
        rules: { "no-restricted-imports": config?.rules?.["no-restricted-imports"] ?? "off" },
      },
      { filename: path },
    );
    expect(
      messages.filter(({ fatal }) => fatal),
      path,
    ).toEqual([]);
    expect(
      messages.filter(({ ruleId }) => ruleId === "no-restricted-imports"),
      path,
    ).toHaveLength(expected);
  }
});
