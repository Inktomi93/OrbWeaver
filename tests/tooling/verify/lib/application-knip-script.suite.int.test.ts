// Native Knip must distinguish checker discovery from a real application import of that same source.
import { devNull } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { projectApplicationKnipScript } from "../../../../tooling/src/verify/lib/application-knip-script.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const LAUNCHER = "tooling/src/verify/cli.ts";
const DISPATCH = "tooling/src/verify/unrelated-dispatch.ts";
const APP_HELPER = "app-helper.ts";
const APP_BINARY = "orb-application-knip-missing-binary";
const APP_UNLISTED = "orb-application-knip-unlisted-helper";
const APP_UNRESOLVED = "./missing-application-helper.ts";
const TOOL_UNLISTED = "orb-application-knip-unlisted-dispatch";
const AUTHORED_SCRIPT = `node ${LAUNCHER} scoped-test ct && ${APP_BINARY}`;
const RUN_TIMEOUT_MS = scaledBudget(20_000);
const namedIssue = z.object({ name: z.string() });
const reportSchema = z.object({
  issues: z.array(z.object({ file: z.string(), binaries: z.array(namedIssue), unlisted: z.array(namedIssue), unresolved: z.array(namedIssue) })),
});

test("only classified operand spans change; quotes, environment, flags, operators and delegation survive", () => {
  const script = `E2E_LIVE=0 LABEL='two words' node  '${LAUNCHER}' scoped-test ct --retries=2 && pnpm --filter @orb/client build || node "app.ts" --watch; node ${LAUNCHER} scoped-test node | missing-binary`;
  const seen: string[] = [];
  const result = projectApplicationKnipScript(script, (specifier) => {
    seen.push(specifier);
    return specifier === LAUNCHER;
  });
  expect(result).toBe(
    `E2E_LIVE=0 LABEL='two words' node  '${devNull}' scoped-test ct --retries=2 && pnpm --filter @orb/client build || node "app.ts" --watch; node '${devNull}' scoped-test node | missing-binary`,
  );
  expect(seen).toEqual([LAUNCHER, "app.ts", LAUNCHER]);
});

test.for([
  "",
  "node",
  "node -e 'import(\"./tool.ts\")'",
  `node --import ./preload.ts ${LAUNCHER}`,
  'node "$LAUNCHER" scoped-test ct',
  `node ${LAUNCHER} "$(missing-binary)"`,
  `NODE_OPTIONS="$OPTIONS" node ${LAUNCHER}`,
  "node tooling/src/*/cli.ts",
  "node 'unterminated",
  `if true; then node ${LAUNCHER}; fi`,
  `for file in one two; do node ${LAUNCHER}; done`,
  `launch() { node ${LAUNCHER}; }; launch`,
  `(node ${LAUNCHER})`,
  `node ${LAUNCHER} &`,
  `node ${LAUNCHER} > output`,
  `pnpm exec node ${LAUNCHER}`,
  `bash -c 'node ${LAUNCHER}'`,
  "ONLY_ASSIGNMENT=1",
])("unsupported script refuses instead of losing accounting: %s", (script) => {
  expect(() => projectApplicationKnipScript(script, () => true)).toThrow();
});

test("classification failures refuse, and application Node launchers remain unchanged", () => {
  expect(projectApplicationKnipScript(AUTHORED_SCRIPT, () => false)).toBe(AUTHORED_SCRIPT);
  expect(() =>
    projectApplicationKnipScript(AUTHORED_SCRIPT, () => {
      throw new Error("launcher outside the authored population");
    }),
  ).toThrow("launcher outside the authored population");
});

test("workspace binary execution remains byte-identical for native Knip", () => {
  const script = "pnpm --filter @orb/db exec drizzle-kit check --config=drizzle.config.ts";
  expect(
    projectApplicationKnipScript(script, () => {
      throw new Error("binary execution is not a Node source operand");
    }),
  ).toBe(script);
});

test("native Knip filtered-exec limitation is unchanged by application projection", { timeout: RUN_TIMEOUT_MS }, async ({ plantedTree, repoRoot }) => {
  const authored = `pnpm --filter @proof/kit exec ${APP_BINARY}`;
  const projected = projectApplicationKnipScript(authored, () => {
    throw new Error("not a Node operand");
  });
  expect(projected).toBe(authored);
  for (const script of [authored, projected]) {
    const root = await plantedTree({
      "package.json": JSON.stringify({ name: "script-probe", private: true, scripts: { check: script }, workspaces: ["packages/*"] }),
      "packages/kit/package.json": JSON.stringify({ name: "@proof/kit", type: "module" }),
      "knip.json": JSON.stringify({ entry: [APP_HELPER], project: ["*.ts"] }),
      [APP_HELPER]: `import '${APP_UNLISTED}'; import '${APP_UNRESOLVED}';\n`,
    });
    const result = await spawnNiced(
      process.execPath,
      [
        join(repoRoot, "node_modules/knip/bin/knip.js"),
        "--config",
        "knip.json",
        "--include",
        "unlisted,unresolved,binaries",
        "--reporter",
        "json",
        "--no-progress",
      ],
      { cwd: root, timeoutMs: RUN_TIMEOUT_MS },
    );
    expect(result.code, result.stdout + result.stderr).toBe(1);
    const report = reportSchema.parse(JSON.parse(result.stdout));
    expect(report.issues).toEqual([{ file: APP_HELPER, binaries: [], unlisted: [{ name: APP_UNLISTED }], unresolved: [{ name: APP_UNRESOLVED }] }]);
  }
});

test.for([
  { name: "authored positive control", projected: false, importsLauncher: false, dispatch: true },
  { name: "projected discovery", projected: true, importsLauncher: false, dispatch: false },
  { name: "real consumer reaches projected launcher", projected: true, importsLauncher: true, dispatch: true },
])(
  "native Knip preserves application findings: $name",
  { timeout: RUN_TIMEOUT_MS },
  async ({ projected, importsLauncher, dispatch }, { plantedTree, repoRoot }) => {
    const script = projected ? projectApplicationKnipScript(AUTHORED_SCRIPT, (specifier) => specifier === LAUNCHER) : AUTHORED_SCRIPT;
    const root = await plantedTree({
      "package.json": JSON.stringify({ name: "application-knip-script-proof", private: true, type: "module", scripts: { "test:ct": script } }),
      "knip.json": JSON.stringify({ entry: ["app-config.ts"], project: ["**/*.ts"] }),
      "app-config.ts": `import './${APP_HELPER}';\n`,
      [APP_HELPER]: `${importsLauncher ? `import './${LAUNCHER}';\n` : ""}import '${APP_UNLISTED}'; import '${APP_UNRESOLVED}';\n`,
      [LAUNCHER]: "import './unrelated-dispatch.ts';\n",
      [DISPATCH]: `import '${TOOL_UNLISTED}';\n`,
    });
    const result = await spawnNiced(
      process.execPath,
      [
        join(repoRoot, "node_modules/knip/bin/knip.js"),
        "--config",
        "knip.json",
        "--include",
        "unlisted,unresolved,binaries",
        "--reporter",
        "json",
        "--no-progress",
      ],
      { cwd: root, timeoutMs: RUN_TIMEOUT_MS },
    );
    expect(result.timedOut).toBe(false);
    expect(result.code, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toBe("");
    const applicationIssues = [
      {
        file: APP_HELPER,
        binaries: [],
        unlisted: [{ name: APP_UNLISTED }],
        unresolved: [{ name: APP_UNRESOLVED }],
      },
      { file: "package.json", binaries: [{ name: APP_BINARY }], unlisted: [], unresolved: [] },
    ];
    const expectedIssues = dispatch
      ? [...applicationIssues, { file: DISPATCH, binaries: [], unlisted: [{ name: TOOL_UNLISTED }], unresolved: [] }]
      : applicationIssues;
    const report = reportSchema.parse(JSON.parse(result.stdout));
    expect(report.issues.toSorted((left, right) => left.file.localeCompare(right.file))).toEqual(
      expectedIssues.toSorted((left, right) => left.file.localeCompare(right.file)),
    );
  },
);
