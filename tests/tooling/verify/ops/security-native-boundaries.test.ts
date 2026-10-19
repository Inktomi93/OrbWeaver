// Exercise the effective native security boundary, not a duplicated selector or compiler model.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServicesResult } from "@orb/server/entry/compose";
import { subscribeAllChatEvents } from "@orb/server/transport/trpc";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });
const hard = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });
const INFRA_AUTH_RULE = "orb/infra-auth-no-userid";
const INFRA_AUTHORITY_RULE = "orb/infra-auth-pre-row-imports";
const FIREHOSE_RULE = "orb/firehose-import-allowlist";
const PLUGIN_DUMP_RULE = "orb/plugin-dump-guard";
const MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";

// D162's selector is name-keyed, so the name must stay the real callable firehose on both the transport door
// and the composition root's live chat bus; a rename or a non-callable twin fails the compiler here.
const FIREHOSE = "subscribeAllChatEvents" satisfies keyof ServicesResult["liveBuses"]["chat"];
const firehose: (listener: never) => () => void = ({ subscribeAllChatEvents } satisfies Record<typeof FIREHOSE, unknown>)[FIREHOSE];

async function findings(path: string, source: string, ruleId: string, engine: ESLint = eslint): Promise<readonly string[]> {
  const config = await engine.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [ruleId]: config.rules[ruleId] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("infra verification rejects every userId identifier position without claiming string-key analysis", async () => {
  for (const path of [
    "packages/server/src/infra/auth/modes/probe.ts",
    "packages/server/src/infra/auth/probe.tsx",
    "packages/server/src/infra/auth/probe.d.ts",
  ]) {
    for (const source of [
      "export function resolve(userId: string) {}",
      "const { userId: resolved } = identity;",
      "const identity = { userId: value };",
      "identity.userId;",
      "identity?.userId;",
      "identity[userId];",
      "declare const userId: unique symbol;",
      "class Auth { get userId(): string { return ''; } }",
      "class Auth { set userId(value: string) {} }",
      "class Auth { @userId accessor identity!: string; }",
      "export function resolve(user\\u0049d: string) {}",
      "// @orb-waive infra-auth-no-userid(userId): obsolete marker cannot excuse native syntax.\nconst userId = value;",
    ]) {
      expect(await findings(path, source, INFRA_AUTH_RULE), source).toHaveLength(1);
    }
    for (const source of [
      "// resolves NO userId here\nconst doc = 'the seam resolves userId';",
      "const identity = { externalId, handle, groups, email };",
      'const identity = { "userId": "documented", ["userId"]: "computed" }; identity["userId"];',
    ]) {
      expect(await findings(path, source, INFRA_AUTH_RULE), source).toEqual([]);
    }
  }
  for (const source of ["const node = <userId />;", "const node = <div userId />;"]) {
    expect(await findings("packages/server/src/infra/auth/probe.tsx", source, INFRA_AUTH_RULE), source).toHaveLength(1);
  }
  for (const path of [
    "packages/server/src/domain/sessions/verbs/validate.ts",
    "packages/server/src/entry/auth/seam.ts",
    "packages/server/src/infra/network/probe.ts",
    "packages/inference/src/probe.ts",
    "tests/server/infra/auth/probe.test.ts",
  ]) {
    expect(await findings(path, "const userId = value;", INFRA_AUTH_RULE), path).toEqual([]);
  }
});

test("infra verification cannot import or reexport the canonical post-row authority API", async () => {
  const path = "packages/server/src/infra/auth/modes/probe.ts";
  for (const source of [
    'import type { Principal } from "@orb/contracts/identity";',
    'import type { Principal as Caller } from "@orb/contracts/identity";',
    'import type { "Principal" as Caller } from "@orb/contracts/identity";',
    'export type { Principal as Caller } from "@orb/contracts/identity";',
    'export type { "Principal" as Caller } from "@orb/contracts/identity";',
    'import type { Can } from "@orb/contracts/identity";',
    'import { USER_ROLES } from "@orb/contracts/identity";',
    'import type * as Identity from "@orb/contracts/identity";',
    'export * from "@orb/contracts/identity";',
  ]) {
    expect(await findings(path, source, INFRA_AUTHORITY_RULE), source).toHaveLength(1);
  }
  for (const source of [
    'import type { ResolvedIdentity, AuthMode } from "@orb/contracts/identity";',
    'export type { ResolvedIdentity } from "@orb/contracts/identity";',
    'import { CSRF_HEADER } from "@orb/contracts/identity";',
    'import type { Principal as Foreign } from "foreign";',
    'import type { "Principal" as Foreign } from "foreign";',
    'export type { "Principal" as Foreign } from "foreign";',
  ]) {
    expect(await findings(path, source, INFRA_AUTHORITY_RULE), source).toEqual([]);
  }
  expect(await findings("packages/server/src/entry/auth/seam.ts", 'import type { Principal } from "@orb/contracts/identity";', INFRA_AUTHORITY_RULE)).toEqual(
    [],
  );
});

test("generated verification source retains both infra restrictions without activating unrelated rules", async () => {
  for (const path of ["packages/server/src/infra/auth/probe.gen.ts", "packages/server/src/infra/auth/modes/probe.gen.ts"]) {
    expect(await findings(path, "const userId = value;", INFRA_AUTH_RULE), path).toHaveLength(1);
    expect(await findings(path, 'import type { Principal as Caller } from "@orb/contracts/identity";', INFRA_AUTHORITY_RULE), path).toHaveLength(1);
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(
      Object.keys(config.rules)
        .filter((id) => id.startsWith("orb/"))
        .toSorted(),
    ).toEqual([INFRA_AUTH_RULE, INFRA_AUTHORITY_RULE].toSorted());
    expect(config.rules["@typescript-eslint/no-floating-promises"]).toBeUndefined();
    expect(config.languageOptions.parserOptions).toMatchObject({ project: false, projectService: false });
  }
  expect(await findings("packages/server/src/infra/network/probe.gen.ts", "const userId = value;", INFRA_AUTH_RULE)).toEqual([]);
});

test("the firehose selector bans the real callable firehose name outside its two homes", { timeout: scaledBudget(15_000) }, async () => {
  expect(typeof firehose).toBe("function");
  const source = [
    `import { ${FIREHOSE} } from "./chat-events-bus.ts";`,
    `export { ${FIREHOSE} } from "./chat-events-bus.ts";`,
    'import * as bus from "./chat-events-bus.ts";',
    `bus.${FIREHOSE}(() => {});`,
    `bus["${FIREHOSE}"](() => {});`,
    `liveBuses.chat?.${FIREHOSE}(() => {});`,
  ].join("\n");
  expect(await findings("packages/server/src/transport/trpc/stream/socket.ts", source, FIREHOSE_RULE)).toHaveLength(5);
  for (const path of ["packages/server/src/entry/compose/automation-watcher.ts", "packages/server/src/transport/trpc/index.ts"]) {
    expect(await findings(path, source, FIREHOSE_RULE), path).toEqual([]);
  }
});

const QUICKJS_TYPES = 'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n';
const DUMP_GUARD = "function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return ctx.alive && handle.alive;\n}\n";
const DUMP_HELPER =
  "function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n" +
  "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n";
const LIVE_SHAPE = QUICKJS_TYPES + DUMP_GUARD + DUMP_HELPER;
const helperWith = (body: string): string =>
  `${QUICKJS_TYPES}${DUMP_GUARD}function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, debug: boolean): unknown {\n${body}}\n`;

test("the hard membrane boundary refuses every dump spelling outside the one top-level guarded helper", { timeout: scaledBudget(30_000) }, async () => {
  for (const source of [
    `${QUICKJS_TYPES}export function attachAsync(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  return ctx.dump(handle);\n}\n`,
    `${QUICKJS_TYPES}${DUMP_GUARD}export function otherHelper(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n`,
    `${QUICKJS_TYPES}${DUMP_GUARD}export ${DUMP_HELPER}`,
    `${QUICKJS_TYPES}export function outer(): void {\n  function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n    return ctx.dump(handle);\n  }\n}\n`,
    `${LIVE_SHAPE}export const indexed = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx["dump"](handle);\n`,
    `${LIVE_SHAPE}export const escaped = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx["du\\u006dp"](handle);\n`,
    `${LIVE_SHAPE}export const templated = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx[\`dump\`](handle);\n`,
    `${LIVE_SHAPE}export const asserted = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx[("dump" as const)](handle);\n`,
    `${LIVE_SHAPE}export const satisfied = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx[("dump" satisfies string)](handle);\n`,
    `${LIVE_SHAPE}export const optional = (ctx: QuickJSContext | undefined, handle: QuickJSHandle): unknown => ctx?.dump(handle);\n`,
    `${LIVE_SHAPE}export const bound = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx.dump.call(ctx, handle);\n`,
    `${LIVE_SHAPE}export const aliased = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => {\n  const materialize = ctx.dump;\n  return materialize(handle);\n};\n`,
    `${LIVE_SHAPE}export const destructured = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => {\n  const { dump } = ctx;\n  return dump(handle);\n};\n`,
    `${LIVE_SHAPE}const DUMP = "dump";\nconst ALIAS = DUMP;\nexport const keyed = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => ctx[ALIAS](handle);\n`,
    `${LIVE_SHAPE}export const reflected = (ctx: QuickJSContext, handle: QuickJSHandle): unknown => Reflect.get(ctx, "dump")(handle);\n`,
    // Untyped: a same-named member of another package inside the membrane is judged too, deliberately stricter.
    `${LIVE_SHAPE}import type { QuickJSContext as Other } from "not-quickjs";\nexport function log(other: Other, handle: QuickJSHandle): unknown {\n  return other.dump(handle);\n}\n`,
    // Inside the helper: the guard must come first, be negated, and exit on its own consequent.
    helperWith(
      "  const value = ctx.dump(handle) as unknown;\n  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value };\n",
    ),
    helperWith(
      '  const { ["dump"]: materialize } = ctx;\n  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return materialize(handle);\n',
    ),
    helperWith("  handleSafeToDump(ctx, handle);\n  return { ok: true, value: ctx.dump(handle) };\n"),
    helperWith("  if (handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n"),
    helperWith(
      "  if (!handleSafeToDump(ctx, handle)) {\n    if (debug) {\n      return { ok: false };\n    }\n  }\n  return { ok: true, value: ctx.dump(handle) };\n",
    ),
    helperWith(
      "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: ctx.dump(handle) === null };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n",
    ),
    `${QUICKJS_TYPES}import { handleSafeToDump } from "./guards.ts";\n${DUMP_HELPER}`,
    `${QUICKJS_TYPES}${DUMP_GUARD}function tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, early = ctx.dump(handle)): unknown {\n  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return early;\n}\n`,
  ]) {
    expect(await findings(MEMBRANE, source, PLUGIN_DUMP_RULE, hard), source).toHaveLength(1);
  }
  for (const source of [
    LIVE_SHAPE,
    helperWith('  if (!handleSafeToDump(ctx, handle)) {\n    throw new Error("refused");\n  }\n  return ctx.dump(handle);\n'),
    `${QUICKJS_TYPES}${DUMP_GUARD}declare function note(): void;\nfunction tryDumpGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, debug: boolean): unknown {\n  if (!handleSafeToDump(ctx, handle)) {\n    if (debug) {\n      note();\n    }\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) };\n}\n`,
    `${LIVE_SHAPE}interface Foreign {\n  dump(handle: QuickJSHandle): object;\n}\n// ctx.dump stays behind tryDumpGuestValue\nexport const label = "dumped";\n`,
  ]) {
    expect(await findings(MEMBRANE, source, PLUGIN_DUMP_RULE, hard), source).toEqual([]);
  }
  expect(
    await findings(
      "packages/server/src/infra/plugin-host/realm.ts",
      `${QUICKJS_TYPES}export function hostResult(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  return ctx.dump(handle);\n}\n`,
      PLUGIN_DUMP_RULE,
      hard,
    ),
  ).toEqual([]);
});

test("the dump boundary is a HARD rule that judges the real membrane", { timeout: scaledBudget(15_000) }, async () => {
  const hardConfig = await hard.calculateConfigForFile(join(ROOT, MEMBRANE));
  expect(hardConfig.linterOptions).toMatchObject({ noInlineConfig: true });
  expect((await eslint.calculateConfigForFile(join(ROOT, MEMBRANE))).rules[PLUGIN_DUMP_RULE]).toBeUndefined();
  const live = readFileSync(join(ROOT, MEMBRANE), "utf8");
  expect(await findings(MEMBRANE, live, PLUGIN_DUMP_RULE, hard)).toEqual([]);
  const bypass = live.replace("const dumped = tryDumpGuestValue(ctx, handle);", "const dumped = { ok: true as const, value: ctx.dump(handle) as unknown };");
  expect(bypass).not.toBe(live);
  expect(await findings(MEMBRANE, bypass, PLUGIN_DUMP_RULE, hard)).toHaveLength(1);
  const late = live.replace(
    "  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value: ctx.dump(handle) as unknown };",
    "  const value = ctx.dump(handle) as unknown;\n  if (!handleSafeToDump(ctx, handle)) {\n    return { ok: false };\n  }\n  return { ok: true, value };",
  );
  expect(late).not.toBe(live);
  expect(await findings(MEMBRANE, late, PLUGIN_DUMP_RULE, hard)).toHaveLength(1);
});
