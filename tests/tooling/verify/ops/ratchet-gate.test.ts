// THE PERMANENT PIN for the vitest-tier ratchet aggregate (#667). WHY IT EXISTS: `pnpm check` is static
// and never runs a vitest suite, so an enforcement test going RED on main was invisible to every merge
// gate — this aggregate (`pnpm test:ratchets`) is the sub-minute train-gate subset that catches that class.
//
// The convention is GLOB-FIRST (`isRatchetShaped`), not a hand list — this is the planted control that
// PROVES it: `discovery` names a fake file this test has never seen before (`chocolate-teapot-ratchet.test.ts`)
// and it comes back INCLUDED with zero edits to the classifier, because its basename matches the naming
// convention. A hand-list design would have needed a new row for it; this design needs none — that IS the
// "enumeration must not rot" property #667 asked for.
import { classifyRatchetFiles, discoverTestFiles, isRatchetShaped } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("isRatchetShaped: the tooling ratchet/presence/conformance self-tests match", () => {
  expect(isRatchetShaped("tests/tooling/chat-component-presence.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/verify/ops/boot-chunk-ratchet.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/verify/ops/ct-unfed-ratchet.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/gate-conformance.int.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/verify/gates/test-presence-client.int.test.ts")).toBe(true);
});

test("isRatchetShaped: Vitest DOM, suite, and type-only kinds remain eligible while Playwright kinds do not", () => {
  expect(isRatchetShaped("tests/tooling/verify/ops/dom-presence.dom.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/verify/ops/coverage-ratchet.suite.int.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/workboard/contract/types.test-d.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/verify/ops/visual-presence.ct.tsx")).toBe(false);
  expect(isRatchetShaped("tests/tooling/verify/ops/browser-presence.spec.ts")).toBe(false);
});

test("isRatchetShaped: a fake NEVER-SEEN-BEFORE tooling file matches by NAME alone — the planted control", () => {
  // No row anywhere names this file. If this is false, the convention is a hand list wearing a glob's
  // clothes — the exact rot #667 was filed to end.
  expect(isRatchetShaped("tests/tooling/verify/ops/chocolate-teapot-ratchet.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/some-brand-new-presence-check.test.ts")).toBe(true);
});

test("isRatchetShaped: the workboard mirror matches by DIRECTORY, not name", () => {
  expect(isRatchetShaped("tests/tooling/workboard/cli.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/tooling/workboard/contract/types.test-d.ts")).toBe(true);
  // A brand-new file under the mirror dir, whatever it's called.
  expect(isRatchetShaped("tests/tooling/workboard/a-totally-new-file.test.ts")).toBe(true);
});

test("isRatchetShaped: an exact-tuple contract pin matches by SUFFIX, a plain unit test under the same tree does not", () => {
  expect(isRatchetShaped("tests/contracts/theme/card-embeddable-partition.contract.test.ts")).toBe(true);
  expect(isRatchetShaped("tests/contracts/theme/card-embeddable-partition.suite.test.ts")).toBe(false);
});

test("isRatchetShaped: an UNRELATED file that merely CONTAINS 'presence' outside tests/tooling never matches — the false-positive fence", () => {
  // presence-registry.test.ts is a real file: SSE ref-count domain logic, nothing to do with a coverage
  // ratchet. A naive substring-anywhere convention would have swept it in.
  expect(isRatchetShaped("tests/server/transport/trpc/presence-registry.test.ts")).toBe(false);
});

test("isRatchetShaped: a plain tooling test with no ratchet/presence/conformance in its name does not match", () => {
  expect(isRatchetShaped("tests/tooling/check-gates.int.test.ts")).toBe(false);
  expect(isRatchetShaped("tests/tooling/dependency-cruiser.int.test.ts")).toBe(false);
});

test("classifyRatchetFiles: EXPLICIT_INCLUDES adds the cross-tenant sweep even though its name matches nothing", () => {
  const crossTenant = "tests/server/transport/cross-tenant-sweep.suite.int.test.ts";
  expect(isRatchetShaped(crossTenant)).toBe(false); // outside tests/tooling, no name-convention hit
  const { included } = classifyRatchetFiles([crossTenant, "tests/tooling/chat-component-presence.test.ts"]);
  expect(included).toContain(crossTenant);
});

test("classifyRatchetFiles: EXPLICIT_INCLUDES never fabricates a path absent from the candidate set", () => {
  // A stale hand-list row (the file moved/renamed) must not phantom-include a nonexistent path.
  const { included } = classifyRatchetFiles(["tests/tooling/chat-component-presence.test.ts"]);
  expect(included).not.toContain("tests/server/transport/cross-tenant-sweep.suite.int.test.ts");
});

test("classifyRatchetFiles: check-gates.int.test.ts is excluded WITH a reason, rename-safe against the naming convention", () => {
  const checkGates = "tests/tooling/check-gates.int.test.ts";
  const { included, excluded } = classifyRatchetFiles([checkGates, "tests/tooling/chat-component-presence.test.ts"]);
  expect(included).not.toContain(checkGates);
  const row = excluded.find((e) => e.path === checkGates);
  expect(row).toBeDefined();
  expect(row?.reason).toContain("concurrency");
});

test("classifyRatchetFiles: gate-conformance.int.test.ts matches the naming convention but is excluded for budget, WITH a reason", () => {
  const gateConformance = "tests/tooling/gate-conformance.int.test.ts";
  expect(isRatchetShaped(gateConformance)).toBe(true); // matches the convention — this is a DELIBERATE pull-out, not a gap
  const { included, excluded } = classifyRatchetFiles([gateConformance, "tests/tooling/chat-component-presence.test.ts"]);
  expect(included).not.toContain(gateConformance);
  const row = excluded.find((e) => e.path === gateConformance);
  expect(row).toBeDefined();
  expect(row?.reason).toContain("push-tier");
});

test("classifyRatchetFiles: a file matching NOTHING never rides the aggregate", () => {
  const { included } = classifyRatchetFiles(["tests/server/transport/trpc/presence-registry.test.ts", "tests/client/features/chat/components/composer.ct.tsx"]);
  expect(included).toEqual([]);
});

test("discoverTestFiles + classifyRatchetFiles over a PLANTED tree: a brand-new ratchet-shaped file is picked up with zero list edits", async ({
  plantedTree,
}) => {
  const root = await plantedTree({
    "tests/tooling/verify/ops/brand-new-thing-ratchet.test.ts": "// planted\n",
    "tests/tooling/some-unrelated-tool.test.ts": "// planted, no ratchet/presence/conformance in the name\n",
    "tests/tooling/workboard/another-new-file.test.ts": "// planted\n",
    "tests/contracts/foo/bar.contract.test.ts": "// planted\n",
    "tests/contracts/foo/bar.suite.test.ts": "// planted, not a .contract.test.ts\n",
    "tests/tooling/check-gates.int.test.ts": "// planted stand-in for the real excluded file\n",
    "tests/tooling/verify/ops/dom-presence.dom.test.ts": "// planted Vitest DOM kind\n",
    "tests/tooling/verify/ops/visual-presence.ct.tsx": "// planted Playwright kind\n",
  });

  const candidates = discoverTestFiles(root);
  const { included, excluded } = classifyRatchetFiles(candidates);

  expect(included).toContain("tests/tooling/verify/ops/brand-new-thing-ratchet.test.ts");
  expect(included).toContain("tests/tooling/workboard/another-new-file.test.ts");
  expect(included).toContain("tests/contracts/foo/bar.contract.test.ts");
  expect(included).not.toContain("tests/tooling/some-unrelated-tool.test.ts");
  expect(included).not.toContain("tests/contracts/foo/bar.suite.test.ts");
  expect(included).not.toContain("tests/tooling/check-gates.int.test.ts");
  expect(candidates).toContain("tests/tooling/verify/ops/dom-presence.dom.test.ts");
  expect(candidates).not.toContain("tests/tooling/verify/ops/visual-presence.ct.tsx");
  expect(included).toContain("tests/tooling/verify/ops/dom-presence.dom.test.ts");
  expect(excluded.map((e) => e.path)).toContain("tests/tooling/check-gates.int.test.ts");
});
