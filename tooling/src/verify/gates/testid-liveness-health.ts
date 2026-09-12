// Policy: testid-liveness-health — the §4.6 BLINDNESS TRIPWIRE for `testid-liveness` (arm A3 of the legacy
// mixed-hook descriptor). The liveness policy keys on ONE file BY PATH and ONE const BY NAME, so a rename,
// a move, or a registry that stops being an object literal of string rows turns BOTH of its liveness arms
// into a no-op that reports ✓ forever. This policy reds that instead.
//
// Split from the legacy descriptor (guide §12.6, #1950): the liveness arms are per-occurrence ORDINARY
// verdicts an author may waive; this is a whole-tree HARD verdict about ONE file that must never carry a
// suppression door — a marker here would restore exactly the no-op it exists to catch. One authority per
// policy.
//
// FAMILY `testid-liveness` — the shared reader is `lib/testid-registry.ts` (`testIdRegistryRow`,
// `TESTID_REGISTRY_HOME`, `TESTID_REGISTRY_CONST`): the rows this policy proves READABLE are exactly the
// rows the liveness policy judges, so a tripwire cannot report healthy about a shape its sibling cannot read.
//
// POPULATION PORT: an INTENTIONAL correction, and it is the arm's mechanism. The legacy descriptor shared
// the liveness `scanRoot` (`packages/**/src` + `tests/**`) and opted this arm into real runs only by testing
// `fileLoaded(ctx, "packages/db/src/schema/index.ts")` — a real-tree ANCHOR, because a legacy conformance
// example loads whatever the example declares. The final population is EXACTLY the registry home, so an
// ABSENT home admits nothing and the runtime REFUSES at the population phase (louder than the legacy's
// silent skip, and pinned in the family test), and a narrowed request DEFERS the policy. The anchor and its
// `fileLoaded` call therefore RETIRE; nothing else about the verdict moves.
//
// THE ANCHOR MOVE (§4.6): the legacy finding was a file finding at `line: 0, column: 0`. The final contract
// requires positive coordinates (`policy-pass-context.ts` `assertCoordinate`), so it anchors at line 1,
// column 1 of the same file. No marker ever bound to it — the arm was non-suppressible by construction and
// the census measured ZERO live markers for this id.
//
// Legacy descriptor: `9e2eca320` (`tooling/src/verify/gates/testid-liveness.ts`, arm A3).
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { TESTID_REGISTRY_CONST, TESTID_REGISTRY_HOME, testIdRegistryRow } from "../lib/testid-registry.ts";

const MESSAGE =
  `testid-liveness read ZERO rows out of \`${TESTID_REGISTRY_CONST}\` in ${TESTID_REGISTRY_HOME}: the registry moved, was ` +
  "renamed, or stopped being an object literal of string rows, and both of its liveness arms (a dead consumer, a dead " +
  "registry row) are now silently green — a gate that reports ✓ over every dead test-id on the tree. Re-point the family " +
  "at the registry's new home in lib/testid-registry.ts.";

export const gate = defineGate({
  id: "testid-liveness-health",
  family: "testid-liveness",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"], under: [TESTID_REGISTRY_HOME] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: `Restore \`export const ${TESTID_REGISTRY_CONST} = { <key>: "<value>", … } as const;\` in ${TESTID_REGISTRY_HOME}, or re-point TESTID_REGISTRY_HOME / TESTID_REGISTRY_CONST in tooling/src/verify/lib/testid-registry.ts at the registry's new home and const name.`,
  create: (ctx) => {
    let rows = 0;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node) => {
            if (testIdRegistryRow(node) !== undefined) {
              rows += 1;
            }
          },
        },
      ],
      evaluate: () => {
        // A CONSTANT denominator, never the census (§12.3): a receipt of `rows` would make an empty registry
        // a receipt TOOL ERROR and the finding below could never be reached — the accuser silenced by the
        // very thing it accuses.
        ctx.receipt({ kind: "population", source: "testid-registry-home", members: 1, unresolved: 0 });
        if (rows === 0) {
          ctx.report.file(TESTID_REGISTRY_HOME, { line: 1, column: 1, message: MESSAGE });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: 'export const IDS = {\n  appShell: "app-shell",\n} as const;\n' },
      expect: { count: 1, line: 1, messageIncludes: "read ZERO rows" },
      why: "arm A3 as carried: the registry file is present and the const it is looked up BY NAME is gone — the rename that makes both liveness arms a permanent no-op. Opening the owner-name fence (accept any variable declaration) turns this row GREEN, which is a tripwire's falsifier direction (§4.1: its fences ACQUIT)",
    },
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: 'import { build } from "./build.ts";\nexport const TEST_IDS = build();\n' },
      expect: { count: 1, line: 1, messageIncludes: "read ZERO rows" },
      why: "the const survives but stopped being an authored object literal, so the reader yields nothing — the shape a name-only check would call healthy",
    },
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: "const shell = {};\nexport const TEST_IDS = {\n  appShell: shell,\n} as const;\n" },
      expect: { count: 1, line: 1, messageIncludes: "read ZERO rows" },
      why: "every row's VALUE stopped resolving to an authored string, so no row promises a DOM value any more. Opening the string-value fence (accept any initializer) turns this row GREEN — the second acquitting fence, cut in the tripwire direction",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  appShell: "app-shell",\n  loginPage: "login-page",\n} as const;\n' },
      why: "the live shape — an object literal of string rows under the named const — keeps the tripwire quiet",
    },
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  "app-shell": "app-shell",\n} as const;\n' },
      why: 'a QUOTED key is still an authored row: the reader normalizes the key the way `testId("k")` spells it, and the tripwire judges readability rather than key spelling',
    },
    {
      mode: "source",
      files: { [TESTID_REGISTRY_HOME]: 'const other = { notARow: 1 };\nexport const TEST_IDS = {\n  appShell: "app-shell",\n} as const;\n' },
      why: "a sibling object in the same file is not a registry row and cannot keep the tripwire quiet on its own — the owner fence is what decides, proven by mustFlag[0] going green when it is opened",
    },
  ],
});
