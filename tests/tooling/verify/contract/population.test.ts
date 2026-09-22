// THE WORKSPACE ↔ `POPULATION_ROOTS` RECONCILIATION (#2267).
//
// `contract/population.ts` says named roots exist "only for independently selectable workspace packages and
// top-level authored trees" (guide §4), and `AUTHORED_MEMBERSHIP` made the `@authored` half tsc-enforced
// (#1980). The ROOT LIST ITSELF had no such enforcer: it is hand-typed, and nothing compared it with the
// workspace. A new `packages/foo` therefore joins no root, is admitted by no population, is judged by no
// policy — and no instrument reports a package that fell outside every population. That is the same shape
// #1980 fixed one level down, where `@showcase` silently failed to join `@authored`.
//
// WHY A TEST AND NOT A GATE OR A `satisfies`. tsc cannot read `pnpm-workspace.yaml`, so rung 2 is out of
// reach for this axis; a gate would need a workspace resource kind, and the vocabulary is CLOSED (18 kinds,
// frozen #1930) — building a nineteenth for one comparison is not the cheap arm. Rung 4 (test-time) is the
// honest home, and it is the same rung `tests/tooling/package-roster.test.ts` already uses to hold
// `WORKSPACE_PACKAGES`, `PACKAGE_RESOURCE_PATHS` and Knip against the native workspace.
//
// NO SECOND HAND-WRITTEN PACKAGE LIST — that is the whole point, and re-typing the workspace's packages
// here would reproduce the defect with an extra copy. The member set comes from `readPolicyWorkspacePackages`,
// which shells `pnpm list -r --depth -1 --json`: pnpm's OWN resolution of the `packages:` globs in
// `pnpm-workspace.yaml`, cross-checked against the authored manifest inventory. It is the one home for
// workspace discovery in `tooling/` and it is already the authority `package-roster.test.ts` trusts.
//
// THE EXCLUSIONS ARE DATA WITH A `why`, AND THEY ARE TWO-SIDED. `@tests` and `@scripts` are authored trees
// that are not workspace members; the repo root is a workspace member that is not an authored tree. Each is
// a row below carrying its reason, and each row is asserted to still RESOLVE — a stale exclusion (a root
// that was deleted, a member that was removed) reds exactly like an unclassified one.
//
// THE RECONCILE IS A PURE FUNCTION SO IT CAN BE FALSIFIED WITH FIXTURES rather than by mutating the tree:
// planting `packages/__probe-pkg/package.json` to make the real drive red would need an install to be seen
// by `pnpm list`, and a live probe leaves nothing behind for the next reader. `reconcile` takes the member
// set and the root table as arguments; one arm drives it on the REAL two, and four arms drive it on
// synthetic inputs that each isolate one direction of the defect.
import process from "node:process";
import { POPULATION_ROOTS, POPULATION_SETS } from "../../../../tooling/src/verify/contract/population.ts";
import { readPolicyRepositoryInventory, readPolicyWorkspacePackages } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The repo-relative directory of a workspace member (`.` for the root), and the root table shape. */
type MemberPaths = readonly string[];
type RootTable = Readonly<Record<string, readonly string[]>>;

interface ExclusionRow {
  readonly key: string;
  readonly why: string;
}

/** Workspace members that deliberately own NO population root. A row here is a decision, not an omission. */
const MEMBERS_WITHOUT_A_ROOT: readonly ExclusionRow[] = [
  {
    key: ".",
    why: "the workspace ROOT manifest is a member of the pnpm workspace but is not an authored source tree — it has no `src/`, and every authored file beneath it is already claimed by a package root, `@tooling`, `@tests` or `@scripts`.",
  },
];

/** Population roots that deliberately name NO workspace member — guide §4's "top-level authored trees". */
const ROOTS_WITHOUT_A_MEMBER: readonly ExclusionRow[] = [
  {
    key: "@tests",
    why: "`tests/` is the CENTRAL test mirror (constitution §0.2), a top-level authored tree owned by no package: its members prefix-swap INTO the packages rather than living in one.",
  },
  {
    key: "@scripts",
    why: "`scripts/` is the repo-level script tree (dev supervisors, probes, one-shots). It is deliberately not a workspace package — nothing imports it and it publishes nothing — but it is authored, so it needs a root.",
  },
];

/** The member directory a root claims, or `undefined` when its expression is not one member's `src/` tree.
 *  A root carrying several paths, or one path that is not `<dir>/src/`, claims no member by construction. */
function claimedMember(paths: readonly string[]): string | undefined {
  const single = paths.length === 1 ? paths[0] : undefined;
  return single !== undefined && single.endsWith("/src/") ? single.slice(0, -"/src/".length) : undefined;
}

/** FORWARD — a workspace member with no root is the #2267 defect: it is judged by no policy. */
function membersWithoutARoot(memberPaths: MemberPaths, roots: RootTable): readonly string[] {
  const excluded = new Set(MEMBERS_WITHOUT_A_ROOT.map(({ key }) => key));
  const claimed = new Set(Object.values(roots).map((paths) => claimedMember(paths)));
  return memberPaths
    .filter((member) => !(excluded.has(member) || claimed.has(member)))
    .map((member) => `workspace member ${member} joins no population root — add a root naming ${member}/src/, or a MEMBERS_WITHOUT_A_ROOT row with a why`);
}

/** REVERSE — a root naming a package that is not a workspace member is a dead or mis-spelled declaration. */
function rootsWithoutAMember(memberPaths: MemberPaths, roots: RootTable): readonly string[] {
  const members = new Set(memberPaths);
  const excluded = new Set(ROOTS_WITHOUT_A_MEMBER.map(({ key }) => key));
  return Object.entries(roots)
    .filter(([root, paths]) => {
      const member = claimedMember(paths);
      const live = member !== undefined && members.has(member);
      return !(excluded.has(root) || live);
    })
    .map(
      ([root, paths]) =>
        `population root ${root} names no workspace member — its paths are ${JSON.stringify(paths)}; add a ROOTS_WITHOUT_A_MEMBER row with a why if that is deliberate`,
    );
}

/** The exclusion tables' own liveness: an amnesty for something that no longer exists is a stale claim. */
function staleExclusions(memberPaths: MemberPaths, roots: RootTable): readonly string[] {
  const members = new Set(memberPaths);
  return [
    ...MEMBERS_WITHOUT_A_ROOT.filter(({ key }) => !members.has(key)).map(({ key }) => `MEMBERS_WITHOUT_A_ROOT row ${key} is stale — no such workspace member`),
    ...ROOTS_WITHOUT_A_MEMBER.filter(({ key }) => !Object.hasOwn(roots, key)).map(
      ({ key }) => `ROOTS_WITHOUT_A_MEMBER row ${key} is stale — no such population root`,
    ),
  ];
}

/** Reconcile a workspace member set against a population-root table, BOTH WAYS. Returns one message per
 *  violation, sorted, so a fixture arm can assert the exact set rather than a count. */
function reconcile(memberPaths: MemberPaths, roots: RootTable): readonly string[] {
  return [...membersWithoutARoot(memberPaths, roots), ...rootsWithoutAMember(memberPaths, roots), ...staleExclusions(memberPaths, roots)].toSorted();
}

function realMemberPaths(): MemberPaths {
  return readPolicyWorkspacePackages(readPolicyRepositoryInventory(process.cwd())).map(({ path }) => path);
}

test("every workspace package joins a population root, and every root names a live member (#2267)", () => {
  const members = realMemberPaths();

  // The positive control for the drive itself: a member set that came back empty (or lost `packages/`)
  // would make the forward direction vacuously green, which is the exact "empty population" false clean.
  expect(members.filter((path) => path.startsWith("packages/")).length).toBeGreaterThan(1);
  expect(reconcile(members, POPULATION_ROOTS)).toEqual([]);
});

test("a NEW workspace package that joins no root is reported — the #2267 defect, planted", () => {
  expect(reconcile([...realMemberPaths(), "packages/__probe-pkg"], POPULATION_ROOTS)).toEqual([
    "workspace member packages/__probe-pkg joins no population root — add a root naming packages/__probe-pkg/src/, or a MEMBERS_WITHOUT_A_ROOT row with a why",
  ]);
});

test("a root naming a package that does not exist is reported — the reverse direction", () => {
  const roots = { ...POPULATION_ROOTS, "@ghost": ["packages/ghost/src/"] } as const;

  expect(reconcile(realMemberPaths(), roots)).toEqual([
    'population root @ghost names no workspace member — its paths are ["packages/ghost/src/"]; add a ROOTS_WITHOUT_A_MEMBER row with a why if that is deliberate',
  ]);
});

test("a root whose path is not the member's src/ tree is reported — the shape, not just the name", () => {
  const roots = { ...POPULATION_ROOTS, "@kit": ["packages/kit/lib/"] } as const;

  expect(reconcile(realMemberPaths(), roots)).toEqual([
    'population root @kit names no workspace member — its paths are ["packages/kit/lib/"]; add a ROOTS_WITHOUT_A_MEMBER row with a why if that is deliberate',
    "workspace member packages/kit joins no population root — add a root naming packages/kit/src/, or a MEMBERS_WITHOUT_A_ROOT row with a why",
  ]);
});

test("a stale exclusion row reds — the tables are two-sided, not a permanent amnesty", () => {
  const { "@scripts": _scripts, ...withoutScripts } = POPULATION_ROOTS;

  expect(
    reconcile(
      realMemberPaths().filter((path) => path !== "."),
      withoutScripts,
    ),
  ).toEqual(["MEMBERS_WITHOUT_A_ROOT row . is stale — no such workspace member", "ROOTS_WITHOUT_A_MEMBER row @scripts is stale — no such population root"]);
});

test("every exclusion row states a WHY — an omission with no reason is the omission the tables prevent", () => {
  expect([...MEMBERS_WITHOUT_A_ROOT, ...ROOTS_WITHOUT_A_MEMBER].filter(({ why }) => why.trim().length === 0)).toEqual([]);
});

// THE TWO CLASSIFICATION MAPS MUST AGREE ON DIRECTION (#2488). `AUTHORED_MEMBERSHIP` and `PRODUCT_MEMBERSHIP`
// are INDEPENDENT tsc-exhaustive maps on purpose — a root's two decisions are each stated rather than one
// implied by the other, so neither answer can be satisfied while meaning the other. Independence is exactly
// what can drift, and the one relation that is not a free choice is the direction: `@product` is "the
// authored code the product is built from", so a product root is necessarily an authored root. The reverse
// must NOT hold, or `@product` has silently become a second spelling of `@authored` — which would be this
// row's own defect (one string, two meanings) minted inside the fix for it.
test("`@product` is a strict subset of `@authored` — the two classification maps cannot disagree on direction (#2488)", () => {
  const authored = new Set<string>(POPULATION_SETS["@authored"]);
  const product = new Set<string>(POPULATION_SETS["@product"]);

  // The drive's own positive control: an empty or single-root product set makes the subset vacuously true.
  expect(POPULATION_SETS["@product"].length).toBeGreaterThan(1);
  expect(POPULATION_SETS["@product"].filter((root) => !authored.has(root))).toEqual([]);
  expect(POPULATION_SETS["@authored"].filter((root) => !product.has(root))).toEqual(["@tooling", "@tests", "@scripts"]);
});

test("shipped showcase and default-content packages belong to both generic composites", () => {
  expect(POPULATION_SETS["@authored"]).toHaveLength(12);
  expect(POPULATION_SETS["@product"]).toHaveLength(9);
  expect(POPULATION_SETS["@authored"]).toEqual(expect.arrayContaining(["@showcase", "@default-content"]));
  expect(POPULATION_SETS["@product"]).toEqual(expect.arrayContaining(["@showcase", "@default-content"]));
});
