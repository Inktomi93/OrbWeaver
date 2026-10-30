// The client and @orb/ui law gates that were review-only, run through the repo config: manual memo, the React 19
// skip list, `useInfiniteQuery` outside its factory, and the motion class refusals.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

const CLIENT = "packages/client/src/";
const FEATURE = `${CLIENT}features/chat/components/probe.tsx`;
const DATA = `${CLIENT}data/probe.ts`;
const FACTORY = `${CLIENT}data/create-collection-surface.ts`;
const UI = "packages/ui/src/primitives/probe/probe.tsx";
const UI_VARIANTS = "packages/ui/src/primitives/probe/variants.ts";

const MEMO = "orb/no-manual-memo";
const LEGACY = "orb/no-legacy-react-api";
const RESTRICTED_IMPORTS = "no-restricted-imports";
const CLASSES = "better-tailwindcss/no-restricted-classes";
const USE_PROMISE = "orb/no-use-promise";

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      settings: config?.settings ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  // A className reached by two class selectors reports once per selector; one location is one finding.
  const own = found.filter(({ ruleId }) => ruleId === rule);
  return own.filter((finding, index) => own.findIndex(({ line, column }) => line === finding.line && column === finding.column) === index);
}

const classed = (value: string): string => `export const X = () => <div className="${value}" />;`;

// [rule, label, source, path, expected finding count]
const CASES = [
  [MEMO, "a useMemo import", 'import { useMemo } from "react";\nexport const v = useMemo;', FEATURE, 1],
  [MEMO, "an aliased useCallback import", 'import { useCallback as cb } from "react";\nexport const v = cb;', UI, 1],
  [MEMO, "a memo import", 'import { memo } from "react";\nexport const v = memo;', FEATURE, 1],
  [MEMO, "React.useMemo through the namespace", 'import * as React from "react";\nexport const v = React.useMemo(() => 1, []);', FEATURE, 1],
  [MEMO, "React.memo through the namespace", 'import React from "react";\nexport const v = React.memo(() => null);', FEATURE, 1],
  [MEMO, "R.useMemo through a renamed namespace", 'import * as R from "react";\nexport const v = R.useMemo(() => 1, []);', FEATURE, 1],
  [MEMO, "R.memo through a renamed default import", 'import R from "react";\nexport const v = R.memo(() => null);', FEATURE, 1],
  [MEMO, "useMemo destructured from the namespace", 'import * as React from "react";\nexport const { useMemo } = React;', FEATURE, 1],
  [MEMO, "memo destructured from a renamed default import", 'import R from "react";\nconst { memo: wrap } = R;\nexport const v = wrap;', FEATURE, 1],
  [MEMO, "a member named useMemo on another object", 'import * as React from "react";\nexport const v = [React, cache.useMemo];', FEATURE, 0],
  [MEMO, "a hook that is not a memo", 'import { useState } from "react";\nexport const v = useState;', FEATURE, 0],
  [MEMO, "a memo name from another module", 'import { memo } from "./cache.ts";\nexport const v = memo;', FEATURE, 0],
  [
    MEMO,
    "a file the compiler skips for its virtualizer import",
    'import { useVirtualizer } from "@tanstack/react-virtual";\nimport { useCallback } from "react";\nexport const v = [useVirtualizer, useCallback];',
    UI,
    0,
  ],
  [LEGACY, "a useActionState import", 'import { useActionState } from "react";\nexport const v = useActionState;', FEATURE, 1],
  [LEGACY, "a useOptimistic import", 'import { useOptimistic } from "react";\nexport const v = useOptimistic;', FEATURE, 1],
  [LEGACY, "a react-dom useFormStatus import", 'import { useFormStatus } from "react-dom";\nexport const v = useFormStatus;', FEATURE, 1],
  [LEGACY, "a react-dom useFormState import", 'import { useFormState } from "react-dom";\nexport const v = useFormState;', FEATURE, 1],
  [LEGACY, "React.useOptimistic through the namespace", 'import * as React from "react";\nexport const v = React.useOptimistic(1);', FEATURE, 1],
  [LEGACY, "a form action", 'export const X = () => <form action={send} aria-label="x" />;', FEATURE, 1],
  [LEGACY, "a form onSubmit", 'export const X = () => <form aria-label="x" onSubmit={send} />;', FEATURE, 0],
  [LEGACY, "a document.title write", 'document.title = "x";', FEATURE, 1],
  [LEGACY, "a globalThis.document.title write", 'globalThis.document.title = "x";', FEATURE, 1],
  [LEGACY, "a title write on another object", 'row.title = "x";', FEATURE, 0],
  [LEGACY, "a document.title read", "export const t = document.title;", FEATURE, 0],
  [LEGACY, "a flushSync import", 'import { flushSync } from "react-dom";\nexport const v = flushSync;', FEATURE, 1],
  [LEGACY, "a createPortal import", 'import { createPortal } from "react-dom";\nexport const v = createPortal;', FEATURE, 0],
  [
    RESTRICTED_IMPORTS,
    "useInfiniteQuery in a feature",
    'import { useInfiniteQuery } from "@tanstack/react-query";\nexport const v = useInfiniteQuery;',
    FEATURE,
    1,
  ],
  [
    RESTRICTED_IMPORTS,
    "useInfiniteQuery in data outside the factory",
    'import { useInfiniteQuery } from "@tanstack/react-query";\nexport const v = useInfiniteQuery;',
    DATA,
    1,
  ],
  [RESTRICTED_IMPORTS, "an aliased useInfiniteQuery", 'import { useInfiniteQuery as page } from "@tanstack/react-query";\nexport const v = page;', FEATURE, 1],
  [
    RESTRICTED_IMPORTS,
    "useInfiniteQuery in its factory",
    'import { useInfiniteQuery } from "@tanstack/react-query";\nexport const v = useInfiniteQuery;',
    FACTORY,
    0,
  ],
  [
    RESTRICTED_IMPORTS,
    "useSuspenseInfiniteQuery from #data in a feature",
    'import { useSuspenseInfiniteQuery } from "#data";\nexport const v = useSuspenseInfiniteQuery;',
    FEATURE,
    1,
  ],
  [
    RESTRICTED_IMPORTS,
    "useSuspenseInfiniteQuery from TanStack in a feature",
    'import { useSuspenseInfiniteQuery } from "@tanstack/react-query";\nexport const v = useSuspenseInfiniteQuery;',
    FEATURE,
    1,
  ],
  [
    RESTRICTED_IMPORTS,
    "useSuspenseInfiniteQuery from #data in the transcript window",
    'import { useSuspenseInfiniteQuery } from "#data";\nexport const v = useSuspenseInfiniteQuery;',
    `${CLIENT}features/chat/components/transcript-window.tsx`,
    0,
  ],
  [
    RESTRICTED_IMPORTS,
    "useSuspenseInfiniteQuery from #data in the character picker",
    'import { useSuspenseInfiniteQuery } from "#data";\nexport const v = useSuspenseInfiniteQuery;',
    `${CLIENT}components/character-picker.tsx`,
    0,
  ],
  [
    RESTRICTED_IMPORTS,
    "useSuspenseQuery from TanStack in a feature",
    'import { useSuspenseQuery } from "@tanstack/react-query";\nexport const v = useSuspenseQuery;',
    FEATURE,
    1,
  ],
  [RESTRICTED_IMPORTS, "useSuspenseQuery from #data in a feature", 'import { useSuspenseQuery } from "#data";\nexport const v = useSuspenseQuery;', FEATURE, 0],
  [RESTRICTED_IMPORTS, "useQuery in a feature", 'import { useQuery } from "@tanstack/react-query";\nexport const v = useQuery;', FEATURE, 0],
  [CLASSES, "transition-all", classed("transition-all"), UI, 1],
  [CLASSES, "transition-all behind a variant", classed("hover:transition-all"), UI, 1],
  [CLASSES, "transition-[all]", classed("transition-[all]"), UI, 1],
  [CLASSES, "transition-all with the important suffix", classed("transition-all!"), UI, 1],
  [CLASSES, "transition-all with the important prefix", classed("!transition-all"), UI, 1],
  [CLASSES, "all listed first among transition properties", classed("transition-[all,opacity]"), UI, 1],
  [CLASSES, "all listed last among transition properties", classed("transition-[opacity,all]"), UI, 1],
  [CLASSES, "a transition on a property that merely contains all", classed("transition-[overall]"), UI, 0],
  [CLASSES, "a keyframe on a named group lifecycle attribute", classed("group-data-open/popup:animate-fade-in"), UI, 1],
  [CLASSES, "a keyframe on the bracket attribute form", classed("data-[open]:animate-fade-in"), UI, 1],
  [CLASSES, "a keyframe on a has() lifecycle attribute", classed("has-data-open:animate-fade-in"), UI, 1],
  [CLASSES, "an important keyframe on data-open", classed("data-open:!animate-fade-in"), UI, 1],
  [CLASSES, "a named transition", classed("transition-[opacity,scale]"), UI, 0],
  [CLASSES, "an enter keyframe on data-open", classed("data-open:animate-fade-in"), UI, 1],
  [CLASSES, "an exit keyframe on a group-keyed lifecycle attribute", classed("group-data-ending-style:animate-fade-out"), UI, 1],
  [CLASSES, "a keyframe behind a stacked variant", classed("data-closed:motion-safe:animate-fade-out"), UI, 1],
  [CLASSES, "a stock infinite loop on data-open", classed("data-open:animate-pulse"), UI, 0],
  [CLASSES, "a loop keyed on a non-lifecycle attribute", classed("data-indeterminate:animate-pulse"), UI, 0],
  [CLASSES, "animate-none on data-closed", classed("data-closed:animate-none"), UI, 0],
  [CLASSES, "an unconditional animation", classed("animate-pulse"), UI, 0],
  [CLASSES, "transition-all in a variants file string", 'export const slot = "transition-all duration-150";', UI_VARIANTS, 1],
  [CLASSES, "a word-reveal keyframe on a lifecycle attribute", classed("data-open:animate-[orb-word-reveal_var(--motion-base)]"), UI, 1],
  [CLASSES, "a word-reveal keyframe behind a group lifecycle attribute", classed("group-data-closed:animate-[orb-word-reveal_1s]"), UI, 1],
  [CLASSES, "a word-reveal keyframe with no lifecycle attribute", classed("animate-[orb-word-reveal_var(--motion-base)]"), UI, 0],
  [CLASSES, "a shell variant in a feature", classed("shell-mobile:hidden"), FEATURE, 1],
  [CLASSES, "a stacked shell variant in a feature", classed("hover:shell-desktop:flex"), FEATURE, 1],
  [CLASSES, "a narrow shell variant in client code outside features", classed("shell-narrow:flex"), `${CLIENT}components/probe.tsx`, 1],
  [CLASSES, "a short shell variant in a ui primitive", classed("shell-short:hidden"), UI, 1],
  [CLASSES, "a shell variant in the app shell", classed("shell-mobile:hidden"), `${CLIENT}features/app-shell/surfaces/probe.tsx`, 0],
  [CLASSES, "a class that only starts with shell", classed("shell-panel"), FEATURE, 0],
] as const;

test.for(CASES)("%s: %s", { timeout: 120_000 }, async ([rule, , source, path, count]) => {
  expect(await findings(rule, source, path)).toHaveLength(count);
});

// no-use-promise reads the argument's type, so it runs over a planted program with a React stub.
const REACT_STUB =
  "export interface Context<T> { Provider: unknown; Consumer: unknown; readonly _value?: T }\nexport function createContext<T>(value: T): Context<T>;\nexport function use<T>(source: Promise<T> | Context<T>): T;\n";

async function useFindings(source: string, plantedTree: (files: Record<string, string>) => Promise<string>): Promise<number> {
  const root = await plantedTree({
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "esnext",
        moduleResolution: "bundler",
        target: "esnext",
        allowImportingTsExtensions: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: "preserve",
        paths: { react: ["./react-stub.d.ts"] },
      },
      include: ["packages", "react-stub.d.ts"],
    }),
    "react-stub.d.ts": REACT_STUB,
    [FEATURE]: source,
  });
  const config = await eslint.calculateConfigForFile(join(ROOT, FEATURE));
  const found = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: root, ecmaFeatures: { jsx: true } },
      },
      rules: { [USE_PROMISE]: config?.rules?.[USE_PROMISE] ?? "off" },
    },
    { filename: join(root, FEATURE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === USE_PROMISE).length;
}

const REACT_IMPORT =
  'import { createContext, use } from "react";\nconst Ctx = createContext(1);\ndeclare const pending: Promise<number>;\ndeclare function load(): Promise<number>;\n';

test.for([
  ["a promise variable", `${REACT_IMPORT}export const v = use(pending);`, 1],
  ["a promise returned by a call", `${REACT_IMPORT}export const v = use(load());`, 1],
  ["a promise named like a context", `${REACT_IMPORT}declare const PendingContext: Promise<number>;\nexport const v = use(PendingContext);`, 1],
  ["an aliased use", `import { use as read } from "react";\ndeclare const pending: Promise<number>;\nexport const v = read(pending);`, 1],
  ["a context", `${REACT_IMPORT}export const v = use(Ctx);`, 0],
  ["a context held in an object", `${REACT_IMPORT}const registry = { Context: Ctx };\nexport const v = use(registry.Context);`, 0],
  ["use through a renamed namespace", `import * as R from "react";\ndeclare const pending: Promise<number>;\nexport const v = R.use(pending);`, 1],
  [
    "use destructured from the namespace",
    `import * as React from "react";\ndeclare const pending: Promise<number>;\nconst { use } = React;\nexport const v = use(pending);`,
    1,
  ],
  ["a use from another module", `import { use } from "./other.ts";\ndeclare const pending: Promise<number>;\nexport const v = use(pending);`, 0],
] as const)("orb/no-use-promise judges %s", { timeout: 120_000 }, async ([, source, count], { plantedTree }) => {
  expect(await useFindings(source, plantedTree)).toBe(count);
});
