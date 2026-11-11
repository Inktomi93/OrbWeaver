// Package source reads time through an injected clock (Spine-Testing §3), and every server stream rides the one
// `stream.connect` socket (D118). Both are `no-restricted-syntax` entries that each package's block in
// `eslint.config.ts` composes, so every probe below resolves the real config for one block and fails if that block
// drops its entry.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// One probe per block that composes the clock entry; the path picks the block.
const CLOCK_BLOCKS = [
  "packages/server/src/domain/probe.ts",
  "packages/server/src/transport/trpc/routers/stream.ts",
  "packages/server/src/domain/settings/seed-themes.ts",
  "packages/inference/src/probe.ts",
  "packages/db/src/probe.ts",
  "packages/contracts/src/probe.ts",
  "packages/kit/src/probe.ts",
  "packages/default-content/src/probe.ts",
  "packages/showcase-plugins/src/probe.ts",
  "packages/plugin-toolchain/src/probe.ts",
  "packages/client/src/probe.tsx",
  "packages/client/src/features/chat/lib/chat-track.tsx",
  "packages/ui/src/probe.tsx",
] as const;
const CLOCK_HOMES = ["packages/server/src/entry/lifecycle.ts", "packages/kit/src/time/index.ts"] as const;
// Every server block composes the stream entry except the stream router, the socket's own home.
const STREAM_BLOCKS = [
  "packages/server/src/transport/trpc/routers/probe.ts",
  "packages/server/src/entry/lifecycle.ts",
  "packages/server/src/domain/settings/seed-themes.ts",
] as const;

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CLOCK_BLOCKS[0]));
}, 120_000);

async function findings(path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(ROOT, path);
  const config = await resolvedConfig(eslint, filename);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const AMBIENT_CLOCK = ["Date.now();", "const now = Date.now;", 'Date["now"]();', "new Date();", "new Date;"] as const;
const INJECTED_TIME = ["clock.now();", "new Date(0);", "new Date(clock.now());", "performance.now();", "Date.parse(text);"] as const;

test.for(CLOCK_BLOCKS)("%s refuses every ambient clock read and passes injected time", async (path) => {
  for (const source of AMBIENT_CLOCK) {
    const found = await findings(path, source);
    expect(found, source).toHaveLength(1);
    expect(found[0]?.message, source).toContain("Spine-Testing §3");
  }
  for (const source of INJECTED_TIME) {
    expect(await findings(path, source), source).toEqual([]);
  }
});

test.for(CLOCK_HOMES)("%s constructs the clock it injects", async (path) => {
  expect(await findings(path, "const now = (): number => Date.now();")).toEqual([]);
});

// Unexported, so the seed block's own export restriction stays out of the count.
const SECOND_STREAM = [
  "const r = t.router({ feed: authedProcedure.input(s).subscription(fn) });",
  'const r = t.router({ feed: authedProcedure["subscription"](fn) });',
  "const feed = authedProcedure.subscription(fn);",
] as const;

test.for(STREAM_BLOCKS)("%s refuses a procedure that declares its own subscription", async (path) => {
  for (const source of SECOND_STREAM) {
    const found = await findings(path, source);
    expect(found, source).toHaveLength(1);
    expect(found[0]?.message, source).toContain("D118");
  }
  expect(await findings(path, "const r = t.router({ list: authedProcedure.input(s).query(fn), save: authedProcedure.mutation(fn) });")).toEqual([]);
});

test("chat.impersonateStream is the one permanent subscription, and the stream router owns the socket", async () => {
  const impersonate = "export const chatRouter = t.router({ impersonateStream: authedProcedure.input(s).subscription(fn) });";
  expect(await findings("packages/server/src/transport/trpc/routers/chat.ts", impersonate)).toEqual([]);
  // The exception is the property, not the file: a second subscription beside it is still refused.
  expect(
    await findings(
      "packages/server/src/transport/trpc/routers/chat.ts",
      "export const chatRouter = t.router({ impersonateStream: a.subscription(f), other: a.subscription(g) });",
    ),
  ).toHaveLength(1);
  expect(
    await findings(
      "packages/server/src/transport/trpc/routers/stream.ts",
      "export const streamRouter = t.router({ connect: authedProcedure.subscription(fn) });",
    ),
  ).toEqual([]);
});
