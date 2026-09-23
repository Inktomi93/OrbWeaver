// Integration proof for test-world-browser-contracts, migrated to the final `defineGate` contract. The
// founding/negative shapes, symbol-identity edge cases, and the fail-closed unresolved-origin/cycle arms
// are proven once through the policy's own `mustFlag`/`mustPass` rows via `verifyPolicyProofs` below. This
// file keeps only what an isolated in-memory fixture cannot show: the world-classification table itself,
// and the REAL-CORPUS carry-forward guarantee (docs/law/gate-runtime-standardization.md, "Browser contracts require
// the real DOM world") — that the current whole Node-intent test census has zero browser-contract findings
// and zero unresolved relevant origins. The legacy version of this file ran the OLD `runPass`/`GateDescriptor`
// dispatcher directly; the successor is `runPolicyPass` over the same real `getWorkspace()` project, with no
// live-tree fixture-writer sentinel (the population/`isNodeTestContractRoot` filter runs inside the shared
// visitor now, not a `scanRoot` field the harness reads before dispatch).
import { join } from "node:path";
import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { RawGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyToolError } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-world-browser-contracts.ts";
import { isNodeTestContractRoot } from "../../../../tooling/src/verify/lib/browser-contract-reader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ctxFor } from "../../_support.ts";

interface Verdict {
  readonly findings: readonly RawGateFinding[];
  readonly toolErrors: readonly PolicyToolError[];
}

function virtualVerdict(files: Readonly<Record<string, string>>): Verdict {
  const { project, root } = ctxFor({ ...files });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  const owner = result.policies.find((policy) => policy.id === gate.id);
  return { findings: owner?.findings ?? [], toolErrors: result.toolErrors };
}

// The REAL @types/react + lib.dom resolution this class of finding depends on — the whole point of the
// gate is that React's global.d.ts supplies EMPTY DOM interfaces in the Node program, which only a real
// tsconfig-backed Project (not an isolated in-memory fixture) can exercise.
function nativeVerdict(source: string, suffix = ".test-d.ts", extraFiles: Readonly<Record<string, string>> = {}): Verdict {
  const root = process.cwd();
  const project = new Project({ tsConfigFilePath: join(root, "tsconfig.json"), skipAddingFilesFromTsConfig: true });
  for (const [path, text] of Object.entries(extraFiles)) {
    project.createSourceFile(join(root, path), text);
  }
  project.createSourceFile(join(root, `tests/__browser-contract-proof__/subject${suffix}`), source);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  const owner = result.policies.find((policy) => policy.id === gate.id);
  return { findings: owner?.findings ?? [], toolErrors: result.toolErrors };
}

test("the scan scope is derived from authored test kinds and helper worlds", () => {
  expect(
    [
      "tests/x.test.ts",
      "tests/x.test-d.ts",
      "tests/support/iso/x.ts",
      "tests/support/node/x.ts",
      "tests/support/fixtures.ts",
      "tests/client/feature/_fixture.ts",
      "tests/x.dom.test.ts",
      "tests/x.dom.test-d.ts",
      "tests/x.ct.tsx",
      "tests/x.stories.tsx",
      "tests/support/browser/x.ts",
    ].map(isNodeTestContractRoot),
  ).toEqual([true, true, true, true, true, true, false, false, false, false, false]);
});

test("the policy's own founding and negative proofs run through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("rejects the canonical React DOM shapes that compile in the Node program", () => {
  const result = nativeVerdict(
    'import type { ButtonHTMLAttributes, ComponentProps, ComponentPropsWithRef, ComponentPropsWithoutRef, KeyboardEvent, Ref } from "react";\n' +
      'type A = ComponentProps<"button">;\n' +
      'type B = ComponentPropsWithRef<"button">;\n' +
      'type C = ComponentPropsWithoutRef<"button">;\n' +
      "type D = ButtonHTMLAttributes<HTMLButtonElement>;\n" +
      "type E = Ref<HTMLButtonElement>;\n" +
      "type F = KeyboardEvent<HTMLButtonElement>;\n",
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.findings.map(({ token }) => token)).toEqual(
    expect.arrayContaining(['ComponentProps<"button">', 'ComponentPropsWithRef<"button">', 'ComponentPropsWithoutRef<"button">']),
  );
  expect(result.findings.length).toBeGreaterThanOrEqual(6);
});

test("canonical React identity survives a namespace door", () => {
  const result = nativeVerdict('import type * as ReactTypes from "react";\ntype Subject = ReactTypes.ComponentProps<"button">;\n');
  expect(result.toolErrors).toEqual([]);
  expect(result.findings).toHaveLength(1);
});

test("intrinsic-constrained React arguments retain string identity through aliases and unions", () => {
  const result = nativeVerdict(
    'import type { ComponentProps } from "react";\n' +
      'type Tag = "button"; type Tags = "button" | "a";\n' +
      'export type A = ComponentProps<Tag>; export type B = ComponentProps<"button" | "a">; export type C = ComponentProps<Tags>;\n',
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.findings.map(({ token }) => token)).toEqual(
    expect.arrayContaining(["ComponentProps<Tag>", 'ComponentProps<"button" | "a">', "ComponentProps<Tags>"]),
  );
});

test("DOM-bearing unions remain visible across a .ts contract boundary", () => {
  for (const anchor of ["DOMAttributes", "SyntheticEvent"]) {
    const result = nativeVerdict('import type { Mixed } from "../../packages/ui/src/__browser-contract-proof.ts"; export type Subject = Mixed;', ".test-d.ts", {
      "packages/ui/src/__browser-contract-proof.ts": `import type { ${anchor} } from 'react'; export type Mixed = (${anchor}<HTMLElement> | { readonly id: string });`,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.findings.map(({ token }) => token)).toContain("Mixed");
  }
});

test("does not treat arbitrary React generics, ReactNode, or application ref targets as DOM contracts", () => {
  const result = nativeVerdict(
    'import type { ProviderProps, ReactNode, Ref, SetStateAction } from "react";\n' +
      "interface PlainApplicationType { readonly id: string }\n" +
      'type A = SetStateAction<"button">;\n' +
      'type B = ProviderProps<"button">;\n' +
      "type C = Ref<PlainApplicationType>;\n" +
      "type D = ReactNode;\n",
  );
  expect(result).toMatchObject({ findings: [], toolErrors: [] });
});

test("permits Event and EventTarget when Node contributes real merged declarations", () => {
  const result = nativeVerdict("export type Subject = Event | EventTarget;\n", ".test.ts");
  expect(result).toMatchObject({ findings: [], toolErrors: [] });
});

test("a relevant canonical-origin refusal is a tool error rather than clean absence", () => {
  const result = virtualVerdict({
    "tests/ui/missing.test.ts": 'import { missing } from "@orb/ui/not-a-real-door";\nexport const subject = missing;\n',
  });
  expect(result.findings).toEqual([]);
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]?.message).toContain("no canonical authored target");
});

test("a relevant re-export cycle refuses instead of passing through an intermediate .ts barrel", () => {
  const result = virtualVerdict({
    "packages/ui/src/a.ts": 'export { Subject } from "./b.ts";\n',
    "packages/ui/src/b.ts": 'export { Subject } from "./a.ts";\n',
    "tests/ui/cycle.test-d.ts": 'import type { Subject } from "../../packages/ui/src/a.ts";\nexport type Seen = Subject;\n',
  });
  expect(result.findings).toEqual([]);
  expect(result.toolErrors.some(({ message }) => message.includes("cycle"))).toBe(true);
});

test("the current full Node-intent test census has no browser-contract findings or unresolved relevant origins", { timeout: scaledBudget(120_000) }, () => {
  const root = process.cwd();
  const project = getWorkspace({ root });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  const owner = result.policies.find((policy) => policy.id === gate.id);
  // This proves the guard over the whole real corpus its shared world vocabulary selects, exercising the
  // same dynamic `isNodeTestContractRoot` filter the visitor applies — not a harness-level pre-filter.
  expect(owner?.population.effectiveSourcePaths.length).toBeGreaterThan(0);
  expect(owner?.owner.status).toBe("success");
  expect(owner?.findings).toEqual([]);
});
