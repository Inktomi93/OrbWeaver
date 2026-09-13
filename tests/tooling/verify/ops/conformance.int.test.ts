// The PERMANENT PIN for BOTH of the conformance harness's substrates — the fs-backed door (#779, first
// half) and the amortized in-memory door (#780, second half). One file because they are one contract: what
// project a gate's example is proven against.
//
// ── #779, the fs-backed substrate ──────────────────────────────────────────────────────────────────────
// The substrate used to
// re-DISCOVER the files it had just written with a recursive glob per example — measured 50.7ms against
// 0.7ms for the known-path door — and across 330 fs-backed examples that glob WAS the bite-proof's runtime
// (43s against its 45s budget). The resolve-once rewrite is only safe if the project it hands a gate is the
// SAME SET as before, so the two halves of that contract are pinned here rather than left to a one-shot
// measurement: every materialized `.ts`/`.tsx` reaches the gate's project, and every NON-TS file it writes
// stays on DISK and OUT of it (dangling-refs plants `.md`, over-art-plate-arm a stylesheet, a ratchet gate
// its baseline — each read through the gate's own `readFileSync`, and each a parse error if it were added).
// Driven through the REAL `verifyGateProofs`, with a synthetic descriptor that records what it was fed.
//
// ── #780, the in-memory substrate ──────────────────────────────────────────────────────────────────────
// That door used to build a FRESH ts-morph `Project` per example; ~105ms of every one of the ~1500 in-memory
// examples was TypeScript parsing lib.d.ts on that project's first type query. It now reuses ONE Project,
// giving each example its own virtual root (`ops/conformance.ts#loadInMemoryExample`).
//
// WHY A PIN AND NOT A ONE-SHOT MEASUREMENT. "Conformance still passes" is NOT evidence that an amortized
// substrate is equivalent: a contaminated run can satisfy every mustFlag/mustPass by accident. Only a
// FINDING-level comparison catches it, and it caught two distinct corruption classes:
//
//   1. PATH REUSE (the one that bit). Removing a file and re-creating the next example at the SAME virtual
//      path makes ts-morph's language service serve the PREVIOUS document's snapshot — a re-created
//      SourceFile restarts its script version, so `Identifier.getDefinitionNodes()` comes back empty or
//      pointing at stale positions, and every gate that resolves declarations through the LS silently
//      changes verdict. Measured on baseui-portal-container-seam: fresh `defs=[BindingElement@L6]`,
//      reused-path `defs=[]`. The unique root per example is the fix, and `pathReusingLoad` below is the
//      pre-fix spelling kept as a POSITIVE CONTROL: it must still corrupt, or this pin proves nothing.
//   2. A GATE CACHING ON PROJECT IDENTITY (GATE-AUTHORING §12). A `WeakMap<Project, …>` memo is only ever
//      correct because the substrate happened to throw the key away every example; on the shared Project it
//      serves a previous example's derivation (#751's `detached-work-traced` was a real one).
//      `projectKeyedGate` below plants that class as the second positive control.
//
// The #780 half is also the integration guard for #751: when that branch's `caught-failure-ownership` gate
// lands, its examples join the corpus sweep here automatically — no coupled edit.
//
// ── the corpus is MIXED, and the floor is no longer a number (#1969, 2026-09-11) ────────────────────────
// The equivalence property above is about a SUBSTRATE, not about a descriptor contract, and both runtimes
// amortize the same way: `ops/conformance.ts#loadInMemoryExample` gives each legacy example a unique
// virtual root on one shared Project, and `ops/policy-conformance.ts#runVirtualExample` does exactly that
// for every FINAL policy. So the sweep walks BOTH halves.
//
// It used to assert `compared > 1000` against the LEGACY corpus alone. `loadGates` returns the legacy
// remnant (`lib/loader.ts:190`), which the #1584 program exists to drive to ZERO — so that floor was a
// countdown wearing a gate's clothes: it stood at 749 and falling, red for reasons that had nothing to do
// with the substrate, and re-read as a fresh finding on every verifier pass. Lowering the constant buys
// one batch and re-breaks. The intent was never "at least N": it was "the harness actually compared the
// corpus rather than silently skipping it", so the floor is now EXACTLY that — the sweep's own count must
// equal the eligible corpus count computed outside the sweep, and the corpus must be non-empty. The
// final count shares the sweep's proof selector: this detects skipped execution, not selector omissions. That
// property holds identically at 749 legacy examples, at 2,400 mixed ones, and on the day the legacy
// roster empties.
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { withProcessEnv } from "../../../../tooling/src/_shared/process-env.ts";
import type { GateDescriptor, GateExample, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { loadInMemoryExample, verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** Every file an example materializes: TS sources the gate must SEE, and the sidecars it must not. */
const EXAMPLE_FILES: Readonly<Record<string, string>> = {
  "packages/server/src/domain/probe/substrate/logic.ts": "export const probe = (n: number): number => n + 1;\n",
  "packages/ui/src/probe/probe.tsx": "export const Probe = () => null;\n",
  "docs/architecture/core/Probe-Doc.md": "# a doc an fs-backed gate reads off disk\n",
  "packages/client/src/styles/probe.css": ".probe {\n  color: red;\n}\n",
  "tooling/src/verify/gates/probe.baseline.json": "{}\n",
};

const TS_MEMBERS: readonly string[] = ["packages/server/src/domain/probe/substrate/logic.ts", "packages/ui/src/probe/probe.tsx"];

/** A descriptor that exists only to REPORT its substrate: it records the project's file set (repo-relative)
 *  and flags nothing, so it must pass its own mustPass row. */
function recordingGate(seen: string[]): GateDescriptor {
  return {
    name: "probe-substrate-recorder",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    fsBacked: true,
    message: "unreachable — this descriptor never reports (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      for (const sf of ctx.project.getSourceFiles()) {
        seen.push(sf.getFilePath().slice(ctx.root.length + 1));
      }
    },
    mustFlag: [],
    mustPass: [{ files: EXAMPLE_FILES, why: "the substrate probe: nothing to flag, so the recorder must pass its own proof" }],
  };
}

test("the fs-backed substrate feeds the gate EXACTLY the materialized TS sources — no glob, no sidecars", ({ repoRoot }) => {
  expect(repoRoot).toBeTruthy();
  const seen: string[] = [];

  const failures = verifyGateProofs([recordingGate(seen)]);

  // The recorder passing is the positive control: an empty project would ALSO report zero findings, so the
  // file-set assertion below is what distinguishes "fed correctly" from "fed nothing".
  expect(failures).toEqual([]);
  expect([...seen].sort()).toEqual([...TS_MEMBERS].sort());
});

test("a gate that DOES flag still bites in the fs-backed substrate — the resolve-once door loads real content", ({ repoRoot }) => {
  expect(repoRoot).toBeTruthy();
  const biting: GateDescriptor = {
    name: "probe-substrate-biter",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    fsBacked: true,
    message: "the probe source declares `probe` (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      for (const sf of ctx.project.getSourceFiles()) {
        if (sf.getVariableDeclaration("probe") !== undefined) {
          ctx.report({ file: sf.getFilePath().slice(ctx.root.length + 1), line: 1, column: 0 });
        }
      }
    },
    // Content, not just presence: the declaration is read out of the file the substrate wrote.
    mustFlag: [{ files: EXAMPLE_FILES, expect: { count: 1 }, why: "the bite direction — a file loaded with no CONTENT would pass this vacuously" }],
    mustPass: [{ files: { "packages/server/src/domain/probe/substrate/other.ts": "export const other = 1;\n" }, why: "a source without the declaration" }],
  };

  expect(verifyGateProofs([biting])).toEqual([]);
});

// ── #2333: fixture destinations stay under the owned root ──────────────────────────────────────────────

/** Each spelling the repo-relative grammar refuses; the first two are real escapes from a `join(root, key)`. */
const MALFORMED_DESTINATIONS: readonly string[] = [
  "../escaped.ts",
  "packages/../../escaped.ts",
  "/absolute.ts",
  "C:/drive.ts",
  "packages\\..\\..\\escaped.ts",
  "./dot.ts",
  "packages//empty.ts",
  "packages/trailing/",
];

function destinationGate(key: string, fsBacked: boolean): GateDescriptor {
  return {
    name: "probe-destination-grammar",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    ...(fsBacked ? { fsBacked: true } : {}),
    message: "unreachable — this descriptor never reports (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (): void => undefined,
    mustFlag: [],
    mustPass: [{ files: { [key]: "export const escaped = 1;\n" }, why: "a destination key outside the repo-relative grammar" }],
  };
}

test("both legacy substrates refuse a malformed destination key before any write, and healthy keys still land (#2333)", async ({ scratch }) => {
  // TMPDIR points the fs-backed mkdtemp into a reviewer-owned directory, so `../escaped.ts` from that root
  // would land HERE, where the assertion below can see it.
  const owned = join(scratch, "tmp");
  mkdirSync(owned);
  await withProcessEnv("TMPDIR", owned, () => {
    for (const key of MALFORMED_DESTINATIONS) {
      for (const fsBacked of [true, false]) {
        let refusal: unknown;
        try {
          verifyGateProofs([destinationGate(key, fsBacked)]);
        } catch (error) {
          refusal = error;
        }
        // The escape assertion comes FIRST: against the pre-fix runner it names the escaped file in OWNED.
        expect(readdirSync(owned), `${key} fsBacked=${String(fsBacked)}`).toEqual([]);
        expect(String(refusal), `${key} fsBacked=${String(fsBacked)}`).toMatch(
          /example destination (?:must be a repo-relative POSIX path|has an invalid path segment)/u,
        );
      }
    }
    // CONTROL: an installed-package file and a nested authored file are valid destinations on both substrates.
    const healthy = { "node_modules/pkg/index.ts": "export const pkg = 1;\n", "packages/server/src/domain/probe/x.ts": "export const x = 1;\n" };
    for (const fsBacked of [true, false]) {
      expect(verifyGateProofs([{ ...destinationGate("unused.ts", fsBacked), mustPass: [{ files: healthy, why: "valid destinations" }] }])).toEqual([]);
    }
    expect(readdirSync(owned)).toEqual([]);
    return Promise.resolve();
  });
});

test("both legacy substrates refuse a .git control destination in any case before any write (#2333)", async ({ scratch }) => {
  // The legacy fs door runs `git init` BEFORE its writes and no git afterward, so a planted `.git/config` is
  // inert there today (measured by cb-v-2333). The refusal keeps every fixture door on one destination
  // contract, so a later git step on this door cannot reopen the final runner's command-execution vector.
  const owned = join(scratch, "tmp");
  mkdirSync(owned);
  await withProcessEnv("TMPDIR", owned, () => {
    for (const key of [".git/config", ".GIT/config", "packages/x/.Git/HEAD"]) {
      for (const fsBacked of [true, false]) {
        let refusal: unknown;
        try {
          verifyGateProofs([destinationGate(key, fsBacked)]);
        } catch (error) {
          refusal = error;
        }
        expect(readdirSync(owned), `${key} fsBacked=${String(fsBacked)}`).toEqual([]);
        expect(String(refusal), `${key} fsBacked=${String(fsBacked)}`).toMatch(/example destination names a \.git control segment/u);
      }
    }
    return Promise.resolve();
  });
});

// ── #780: the in-memory substrate equivalence sweep ────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const VROOT = "/repo";
const DEFAULT_EXAMPLE_PATH = "packages/ui/src/x/x.tsx";
const EXAMPLE_PATH_CANDIDATES: readonly string[] = [
  DEFAULT_EXAMPLE_PATH,
  "packages/client/src/features/x/components/x.tsx",
  "packages/server/src/domain/x/x.ts",
  "packages/db/src/schema/x.ts",
  "tests/tooling/x.ts",
];

/** The example's file map, resolving the single-snippet form to its `at`. Restated rather than imported:
 *  this pin is the SECOND opinion on `ops/conformance.ts`, so sharing its resolution would make the
 *  reference side of the comparison circular. Only the LOADER under test is imported. */
function filesOf(ex: GateExample, gate: GateDescriptor): Record<string, string> {
  if (typeof ex.files !== "string") {
    return { ...ex.files };
  }
  const fallback =
    gate.scanRoot === undefined ? DEFAULT_EXAMPLE_PATH : (EXAMPLE_PATH_CANDIDATES.find((p) => gate.scanRoot?.(p) === true) ?? DEFAULT_EXAMPLE_PATH);
  return { [ex.at ?? fallback]: ex.files };
}

/** One example's full verdict — every finding spelled out, plus tool errors. Pass/fail is exactly what a
 *  contaminated run can satisfy by accident, so the comparison is made on this instead. */
function verdictOf(gate: GateDescriptor, project: Project, root: string): string {
  const asActive: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
  const result = runPass([asActive], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  const own = result.gates.find((g) => g.name === gate.name);
  const body = JSON.stringify({
    toolErrors: result.toolErrors.map((e) => `${e.phase}:${e.message}`).sort(),
    findings: (own?.findings ?? []).map((f) => `${f.file}|${f.line}|${f.column}|${f.token ?? ""}|${f.message ?? ""}`).sort(),
  });
  // The root differs by construction on the amortized side; normalize it so the comparison is about the
  // VERDICT, never about which virtual directory the example happened to land in.
  return body.split(root).join(VROOT);
}

/** The reference substrate: a fresh Project per example, exactly as the harness worked before #780. */
function freshVerdict(gate: GateDescriptor, files: Readonly<Record<string, string>>): string {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${VROOT}/${rel}`, text);
  }
  return verdictOf(gate, project, VROOT);
}

/** THE POSITIVE CONTROL for corruption class 1 — the pre-#780 amortization: one Project, previous files
 *  removed, every example re-created at the SAME virtual path. Kept here so the language-service
 *  stale-snapshot behaviour that made that unsafe stays PROVEN rather than remembered. */
function pathReusingLoad(project: Project, files: Readonly<Record<string, string>>): string {
  for (const previous of project.getSourceFiles()) {
    project.removeSourceFile(previous);
  }
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${VROOT}/${rel}`, text);
  }
  return VROOT;
}

/** Run every in-memory example of `gates` on both substrates and return the examples whose FINDINGS differ.
 *  `load` is the amortized loader under test — the shipped one, or a control. */
function sweep(
  gates: readonly GateDescriptor[],
  load: (project: Project, files: Readonly<Record<string, string>>) => string,
): { readonly compared: number; readonly mismatches: readonly string[] } {
  const shared = new Project({ useInMemoryFileSystem: true });
  const mismatches: string[] = [];
  let compared = 0;
  for (const gate of gates) {
    if (gate.fsBacked === true) {
      continue;
    }
    for (const [arm, examples] of [
      ["mustFlag", gate.mustFlag],
      ["mustPass", gate.mustPass],
    ] as const) {
      for (const [i, ex] of examples.entries()) {
        const files = filesOf(ex, gate);
        const before = freshVerdict(gate, files);
        const after = verdictOf(gate, shared, load(shared, files));
        compared += 1;
        if (before !== after) {
          mismatches.push(`${gate.name} ${arm}[${i}] fresh=${before} amort=${after}`);
        }
      }
    }
  }
  return { compared, mismatches };
}

/** A FINAL policy's proofs that live on the amortized in-memory substrate. `resource` proofs materialize a
 *  real temp tree with its own Project (`ops/policy-conformance.ts#runResourceExample`) and are the final
 *  runtime's `fsBacked` — the same exclusion, for the same reason. */
function virtualProofsOf(policy: GatePolicy): readonly GatePolicyProof[] {
  return policyProofRows(policy)
    .map(({ proof }) => proof)
    .filter((proof) => proof.mode !== "resource");
}

/** One FINAL policy example's full verdict, spelled out exactly like the legacy `verdictOf` so the two
 *  halves of the sweep are comparable prose. Restated rather than imported for the same reason: this pin
 *  is the SECOND opinion on the production runtime, so sharing its example loader would be circular. */
function policyVerdictOf(policy: GatePolicy, project: Project, root: string): string {
  const result = runPolicyPass({ knownPolicies: [policy], policies: [policy], root, project, reviewedGrants: [], failOnWarnings: false });
  const own = result.policies.find((p) => p.id === policy.id);
  const body = JSON.stringify({
    toolErrors: result.toolErrors.map((e) => `${e.phase}:${e.message}`).sort(),
    findings: (own?.findings ?? []).map((f) => `${f.file}|${f.line}|${f.column}|${f.token ?? ""}|${f.message ?? ""}`).sort(),
  });
  return body.split(root).join(VROOT);
}

/** The FINAL half of the differential: a fresh Project per example against the amortized shared one. Same
 *  shape as `sweep`, kept separate because the two runtimes take different inputs and neither adapts. */
function policySweep(policies: readonly GatePolicy[]): { readonly compared: number; readonly mismatches: readonly string[] } {
  const shared = new Project({ useInMemoryFileSystem: true });
  const mismatches: string[] = [];
  let compared = 0;
  let sequence = 0;
  for (const policy of policies) {
    for (const proof of virtualProofsOf(policy)) {
      sequence += 1;
      const fresh = new Project({ useInMemoryFileSystem: true });
      for (const [rel, text] of Object.entries(proof.files)) {
        fresh.createSourceFile(`${VROOT}/${rel}`, text);
      }
      const before = policyVerdictOf(policy, fresh, VROOT);
      // The amortized substrate: ONE Project, a UNIQUE root per example, previous files removed — the
      // production spelling at `ops/policy-conformance.ts#runVirtualExample`.
      for (const previous of shared.getSourceFiles()) {
        shared.removeSourceFile(previous);
      }
      const root = `${VROOT}-${String(sequence)}`;
      for (const [rel, text] of Object.entries(proof.files)) {
        shared.createSourceFile(`${root}/${rel}`, text);
      }
      const after = policyVerdictOf(policy, shared, root);
      compared += 1;
      if (before !== after) {
        mismatches.push(`${policy.id} proof[${String(sequence)}] fresh=${before} amort=${after}`);
      }
    }
  }
  return { compared, mismatches };
}

// ── the two planted corruption classes ─────────────────────────────────────────────────────────────────

const PROBE_AT = "packages/server/src/domain/probe/substrate/probe.ts";

/** The four sources are a REDUCTION of `baseui-portal-container-seam`'s own example sequence — the one
 *  measured to corrupt. The corruption is not reproduced by a two-line snippet: it needs a run of examples
 *  at one path whose text shifts the positions the stale snapshot is indexed by, which is why the control
 *  keeps a sequence rather than a pair. Measured on the pre-#780 loader: examples 0-2 agree, example 3
 *  reports 3 unresolved `container` identifiers against 0 on a fresh Project. */
const CONTAINER_SEQUENCE: readonly string[] = [
  'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface Props {\n  className?: string;\n}\nexport const P = (_p: Props) => <BaseDialog.Portal />;\n',
  'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface Props {\n  container?: unknown;\n}\nexport const P = (_p: Props) => <BaseDialog.Portal />;\n',
  'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface Props {\n  container?: unknown;\n}\nexport const P = ({ container }: Props) => <BaseDialog.Portal container={container} />;\nexport const Q = (_p: Props) => <BaseDialog.Portal />;\n',
  'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nimport type { DialogPortalProps as BasePortalProps } from "@base-ui/react/dialog";\nexport interface Props {\n  container?: BasePortalProps["container"];\n}\nexport const P = ({ container }: Props) => (\n  <BaseDialog.Portal container={container}>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
];

const PROBE_TSX_AT = "packages/ui/src/primitives/dialog/probe-dialog.tsx";

/** A gate whose verdict rides `getDefinitionNodes` — the language-service dependence that path reuse
 *  corrupts. It flags a `container` identifier that resolves to NOTHING, which is exactly what a stale
 *  snapshot produces and what a correct substrate never does for these examples. */
function definitionResolvingGate(): GateDescriptor {
  return {
    name: "probe-definition-resolver",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "incremental-safe",
    message: "a `container` identifier resolved to no declaration (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      for (const sf of ctx.project.getSourceFiles()) {
        for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
          if (id.getText() === "container" && id.getDefinitionNodes().length === 0) {
            ctx.report(id);
          }
        }
      }
    },
    mustFlag: [],
    mustPass: CONTAINER_SEQUENCE.map((files, i) => ({
      files,
      at: PROBE_TSX_AT,
      why: `control step ${i} — every \`container\` reference resolves on a correct substrate; on a path-reusing one the language service answers from an earlier step's document`,
    })),
  };
}

/** A gate memoizing a derivation on PROJECT IDENTITY — correct only while the substrate throws the key away
 *  every example, which is precisely the assumption #780 retired. */
function projectKeyedGate(): GateDescriptor {
  const memo = new WeakMap<Project, number>();
  return {
    name: "probe-project-keyed-cache",
    docRow: "GATE-AUTHORING.md §6",
    status: "active",
    scopeSafety: "whole-project",
    message: "the memoized declaration count is odd (tests/tooling/verify/ops/conformance.int.test.ts).",
    run: (ctx: GateRunCtx): void => {
      let count = memo.get(ctx.project);
      if (count === undefined) {
        count = ctx.project.getSourceFiles().reduce((n, sf) => n + sf.getVariableDeclarations().length, 0);
        memo.set(ctx.project, count);
      }
      if (count % 2 === 1) {
        ctx.report({ file: PROBE_AT, line: count, column: 0 });
      }
    },
    mustFlag: [],
    mustPass: [
      { files: "export const a = 1;\n", at: PROBE_AT, why: "one declaration — the odd arm, so this example legitimately flags on either substrate" },
      {
        files: "export const c = 1;\nexport const d = 2;\n",
        at: PROBE_AT,
        why: "two declarations — even, so a correct substrate flags nothing and a stale memo still says odd",
      },
    ],
  };
}

// ── the pins ───────────────────────────────────────────────────────────────────────────────────────────

test("the in-memory substrate reuses ONE Project and never re-creates a virtual path", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const first = loadInMemoryExample(project, { [PROBE_AT]: "export const a = 1;\n" });
  const firstFiles = project.getSourceFiles().map((sf) => sf.getFilePath());
  const second = loadInMemoryExample(project, { [PROBE_AT]: "export const b = 2;\n", "packages/ui/src/probe/probe.tsx": "export const P = () => null;\n" });

  expect(first).not.toEqual(second);
  expect(firstFiles).toEqual([`${first}/${PROBE_AT}`]);
  // The previous example's files are GONE — a gate reads exactly its own example's corpus.
  expect(
    project
      .getSourceFiles()
      .map((sf) => sf.getFilePath())
      .sort(),
  ).toEqual([`${second}/${PROBE_AT}`, `${second}/packages/ui/src/probe/probe.tsx`].sort());
});

test("PATH REUSE corrupts a language-service gate, and the shipped loader does not", () => {
  const gate = definitionResolvingGate();

  // The control must BITE: this is the pre-#780 substrate, and it must still change the verdict.
  const control = sweep([gate], pathReusingLoad);
  expect(control.compared).toBe(CONTAINER_SEQUENCE.length);
  expect(control.mismatches.length).toBeGreaterThan(0);

  // The shipped loader, over the same examples, must be equivalent to a fresh Project per example.
  expect(sweep([gate], loadInMemoryExample)).toEqual({ compared: CONTAINER_SEQUENCE.length, mismatches: [] });
});

test("a gate caching on PROJECT IDENTITY is caught by the equivalence sweep", () => {
  const caught = sweep([projectKeyedGate()], loadInMemoryExample);

  expect(caught.compared).toBe(2);
  // Conformance alone would NOT see this: the stale memo happens to keep the first example passing too.
  expect(caught.mismatches.length).toBeGreaterThan(0);
});

// LOAD-HONEST BUDGET, same lever as the bite-proof's (#606): the sweep runs every in-memory example of the
// MIXED corpus TWICE (the fresh reference side is the expensive half and is the whole point), so the budget
// scales with contention rather than false-timing-out under multi-lane load. The base was 90s for the
// legacy half alone (~24s solo at 749 examples); the final half roughly quadruples the example count, so
// the base moves with it rather than leaving a timeout to read like a substrate red.
const SWEEP_BUDGET = scaledBudget(300_000, 4);

test(
  "every in-memory conformance example — LEGACY and FINAL alike — yields IDENTICAL findings on the amortized substrate",
  async () => {
    const corpus = await loadMixedGateCorpus(ROOT);
    const legacy = sweep(corpus.legacy, loadInMemoryExample);
    const final = policySweep(corpus.final);

    // THE FLOOR IS A PROPERTY, NOT A NUMBER (#1969). What this asserts is "the sweep compared EVERY eligible example
    // the corpus offers, and the corpus offered something" — a bare zero is "I could not measure", and a
    // count below the eligible corpus's own is silently skipped execution. These counts do not depend on
    // the sweeps' counters, so skipping an eligible proof inside a sweep is detected. The final count and sweep both use
    // `virtualProofsOf`: this assertion does not independently verify that selector's membership.
    const legacyExamples = corpus.legacy.filter((g) => g.fsBacked !== true).reduce((n, g) => n + g.mustFlag.length + g.mustPass.length, 0);
    const finalExamples = corpus.final.reduce((n, p) => n + virtualProofsOf(p).length, 0);
    expect(
      legacyExamples + finalExamples,
      "the mixed corpus offered NO in-memory example — the loader is broken, or nothing survived to compare",
    ).toBeGreaterThan(0);
    expect(legacy.compared + final.compared, "the differential skipped examples the corpus offers — it is measuring less than it claims").toBe(
      legacyExamples + finalExamples,
    );

    expect(legacy.mismatches).toEqual([]);
    expect(final.mismatches).toEqual([]);
  },
  SWEEP_BUDGET,
);
