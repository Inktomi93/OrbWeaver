import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { MANUAL_MEMO_CUSTOM_HOMES, MANUAL_MEMO_EXPORTS } from "../../../../tooling/src/verify/contract/manual-memo.ts";
import { REACT_TYPES_HOME, reactProofModule } from "../../../../tooling/src/verify/gates/_proof/react.ts";
import { gate as memo } from "../../../../tooling/src/verify/gates/no-manual-memo.ts";
import { gate as reservation } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });
const CLIENT = "packages/client/src/features/probe.tsx";

async function nativeFindings(path: string, source: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: { "no-restricted-syntax": config.rules["no-restricted-syntax"] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

function customPass(files: Readonly<Record<string, string>>, grants = false): ReturnType<typeof runPolicyPass> {
  const root = "/memo-reservation-native";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [memo, reservation],
    policies: [memo, reservation],
    root,
    project,
    reviewedGrants: grants ? reviewedGrantsFor([memo]) : [],
    failOnWarnings: false,
  });
}

const boundary = (count: string, fallback = `<SkeletonRows count={${count}} />`, attributes = ""): string =>
  `export const G = <QueryBoundary fallback={${fallback}} ${attributes}>child</QueryBoundary>;`;

test("native memo import doors reject each named export and alias on every admitted root including generated TS", async () => {
  for (const path of [
    CLIENT,
    "packages/ui/src/probe.tsx",
    "tests/client/probe.ct.tsx",
    "tests/tooling/probe.ts",
    "packages/ui/src/probe.gen.ts",
    "packages/ui/src/tokens/index.ts",
  ]) {
    for (const name of MANUAL_MEMO_EXPORTS) {
      expect(await nativeFindings(path, `import { ${name} as unused } from "react";`), path).toHaveLength(1);
    }
  }
});

test("native memo grammar acquits unrelated exports, namespace uses, other packages, re-exports and other populations", async () => {
  for (const source of [
    'import { useState } from "react";',
    'import * as R from "react"; R.useState;',
    'import { useMemo } from "other";',
    'export { useMemo } from "react";',
  ]) {
    expect(await nativeFindings(CLIENT, source), source).toEqual([]);
  }
  for (const path of ["tests/legacy/client/probe.ct.tsx", "packages/server/src/probe.ts", "tooling/src/probe.ts", "scripts/probe.ts"]) {
    expect(await nativeFindings(path, 'import { useMemo, useCallback, memo } from "react";'), path).toEqual([]);
  }
});

test("approved memo subjects preserve all operations at file grain and custom real-grant liveness", async () => {
  const files: Record<string, string> = { [REACT_TYPES_HOME]: reactProofModule(), [CLIENT]: "export const clean = true;" };
  for (const path of Object.values(MANUAL_MEMO_CUSTOM_HOMES)) {
    const source =
      'import { useMemo, useCallback as cb, memo } from "react"; export const v = useMemo(() => 1, []); export const c = cb(() => 1, []); export const C = memo(() => null);';
    expect(await nativeFindings(path, source), path).toEqual([]);
    expect(await nativeFindings(path.replace(/\.(ts|tsx)$/, ".neighbor.$1"), source), path).toHaveLength(3);
    files[path] = source;
  }
  const result = customPass(files, true);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(3);
  expect(result.authority.authorityAlarms).toEqual([]);
  const absent = customPass({ [CLIENT]: "export const clean = true;" }, true);
  expect(absent.toolErrors).toEqual([]);
  expect(absent.authority.authorityAlarms).toHaveLength(3);
  expect(absent.authority.authorityAlarms.every(({ kind }) => kind === "stale-reviewed-grant")).toBe(true);
});

test("native memo calls have no duplicate custom finding while independent namespace acts remain custom", async () => {
  const source =
    'import { useMemo, useCallback as cb, memo } from "react"; export const v = useMemo(() => 1, []); export const c = cb(() => 1, []); export const C = memo(() => null);';
  const direct = customPass({ [REACT_TYPES_HOME]: reactProofModule(), [CLIENT]: source });
  expect(direct.toolErrors).toEqual([]);
  expect(direct.authority.effectiveFindings).toEqual([]);
  expect(await nativeFindings(CLIENT, source)).toHaveLength(3);
  const mixed = customPass({ [REACT_TYPES_HOME]: reactProofModule(), [CLIENT]: `${source} import * as R from "react"; export const ref = R["memo"];` });
  expect(mixed.toolErrors).toEqual([]);
  expect(mixed.authority.effectiveFindings).toHaveLength(1);
});

test("computed React members retain canonical custom identity in noncallee positions", () => {
  for (const source of ['import * as R from "react"; export const v = R["useMemo"];', 'import React from "react"; export const v = React["useCallback"];']) {
    const result = customPass({ [REACT_TYPES_HOME]: reactProofModule(), [CLIENT]: source });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings, source).toHaveLength(1);
  }
});

test("native reservation owns direct numbers and parentheses without duplicate custom findings", async () => {
  for (const source of [boundary("3"), boundary("((3))"), boundary("3", "(<SkeletonRows count={3} />)")]) {
    expect(await nativeFindings(CLIENT, source), source).toHaveLength(1);
    const result = customPass({ [CLIENT]: source });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual([]);
  }
});

test("native reservation preserves exact tag, fallback, count and attribute fences", async () => {
  for (const source of [
    boundary("3", undefined, 'reserveKey="a.b"'),
    boundary("3", undefined, "reserveKey={key}"),
    boundary("p.n ?? 4"),
    boundary("-3"),
    boundary("+3"),
    boundary('"3"'),
    boundary("3", "<Spinner count={3} />"),
    boundary("3", "<Stack><SkeletonRows count={3} /></Stack>"),
    boundary("3", "<SkeletonRows />"),
    boundary("3", "<SkeletonRows count={3}></SkeletonRows>"),
    boundary("3").replaceAll("QueryBoundary", "Boundary"),
    "export const G = <QueryBoundary fallback={<SkeletonRows count={3} />} />;",
    boundary("3!"),
    boundary("3", "(<SkeletonRows count={3} />)!"),
  ]) {
    expect(await nativeFindings(CLIENT, source), source).toEqual([]);
    const result = customPass({ [CLIENT]: source });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings, source).toEqual([]);
  }
  for (const path of ["tests/client/probe.ct.tsx", "packages/ui/src/probe.tsx", "packages/server/src/probe.tsx"]) {
    expect(await nativeFindings(path, boundary("3")), path).toEqual([]);
  }
});

test("reservation constants and TS wrappers remain custom and imported constants remain outside same-file lookup", async () => {
  for (const source of [
    `const ROWS = 4; ${boundary("ROWS")}`,
    boundary("3 as number"),
    boundary("3 satisfies number"),
    boundary("3", "(<SkeletonRows count={3} /> as Element)"),
  ]) {
    expect(await nativeFindings(CLIENT, source), source).toEqual([]);
    const result = customPass({ [CLIENT]: source });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
  }
  const imported = customPass({
    "packages/client/src/rows.ts": "export const ROWS = 4;",
    [CLIENT]: `import { ROWS } from "../rows.ts"; ${boundary("ROWS")}`,
  });
  expect(imported.toolErrors).toEqual([]);
  expect(imported.authority.effectiveFindings).toEqual([]);
});

test("later client selector layers and generated profiles retain the migrated restrictions", async () => {
  const source = `import { memo } from "react"; ${boundary("3")}`;
  for (const path of [
    "packages/client/src/state/probe.tsx",
    "packages/client/src/features/app-shell/probe.tsx",
    "packages/client/src/components/weave-glyph.tsx",
    CLIENT,
    "packages/client/src/routes/probe.tsx",
    "packages/client/src/routes/app-root.tsx",
    "packages/client/src/routes/login-page.tsx",
    "packages/client/src/routes/router.tsx",
  ]) {
    expect(await nativeFindings(path, source), path).toHaveLength(2);
  }
  for (const path of ["packages/client/src/data/create-entity-mutation.ts", "packages/client/src/data/create-collection-surface.ts"]) {
    expect(await nativeFindings(path, 'import { memo } from "react";'), path).toHaveLength(1);
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config.rules["no-restricted-syntax"], path).toContainEqual(
      expect.objectContaining({
        message: "A direct static SkeletonRows count guesses the settled box. Add reserveKey to QueryBoundary.",
      }),
    );
  }
  expect(await nativeFindings("packages/client/src/probe.gen.ts", 'import { memo } from "react";')).toHaveLength(1);
});

test("semantic memo and reservation remainder proofs preserve unmatched origins and marker identity", () => {
  expect(verifyPolicyProofs([memo, reservation])).toEqual([]);
});
