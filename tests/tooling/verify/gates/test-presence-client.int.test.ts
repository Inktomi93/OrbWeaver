// The PERMANENT PIN for `test-presence-client` (tooling/src/verify/gates/test-presence-client.ts), clause C
// — issue #619. (Named for the GATE, not the clause: a tooling test prefix-swaps to its tool's module,
// docs/architecture/core/Core-Tooling-Law.md §4.7 — `test-layout` reds any other spelling.) Clause C was SILENTLY INERT on 15 of the tree's 34 state stores: it resolved a store's mirror
// as `.ct.tsx` ONLY and `return []` when that path did not exist, so every `.test.ts`-mirrored store went
// UNJUDGED while the gate reported CLEAN. The gate's own header asserted "every existing state store mirror
// is a .ct.tsx, never a .test.ts" — false by 15 files. A clause that cannot run must never report clean.
//
// Conformance proves the matcher against synthetic mini-projects; THIS drives the REAL descriptor over
// planted temp trees in BOTH directions, and — the arm that actually keeps proving — asserts the LIVE tree's
// mirror-kind mix, so the day someone re-narrows the resolution to one suffix this goes red instead of quiet.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import { runtimeForTestFamily, TEST_KIND_DEFINITIONS } from "../../../../tooling/src/_shared/test-kinds.ts";
import type { Finding, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-presence-client.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STORE_REL = "packages/client/src/state/probe-store.ts";
const MIRROR_DIR = "tests/client/state";
const STORE_MIRROR_KINDS = TEST_KIND_DEFINITIONS.filter(({ family, mirror, sourceExtensions }) => {
  const runtime = runtimeForTestFamily(family);
  return mirror === "module" && sourceExtensions.includes(".ts") && (runtime === "vitest" || runtime === "playwright-ct");
}).map(({ suffix }) => suffix);

/** A store that mints via a real factory door and exports ONE action + one read hook. */
const STORE_SRC =
  'import { createGatedStore } from "./create-gated-store";\n' +
  'const useX = createGatedStore<{ n: number }>("probe", () => ({ n: 0 }));\n' +
  'export function probeAction(): void {\n  useX.setState({ n: 1 }, false, "x/set");\n}\n' +
  "export function useProbe(): number {\n  return useX((s) => s.n);\n}\n";

function runGate(root: string): readonly Finding[] {
  // The gate reads source through ctx.project and mirrors off the real FS, so the project must hold the
  // planted store file at its real path.
  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true });
  project.addSourceFileAtPath(join(root, STORE_REL));
  const findings: Finding[] = [];
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: () => undefined,
  };
  gate.run?.(ctx);
  return findings;
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Plant the store plus a mirror of the given suffix carrying `body`. */
function plantStore(root: string, mirrorSuffix: string, body: string): void {
  plant(root, STORE_REL, STORE_SRC);
  plant(root, `${MIRROR_DIR}/probe-store${mirrorSuffix}`, body);
}

const messages = (findings: readonly Finding[]): string => findings.map((f) => f.message ?? "").join("\n");
const actionFindings = (findings: readonly Finding[]): readonly Finding[] => findings.filter((f) => (f.message ?? "").includes("store action"));

test("test-presence-client retains every planted descriptor control", () => {
  expect(verifyGateProofs([gate])).toEqual([]);
});

describe("test-presence-client clause C — the #619 silence, both directions, EVERY mirror kind", () => {
  for (const suffix of STORE_MIRROR_KINDS) {
    test(`a ${suffix} mirror that never references the action is RED (it used to be silent)`, ({ scratch }) => {
      plantStore(scratch, suffix, 'import { useProbe } from "@orb/client/state";\nexport const t = useProbe;\n');
      expect(messages(runGate(scratch))).toContain("probeAction");
    });

    test(`a ${suffix} mirror that DOES drive the action is silent — the control's other direction`, ({ scratch }) => {
      plantStore(scratch, suffix, 'import { probeAction } from "@orb/client/state";\nprobeAction();\n');
      expect(actionFindings(runGate(scratch))).toEqual([]);
    });
  }

  test("an unsupported .test.tsx mirror is missing registered runtime coverage", ({ scratch }) => {
    plantStore(scratch, ".test.tsx", 'import { probeAction } from "@orb/client/state";\nprobeAction();\n');
    const out = runGate(scratch);
    expect(messages(out)).toContain("has no test");
    expect(actionFindings(out)).toEqual([]);
  });
});

describe("test-presence-client clause C — a clause that cannot run must never report clean", () => {
  test("a mirror that EXISTS but yields no corpus REFUSES LOUDLY (the §4.6 tripwire)", ({ scratch }) => {
    plantStore(scratch, ".test.ts", "\n");
    const out = runGate(scratch);
    expect(messages(out)).toContain("could not read ANY corpus");
    // And it does NOT masquerade as per-action coverage debt.
    expect(actionFindings(out)).toEqual([]);
  });

  test("NO mirror at all is clause A's violation, not a clause C silence", ({ scratch }) => {
    plant(scratch, STORE_REL, STORE_SRC);
    const out = runGate(scratch);
    expect(messages(out)).toContain("has no test");
    expect(actionFindings(out)).toEqual([]);
  });
});

describe("test-presence-client clause C — the name matcher reads a call WITH TYPE ARGUMENTS", () => {
  test("an action driven as `probeAction<T>()` counts as coverage", ({ scratch }) => {
    // Pre-#619 this matcher was `NAME\\(`, blind to every explicit type argument. The blindness was
    // invisible while clause C was inert; widening it surfaced FOUR `create-*` doors whose mirrors genuinely
    // DO exercise their factory generically (`createGatedStore<CounterState>(`) as false REDs.
    plantStore(scratch, ".test.ts", 'import { probeAction } from "@orb/client/state";\nprobeAction<{ a: 1 }>();\n');
    expect(actionFindings(runGate(scratch))).toEqual([]);
  });

  test("a nested type argument is still read", ({ scratch }) => {
    plantStore(scratch, ".test.ts", 'import { probeAction } from "@orb/client/state";\nprobeAction<Map<string, number>>();\n');
    expect(actionFindings(runGate(scratch))).toEqual([]);
  });

  test("a bare MENTION that is not a call is still NOT coverage (the permissive direction stays fenced)", ({ scratch }) => {
    plantStore(scratch, ".test.ts", 'import { probeAction } from "@orb/client/state";\nexport const ref = probeAction;\n');
    expect(messages(runGate(scratch))).toContain("probeAction");
  });
});

describe("test-presence-client clause C — the LIVE tree's mirror-kind mix", () => {
  test("state store mirrors are NOT all .ct.tsx — the false premise that made clause C inert", ({ repoRoot }) => {
    // This is the arm that keeps proving. The gate's header once asserted every store mirror is a `.ct.tsx`;
    // the tree disagreed by 15 files. If someone ever re-narrows clause C to a single suffix, THIS is the
    // receipt that the narrowing is wrong — it does not depend on the gate's own code at all.
    const names = readdirSync(join(repoRoot, MIRROR_DIR)).filter((n) => n.endsWith(".test.ts") || n.endsWith(".ct.tsx"));
    const dotTs = names.filter((n) => n.endsWith(".test.ts"));
    const dotCt = names.filter((n) => n.endsWith(".ct.tsx"));
    expect(dotCt.length).toBeGreaterThan(0);
    expect(dotTs.length).toBeGreaterThan(5);
  });
});
