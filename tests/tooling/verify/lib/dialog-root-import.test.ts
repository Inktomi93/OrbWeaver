import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Project } from "ts-morph";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/dialog-via-composite.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/dialog-family";
const POLICIES = [ordinary];
const PRODUCT_MARKERS = [
  "packages/client/src/features/app-shell/components/modal-host.tsx",
  "packages/client/src/features/chat/anchors/join-invite-dialog.tsx",
  "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx",
  "packages/client/src/features/chat/components/reaction-picker.tsx",
  "packages/client/src/features/chat/components/member-card-viewer.tsx",
  "packages/client/src/features/chat/components/variant-wire-viewer.tsx",
  "packages/client/src/features/preset/components/variable-editor-dialog.tsx",
  "packages/client/src/features/rpg/components/rpg-scene-cards.tsx",
  "packages/client/src/features/persona/components/persona-from-character-dialog.tsx",
  "packages/client/src/features/persona/components/persona-connected-characters.tsx",
] as const;

function project(files: Readonly<Record<string, string>>, root = ROOT): Project {
  const value = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    value.createSourceFile(`${root}/${path}`, source);
  }
  return value;
}

function run(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: POLICIES,
    policies: POLICIES,
    root: ROOT,
    project: project(files),
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("the sole owner dispatches its complete proof corpus", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

/** THE PARTITION IS GONE AND THE ERROR OWNER TOOK ALL THREE (#2393). This arm used to assert the split —
 *  one ordinary finding plus two warning-debt ones. #2350 migrated both chat paths, `DIALOG_DEBT_PATHS`
 *  emptied, and `dialog-via-composite-debt` became a policy that could never flag, which the nonempty
 *  `mustFlag` contract makes illegal; it is deleted. The arm is KEPT rather than dropped because the same
 *  three fixtures are what prove the ex-debt paths are no longer exempt from anything: a regression at
 *  either one is now an ERROR, which is strictly stronger than the warning it replaced. */
test("the classifier has no debt partition left — the two ex-#2350 chat paths are ordinary errors like any other", () => {
  const result = run({
    "packages/client/src/features/demo/components/x.tsx": 'import { Dialog } from "@orb/ui/dialog";',
    "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";',
    "packages/client/src/features/chat/components/invite-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ policyId }) => policyId).toSorted()).toEqual([
    "dialog-via-composite",
    "dialog-via-composite",
    "dialog-via-composite",
  ]);
  expect(result.authority.effectiveFindings.map(({ file }) => file).toSorted()).toEqual([
    "packages/client/src/features/chat/components/invite-dialog.tsx",
    "packages/client/src/features/chat/components/rename-chat-dialog.tsx",
    "packages/client/src/features/demo/components/x.tsx",
  ]);
});

test("the exact marker grants once, while wrong position and a stale marker alarm centrally", () => {
  const good = run({
    "packages/client/src/features/demo/components/x.tsx":
      '// @orb-waive dialog-via-composite(Dialog): a non-form viewer; ends when its composite exists.\nimport { Dialog } from "@orb/ui/dialog";',
  });
  expect(good.authority.waivedFindings).toHaveLength(1);
  expect(good.authority.effectiveFindings).toEqual([]);

  const wrong = run({
    "packages/client/src/features/demo/components/x.tsx":
      '// @orb-waive dialog-via-composite(DialogPopup): a non-form viewer; ends when its composite exists.\nimport { Dialog } from "@orb/ui/dialog";',
  });
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms).not.toHaveLength(0);

  const stale = run({
    "packages/client/src/features/demo/components/x.tsx":
      "// @orb-waive dialog-via-composite(Dialog): a non-form viewer; ends when its composite exists.\nexport const x = true;",
  });
  expect(stale.authority.authorityAlarms).toEqual([
    expect.objectContaining({ kind: "ordinary-waiver", message: expect.stringMatching(/stale|no matching finding/iu) }),
  ]);
});

test("the production translation is exactly ten ordinary markers, and neither ex-debt path carries one", () => {
  for (const path of PRODUCT_MARKERS) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source.match(/@orb-waive dialog-via-composite\(Dialog\):/gu)).toHaveLength(1);
  }
  for (const path of [
    "packages/client/src/features/chat/components/rename-chat-dialog.tsx",
    "packages/client/src/features/chat/components/invite-dialog.tsx",
  ]) {
    expect(readFileSync(join(process.cwd(), path), "utf8")).not.toContain("@orb-waive dialog-via-composite");
  }
});

test("a narrowed request defers the entire-population owner", () => {
  const result = run(
    {
      "packages/client/src/features/demo/components/x.tsx": 'import { Dialog } from "@orb/ui/dialog";',
      "packages/client/src/features/demo/components/y.tsx": "export const y = true;",
    },
    ["packages/client/src/features/demo/components/x.tsx"],
  );
  for (const policy of POLICIES) {
    expect(result.policies.find(({ id }) => id === policy.id)?.owner.status).toBe("not-applicable");
  }
});

test("legacy and final predicates admit the same files and preserve named-import/first-root semantics", () => {
  const paths = [
    "packages/client/src/features/x.tsx",
    "packages/client/src/features/x.ts",
    "packages/client/src/components/x.tsx",
    "packages/ui/src/features/x.tsx",
  ];
  expect(paths.filter((path) => path.includes("packages/client/src/features/") && path.endsWith(".tsx"))).toEqual(["packages/client/src/features/x.tsx"]);
  const result = run({
    "packages/client/src/features/x.tsx":
      'import DefaultDialog, { DialogClose } from "@orb/ui/dialog";\nimport { Dialog as First } from "@orb/ui/dialog";\nimport { Dialog as Second } from "@orb/ui/dialog";',
    "packages/client/src/features/x.ts": 'import { Dialog } from "@orb/ui/dialog";',
    "packages/client/src/components/x.tsx": 'import { Dialog } from "@orb/ui/dialog";',
  });
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.effectiveFindings[0]?.token).toBe("Dialog");
});
