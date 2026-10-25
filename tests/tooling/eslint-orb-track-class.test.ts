import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

const CHAT = "packages/client/src/features/chat/";
const CARRIER = `${CHAT}components/composer-strip.tsx`;
const OTHER_FEATURE = "packages/client/src/features/config/components/probe.tsx";
const CHAT_TRACK_HOME = `${CHAT}lib/chat-track.tsx`;
const ROW_VARIANTS_HOME = `${CHAT}lib/message-row-variants.ts`;
const RULE = "no-restricted-syntax";

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CARRIER));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["a chat-track className on a carrier", 'export const A = () => <Stack className="orb-chat-track inline-full" />;', CARRIER, 1],
  ["a composer-track className on a carrier", 'export const A = () => <Stack className="orb-composer-track" />;', CARRIER, 1],
  ["a track string held in a constant", 'const TRACK = "orb-chat-track";\nexport const A = TRACK;', CARRIER, 1],
  ["a track string in a template", "export const A = `x orb-composer-track`;", CARRIER, 1],
  ["a track string outside the chat feature", 'export const A = "orb-chat-track";', OTHER_FEATURE, 1],
  ["the chat-track home", 'export const CHAT_TRACK = "orb-chat-track inline-full";', CHAT_TRACK_HOME, 0],
  ["the echo track home", 'const ECHO_TRACK = "mx-auto orb-echo-track";', ROW_VARIANTS_HOME, 0],
  ["a name that only starts like a track", 'export const A = "orb-native";', CARRIER, 0],
  ["a comment that names the track", "// the orb-chat-track carrier\nexport const A = 1;", CARRIER, 0],
  ["a hand-built queryKey in a home file", 'export const A = { queryKey: ["x"] };', CHAT_TRACK_HOME, 1],
] as const)("orb track class strings: %s", async ([, source, path, count]) => {
  expect(await findings(source, path)).toHaveLength(count);
});
