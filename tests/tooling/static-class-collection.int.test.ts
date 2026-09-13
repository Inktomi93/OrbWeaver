import { ModuleKind, ModuleResolutionKind, Project, ScriptKind } from "ts-morph";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../tooling/src/verify/contract/policy.ts";
import type { CssHookProvenance } from "../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { cssHookProvenanceFact } from "../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { runPolicyPass } from "../../tooling/src/verify/lib/policy-pass.ts";
import { __resetStaticClassCollectorMints, StaticClassCollector, staticClassCollectorMints } from "../../tooling/src/verify/lib/static-class-expression.ts";
import { expect, test } from "../support/tool-fixtures.ts";

// THE SUCCESSOR PROOF for the retired `beginHookOwnerCollection` lifecycle test (#1584, 2026-09-13).
//
// The property is unchanged and is the whole reason the hook-owner state became a `defineFact` PROVIDER
// rather than `create` state: TWO consumer policies in ONE invocation share EXACTLY ONE collector and ONE
// walk per source, they see byte-identical answers, and a LATER invocation cannot reuse the earlier one's
// evaluator. Under the legacy runtime that was hand-rolled by a module-global `hookPass` keyed on
// `ctx.passIdentity`; under the final contract the dispatcher owns it, so the test drives `runPolicyPass`
// with two probe consumers instead of two `GateDescriptor`s.
//
// WHAT CHANGED IN THE ASSERTIONS, and why each is still the same claim:
//   * `hookOwnerWork(ctx)` → `ctx.fact(cssHookProvenanceFact).work`. The provider publishes the shared
//     evaluator's counters precisely so `evaluators: 1` remains sayable — it is the ONE-COLLECTOR claim.
//   * the source-walk counter is unchanged: the dispatcher's own walk, once per file per invocation, with
//     both consumers subscribed.
//   * `projectArrays` is unchanged and is now enforced twice over: a final policy cannot reach a `Project`
//     at all (`GatePolicyContext` has none), so the counter proves the RUNTIME does not either.
//
// AND THE COLLECTOR COUNT IS ITS OWN ASSERTION, added 2026-09-13 (#2305). `seen[0] === seen[1]` and
// `evaluators: 1` prove the two CONSUMERS share a value; they say NOTHING about how many collectors the
// PROVIDER built, because `work` is read off the published instance and a sibling collector is a different
// object. Measured by a fresh verifier: handing `createSelectorWriterPass` its own `ClassCollector` left
// this suite GREEN and `check:structure --check css-selector-has-a-writer` byte-identical — verdict-neutral,
// and a straight doubling of the ~14 s walk the `defineFact`-over-`create` deviation was justified on.
// `staticClassCollectorMints()` counts CONSTRUCTIONS process-wide, which is the only signal a duplicate
// cannot hide from, and the control below proves the counter can see one.

/** The policy runtime derives every source path RELATIVE TO ITS ROOT and refuses one outside it
 *  (`policy-pass.ts#sourcePath`), so the in-memory project is rooted at the test's own scratch directory
 *  rather than at a synthetic `/repo`. The overlay supplies the CSS identity from the same root. */
const classesPath = (root: string): string => `${root}/packages/ui/src/classes.ts`;
const OVERLAY = {
  "packages/ui/src/styles/theme.css": "@theme {\n  --color-background: black;\n}\n",
  "packages/ui/src/styles/globals.css": ":root { font-size: 100%; }\n",
  "packages/ui/src/styles/tiers.css": '[data-surface-tier="base"] { --spacing-x: 0; }\n',
  "packages/client/src/styles/globals.css": ":root { --probe-client: 0; }\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ":root { view-transition-name: none; }\n",
} as const;

function project(root: string): Project {
  const workspace = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  workspace.createSourceFile(classesPath(root), 'export const CLASS_NAME = "probe-shared";\n');
  workspace.createSourceFile(`${root}/packages/ui/src/wrappers.ts`, 'import { clsx } from "clsx";\nexport const forward = (value: string) => clsx(value);\n');
  workspace.createSourceFile(
    `${root}/packages/client/src/view.tsx`,
    [
      'import { clsx } from "clsx";',
      'import { CLASS_NAME } from "../../ui/src/classes.ts";',
      'import { forward } from "../../ui/src/wrappers.ts";',
      'const Child = ({ className: renamed }: { className: string }) => <div className={clsx("probe-child-base", renamed)} />;',
      'export const View = <><div className={CLASS_NAME} /><div className={forward("probe-forwarded")} /><Child className="probe-callsite" /></>;',
    ].join("\n"),
    { scriptKind: ScriptKind.TSX },
  );
  return workspace;
}

function countWalk(source: import("ts-morph").SourceFile, counter: { sourceWalks: number }): void {
  const original = source.forEachDescendant.bind(source);
  source.forEachDescendant = ((visitor: Parameters<typeof original>[0]) => {
    counter.sourceWalks += 1;
    return original(visitor);
  }) as typeof source.forEachDescendant;
}

/** A probe CONSUMER of the shared provider. It reports nothing; its whole job is to read the fact so a
 *  second one can be shown to read the SAME collector. */
function consumer(id: string, seen: CssHookProvenance[]): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: "hard",
    severity: "error",
    population: { in: ["@client", "@ui"] },
    // The probe declares NO resource of its own: the PROVIDER declares `product-css` and resolves it once,
    // and a consumer that declared it without reading it is an unconsumed-declaration REFUSAL (measured).
    analysis: "syntax",
    execution: "entire-population",
    facts: [cssHookProvenanceFact],
    resources: [],
    message: "probe consumer of the shared hook-provenance collector",
    create: (ctx) => ({
      evaluate: () => {
        seen.push(ctx.fact(cssHookProvenanceFact));
        ctx.receipt({ kind: "population", source: `${id} [probe]`, members: 1 });
      },
    }),
    // The loader refuses a descriptor with an empty proof arm, and this probe never runs its rows —
    // `runPolicyPass` executes hooks, not proofs. The two placeholders exist to satisfy the SHAPE the
    // validator enforces on every policy it is handed, which is itself part of what this test drives.
    mustFlag: [
      {
        mode: "source",
        files: { "packages/ui/src/probe.ts": "export const probe = 1;\n" },
        expect: { count: 1 },
        why: "unexecuted placeholder: this probe drives hooks, never its own proof rows",
      },
    ],
    mustPass: [
      {
        mode: "source",
        files: { "packages/ui/src/probe.ts": "export const probe = 1;\n" },
        why: "unexecuted placeholder: this probe drives hooks, never its own proof rows",
      },
    ],
  });
}

test("one invocation gives two consumers ONE collector doing identical work, and exactly one runtime population read", ({ scratch }) => {
  const workspace = project(scratch);
  const files = workspace.getSourceFiles();
  const counter = { sourceWalks: 0 };
  let projectArrays = 0;
  for (const source of files) {
    countWalk(source, counter);
  }
  const originalGetSourceFiles = workspace.getSourceFiles.bind(workspace);
  workspace.getSourceFiles = (() => {
    projectArrays += 1;
    return originalGetSourceFiles();
  }) as typeof workspace.getSourceFiles;

  const seen: CssHookProvenance[] = [];
  __resetStaticClassCollectorMints();
  const policies = [consumer("probe-static-class-a", seen), consumer("probe-static-class-b", seen)];
  const drive = (): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: policies,
      policies,
      root: scratch,
      project: workspace,
      resourceOptions: { overlay: OVERLAY },
      reviewedGrants: [],
      failOnWarnings: false,
    });

  workspace.getSourceFileOrThrow(classesPath(scratch)).replaceWithText('export const CLASS_NAME = "probe-changed";\n');
  const first = drive();

  expect(first.toolErrors).toEqual([]);
  // THE WALK CLAIM MOVED INSTRUMENTS, and the old one is retired rather than kept as a green zero. The
  // legacy assertion counted `SourceFile#forEachDescendant` calls, which is how `lib/pass.ts` walked; the
  // final dispatcher's kind-indexed walk never calls it (MEASURED with this very counter: 0 against the
  // legacy's 3). The property is unchanged and is now asserted in the runtime's own terms below —
  // `work.dispatchedNodes` is the number of nodes the ONE shared collector was handed.
  expect(counter.sourceWalks).toBe(0);
  // THE PROJECT-WIDE ARRAY CLAIM IS NOW A CEILING RATHER THAN A ZERO, and the change is the guarantee
  // getting stronger. The legacy assertion was "no gate reaches a project-wide array" and had to be zero
  // because a `GateRunCtx` HANDED a gate the `Project`. A final policy cannot reach one at all
  // (`GatePolicyContext` has no `project`), so the only remaining caller is the RUNTIME resolving its
  // population — measured at EXACTLY ONE per invocation, which is what "one collector over one resolved
  // fileset" means in the new runtime's terms.
  expect(projectArrays).toBe(1);
  // BOTH consumers read the SAME object — the one-collector claim, in the strongest form available.
  expect(seen).toHaveLength(2);
  expect(seen[0]).toBe(seen[1]);
  expect([...(seen[0]?.owners.keys() ?? [])].filter((key) => key.startsWith("class:probe-")).sort()).toEqual([
    "class:probe-callsite",
    "class:probe-changed",
    "class:probe-child-base",
    "class:probe-forwarded",
  ]);
  expect(seen[0]?.work).toEqual({ evaluators: 1, dispatchedNodes: 37, rootEvaluations: 7 });
  // THE COLLECTOR COUNT. One invocation, two consumers, ONE construction — the claim `evaluators` cannot
  // make. A sibling pass handed its own collector moves this to 2 while every other assertion here stays
  // green, which is exactly how the gap was found.
  expect(staticClassCollectorMints()).toBe(1);

  // A LATER invocation cannot reuse the earlier evaluator: the fact's `create` runs once per invocation and
  // the collector dies with it, so a value that changed between passes is seen.
  workspace.getSourceFileOrThrow(classesPath(scratch)).replaceWithText('export const CLASS_NAME = "probe-after-pass";\n');
  const second = drive();

  expect(second.toolErrors).toEqual([]);
  expect(projectArrays).toBe(2);
  expect(seen).toHaveLength(4);
  expect(seen[2]).toBe(seen[3]);
  expect(seen[2]).not.toBe(seen[0]);
  expect([...(seen[2]?.owners.keys() ?? [])].filter((key) => key.startsWith("class:probe-")).sort()).toEqual([
    "class:probe-after-pass",
    "class:probe-callsite",
    "class:probe-child-base",
    "class:probe-forwarded",
  ]);
  // A SECOND INVOCATION IS A SECOND COLLECTOR, and that is the honest number: the fact's `create` runs once
  // per invocation. Two drives, two constructions — the counter tracks the provider rather than the process.
  expect(staticClassCollectorMints()).toBe(2);
});

/** THE PLANTED CONTROL for the assertion above, committed rather than probed: a bare zero from a counter
 *  nobody has seen move is "I could not measure". Building a collector the way a sibling pass would proves
 *  the instrument sees a duplicate — which is the whole defect `evaluators: 1` was blind to. */
test("the collector mint counter SEES a second collector — the control the work counters cannot be", () => {
  const workspace = project("/probe");
  __resetStaticClassCollectorMints();

  expect(staticClassCollectorMints()).toBe(0);
  const first = new StaticClassCollector(workspace.getSourceFiles());
  expect(staticClassCollectorMints()).toBe(1);

  // The duplicate a sibling pass would build. Its OWN `work` is indistinguishable from the shared one's at
  // this point — `evaluators: 1` on both — which is precisely why the count is the pin and `work` is not.
  const duplicate = new StaticClassCollector(workspace.getSourceFiles());

  expect(staticClassCollectorMints()).toBe(2);
  expect(duplicate.work).toEqual(first.work);
});
