import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as discovery } from "../../../../tooling/src/verify/gates/discovery-no-stats-rollups.ts";
import { gate as empty } from "../../../../tooling/src/verify/gates/empty-state-has-action.ts";
import { gate as membership } from "../../../../tooling/src/verify/gates/membership-enforcer.ts";
import { gate as users } from "../../../../tooling/src/verify/gates/no-direct-users-read.ts";
import { gate as scrubber } from "../../../../tooling/src/verify/gates/scrubber-home.ts";
import { gate as identity } from "../../../../tooling/src/verify/gates/turn-identity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [scrubber, users, membership, identity, discovery, empty];
const SERVER = "packages/server/src/domain/chat/verbs/subject.ts";
const ENGINE = "packages/server/src/domain/chat/engine/subject.ts";
const DISCOVERY = "packages/server/src/domain/discovery/subject.ts";
const CLIENT = "packages/client/src/features/subject.tsx";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const sources = {
    "packages/kit/src/content/index.ts": "export function createHiddenSpanStreamScrubber():object{return {};}",
    "packages/db/src/schema/tables.ts": "export const users={};export const ownerStats={};",
    "packages/db/src/query/index.ts": "export function fetchOwned():object{return {};}",
    "packages/contracts/src/identity/index.ts": "export interface Principal {readonly userId:string;}",
    "packages/ui/src/primitives/empty-state/index.tsx": "export declare function EmptyState(props:object):object;",
    "foreign.ts": "export function createHiddenSpanStreamScrubber():object{return {};}export function EmptyState():object{return {};}",
    [SERVER]:
      "import {createHiddenSpanStreamScrubber} from '#scrubber';\nimport {users} from '#tables';\nimport {fetchOwned} from '#owned';\nexport const value=[createHiddenSpanStreamScrubber(),users,fetchOwned];\n",
    [ENGINE]: "import type {Principal as Caller} from '#identity';\nexport const value:Caller={userId:'u'};\n",
    [DISCOVERY]: "import * as schema from '#tables';\nexport const value=schema.ownerStats;\n",
    [CLIENT]:
      "import {EmptyState as Empty} from '#empty';\nimport * as content from '#scrubber';\nexport const value=<Empty/>;\ncontent.createHiddenSpanStreamScrubber();\n",
  };
  for (const [path, text] of Object.entries(sources)) {
    write(path, text);
  }
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, jsx: "preserve", types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(sources) }));
  for (const pkg of ["server", "client", "kit", "db", "contracts", "ui"]) {
    write(
      `packages/${pkg}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: { ...compilerOptions, ...(pkg === "client" ? { customConditions: ["browser"] } : {}) },
        files: Object.keys(sources)
          .filter((path) => path.startsWith(`packages/${pkg}/`))
          .map((path) => path.slice(`packages/${pkg}/`.length)),
      }),
    );
  }
  write(
    "package.json",
    JSON.stringify({
      name: "native-sealed-reference-fixture",
      type: "module",
      imports: {
        "#scrubber": { browser: "./foreign.ts", default: "./packages/kit/src/content/index.ts" },
        "#empty": { browser: "./packages/ui/src/primitives/empty-state/index.tsx", default: "./foreign.ts" },
        "#tables": "./packages/db/src/schema/tables.ts",
        "#owned": "./packages/db/src/query/index.ts",
        "#identity": "./packages/contracts/src/identity/index.ts",
      },
    }),
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const symbolFor = Node.prototype.getSymbol;
  const typeFor = Node.prototype.getType;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax sealed-reference Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax sealed-reference Type read");
    }
    return typeFor.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test(
  "native sealed-reference command preserves policy judgments in the importing Node/browser worlds",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits = [
        await runStructure(scratch, ["--check=scrubber-home"]),
        await runStructure(scratch, ["--check=empty-state-has-action", `--file=${CLIENT}`]),
      ];
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect.soft(exits).toEqual([1, 1]);
      expect(result.toolErrors).toEqual([]);
      expect(result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, token }) => ({ file, token })) }))).toEqual(
        [
          { id: scrubber.id, findings: [{ file: SERVER, token: "createHiddenSpanStreamScrubber" }] },
          { id: users.id, findings: [{ file: SERVER, token: "users" }] },
          { id: membership.id, findings: [{ file: SERVER, token: "fetchOwned" }] },
          { id: identity.id, findings: [{ file: ENGINE, token: "Principal" }] },
          { id: discovery.id, findings: [{ file: DISCOVERY, token: "ownerStats" }] },
          { id: empty.id, findings: [{ file: CLIENT, token: "Empty" }] },
        ].toSorted((left, right) => left.id.localeCompare(right.id)),
      );
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test.for(POLICIES)("$id preserves its complete declared sealed-reference subjects", (policy) => {
  expect(verifyPolicyProofs([policy])).toEqual([]);
});

test(
  "native sealed keys keep authored wrapper/alias positions, local refusals and ordinary waivers",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(
      join(scratch, SERVER),
      `import * as owned from '#owned';
const FETCH='fetchOwned';
const OWNER='ownerId';
declare const row:Record<string,string>;
// @orb-waive membership-enforcer(FETCH): intentional helper fixture; ends with this test.
owned[(FETCH as string)!]();
// @orb-waive membership-enforcer(OWNER): intentional owner fixture; ends with this test.
row[(OWNER satisfies string)] === 'u';
row[("ownerId")] !== 'u';
const local={fetchOwned(){}};
local.fetchOwned();
`,
    );
    writeFileSync(
      join(scratch, ENGINE),
      `import * as types from '#identity';
const KEY='Principal';
// @orb-waive turn-identity(KEY): intentional identity fixture; ends with this test.
types[(KEY)];
const principal=1;
`,
    );
    writeFileSync(
      join(scratch, DISCOVERY),
      `import * as schema from '#tables';
const KEY='ownerStats';
const ownerStatsReceiver=schema;
// @orb-waive discovery-no-stats-rollups(KEY): intentional rollup fixture; ends with this test.
ownerStatsReceiver[(KEY)];
schema[("ownerStats")];
let STABLE='ownerStats';
schema[(STABLE satisfies string)!];
let WRITE='ownerStats';WRITE='other';schema[WRITE];
const LEFT=RIGHT;const RIGHT=LEFT;schema[LEFT];
const local={ownerStats:1};local.ownerStats;
`,
    );
    writeFileSync(
      join(scratch, CLIENT),
      `import {EmptyState as Empty} from '#empty';
const Alias=Empty;
// @orb-waive empty-state-has-action(Alias): intentional dead-end fixture; ends with this test.
export const value=<Alias/>;
export const action=<Empty action/>;
export const spread=<Empty {...{}}/>;
`,
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const selected = [membership, identity, discovery, empty];
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: selected,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    const positions = (id: string): { line: number; column: number; token: string | undefined }[] | undefined =>
      result.policies.find((policy) => policy.id === id)?.findings.map(({ line, column, token }) => ({ line, column, token }));
    expect(positions(membership.id)).toEqual([
      { line: 6, column: 8, token: "FETCH" },
      { line: 8, column: 6, token: "OWNER" },
      { line: 9, column: 7, token: "ownerId" },
    ]);
    expect(positions(identity.id)).toEqual([{ line: 4, column: 8, token: "KEY" }]);
    expect(positions(discovery.id)).toEqual([
      { line: 5, column: 21, token: "KEY" },
      { line: 6, column: 10, token: "ownerStats" },
      { line: 8, column: 9, token: "STABLE" },
    ]);
    expect(positions(empty.id)).toEqual([{ line: 4, column: 21, token: "Alias" }]);
    expect(result.authority.waivedFindings.map(({ finding }) => [finding.policyId, finding.token])).toEqual([
      [empty.id, "Alias"],
      [identity.id, "KEY"],
      [membership.id, "FETCH"],
      [membership.id, "OWNER"],
      [discovery.id, "KEY"],
    ]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(3);
  },
  scaledBudget(60_000),
);

test(
  "native sealed references retain exact per-file reviewed-grant subjects and operations",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const grants = [
      {
        id: "scrubber-native",
        policyId: scrubber.id,
        subject: SERVER,
        operation: "hidden-span-scrubber-construction",
        why: "native sealed reference fixture",
        endsWhen: "this fixture retires",
      },
      {
        id: "users-native",
        policyId: users.id,
        subject: SERVER,
        operation: "users-table-reference",
        why: "native sealed reference fixture",
        endsWhen: "this fixture retires",
      },
    ];
    const run = (reviewedGrants: typeof grants): ReturnType<typeof runPolicyPass> =>
      runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: [scrubber, users],
        reviewedGrants,
        failOnWarnings: false,
      });
    const result = run(grants);
    expect(result.toolErrors).toEqual([]);
    expect(
      result.authority.grantedFindings.map(({ finding, grantId }) => ({
        id: grantId,
        policyId: finding.policyId,
        file: finding.file,
        line: finding.line,
        column: finding.column,
        token: finding.token,
        subject: finding.subject,
        operation: finding.operation,
      })),
    ).toEqual([
      {
        id: "scrubber-native",
        policyId: scrubber.id,
        file: SERVER,
        line: 1,
        column: 9,
        token: "createHiddenSpanStreamScrubber",
        subject: SERVER,
        operation: "hidden-span-scrubber-construction",
      },
      { id: "users-native", policyId: users.id, file: SERVER, line: 2, column: 9, token: "users", subject: SERVER, operation: "users-table-reference" },
    ]);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    const wrong = run(grants.map((grant) => ({ ...grant, operation: "foreign-operation" })));
    expect(wrong.toolErrors).toEqual([]);
    expect(wrong.authority.grantedFindings).toEqual([]);
    expect(wrong.authority.effectiveFindings).toHaveLength(2);
    expect(wrong.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant", "stale-reviewed-grant"]);
  },
  scaledBudget(60_000),
);

test("sealed-reference owners withhold missing native services", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  const result = runPolicyPass({
    root: scratch,
    project: context.project,
    knownPolicies: POLICIES,
    policies: POLICIES,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors.map(({ policyId, message }) => ({ policyId, message }))).toEqual(
    POLICIES.map(({ id }) => ({ policyId: id, message: "native type fact context is unavailable" })).toSorted((left, right) =>
      left.policyId.localeCompare(right.policyId),
    ),
  );
  expect(result.authority.effectiveFindings).toEqual([]);
});
