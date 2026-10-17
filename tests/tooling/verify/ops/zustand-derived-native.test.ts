import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS, CLIENT_LEXICAL_NATIVE_RULES } from "../../../../tooling/src/verify/lib/client-lexical-native.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/zustand-selector-derived";
const SUBJECT = "packages/client/src/state/probe.ts";
const ESLINT = new ESLint({ cwd: ROOT });
const ROWS = [
  {
    files: {
      "packages/client/src/state/x.ts":
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/y.ts":
        "declare const useXStore: (sel: (s: { items: readonly number[] | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items ?? []);\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/arr.ts":
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => [s.a, s.b]);\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/block.ts":
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  return { a: s.a };\n});\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/keys.ts":
        "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const k = useXStore((s) => Object.keys(s.m));\n",
      "packages/client/src/state/values.ts":
        "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const vals = useXStore((s) => Object.values(s.m));\n",
      "packages/client/src/state/entries.ts":
        "declare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const e = useXStore((s) => Object.entries(s.m));\n",
    },
    count: 3,
  },
  {
    files: {
      "packages/client/src/state/map.ts":
        "declare const useXStore: (sel: (s: { items: readonly number[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.map((n) => n * 2));\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/vanilla.ts":
        "declare const useStore: (store: unknown, sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, (s) => ({ a: s.a, b: s.b }));\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/as-wrapped.ts":
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a }) as { a: number });\n",
    },
    count: 1,
  },
  {
    files: {
      "packages/client/src/state/ok.ts": "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.a);\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/wrapped.ts":
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const useShallow: <T>(s: T) => T;\nexport const v = useXStore(useShallow((s) => ({ a: s.a, b: s.b })));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/wrapped-vanilla.ts":
        "declare const useStore: (store: unknown, sel: unknown) => unknown;\ndeclare const useShallow: (sel: (s: { a: number; b: number }) => unknown) => unknown;\ndeclare const store: unknown;\nexport const v = useStore(store, useShallow((s) => ({ a: s.a, b: s.b })));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/frozen.ts":
        "const EMPTY = Object.freeze({});\ndeclare const useXStore: (sel: (s: { m: Record<string, number> | undefined }) => unknown) => unknown;\nexport const v = useXStore((s) => s.m ?? EMPTY);\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/stable-ternary.ts":
        "const IDLE = { phase: 'idle' } as const;\ndeclare const useXStore: (sel: (s: { id: string | null; turns: Record<string, unknown> }) => unknown) => unknown;\nexport const v = useXStore((s) => (s.id === null ? IDLE : (s.turns[s.id] ?? IDLE)));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/non-store.ts":
        "declare const useMemo: (fn: () => unknown, deps: unknown[]) => unknown;\nexport const v = useMemo(() => ({ a: 1 }), []);\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/member-callee.ts":
        "declare const handle: { useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown; getState: () => { a: number } };\nexport const v = handle.useXStore((s) => ({ a: s.a, b: s.b }));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/nested-helper.ts":
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useXStore((s) => {\n  const shape = () => {\n    return { a: s.a };\n  };\n  void shape;\n  return s.a;\n});\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/join.ts":
        "declare const useXStore: (sel: (s: { items: readonly string[] }) => unknown) => unknown;\nexport const v = useXStore((s) => s.items.join(','));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/object-freeze.ts":
        "const EMPTY: Record<string, number> = {};\ndeclare const useXStore: (sel: (s: { m: Record<string, number> }) => unknown) => unknown;\nexport const v = useXStore((s) => Object.freeze(EMPTY));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/concat.ts":
        "declare const useXStore: (sel: (s: { label: string; a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => s.label + [s.a, s.b]);\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/by-ref.ts":
        "function selectAB(s: { a: number; b: number }) {\n  return { a: s.a, b: s.b };\n}\ndeclare const useXStore: (sel: typeof selectAB) => unknown;\nexport const v = useXStore(selectAB);\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/anchor.ts":
        "declare const useXStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const anchor = useXStore((s) => s.a);\n",
      "packages/server/src/domain/x/verbs/act.ts":
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
    },
    count: 0,
  },
  {
    files: {
      "packages/client/src/state/waived.ts":
        "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n// @orb-waive zustand-selector-derived(useXStore): the proof stand-in reason; ends when this fixture stops flagging.\nexport const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
    },
    count: 0,
  },
] as const;

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await ESLINT.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [RULE]: config.rules[RULE] ?? "off" },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

test("all twenty-two declared store-output cases retain their native verdicts", async () => {
  for (const row of ROWS) {
    const messages: Linter.LintMessage[] = [];
    for (const [path, source] of Object.entries(row.files)) {
      const translated = source.replace(
        /^.*@orb-waive[^\n]*\n/gmu,
        `// eslint-disable-next-line ${RULE} -- Controlled native identity input; remove with fixture.\n`,
      );
      messages.push(...(await findings(translated, path)));
    }
    expect(messages, JSON.stringify(row.files)).toHaveLength(row.count);
  }
});

test("ordinary native permission is line-local and stale or wrong permissions fail", async () => {
  const unsafe = "const x=useXStore(s=>({a:s.a}));";
  const marker = `// eslint-disable-next-line ${RULE} -- Controlled native identity input; remove with fixture.\n`;
  expect(await findings(`${marker}${unsafe}`)).toEqual([]);
  expect(await findings(`${marker}${unsafe}\n${unsafe}`)).toMatchObject([{ ruleId: RULE }]);
  expect(await findings(`${marker}const safe=1;`)).toMatchObject([{ message: expect.stringContaining("Unused eslint-disable directive") }]);
  expect(await findings(`// eslint-disable-next-line ${RULE}-wrong -- Unknown native rule.\n${unsafe}`)).toHaveLength(2);
  expect(await findings(`${marker}const safe=1;\n${unsafe}`)).toHaveLength(2);
});

test("actual client scope and the existing lexical metadata family own store output lint", async () => {
  for (const path of [SUBJECT, "packages/client/src/probe.gen.tsx"]) {
    expect(await findings("const x=useXStore(s=>[s.a]);", path), path).toMatchObject([{ ruleId: RULE }]);
  }
  for (const path of ["packages/ui/src/probe.ts", "packages/server/src/probe.ts", "tests/client/probe.dom.test.ts", "tooling/src/probe.ts"]) {
    expect(await findings("const x=useXStore(s=>[s.a]);", path), path).toEqual([]);
  }
  const config = await ESLINT.calculateConfigForFile(join(ROOT, SUBJECT));
  const declaration = await ESLINT.calculateConfigForFile(join(ROOT, "packages/client/src/probe.d.ts"));
  expect(declaration.rules[RULE]).toEqual([2]);
  const hard = await new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") }).calculateConfigForFile(join(ROOT, SUBJECT));
  expect(hard.rules[RULE] ?? [0]).toEqual([0]);
  expect(CLIENT_LEXICAL_NATIVE_RULES).toContain(RULE);
  expect(config.rules[RULE]).toEqual([2]);
  expect(config.settings["orb/client-lexical-inputs"]).toBe(
    createHash("sha256")
      .update(JSON.stringify(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(ROOT, path), "utf8")])))
      .digest("hex"),
  );
});

test("native wrappers, output recursion and owned returns preserve the complete syntax limits", async () => {
  const cases = [
    ["const x=useXStore(((s)=>({a:s.a})));", 0],
    ["const x=(useXStore)(s=>({a:s.a}));", 0],
    ["const x=useXStore?.<unknown>(s=>({a:s.a}));", 1],
    ["const x=useXStore<unknown>((s=>({a:s.a})));", 0],
    ["const x=useStore(store, (s=>({a:s.a})));", 0],
    ["const x=useStore(store, function select(s){return {a:s.a};});", 1],
    ["const x=useXStore((s,i)=>({a:s.a}));", 1],
    ["const x=useXStore(s=>(({a:s.a} as T) satisfies U));", 1],
    ["const x=useXStore(s=>({a:s.a})!);", 0],
    ["const x=useXStore(s=><T>{a:s.a});", 0],
    ["const x=useXStore(s=>{if(s.ok)return {a:s.a};return [];});", 1],
    ["const x=useXStore(s=>{const helper=()=>({a:s.a});return s.a;});", 0],
    ["const x=useXStore(s=>{const helper={f(){return {a:s.a};}};return s.a;});", 0],
    ["const x=useXStore(s=>{class Helper{f(){return {a:s.a};}}return s.a;});", 0],
    ["const x=useXStore(s=>{const helper={get f(){return {a:s.a};}};return s.a;});", 1],
    ["const x=useXStore(s=>{class Helper{constructor(){return {a:s.a};}}return s.a;});", 1],
    ["const x=useXStore(s=>Object?.keys(s.m));", 1],
    ["const x=useXStore(s=>(Object).keys(s.m));", 0],
    ["const x=useXStore(s=>Object['keys'](s.m));", 0],
    ["const x=useXStore(s=>(s.items.map)(v=>v));", 0],
    ["const x=useXStore(s=>s.items?.map(v=>v));", 1],
    ["const x=useXStore(s=>s.items.map?.(v=>v));", 1],
    ["const x=useXStore(s=>s.label+[s.a]);", 0],
    [String.raw`const x=use\u0058Store(s=>({a:s.a}));`, 0],
  ] as const;
  for (const [source, count] of cases) {
    expect(await findings(source), source).toHaveLength(count);
  }
  const nested = Array.from({ length: 24 }, () => "s.ok?EMPTY:(").join("") + "[s.a]" + ")".repeat(24);
  expect(await findings(`const x=useXStore(s=>${nested});`)).toMatchObject([{ ruleId: RULE }]);
  for (const method of ["map", "filter", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"]) {
    expect(await findings(`const x=useXStore(s=>s.items.${method}());`), method).toHaveLength(1);
  }
});

test("escaped member identifiers retain derivation identity without admitting computed names", async () => {
  const escaped = [String.raw`const x=useXStore(s=>s.items.m\u0061p(x=>x));`, String.raw`const x=useXStore(s=>Object.k\u0065ys(s.items));`];
  expect(await Promise.all(escaped.map((source) => findings(source)))).toMatchObject([[{ ruleId: RULE }], [{ ruleId: RULE }]]);
  for (const source of [
    String.raw`const x=useXStore(s=>s.items.j\u006fin(','));`,
    String.raw`const x=useXStore(s=>Object.fr\u0065eze(EMPTY));`,
    String.raw`const x=useXStore(s=>s.items['m\u0061p'](x=>x));`,
    String.raw`const x=useXStore(s=>Object['k\u0065ys'](s.items));`,
  ]) {
    expect(await findings(source), source).toEqual([]);
  }
});

test("malformed source refuses rather than returning an empty native verdict", async () => {
  const config = await ESLINT.calculateConfigForFile(join(ROOT, SUBJECT));
  const messages = new Linter().verify("const x=useXStore(s=>({a:", {
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
    plugins: config.plugins,
    rules: { [RULE]: config.rules[RULE] },
  });
  expect(messages).toMatchObject([{ fatal: true, severity: 2 }]);
});
