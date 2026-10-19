import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import type { TupleVocabularyFact } from "../../../../tooling/src/verify/contract/tuple-vocabulary-fact.ts";
import { gate as staleDraftCommit } from "../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../../../../tooling/src/verify/lib/tuple-vocabulary-fact.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/tuple-facts";
const VOCAB = "VOCAB";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function tuplePolicy(
  capture: (fact: TupleVocabularyFact) => void,
  input: readonly string[] = [VOCAB],
  name = VOCAB,
  id = "tuple-vocabulary-control",
): GatePolicy {
  return defineGate({
    id,
    family: "tuple-vocabulary",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "entire-population",
    facts: [{ provider: tupleVocabularyFact, input }],
    resources: [],
    message: "tuple vocabulary fact control",
    create: (ctx) => ({
      evaluate: () => {
        const fact = ctx.fact(tupleVocabularyFact).read(name);
        capture(fact);
        ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(fact) });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/client/src/flag.ts": "export const flag = 1;" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/client/src/pass.ts": "export const pass = 1;" }, why: "descriptor proof control" }],
  });
}

function runTuple(files: Readonly<Record<string, string>>): { readonly fact: TupleVocabularyFact; readonly result: ReturnType<typeof runPolicyPass> } {
  let captured: TupleVocabularyFact | undefined;
  const gate = tuplePolicy((fact) => {
    captured = fact;
  });
  const project = projectOf(files);
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  if (captured === undefined) {
    throw new Error("tuple fact was not evaluated");
  }
  return { fact: captured, result };
}

test("ordered tuple entries resolve aliases and re-exports with declaring-member provenance", () => {
  const { fact, result } = runTuple({
    "packages/client/src/base.ts": 'export const BASE = ["a", "b"] as const;',
    "packages/client/src/barrel.ts": 'export { BASE as RENAMED } from "./base";',
    "packages/client/src/vocab.ts": 'import { RENAMED as alias } from "./barrel"; const local = "c"; export const VOCAB = [...alias, local, "b"] as const;',
  });

  expect(result.toolErrors).toEqual([]);
  expect(fact.kind).toBe("resolved");
  if (fact.kind !== "resolved") {
    throw new Error("expected resolved tuple");
  }
  expect(fact.entries.map(({ value }) => value)).toEqual(["a", "b", "c", "b"]);
  expect(fact.entries.map(({ declaration }) => declaration.getName())).toEqual(["BASE", "BASE", "local", "VOCAB"]);
  expect(fact.symbol.declaration.getName()).toBe(VOCAB);
  expect(result.policies[0]?.receipts).toEqual([{ kind: "population", source: VOCAB, members: 4, unresolved: 0 }]);
});

test.each([
  ["namespace member", 'import * as ns from "./base"; export const VOCAB = [...ns.BASE] as const;', "dynamic"],
  ["destructured member", 'import { BASE } from "./base"; const [first] = BASE; export const VOCAB = [first] as const;', "dynamic"],
  ["write", 'import { BASE } from "./base"; BASE[0] = "changed"; export const VOCAB = [...BASE] as const;', "write"],
] as const)("%s refuses explicitly instead of shrinking the vocabulary", (_label, source, reason) => {
  const { fact, result } = runTuple({
    "packages/client/src/base.ts": 'export const BASE = ["a"] as const;',
    "packages/client/src/vocab.ts": source,
  });
  expect(fact).toMatchObject({ kind: "unresolved", reason });
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.authority.withheldPolicyIds).toEqual(["tuple-vocabulary-control"]);
});

test("computed scalar aliases resolve, while cycles and non-string members refuse", () => {
  const computed = runTuple({
    "packages/client/src/vocab.ts": 'const VALUE = "computed"; export const VOCAB = [VALUE] as const;',
  });
  expect(computed.fact).toMatchObject({ kind: "resolved", entries: [{ value: "computed" }] });

  const cycle = runTuple({
    "packages/client/src/vocab.ts": "const A = [...B] as const; const B = [...A] as const; export const VOCAB = A;",
  });
  expect(cycle.fact).toMatchObject({ kind: "unresolved", reason: "cycle" });

  const unsupported = runTuple({ "packages/client/src/vocab.ts": 'export const VOCAB = ["a", 2] as const;' });
  expect(unsupported.fact).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("absent, empty, missing-initializer, ambiguous, and non-exported shadows are distinct", () => {
  expect(runTuple({ "packages/client/src/other.ts": "const VOCAB = ['shadow']; export const other = 1;" }).fact).toEqual({
    kind: "absent",
    exportedName: VOCAB,
  });
  expect(runTuple({ "packages/client/src/vocab.ts": "export const VOCAB = [] as const;" }).fact.kind).toBe("empty");
  expect(runTuple({ "packages/client/src/vocab.ts": "export declare const VOCAB: readonly string[];" }).fact).toMatchObject({
    kind: "unresolved",
    reason: "missing",
  });
  expect(
    runTuple({
      "packages/client/src/a.ts": "export const VOCAB = ['a'] as const;",
      "packages/client/src/b.ts": "export const VOCAB = ['b'] as const;",
    }).fact,
  ).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
});

test("the provider indexes once, receipts the sources it WALKED, and refuses an empty index", () => {
  const shared = runTuple({
    "packages/client/src/vocab.ts": 'export const VOCAB = ["a"] as const;',
    "packages/client/src/other.ts": "export const other = 1;",
    "packages/client/src/nothing-exported.ts": "type Local = string;\n",
  });
  expect(shared.result.factErrors).toEqual([]);
  // MEASURED, NOT FOUND (#1962): three admitted sources, two indexed names. The receipt is the denominator
  // the collector walked — the third file is what discriminates the two numbers — and per-name emptiness
  // rides the fact, judged by the consumer's own `tupleVocabularyReceipt` below.
  expect(shared.result.facts).toMatchObject([
    { id: "tuple-vocabularies", status: "success", receipts: [{ kind: "population", source: "tuple-vocabulary-sources", members: 3 }] },
  ]);
  expect(shared.result.policies[0]?.receipts).toEqual([{ kind: "population", source: VOCAB, members: 1, unresolved: 0 }]);

  let captured: TupleVocabularyFact | undefined;
  const blind = tuplePolicy((fact) => {
    captured = fact;
  });
  const localProject = projectOf({ "packages/client/src/local.ts": 'const VOCAB = ["a"] as const;' });
  const empty = runPolicyPass({
    knownPolicies: [blind],
    policies: [blind],
    root: ROOT,
    project: localProject,
    nativeTypeFacts: () => isolatedTypeFacts(localProject),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(captured).toBeUndefined();
  expect(empty.factErrors).toMatchObject([{ factId: "tuple-vocabularies", phase: "finish", message: expect.stringContaining("collected no exported") }]);
  expect(empty.authority.withheldPolicyIds).toEqual(["tuple-vocabulary-control"]);
});

test("selected consumers union exact tuple demands without capturing unrelated exports", () => {
  const project = projectOf({
    "packages/client/src/vocab.ts": 'export const A=["a"] as const;export const B=["b"] as const;export const OTHER=["other"] as const;',
  });
  const first = tuplePolicy(() => undefined, ["A"], "A", "tuple-first");
  const second = tuplePolicy(() => undefined, ["B", "A"], "B", "tuple-second");
  const known = [first, second, staleDraftCommit];
  const run = (selected: readonly GatePolicy[]): { readonly captured: readonly string[]; readonly result: ReturnType<typeof runPolicyPass> } => {
    const requests: NativeTypeRequest[] = [];
    const result = runPolicyPass({
      knownPolicies: known,
      policies: selected,
      root: ROOT,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
      nativeTypeFacts: () => {
        const native = isolatedTypeFacts(project);
        return {
          ...native,
          request: (ownerId, request) => {
            requests.push(request);
            native.request(ownerId, request);
          },
        };
      },
    });
    const captured = requests.flatMap((request) =>
      request.kind === "invocation-evidence" && request.plan.facets.includes("authored-value")
        ? request.nodes.map((node) => node.getParentOrThrow().getText())
        : [],
    );
    return { captured, result };
  };
  const both = run([first, second]);
  expect(both.result.toolErrors).toEqual([]);
  expect(both.result.facts).toHaveLength(1);
  expect(both.captured).toEqual(['A=["a"] as const', 'B=["b"] as const']);
  const one = run([first]);
  expect(one.result.toolErrors).toEqual([]);
  expect(one.captured).toEqual(['A=["a"] as const']);
  const none = run([staleDraftCommit]);
  expect(none.result.toolErrors).toEqual([]);
  expect(none.result.facts).toEqual([]);
  expect(none.captured).toEqual([]);
});

test("tuple demand refuses duplicate declarations and undeclared names", () => {
  const project = projectOf({ "packages/client/src/vocab.ts": 'export const A=["a"] as const;export const B=["b"] as const;' });
  const duplicate = tuplePolicy(() => undefined, ["A", "A"], "A");
  expect(() => runPolicyPass({ knownPolicies: [duplicate], policies: [duplicate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false })).toThrow(
    "duplicate names",
  );
  const undeclared = tuplePolicy(() => undefined, ["A"], "B");
  const result = runPolicyPass({
    knownPolicies: [undeclared],
    policies: [undeclared],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.factErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([undeclared.id]);
  expect(result.toolErrors).toMatchObject([{ policyId: undeclared.id, message: "undeclared tuple vocabulary name: B" }]);
});
