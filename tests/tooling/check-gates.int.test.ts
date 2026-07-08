// Pins that EVERY ts-morph/fs structural gate actually fires on a violation — the gate self-test the
// dep-cruiser suite has, now for scripts/check/gates/*. A gate with a broken regex / AST query silently
// matches nothing and passes green (the exact failure the dep-cruiser test was built to catch); this is
// its structural-gate twin. The gate registry is DERIVED from `report.ts`'s own output (every gate it
// prints must fire on some fixture) — so a new gate added without a fixture FAILS here (anti-drift).
//
// Each fixture is a minimal violation at the path its gate anchors on, all named `__g_*` so cleanup is a
// single find -prune -rm. We run `check:structure` clean (→ the registry), then with fixtures (→ the
// fired set), and assert every registered gate is in the fired set.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "..", "..");
const OK_RE = /✓\s+([a-z0-9-]+)/gu;
const FIRED_RE = /✗\s+([a-z0-9-]+)/gu;
const TS_EXT_RE = /\.ts$/u;
const GATE_DIR = join(ROOT, "scripts", "check", "gates");
// every gate file on disk (basename) — the source of truth for "what gates exist".
const GATE_FILES = readdirSync(GATE_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(TS_EXT_RE, ""))
  .sort();

function fx(rel: string, content: string): void {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function cleanFixtures(): void {
  execFileSync(
    "find",
    ["packages", "tests", "tools", "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"],
    {
      cwd: ROOT,
    },
  );
}

function runStructure(): string {
  try {
    return execFileSync("pnpm", ["exec", "tsx", "scripts/check/report.ts"], {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (err) {
    // report.ts exits 1 when a gate fires — the report is on stdout.
    return (err as { stdout?: string }).stdout ?? "";
  }
}

function names(re: RegExp, out: string): Set<string> {
  // `m[1]` is `string | undefined` under noUncheckedIndexedAccess — flatMap drops the (impossible
  // here, but type-visible) undefined so the Set is `Set<string>`.
  return new Set([...out.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]])));
}

function writeFixtures(): void {
  const D = "packages/server/src/domain";
  // feature-structure: a feature missing required slots (only index.ts).
  fx(`${D}/__g_struct/index.ts`, "export const x = 1;\n");
  // verb-naming: verbs/<v>.ts not exporting create<V>.
  fx(`${D}/__g_verb/verbs/thing.ts`, "export const wrong = 1;\n");
  // types-in-contract: contract/service.ts without the exported interface.
  fx(`${D}/__g_types/contract/service.ts`, "export const notAnInterface = 1;\n");
  // test-presence: a verb with no mirror test.
  fx(`${D}/__g_pres/verbs/act.ts`, "export function createAct(): number {\n  return 1;\n}\n");
  // no-inline-union-redecl: an inline ≥3-member string-literal union alias.
  fx("packages/server/src/__g_union.ts", 'export type U = "a" | "b" | "c";\n');
  // commented-code: parked code in a // comment.
  fx("packages/server/src/__g_commented.ts", "// const dead = 1;\nexport const live = 1;\n");
  // schema-branding: a db text id column without .$type<XId>().
  fx(
    "packages/db/src/schema/__g_brand.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gBrand = sqliteTable("g_brand", { id: text("id").primaryKey() });\n',
  );
  // db-structure: a schema file NOT re-exported from the barrel schema/index.ts.
  fx("packages/db/src/schema/__g_orphan.ts", "export const gOrphan = 1;\n");
  // test-layout: a test with no source mirror.
  fx("tests/server/__g_nomirror.test.ts", "export {};\n");
  // test-determinism: ambient clock in a test (tooling/ is scanned; only support/+e2e/ are exempt).
  // The banned call is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the ambient-clock call.
  fx("tests/tooling/__g_det.test.ts", `export const t = ${["Date", "now"].join(".")}();\n`);
  // providers-runner-seal: a domain consumer (above infra) importing a sealed runner symbol.
  fx(
    "packages/server/src/domain/__g_seal/x.ts",
    `import { deriveRunner } from "@orb/server/infra/providers";\nexport const x = deriveRunner;\n`,
  );
  // pd-citation-integrity: a code FLAG[PD-n] citing an id with no registry row (orphan).
  // The citation is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the orphan citation.
  fx(
    "packages/server/src/__g_pd.ts",
    `// ${["FLAG", "[PD-9999]"].join("")} — orphan citation, no registry row.\nexport const x = 1;\n`,
  );
  // no-direct-users-read: a domain outside sessions/admin importing the `users` table from @orb/db.
  fx(
    `${D}/__g_users/persistence/x.ts`,
    `import { users } from "@orb/db";\nexport const x = users;\n`,
  );
  // sole-env-reader: a server file outside foundation/env touching process.env (bracket form).
  fx(
    "packages/server/src/domain/__g_env.ts",
    `import process from "node:process";\nexport const x = process.env["FOO"];\n`,
  );
  // assumes-single-replica: a module-scope mutable cache in a file with no ASSUMES(single-replica).
  fx(
    "packages/server/src/domain/__g_replica.ts",
    "export const cache = new Map<string, number>();\n",
  );
  // no-caller-user-id: the D19-forbidden `callerUserId` identifier (in the fixture's source, not here).
  fx("packages/server/src/__g_caller.ts", "export const callerUserId = 1;\n");
  // test-mock-doctrine: vi.mock targeting an internal relative module.
  fx("tests/__g_mock.test.ts", `import { vi } from "vitest";\nvi.mock("../src/foo");\n`);
  // test-factory-contract: makeX taking db, seedX without db.
  fx(
    "tests/support/factories/__g_factory.ts",
    "export function makeWrong(db: any) {}\nexport function seedWrong(a: any) {}\n",
  );
  // test-fixture-imports: importing test/expect directly from vitest.
  fx("tests/__g_imports.test.ts", `import { test, expect } from "vitest";\n`);
  // test-no-stubs: a test block with no assertions.
  fx(
    "tests/__g_stub.test.ts",
    `import { test } from "support/test";\ntest("stub", () => {\n  const x = 1;\n});\n`,
  );
  // server-layout: an illegal directory at the root of server/src.
  fx("packages/server/src/__g_rogue_drawer/index.ts", "export const x = 1;\n");
  // package-layout: a loose file at the root of kit/src.
  fx("packages/kit/src/__g_rogue.ts", "export const x = 1;\n");
  // ui-primitive-structure: a primitive dir missing its trio (no <name>.tsx/variants.ts) + no test.
  fx("packages/ui/src/primitives/__g_uiprim/index.ts", "export const x = 1;\n");
  // client-structure: a BUILT feature (has code) with a stray root file + no index.ts front door.
  fx("packages/client/src/features/__g_cfeat/stray.ts", "export const x = 1;\n");
  // state-files: a flat state/ file exporting the minted store handle (rule 3 — no exported handle).
  fx(
    "packages/client/src/state/__g_state.ts",
    'export const useGStore = createGatedStore("g", () => ({ n: 0 }));\n',
  );
  // component-size: a client source over the 450-line cap (in lib/, not a feature, so it trips
  // component-size alone). 451 padded lines.
  fx("packages/client/src/lib/__g_oversize.ts", "// pad line\n".repeat(451));
  // zustand-selector-derived: a store-hook selector returning a fresh object literal, unwrapped.
  fx(
    "packages/client/src/state/__g_zustand.ts",
    "declare const useGStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useGStore((s) => ({ a: s.a, b: s.b }));\n",
  );
  // vector-scope-derived: a domain OUTSIDE the sanctioned set importing a vector-table symbol (D20).
  fx(
    `${D}/__g_vec/persistence/x.ts`,
    `import { chatDigests } from "@orb/db";\nexport const x = chatDigests;\n`,
  );
  // turn-identity: a `principal` identifier inside the Principal-blind chat engine (D19).
  fx(
    `${D}/chat/engine/__g_ti.ts`,
    "export function leak(principal: { userId: string }): string {\n  return principal.userId;\n}\n",
  );
  // membership-enforcer: an owner-equality comparison inside domain/chat (D18).
  fx(
    `${D}/chat/verbs/__g_me.ts`,
    "export const isOwner = (c: { ownerId: string }, u: string): boolean => c.ownerId === u;\n",
  );
  // owner-role-split: a global-role literal comparison outside admin/guard.ts (D17).
  fx(
    "packages/server/src/domain/__g_role.ts",
    'export const elevated = (p: { role: string }): boolean => p.role === "admin";\n',
  );
  // bus-coverage: a DEFERRED-allowlisted member gaining an emit-site literal → the STALE arm fires
  // (proves the contracts-parse + corpus scan + both ratchet directions are alive). Must name a member
  // STILL in the DEFERRED map — `personaSwitched`/`reasoningStreamDone` were wired (PD-117 wave 2), so
  // this uses `chatOpened` (stream-attach synthesis still unbuilt; keep this in sync with bus-coverage.ts).
  fx(`${D}/chat/__g_bus.ts`, 'export const staleDeferredEmit = "chatOpened";\n');
  // member-card-clamped: a re-spelled MemberCardView declaration outside contracts (D22/PD-111).
  fx(
    `${D}/character/__g_mcv.ts`,
    "export interface MemberCardView {\n  readonly name: string;\n}\n",
  );
  // diagnostic-legibility: a grit diagnostic string carrying no doc/code-home pointer (the meta-gate
  // reads tools/grit + scripts/check/gates source, so its fixture lives there, not under packages/).
  fx("tools/grit/__g_diaglegi.grit", 'message="a bare diagnostic with no home"\n');
  // test-presence-client: a client data/ file with a callable export and no tests/client mirror.
  fx(
    "packages/client/src/data/__g_presclient.ts",
    "export function gPresClient(): number {\n  return 1;\n}\n",
  );
  // surface-in-a-container: a surface with raw structural JSX, no Container, no anchors/ dir under
  // its (stray) feature — the anchor-provided exemption has nothing to exempt it with.
  fx(
    "packages/client/src/features/__g_surfacefeat/surfaces/__g_thing-surface.tsx",
    "export function gThingSurface() {\n  return <div>hi</div>;\n}\n",
  );
  // surface-a11y-focus: a drill-down surface missing focus restoration or auto-focus wrapper.
  // The function name is assembled so the literal isn't present in THIS file's source — only the
  // written fixture resolves to the unfocused surface (same pattern as the ambient-clock fixture L88).
  fx(
    "packages/client/src/features/__g_focus/surfaces/__g_nofocus-surface.tsx",
    // biome-ignore lint/nursery/noUnnecessaryTemplateExpression: The function name is assembled so the literal isn't present in THIS file's source.
    `export function ${"gNoFocus"}Surface() {\n  return <div>unfocused</div>;\n}\n`,
  );
  // registry-pairing: a rail-slots.ts / modal-slots.tsx PAIR that fails to bijection — a modal trigger
  // ("ghost") with no body, AND a body ("orphan") with no trigger (both arms fire).
  fx(
    "packages/client/src/features/__g_pairing/lib/rail-slots.ts",
    'export const GHOST = { kind: "modal", id: "ghost", label: "Ghost" };\n',
  );
  fx(
    "packages/client/src/features/__g_pairing/lib/modal-slots.tsx",
    'export const MODAL_SLOTS = { orphan: { title: "Orphan", render: () => null } };\n',
  );
  // modal-body-not-placeholder: a modal-slots.tsx entry rendering <SectionPlaceholder> with NO
  // `placeholder: true` flag (a silent-sparkle body).
  fx(
    "packages/client/src/features/__g_modalph/lib/modal-slots.tsx",
    'export const MODAL_SLOTS = { silent: { title: "S", render: () => <SectionPlaceholder title="S" /> } };\n',
  );
  // placeholder-copy-registry: a section-placeholder-copy.ts map with TWO entries sharing the same
  // (title, description) pair — the "all sections look identical" duplicate the gate forbids (J10).
  fx(
    "packages/client/src/features/__g_phcopy/lib/section-placeholder-copy.ts",
    `export const SECTION_PLACEHOLDER_COPY = {\n  one: { title: "Dup", description: "same copy" },\n  two: { title: "Dup", description: "same copy" },\n};\n`,
  );
}

let registry = new Set<string>();
let fired = new Set<string>();

beforeAll(() => {
  cleanFixtures();
  // registry = every gate report.ts prints, ✓ OR ✗. A gate can be legitimately ✗ on the real tree
  // (e.g. test-presence flagging a not-yet-tested infra/foundation file) and must still count as
  // "registered" — otherwise the dir-cross-check below would mistake an honest red for an unregistered gate.
  const cleanReport = runStructure();
  registry = new Set([...names(OK_RE, cleanReport), ...names(FIRED_RE, cleanReport)]);
  writeFixtures();
  fired = names(FIRED_RE, runStructure()); // with fixtures: the gates that caught a violation
}, 60_000);

afterAll(() => {
  cleanFixtures();
});

test("derives a non-trivial gate registry from report.ts (not silently empty)", () => {
  expect(registry.size).toBeGreaterThan(8);
});

test("every registered structural gate fires on its fixture (anti-drift)", () => {
  const unfired = [...registry].filter((g) => !fired.has(g));
  expect(unfired).toEqual([]);
});

// Gates DELIBERATELY not wired into `ALL_CHECKS` — written but DORMANT by decision (Nate 2026-07-04,
// scratch/dev-tooling-support-kit-plan.md), each with its own header explaining why + its own
// self-test proving it actually fires (tests/tooling/{monotonic-tests,audit-client-tests}.int.test.ts
// drive them directly, never through report.ts). This is the ONE sanctioned exemption from the
// anti-drift check below — a gate added here without ALSO getting a self-test is still a bug; the
// exemption is for the ALL_CHECKS registration only, not for having no test at all.
const DORMANT_GATES = new Set([
  "monotonic-tests",
  "audit-client-tests",
  // W1-0c (2026-07-04): built + self-tested, deliberately unregistered pending its own future
  // consumer — `table.tsx` stays at 461 lines by Nate's decision until a table consumer lands and
  // the primitive naturally splits under the 450-line cap (UI-Primitives-and-Reuse.md §13.9).
  // `test-presence-client` and `surface-in-a-container` were the OTHER two W1-0c gates in this set;
  // W1-1 (2026-07-04) backfilled test-presence-client's findings + calibrated
  // surface-in-a-container's anchor-provided exemption against the chat feature's first real
  // anchor+surface pair, and flipped BOTH live in `ALL_CHECKS` — they are no longer here.
  "component-size-ui",
]);

test("every gate file in scripts/check/gates is registered in report.ts (anti-drift)", () => {
  // A gate file that exists but is never listed in report.ts silently does nothing — it never runs,
  // so the "fires on its fixture" test above can't catch it (it's not in the registry). This closes
  // that hole: the gate file's basename (kebab) must equal a gate name report.ts prints — UNLESS it's
  // an explicitly DORMANT gate (see DORMANT_GATES above), which is deliberately unregistered.
  const unregistered = GATE_FILES.filter((g) => !(registry.has(g) || DORMANT_GATES.has(g)));
  expect(unregistered).toEqual([]);
});
