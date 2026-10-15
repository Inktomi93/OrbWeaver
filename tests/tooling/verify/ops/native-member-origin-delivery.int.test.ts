import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  beginInventoryWrite,
  latestInventoryGeneration,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { inventoryString } from "../../../../tooling/src/floor/code-facts/semantic-inventory-records.ts";
import { originRefusalLeaf, readCallMemberDeclarationOrigin, resolveTypeMemberOrigin } from "../../../../tooling/src/floor/code-facts/type-member-origin.ts";
import type { NativeCallMemberOrigin } from "../../../../tooling/src/floor/code-facts/type-member-origin-contract.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { runInventoryPartitionWorker } from "../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as autosave } from "../../../../tooling/src/verify/gates/no-manual-autosave-flush.ts";
import { gate as subscription } from "../../../../tooling/src/verify/gates/single-stream-transport.ts";
import { classifyOriginRefusal, classifyOriginRefusalDeclarations, originRefusalDeclarations } from "../../../../tooling/src/verify/lib/origin-verdict.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FORM = "packages/client/src/features/probe/flush.ts";
const ROUTER = "packages/server/src/transport/trpc/routers/probe.ts";
const STREAM = "packages/server/src/transport/trpc/routers/stream.ts";
const CHAT = "packages/server/src/transport/trpc/routers/chat.ts";
const POLICIES = ["no-manual-autosave-flush", "single-stream-transport"] as const;

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        lib: browser ? ["es2022", "dom"] : ["es2022"],
        types: browser ? [] : ["node"],
      },
      files: [FORM, ROUTER, STREAM, CHAT],
    }),
  );
  write(
    "tooling/tsconfig.json",
    JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler" }, files: POLICIES.map((id) => `src/verify/gates/${id}.ts`) }),
  );
  for (const id of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  write(
    FORM,
    `import {FormApi} from '@tanstack/react-form';
function vendorForm(){return new FormApi({defaultValues:{items:['value']}});}
interface LocalForm {pushFieldValue(field:string,value:string):void;handleSubmit():Promise<void>}
type Selected=ReturnType<typeof setTimeout> extends number ? ReturnType<typeof vendorForm> : LocalForm;
export function onAdd(form:Selected):void {
  form.pushFieldValue('items','value');
  void form.handleSubmit();
}
`,
  );
  write(
    ROUTER,
    `import {initTRPC} from '@trpc/server';
const native=initTRPC.create();
interface LocalBuilder {subscription(resolver:()=>AsyncIterable<number>):unknown}
type Selected=ReturnType<typeof setTimeout> extends number ? typeof native.procedure : LocalBuilder;
declare const procedure:Selected;
export const routes={live:procedure.subscription(async function*(){yield 1;})};
`,
  );
  for (const [path, proc] of [
    [STREAM, "connect"],
    [CHAT, "impersonateStream"],
  ] as const) {
    write(
      path,
      `import {initTRPC} from '@trpc/server'; const native=initTRPC.create(); export const routes={${proc}:native.procedure.subscription(async function*(){yield 1;})};`,
    );
  }
  for (const name of ["client", "server"]) {
    symlinkSync(join(repoRoot, "packages", name, "node_modules"), join(root, "packages", name, "node_modules"), "dir");
  }
  execFixtureGit(root, ["init", "-q"]);
}

function assertNativeOrigins(root: string, browser: boolean): void {
  const native = createSemanticWorkspace({ root }).program("tsconfig.json");
  for (const [path, member, expectedPackage] of [
    [FORM, "pushFieldValue", "@tanstack/form-core"],
    [ROUTER, "subscription", "@trpc/server"],
  ] as const) {
    const source = native?.sourceFile(path);
    if (source === undefined) {
      throw new Error("native member fixture source is missing");
    }
    expect(source.getPreEmitDiagnostics()).toEqual([]);
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText().endsWith(member));
    if (call === undefined) {
      throw new Error("native member fixture call is missing");
    }
    const origin = resolveTypeMemberOrigin(call.getExpression());
    expect(origin.kind).toBe("resolved");
    expect(
      origin.kind === "resolved" && origin.value.declarations.every((node) => node.getSourceFile().getFilePath().includes(`/node_modules/${expectedPackage}/`)),
    ).toBe(browser);
  }
}

test(
  "both command doors preserve native member origins for the real installed form and subscription builders",
  async ({ scratch, repoRoot }) => {
    const exits: number[] = [];
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      assertNativeOrigins(root, browser);
      for (const [id, path] of [
        [POLICIES[0], FORM],
        [POLICIES[1], ROUTER],
      ] as const) {
        exits.push(await runStructure(root, [`--check=${id}`]));
        exits.push(await runScopedCli(root, ["--scope", path === ROUTER ? "packages/server/src/transport/trpc/routers" : path]));
      }
    }
    expect(exits).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  },
  scaledBudget(60_000),
);

function mixedFixture(root: string, repoRoot: string): void {
  fixture(root, repoRoot, false);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, lib: ["es2022"], types: ["node"] },
      files: [ROUTER, STREAM, CHAT],
    }),
  );
  writeFileSync(
    join(root, "packages/client/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, lib: ["es2022", "dom"], types: [] },
      files: ["src/features/probe/flush.ts"],
    }),
  );
}

test("both member consumers share one closed generation across their real Node/browser owners without a syntax checker", {
  timeout: scaledBudget(60_000),
}, async ({ scratch, repoRoot }) => {
  mixedFixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
  const checker = vi.spyOn(context.project, "getTypeChecker").mockImplementation(() => {
    throw new Error("syntax checker fallback");
  });
  try {
    for (const policies of [
      [autosave, subscription],
      [subscription, autosave],
    ]) {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [autosave, subscription],
        policies,
        reviewedGrants: reviewedGrantsFor(policies),
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.authorityAlarms).toEqual([]);
      expect(result.authority.effectiveFindings.map(({ policyId, file, token }) => [policyId, file, token])).toEqual([[autosave.id, FORM, "pushFieldValue"]]);
      expect(result.authority.grantedFindings).toHaveLength(2);
      expect(result.policies.every(({ owner }) => owner.status === "success")).toBe(true);
    }
    expect(checker).not.toHaveBeenCalled();
    expect(worker.mock.calls.map(([request]) => [request.descriptor.id, request.families])).toEqual([
      ["packages/client/tsconfig.json", ["bindings", "type-member-origins"]],
      ["tsconfig.json", ["bindings", "type-member-origins"]],
    ]);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    for (const partition of readInventoryGeneration(db, latestInventoryGeneration(db))) {
      const request = worker.mock.calls.find(([candidate]) => candidate.descriptor.id === partition.program)?.[0];
      expect(partition.compilerOptionsJson).toBe(JSON.stringify(request?.descriptor.commandLine.options));
      expect(partition.roots).toEqual(request?.descriptor.files.map((path) => join(scratch, path)));
      expect(partition.nativeRoots).toEqual(partition.roots);
      expect(partition.workerPid).toBeDefined();
      expect(partition.workerPid).not.toBe(process.pid);
      expect(() => process.kill(partition.workerPid ?? process.pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    }
  } finally {
    checker.mockRestore();
    worker.mockRestore();
  }
});

test("missing native services and failed workers withhold both consumers through both command doors", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot, true);
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const original = contexts.projectCtx;
  const missing = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeTypeFacts: omitted, ...context } = original(root);
    expect(omitted).toBeDefined();
    return context;
  });
  const runDoors = async (): Promise<void> => {
    for (const id of POLICIES) {
      expect(await runStructure(scratch, [`--check=${id}`])).toBe(2);
      expect(await runScopedCli(scratch, ["--scope", id === autosave.id ? FORM : "packages/server/src/transport/trpc/routers"])).toBe(2);
    }
  };
  try {
    await runDoors();
  } finally {
    missing.mockRestore();
  }
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const failed = vi.spyOn(workers, "runInventoryPartitionWorker").mockImplementation(() => {
    throw new Error("native member origin worker failed");
  });
  try {
    await runDoors();
    expect(failed).toHaveBeenCalledTimes(4);
  } finally {
    failed.mockRestore();
  }
});

test(
  "each consumer keeps all its declared proof judgments on the shared isolated native adapter",
  () => {
    expect(verifyPolicyProofs([autosave, subscription])).toEqual([]);
  },
  scaledBudget(60_000),
);

function originSnapshot(fact: NativeCallMemberOrigin): object {
  const key = (node: import("ts-morph").Node): string => `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}:${node.getKind()}`;
  const origin = fact.origin;
  return {
    name: fact.name,
    leaf: fact.leafDeclarations.map(key),
    trace: { origin: key(origin.trace.origin), declarations: origin.trace.declarations.map(key) },
    result:
      origin.kind === "resolved"
        ? { kind: origin.kind, declarations: origin.value.map(key) }
        : { kind: origin.kind, reason: origin.reason, detail: origin.detail, node: key(origin.node) },
  };
}

test("member projection preserves optional, computed, merged and unresolved native origins plus the existing refusal-leaf asymmetry", {
  timeout: scaledBudget(60_000),
}, ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, true);
  writeFileSync(
    join(scratch, FORM),
    `import {FormApi} from '@tanstack/react-form';
function vendorForm(){return new FormApi({defaultValues:{items:['value']}});}
interface LocalForm {pushFieldValue(field:string,value:string):void;handleSubmit():Promise<void>}
export function read(form:ReturnType<typeof vendorForm>|undefined, merged:ReturnType<typeof vendorForm>&LocalForm):void {
  form?.pushFieldValue('items','value');
  void form?.['handleSubmit']();
  merged.pushFieldValue('items','value');
  const key='handleSubmit';
  void form?.[key]();
}
declare const opaque:any;
opaque.handleSubmit();
declare const dynamic:string;
opaque[dynamic]();
const bag={handleSubmit(){}};
bag.handleSubmit();bag['handleSubmit']();
`,
  );
  const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
  const source = createSemanticWorkspace({ root: scratch }).program("tsconfig.json")?.sourceFile(FORM);
  if (descriptor === undefined || source === undefined) {
    throw new Error("native member projection fixture owner is missing");
  }
  expect(source.getPreEmitDiagnostics()).toEqual([]);
  const serviceFor = Project.prototype.getLanguageService;
  const seen = new Set<ReturnType<Project["getLanguageService"]>>();
  const restore: (() => void)[] = [];
  const service = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const language = serviceFor.call(this);
    if (!seen.has(language)) {
      seen.add(language);
      const reference = vi.spyOn(language.compilerObject, "createReadonlyReferencePass").mockImplementation(() => {
        throw new Error("member-only extraction started native reference work");
      });
      restore.push(() => reference.mockRestore());
    }
    return language;
  });
  try {
    const partition = extractInventoryPartition({
      root: scratch,
      descriptor,
      families: ["bindings", "type-member-origins"],
      destination: join(scratch, "unused.sqlite"),
    });
    expect(partition.references).toEqual([]);
    expect(partition.families).toEqual(["bindings", "type-member-origins"]);
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("type-member-origins");
    using db = openInventoryDatabase(join(scratch, "member-round-trip.sqlite"));
    beginInventoryWrite(db);
    const generation = publishInventoryGeneration(db, [partition]);
    db.exec("COMMIT");
    using stored = inventoryReader(scratch, generation, readInventoryGeneration(db, generation), { db, dispose: () => undefined });
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const actual = stored.callMemberOrigin(call, descriptor.id);
      const expected = { ...readCallMemberDeclarationOrigin(call), leafDeclarations: originRefusalDeclarations(call.getExpression()) };
      expect(originSnapshot(actual)).toEqual(originSnapshot(expected));
    }
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const merged = calls.find((call) => call.getExpression().getText() === "merged.pushFieldValue");
    const dotted = calls.find((call) => call.getExpression().getText() === "bag.handleSubmit");
    const computed = calls.find((call) => call.getExpression().getText() === "bag['handleSubmit']");
    const opaque = calls.find((call) => call.getExpression().getText() === "opaque.handleSubmit");
    const dynamic = calls.find((call) => call.getExpression().getText() === "opaque[dynamic]");
    if (merged === undefined || dotted === undefined || computed === undefined || opaque === undefined || dynamic === undefined) {
      throw new Error("native member projection controls are missing");
    }
    const multi = stored.callMemberOrigin(merged, descriptor.id).origin;
    expect(multi.kind).toBe("resolved");
    if (multi.kind !== "resolved") {
      throw new Error("native merged member is unresolved");
    }
    expect(multi.value.some((node) => node.getSourceFile().getFilePath().includes("/node_modules/@tanstack/form-core/"))).toBe(true);
    expect(multi.value.some((node) => node.getSourceFile().getFilePath() === source.getFilePath())).toBe(true);
    expect(stored.callMemberOrigin(opaque, descriptor.id).origin).toMatchObject({ kind: "unresolved", reason: "missing" });
    expect(stored.callMemberOrigin(dynamic, descriptor.id)).toMatchObject({ name: null, origin: { kind: "unresolved", reason: "dynamic" } });
    expect(
      [dotted, computed].map((call) => classifyOriginRefusalDeclarations("missing", stored.callMemberOrigin(call, descriptor.id).leafDeclarations)),
    ).toEqual(["other", "unreadable"]);
    expect([dotted, computed].map((call) => classifyOriginRefusal("missing", call.getExpression()))).toEqual(["other", "unreadable"]);
    expect(originRefusalLeaf(computed.getExpression())).toBe(computed.getExpression());
  } finally {
    service.mockRestore();
    for (const end of restore) {
      end();
    }
  }
});

test("native member inventories refuse missing families, wrong spans/worlds, stale sources and disposal", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  mixedFixture(scratch, repoRoot);
  const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "packages/client/tsconfig.json");
  using inventory = createSemanticInventory({ root: scratch, programs, families: ["bindings", "type-member-origins"] });
  const source = inventory.sourceCorpus().getSourceFile(FORM);
  const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith("pushFieldValue"));
  if (source === undefined || call === undefined) {
    throw new Error("native member query is missing");
  }
  expect(inventory.callMemberOrigin(call, "packages/client/tsconfig.json").name).toBe("pushFieldValue");
  expect(() => inventory.callMemberOrigin(call, "foreign")).toThrow("partition is unavailable");
  expect(() => inventory.callMemberOrigin(call, "tsconfig.json")).toThrow("source/epoch");
  expect(() => inventory.callMemberOrigin(call.getExpression(), "packages/client/tsconfig.json")).toThrow("origin span is unavailable");
  using missingMembers = createSemanticInventory({ root: scratch, programs, families: ["bindings"], databasePath: join(scratch, "bindings-only.sqlite") });
  expect(() => missingMembers.callMemberOrigin(call, "packages/client/tsconfig.json")).toThrow("family unavailable: type-member-origins");
  using missingBindings = createSemanticInventory({
    root: scratch,
    programs,
    families: ["type-member-origins"],
    databasePath: join(scratch, "members-only.sqlite"),
  });
  expect(() => missingBindings.callMemberOrigin(call, "packages/client/tsconfig.json")).toThrow("family unavailable: bindings");
  const acquire = vi.fn((): never => {
    throw new Error("unexpected acquisition");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("owner", { kind: "type-member-origins", nodes: [call] });
  expect(() => session.callMemberOrigins("owner", [call])).toThrow("must be sealed");
  session.seal(new Set(["owner"]));
  expect(() => session.callMemberOrigins("other", [call])).toThrow("not registered by this owner");
  expect(acquire).not.toHaveBeenCalled();
  session[Symbol.dispose]();
  expect(() => session.callMemberOrigins("owner", [call])).toThrow("disposed");
  source.replaceWithText("export const changed=1;");
  const changed = source.getVariableDeclarationOrThrow("changed");
  expect(() => inventory.callMemberOrigin(changed, "packages/client/tsconfig.json")).toThrow("source/epoch");
  inventory[Symbol.dispose]();
  expect(() => inventory.callMemberOrigin(changed, "packages/client/tsconfig.json")).toThrow("disposed");
});

test("a truncated native leaf binding refuses rather than becoming an empty or foreign origin", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, true);
  const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json");
  using inventory = createSemanticInventory({ root: scratch, programs, families: ["bindings", "type-member-origins"] });
  const source = inventory.sourceCorpus().getSourceFile(FORM);
  const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith("pushFieldValue"));
  const callee = call?.getExpression();
  if (source === undefined || call === undefined || callee === undefined || !Node.isPropertyAccessExpression(callee)) {
    throw new Error("native leaf binding fixture call is missing");
  }
  expect(inventory.callMemberOrigin(call, "tsconfig.json").leafDeclarations.length).toBeGreaterThan(0);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partition = readInventoryGeneration(db, inventory.generation)[0];
  if (partition === undefined) {
    throw new Error("native leaf binding fixture partition is missing");
  }
  const leaf = callee.getNameNode();
  const binding = db
    .prepare(
      "SELECT f.ordinal FROM inventory_fact f JOIN inventory_span s ON s.partition=f.partition AND s.ordinal=f.node WHERE f.partition=? AND f.kind='bindings' AND s.file=? AND s.start=? AND s.end=? AND s.kind=?",
    )
    .get(partition.id, inventoryString(inventory.canonicalPath(source.getFilePath())), leaf.getStart(), leaf.getEnd(), leaf.getKind());
  if (typeof binding?.["ordinal"] !== "number") {
    throw new Error("native leaf binding fixture row is missing");
  }
  beginInventoryWrite(db);
  db.prepare("DELETE FROM inventory_declaration WHERE partition=? AND kind='bindings' AND owner=?").run(partition.id, binding["ordinal"]);
  expect(db.prepare("DELETE FROM inventory_fact WHERE partition=? AND kind='bindings' AND ordinal=?").run(partition.id, binding["ordinal"]).changes).toBe(1);
  db.exec("COMMIT");
  expect(() => inventory.callMemberOrigin(call, "tsconfig.json")).toThrow("leaf binding is unavailable");
});

for (const role of ["value", "trace", "leaf"] as const) {
  test(
    `native member declaration-tail truncation refuses incomplete ${role} evidence`,
    ({ scratch, repoRoot }) => {
      fixture(scratch, repoRoot, true);
      const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json");
      using inventory = createSemanticInventory({ root: scratch, programs, families: ["bindings", "type-member-origins"] });
      const source = inventory.sourceCorpus().getSourceFile(FORM);
      const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith("pushFieldValue"));
      if (source === undefined || call === undefined) {
        throw new Error("native declaration population fixture is missing");
      }
      const before = inventory.callMemberOrigin(call, "tsconfig.json");
      expect(before.origin.kind).toBe("resolved");
      expect(before.leafDeclarations.length).toBeGreaterThan(0);
      using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
      const partition = readInventoryGeneration(db, inventory.generation)[0];
      if (partition === undefined) {
        throw new Error("native declaration population partition is missing");
      }
      const query = db
        .prepare(
          "SELECT m.ordinal,m.leaf FROM inventory_member_origin m JOIN inventory_span s ON s.partition=m.partition AND s.ordinal=m.node WHERE m.partition=? AND s.file=? AND s.start=? AND s.end=? AND s.kind=?",
        )
        .get(partition.id, inventoryString(inventory.canonicalPath(source.getFilePath())), call.getStart(), call.getEnd(), call.getKind());
      if (typeof query?.["ordinal"] !== "number" || typeof query["leaf"] !== "number") {
        throw new Error("native declaration population row is missing");
      }
      beginInventoryWrite(db);
      const removed =
        role === "leaf"
          ? db
              .prepare(
                "DELETE FROM inventory_declaration WHERE partition=? AND kind='bindings' AND role='lexical' AND owner=(SELECT ordinal FROM inventory_fact WHERE partition=? AND kind='bindings' AND node=?) AND ordinal=(SELECT MAX(d.ordinal) FROM inventory_declaration d JOIN inventory_fact f ON f.partition=d.partition AND f.kind=d.kind AND f.ordinal=d.owner WHERE f.partition=? AND f.kind='bindings' AND f.node=? AND d.role='lexical')",
              )
              .run(partition.id, partition.id, query["leaf"], partition.id, query["leaf"]).changes
          : db
              .prepare(
                "DELETE FROM inventory_member_declaration WHERE partition=? AND owner=? AND role=? AND ordinal=(SELECT MAX(ordinal) FROM inventory_member_declaration WHERE partition=? AND owner=? AND role=?)",
              )
              .run(partition.id, query["ordinal"], role, partition.id, query["ordinal"], role).changes;
      expect(removed).toBe(1);
      db.exec("COMMIT");
      expect(() => inventory.callMemberOrigin(call, "tsconfig.json")).toThrow("native call member declaration population is incomplete");
    },
    scaledBudget(60_000),
  );
}

test(
  "member publication refuses a missing captured leaf binding and preserves its complete generation",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, true);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    if (descriptor === undefined) {
      throw new Error("native publication descriptor is missing");
    }
    const partition = extractInventoryPartition({
      root: scratch,
      descriptor,
      families: ["bindings", "type-member-origins"],
      destination: join(scratch, "unused.sqlite"),
    });
    const member = partition.memberOrigins.find((fact) => fact.name === "pushFieldValue");
    const leaf = member?.leaf;
    if (leaf === null || leaf === undefined) {
      throw new Error("native publication leaf is missing");
    }
    const incomplete = {
      ...partition,
      bindings: partition.bindings.filter(
        ({ node }) => node.file !== leaf.file || node.start !== leaf.start || node.end !== leaf.end || node.kind !== leaf.kind,
      ),
    };
    expect(partition.bindings.length - incomplete.bindings.length).toBe(1);
    using db = openInventoryDatabase(join(scratch, "publication.sqlite"));
    beginInventoryWrite(db);
    const generation = publishInventoryGeneration(db, [partition]);
    db.exec("COMMIT");
    beginInventoryWrite(db);
    try {
      expect(() => publishInventoryGeneration(db, [incomplete])).toThrow("native call member leaf binding is unavailable");
    } finally {
      db.exec("ROLLBACK");
    }
    expect(latestInventoryGeneration(db)).toBe(generation);
    const committed = readInventoryGeneration(db, generation);
    using reader = inventoryReader(scratch, generation, committed, { db, dispose: () => undefined });
    const source = reader.sourceCorpus().getSourceFile(FORM);
    const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith("pushFieldValue"));
    if (call === undefined) {
      throw new Error("committed native publication call is missing");
    }
    expect(reader.callMemberOrigin(call, descriptor.id).name).toBe("pushFieldValue");
  },
  scaledBudget(60_000),
);

test("native body/proc identity still governs ordinary waivers and exact reviewed grants", { timeout: scaledBudget(60_000) }, ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, true);
  const context = projectCtx(scratch);
  const actualGrants = reviewedGrantsFor([subscription]);
  const grant = {
    id: "member-native-probe",
    policyId: subscription.id,
    subject: ROUTER,
    operation: "sse-subscription:live",
    why: "native fixture grant identity control",
    endsWhen: "this fixture stops declaring its probe subscription",
  };
  for (const [selected, effective, granted, stale] of [
    [grant, 0, 3, false],
    [{ ...grant, operation: "sse-subscription:other" }, 1, 2, true],
    [{ ...grant, subject: CHAT }, 1, 2, true],
  ] as const) {
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: [autosave, subscription],
      policies: [subscription],
      reviewedGrants: [...actualGrants, selected],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(effective);
    expect(result.authority.grantedFindings).toHaveLength(granted);
    expect(result.authority.authorityAlarms.some((alarm) => alarm.kind === "stale-reviewed-grant" && alarm.grantId === grant.id)).toBe(stale);
  }
  for (const [position, waived, effective] of [
    ["pushFieldValue", 1, 0],
    ["handleSubmit", 0, 1],
  ] as const) {
    const root = join(scratch, position);
    fixture(root, repoRoot, true);
    const original = readFileSync(join(root, FORM), "utf8");
    writeFileSync(
      join(root, FORM),
      original.replace(
        "  form.pushFieldValue",
        `  // @orb-waive no-manual-autosave-flush(${position}): native fixture waiver identity; ends with this case.\n  form.pushFieldValue`,
      ),
    );
    const owner = projectCtx(root);
    const result = runPolicyPass({
      root,
      project: owner.project,
      ...nativeTypeFactOptions(owner),
      knownPolicies: [autosave, subscription],
      policies: [autosave],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.findings).toHaveLength(1);
    expect(result.authority.waivedFindings).toHaveLength(waived);
    expect(result.authority.effectiveFindings).toHaveLength(effective);
    expect(result.authority.authorityAlarms.length === 0).toBe(waived === 1);
  }
});

test("member snapshots pin both native worlds, isolate overlays and refuse a cross-world input race", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  mixedFixture(scratch, repoRoot);
  const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "packages/client/tsconfig.json");
  const options = { root: scratch, programs, families: ["bindings", "type-member-origins"] as const };
  const values = (inventory: ReturnType<typeof createSemanticInventory>): readonly boolean[] =>
    (
      [
        [FORM, "packages/client/tsconfig.json", "pushFieldValue", "@tanstack/form-core"],
        [ROUTER, "tsconfig.json", "subscription", "@trpc/server"],
      ] as const
    ).map(([path, program, name, home]) => {
      const source = inventory.sourceCorpus().getSourceFile(path);
      const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText().endsWith(name));
      if (call === undefined) {
        throw new Error("pinned member call is missing");
      }
      const result = inventory.callMemberOrigin(call, program).origin;
      return (
        result.kind === "resolved" &&
        result.value.length > 0 &&
        result.value.every((node) => node.getSourceFile().getFilePath().includes(`/node_modules/${home}/`))
      );
    });
  using previous = createSemanticInventory(options);
  expect(values(previous)).toEqual([true, false]);
  const formText = readFileSync(join(scratch, FORM), "utf8").replace(
    "? ReturnType<typeof vendorForm> : LocalForm",
    "? LocalForm : ReturnType<typeof vendorForm>",
  );
  const routerText = readFileSync(join(scratch, ROUTER), "utf8").replace(
    "? typeof native.procedure : LocalBuilder",
    "? LocalBuilder : typeof native.procedure",
  );
  const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
    root: scratch,
    files: [
      { path: join(scratch, FORM), text: formText },
      { path: join(scratch, ROUTER), text: routerText },
    ],
    deleted: [],
  });
  using overlay = createSemanticInventory({ ...options, fileSystem, overlay: { addedPaths: [], deletedPaths: [] } });
  expect(values(overlay)).toEqual([false, true]);
  expect(values(previous)).toEqual([true, false]);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(db)).toBe(previous.generation);
  writeFileSync(join(scratch, FORM), formText);
  writeFileSync(join(scratch, ROUTER), routerText);
  let completed = 0;
  expect(() =>
    createSemanticInventory({
      ...options,
      buildPartition: (request) => {
        runInventoryPartitionWorker(request);
        expect(latestInventoryGeneration(db)).toBe(previous.generation);
        expect(values(previous)).toEqual([true, false]);
        if (++completed === 1) {
          writeFileSync(join(scratch, FORM), `${formText}\nexport const changedDuringExtraction=1;`);
          writeFileSync(join(scratch, ROUTER), `${routerText}\nexport const changedDuringExtraction=1;`);
        }
      },
    }),
  ).toThrow("inputs changed during extraction");
  expect(latestInventoryGeneration(db)).toBe(previous.generation);
  expect(completed).toBe(2);
  using current = createSemanticInventory(options);
  expect(current.generation).toBeGreaterThan(previous.generation);
  expect(values(current)).toEqual([false, true]);
  expect(values(previous)).toEqual([true, false]);
});
