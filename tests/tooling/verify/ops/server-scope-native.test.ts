// Exercise the effective native member-card, chat-fan and injected-op scope boundaries through the real flat config.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { ID_BRAND_HOME, requireEntityIdTypeNames } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = join(import.meta.dirname, "../../../..");
// The first effective-config read loads the whole flat config.
const CONFIG_TIMEOUT = { timeout: scaledBudget(120_000) };
const eslint = new ESLint({ cwd: ROOT });
const CARD = "orb/member-card-clamped";
const CLAMP = "orb/member-card-clamped-clamp";
const VERB = "orb/member-card-clamped-verb";
const FAN = "orb/membership-fan-guard";
const OP = "orb/injected-op-caller-param";
const RULES = [CARD, CLAMP, VERB, FAN, OP] as const;
type Rule = (typeof RULES)[number];
type Row = readonly [path: string, source: string, expected: Partial<Record<Rule, number>>];
const OP_SETTINGS = "orb/injected-op-caller-param";
const CONTRACT_PROBE = "packages/server/src/domain/character/contract/service.ts";

interface CallerFreeOp {
  readonly op: string;
  readonly why: string;
}
interface OpSettings {
  readonly entityIds: readonly string[];
  readonly scopeNames: readonly string[];
  readonly callerFreeOps: readonly CallerFreeOp[];
}

async function effective(path: string): Promise<Awaited<ReturnType<ESLint["calculateConfigForFile"]>>> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  return config;
}

function verify(config: Awaited<ReturnType<typeof effective>>, path: string, source: string, settings = config.settings): Linter.LintMessage[] {
  const rules = Object.fromEntries(RULES.flatMap((rule) => (config.rules[rule] === undefined ? [] : [[rule, config.rules[rule]]])));
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      settings,
      rules,
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

async function counts(path: string, source: string): Promise<Record<Rule, number>> {
  const messages = verify(await effective(path), path, source);
  return Object.fromEntries(RULES.map((rule) => [rule, messages.filter((message) => message.ruleId === rule).length])) as Record<Rule, number>;
}

/** Each row's counts beside its expected counts, for one assertion. */
async function verdicts(rows: readonly Row[]): Promise<{ actual: unknown[]; expected: unknown[] }> {
  const actual: unknown[] = [];
  for (const [path, source] of rows) {
    actual.push({ path, source, counts: await counts(path, source) });
  }
  const expected = rows.map(([path, source, want]) => ({ path, source, counts: Object.fromEntries(RULES.map((rule) => [rule, want[rule] ?? 0])) }));
  return { actual, expected };
}

const RETIRED_MARKER = "// @orb-waive POLICY(POSITION): the proof's stand-in reason; ends when this fixture stops flagging.\n";
const retiredMarker = (policy: string, position: string): string => RETIRED_MARKER.replace("POLICY", policy).replace("POSITION", position);

// Each retired gate descriptor row first, then the arm and scope edges the gate's visitors implied.
const MEMBER_CARD_ROWS: readonly Row[] = [
  ["packages/server/src/domain/character/x.ts", "export interface MemberCardView { name: string }\n", { [CARD]: 1 }],
  ["packages/server/src/domain/character/y.ts", "export function clampMemberCard() {}\n", { [CLAMP]: 1 }],
  ["packages/server/src/domain/character/z.ts", "export const use = getRosterCardView;\n", { [VERB]: 1 }],
  ["packages/contracts/src/chat/card.ts", "export interface MemberCardView { name: string }\n", {}],
  ["packages/server/src/domain/chat/substrate/auth/clamp.ts", "export function clampMemberCard() {}\n", {}],
  ["packages/contracts/src/chat/card.ts", "export const note = getRosterCardView;\n", {}],
  [
    "packages/server/src/domain/character/x.ts",
    `${retiredMarker("member-card-clamped", "MemberCardView")}export interface MemberCardView { name: string }\n`,
    { [CARD]: 1 },
  ],
  [
    "packages/server/src/domain/character/x.ts",
    "// eslint-disable-next-line orb/member-card-clamped -- the fixture's reviewed exception\nexport interface MemberCardView { name: string }\n",
    {},
  ],
  ["packages/client/src/features/chat/card.ts", "export type MemberCardView = { readonly name: string };\n", { [CARD]: 1 }],
  ["tests/server/domain/chat/card.ts", "interface MemberCardView { name: string }\n", { [CARD]: 1 }],
  ["tests/legacy/server/domain/chat/card.ts", "interface MemberCardView { name: string }\n", {}],
  ["packages/server/src/domain/character/w.ts", "export const resolveCardVisibility = () => undefined;\n", { [CLAMP]: 1 }],
  ["packages/server/src/domain/character/v.ts", "export declare function clampMemberCard(): void;\n", { [CLAMP]: 1 }],
  ["packages/server/src/domain/character/u.ts", "export const { clampMemberCard } = library;\n", {}],
  ["tests/server/domain/chat/clamp.ts", "export function clampMemberCard() {}\n", {}],
  ["packages/server/src/domain/chat/substrate/auth/clamp.ts", "export const use = getRosterCardView;\n", { [VERB]: 1 }],
];

const FAN_ROWS: readonly Row[] = [
  [
    "packages/server/src/domain/chat/verbs/__probe.ts",
    'export function leak(emitUserEvent: (u: string, e: unknown) => void): void {\n  emitUserEvent("u1", { type: "chatsChanged" });\n}\n',
    { [FAN]: 2 },
  ],
  ["packages/server/src/domain/chat/verbs/shadow.ts", "export function f(): void { const emitUserEvent = () => undefined; emitUserEvent(); }\n", { [FAN]: 2 }],
  ["packages/server/src/domain/chat/verbs/__probe-ok.ts", "export function fan(emitChatChanged: () => void): void {\n  emitChatChanged();\n}\n", {}],
  ["packages/server/src/domain/chat/verbs/anchor.ts", "export const clean = true;\n", {}],
  ["packages/server/src/domain/persona/verbs/__probe-other.ts", "export const use = (emitUserEvent: (u: string, e: unknown) => void) => emitUserEvent;\n", {}],
  ["packages/server/src/domain/chat/verbs/computed.ts", 'export const emitter = { "emitUserEvent": 1, ["emitUserEvent"]: 2 };\n', {}],
  [
    "packages/server/src/domain/chat/verbs/__probe-waived.ts",
    `${retiredMarker("membership-fan-guard", "emitUserEvent")}export const forward = emitUserEvent;\n`,
    { [FAN]: 1 },
  ],
  ["packages/server/src/domain/chat/engine/deep/emit.ts", "import { emitUserEvent } from './bus.ts';\nexport const forward = emitUserEvent;\n", { [FAN]: 3 }],
];

const OP_ROWS: readonly Row[] = [
  [
    CONTRACT_PROBE,
    "export type CopyCharacterBooksOp = (args: { readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;\n",
    { [OP]: 1 },
  ],
  ["packages/server/src/domain/x/contract/service.ts", "export type LoadThingOp = (assetId: AssetId) => Promise<Uint8Array>;\n", { [OP]: 1 }],
  [CONTRACT_PROBE, "export type ListCharacterSpriteAssetsOp = (characterId: CharacterId) => Promise<readonly AssetId[]>;\n", { [OP]: 1 }],
  [
    CONTRACT_PROBE,
    "export type AttachCardTagOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;\n",
    {},
  ],
  [CONTRACT_PROBE, 'export type ResolveGreetingTemplateOp = (args: { readonly caller: Principal; readonly kind: "a" }) => Promise<string>;\n', {}],
  [CONTRACT_PROBE, "export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;\n", {}],
  [
    "packages/server/src/domain/x/contract/service.ts",
    "export type PostToRoomOp = (args: { readonly chatId: ChatId; readonly characterId: CharacterId }) => Promise<void>;\n",
    {},
  ],
  [
    "packages/server/src/domain/discovery/contract/service.ts",
    "export type Tier0RangeOp = (tier: number, blockIdx: number) => { readonly startIdx: number };\n",
    {},
  ],
  ["packages/server/src/domain/x/contract/service.ts", "export type EmbeddingsStoreOp = (params: StoreDigestParams) => Promise<void>;\n", {}],
  [
    CONTRACT_PROBE,
    `${retiredMarker("injected-op-caller-param", "CopyCharacterBooksOp")}export type CopyCharacterBooksOp = (args: { readonly fromCharacterId: CharacterId; readonly toCharacterId: CharacterId }) => Promise<void>;\n`,
    { [OP]: 1 },
  ],
  ["packages/server/src/domain/character/verbs/service.ts", "export type LoadThingOp = (assetId: AssetId) => Promise<Uint8Array>;\n", {}],
  ["packages/server/src/domain/character/contract/deep/service.ts", "export type LoadThingOp = (assetId: AssetId) => Promise<Uint8Array>;\n", { [OP]: 1 }],
  [CONTRACT_PROBE, "export type LoadOwnedOp = (userId: string, assetId: AssetId) => Promise<Uint8Array>;\n", {}],
  [CONTRACT_PROBE, "export type VisitOp = (visit: (id: CharacterId) => void) => Promise<void>;\n", { [OP]: 1 }],
  [CONTRACT_PROBE, "export type ReadOp = ({ characterId }: { readonly characterId: CharacterId }) => Promise<void>;\n", { [OP]: 1 }],
  [CONTRACT_PROBE, "export type ReadOp = ({ ownerId, characterId }: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<void>;\n", {}],
  [CONTRACT_PROBE, "export type FindOp = (name: string) => Promise<CharacterId | undefined>;\n", {}],
  [CONTRACT_PROBE, "export type LoadOp = (id: ChatId) => Promise<string>;\n", { [OP]: 1 }],
  [CONTRACT_PROBE, "export type LoadOp = (...ids: readonly AssetId[]) => Promise<string>;\n", { [OP]: 1 }],
];

test("member-card-clamped keeps one view home, one clamp home and no resurrected roster-card verb", CONFIG_TIMEOUT, async () => {
  const { actual, expected } = await verdicts(MEMBER_CARD_ROWS);
  expect(actual).toEqual(expected);
});

test("membership-fan-guard bans every actor-only emit identifier under the chat domain", CONFIG_TIMEOUT, async () => {
  const { actual, expected } = await verdicts(FAN_ROWS);
  expect(actual).toEqual(expected);
});

test("injected-op-caller-param refuses a contract op that takes an entity id and no caller scope", CONFIG_TIMEOUT, async () => {
  const { actual, expected } = await verdicts(OP_ROWS);
  expect(actual).toEqual(expected);
});

function opSettings(config: Awaited<ReturnType<typeof effective>>): OpSettings {
  const settings = config.settings?.[OP_SETTINGS];
  expect(settings, OP_SETTINGS).toBeDefined();
  return settings as OpSettings;
}

/** The caller-free rows that no file in `files` would be flagged for once its exemption is removed. */
function staleCallerFreeOps(config: Awaited<ReturnType<typeof effective>>, files: Readonly<Record<string, string>>, settings: OpSettings): string[] {
  const unexempt = { ...config.settings, [OP_SETTINGS]: { ...settings, callerFreeOps: [] } };
  const flagged = new Set(
    Object.entries(files).flatMap(([path, source]) =>
      verify(config, path, source, unexempt)
        .filter(({ ruleId }) => ruleId === OP)
        .map(({ message }) => /^(\w+):/u.exec(message)?.[1]),
    ),
  );
  return settings.callerFreeOps.filter(({ op }) => !flagged.has(op)).map(({ op }) => op);
}

test("the entity-id vocabulary is the ids home's TypeIdOf aliases and an empty home is refused", CONFIG_TIMEOUT, async () => {
  const settings = opSettings(await effective(CONTRACT_PROBE));
  const derived = requireEntityIdTypeNames(readFileSync(join(ROOT, ID_BRAND_HOME), "utf8"));
  expect(settings.entityIds).toEqual(derived);
  expect(derived).toEqual(expect.arrayContaining(["CharacterId", "AssetId", "ChatId"]));
  expect(() => requireEntityIdTypeNames("export type NotAnEntityId = string;\n")).toThrow(/declares no TypeIdOf entity-id alias/u);
  expect(() => requireEntityIdTypeNames('export type Nested = { readonly id: TypeIdOf<"asset"> };\n')).toThrow(/declares no TypeIdOf/u);
});

test("every caller-free row carries a reason and names a live contract op the rule would otherwise refuse", CONFIG_TIMEOUT, async () => {
  const config = await effective(CONTRACT_PROBE);
  const settings = opSettings(config);
  expect(settings.callerFreeOps.length).toBeGreaterThan(0);
  expect(settings.callerFreeOps.filter(({ why }) => why.trim().length === 0)).toEqual([]);
  const ops = settings.callerFreeOps.map(({ op }) => op);
  // The retired health descriptor's rows: an empty contract makes every row stale; an id-free op is not seen.
  expect(staleCallerFreeOps(config, { [CONTRACT_PROBE]: "export const schema = {};\n" }, settings)).toEqual(ops);
  expect(staleCallerFreeOps(config, { [CONTRACT_PROBE]: "export type ReapAssetsOp = (assetIds: readonly string[]) => Promise<void>;\n" }, settings)).toEqual(
    ops,
  );
  expect(
    staleCallerFreeOps(
      config,
      {
        [CONTRACT_PROBE]:
          "export type ReapAssetsOp = (assetIds: readonly AssetId[]) => Promise<void>;\n" +
          "export type ResolveAssetHashOp = (assetId: AssetId) => Promise<string>;\n" +
          "export type LoadAssetBytesOp = (assetId: AssetId) => Promise<Uint8Array>;\n" +
          "export type LoadAssetBytes = (assetId: AssetId) => Promise<Uint8Array>;\n" +
          "export type LoadAssetMime = (assetId: AssetId) => Promise<string>;\n" +
          "export type LoadCardText = (characterId: CharacterId) => Promise<string>;\n",
      },
      settings,
    ),
  ).toEqual([]);
  // The live ratchet: each row still excuses a declaration in the real contract tree.
  const domains = join(ROOT, "packages/server/src/domain");
  const contracts = Object.fromEntries(
    readdirSync(domains, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name }) => {
        const dir = join(domains, name, "contract");
        return existsSync(dir)
          ? readdirSync(dir, { recursive: true, encoding: "utf8" })
              .filter((file) => /\.tsx?$/u.test(file))
              .map((file) => [`packages/server/src/domain/${name}/contract/${file}`, readFileSync(join(dir, file), "utf8")])
          : [];
      }),
  );
  expect(Object.keys(contracts).length).toBeGreaterThan(0);
  expect(staleCallerFreeOps(config, contracts, settings)).toEqual([]);
});
