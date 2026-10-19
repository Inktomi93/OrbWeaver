import { join } from "node:path";
import { BUS_SUBUNIONS, BUSES } from "@orb/contracts/bus-registry";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULES = ["orb/bus-union-registered", ...[...Object.keys(BUSES), ...Object.keys(BUS_SUBUNIONS)].map((name) => `orb/bus-home-${name}`)];
const STRANGER = "packages/contracts/src/automation/index.ts";
const UNREGISTERED_HOME = "packages/contracts/src/zz-unregistered/index.ts";
const eslint = new ESLint({ cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, STRANGER));
});

async function findings(path: string, source: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser },
      plugins: config.plugins,
      rules: Object.fromEntries(RULES.map((rule) => [rule, config.rules[rule] ?? "off"])),
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    path,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("a bus union absent from the registry is refused, exported or not", async () => {
  for (const source of [
    'export type ProbeBusEvent = { type: "ruleFired" } | { type: "rulesChanged" };',
    'type ProbeBusEvent = { type: "ruleFired" };',
    'export type PlanBusEvent = ChatBusEvent | { type: "a" };',
    'export type OtherBusEvent = Extract<Unknown, { type: "a" }>;',
    'export type NotARootBusEvent = Exclude<NotARoot, { type: "a" }>;',
    'export type GrownBusEvent = Exclude<ChatBusEvent, { type: "typing" }> | { type: "archived" };',
  ]) {
    expect(await findings(UNREGISTERED_HOME, source), source).toHaveLength(1);
  }
});

test("a belt over a union that is not registered is refused, whatever it is named after", async () => {
  for (const source of [
    'export const SHADOW_BUS_EVENT_TYPES = ["a"] as const satisfies readonly UserBusEvent["type"][];',
    'export const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;',
    'export const FOO_EVENT_TYPES = ["a"] as const satisfies readonly FooEvent["type"][];',
  ]) {
    expect(await findings(UNREGISTERED_HOME, source), source).toHaveLength(1);
  }
});

test("a tuple that is not a belt over a union is left alone", async () => {
  for (const source of [
    'export const LIVE_ONLY_CHAT_EVENT_TYPES = ["roomEntityChanged"] as const;',
    'export const ROOM_CHANNELS = ["user"] as const satisfies readonly string[];',
  ]) {
    expect(await findings(UNREGISTERED_HOME, source), source).toEqual([]);
  }
});

test("a registered alias or belt keeps its identity only in its registered file", async () => {
  const declarations = [
    ...Object.values(BUSES).map(({ alias, belt, file }) => ({
      file,
      source: `export type ${alias} = { type: "a" };\nexport const ${belt} = { a: true } satisfies Record<${alias}["type"], true>;`,
    })),
    ...Object.values(BUS_SUBUNIONS).map(({ alias, file }) => ({ file, source: `export type ${alias} = { type: "a" };` })),
  ];
  for (const { file, source } of declarations) {
    expect(await findings(file, source), file).toEqual([]);
    expect(await findings(file === STRANGER ? UNREGISTERED_HOME : STRANGER, source), file).not.toEqual([]);
  }
});

test("a registered alias respelled in another file is refused one finding per declaration", async () => {
  const shadow = 'export type ChatBusEvent = { type: "archived" };\nexport type WiBusEvent = { type: "wiGhost" };';
  expect(await findings(UNREGISTERED_HOME, shadow)).toHaveLength(2);
});

test("carve-outs of a registered root are admitted without an entry", async () => {
  for (const { alias } of Object.values(BUSES)) {
    for (const source of [
      `export type LiveOnly${alias} = Extract<${alias}, { type: "typing" }>;`,
      `export type Durable${alias} = Exclude<${alias}, { type: "typing" }>;`,
    ]) {
      expect(await findings(UNREGISTERED_HOME, source), source).toEqual([]);
    }
  }
});

test("the rules judge only the contracts package", async () => {
  const source =
    'export type ChatBusEvent = { type: "a" };\nexport type ProbeBusEvent = { type: "a" };\nexport const P_EVENT_TYPES = ["a"] as const satisfies readonly ProbeBusEvent["type"][];';
  for (const path of ["packages/server/src/domain/chat/probe.ts", "packages/client/src/data/probe.ts", "tests/contracts/probe.test-d.ts"]) {
    expect(await findings(path, source), path).toEqual([]);
  }
});
