// The single-pass ITEMIZED parity net (TSMORPH-SINGLE-PASS-AUDIT.md §8.2 + owner ruling 4): because the
// NEW dispatcher (pass.ts) is deliberately PER-TOKEN (one finding per offending class token), it emits
// MORE findings than the collapsed LEGACY per-SITE `Check`. Byte-identical is the WRONG bar. The proof
// shifts to the SITE SET: map each per-token finding up to its site (file, line) and assert that set is
// IDENTICAL to the set of sites the legacy gate caught. A new path that MISSES a legacy site is a FAIL;
// extra token-granularity WITHIN a caught site is expected and correct. During the migration each ported
// gate adds its dirty-tree case here.
//
// biome-ignore-all lint/security/noSecrets: the dirty-tree fixtures are TS/JSX source snippets (long
// identifier runs the entropy heuristic false-fires on), not secrets.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { Finding, GateDescriptor } from "../../scripts/check/contract.ts";
import {
  assetRefsFkCoverage,
  gate as assetRefsFkCoverageGate,
} from "../../scripts/check/gates/asset-refs-fk-coverage.ts";
import {
  assumesSingleReplica,
  gate as assumesSingleReplicaGate,
} from "../../scripts/check/gates/assumes-single-replica.ts";
import {
  auditClientTests,
  gate as auditClientTestsGate,
} from "../../scripts/check/gates/audit-client-tests.ts";
import {
  baselineSingleMigration,
  gate as baselineSingleMigrationGate,
} from "../../scripts/check/gates/baseline-single-migration.ts";
import { busCoverage, gate as busCoverageGate } from "../../scripts/check/gates/bus-coverage.ts";
import {
  gate as busOnDataGate,
  busOnDataNoStoreWrite,
} from "../../scripts/check/gates/bus-onData-no-store-write.ts";
import {
  clientStructure,
  gate as clientStructureGate,
} from "../../scripts/check/gates/client-structure.ts";
import {
  commentedCode,
  gate as commentedCodeGate,
} from "../../scripts/check/gates/commented-code.ts";
import {
  componentSize,
  gate as componentSizeGate,
} from "../../scripts/check/gates/component-size.ts";
import {
  componentSizeUi,
  gate as componentSizeUiGate,
} from "../../scripts/check/gates/component-size-ui.ts";
import {
  contentPartSeam,
  gate as contentPartSeamGate,
} from "../../scripts/check/gates/content-part-seam.ts";
import {
  contractVerbPresence,
  gate as contractVerbPresenceGate,
} from "../../scripts/check/gates/contract-verb-presence.ts";
import {
  dbEnumFromTuple,
  gate as dbEnumGate,
} from "../../scripts/check/gates/db-enum-from-tuple.ts";
import { dbStructure, gate as dbStructureGate } from "../../scripts/check/gates/db-structure.ts";
import { gate as diagnosticLegibilityGate } from "../../scripts/check/gates/diagnostic-legibility.ts";
import {
  createEmptyStateHasAction,
  gate as emptyStateGate,
} from "../../scripts/check/gates/empty-state-has-action.ts";
import { gate as enforcementRegistryParityGate } from "../../scripts/check/gates/enforcement-registry-parity.ts";
import {
  featureStructure,
  gate as featureStructureGate,
} from "../../scripts/check/gates/feature-structure.ts";
import {
  formFactoryForMultifield,
  gate as formFactoryForMultifieldGate,
} from "../../scripts/check/gates/form-factory-for-multifield.ts";
import {
  gate as infraAuthGate,
  infraAuthNoUserId,
} from "../../scripts/check/gates/infra-auth-no-userid.ts";
import {
  memberCardClamped,
  gate as memberCardGate,
} from "../../scripts/check/gates/member-card-clamped.ts";
import {
  membershipEnforcer,
  gate as membershipGate,
} from "../../scripts/check/gates/membership-enforcer.ts";
import {
  gate as modalBodyGate,
  modalBodyNotPlaceholder,
} from "../../scripts/check/gates/modal-body-not-placeholder.ts";
import {
  monotonicTests,
  gate as monotonicTestsGate,
} from "../../scripts/check/gates/monotonic-tests.ts";
import {
  createMotionTokenPurity,
  gate as motionTokenPurityGate,
} from "../../scripts/check/gates/motion-token-purity.ts";
import {
  createNoArbitraryTwValues,
  gate as noArbitraryTwGate,
} from "../../scripts/check/gates/no-arbitrary-tw-values.ts";
import {
  gate as noArrayLiteralGate,
  noArrayLiteralQuerykey,
} from "../../scripts/check/gates/no-array-literal-querykey.ts";
import {
  noCallerUserId,
  gate as noCallerUserIdGate,
} from "../../scripts/check/gates/no-caller-user-id.ts";
import {
  noDirectUsersRead,
  gate as noDirectUsersReadGate,
} from "../../scripts/check/gates/no-direct-users-read.ts";
import {
  gate as noEffectGate,
  noEffectOnSharedSelection,
} from "../../scripts/check/gates/no-effect-on-shared-selection.ts";
import {
  gate as noFormResetGate,
  noFormResetInAutosave,
} from "../../scripts/check/gates/no-form-reset-in-autosave.ts";
import {
  gate as noInlineInvalidateGate,
  noInlineInvalidateOutsideSeam,
} from "../../scripts/check/gates/no-inline-invalidate-outside-seam.ts";
import {
  gate as noInlineUnionGate,
  noInlineUnionRedecl,
} from "../../scripts/check/gates/no-inline-union-redecl.ts";
import {
  createNoInteractiveRoleInFeatures,
  gate as noInteractiveRoleGate,
} from "../../scripts/check/gates/no-interactive-role-in-features.ts";
import {
  createNoOffTokenInlineStyle,
  gate as inlineStyleGate,
} from "../../scripts/check/gates/no-off-token-inline-style.ts";
import {
  createNoOffTokenRadiusShadow,
  gate as offTokenGate,
} from "../../scripts/check/gates/no-off-token-radius-shadow.ts";
import { noRawEgress, gate as noRawEgressGate } from "../../scripts/check/gates/no-raw-egress.ts";
import {
  createNoRawInteractiveIntrinsics,
  gate as noRawIntrinsicsGate,
} from "../../scripts/check/gates/no-raw-interactive-intrinsics.ts";
import {
  createNoTestFabrication,
  gate as noTestFabricationGate,
} from "../../scripts/check/gates/no-test-fabrication.ts";
import {
  createNoUntypedSoftRef,
  gate as noUntypedSoftRefGate,
  SOFT_REF_ALLOWLIST,
} from "../../scripts/check/gates/no-untyped-soft-ref.ts";
import {
  gate as ownerRoleGate,
  ownerRoleSplit,
} from "../../scripts/check/gates/owner-role-split.ts";
import {
  createOwnerIdRegistry,
  OWNERID_ALLOWLIST,
  gate as ownerIdRegistryGate,
} from "../../scripts/check/gates/ownerid-registry.ts";
import {
  packageLayout,
  gate as packageLayoutGate,
} from "../../scripts/check/gates/package-layout.ts";
import {
  pdCitationIntegrity,
  gate as pdCitationIntegrityGate,
} from "../../scripts/check/gates/pd-citation-integrity.ts";
import {
  persistPartializeAndTotalMigrate,
  gate as persistPartializeAndTotalMigrateGate,
} from "../../scripts/check/gates/persist-partialize-and-total-migrate.ts";
import {
  persistenceBoundary,
  gate as persistenceBoundaryGate,
} from "../../scripts/check/gates/persistence-boundary.ts";
import {
  placeholderCopyRegistry,
  gate as placeholderCopyRegistryGate,
} from "../../scripts/check/gates/placeholder-copy-registry.ts";
import {
  providersRunnerSeal,
  gate as providersRunnerSealGate,
} from "../../scripts/check/gates/providers-runner-seal.ts";
import {
  registryPairing,
  gate as registryPairingGate,
} from "../../scripts/check/gates/registry-pairing.ts";
import {
  schemaBannedShapes,
  gate as schemaBannedShapesGate,
} from "../../scripts/check/gates/schema-banned-shapes.ts";
import {
  schemaBranding,
  gate as schemaBrandingGate,
} from "../../scripts/check/gates/schema-branding.ts";
import { serverLayout, gate as serverLayoutGate } from "../../scripts/check/gates/server-layout.ts";
import {
  soleEnvReader,
  gate as soleEnvReaderGate,
} from "../../scripts/check/gates/sole-env-reader.ts";
import { stateFiles, gate as stateFilesGate } from "../../scripts/check/gates/state-files.ts";
import {
  surfaceInAContainer,
  gate as surfaceInAContainerGate,
} from "../../scripts/check/gates/surface-in-a-container.ts";
import {
  testDeterminism,
  gate as testDeterminismGate,
} from "../../scripts/check/gates/test-determinism.ts";
import {
  testFactoryContract,
  gate as testFactoryContractGate,
} from "../../scripts/check/gates/test-factory-contract.ts";
import {
  testFixtureImports,
  gate as testFixtureImportsGate,
} from "../../scripts/check/gates/test-fixture-imports.ts";
import { testLayout, gate as testLayoutGate } from "../../scripts/check/gates/test-layout.ts";
import {
  testMockDoctrine,
  gate as testMockDoctrineGate,
} from "../../scripts/check/gates/test-mock-doctrine.ts";
import { testNoStubs, gate as testNoStubsGate } from "../../scripts/check/gates/test-no-stubs.ts";
import { testPresence, gate as testPresenceGate } from "../../scripts/check/gates/test-presence.ts";
import {
  testPresenceClient,
  gate as testPresenceClientGate,
} from "../../scripts/check/gates/test-presence-client.ts";
import { turnIdentity, gate as turnIdentityGate } from "../../scripts/check/gates/turn-identity.ts";
import {
  typesInContract,
  gate as typesInContractGate,
} from "../../scripts/check/gates/types-in-contract.ts";
import {
  uiPrimitiveStructure,
  gate as uiPrimitiveStructureGate,
} from "../../scripts/check/gates/ui-primitive-structure.ts";
import {
  userBusCoverage,
  gate as userBusCoverageGate,
} from "../../scripts/check/gates/user-bus-coverage.ts";
import {
  vectorScopeDerived,
  gate as vectorScopeGate,
} from "../../scripts/check/gates/vector-scope-derived.ts";
import { verbNaming, gate as verbNamingGate } from "../../scripts/check/gates/verb-naming.ts";
import {
  warningCodeCoverage,
  gate as warningCodeGate,
} from "../../scripts/check/gates/warning-code-coverage.ts";
import {
  gate as zustandGate,
  zustandSelectorDerived,
} from "../../scripts/check/gates/zustand-selector-derived.ts";
import type { Check } from "../../scripts/check/harness.ts";
import { canonicalSort, runPass } from "../../scripts/check/pass.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = "/repo";

function inMemoryProject(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${rel}`, text);
  }
  return project;
}

/** A gate's caught SITES = the set of (file, line) it flagged, de-duplicated + sorted. This is the
 *  itemized oracle's currency: the legacy per-site count and the new per-token count differ, but the
 *  SITE set must be identical. */
function compareStr(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Normalize a finding's file path to repo-relative. A few legacy test-dir gates (test-no-stubs,
 *  test-fixture-imports, test-mock-doctrine) emit the ABSOLUTE ts-morph path; the single-pass contract
 *  standardizes on repo-relative (repoRel). Stripping the `/repo/` prefix lets the two site-sets compare
 *  on the canonical form — the abs-path is the quirk the port corrects, not a finding-set difference. */
function repoRelFile(file: string): string {
  return file.startsWith(`${ROOT}/`) ? file.slice(ROOT.length + 1) : file;
}

function siteSet(items: ReadonlyArray<{ readonly file: string; readonly line: number }>): string[] {
  return [...new Set(items.map((i) => `${repoRelFile(i.file)}:${i.line}`))].sort(compareStr);
}

/** Run the NEW dispatcher for one descriptor over a project and return its findings. */
function runNew(gate: GateDescriptor, project: Project): readonly Finding[] {
  const result = runPass([gate], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return result.gates.find((g) => g.name === gate.name)?.findings ?? [];
}

/** The itemized-parity currency for one gate over one tree: the SITE set the LEGACY per-site Check
 *  caught, and the SITE set the NEW per-token dispatcher caught (each per-token finding mapped up to its
 *  (file, line)). The test body asserts `newSites === legacySites` + pins the count (so a both-empty pass
 *  can't masquerade as parity). Returned (not asserted here) so each test carries its own expect(). */
function itemizedSites(
  legacy: Check,
  gate: GateDescriptor,
  tree: Readonly<Record<string, string>>,
): { readonly legacySites: string[]; readonly newSites: string[] } {
  const legacyViolations = legacy.run({ root: ROOT, project: inMemoryProject(tree) });
  const newFindings = canonicalSort(runNew(gate, inMemoryProject(tree)));
  return { legacySites: siteSet(legacyViolations), newSites: siteSet(newFindings) };
}

/** The itemized-parity currency for an `fsBacked` gate: materialize the tree into a real auto-cleaned
 *  temp dir (both the legacy Check and the NEW dispatcher read the real fs via ctx.root), run both rooted
 *  there, and compare site-sets. Findings are file-level (line 0) for these fs gates. */
function itemizedSitesFs(
  legacy: Check,
  gate: GateDescriptor,
  tree: Readonly<Record<string, string>>,
): { readonly legacySites: string[]; readonly newSites: string[] } {
  const root = mkdtempSync(join(tmpdir(), "orb-parity-"));
  try {
    for (const [rel, text] of Object.entries(tree)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([`${root}/**/*.ts`, `${root}/**/*.tsx`]);
    const legacyViolations = legacy.run({ root, project });
    const newResult = runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    const newFindings = canonicalSort(
      newResult.gates.find((g) => g.name === gate.name)?.findings ?? [],
    );
    // fs gates emit repo-relative file-level paths already; strip the temp root if any leaked.
    const norm = (f: string): string => (f.startsWith(`${root}/`) ? f.slice(root.length + 1) : f);
    const legacySites = [...new Set(legacyViolations.map((v) => `${norm(v.file)}:${v.line}`))].sort(
      compareStr,
    );
    const newSites = [...new Set(newFindings.map((f) => `${norm(f.file)}:${f.line}`))].sort(
      compareStr,
    );
    return { legacySites, newSites };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── no-off-token-radius-shadow (the reference gate) ─────────────────────────────────────────────
// A deliberately-dirty tree: a className with TWO banned tokens (rounded-lg + shadow-md → TWO per-token
// findings, ONE site), a variant-prefixed hover:shadow-lg, an interpolated tv() template PART, and the
// near-misses that must NOT fire (UI copy outside a class site, the none/drop-shadow opt-outs, an
// out-of-scanRoot server file).
const OFF_TOKEN_TREE: Readonly<Record<string, string>> = {
  "packages/ui/src/a/a.tsx": 'export const A = <div className="rounded-lg shadow-md" />;\n',
  "packages/client/src/features/b/b.tsx": 'export const B = <div className="hover:shadow-lg" />;\n',
  "packages/ui/src/c/variants.ts":
    "export const C = tv({ base: `rounded-card shadow-lg ${MOTION}` });\n",
  "packages/client/src/features/d/copy.ts": 'export const label = "Prose shadow";\n',
  "packages/ui/src/e/e.tsx":
    'export const E = <div className="rounded-none shadow-none drop-shadow-sm" />;\n',
  "packages/server/src/x/x.ts": 'export const X = "shadow-md";\n',
};

test("no-off-token-radius-shadow: NEW per-token site-set == LEGACY per-site set (itemized parity)", () => {
  // 3 offending SITES (a.tsx, b.tsx, c/variants.ts); the near-misses stay clean.
  const { legacySites, newSites } = itemizedSites(
    createNoOffTokenRadiusShadow({}),
    offTokenGate,
    OFF_TOKEN_TREE,
  );
  expect(legacySites).toHaveLength(3);
  expect(newSites).toEqual(legacySites);
});

test("no-off-token-radius-shadow: the two-token className is ONE site but TWO per-token findings", () => {
  const findings = canonicalSort(runNew(offTokenGate, inMemoryProject(OFF_TOKEN_TREE)));
  const twoTokenSite = findings.filter((f) => f.file === "packages/ui/src/a/a.tsx");
  expect(twoTokenSite).toHaveLength(2);
  const tokens = twoTokenSite.map((f) => f.token ?? "").sort(compareStr);
  expect(tokens).toEqual(["rounded-lg", "shadow-md"]);
  // Distinct columns — each finding lands on its own token, not the enclosing string.
  expect(twoTokenSite[0]?.column).not.toBe(twoTokenSite[1]?.column);
});

test("no-off-token-radius-shadow: clean tree yields no sites either way", () => {
  const clean = {
    "packages/ui/src/ok/ok.tsx": 'export const OK = <div className="rounded-card" />;\n',
  };
  const { legacySites, newSites } = itemizedSites(
    createNoOffTokenRadiusShadow({}),
    offTokenGate,
    clean,
  );
  expect(legacySites).toHaveLength(0);
  expect(newSites).toEqual(legacySites);
});

test("every ported finding carries a node-derived line+column (1-based), never 0", () => {
  const findings = runNew(offTokenGate, inMemoryProject(OFF_TOKEN_TREE));
  expect(findings.length).toBeGreaterThan(0);
  for (const f of findings) {
    expect(f.line).toBeGreaterThanOrEqual(1);
    expect(f.column).toBeGreaterThanOrEqual(1);
  }
});

// ── first batch (§8.1 (a) single-kind sweeps) ────────────────────────────────────────────────────
// Each gate's dirty tree hits its offending site(s); the near-misses (comment/string mentions, exempt
// dirs, out-of-scope files) must stay clean, exactly as the legacy Check.

test("no-caller-user-id: itemized parity (per-identifier)", () => {
  const tree = {
    "packages/server/src/domain/chat/engine/x.ts":
      "export function f(callerUserId: string) {\n  return callerUserId;\n}\n",
    "packages/server/src/domain/other/y.ts":
      "// callerUserId is banned (D19)\nexport const y = 1;\n",
  };
  // TWO sites: param (line 1) + use (line 2). The comment mention stays clean.
  const { legacySites, newSites } = itemizedSites(noCallerUserId, noCallerUserIdGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("infra-auth-no-userid: itemized parity (userId identifier under infra/auth only)", () => {
  const tree = {
    "packages/server/src/infra/auth/modes/thing.ts": "export function f(userId: string) {}\n",
    "packages/server/src/domain/sessions/verbs/validate.ts":
      "export function g(userId: string) {}\n",
    "packages/server/src/infra/auth/notes.ts":
      "// resolves NO userId here (invariant)\nexport const x = 1;\n",
  };
  // ONE site: the identifier under infra/auth. The domain file + the comment mention stay clean.
  const { legacySites, newSites } = itemizedSites(infraAuthNoUserId, infraAuthGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-direct-users-read: itemized parity (users import outside sessions/admin)", () => {
  const tree = {
    "packages/server/src/domain/billing/x.ts":
      'import { users } from "@orb/db";\nexport const u = users;\n',
    "packages/server/src/domain/sessions/y.ts":
      'import { users } from "@orb/db";\nexport const u2 = users;\n',
  };
  // ONE site: the billing import. The sessions import is exempt.
  const { legacySites, newSites } = itemizedSites(noDirectUsersRead, noDirectUsersReadGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("turn-identity: itemized parity (Principal import + principal identifier in engine)", () => {
  const tree = {
    "packages/server/src/domain/chat/engine/a.ts":
      'import { Principal } from "@orb/contracts/identity";\nexport const p: Principal = null as never;\n',
    "packages/server/src/domain/chat/engine/b.ts": "export function h(principal: unknown) {}\n",
    "packages/server/src/domain/chat/verbs/c.ts": "export function ok(principal: unknown) {}\n",
  };
  // TWO sites: the Principal import (a.ts:1) + the lowercase `principal` identifier (b.ts:1). The
  // uppercase type-usage `Principal` (a.ts:2) is NOT the identifier arm (only lowercase); the verb file
  // (outside engine/) stays clean.
  const { legacySites, newSites } = itemizedSites(turnIdentity, turnIdentityGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-array-literal-querykey: itemized parity (inline array queryKey in client)", () => {
  const tree = {
    "packages/client/src/features/a/data.ts":
      'export const q = { queryKey: ["users", 1] };\nexport const ok = { queryKey: readKey };\n',
    "packages/server/src/x.ts": 'export const s = { queryKey: ["not-client"] };\n',
  };
  // ONE site: the client inline-array queryKey. The identifier passthrough + the server file stay clean.
  const { legacySites, newSites } = itemizedSites(noArrayLiteralQuerykey, noArrayLiteralGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("content-part-seam: itemized parity (ChatContentPart import outside the seam set)", () => {
  const tree = {
    "packages/server/src/domain/chat/verbs/assemble.ts":
      'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type T = ChatContentPart;\n',
    "packages/server/src/infra/providers/backends/kit/map.ts":
      'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
  };
  // ONE site: the upstream verb import. The infra/providers consumer is sanctioned.
  const { legacySites, newSites } = itemizedSites(contentPartSeam, contentPartSeamGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 2 (§8.1 (a) — the remaining single-kind sweeps + reference-gate-shape ratchets) ─────────

test("no-raw-egress: itemized parity (bare fetch + corsproxy literal, two arms one gate)", () => {
  const raw = 'export async function f() {\n  return await fetch("https://x");\n}\n';
  const tree = {
    "packages/server/src/domain/hub/verbs/browse.ts": raw,
    "packages/server/src/infra/providers/vllm/engine/client.ts": raw,
    "packages/server/src/domain/hub/lib/x.ts":
      'export const proxy = "https://corsproxy.io/?url=";\n',
    "packages/client/src/x.ts": raw,
  };
  // TWO sites: the bare fetch in domain/hub + the corsproxy literal. The sanctioned vLLM fetch + the
  // client file stay clean.
  const { legacySites, newSites } = itemizedSites(noRawEgress, noRawEgressGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("sole-env-reader: itemized parity (process.env access outside foundation/env)", () => {
  const tree = {
    "packages/server/src/domain/hub/x.ts": "export const a = process.env.SOME_VAR;\n",
    "packages/server/src/domain/hub/y.ts": 'export const b = process["env"].OTHER;\n',
    "packages/server/src/foundation/env/index.ts": "export const env = process.env;\n",
    "packages/server/src/domain/hub/z.ts":
      "// process.env only in foundation/env\nexport const c = 1;\n",
  };
  // TWO sites: the property-form + the bracket-trick read. foundation/env is exempt; the comment is clean.
  const { legacySites, newSites } = itemizedSites(soleEnvReader, soleEnvReaderGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("zustand-selector-derived: itemized parity (fresh-derivation selectors in client)", () => {
  const decl =
    "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n";
  const tree = {
    "packages/client/src/state/obj.ts": `${decl}export const v = useXStore((s) => ({ a: s.a, b: s.b }));\n`,
    "packages/client/src/state/ok.ts": `${decl}export const w = useXStore((s) => s.a);\n`,
    "packages/server/src/x.ts": `${decl}export const z = useXStore((s) => ({ a: s.a, b: s.b }));\n`,
  };
  // ONE site: the fresh-object selector in client/state. The single-field selector + the server file (out
  // of scanRoot) stay clean.
  const { legacySites, newSites } = itemizedSites(zustandSelectorDerived, zustandGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-inline-invalidate-outside-seam: itemized parity (loose invalidateQueries in client)", () => {
  const tree = {
    "packages/client/src/features/a/mutation.ts":
      "export function f(qc: { invalidateQueries: () => void }) {\n  qc.invalidateQueries();\n}\n",
    "packages/client/src/data/invalidation.ts":
      "export function seam(qc: { invalidateQueries: () => void }) {\n  qc.invalidateQueries();\n}\n",
  };
  // ONE site: the loose call in a feature. The ONE seam file (data/invalidation.ts) is exempt.
  const { legacySites, newSites } = itemizedSites(
    noInlineInvalidateOutsideSeam,
    noInlineInvalidateGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-off-token-inline-style: itemized parity (raw-literal JSX + imperative inline style)", () => {
  const tree = {
    "packages/client/src/features/demo/components/thing.tsx":
      'export const G = <div style={{ borderRadius: "8px" }} />;\n',
    "packages/ui/src/primitives/demo/demo.ts":
      'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "8px";\n}\n',
    "packages/client/src/features/demo/components/ok.tsx":
      'export const K = <div style={{ borderRadius: "var(--radius-card)" }} />;\n',
    "packages/server/src/x.tsx": 'export const S = <div style={{ borderRadius: "8px" }} />;\n',
  };
  // TWO sites: the JSX raw-literal + the imperative assignment. The var(--…) value + the server file stay
  // clean. Legacy driven with an EMPTY allowlist (factory) — matches the gate's empty live ALLOWLIST.
  const { legacySites, newSites } = itemizedSites(
    createNoOffTokenInlineStyle({}),
    inlineStyleGate,
    tree,
  );
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-interactive-role-in-features: itemized parity (hand-rolled widget role in a feature)", () => {
  const tree = {
    "packages/client/src/features/demo/thing.tsx":
      'export const G = <Row role="button" tabIndex={0} />;\n',
    "packages/client/src/features/demo/structural.tsx": 'export const S = <div role="list" />;\n',
    "packages/ui/src/primitives/list-row/list-row.tsx": 'export const L = <div role="button" />;\n',
  };
  // ONE site: the widget role in a feature. The structural role + the @orb/ui seal (out of scanRoot) stay
  // clean. Legacy driven with an EMPTY BURN_DOWN (factory) — matches the gate's empty live registry.
  const { legacySites, newSites } = itemizedSites(
    createNoInteractiveRoleInFeatures({}),
    noInteractiveRoleGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 3 (§8.1 (a) remaining + (b) multi-kind per-node) ────────────────────────────────────────

test("membership-enforcer: itemized parity (owner-equality + fetchOwned import in chat scope)", () => {
  const tree = {
    "packages/server/src/domain/chat/verbs/x.ts":
      "export const bad = (x: { ownerId: string }, y: string) => x.ownerId === y;\n",
    "packages/server/src/domain/chat/verbs/y.ts":
      'import { fetchOwned } from "@orb/db";\nexport const f = fetchOwned;\n',
    "packages/server/src/domain/chat/verbs/z.ts":
      'export const host = (r: { role: string }) => r.role === "host";\n',
  };
  // TWO sites: the owner-equality comparison + the fetchOwned import. The role==="host" lookup is clean.
  const { legacySites, newSites } = itemizedSites(membershipEnforcer, membershipGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-arbitrary-tw-values: NEW per-token site-set == LEGACY per-site set (itemized parity)", () => {
  const tree = {
    "packages/client/src/features/x/x.tsx":
      'export const A = <div className="w-[137px] p-[7px]" />;\n',
    "packages/ui/src/y/y.tsx": 'export const B = <div className="hover:w-[137px]" />;\n',
    "packages/client/src/features/x/ok.tsx":
      'export const K = <div className="w-[var(--sidebar-width)]" />;\n',
    "packages/server/src/x.tsx": 'export const S = <div className="w-[137px]" />;\n',
  };
  // TWO sites (x.tsx with two tokens = ONE site + two per-token findings; y.tsx). The var(--…) body + the
  // server file stay clean. Legacy driven with an EMPTY allowlist (factory) — matches the reference-gate
  // pattern (the live non-empty ALLOWLIST arm is exercised by conformance, not this parity fixture).
  const { legacySites, newSites } = itemizedSites(
    createNoArbitraryTwValues({}),
    noArbitraryTwGate,
    tree,
  );
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-arbitrary-tw-values: the two-token className is ONE site but TWO per-token findings", () => {
  const findings = canonicalSort(
    runNew(
      noArbitraryTwGate,
      inMemoryProject({
        "packages/client/src/features/x/x.tsx":
          'export const A = <div className="w-[137px] p-[7px]" />;\n',
      }),
    ),
  );
  expect(findings).toHaveLength(2);
  const tokens = findings.map((f) => f.token ?? "").sort(compareStr);
  expect(tokens).toEqual(["p-[7px]", "w-[137px]"]);
  expect(findings[0]?.column).not.toBe(findings[1]?.column);
});

test("no-raw-interactive-intrinsics: itemized parity (raw intrinsic in a feature)", () => {
  const tree = {
    "packages/client/src/features/demo/thing.tsx":
      'export const G = <button type="button">Go</button>;\n',
    "packages/client/src/features/demo/link.tsx": 'export const L = <a href="/x">go</a>;\n',
    "packages/client/src/features/demo/anchor.tsx": "export const N = <a>anchor</a>;\n",
    "packages/client/src/features/app-shell/thing.tsx":
      'export const S = <button type="button">Shell</button>;\n',
  };
  // TWO sites: the raw <button> + the <a href>. The hrefless <a> + the app-shell button (exempt) stay
  // clean. Legacy driven with an EMPTY BURN_DOWN (factory).
  const { legacySites, newSites } = itemizedSites(
    createNoRawInteractiveIntrinsics({}),
    noRawIntrinsicsGate,
    tree,
  );
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-effect-on-shared-selection: itemized parity (effect keyed on a selection pointer)", () => {
  const effectDecl = "declare function useEffect(f: () => void, d: unknown[]): void;\n";
  const tree = {
    "packages/client/src/features/chat/hooks/x.ts": `declare function useActiveChatId(): string;\n${effectDecl}export function C() {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n`,
    "packages/client/src/features/chat/hooks/ok.ts": `${effectDecl}export function C(props: { chatId: string }) {\n  useEffect(() => {}, [props.chatId]);\n}\n`,
    "packages/client/src/features/app-shell/x.ts": `declare function useActiveChatId(): string;\n${effectDecl}export function S() {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n`,
  };
  // ONE site: the effect keyed on a selection pointer. The prop-depped effect + the app-shell (exempt)
  // stay clean.
  const { legacySites, newSites } = itemizedSites(noEffectOnSharedSelection, noEffectGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("bus-onData-no-store-write: itemized parity (.setState inside an onData handler)", () => {
  const tree = {
    "packages/client/src/data/bus/use-chat-bus.ts":
      "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n",
    "packages/client/src/data/bus/use-chat-bus-ok.ts":
      "export const sub2 = {\n  onData: () => {\n    applyChatBusEvent({});\n  },\n};\n",
  };
  // ONE site: the .setState inside onData. The reducer-routing handler is clean.
  const { legacySites, newSites } = itemizedSites(busOnDataNoStoreWrite, busOnDataGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("assumes-single-replica: itemized parity (module-scope new Map without the annotation)", () => {
  const tree = {
    "packages/server/src/domain/hub/x.ts": "export const cache = new Map<string, number>();\n",
    "packages/server/src/domain/hub/y.ts":
      "// ASSUMES(single-replica): per-process cache\nexport const cache2 = new Map<string, number>();\n",
    "packages/server/src/persistence/z.ts": "export const cache3 = new Map<string, number>();\n",
  };
  // ONE site: the unannotated module-scope Map. The annotated file + persistence/ (exempt) stay clean.
  const { legacySites, newSites } = itemizedSites(
    assumesSingleReplica,
    assumesSingleReplicaGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("empty-state-has-action: itemized parity (dead-end EmptyState in a feature)", () => {
  const tree = {
    "packages/client/src/features/demo/thing.tsx":
      'export const G = <EmptyState title="Nothing here" />;\n',
    "packages/client/src/features/demo/ok.tsx":
      'export const K = <EmptyState title="x" action={<Button>Go</Button>} />;\n',
    "packages/ui/src/x/x.tsx": 'export const U = <EmptyState title="y" />;\n',
  };
  // ONE site: the dead-end EmptyState in a feature. The action-carrying render + the ui/ file (out of
  // scanRoot) stay clean. Legacy driven with an EMPTY allowlist (factory).
  const { legacySites, newSites } = itemizedSites(
    createEmptyStateHasAction({}),
    emptyStateGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 4 (§8.1 (b) multi-kind per-node + a visitFile presence gate) ────────────────────────────

test("owner-role-split: itemized parity (global-role literal comparison in server src)", () => {
  const tree = {
    "packages/server/src/domain/hub/x.ts":
      'export const isOwner = (r: { role: string }) => r.role === "owner";\n',
    "packages/server/src/domain/hub/y.ts":
      'export const isHost = (r: { role: string }) => r.role === "host";\n',
    "packages/server/src/domain/admin/guard.ts":
      'export const g = (r: { role: string }) => r.role === "admin";\n',
  };
  // ONE site: the owner comparison in a non-guard file. The host comparison + the guard file (exempt)
  // stay clean.
  const { legacySites, newSites } = itemizedSites(ownerRoleSplit, ownerRoleGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("db-enum-from-tuple: itemized parity (inline-array enum config in a schema file)", () => {
  const tree = {
    "packages/db/src/schema/x.ts":
      'export const t = sqliteTable("t", { k: text("k", { enum: ["a", "b"] }) });\n',
    "packages/db/src/schema/y.ts":
      'import { KINDS } from "@orb/contracts";\nexport const t2 = sqliteTable("t2", { k: text("k", { enum: KINDS }) });\n',
    "packages/server/src/x.ts": "export const q = { enum: [1, 2] };\n",
  };
  // ONE site: the inline-array enum in a schema file. The imported-tuple enum + the non-schema file stay
  // clean.
  const { legacySites, newSites } = itemizedSites(dbEnumFromTuple, dbEnumGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("modal-body-not-placeholder: itemized parity (placeholder render without the flag)", () => {
  const tree = {
    "packages/client/src/features/x/lib/modal-slots.tsx":
      "export const MODAL_SLOTS = {\n  theme: { render: () => <SectionPlaceholder /> },\n  built: { placeholder: true, render: () => <SectionPlaceholder /> },\n};\n",
  };
  // ONE site: the flagless placeholder entry. The placeholder:true entry is a counted state, clean.
  const { legacySites, newSites } = itemizedSites(modalBodyNotPlaceholder, modalBodyGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("member-card-clamped: itemized parity (three arms — type, clamp, resurrection)", () => {
  const tree = {
    "packages/server/src/domain/character/a.ts":
      "export interface MemberCardView { name: string }\n",
    "packages/server/src/domain/character/b.ts": "export function clampMemberCard() {}\n",
    "packages/server/src/domain/character/c.ts": "export const use = getRosterCardView;\n",
    "packages/contracts/src/chat/card.ts": "export interface MemberCardView { n: string }\n",
    "packages/server/src/domain/chat/substrate/auth/clamp.ts":
      "export function clampMemberCard() {}\n",
  };
  // THREE sites: the stray type + the stray clamp + the resurrected verb. The contracts type + the
  // clamp-home clamp stay clean.
  const { legacySites, newSites } = itemizedSites(memberCardClamped, memberCardGate, tree);
  expect(legacySites).toHaveLength(3);
  expect(newSites).toEqual(legacySites);
});

test("vector-scope-derived: itemized parity (three arms — import, write, cosine)", () => {
  const tree = {
    "packages/server/src/domain/hub/imp.ts":
      'import { chatDigests } from "@orb/db";\nexport const t = chatDigests;\n',
    "packages/server/src/domain/hub/write.ts":
      "export const w = (db: { insert: (t: unknown) => void }) => db.insert(chatSegments);\n",
    "packages/server/src/domain/hub/cos.ts":
      'export const q = "SELECT vector_distance_cos(a, b)";\n',
    "packages/server/src/domain/embeddings/persistence/store.ts":
      'import { chatDigests } from "@orb/db";\nexport const t2 = chatDigests;\n',
    "packages/server/src/domain/search/persistence/read.ts":
      'export const q2 = "vector_distance_cos(x, y)";\n',
  };
  // THREE sites: the stray import + the stray write + the stray cosine literal. The embeddings import +
  // the search cosine (sanctioned) stay clean.
  const { legacySites, newSites } = itemizedSites(vectorScopeDerived, vectorScopeGate, tree);
  expect(legacySites).toHaveLength(3);
  expect(newSites).toEqual(legacySites);
});

test("types-in-contract: itemized parity (service.ts with no exported interface — file-level)", () => {
  const tree = {
    "packages/server/src/domain/hub/contract/service.ts": "export const noInterface = 1;\n",
    "packages/server/src/domain/billing/contract/service.ts":
      "export interface BillingService { list(): void }\n",
  };
  // ONE site: the interface-less service.ts (file-level, line 0). The one with an exported interface is
  // clean.
  const { legacySites, newSites } = itemizedSites(typesInContract, typesInContractGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 5 (§8.1 (b) remainder — per-file visitFile gates + test-dir per-node) ───────────────────

test("state-files: itemized parity (two mints in one flat state file — file-level)", () => {
  const tree = {
    "packages/client/src/state/grab-bag.ts":
      "declare const create: (f: () => unknown) => unknown;\nexport const useA = create(() => ({}));\nexport const useB = create(() => ({}));\n",
    "packages/client/src/state/one.ts":
      "declare const create: (f: () => unknown) => unknown;\nconst useOne = create(() => ({}));\n",
  };
  // TWO sites in grab-bag: line 0 (two mints → the one-mint-per-file arm) + line 2 (the exported mint
  // handle — both useA/useB export their create() result). The single-store file (handle not exported) is
  // clean. This fixture exercises two of the three arms — parity holds across both.
  const { legacySites, newSites } = itemizedSites(stateFiles, stateFilesGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("no-form-reset-in-autosave: itemized parity (.reset in a factory-importing file)", () => {
  const tree = {
    "packages/client/src/features/persona/x.ts":
      'import { createAutosaveEntityForm } from "@orb/x";\nexport function f(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n',
    "packages/client/src/features/persona/y.ts":
      "export function g(personaForm: { reset: (v?: unknown) => void }) {\n  personaForm.reset();\n}\n",
  };
  // ONE site: the .reset in the file importing the autosave factory. The non-importing file is not scanned.
  const { legacySites, newSites } = itemizedSites(noFormResetInAutosave, noFormResetGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-no-stubs: itemized parity (a test with no assertion)", () => {
  const tree = {
    "tests/tooling/stub.test.ts": 'test("does nothing", () => {\n  const x = 1;\n});\n',
    "tests/tooling/real.test.ts": 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n',
  };
  // ONE site: the assertion-less stub test. The real test passes.
  const { legacySites, newSites } = itemizedSites(testNoStubs, testNoStubsGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-fixture-imports: itemized parity (direct vitest import in a test file)", () => {
  const tree = {
    "tests/tooling/direct.test.ts": 'import { test, expect } from "vitest";\n',
    "tests/tooling/ok.test.ts": 'import { test, expect } from "../support/fixtures.ts";\n',
    "tests/support/fixtures.ts": "export const test = 1;\nexport const expect = 2;\n",
  };
  // ONE site: the direct-vitest import (line 1, two banned names → per-token, one site). The fixtures
  // import + the support/ file (exempt) stay clean.
  const { legacySites, newSites } = itemizedSites(testFixtureImports, testFixtureImportsGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-mock-doctrine: itemized parity (vi.mock on an internal module)", () => {
  const tree = {
    "tests/tooling/mock.test.ts": 'vi.mock("../../packages/server/x.ts");\n',
    "tests/tooling/edge.test.ts": 'vi.mock("node:fs");\n',
  };
  // ONE site: the internal-module vi.mock. The node-edge vi.mock is legal.
  const { legacySites, newSites } = itemizedSites(testMockDoctrine, testMockDoctrineGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 6 (§8.1 (c) — collect-then-judge cross-file ratchets) ───────────────────────────────────

test("bus-coverage: itemized parity (a bus member with no server emit site)", () => {
  const tree = {
    "packages/contracts/src/chat/index.ts":
      'export const CHAT_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
    "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
  };
  // ONE site: the missing-emit member (contracts index, line 1). Whole-tree reconciliation, no per-node.
  const { legacySites, newSites } = itemizedSites(busCoverage, busCoverageGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("user-bus-coverage: itemized parity (a user-bus member with no server emit site)", () => {
  const tree = {
    "packages/contracts/src/user-bus/index.ts":
      'export const USER_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
    "packages/server/src/domain/settings/x.ts": 'export const q = "somethingElse";\n',
  };
  // ONE site: the missing-emit member (contracts user-bus index, line 1).
  const { legacySites, newSites } = itemizedSites(userBusCoverage, userBusCoverageGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("persistence-boundary: itemized parity (raw storage + unregistered + stale, door LOADED)", () => {
  // The door file is INCLUDED so the new path's fileLoaded-guarded stale arm fires exactly as the legacy
  // (which has no guard) — both then flag the same 5 stale registry names (→ one gate-self site) plus the
  // raw-storage offender + the unregistered-name offender.
  const tree = {
    "packages/client/src/features/x/x.ts": 'export const a = localStorage.getItem("k");\n',
    "packages/client/src/state/y.ts":
      'export const s = createPersistedStore("unregistered", () => ({}));\n',
    "packages/client/src/state/create-persisted-store.ts": "export const door = 1;\n",
  };
  const { legacySites, newSites } = itemizedSites(
    persistenceBoundary,
    persistenceBoundaryGate,
    tree,
  );
  // raw-storage (x.ts:1) + unregistered (y.ts:1) + the stale registry finding (gate-self:1). = 3 sites.
  expect(legacySites).toHaveLength(3);
  expect(newSites).toEqual(legacySites);
});

test("persistence-boundary: door NOT loaded — new path skips the stale arm (guard is honest)", () => {
  // Without the door file, the new path's stale arm is guarded off; only the per-node offenders fire.
  const tree = {
    "packages/client/src/features/x/x.ts": 'export const a = localStorage.getItem("k");\n',
  };
  const newSites = siteSet(canonicalSort(runNew(persistenceBoundaryGate, inMemoryProject(tree))));
  // ONLY the raw-storage offender — no stale entries (door absent → guard skips).
  expect(newSites).toEqual(["packages/client/src/features/x/x.ts:1"]);
});

test("ownerid-registry: itemized parity (unregistered ownerId + stale, barrel LOADED)", () => {
  // The schema barrel is INCLUDED so the new path's fileLoaded-guarded stale arm fires exactly as the
  // legacy (driven with the LIVE allowlist). Both flag the unregistered stamp + all 21 stale names (→ one
  // schema-dir site).
  const tree = {
    "packages/db/src/schema/x.ts":
      'export const t = sqliteTable("not_allowlisted", { ownerId: text("owner_id") });\n',
    "packages/db/src/schema/index.ts": "export const barrel = 1;\n",
  };
  const { legacySites, newSites } = itemizedSites(
    createOwnerIdRegistry(OWNERID_ALLOWLIST),
    ownerIdRegistryGate,
    tree,
  );
  // the unregistered stamp (x.ts:1) + the stale registry finding (packages/db/src/schema:0). = 2 sites.
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

// ── batch 7 (§8.1 (c) — remaining ratchets: reconciliations + accumulate-then-judge) ──────────────

test("warning-code-coverage: itemized parity (a warning code with no emit site)", () => {
  const tree = {
    "packages/contracts/src/chat/index.ts":
      'export const CHAT_WARNING_CODES = ["never_emitted"] as const;\n',
    "packages/server/src/domain/chat/x.ts": 'export const q = "something_else";\n',
  };
  const { legacySites, newSites } = itemizedSites(warningCodeCoverage, warningCodeGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-inline-union-redecl: itemized parity (arm A alias + arm B cross-file re-spell)", () => {
  const tree = {
    "packages/contracts/src/alias.ts": "export type Mode = 'a' | 'b' | 'c';\n",
    "packages/contracts/src/home.ts": "export const AXIS = ['x', 'y', 'z'] as const;\n",
    "packages/server/src/respell.ts": "export interface T { axis: 'x' | 'y' | 'z' }\n",
  };
  // TWO sites: the arm-A alias (alias.ts:1) + the arm-B cross-file re-spell (respell.ts:1). The canonical
  // tuple itself is not flagged.
  const { legacySites, newSites } = itemizedSites(noInlineUnionRedecl, noInlineUnionGate, tree);
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("registry-pairing: itemized parity (a modal trigger with no body)", () => {
  const tree = {
    "packages/client/src/features/x/lib/rail-slots.ts":
      'export const RAIL = [{ kind: "modal", id: "orphanTrigger" }];\n',
    "packages/client/src/features/x/lib/modal-slots.tsx": "export const MODAL_SLOTS = {};\n",
  };
  // ONE site: the trigger with no body.
  const { legacySites, newSites } = itemizedSites(registryPairing, registryPairingGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-test-fabrication: itemized parity (a double-cast over budget, empty baseline)", () => {
  const tree = {
    "tests/tooling/fab.test.ts": "export const x = {} as unknown as { a: number };\n",
    "tests/tooling/ok.test.ts": "export const y = { a: 1 } satisfies { a: number };\n",
  };
  // ONE site: the double-cast (baseline empty on a synthetic tree → budget 0). satisfies passes. Legacy
  // driven with an empty injected baseline to match the descriptor's fs-empty synthetic read.
  const { legacySites, newSites } = itemizedSites(
    createNoTestFabrication({}),
    noTestFabricationGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("schema-banned-shapes: itemized parity (a ledger-rejected column)", () => {
  const tree = {
    "packages/db/src/schema/chat.ts":
      'export const chats = sqliteTable("chats", { ownerId: text("owner_id") });\n',
    "packages/db/src/schema/ok.ts":
      'export const chats2 = sqliteTable("chats", { title: text("title") });\n',
  };
  // ONE site: chats.ownerId (D18-rejected). The non-banned column passes.
  const { legacySites, newSites } = itemizedSites(schemaBannedShapes, schemaBannedShapesGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("schema-branding: itemized parity (an unbranded pk id)", () => {
  const tree = {
    "packages/db/src/schema/x.ts":
      'export const t = sqliteTable("t", { id: text("id").primaryKey() });\n',
    "packages/db/src/schema/y.ts":
      'export const u = sqliteTable("u", { id: text("id").primaryKey().$type<UId>() });\n',
  };
  // ONE site: the unbranded pk id. The branded one passes.
  const { legacySites, newSites } = itemizedSites(schemaBranding, schemaBrandingGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("no-untyped-soft-ref: itemized parity (a soft ref + stale, barrel LOADED)", () => {
  // The schema barrel is INCLUDED so the new path's fileLoaded-guarded stale arm fires exactly as the
  // legacy (driven with the LIVE allowlist). Both flag the unregistered soft ref + all 3 stale pairs (→
  // one schema-dir site).
  const tree = {
    "packages/db/src/schema/x.ts":
      'export const t = sqliteTable("t", { widgetId: text("widget_id") });\n',
    "packages/db/src/schema/index.ts": "export const barrel = 1;\n",
  };
  const { legacySites, newSites } = itemizedSites(
    createNoUntypedSoftRef(SOFT_REF_ALLOWLIST),
    noUntypedSoftRefGate,
    tree,
  );
  // the unregistered soft ref (x.ts:1) + the stale entries (packages/db/src/schema:0). = 2 sites.
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("asset-refs-fk-coverage: itemized parity (an unregistered FK→assets.id column, registry LOADED)", () => {
  // The registry file (domain/assets/persistence/asset-refs.ts) is INCLUDED so both paths reconcile
  // against the same two (empty) registry arrays; the sibling assets.ts lets the FK identifier resolve.
  const tree = {
    "packages/db/src/schema/x.ts":
      'import { assets } from "./assets";\nexport const t = sqliteTable("thing", {\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
    "packages/db/src/schema/assets.ts":
      'export const assets = sqliteTable("assets", { id: text("id").primaryKey() });\n',
    "packages/server/src/domain/assets/persistence/asset-refs.ts":
      "export const ASSET_REFS = [];\nexport const DERIVED_ASSET_COLUMNS = [];\n",
  };
  // ONE site: the unregistered FK→assets.id column (x.ts). The registry-less arms are vacuous.
  const { legacySites, newSites } = itemizedSites(
    assetRefsFkCoverage,
    assetRefsFkCoverageGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("audit-client-tests: itemized parity (an assertion-less test callback — dormant gate)", () => {
  const tree = {
    "tests/tooling/stub.test.ts": 'test("does nothing", () => {\n  const x = 1;\n  void x;\n});\n',
    "tests/tooling/real.test.ts": 'test("asserts", () => {\n  expect(1).toBe(1);\n});\n',
  };
  // audit-client-tests is DORMANT; the new gate is run as-active for the parity comparison (runPass would
  // skip it). ONE site: the assertion-less stub callback. The real test passes.
  const activeCopy = { ...auditClientTestsGate, status: "active" as const };
  const { legacySites, newSites } = itemizedSites(auditClientTests, activeCopy, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("monotonic-tests: itemized parity (an unconditional it.skip modifier — dormant gate)", () => {
  const tree = {
    "tests/tooling/skip.test.ts": 'it.skip("later", () => {\n  expect(1).toBe(1);\n});\n',
    "tests/tooling/ok.test.ts":
      'it.skipIf(process.env.CI === undefined)("gated", () => {\n  expect(1).toBe(1);\n});\n',
  };
  // monotonic-tests is DORMANT; run the new gate as-active for parity. ONE site: the unconditional
  // it.skip modifier. The conditional .skipIf gate (exact-name) is allowed.
  const activeCopy = { ...monotonicTestsGate, status: "active" as const };
  const { legacySites, newSites } = itemizedSites(monotonicTests, activeCopy, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 8 (fs-`run` gates — materialized onto a real temp-dir tree via itemizedSitesFs) ─────────

test("feature-structure: itemized parity (a domain feature missing template slots — fs)", () => {
  const tree = {
    "packages/server/src/domain/broken/index.ts": "export const x = 1;\n",
    "packages/server/src/domain/whole/index.ts": "export const a = 1;\n",
    "packages/server/src/domain/whole/service.ts": "export const s = 1;\n",
    "packages/server/src/domain/whole/context.ts": "export const c = 1;\n",
    "packages/server/src/domain/whole/contract/service.ts": "export const cs = 1;\n",
    "packages/server/src/domain/whole/verbs/x.ts": "export const v = 1;\n",
  };
  // broken/ is missing service.ts + context.ts + contract/ + verbs/ = 4 file-level sites; whole/ is
  // complete (clean).
  const { legacySites, newSites } = itemizedSitesFs(featureStructure, featureStructureGate, tree);
  expect(legacySites).toHaveLength(4);
  expect(newSites).toEqual(legacySites);
});

test("package-layout: itemized parity (a loose .ts at a package src root — fs)", () => {
  const tree = {
    "packages/kit/src/loose.ts": "export const x = 1;\n",
    "packages/kit/src/index.ts": "export const i = 1;\n",
    "packages/kit/src/mod/index.ts": "export const y = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(packageLayout, packageLayoutGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("server-layout: itemized parity (a stray file at server src root — fs)", () => {
  const tree = {
    "packages/server/src/stray.ts": "export const x = 1;\n",
    "packages/server/src/index.ts": "export const i = 1;\n",
    "packages/server/src/domain/x.ts": "export const y = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(serverLayout, serverLayoutGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-layout: itemized parity (a test with no source mirror — fs)", () => {
  const tree = {
    "tests/server/domain/orphan.test.ts": "export const x = 1;\n",
    "packages/server/src/domain/real.ts": "export const s = 1;\n",
    "tests/server/domain/real.test.ts": "export const y = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(testLayout, testLayoutGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("component-size: itemized parity (a client file over the cap — fs)", () => {
  const tree = {
    "packages/client/src/big/big.tsx": "export const x = 1;\n".repeat(451),
    "packages/client/src/small/small.tsx": "export const y = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(componentSize, componentSizeGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("component-size-ui: itemized parity (a ui file over the cap — fs, dormant gate)", () => {
  const tree = {
    "packages/ui/src/big/big.tsx": "export const x = 1;\n".repeat(451),
    "packages/ui/src/small/small.tsx": "export const y = 1;\n",
  };
  // component-size-ui is DORMANT; its legacy Check still runs directly, and the new gate (dormant) is run
  // as-active by itemizedSitesFs (runPass would skip it — so we use a locally-active copy for the new side).
  const activeCopy = { ...componentSizeUiGate, status: "active" as const };
  const { legacySites, newSites } = itemizedSitesFs(componentSizeUi, activeCopy, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-determinism: itemized parity (an ambient clock read in a test — fs)", () => {
  // The banned ambient-clock pattern is built by concatenation so the contiguous literal never appears in
  // THIS test file (which is itself under tests/ and read by the real test-determinism gate on the live
  // tree) — the materialized temp-dir fixture still receives the joined call for the gate to catch there.
  const ambient = "export const t = Date".concat(".now();\n");
  const tree = {
    "tests/server/x.test.ts": ambient,
    "tests/server/y.test.ts": "export const t2 = clock.now();\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(testDeterminism, testDeterminismGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("baseline-single-migration: itemized parity (an incremental migration — fs)", () => {
  const tree = {
    "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
    "packages/db/src/migrations/0001_extra.sql": "-- incremental\n",
    "packages/db/src/migrations/meta/_journal.json":
      '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }] }\n',
  };
  const { legacySites, newSites } = itemizedSitesFs(
    baselineSingleMigration,
    baselineSingleMigrationGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("verb-naming: itemized parity (a verb file exporting the wrong name)", () => {
  const tree = {
    "packages/server/src/domain/chat/verbs/start-chat.ts": "export const wrongName = 1;\n",
    "packages/server/src/domain/chat/verbs/ok.ts": "export const createOk = (c: unknown) => c;\n",
  };
  const { legacySites, newSites } = itemizedSites(verbNaming, verbNamingGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("commented-code: itemized parity (a parked code statement)", () => {
  const tree = {
    "packages/ui/src/x/x.ts": "// const dead = compute();\nexport const x = 1;\n",
    "packages/ui/src/x/ok.ts": "// prose comment explaining WHY\nexport const y = 1;\n",
  };
  const { legacySites, newSites } = itemizedSites(commentedCode, commentedCodeGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-factory-contract: itemized parity (a make* factory taking a db)", () => {
  const tree = {
    "tests/support/factories/user.ts": "export function makeUser(db: unknown) {\n  return db;\n}\n",
    "tests/support/factories/ok.ts": "export function makeOk() {\n  return {};\n}\n",
  };
  const { legacySites, newSites } = itemizedSites(
    testFactoryContract,
    testFactoryContractGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("providers-runner-seal: itemized parity (sealed symbol in a domain consumer)", () => {
  const tree = {
    "packages/server/src/domain/chat/x.ts":
      'import { deriveRunner } from "@orb/server";\nexport const r = deriveRunner;\n',
    "packages/server/src/infra/providers/roles/dispatch.ts":
      'import { deriveRunner } from "@orb/server";\nexport const r2 = deriveRunner;\n',
  };
  const { legacySites, newSites } = itemizedSites(
    providersRunnerSeal,
    providersRunnerSealGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("contract-verb-presence: itemized parity (an uncovered Service verb)", () => {
  const tree = {
    "packages/server/src/domain/hub/contract/service.ts":
      "export interface HubService {\n  uncoveredVerb(): void;\n}\n",
    "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
  };
  const { legacySites, newSites } = itemizedSites(
    contractVerbPresence,
    contractVerbPresenceGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("placeholder-copy-registry: itemized parity (a duplicate copy pair)", () => {
  const tree = {
    "packages/client/src/features/x/lib/section-placeholder-copy.ts":
      'export const SECTION_PLACEHOLDER_COPY = {\n  a: { title: "T", description: "D" },\n  b: { title: "T", description: "D" },\n};\n',
  };
  const { legacySites, newSites } = itemizedSites(
    placeholderCopyRegistry,
    placeholderCopyRegistryGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("persist-partialize-and-total-migrate: itemized parity (a bare persist)", () => {
  const tree = {
    "packages/client/src/features/x/store.ts": "export const s = persist(() => ({}), {});\n",
    "packages/client/src/features/x/ok.ts":
      "export const s2 = createPersistedStore('x', () => ({}));\n",
  };
  const { legacySites, newSites } = itemizedSites(
    persistPartializeAndTotalMigrate,
    persistPartializeAndTotalMigrateGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("form-factory-for-multifield: itemized parity (a hand-rolled 3-field form)", () => {
  const tree = {
    "packages/client/src/features/x/hand.tsx":
      "export const F = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
    "packages/client/src/features/x/two.tsx":
      "export const G = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n  </div>\n);\n",
  };
  const { legacySites, newSites } = itemizedSites(
    formFactoryForMultifield,
    formFactoryForMultifieldGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("surface-in-a-container: itemized parity (a raw structural surface — fs)", () => {
  const tree = {
    "packages/client/src/features/x/surfaces/pane.tsx":
      "export const Pane = () => <div><ul><li>row</li></ul></div>;\n",
    "packages/client/src/features/x/surfaces/ok.tsx":
      "export const Ok = () => <Container><ul><li>row</li></ul></Container>;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(
    surfaceInAContainer,
    surfaceInAContainerGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("pd-citation-integrity: itemized parity (an orphan FLAG citation — fs)", () => {
  const tree = {
    "docs/architecture/core/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
    "packages/server/src/x.ts": "// FLAG".concat("[PD-999] an orphan\nexport const x = 1;\n"),
  };
  const { legacySites, newSites } = itemizedSitesFs(
    pdCitationIntegrity,
    pdCitationIntegrityGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("motion-token-purity: itemized parity (a raw motion value in CSS — fs)", () => {
  const tree = {
    "packages/ui/src/x/x.css": ".a { transition: opacity 220ms ease-out; }\n",
    "packages/ui/src/x/ok.css":
      ".b { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(
    createMotionTokenPurity({}),
    motionTokenPurityGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-presence: itemized parity (a domain verb with no mirror test — fs)", () => {
  const tree = {
    "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n",
    "packages/server/src/domain/chat/verbs/ok.ts": "export const createOk = 1;\n",
    "tests/server/domain/chat/verbs/ok.test.ts": "export const t = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(testPresence, testPresenceGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("test-presence-client: itemized parity (a client data hook with no mirror test — fs)", () => {
  const tree = {
    "packages/client/src/data/use-thing.ts": "export const useThing = () => 1;\n",
    "packages/client/src/data/use-ok.ts": "export const useOk = () => 1;\n",
    "tests/client/data/use-ok.test.ts": "export const t = 1;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(
    testPresenceClient,
    testPresenceClientGate,
    tree,
  );
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

test("client-structure: itemized parity (a built feature with a stray root file + no index — fs)", () => {
  const tree = {
    // A BUILT feature (has code) named neither reserved nor a domain mirror, with a stray root file and
    // no index.ts front door → the no-index + not-a-mirror + stray-file arms all fire.
    "packages/client/src/features/broken/stray.ts": "export const x = 1;\n",
    // A clean built feature: mirrors a real domain, has an index front door + a properly-named surface.
    "packages/server/src/domain/chat/index.ts": "export const d = 1;\n",
    "packages/client/src/features/chat/index.ts": "export const i = 1;\n",
    "packages/client/src/features/chat/surfaces/chat-surface.tsx": "export const S = () => null;\n",
  };
  const { legacySites, newSites } = itemizedSitesFs(clientStructure, clientStructureGate, tree);
  // broken/ fires no-index + not-a-mirror (both anchored on `broken/:0` → one deduped site) + the
  // stray-file (`broken/stray.ts:0`) = 2 distinct SITES.
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("ui-primitive-structure: itemized parity (missing-trio fs clause + a color-literal AST clause — fs)", () => {
  const tree = {
    // `thing/` — a primitive dir missing index.ts + variants.ts and with no co-located CT (fs clauses
    // 1 + 4, both anchored on `primitives/thing/:0` → one deduped site).
    "packages/ui/src/primitives/thing/thing.tsx":
      'export const Thing = () => <div data-slot="thing" />;\n',
    // `ok/` — a complete primitive so its trio/CT clauses stay clean; its CT carries a hardcoded hex
    // color literal (AST clause 5) → a distinct site at the CT line.
    "packages/ui/src/primitives/ok/ok.tsx": 'export const Ok = () => <div data-slot="ok" />;\n',
    "packages/ui/src/primitives/ok/index.ts": 'export { Ok } from "./ok";\n',
    "packages/ui/src/primitives/ok/variants.ts":
      'import { tv } from "#lib";\nexport const okVariants = tv({ base: "block" });\n',
    "tests/ui/primitives/ok/ok.ct.tsx": 'export const color = "#abcdef";\n',
  };
  const { legacySites, newSites } = itemizedSitesFs(
    uiPrimitiveStructure,
    uiPrimitiveStructureGate,
    tree,
  );
  // `thing/` (trio + CT clauses → one deduped site) + the color-literal in `ok.ct.tsx` = 2 distinct SITES.
  expect(legacySites).toHaveLength(2);
  expect(newSites).toEqual(legacySites);
});

test("db-structure: itemized parity (a schema file not re-exported — fs)", () => {
  const tree = {
    "packages/db/src/schema/orphan.ts": "export const t = 1;\n",
    "packages/db/src/schema/thing.ts": "export const u = 1;\n",
    "packages/db/src/schema/index.ts": 'export * from "./thing";\n',
  };
  const { legacySites, newSites } = itemizedSitesFs(dbStructure, dbStructureGate, tree);
  expect(legacySites).toHaveLength(1);
  expect(newSites).toEqual(legacySites);
});

// ── batch 9 (the two SHAPE-CHANGE specials — parity is a DELIBERATE delta, not byte-identical) ─────
// enforcement-registry-parity (§7) and diagnostic-legibility (§2.2 fold-in) do NOT hold byte-identical
// parity — the first reconciles the DISCOVERED DESCRIPTOR SET instead of the ALL_CHECKS name list (a
// different oracle entirely), the second gains the gate corpus in its scanned fileset. Their tests assert
// the INTENDED new behavior directly.

/** Materialize a tree into a real temp dir and run ONE fsBacked gate over it (as-active), returning its
 *  findings — the fsBacked twin of `runNew`, for the shape-change gates whose oracle isn't a legacy Check. */
function runFsBackedGate(
  gate: GateDescriptor,
  tree: Readonly<Record<string, string>>,
): readonly Finding[] {
  const root = mkdtempSync(join(tmpdir(), "orb-shape-"));
  try {
    for (const [rel, text] of Object.entries(tree)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([`${root}/**/*.ts`, `${root}/**/*.tsx`]);
    const active: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
    const result = runPass([active], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    return canonicalSort(result.gates.find((g) => g.name === gate.name)?.findings ?? []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const DOC_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

test("enforcement-registry-parity: reconciles the DISCOVERED DESCRIPTOR SET (the §7 shape change)", () => {
  // The contract form no longer reads report.ts's ALL_CHECKS; it reads each gate file's descriptor
  // status. An active descriptor whose name is absent from the doc's ACTIVE table (and a count that
  // undercounts it) reds — a doc that lies about the registry. This is the deliberate NEW oracle.
  const dirty = {
    "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
    [DOC_REL]:
      "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
  };
  const dirtyFindings = runFsBackedGate(enforcementRegistryParityGate, dirty);
  // Two doc-level findings: the missing ACTIVE row + the count mismatch (both at DOC_REL, so ONE site).
  expect(dirtyFindings.length).toBeGreaterThanOrEqual(1);
  expect(dirtyFindings.every((f) => f.file === DOC_REL)).toBe(true);
  expect(dirtyFindings.some((f) => (f.message ?? "").includes("ACTIVE table"))).toBe(true);

  // A doc consistent with the descriptor set (the ACTIVE row present + the count matching) is clean.
  const clean = {
    "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
    [DOC_REL]:
      "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
  };
  expect(runFsBackedGate(enforcementRegistryParityGate, clean)).toEqual([]);
});

test("diagnostic-legibility: reads the gate corpus from the shared project (the §2.2 fold-in)", () => {
  // The contract form reads gate files from ctx.project (scanRoot-pinned to scripts/check/gates/) instead
  // of its own third `new Project`. A gate `message:` with no doc/code-home pointer reds; one carrying a
  // code-home passes — identical VERDICTS to the legacy scan, now sourced from the shared workspace.
  const pointerless = {
    "scripts/check/gates/x.ts": 'export const gate = { message: "a bare no-home diagnostic" };\n',
  };
  const flagged = runFsBackedGate(diagnosticLegibilityGate, pointerless);
  expect(flagged).toHaveLength(1);
  expect(flagged[0]?.file).toBe("scripts/check/gates/x.ts");

  const pointered = {
    "scripts/check/gates/x.ts":
      'export const gate = { message: "fix lives in packages/ui/src/x.ts" };\n',
  };
  expect(runFsBackedGate(diagnosticLegibilityGate, pointered)).toEqual([]);
});

test("§2.2 fold-in: the whole-project scanners are PINNED off the now-globbed gate corpus (no net delta)", () => {
  // The INTENDED delta the fold-in would create: adding scripts/check/gates/** to the workspace globs
  // means a whole-project scanner would ALSO see gate files — e.g. commented-code would fire on a gate
  // file's `// export const … ;` activation-snippet comment. The scanner's scanRoot pin (packages+tests,
  // excluding scripts/check/gates/) neutralizes that, so the NET finding change on the real corpus is
  // ZERO. This proves the pin holds: the same gate-file comment is a finding WITHOUT the pin, none WITH it.
  const gateFileTree = {
    // A `// export const … ;` line — a parked-code shape commented-code flags anywhere it's ALLOWED to
    // scan. Placed under the now-globbed gate corpus.
    "scripts/check/gates/x.ts": "// export const dead = compute();\nexport const gate = {};\n",
  };
  // WITH the pin (the real gate): scanRoot excludes scripts/check/gates/, so the dispatcher never feeds
  // the file to commented-code → no finding (the fold-in is behavior-preserving).
  const pinned = siteSet(canonicalSort(runNew(commentedCodeGate, inMemoryProject(gateFileTree))));
  expect(pinned).toEqual([]);

  // WITHOUT the pin (a copy with scanRoot omitted): the file IS scanned → the parked-code comment fires.
  // This is the delta the pin exists to suppress; asserting it proves the pin is load-bearing, not vacuous.
  const { scanRoot: _omit, ...unpinned } = commentedCodeGate;
  const unpinnedSites = siteSet(canonicalSort(runNew(unpinned, inMemoryProject(gateFileTree))));
  expect(unpinnedSites).toEqual(["scripts/check/gates/x.ts:1"]);
});
