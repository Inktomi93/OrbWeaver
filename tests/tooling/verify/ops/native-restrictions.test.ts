import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { gate as computedFormDependencies } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });

// Only the effective native restriction options are exercised; typed rules keep their own compiler tests.
async function findings(path: string, source: string): Promise<readonly string[]> {
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
    path,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("layout and HTML attributes cover intrinsic, custom and member tags without judging spreads or object keys", async () => {
  for (const path of ["packages/client/src/features/probe.tsx", "packages/ui/src/probe.tsx"]) {
    expect(await findings(path, '<Cards.Card compact inDrawer isSheet density="compact" dangerouslySetInnerHTML={{ __html: text }} />')).toHaveLength(5);
    expect(await findings(path, "<div dangerouslySetInnerHTML={{ __html: text }} />; <Card dangerouslySetInnerHTML={{ __html: text }} />;")).toHaveLength(2);
    expect(
      await findings(
        path,
        '<Card data-density="compact" {...{ compact: true, dangerouslySetInnerHTML: html }} />; const options = { dangerouslySetInnerHTML: false };',
      ),
    ).toEqual([]);
  }
  expect(await findings("packages/server/src/probe.tsx", "<Card compact dangerouslySetInnerHTML={{ __html: text }} />")).toEqual([]);
});

test("caller identity rejects local, property, destructuring and JSX identifiers but not quoted keys", async () => {
  for (const path of ["packages/inference/src/probe.ts", "tooling/src/probe.ts", "tests/tooling/probe.ts", "scripts/probe.ts"]) {
    expect(await findings(path, "const callerUserId = 1; const obj = { callerUserId: 1 }; const { callerUserId: value } = obj;")).toHaveLength(3);
    expect(await findings(path, 'const obj = { "callerUserId": 1 }; obj["callerUserId"]; // callerUserId')).toEqual([]);
  }
  expect(await findings("packages/ui/src/probe.tsx", "<callerUserId callerUserId />")).toHaveLength(2);
  for (const path of ["tooling/src/verify/gates/probe.ts", "packages/showcase-plugins/src/probe.ts", "tests/legacy/tooling/probe.ts"]) {
    expect(await findings(path, "const callerUserId = 1;")).toEqual([]);
  }
});

test("generated outputs retain migrated restrictions without activating other rules or typed parsing", async () => {
  for (const path of ["packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/themes.gen.ts"]) {
    expect(
      await findings(path, 'const callerUserId = 1; useEffect(() => {}, [form.store]); import { useMutation } from "@tanstack/react-query";'),
    ).toHaveLength(3);
    expect(await findings(path, "Widget.defaultProps;")).toEqual([]);
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(Object.keys(config.rules)).toEqual(["no-restricted-syntax"]);
    expect(config.languageOptions.parserOptions).toMatchObject({ project: false, projectService: false });
  }
});

test("restriction-only admission preserves the original maintained JS and TS populations", async () => {
  for (const path of [
    "aggregator-assets.d.ts",
    "platform.d.ts",
    "packages/plugin-sdk/frame.d.ts",
    "packages/showcase-plugins/bundles/affinity-tracker/main.ts",
    "packages/showcase-plugins/bundles/pocket-arcade/frame.ts",
    "playwright/globals.d.ts",
    "playwright/index.tsx",
  ]) {
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config, path).toBeDefined();
    expect(Object.keys(config.rules), path).toEqual(["no-restricted-syntax"]);
    expect(config.linterOptions.reportUnusedDisableDirectives, path).toBe(0);
    expect(config.languageOptions.parserOptions.project ?? false, path).toBe(false);
    expect(config.languageOptions.parserOptions.projectService ?? false, path).toBe(false);
    expect(await findings(path, "useEffect(() => {}, [form.store]);"), path).toHaveLength(1);
    expect(await findings(path, 'const callerUserId = 1; const isGroup = true; import { useMutation } from "@tanstack/react-query";'), path).toEqual([]);
  }
  for (const path of [
    "eslint.config.js",
    ".claude/hooks/tool-guard.mjs",
    "scripts/probes/control.cjs",
    "vitest.config.ts",
    "packages/client/vite.config.ts",
    "packages/server/src/entry/app.ts",
    "packages/client/src/main.tsx",
    "tooling/src/verify/ops/eslint.ts",
    "scripts/probes/st-goldens/rig-helper.ts",
  ]) {
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(config, path).toBeDefined();
    expect(config.rules["regexp/no-invalid-regexp"], path).toEqual([2]);
    expect(config.rules["@eslint-community/eslint-comments/require-description"], path).toEqual([2]);
    expect(config.linterOptions.reportUnusedDisableDirectives, path).toBe(2);
  }
});

test("group vocabulary judges direct declarations and conditions only on its source population", async () => {
  const source = "const isGroup = true; if (isGroupChat) {} const mode = isGroupMode ? 1 : 0; let is_group = false;";
  for (const path of ["packages/client/src/probe.ts", "packages/showcase-plugins/src/probe.ts", "tooling/src/probe.ts"]) {
    expect(await findings(path, source)).toHaveLength(4);
    expect(await findings(path, "if ((isGroup)) {} const choice = ((isGroupMode)) ? 1 : 0;")).toHaveLength(2);
    expect(await findings(path, "const { isGroup } = state; if (state.isGroup) {} if (!isGroup) {} const isGrouped = true;")).toEqual([]);
  }
  for (const path of [
    "tests/tooling/probe.ts",
    "scripts/probe.ts",
    "packages/client/src/tools/probe.ts",
    "packages/server/src/tests/probe.ts",
    "packages/ui/src/probe.test.tsx",
    "packages/client/src/probe.spec.ts",
  ]) {
    expect(await findings(path, source)).toEqual([]);
  }
});

test("effect dependencies retain arity, callee and nested member syntax", async () => {
  const path = "tooling/src/probe.ts";
  for (const source of [
    "useEffect(() => {}, [form.state.values]);",
    'React["useEffect"](() => {}, [form["state"]["values"]]);',
    'React.useEffect(() => {}, [form.state["values"]]);',
    "useEffect(() => {}, [(form.store as Store)!]);",
    "useEffect(() => {}, [wrap({ nested: form?.state?.values })]);",
    "((useEffect))(() => {}, [form.store]);",
    "React[`useEffect`](() => {}, [form[`state`][`values`]]);",
  ]) {
    expect(await findings(path, source), source).toHaveLength(1);
  }
  for (const source of [
    "useEffect(() => { read(form.state.values); }, []);",
    "useEffect(() => {}, [form.state.values], extra);",
    'otherEffect(() => {}, [form.store]); useEffect(() => {}, [lookup["values"]]);',
    "useEffect(() => {}, dependencies);",
    "useEffect([form.store], []);",
  ]) {
    expect(await findings(path, source), source).toEqual([]);
  }
  expect(await findings("tests/legacy/tooling/probe.ts", "useEffect(() => {}, [form.store]);")).toEqual([]);
  expect(await findings("playwright/probe.ts", "useEffect(() => {}, [form.store]);")).toHaveLength(1);
});

test("computed names retain semantic enforcement while direct syntax produces no duplicate gate findings", async () => {
  const source =
    'const field = "store"; const hook = "useEffect"; useEffect(() => {}, [form[field]]); React[hook](() => {}, [form.state.values]); useEffect(() => {}, [form.store]);';
  const root = "/computed-form-dependencies";
  const path = "tooling/src/probe.ts";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/${path}`, source);
  const result = runPolicyPass({
    knownPolicies: [computedFormDependencies],
    policies: [computedFormDependencies],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(["form[field]", "form.state.values"]);
  expect(await findings(path, source)).toHaveLength(1);
});

test("query hook permissions are exact by file and imported name", async () => {
  const both = 'import { useMutation as mutate, useInfiniteQuery } from "@tanstack/react-query";';
  for (const path of [
    "packages/ui/src/probe.ts",
    "tests/client/probe.ct.tsx",
    "tooling/src/probe.ts",
    "scripts/probe.ts",
    "packages/default-content/src/probe.ts",
  ]) {
    expect(await findings(path, both)).toHaveLength(2);
  }
  for (const [path, allowed, denied] of [
    ["packages/client/src/data/create-entity-mutation.ts", "useMutation", "useInfiniteQuery"],
    ["packages/client/src/data/create-collection-surface.ts", "useInfiniteQuery", "useMutation"],
  ] as const) {
    expect(await findings(path, `import { ${allowed} } from "@tanstack/react-query";`)).toEqual([]);
    expect(await findings(path, `import { ${denied} } from "@tanstack/react-query";`)).toHaveLength(1);
  }
  expect(await findings("packages/client/src/probe.test.tsx", both)).toEqual([]);
  expect(await findings("tests/legacy/client/probe.ct.tsx", both)).toEqual([]);
  expect(
    await findings(
      "packages/ui/src/probe.ts",
      'import * as query from "@tanstack/react-query"; export { useMutation } from "@tanstack/react-query"; import { useMutation } from "other";',
    ),
  ).toEqual([]);
});

test("route permissions admit only their exact feature doors and preserve static-import-only grammar", async () => {
  for (const [file, allowed] of [
    ["app-root.tsx", ["app-shell", "chat", "persona"]],
    ["login-page.tsx", ["auth"]],
    ["router.tsx", ["auth"]],
  ] as const) {
    const path = `packages/client/src/routes/${file}`;
    for (const feature of allowed) {
      expect(await findings(path, `import { X } from "#features/${feature}";`)).toEqual([]);
      expect(await findings(path, `import { X } from "#features/${feature}/private";`)).toHaveLength(1);
    }
    expect(await findings(path, 'import { X } from "#features/settings";')).toHaveLength(1);
  }
  expect(await findings("packages/client/src/routes/probe.tsx", 'import { X } from "#features/auth";')).toHaveLength(1);
  expect(await findings("packages/client/src/routes/probe.tsx", 'export { X } from "#features/auth"; import("#features/auth");')).toEqual([]);
  expect(await findings("packages/client/src/features/probe.tsx", 'import { X } from "#features/auth";')).toEqual([]);
});

test("later state, shell and intrinsic-style overrides preserve the preceding restriction layers", async () => {
  expect(
    await findings(
      "packages/client/src/features/probe.tsx",
      '<div className="x" style={{}} />; useFooStore.getState(); const options = { queryKey: [] }; Widget.defaultProps;',
    ),
  ).toHaveLength(5);
  const source =
    'const callerUserId = 1; const isGroup = true; useEffect(() => {}, [form.store]); <Card compact dangerouslySetInnerHTML={{ __html: text }} />; import { useMutation } from "@tanstack/react-query";';
  for (const path of [
    "packages/client/src/state/probe.tsx",
    "packages/client/src/features/app-shell/probe.tsx",
    "packages/client/src/components/weave-glyph.tsx",
    "packages/client/src/features/probe.tsx",
  ]) {
    expect(await findings(path, source), path).toHaveLength(6);
  }
  expect(await findings("packages/client/src/state/probe.tsx", "useFooStore.getState();")).toEqual([]);
  expect(await findings("packages/client/src/features/app-shell/probe.tsx", '<div className="x" style={{}} />;')).toEqual([]);
});
