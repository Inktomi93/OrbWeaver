import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/text-voice-only";
const CLIENT = "packages/client/src/components/voice-probe.tsx";
const UI = "packages/ui/src/primitives/text/text.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

async function findings(source: string, path = CLIENT): Promise<readonly string[]> {
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
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ message }) => message);
}

test.for([
  'import { Text } from "@orb/ui/text"; export const T = <Text size="body" />;',
  'import { Heading as Title } from "@orb/ui/text"; export const T = <Title level={2} weight="bold" />;',
  'import * as Copy from "@orb/ui/text"; export const T = <Copy.Text transform="caps" />;',
  'import { Text } from "@orb/ui/text"; const Copy = Text; export const T = <Copy size="body" />;',
  'import * as Copy from "@orb/ui/text"; const Label = Copy.Text; export const T = <Label size="body" />;',
  'import * as Typography from "@orb/ui/text"; const { Text: Copy } = Typography; export const T = <Copy size="body" />;',
  'import * as Typography from "@orb/ui/text"; const { Heading: Title } = Typography; export const T = <Title level={2} weight="bold" />;',
  'import { Text } from "@orb/ui/text"; export const T = <Text {...{ size: "body" }} />;',
  'import { Text } from "@orb/ui/text"; const axes = { weight: "bold" }; export const T = <Text {...axes} />;',
  'import { Text } from "@orb/ui/text"; const key = "transform"; export const T = <Text {...{ [key]: "caps" }} />;',
  'import { Text } from "@orb/ui/text"; const rows = { current: { text: { weight: "semibold" } }, past: { text: { tone: "muted" } } }; const T = ({ state }) => { const row = rows[state]; return <Text voice="gloss" {...row.text} />; };',
  'import { Heading } from "@orb/ui/text"; const rows = { title: { size: "display" } }; export const T = <Heading level={2} {...rows.title} />;',
  'import { Text } from "@orb/ui/text"; const rows = { text: { weight: "semibold" } }; const { text: props } = rows; export const T = <Text {...props} />;',
  'import { Text } from "@orb/ui/text"; const {text = {weight: "semibold"}} = {}; export const T = <Text {...text} />;',
  'import { Text } from "@orb/ui/text"; const {text = {weight: "semibold"}} = {text: undefined}; export const T = <Text {...text} />;',
] as const)("text voice restriction rejects %s", async (source) => {
  expect(await findings(source)).toHaveLength(1);
});

test.for([
  'import { Text } from "@orb/ui/text"; export const T = <Text voice="code" tone="info" halo />;',
  'import { Text } from "another-library"; export const T = <Text size="body" />;',
  'import { Text } from "@orb/ui/text"; function T(Text) { return <Text size="body" />; }',
  'import { Button } from "@orb/ui/button"; export const T = <Button size="sm" />;',
  'const Own = (props) => <div />; const parts = { Text: Own }; const { Text: Copy } = parts; export const T = <Copy size="body" />;',
  'import { Text } from "@orb/ui/text"; const rows = { internal: { weight: "semibold" }, body: { voice: "gloss" } }; export const T = <Text {...rows.body} />;',
  'import { Text } from "@orb/ui/text"; const T = ({ tone }) => <Text voice="gloss" tone={tone} />;',
  'import { Text } from "@orb/ui/text"; const {text = {weight: "semibold"}} = {text: {voice: "gloss"}}; export const T = <Text {...text} />;',
  'import { Text } from "@orb/ui/text"; const {text = {weight: "semibold"}} = {text: null}; export const T = <Text {...text} />;',
] as const)("text voice restriction admits %s", async (source) => {
  expect(await findings(source)).toEqual([]);
});

test("internal text axes remain available inside UI", async () => {
  expect(await findings('import { Text } from "@orb/ui/text"; export const T = <Text size="body" weight="bold" transform="caps" />;', UI)).toEqual([]);
});
