import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/test-reach.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const VERB = "packages/server/src/domain/example/verbs/run.ts";
const LEGACY = "tests/legacy/server/domain/example/run.test.ts";
const STRICT = "tests/server/domain/example/run.test.ts";
const CALL = 'import { run } from "../../../../packages/server/src/domain/example/verbs/run.ts";\nexport const result = run();\n';

const ALIAS_CASES = ["named", "star", "namespace", "renamed", "transitive", "default", "dynamic", "republished"] as const;

const ACTION_CASES = [
  "noncall",
  "legacy-dynamic",
  "legacy-transitive",
  "legacy-republished",
  "legacy-laundered",
  "legacy-laundered-noncall",
  "strict-dynamic",
  "strict-helper",
  "strict-transitive",
  "strict-named",
  "strict-laundered",
  "strict-renamed",
  "strict-default",
  "strict-destructured",
  "strict-local",
] as const;

test.for(ACTION_CASES)("module reach cannot substitute for action provenance: %s", (scenario, { scratch }) => {
  const source = "packages/client/src/state/example.ts";
  const productDoor = "../../../packages/client/src/state/example.ts";
  const calls = {
    noncall: "",
    "legacy-dynamic": '(await import("../../legacy/client/state/_support.ts")).run();',
    "legacy-transitive": '(await import("./_legacy-bridge.ts")).run();',
    "legacy-republished": '(await import("./_legacy-republish.ts")).run();',
    "legacy-laundered": '(await import("./_laundered.ts")).run();',
    "legacy-laundered-noncall": 'export const held = (await import("./_laundered.ts")).run;',
    "strict-dynamic": `(await import("${productDoor}")).run();`,
    "strict-helper": '(await import("./_support.ts")).run();',
    "strict-transitive": '(await import("./_strict-bridge.ts")).run();',
    "strict-named": "run();",
    "strict-laundered": '(await import("./_strict-laundered.ts")).run();',
    "strict-renamed": '(await import("./_renamed.ts")).launch();',
    "strict-default": 'const { default: drive } = await import("./_default.ts"); drive();',
    "strict-destructured": 'const { run: drive } = await import("./_support.ts"); drive();',
    "strict-local": 'const namespace = await import("./_support.ts"); const drive = namespace.run; drive();',
  } satisfies Record<(typeof ACTION_CASES)[number], string>;
  const files = {
    [source]: 'const store = createGatedStore("example", () => ({ n: 0 }));\nexport function run() { store.setState({ n: 1 }); }\n',
    "tests/legacy/client/state/_support.ts": 'export { run } from "../../../../packages/client/src/state/example.ts";\n',
    "tests/client/state/_support.ts": `export { run } from "${productDoor}";\n`,
    "tests/client/state/_legacy-bridge.ts": 'export * from "../../legacy/client/state/_support.ts";\n',
    "tests/client/state/_legacy-republish.ts": 'import { run as drive } from "../../legacy/client/state/_support.ts";\nexport { drive as run };\n',
    "tests/client/state/_laundered.ts": `import { run as unused } from "${productDoor}";\nexport const seen = unused;\nimport { run as drive } from "../../legacy/client/state/_support.ts";\nexport { drive as run };\n`,
    "tests/client/state/_strict-laundered.ts": `import { run as unused } from "${productDoor}";\nexport const seen = unused;\nimport { run as drive } from "${productDoor}";\nexport { drive as run };\n`,
    "tests/client/state/_renamed.ts": `import { run as drive } from "${productDoor}";\nexport { drive as launch };\n`,
    "tests/client/state/_default.ts": `export { run as default } from "${productDoor}";\n`,
    "tests/client/state/_strict-bridge.ts": 'export * from "./_support.ts";\n',
    "tests/client/state/run.test.ts": `import { run } from "${productDoor}";\nexport const seen = run;\n${calls[scenario]}\n`,
    "tooling/src/example/index.ts": "export {};\n",
    "tests/tooling/example/index.test.ts": "export {};\n",
  };
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${scratch}/${path}`, content);
  }
  const result = runPolicyPass({
    root: scratch,
    project,
    knownPolicies: [gate],
    policies: [gate],
    reviewedGrants: [],
    failOnWarnings: false,
    resourceOptions: { overlay: files },
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ file, operation }) => ({ file, operation }))).toEqual(
    scenario.startsWith("strict-") ? [] : [{ file: source, operation: "unreached:store-action:run" }],
  );
});

test.for(ALIAS_CASES)("legacy intermediary cannot earn module or action credit: %s", (scenario, { scratch }) => {
  for (const strict of [true, false]) {
    const source = "packages/client/src/state/example.ts";
    const helper = strict ? "tests/client/state/_support.ts" : "tests/legacy/client/state/_support.ts";
    const helperDoor = strict ? "./_support.ts" : "../../legacy/client/state/_support.ts";
    const productDoor = strict ? "../../../packages/client/src/state/example.ts" : "../../../../packages/client/src/state/example.ts";
    const exportSource = {
      named: `export { run } from "${productDoor}";\n`,
      star: `export * from "${productDoor}";\n`,
      namespace: `export { run } from "${productDoor}";\n`,
      renamed: `export { run as drive } from "${productDoor}";\n`,
      transitive: `export { run } from "${productDoor}";\n`,
      default: `export { run as default } from "${productDoor}";\n`,
      dynamic: `export { run } from "${productDoor}";\n`,
      republished: `import { run as drive } from "${productDoor}";\nexport { drive };\n`,
    } satisfies Record<(typeof ALIAS_CASES)[number], string>;
    const importSource = {
      named: `import { run } from "${helperDoor}";\nrun();\n`,
      star: `import { run } from "${helperDoor}";\nrun();\n`,
      namespace: `import * as helper from "${helperDoor}";\nhelper.run();\n`,
      renamed: `import { drive as execute } from "${helperDoor}";\nexecute();\n`,
      transitive: 'import { run } from "./_bridge.ts";\nrun();\n',
      default: `import run from "${helperDoor}";\nrun();\n`,
      dynamic: `const { run } = await import("${helperDoor}");\nrun();\n`,
      republished: `import { drive } from "${helperDoor}";\ndrive();\n`,
    } satisfies Record<(typeof ALIAS_CASES)[number], string>;
    const files = {
      [source]:
        scenario === "dynamic"
          ? "export function run() { return 1; }\n"
          : 'const store = createGatedStore("example", () => ({ n: 0 }));\nexport function run() { store.setState({ n: 1 }); }\n',
      [helper]: exportSource[scenario],
      "tests/client/state/_bridge.ts": `export * from "${helperDoor}";\n`,
      "tests/client/state/run.test.ts": importSource[scenario],
      "tooling/src/example/index.ts": "export {};\n",
      "tests/tooling/example/index.test.ts": "export {};\n",
    };
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [path, content] of Object.entries(files)) {
      project.createSourceFile(`${scratch}/${String(strict)}/${path}`, content);
    }
    const result = runPolicyPass({
      root: `${scratch}/${String(strict)}`,
      project,
      knownPolicies: [gate],
      policies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
      resourceOptions: { overlay: files },
    });
    expect(result.toolErrors, `${scenario}/${String(strict)}`).toEqual([]);
    const uncalled = scenario === "dynamic" ? [] : [{ file: source, operation: "unreached:store-action:run" }];
    expect(
      result.authority.effectiveFindings.map(({ file, operation }) => ({ file, operation })),
      `${scenario}/${String(strict)}`,
    ).toEqual(strict ? [] : [{ file: source, operation: "unreached:client-seal" }, ...uncalled]);
  }
});

test.for(["import", "subject", "helper", "strict", "public-door"] as const)("legacy reach boundary: %s", (scenario, { scratch }) => {
  const files = {
    [VERB]: "export function run() { return 1; }\n",
    "packages/server/src/domain/example/index.ts": 'export { run } from "./verbs/run.ts";\n',
    "tooling/src/example/index.ts": "export {};\n",
    "tests/tooling/example/index.test.ts": "export {};\n",
    ...(scenario === "import" ? { [LEGACY]: CALL.replace("../../../../", "../../../../../") } : {}),
    ...(scenario === "subject" ? { [LEGACY]: `// @subject ${VERB}\nexport {};\n` } : {}),
    ...(scenario === "helper"
      ? {
          [STRICT]: 'import { result } from "../../../legacy/server/domain/example/_support.ts";\nexport const used = result;\n',
          "tests/legacy/server/domain/example/_support.ts": CALL.replace("../../../../", "../../../../../"),
        }
      : {}),
    ...(scenario === "strict" ? { [STRICT]: CALL } : {}),
    ...(scenario === "public-door" ? { [STRICT]: CALL.replace("verbs/run.ts", "index.ts") } : {}),
  };
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${scratch}/${path}`, content);
  }
  const result = runPolicyPass({
    root: scratch,
    project,
    knownPolicies: [gate],
    policies: [gate],
    reviewedGrants: [],
    failOnWarnings: false,
    resourceOptions: { overlay: files },
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ file, operation }) => ({ file, operation }))).toEqual(
    scenario === "strict" || scenario === "public-door" ? [] : [{ file: VERB, operation: "unreached:verb" }],
  );
});
