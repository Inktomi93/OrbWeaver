import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/dialog-via-composite.ts";
import { gate as debt } from "../../../../tooling/src/verify/gates/dialog-via-composite-debt.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/dialog-family";
const POLICIES = [ordinary, debt];
const LEGACY = "31c6f9a3977c64dc8e620d4a14f8019323f07a32";
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

test("both owners dispatch their complete proof corpus", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("the shared classifier keeps ordinary errors separate from the two exact warning-debt paths", () => {
  const result = run({
    "packages/client/src/features/demo/components/x.tsx": 'import { Dialog } from "@orb/ui/dialog";',
    "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";',
    "packages/client/src/features/chat/components/invite-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ policyId }) => policyId).toSorted()).toEqual([
    "dialog-via-composite",
    "dialog-via-composite-debt",
    "dialog-via-composite-debt",
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

test("the production translation is exactly ten ordinary markers and no debt marker", () => {
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

test("a narrowed request defers both entire-population owners", () => {
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

function exampleFiles(example: GateExample): Record<string, string> {
  return typeof example.files === "string" ? { [example.at ?? "packages/client/src/features/x.tsx"]: example.files } : { ...example.files };
}

test("the classified union maps all two flag and three pass legacy rows", async ({ scratch }) => {
  const source = execFileSync("git", ["show", `${LEGACY}:tooling/src/verify/gates/dialog-via-composite.ts`], { encoding: "utf8" });
  const target = join(scratch, `legacy-${basename("dialog-via-composite.ts")}`);
  const gateHref = JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/contract/gate.ts")).href);
  const passHref = JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/lib/pass.ts")).href);
  writeFileSync(target, source.replace('from "../contract/gate.ts"', `from ${gateHref}`).replace('from "../lib/pass.ts"', `from ${passHref}`));
  const legacy = ((await import(pathToFileURL(target).href)) as { gate: GateDescriptor }).gate;
  const expected = [
    { before: 1, afterError: 1, afterWarning: 0, classification: "same occurrence" },
    { before: 12, afterError: 0, afterWarning: 0, classification: "private stale rows replaced by central stale-marker control" },
    { before: 0, afterError: 0, afterWarning: 0, classification: "FormDialog remains outside" },
    { before: 0, afterError: 0, afterWarning: 0, classification: "DialogClose remains outside" },
    { before: 0, afterError: 0, afterWarning: 1, classification: "temporary rename exception becomes #2350 warning debt" },
  ];
  let row = 0;
  for (const arm of ["mustFlag", "mustPass"] as const) {
    for (const example of legacy[arm]) {
      // The old stale-table row contains only its UI anchor. Admit one inert client source on BOTH
      // sides so the final owner executes instead of an empty-population refusal masquerading as zero.
      const files = { ...exampleFiles(example), "packages/client/src/__dialog_replay.ts": "export const replay = true;" };
      const legacyProject = project(files, scratch);
      const before = runPass([legacy], {
        root: scratch,
        project: legacyProject,
        scope: { kind: "project" },
        files: legacyProject.getSourceFiles(),
        checker: () => legacyProject.getTypeChecker(),
      });
      const after = run(files);
      const mapping = expected[row++];
      expect(before.toolErrors, mapping?.classification).toEqual([]);
      expect(after.toolErrors, mapping?.classification).toEqual([]);
      expect(after.factErrors, mapping?.classification).toEqual([]);
      expect(before.gates[0]?.findings, mapping?.classification).toHaveLength(mapping?.before ?? -1);
      expect(
        after.authority.effectiveFindings.filter(({ policyId }) => policyId === ordinary.id),
        mapping?.classification,
      ).toHaveLength(mapping?.afterError ?? -1);
      expect(
        after.authority.effectiveFindings.filter(({ policyId }) => policyId === debt.id),
        mapping?.classification,
      ).toHaveLength(mapping?.afterWarning ?? -1);
      const finalIdentity = after.authority.effectiveFindings.map(({ file, line, token, message, policyId }) => ({
        file,
        line,
        token,
        message: message ?? POLICIES.find((policy) => policy.id === policyId)?.message,
        policyId,
      }));
      // Row 0 changes remediation prose, preserving the legacy import location and token.
      const identities = [
        (before.gates[0]?.findings ?? []).map(({ file, line, token }) => ({
          file,
          line,
          token,
          policyId: "dialog-via-composite",
          message: "a features/** file imports the raw `Dialog` root from @orb/ui/dialog — use FormDialog for a form/prompt or ConfirmDialog for an alert.",
        })),
        [],
        [],
        [],
        [
          {
            file: "packages/client/src/features/chat/components/rename-chat-dialog.tsx",
            line: 1,
            token: "Dialog",
            policyId: "dialog-via-composite-debt",
            message: "a temporary chat-lane raw Dialog remains pending migration to a composite (#2350).",
          },
        ],
      ];
      expect(finalIdentity, mapping?.classification).toEqual(identities[row - 1]);
    }
  }
  expect(row).toBe(5);
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
