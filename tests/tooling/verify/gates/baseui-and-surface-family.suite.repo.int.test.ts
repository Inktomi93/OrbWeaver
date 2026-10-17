// Retained portal/surface policy authority controls and the shared installed-surface reader.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { beforeEach, describe, vi } from "vitest";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as surfaceA11yFocus } from "../../../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as surfaceInAContainer } from "../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { installedPackageRootOf, installedSurfaceFrom } from "../../../../tooling/src/verify/lib/baseui-read.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { loadInstalledPackage } from "../../../../tooling/src/verify/ops/resource-installed.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";

// Composition/verdict assertions borrow an actual native snapshot; this process supplies no current-execution receipt.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

const POLICIES = [surfaceA11yFocus, surfaceInAContainer] as const;
const POLICY_IDS = new Set(POLICIES.map((policy) => policy.id));

function pass(policy: GatePolicy, root: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content, { overwrite: true });
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("every converted policy in both families keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs([...POLICIES])).toEqual([]);
});

// ── §4.2 IDENTITY ARMS ──────────────────────────────────────────────────────────────────────────────
//
// One per ORDINARY policy, and each is the TRIPLE — `effectiveFindings []`,
// `waivedFindings 1`, `authorityAlarms []`. The third assertion is the one a `mustPass` row cannot make:
// an over-broad or duplicate marker ALARMS without changing the finding count, so a two-assertion arm would
// pass a marker that suppresses the wrong thing. Every fixture produces exactly ONE finding, because one
// marker consumes one occurrence.

interface IdentityCase {
  readonly policy: GatePolicy;
  readonly path: string;
  /** The position the policy reports — what the author must type. */
  readonly position: string;
  /** A position the fixture does NOT report, for the discrimination control. */
  readonly deadPosition: string;
  readonly body: (marker: string) => string;
  readonly extra?: Readonly<Record<string, string>>;
}

const IDENTITY_CASES: readonly IdentityCase[] = [
  {
    policy: surfaceA11yFocus,
    path: "packages/client/src/features/x/surfaces/pane.tsx",
    position: "Pane",
    deadPosition: "Other",
    body: (marker) => `${marker}export const Pane = () => <div>content</div>;\n`,
  },
  {
    policy: surfaceInAContainer,
    path: "packages/client/src/features/x/surfaces/pane.tsx",
    position: "Pane",
    deadPosition: "Other",
    body: (marker) => `${marker}export const Pane = () => <div><ul><li>row</li></ul></div>;\n`,
  },
];

/** The family's SHARED-ANCHOR claim, ASSERTED rather than described: `surface-a11y-focus` and
 *  `surface-in-a-container` must report the SAME position for one surface, which is what lets an author waive
 *  both from two adjacent lines instead of hunting two different coordinates. Both identity arms above prove
 *  each position binds; this proves they are the same position. */
test("the two surface policies report the SAME position for one surface", () => {
  const focus = IDENTITY_CASES.find((item) => item.policy === surfaceA11yFocus);
  const container = IDENTITY_CASES.find((item) => item.policy === surfaceInAContainer);
  expect(focus?.path).toBe(container?.path);
  expect(focus?.position).toBe(container?.position);
});

describe("§4.2 identity arms — the reported position IS the waiver position, and it discriminates", () => {
  for (const item of IDENTITY_CASES) {
    test(`${item.policy.id}: the correct marker at the reported position suppresses`, ({ scratch }) => {
      const marker = `// @orb-waive ${item.policy.id}(${item.position}): the arm's stand-in reason; ends when this fixture stops flagging.\n`;
      const result = pass(item.policy, scratch, { ...item.extra, [item.path]: item.body(marker) });

      expect(result.toolErrors).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(result.authority.waivedFindings).toHaveLength(1);
      expect(result.authority.authorityAlarms).toEqual([]);
    });

    test(`${item.policy.id}: a marker naming a DEAD position alarms instead of suppressing`, ({ scratch }) => {
      const marker = `// @orb-waive ${item.policy.id}(${item.deadPosition}): a position this fixture does not report.\n`;
      const result = pass(item.policy, scratch, { ...item.extra, [item.path]: item.body(marker) });

      // THE DISCRIMINATION CONTROL. Without it, "my arm is green" is not "my arm discriminates" — a marker
      // that bound to anything would pass the arm above just as well.
      expect(result.authority.waivedFindings).toEqual([]);
      expect(result.authority.authorityAlarms.map((alarm) => alarm.message).join("\n")).toContain("dead position");
    });
  }
});

// ── §4.5 REFUSALS ───────────────────────────────────────────────────────────────────────────────────

describe("§4.5 — an empty source population refuses instead of passing", () => {
  test("an EMPTY population refuses — this IS the retired `surface-a11y-focus` blindness tripwire", ({ scratch }) => {
    // Legacy carried a hand-rolled arm (`featuresSeen && surfacesSeen === 0` reporting at a DIRECTORY path)
    // against `surfaces/` being renamed out from under a directory-name-keyed scan. Under this contract the
    // same failure is the runtime's: a declared population that admits nothing is a refusal, not a pass.
    const result = pass(surfaceA11yFocus, scratch, { "packages/client/src/data/not-a-surface.ts": "export const x = 1;\n" });

    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.toolErrors.map((error) => error.phase)).toEqual(["population"]);
    expect(result.authority.withheldPolicyIds).toContain(surfaceA11yFocus.id);
  });
});

describe("§4.5 — the installed-surface READER's own blindness, which no proof row can reach", () => {
  // Shared CSS and vendor consumers still depend on this declared-path acquisition.
  test("an anchorless declaration set derives NOTHING rather than an empty surface", () => {
    expect(installedPackageRootOf(["/tmp/nowhere/x.d.ts"])).toBeUndefined();
    expect(installedSurfaceFrom(["/tmp/nowhere/x.d.ts"], "9.9.9")).toBeUndefined();
  });

  test("the derivation is DRIVEN BY the declared paths — dropping one component's entry drops that component", ({ repoRoot }) => {
    const ast = loadInstalledPackage(repoRoot, { id: "base-ui", mode: "ast" });
    const metadata = loadInstalledPackage(repoRoot, { id: "base-ui", mode: "metadata" });
    expect(ast.status).toBe("ready");
    expect(metadata.status).toBe("ready");
    if (ast.status !== "ready" || ast.value.mode !== "ast" || metadata.status !== "ready" || metadata.value.mode !== "metadata") {
      throw new Error("the installed-package doors must be ready on the real tree");
    }
    const full = installedSurfaceFrom(ast.value.declarationPaths, metadata.value.version);
    if (full === undefined) {
      throw new Error("the installed surface must derive from the real declaration paths");
    }
    expect(full.version).toBe(metadata.value.version);
    expect(Object.hasOwn(full.components, "Select")).toBe(true);

    // THE POSITIVE CONTROL, without which "the paths are the subject" is a sentence rather than a fact: a
    // reader that ignored its argument and re-globbed the package directory would produce the identical
    // surface here.
    const withoutSelect = ast.value.declarationPaths.filter((path) => !path.replaceAll("\\", "/").endsWith("/select/index.d.ts"));
    const cut = installedSurfaceFrom(withoutSelect, metadata.value.version);
    if (cut === undefined) {
      throw new Error("the cut surface must still derive — only `Select` is expected to vanish");
    }
    expect(Object.hasOwn(cut.components, "Select")).toBe(false);
    expect(Object.keys(cut.components)).toHaveLength(Object.keys(full.components).length - 1);
  });
});

// ── §4.6 THE REAL-TREE DRIVE ────────────────────────────────────────────────────────────────────────

describe("the real tree — marker translation, and the conversion differential", () => {
  test("every live marker across both families binds its exact policy, source and token", ({ repoRoot }) => {
    const context = projectCtx(repoRoot);
    const result = runPolicyPass({
      knownPolicies: [...POLICIES],
      policies: [...POLICIES],
      root: repoRoot,
      project: context.project,
      ...nativeTypeFactOptions(context),
      reviewedGrants: [],
      failOnWarnings: false,
    });

    expect(result.toolErrors).toEqual([]);
    // Exact identities catch a lost binding and an unintended new waiver without a stale aggregate count.
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.waivedFindings.map(({ finding }) => `${finding.policyId}:${finding.file}:${finding.token}`).toSorted()).toEqual([
      "surface-a11y-focus:packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx:NewChatPicker",
      "surface-a11y-focus:packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx:CorpusArtifactSurface",
      "surface-a11y-focus:packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx:CorpusHomeSurface",
      "surface-a11y-focus:packages/client/src/features/discovery/surfaces/corpus-moment-surface.tsx:CorpusMomentSurface",
      "surface-a11y-focus:packages/client/src/features/tag/surfaces/tag-member-surface.tsx:TagMemberSurface",
    ]);
    expect(result.authority.authorityAlarms.filter((alarm) => POLICY_IDS.has(alarm.policyId))).toEqual([]);
  });

  test("the original surface waivers retain their authored positions and have no legacy marker", ({ repoRoot }) => {
    const sites = [
      "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx",
      "packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx",
    ];
    const texts = sites.map((rel) => readFileSync(join(repoRoot, rel), "utf8"));

    expect(texts.map((text) => text.split("\n").filter((line) => line.trimStart().startsWith("// @orb-waive surface-a11y-focus(")).length)).toEqual([1, 1]);
    expect(texts.map((text) => text.split("\n").filter((line) => line.trimStart().startsWith("// @surface-focus-elsewhere")).length)).toEqual([0, 0]);
  });
});
