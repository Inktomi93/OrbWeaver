import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { gate as computedFormDependencies } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });
const PROTOTYPE_RULES = ["no-extend-native", "no-proto", "no-restricted-properties"];

// Only the effective native restriction options are exercised; typed rules keep their own compiler tests.
async function findings(path: string, source: string, ruleIds: readonly string[] = ["no-restricted-syntax"]): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{js,cjs,mjs,ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: Object.fromEntries(ruleIds.map((id) => [id, config.rules[id] ?? "off"])),
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    path,
  ).toEqual([]);
  expect(
    messages.every(({ ruleId }) => typeof ruleId === "string"),
    path,
  ).toBe(true);
  return messages.map(({ message }) => message);
}

test("native prototype policy rejects native extensions and prototype replacement capabilities", async () => {
  for (const path of ["packages/server/src/probe.ts", "packages/client/src/probe.tsx", "tooling/src/probe.ts", "tests/tooling/probe.ts", "scripts/probe.ts"]) {
    for (const source of [
      "Object.prototype.extra = 1;",
      'Array["prototype"]["extra"] = 1;',
      'Object.defineProperty(Object.prototype,"signal",{get(){return undefined;}});',
      'Object["defineProperties"](Array["prototype"],{extra:{value:1}});',
      "Object.setPrototypeOf(value, prototype);",
      'Reflect["setPrototypeOf"](value, prototype);',
      "const replace = Object.setPrototypeOf; replace(value, prototype);",
      "const {setPrototypeOf:replace} = Reflect; replace(value, prototype);",
      "Object.setPrototypeOf.call(Object, value, prototype);",
      "value.__proto__ = prototype;",
      'const legacy = value["__proto__"];',
    ]) {
      expect(await findings(path, source, PROTOTYPE_RULES), `${path}: ${source}`).toHaveLength(1);
    }
  }
});

test("native prototype policy rejects explicit Reflect and custom prototype mutation targets", async () => {
  for (const path of ["packages/server/src/probe.ts", "packages/client/src/probe.tsx", "tooling/src/probe.ts", "scripts/probe.mjs"]) {
    for (const source of [
      'Reflect.defineProperty(Object.prototype,"signal",{get(){return undefined;}});',
      'class Custom{};Object.defineProperty(Custom.prototype,"signal",{get(){return undefined;}});',
      'class Custom{};Object["defineProperties"](Custom["prototype"],{signal:{value:1}});',
      'class Custom{};Reflect[`defineProperty`](Custom[`prototype`],"signal",{value:1});',
      "class Custom{};Object.assign(Custom.prototype,{signal:1});",
      'Reflect.set(Object.prototype,"signal",1);',
      'Reflect.deleteProperty(Object.prototype,"signal");',
    ]) {
      expect(await findings(path, source, ["orb/no-prototype-mutation"]), `${path}: ${source}`).toHaveLength(1);
    }
    for (const source of [
      'Object.defineProperty(record,"value",{value:Custom.prototype});',
      'Reflect.defineProperty(record,"prototype",{value:Custom.prototype});',
      "Object.assign(record,{prototype:Custom.prototype});",
      'Reflect.set(record,"prototype",Custom.prototype);',
      'Object.getOwnPropertyDescriptor(Custom.prototype,"value");',
      'Object.defineProperty(record.prototypeValue,"value",{value:1});',
    ]) {
      expect(await findings(path, source, ["orb/no-prototype-mutation"]), `${path}: ${source}`).toEqual([]);
    }
  }
});

test("native prototype policy core rules preserve ordinary own descriptors and global shadows", async () => {
  for (const path of ["packages/server/src/probe.ts", "packages/contracts/src/probe.ts", "packages/ui/src/probe.tsx", "tooling/src/probe.ts"]) {
    for (const source of [
      'const target={};Object.defineProperty(target,"value",{value:1});',
      "Object.defineProperties(target,{value:{get(){return 1;}}});",
      'Reflect.defineProperty(target,"value",{value:1});',
      "const target={};Object.assign(target,{value:1});",
      'Object.prototype.hasOwnProperty.call(target,"value");',
      "Object.getPrototypeOf(target);",
      'function inspect(Object){Object.defineProperty(Object.prototype,"value",{value:1});}',
      'const data={"setPrototypeOf":1,"__proto__":null};',
      '// Object.setPrototypeOf(value, prototype)\nconst description="Object.prototype.extra = 1";',
    ]) {
      expect(await findings(path, source, PROTOTYPE_RULES), `${path}: ${source}`).toEqual([]);
    }
  }
});

test("native prototype policy does not widen maintained analysis into legacy and generated source", async () => {
  for (const path of ["tests/legacy/ui/probe.test.ts", "packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/probe.gen.ts"]) {
    expect(await findings(path, "Object.prototype.extra = 1;", PROTOTYPE_RULES), path).toEqual([]);
  }
});

test("settings table admission rejects named, aliased, namespace and reexport reaches outside its owner", async () => {
  const path = "packages/server/src/domain/connection/persistence/probe.ts";
  for (const source of [
    'import { settings } from "@orb/db";',
    'import { settings as catalog } from "@orb/db";',
    'import * as schema from "@orb/db";',
    'export { settings as catalog } from "@orb/db";',
    'export * from "@orb/db";',
    'import { settings } from "@orb/db/schema";',
  ]) {
    expect(await findings(path, source, ["no-restricted-imports"]), source).toHaveLength(1);
  }
  expect(await findings(path, 'import { userConnections, userSettings } from "@orb/db";', ["no-restricted-imports"])).toEqual([]);
  expect(await findings("packages/server/src/domain/settings/persistence/probe.ts", 'import { settings } from "@orb/db";', ["no-restricted-imports"])).toEqual(
    [],
  );
  expect(await findings("packages/server/src/entry/compose/probe.ts", 'import { settings } from "@orb/db";', ["no-restricted-imports"])).toHaveLength(1);
  expect(await findings("packages/server/src/domain/import/verbs/probe.ts", 'import { settings } from "@orb/db";', ["no-restricted-imports"])).toHaveLength(1);
});

test("entry query wiring refuses dynamic host loaders and process/global capture through native syntax", async () => {
  const rules = ["no-restricted-syntax", "no-restricted-globals", "no-new-func"];
  const denied = [
    'const path = "@orb/db"; import(path);',
    'const part = "db"; import(`@orb/${part}`);',
    'import loader = require("node:module");',
    'process.getBuiltinModule("module");',
    'process["getBuiltinModule"]("module");',
    'const key = "getBuiltinModule"; process[key]("module");',
    'const captured = process; captured.getBuiltinModule("module");',
    'const { getBuiltinModule: load } = process; load("module");',
    'Reflect.get(process, "getBuiltinModule")("module");',
    'import p from "node:process"; const key = "getBuiltinModule"; p[key]("module");',
    'import * as p from "node:process"; p.getBuiltinModule("module");',
    'import { getBuiltinModule as load } from "node:process"; load("module");',
    'const loader = require; loader("@orb/db");',
    'const root = globalThis; root.process.getBuiltinModule("module");',
    'Reflect.get(global, "process").getBuiltinModule("module");',
    'new Function("return 1")();',
  ];
  for (const path of [
    "packages/server/src/entry/compose/services.ts",
    "packages/server/src/entry/http/app.ts",
    "packages/server/src/entry/boot/seed-local-light.ts",
  ]) {
    for (const source of denied) {
      const messages = await findings(path, source, rules);
      expect(messages, `${path}: ${source}`).not.toEqual([]);
      expect(
        messages.some((message) => message.includes("Entry wiring") || message === "The Function constructor is eval."),
        source,
      ).toBe(true);
    }
  }
});

test("entry loader restrictions preserve literal wiring, unrelated select methods and physical boot ownership", async () => {
  const rules = ["no-restricted-syntax", "no-restricted-globals", "no-new-func"];
  const path = "packages/server/src/entry/compose/services.ts";
  for (const source of [
    'import type { DatabaseHandle } from "@orb/db/wiring"; import("#domain/stats");',
    'import process from "node:process"; const target = `${process.platform}-${process.arch}`;',
    "const unrelated = { select() { return 1; } }; unrelated.select();",
    'const description = "process.getBuiltinModule; globalThis; import(path)";',
  ]) {
    expect(await findings(path, source, rules), source).toEqual([]);
  }
  expect(
    await findings(
      "packages/server/src/entry/check-media.ts",
      'import process from "node:process"; process.stdout.write("ready"); process.stderr.write("refused"); process.exitCode = 1;',
      rules,
    ),
  ).toEqual([]);
  expect(
    await findings(
      "packages/server/src/entry/boot/migrate.ts",
      'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); require.resolve("@orb/db");',
      rules,
    ),
  ).toEqual([]);
});

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

test("Base UI composition rejects direct asChild syntax without expanding into inherited or computed-value semantics", async () => {
  const banned = [
    "<Menu.Trigger asChild>child</Menu.Trigger>;",
    "<Base.Menu.Trigger asChild={true} />;",
    "<Other asChild={false} />;",
    "<div asChild />;",
    "export interface Props { asChild?: boolean; }",
    "type Props = Readonly<{ readonly asChild: boolean }>;",
    'export interface Props { "asChild"?: boolean; }',
    "interface Props { ['asChild']?: boolean; }",
    "interface Props { [('asChild')]: boolean; }",
    "interface Props { [`asChild`]: boolean; }",
    "interface Props { as\\u0043hild?: boolean; }",
    "const view = ((<Menu.Trigger asChild={(true as boolean)!} />));",
    "// @orb-waive baseui-render-prop-composition(asChild): obsolete marker cannot excuse native syntax.\n<Menu.Trigger asChild />;",
  ];
  const admitted = [
    "<Menu.Trigger render={<Button />} />;",
    "<Menu.Trigger {...props} />;",
    "<Menu.Trigger {...{ asChild: true }} />;",
    "<Menu.Trigger asChildElement data-as-child />;",
    "<Menu.Trigger other:asChild />;",
    "interface Props { asChildElement?: boolean; }",
    "const key = 'asChild'; interface Props { [key]?: boolean; }",
    "const tail = ''; interface Props { [`asChild${tail}`]: boolean; }",
    "const props = { asChild: true }; class Other { asChild = true; }",
    "interface Props { asChild(): void; }",
    'import type { OtherProps } from "other"; interface Props extends OtherProps {} type Mixed = OtherProps & { render?: string };',
    "// <Menu.Trigger asChild />\nconst description = 'asChild';",
  ];
  for (const path of ["packages/client/src/features/probe.tsx", "packages/ui/src/primitives/probe.tsx"]) {
    for (const source of banned) {
      expect(await findings(path, source), source).toHaveLength(1);
    }
    for (const source of admitted) {
      expect(await findings(path, source), source).toEqual([]);
    }
  }
  for (const path of [
    "packages/client/src/state/probe.ts",
    "packages/client/src/features/app-shell/probe.ts",
    "packages/client/src/routes/probe.ts",
    "packages/client/src/compose/probe.ts",
    "packages/client/src/probe.d.ts",
    "packages/ui/src/probe.d.ts",
    "packages/ui/src/tokens/index.ts",
    "packages/ui/src/tokens/probe.gen.ts",
  ]) {
    expect(await findings(path, "interface Props { asChild?: boolean; }"), path).toHaveLength(1);
  }
  for (const path of ["packages/server/src/probe.tsx", "tooling/src/probe.tsx", "tests/client/probe.ct.tsx"]) {
    expect(await findings(path, "<Menu.Trigger asChild />; interface Props { asChild?: boolean; }"), path).toEqual([]);
  }
});
