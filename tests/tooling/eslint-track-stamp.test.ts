import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

const CHAT = "packages/client/src/features/chat/";
const CARRIER = `${CHAT}components/composer-strip.tsx`;
const OTHER_FEATURE = "packages/client/src/features/config/components/probe.tsx";
const CHAT_TRACK_HOME = `${CHAT}lib/chat-track.tsx`;
const RULE = "no-restricted-syntax";

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CARRIER));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["a stamp on a carrier", 'export const A = () => <Stack data-track="chat" />;', CARRIER, 1],
  ["a computed stamp", "export const A = ({ track }) => <Stack data-track={track} />;", CARRIER, 1],
  ["a stamp outside the chat feature", 'export const A = () => <Stack data-track="composer" />;', OTHER_FEATURE, 1],
  ["the stamp's home", "export const A = ({ track }) => <Primitive data-track={track} />;", CHAT_TRACK_HOME, 0],
  ["the carrier through its component", 'export const A = () => <Track of={Stack} track="chat" />;', CARRIER, 0],
  ["another data attribute", 'export const A = () => <Stack data-tracked="chat" />;', CARRIER, 0],
  ["a hand-built queryKey in the home file", 'export const A = { queryKey: ["x"] };', CHAT_TRACK_HOME, 1],
] as const)("the track stamp: %s", async ([, source, path, count]) => {
  expect(await findings(source, path)).toHaveLength(count);
});
