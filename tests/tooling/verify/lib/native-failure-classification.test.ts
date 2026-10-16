import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { promiseAbsorberSite } from "../../../../tooling/src/verify/lib/caught-failure.ts";
import { nativeFailureRead } from "../../../../tooling/src/verify/lib/caught-failure-native.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("held recoveries preserve source writes, closure boundaries and reference short-circuit order", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 } });
  const source = project.createSourceFile(
    "/packages/server/src/probe.ts",
    `
export function consumed(p: Promise<void>) { const recovered=p.catch(error=>({status:'failed',error})); return recovered; }
export function overwritten(p: Promise<void>) { let recovered=p.catch(error=>({status:'failed',error})); recovered=Promise.resolve({status:'ok',error:null}); return recovered; }
export function nested(p: Promise<void>) { const recovered=p.catch(error=>({status:'failed',error})); const later=()=>recovered; return later; }
export function ignored(p: Promise<void>) { const recovered=p.catch(undefined); return recovered; }
export function discarded(p: Promise<void>) { void p.catch(error=>({status:'failed',error})); }
`,
  );
  using facts = isolatedTypeFacts(project);
  const owner = "held-recovery-control";
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const native = nativeFailureRead(
    {
      files: [source],
      nativeTypes: {
        request: (query) => facts.request(owner, query),
        invocationEvidence: (nodes, plan) => facts.invocationEvidence(owner, nodes, plan),
        references: (nodes, importer) => facts.references(owner, nodes, importer),
      },
    },
    () => calls,
  );
  native.prepare();
  facts.seal(new Set([owner]));
  const reads = native.at(source);
  const references = vi.fn(reads.references);
  const rejectionCall = (name: string): import("ts-morph").CallExpression => {
    const call = source
      .getFunctionOrThrow(name)
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((node) => node.getExpression().getText() === "p.catch");
    if (call === undefined) {
      throw new Error("held-recovery call is missing");
    }
    return call;
  };
  for (const [name, token, queried] of [
    ["consumed", undefined, true],
    ["overwritten", "p", true],
    ["nested", "p", true],
    ["ignored", undefined, false],
    ["discarded", "p", false],
  ] as const) {
    const call = rejectionCall(name);
    references.mockClear();
    expect(promiseAbsorberSite(call)?.anchor?.token).toBe(token);
    expect(promiseAbsorberSite(call, { ...reads, references })?.anchor?.token).toBe(token);
    expect(references.mock.calls.length > 0).toBe(queried);
  }
  expect(promiseAbsorberSite(rejectionCall("consumed"), { ...reads, references: () => [] })?.anchor?.token).toBe("p");
  expect(promiseAbsorberSite(rejectionCall("overwritten"), { ...reads, types: { ...reads.types, definitions: () => [] } })).toBeUndefined();
});
