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
// Gate names are kebab-case; `bus-onData-no-store-write` is the ONE documented camelCase name
// (UI-Gates-and-Lessons.md §8/§11.1), so the capture class allows uppercase too.
const OK_RE = /✓\s+(?<gate>[a-zA-Z0-9-]+)/gu;
const FIRED_RE = /✗\s+(?<gate>[a-zA-Z0-9-]+)/gu;
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
    [
      "packages",
      "tests",
      "tools",
      "scripts",
      "-name",
      "__g_*",
      "-prune",
      "-exec",
      "rm",
      "-rf",
      "{}",
      "+",
    ],
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
  // `groups.gate` is `string | undefined` under noUncheckedIndexedAccess — flatMap drops the (impossible
  // here, but type-visible) undefined so the Set is `Set<string>`.
  return new Set(
    [...out.matchAll(re)].flatMap((m) => {
      const gate = m.groups?.["gate"];
      return gate === undefined ? [] : [gate];
    }),
  );
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
  // baseline-single-migration: an extra migration .sql alongside 0000_baseline.sql (the
  // squash-not-incremental law) — real migrations/ dir already exists, this just adds a stray file.
  fx("packages/db/src/migrations/__g_0001_fake.sql", "-- fake incremental migration\n");
  // enforcement-registry-parity: a gate .ts file dropped in scripts/check/gates/ with no ALL_CHECKS
  // registration and no DORMANT_GATES entry (the anti-drift arm promoted from check-gates.int.test.ts
  // to every pnpm check). GATE_FILES above is computed at module load, BEFORE this fixture is written,
  // so it doesn't also trip the "every gate file is registered" test below.
  fx(
    "scripts/check/gates/__g_unregistered.ts",
    'import type { Check } from "../harness.ts";\nexport const gUnregistered: Check = { name: "g-unregistered", run: () => [] };\n',
  );
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
  // persistence-boundary: raw browser storage in a feature file (outside the two persist factories
  // + the boot/dev allowlist).
  fx(
    "packages/client/src/features/__g_persistb/lib/__g_flag.ts",
    'export const v = globalThis.localStorage.getItem("k");\n',
  );
  // no-interactive-role-in-features: a feature file forging an interactive widget via a layout-kit
  // role= passthrough (NOT in BURN_DOWN → fires). `Row` is a local `declare` — the gate matches the JSX
  // `role="button"` attribute by AST, so the fixture parses standalone without importing @orb/ui.
  fx(
    "packages/client/src/features/__g_role/components/__g_role.tsx",
    // biome-ignore lint/security/noSecrets: fixture SOURCE CODE (a JSX role attribute), not a secret.
    'declare function Row(props: { role?: string; children?: unknown }): unknown;\nexport const G = <Row role="button">hi</Row>;\n',
  );
  // no-effect-on-shared-selection: a feature effect depping a selection-hook result (the chase).
  // The hook is a local `declare` — the gate matches by NAME (AST-only), so the fixture parses
  // standalone without importing #state.
  fx(
    "packages/client/src/features/__g_chase/components/__g_chase.tsx",
    // biome-ignore lint/security/noSecrets: fixture SOURCE CODE (a hook name), not a secret.
    "declare function useActiveChatId(): string | null;\ndeclare function useEffect(fn: () => void, deps: unknown[]): void;\nexport function GChase(): null {\n  const chatId = useActiveChatId();\n  useEffect(() => {\n    void chatId;\n  }, [chatId]);\n  return null;\n}\n",
  );
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
  // user-bus-coverage: the STALE arm — the DEFERRED `connectionsChanged` member (no per-user connection
  // store yet) gains an emit-site literal in domain scope → "stale allowlist". Keep in sync with the
  // DEFERRED map in user-bus-coverage.ts (if a real per-user connection emit lands, retarget this fixture).
  fx(`${D}/chat/__g_userbus.ts`, 'export const staleUserBusEmit = "connectionsChanged";\n');
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
  // no-array-literal-querykey: a client options object minting a queryKey as an inline array literal
  // (keys are 100% tRPC-proxy-derived). These gates scope to packages/client/src ONLY, so writing the
  // banned shapes literally in THIS tests/tooling file can't self-trip them.
  fx(
    "packages/client/src/features/__g_qkey/lib/__g_qkey.ts",
    `export const opts = { queryKey: ["chat", "list"], enabled: true };\n`,
  );
  // no-inline-invalidate-outside-seam: an invalidateQueries call outside data/invalidation.ts.
  fx(
    "packages/client/src/features/__g_inval/lib/__g_inval.ts",
    "export function gBad(qc: { invalidateQueries: (f: unknown) => void }, filter: unknown): void {\n  qc.invalidateQueries(filter);\n}\n",
  );
  // bus-onData-no-store-write: a raw .setState() inside a subscription onData body in data/bus/.
  fx(
    "packages/client/src/data/bus/__g_buswrite.ts",
    "declare const store: { setState: (s: unknown) => void };\nexport const sub = {\n  onData: (): void => {\n    store.setState({ x: 1 });\n  },\n};\n",
  );
  // no-form-reset-in-autosave: a file importing createAutosaveEntityForm that calls .reset() on a form.
  fx(
    "packages/client/src/features/__g_autoreset/hooks/__g_autoreset.ts",
    'import { createAutosaveEntityForm } from "#forms";\nexport const useGThing = createAutosaveEntityForm<{ a: string }>({ defaultValues: { a: "" } });\nexport function gBad(form: { reset: () => void }): void {\n  form.reset();\n}\n',
  );
  // persist-partialize-and-total-migrate: a bare zustand persist() outside the two minting factories.
  fx(
    "packages/client/src/features/__g_persist/lib/__g_persist.ts",
    'declare function persist(init: unknown, opts: unknown): unknown;\nexport const gStore = persist(() => ({}), { name: "x" });\n',
  );
  // ── ledger-gate wave (activated 2026-07-09) — fixtures for the newly-live gates ──
  // ownerid-registry: an ownerId column on a table NOT in the D23 OWNERID_ALLOWLIST.
  fx(
    "packages/db/src/schema/__g_ownerid.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gOwnerid = sqliteTable("__g_ownerid", { ownerId: text("owner_id").references(() => gOwnerid.ownerId) });\n',
  );
  // no-untyped-soft-ref: a `*Id` column with NO `.references()` FK (not in SOFT_REF_ALLOWLIST).
  fx(
    "packages/db/src/schema/__g_softref.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gSoftref = sqliteTable("__g_softref", { fooId: text("foo_id") });\n',
  );
  // db-enum-from-tuple: a drizzle enum column configured with an INLINE array literal (not a tuple ref).
  fx(
    "packages/db/src/schema/__g_dbenum.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gEnum = sqliteTable("__g_dbenum", { kind: text("kind", { enum: ["a", "b"] }) });\n',
  );
  // schema-banned-shapes: the D18 chats.ownerId shape the ledger killed by name (a re-declared table).
  fx(
    "packages/db/src/schema/__g_banned.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gBanned = sqliteTable("chats", { ownerId: text("owner_id") });\n',
  );
  // infra-auth-no-userid: a `userId` identifier under infra/auth/** (D40 — infra never yields a userId).
  fx(
    "packages/server/src/infra/auth/__g_userid.ts",
    "export function gAuth(userId: string): string {\n  return userId;\n}\n",
  );
  // content-part-seam: a ChatContentPart import from @orb/contracts/chat OUTSIDE the D51 seam set.
  fx(
    "packages/server/src/domain/__g_contentpart/x.ts",
    'import type { ChatContentPart } from "@orb/contracts/chat";\nexport const g = (p: ChatContentPart): ChatContentPart => p;\n',
  );
  // no-raw-egress: a bare `fetch(` in packages/server/src outside the sanctioned provider-egress zones.
  fx(
    "packages/server/src/domain/__g_egress.ts",
    'export async function gFetch(): Promise<unknown> {\n  return fetch("http://example.test");\n}\n',
  );
  // contract-verb-presence: a __g_ domain whose contract/service.ts declares a verb on a *Service interface
  // with NO test in tests/server/domain/__g_verbpres/ (the domain tree is empty → the verb is uncovered).
  fx(
    "packages/server/src/domain/__g_verbpres/contract/service.ts",
    "export interface GVerbPresService {\n  readonly gUntested: () => Promise<void>;\n}\n",
  );
  // no-test-fabrication: a tests/ file with a `as unknown as` double-cast NOT in the baseline (baseline 0
  // for a __g_ path → over budget → RED). The banned cast is ASSEMBLED so the literal never appears in THIS
  // file's own source (which the gate also scans) — only the written fixture resolves to it (same technique
  // as the ambient-clock fixture above).
  fx(
    "tests/server/__g_fab.test.ts",
    `export const g = ({} ${["as", "unknown", "as"].join(" ")} { n: number }).n;\n`,
  );
  // warning-code-coverage: NOT fixtured here — it is a whole-corpus emit-coverage RATCHET (a tuple member
  // with no emit site across the real home + emit scope). An injected `__g_` file can neither match its
  // fixed tuple-home path nor REMOVE a real emit, so it cannot be driven from an isolated fixture; it is
  // proven to fire by its dedicated self-test (tests/tooling/warning-code-coverage.int.test.ts) and is
  // exempted from the anti-drift assertion below.
}

// Registered gates that CANNOT be driven by an injected `__g_` fixture — whole-corpus ratchets whose
// trigger needs the real single-home tuple + emit corpus (removing an emit / adding a tuple member),
// which a throwaway file can't reproduce. Each is proven to fire by its OWN self-test in tests/tooling/.
const UNFIXTURABLE_GATES = new Set(["warning-code-coverage"]);

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
  const unfired = [...registry].filter((g) => !(fired.has(g) || UNFIXTURABLE_GATES.has(g)));
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
  // The 8 ledger-gate-wave gates (2026-07-09) were ACTIVATED once the doc freeze lifted — they now live
  // in report.ts's BASE_CHECKS (+ their Core-Enforcement-Active-Gates.md rows), so they are no longer here.
  //
  // D54 §13.3 form-factory gate (2026-07-09): built + self-tested
  // (tests/tooling/form-factory-for-multifield.int.test.ts), held DORMANT because its ONE real-tree hit
  // (chat/components/group-config-form.tsx — a deliberate DU immediate-commit exception per that file's
  // header) belongs to another lane this wave must not fix. SYNC WITH enforcement-registry-parity.ts.
  "form-factory-for-multifield",
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
