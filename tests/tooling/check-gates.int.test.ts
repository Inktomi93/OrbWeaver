// Pins that EVERY ts-morph/fs structural gate actually fires on a violation — the gate self-test the
// dep-cruiser suite has, now for scripts/check/gates/*. A gate with a broken regex / AST query silently
// matches nothing and passes green (the exact failure the dep-cruiser test was built to catch); this is
// its structural-gate twin. The gate registry is DERIVED from `report.ts`'s own output — the LIVE
// single-pass run (loadGates → runPass → renderPass); every ACTIVE gate it prints must fire on some
// fixture, so a new gate added without a fixture FAILS here (anti-drift). This is the live-tree complement
// to gate-conformance.int.test.ts's synthetic mustFlag/mustPass examples.
//
// Each fixture is a minimal violation at the path its gate anchors on, all named `__g_*` so cleanup is a
// single find -prune -rm. We run `check:structure` clean (→ the registry), then with fixtures (→ the
// fired set), and assert every registered gate is in the fired set.
//
// `__g_` is a RESERVED sentinel: these fixtures materialize inside the real package tree (the gates anchor
// on realistic paths), but they exist only for the milliseconds between writeFixtures() and cleanFixtures().
// A concurrent OTHER tree consumer (tsc/biome/vitest/eslint/depcruise) that globbed one mid-lifecycle used
// to emit a phantom error — the "never run `pnpm test` alongside `pnpm check`" footgun. That is FIXED by
// excluding `__g_*` from every one of those configs (tsconfig.base.json + tsconfig.json + biome.json +
// vitest.config.ts + eslint.config.js + .dependency-cruiser.cjs); the gate harness itself reads fixtures
// via ts-morph's own globs (skipAddingFilesFromTsConfig), which those excludes don't touch, so it still
// fires on them. The self-test is now hermetic w.r.t. every other consumer — run it alongside anything.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");
// Gate names are kebab-case; `bus-onData-no-store-write` is the ONE documented camelCase name
// (UI-Gates-and-Lessons.md §8/§11.1), so the capture class allows uppercase too.
//
// Both patterns are ANCHORED to renderPass's EXACT line shapes (`  ✓ <name>` / `  ✗ <name> (<n>)`,
// scripts/check/render.ts) — two-space indent, whole line. An unanchored `✓\s+(\w+)` scraped ANY ✓ on
// the child's stdout, and `pnpm exec` interleaves its own: after a deps-state invalidation (a sibling
// worktree install, a lockfile mtime bump) pnpm 11 runs an implicit install and prints
// `✓ Lockfile passes supply-chain policies (…)` ONCE, on the next `pnpm` invocation in that tree. If
// that one landed on the clean run, `Lockfile` entered `registry` as a phantom gate that nothing can
// ever fire → a one-shot "unfired: [Lockfile]" red that passed on immediate re-run. Anchoring makes the
// scrape total w.r.t. any ambient child chatter; if renderPass's format ever drifts the registry goes
// empty and the `registry.size > 8` test below fails LOUD rather than silently.
const OK_RE = /^ {2}✓ (?<gate>[a-zA-Z0-9-]+)$/gmu;
const FIRED_RE = /^ {2}✗ (?<gate>[a-zA-Z0-9-]+) \(\d+\)$/gmu;
const TS_EXT_RE = /\.ts$/u;
const GATE_DIR = join(ROOT, "scripts", "check", "gates");
// every gate file on disk (basename) — the source of truth for "what gates exist". `__g_*` are THIS suite's
// throwaway probe fixtures, excluded so a fixture LEAKED by a killed prior run (readdir happens at module
// load, BEFORE beforeAll's cleanFixtures) can't poison the anti-drift list into a one-run flake.
const GATE_FILES = readdirSync(GATE_DIR)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("__g_"))
  .map((f) => f.replace(TS_EXT_RE, ""))
  .sort();

function fx(rel: string, content: string): void {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function cleanFixtures(): void {
  execFileSync("find", ["packages", "tests", "scripts", "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"], {
    cwd: ROOT,
  });
  // A fixture written into a real-named dir that doesn't exist (e.g. `${D}/hub/__g_asw1.ts` after the hub
  // domain was purged) leaves the dir behind EMPTY once its `__g_` files are reaped — and an empty domain
  // dir trips feature-structure on the NEXT clean run. Intentional empties carry a .gitkeep (non-empty),
  // so reaping genuinely-empty dirs here is safe.
  execFileSync("find", ["packages", "tests", "scripts", "-type", "d", "-empty", "-delete"], {
    cwd: ROOT,
  });
}

function runStructure(): string {
  try {
    // `--config.verify-deps-before-run=false`: pnpm 11 re-runs an implicit INSTALL whenever the tree's
    // deps-state is stale (any package.json/lockfile mtime past `lastValidatedTimestamp` — routine when
    // sibling worktree lanes install concurrently). Inside this suite that install both mutates
    // node_modules underneath the running vitest process and prepends its banner to the stdout we parse.
    // The child only needs the already-resolved tsx that vitest itself is running from, so skip it.
    return execFileSync("pnpm", ["--config.verify-deps-before-run=false", "exec", "tsx", "scripts/check/report.ts"], {
      cwd: ROOT,
      // THIS suite's child runs must SEE the __g_ fixtures it plants — the real-tree entrypoints strip
      // probe-artifact findings by default (a concurrent battery's transient fixtures must not red an
      // independent structure run; scripts/check/pass.ts stripProbeFindings). The env opts this run out.
      // biome-ignore lint/style/noProcessEnv: passthrough env for the child run — harness plumbing, not app config.
      // biome-ignore lint/correctness/noProcessGlobal: same passthrough — this test file is node-run tooling.
      // biome-ignore lint/style/useNamingConvention: ORB_GATE_FIXTURES is an environment variable name.
      env: { ...process.env, ORB_GATE_FIXTURES: "1" },
      encoding: "utf8",
      // The fixture-run report (every gate firing on its __g_ fixture) exceeds execFileSync's 1MB default
      // buffer — a truncated tail would silently drop the last-sorted gates from `fired` (a false anti-drift
      // failure). 64MB headroom keeps the whole report captured as the gate/fixture set grows.
      maxBuffer: 64 * 1024 * 1024,
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
  // test-presence (contracts index.ts hole, fixed 2026-07-10): a contracts domain whose zod schemas
  // co-locate in index.ts (the convention — NOT a re-export barrel) with no .contract.test.ts mirror. The
  // OLD gate blanket-skipped every index.ts, silently exempting whole contract domains (imagery shipped
  // with zero tests). This fixture pins that a schema-bearing contracts index.ts is now presence-gated.
  fx("packages/contracts/src/__g_prescontract/index.ts", 'import { z } from "zod";\nexport const gSchema = z.object({ n: z.number() });\n');
  // test-presence (workloads runners/ arm, added 2026-07-10): a runner with REAL logic (touches ctx.env,
  // no `{ deferred: true }`) and no mirror test fires. A D58 no-op stub is shape-exempt; this fixture is the
  // non-stub case so a filled-in runner can never ship untested.
  fx(
    `${D}/workloads/runners/__g_runner.ts`,
    "export const gRunner = async (ctx: { env: { op: () => Promise<void> } }): Promise<void> => {\n  await ctx.env.op();\n};\n",
  );
  // gate-ignore-inventory: a WELL-FORMED @orb-gate-ignore comment (carries its `: <reason>`, so the
  // MALFORMED arm stays out of it) naming a gate that isn't registered — the UNREGISTERED arm, which is
  // what this fixture is for. The gate's name-capture regex is `[a-zA-Z0-9-]+` (no underscore), so the
  // fake name is kebab-case, not the `__g_` sentinel form. Every OTHER arm (malformed / stale /
  // over-exempting) is driven on the real tree by tests/tooling/gate-ignore-grammar.int.test.ts.
  fx("packages/server/src/__g_ignoreinv.ts", "// @orb-gate-ignore g-no-such-gate: fixture — names a gate that does not exist\nexport const x = 1;\n");
  // no-inline-union-redecl: an inline ≥3-member string-literal union alias.
  fx("packages/server/src/__g_union.ts", 'export type U = "a" | "b" | "c";\n');
  // no-handwritten-wire-json-schema: a hand-authored JSON-Schema literal on a wire `schema` field (the D79 seal).
  fx("packages/server/src/__g_wireschema.ts", 'export const rf = { name: "x", schema: { type: "object", properties: {} } };\n');
  // commented-code: parked code in a // comment.
  fx("packages/server/src/__g_commented.ts", "// const dead = 1;\nexport const live = 1;\n");
  // schema-branding: a db text id column without .$type<XId>().
  fx(
    "packages/db/src/schema/__g_brand.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gBrand = sqliteTable("g_brand", { id: text("id").primaryKey() });\n',
  );
  // db-structure: a schema file NOT re-exported from the barrel schema/index.ts.
  fx("packages/db/src/schema/__g_orphan.ts", "export const gOrphan = 1;\n");
  // fk-columns-indexed: an FK column that leads NO index. Isolated on purpose — it states its onDelete and
  // declares its PK, so only this gate's arm is the deliberate fire.
  fx(
    "packages/db/src/schema/__g_fkidx.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
      'export const gFkIdx = sqliteTable("g_fk_idx", {\n' +
      '  id: text("id").primaryKey(),\n' +
      '  ownerId: text("owner_id").references(() => gFkIdx.id, { onDelete: "cascade" }),\n' +
      "});\n",
  );
  // fk-ondelete-stated: a `.references()` with no deletion policy (the silent NO ACTION default). The FK
  // leads its own index and the table has a PK, so the two sibling gates stay quiet on this fixture.
  fx(
    "packages/db/src/schema/__g_fkdel.ts",
    'import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
      'export const gFkDel = sqliteTable(\n  "g_fk_del",\n  {\n' +
      '    id: text("id").primaryKey(),\n' +
      '    ownerId: text("owner_id").references(() => gFkDel.id),\n' +
      "  },\n" +
      '  (t) => [index("g_fk_del_owner_idx").on(t.ownerId)],\n);\n',
  );
  // table-explicit-primary-key: a keyless table (the hidden-rowid fallback). No FK at all, so the two FK
  // gates have nothing to say about it.
  fx(
    "packages/db/src/schema/__g_nopk.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gNoPk = sqliteTable("g_no_pk", { label: text("label") });\n',
  );
  // baseline-single-migration: an extra migration .sql alongside 0000_baseline.sql (the
  // squash-not-incremental law) — real migrations/ dir already exists, this just adds a stray file.
  fx("packages/db/src/migrations/__g_0001_fake.sql", "-- fake incremental migration\n");
  // enforcement-registry-parity: NO fixture — the contract-form gate reconciles the DISCOVERED DESCRIPTOR
  // SET vs the doc; the old "gate file missing from the registry" arm is STRUCTURALLY RETIRED (the loader's
  // fail-closed assertDescriptor makes an unwired/invalid gate file a load-time RED, §7). A `__g_` fixture
  // can't cleanly trigger the doc-reconciliation arm (it would need a valid mustFlag/mustPass descriptor
  // whose name is absent from the real doc — a heavy live-doc edit), so this gate is exempted from the
  // anti-drift assertion below; its bite is proven by gate-conformance (its mustFlag).
  // test-layout: a test with no source mirror.
  fx("tests/server/__g_nomirror.test.ts", "export {};\n");
  // test-determinism: ambient clock in a test (tooling/ is scanned; only support/+e2e/ are exempt).
  // The banned call is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the ambient-clock call.
  fx("tests/tooling/__g_det.test.ts", `export const t = ${["Date", "now"].join(".")}();\n`);
  // providers-runner-seal: a domain consumer (above infra) importing a sealed runner symbol.
  fx("packages/server/src/domain/__g_seal/x.ts", `import { deriveRunner } from "@orb/server/infra/providers";\nexport const x = deriveRunner;\n`);
  // pd-citation-integrity: a code FLAG[PD-n] citing an id with no registry row (orphan).
  // The citation is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the orphan citation.
  fx("packages/server/src/__g_pd.ts", `// ${["FLAG", "[PD-9999]"].join("")} — orphan citation, no registry row.\nexport const x = 1;\n`);
  // d-citation-integrity: a bare D<n> ledger citation resolving to nothing — no `- **D<n>** —` anchor in
  // Core-Path-Registry.md and above the reserved range (D79–D105). The number is assembled so the literal
  // isn't present in THIS file's source (the gate scopes to packages/**.{ts,tsx} + core/** but shares the
  // project — same technique as the __g_pd fixture above). The path is a packages/**.ts in-scope site.
  fx(
    "packages/contracts/src/__g_dcite/index.ts",
    `// per ${["D", "998"].join("")} — a dangling D-citation, no anchor, above the ceiling.\nexport const gDcite = 1;\n`,
  );
  // nullable-column-inequality: `ne()` on a column the REAL drizzle schema declares nullable
  // (`characters.avatar_asset_id` has no `.notNull()`), with nothing guarding the NULLs. The gate derives
  // nullability from packages/db/src/schema/** on every run, so the fixture rides the real map.
  fx(
    "packages/server/src/__g_nullcmp.ts",
    'import { characters } from "@orb/db";\nimport { ne } from "drizzle-orm";\nexport const p = ne(characters.avatarAssetId, "a");\n',
  );
  // no-nul-bytes-in-source: a RAW NUL byte in a source file. Assembled via fromCharCode so the byte is
  // never present in THIS file's own source — the gate scans tests/ too, and a literal NUL here would make
  // the suite's own file a permanent violation (and diff as `Bin`).
  fx("packages/server/src/__g_nulbyte.ts", `export const sep = "${String.fromCharCode(0)}";\n`);
  // wire-schema-vocab-one-home: a second JSON-Schema keyword table outside the one scrub engine. Two
  // DISTINCT keywords clears the fence (one alone is ordinary English).
  fx("packages/server/src/__g_wirevocab.ts", 'export const drop = new Set(["minLength", "maxLength"]);\n');
  // no-direct-users-read: a domain outside sessions/admin importing the `users` table from @orb/db.
  fx(`${D}/__g_users/persistence/x.ts`, `import { users } from "@orb/db";\nexport const x = users;\n`);
  // discovery-no-stats-rollups: a stats rollup table imported inside domain/discovery (the seam breach
  // the @orb/db barrel hides from dep-cruiser — the gate matches the ImportSpecifier).
  fx(`${D}/discovery/__g_rollup.ts`, `import { ownerStats } from "@orb/db";\nexport const x = ownerStats;\n`);
  // sole-env-reader: a server file outside foundation/env touching process.env (bracket form).
  fx("packages/server/src/domain/__g_env.ts", `import process from "node:process";\nexport const x = process.env["FOO"];\n`);
  // assumes-single-replica: a module-scope mutable cache in a file with no ASSUMES(single-replica).
  fx("packages/server/src/domain/__g_replica.ts", "export const cache = new Map<string, number>();\n");
  // no-caller-user-id: the D19-forbidden `callerUserId` identifier (in the fixture's source, not here).
  fx("packages/server/src/__g_caller.ts", "export const callerUserId = 1;\n");
  // test-mock-doctrine: vi.mock targeting an internal relative module.
  fx("tests/__g_mock.test.ts", `import { vi } from "vitest";\nvi.mock("../src/foo");\n`);
  // test-factory-contract: makeX taking db, seedX without db.
  fx("tests/support/factories/__g_factory.ts", "export function makeWrong(db: any) {}\nexport function seedWrong(a: any) {}\n");
  // test-fixture-imports: importing test/expect directly from vitest.
  fx("tests/__g_imports.test.ts", `import { test, expect } from "vitest";\n`);
  // test-no-stubs: a test block with no assertions.
  fx("tests/__g_stub.test.ts", `import { test } from "support/test";\ntest("stub", () => {\n  const x = 1;\n});\n`);
  // audit-client-tests: an async test with no await — the assertion is present so test-no-stubs stays
  // quiet; only the deep auditor's missing-await arm fires (activated 2026-07-17).
  fx("tests/__g_audit.test.ts", `import { expect, test } from "support/test";\ntest("g async", async () => {\n  expect(1).toBe(1);\n});\n`);
  // server-layout: an illegal directory at the root of server/src.
  fx("packages/server/src/__g_rogue_drawer/index.ts", "export const x = 1;\n");
  // package-layout: a loose file at the root of kit/src.
  fx("packages/kit/src/__g_rogue.ts", "export const x = 1;\n");
  // ui-primitive-structure: a primitive dir missing its trio (no <name>.tsx/variants.ts) + no test.
  fx("packages/ui/src/primitives/__g_uiprim/index.ts", "export const x = 1;\n");
  // client-structure: a BUILT feature (has code) with a stray root file + no index.ts front door.
  fx("packages/client/src/features/__g_cfeat/stray.ts", "export const x = 1;\n");
  // section-registry-completeness: a non-auth feature front-door import in a route file that isn't
  // app-root (the anti-god-map arm 3b). `#features/chat` is a real specifier the gate matches by AST.
  fx("packages/client/src/routes/__g_g1route.tsx", 'import { X } from "#features/chat";\nexport const G = X;\n');
  // no-parallel-section-map: an object literal hardcoding ≥2 SectionId keys (the gate reads the real
  // SECTION_IDS tuple from shell-store.ts), outside the allowlisted homes — a re-declared parallel map.
  fx("packages/client/src/features/__g_g2map/lib/parallel.ts", "export const M = { chats: 1, characters: 1, corpus: 1 };\n");
  // modal-registry-completeness: a `ModalDefinition`-typed var in a file that is NOT a `*-modal.tsx` def
  // file — the co-location arm.
  fx("packages/client/src/features/__g_gmodal/lib/stray.ts", "export const strayModal: ModalDefinition = { id: 'x' };\n");
  // chrome-registry-completeness: a `ChromeEntry`-typed var in a file that is NOT a `*-chrome.tsx` def
  // file — the co-location arm.
  fx("packages/client/src/features/__g_gchrome/lib/stray.ts", "export const strayChrome: ChromeEntry = { id: 'x', zone: 'topbar.trail' };\n");
  // home-tile-registry-completeness: a `HomeTileContribution`-typed var in a file that is NOT a `*-tile`
  // def file — the co-location arm.
  fx("packages/client/src/features/__g_ghometile/lib/stray.ts", "export const strayTile: HomeTileContribution = { id: 'x', body: () => null };\n");
  // collection-registry-completeness: a `CollectionContribution`-typed var in a file that is NOT a
  // `*-collection` def file — the co-location arm.
  fx(
    "packages/client/src/features/__g_gcollection/lib/stray.ts",
    "export const strayCollection: CollectionContribution = { id: 'x', create: { label: 'New x', useRun: () => () => undefined } };\n",
  );
  // modal-body-not-placeholder: a `*-modal.tsx` def whose function body renders <SectionPlaceholder>.
  fx(
    "packages/client/src/features/__g_gmodalbody/lib/__g_gmodalbody-modal.tsx",
    "export const gModal: ModalDefinition = { id: 'x', body: () => <SectionPlaceholder /> };\n",
  );
  // section-factory-contribution-bundle: an exported SectionDefinition-returning factory with TWO
  // positional `ContributorRegistry` params — the bundle arm (the founding `makeChatsSection` shape).
  fx(
    "packages/client/src/features/__g_gbundle/lib/__g_gbundle-section.tsx",
    "export function makeGBundleSection(a: ContributorRegistry<X>, b: ContributorRegistry<Y>): SectionDefinition {\n  return null as never;\n}\n",
  );
  // settings-pane-completeness: a `SettingsPaneDefinition`-typed var in a file that is NOT a `*-pane.tsx`
  // def file — the co-location arm.
  fx("packages/client/src/features/__g_gpane/lib/stray.ts", "export const strayPane: SettingsPaneDefinition = { id: 'x' };\n");
  // no-parallel-section-map: a SettingsCategoryId-keyed object literal outside the sanctioned homes.
  fx("packages/client/src/features/__g_g2settings/lib/parallel.ts", "export const M = { account: 1, appearance: 1, tags: 1 };\n");
  // context-definition-shape: a hand-rolled `{kind:"tabs",useResolved}` object literal outside
  // lib/registry-contracts.ts — a badge-wearing tabs renderer bypassing the mint (arm 1).
  fx("packages/client/src/features/__g_g3ctx/lib/g3-badge.ts", 'export const gBadgeCtx = { kind: "tabs", useResolved: () => null };\n');
  // state-files: a flat state/ file exporting the minted store handle (rule 3 — no exported handle).
  fx("packages/client/src/state/__g_state.ts", 'export const useGStore = createGatedStore("g", () => ({ n: 0 }));\n');
  // component-size: a client source over the 450-line cap (in lib/, not a feature, so it trips
  // component-size alone). 451 padded lines.
  fx("packages/client/src/lib/__g_oversize.ts", "// pad line\n".repeat(451));
  // component-size-ui: the @orb/ui twin (activated 2026-07-17) — a ui source over the 450-line cap,
  // in its own __g_ dir at the src root (the __g_motion/__g_defprops placement precedent).
  fx("packages/ui/src/__g_oversize/__g_oversize.ts", "// pad line\n".repeat(451));
  // persistence-boundary: raw browser storage in a feature file (outside the two persist factories
  // + the boot/dev allowlist).
  fx("packages/client/src/features/__g_persistb/lib/__g_flag.ts", 'export const v = globalThis.localStorage.getItem("k");\n');
  // no-interactive-role-in-features: a feature file forging an interactive widget via a layout-kit
  // role= passthrough (NOT in BURN_DOWN → fires). `Row` is a local `declare` — the gate matches the JSX
  // `role="button"` attribute by AST, so the fixture parses standalone without importing @orb/ui.
  fx(
    "packages/client/src/features/__g_role/components/__g_role.tsx",
    'declare function Row(props: { role?: string; children?: unknown }): unknown;\nexport const G = <Row role="button">hi</Row>;\n',
  );
  // no-raw-interactive-intrinsics: a raw <input> in a feature file (not app-shell, not in BURN_DOWN).
  fx("packages/client/src/features/__g_rawintr/components/__g_rawintr.tsx", 'export const G = <input type="text" />;\n');
  // empty-state-has-action: an <EmptyState> with no `action` prop, in a file not in the ALLOWLIST.
  fx("packages/client/src/features/__g_emptyact/surfaces/__g_emptyact.tsx", 'export const G = <EmptyState title="Nothing here" />;\n');
  // no-arbitrary-tw-values: a scoped-utility (w-) arbitrary-value class, off-token, not in ALLOWLIST.
  fx("packages/client/src/features/__g_arbtw/components/__g_arbtw.tsx", 'export const G = <div className="w-[137px]" />;\n');
  // no-off-token-radius-shadow: a default-scale shadow utility in a real className site, off-token,
  // not in ALLOWLIST.
  fx("packages/client/src/features/__g_offtoken/components/__g_offtoken.tsx", 'export const G = <div className="rounded-lg shadow-md" />;\n');
  // no-hover-display-swap: a hover-keyed DISPLAY utility (the P0 hit-test oscillator), not in ALLOWLIST.
  fx("packages/client/src/features/__g_hoverswap/components/__g_hoverswap.tsx", 'export const G = <div className="group-hover/row:hidden" />;\n');
  // density-tier: `rounded-card` outside the ELEVATED family, in a file with no baseline budget (A1). The
  // fixture path is deliberately NOT in the committed density-tier.baseline.json, so its budget is 0.
  fx(
    "packages/client/src/features/__g_density/components/__g_density.tsx",
    'export const G = <div className="rounded-card border border-border bg-card" />;\n',
  );
  // motion-token-purity: a CSS file with a raw duration + easing in a transition declaration (off-token,
  // not in ALLOWLIST). The gate reads .css via fs.globSync (not ts-morph), so a __g_ CSS fixture in the
  // real src tree is picked up; the __g_ excludes on the OTHER consumers don't reach fs.globSync.
  fx("packages/ui/src/__g_motion/__g_motion.css", ".g {\n  transition: transform 220ms ease;\n}\n");
  // no-off-token-inline-style: a JSX inline `style={{ borderRadius: "8px" }}` raw-literal (a token-backed
  // property written as a raw literal — the inline/imperative hole the className + CSS gates can't see),
  // in a file not in the ALLOWLIST. The gate walks the ts-morph project's own files, so a __g_ .tsx in the
  // real src tree is scanned.
  fx("packages/client/src/features/__g_inlinestyle/components/__g_inlinestyle.tsx", 'export const G = <div style={{ borderRadius: "8px" }} />;\n');
  // no-effect-on-shared-selection: a feature effect depping a selection-hook result (the chase).
  // The hook is a local `declare` — the gate matches by NAME (AST-only), so the fixture parses
  // standalone without importing #state.
  fx(
    "packages/client/src/features/__g_chase/components/__g_chase.tsx",
    "declare function useActiveChatId(): string | null;\ndeclare function useEffect(fn: () => void, deps: unknown[]): void;\nexport function GChase(): null {\n  const chatId = useActiveChatId();\n  useEffect(() => {\n    void chatId;\n  }, [chatId]);\n  return null;\n}\n",
  );
  // zustand-selector-derived: a store-hook selector returning a fresh object literal, unwrapped.
  fx(
    "packages/client/src/state/__g_zustand.ts",
    "declare const useGStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useGStore((s) => ({ a: s.a, b: s.b }));\n",
  );
  // vector-scope-derived: a domain OUTSIDE the sanctioned set importing a vector-table symbol (D20).
  fx(`${D}/__g_vec/persistence/x.ts`, `import { chatDigests } from "@orb/db";\nexport const x = chatDigests;\n`);
  // turn-identity: a `principal` identifier inside the Principal-blind chat engine (D19).
  fx(`${D}/chat/engine/__g_ti.ts`, "export function leak(principal: { userId: string }): string {\n  return principal.userId;\n}\n");
  // membership-enforcer: an owner-equality comparison inside domain/chat (D18).
  fx(`${D}/chat/verbs/__g_me.ts`, "export const isOwner = (c: { ownerId: string }, u: string): boolean => c.ownerId === u;\n");
  // chat-viewer-plane-canon-reads: a VIEWER-plane verb (matrix `listMessages: "member"`) reaching the
  // floorless bulk canon reader — the D79 leak shape. The gate resolves the verb through the
  // `ChatService["<verb>"]` return annotation and keys the verdict off the LIVE authority matrix.
  fx(
    `${D}/chat/verbs/__g_vpcr.ts`,
    'import type { ChatService } from "../contract/service";\nimport { loadCanonHistory } from "../persistence/queries";\n\nexport function createGVpcr(): ChatService["listMessages"] {\n  return (async (a: never) => await loadCanonHistory(a, a)) as never;\n}\n',
  );
  // single-stream-transport: a `.subscription(` on a router that is neither stream.ts nor in the gate's
  // cited `<router>.<proc>` EXEMPT fold ledger — a second always-on SSE socket per tab (spec §11).
  fx(
    "packages/server/src/transport/trpc/routers/__g_substream.ts",
    "export const gSubstreamRouter = {\n  live: authedProcedure.subscription(() => source()),\n};\n",
  );
  // firehose-import-allowlist: the unclamped all-chats firehose imported outside entry/compose (D79).
  fx("packages/server/src/transport/trpc/__g_firehose.ts", 'import { subscribeAllChatEvents } from "./index";\nexport const f = subscribeAllChatEvents;\n');
  // owner-role-split: a global-role literal comparison outside admin/guard.ts (D17).
  fx("packages/server/src/domain/__g_role.ts", 'export const elevated = (p: { role: string }): boolean => p.role === "admin";\n');
  // assets-single-writer arm 1: storeBlob imported outside domain/assets (the CAS write chokepoint).
  fx(`${D}/hub/__g_asw1.ts`, 'import { storeBlob } from "../assets/persistence/queries.ts";\nexport const s = storeBlob;\n');
  // assets-single-writer arm 2: a raw insert(assets) outside domain/assets.
  fx(`${D}/hub/__g_asw2.ts`, 'import { assets } from "@orb/db";\nexport const w = (db: { insert: (t: unknown) => void }) => db.insert(assets);\n');
  // own-tables-only: a VERB importing another domain's table off the @orb/db barrel. `__g_own` owns no
  // schema file, so `characters` (character's) is foreign, and the path is outside `persistence/` — the one
  // slot the gate scopes out. (The `__g_asw2` fixture above trips it too, incidentally; this row is the
  // deliberate one, so a change to that fixture can never silently un-fire this gate.)
  fx(`${D}/__g_own/verbs/x.ts`, 'import { characters } from "@orb/db";\nexport const x = characters;\n');
  // serde-core-seal: the PNG card-chunk engine imported outside the import/export serde homes.
  fx(`${D}/hub/__g_serde.ts`, 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n');
  // fetch-fn-in-features: a client feature file hand-writing a bare global fetch( (the R5 offense).
  fx("packages/client/src/features/__g_fetchfeat/lib/load.ts", 'export async function load() {\n  return await fetch("/api/x");\n}\n');
  // query-freshness-coverage: a consumed query key with no invalidation row and no registry cite — the
  // frozen-surface class (the read is keyed on a ghost router so it can never collide with a real proc).
  fx("packages/client/src/features/__g_qfresh/components/__g_qfresh.tsx", "export const g = trpc.__g_ghost.frozenRead.queryOptions({});\n");
  // dangling-refs arm 1: a gates-dir stub whose `gate` object cites a ghost doc. NOT exported — the loader
  // skips it as un-ported (the __g_diaglegi precedent); the arm-1 scanner reads the local `gate` variable.
  fx("scripts/check/gates/__g_dangl.ts", 'const gate = { docRow: "__g_ghost-nowhere.md" };\nexport const stub = gate;\n');
  // suppressions: a marker in a file with NO baseline entry (budget 0) — the exceed arm fires.
  fx(`${D}/hub/__g_suppr.ts`, "// biome-ignore lint/suspicious/noExplicitAny: fixture probe\nexport const g = 1;\n");
  // monotonic-tests tooth 1: an unconditional skip with no escape marker at all.
  fx("tests/tooling/__g_skip.test.ts", 'import { test } from "support/test";\ntest.skip("g", () => {});\n');
  // monotonic-tests tooth 3 (STALE marker, 2026-08-03): a reasoned escape marker guarding NO skip — the
  // one-sided-escape rot the two-sided law bans (the skip was un-skipped; the exemption outlived it and now
  // silently pre-authorizes the next skip written on that line). The marker text is ASSEMBLED from parts so
  // THIS comment can't carry the literal token and become a stale marker in its own right — the same
  // self-reference dodge the `__g_det` / `__g_fab` fixtures use for their own gates' tokens.
  fx(
    "tests/tooling/__g_stalemarker.test.ts",
    `import { test } from "support/test";\n// ${["allow", "skip"].join("-")}: obsolete reason\ntest("g runs", () => {});\n`,
  );
  // bus-coverage: NO fixture — its DEFERRED map is now EMPTY (the last deferral, `expression`, closed when the
  // E3 classify emit landed). With no deferred member, neither STALE (needs a deferred member) nor MISSING
  // (needs an un-emitted REAL member — a `__g_` file can't add one to the single-home union) is fixturable, so
  // bus-coverage joins UNFIXTURABLE_GATES; the STALE mechanism stays proven by the `user-bus-coverage` twin
  // below (its DEFERRED `connectionsChanged`). Keep in sync with the DEFERRED map in bus-coverage.ts.
  // user-bus-coverage: the STALE arm — the DEFERRED `connectionsChanged` member (no per-user connection
  // store yet) gains an emit-site literal in domain scope → "stale allowlist". Keep in sync with the
  // DEFERRED map in user-bus-coverage.ts (if a real per-user connection emit lands, retarget this fixture).
  fx(`${D}/chat/__g_userbus.ts`, 'export const staleUserBusEmit = "connectionsChanged";\n');
  // rpg-bus-coverage: NO fixture — as of W1c-b its DEFERRED map is EMPTY (every RpgBusEvent member gained a real
  // emit site in domain/rpg/**). With no deferred member, neither STALE (needs a deferred member) nor MISSING (a
  // `__g_` file can't add a REAL member to the single-home union) is fixturable, so it joins UNFIXTURABLE_GATES
  // (the `bus-coverage` twin's exact posture); the STALE mechanism stays proven by the `user-bus-coverage` twin.
  // member-card-clamped: a re-spelled MemberCardView declaration outside contracts (D22/PD-111).
  fx(`${D}/character/__g_mcv.ts`, "export interface MemberCardView {\n  readonly name: string;\n}\n");
  // diagnostic-legibility: a gate-corpus `message:` string carrying no doc/code-home pointer (the
  // meta-gate reads scripts/check/gates from the shared project, so its fixture lives there, not under
  // packages/; no `gate` export, so the loader skips it as un-ported).
  fx("scripts/check/gates/__g_diaglegi.ts", 'export const stub = { message: "a bare diagnostic with no home" };\n');
  // test-presence-client: a client data/ file with a callable export and no tests/client mirror.
  fx("packages/client/src/data/__g_presclient.ts", "export function gPresClient(): number {\n  return 1;\n}\n");
  // surface-in-a-container: a surface with raw structural JSX, no Container, no anchors/ dir under
  // its (stray) feature — the anchor-provided exemption has nothing to exempt it with.
  fx("packages/client/src/features/__g_surfacefeat/surfaces/__g_thing-surface.tsx", "export function gThingSurface() {\n  return <div>hi</div>;\n}\n");
  // surface-a11y-focus: a drill-down surface missing focus restoration or auto-focus wrapper.
  // The function name is assembled so the literal isn't present in THIS file's source — only the
  // written fixture resolves to the unfocused surface (same pattern as the ambient-clock fixture L88).
  fx(
    "packages/client/src/features/__g_focus/surfaces/__g_nofocus-surface.tsx",
    // biome-ignore lint/nursery/noUnnecessaryTemplateExpression: The function name is assembled so the literal isn't present in THIS file's source.
    `export function ${"gNoFocus"}Surface() {\n  return <div>unfocused</div>;\n}\n`,
  );
  // registry-assembly-at-door-only: a createRegistry( call in a feature file — outside the door.
  fx(
    "packages/client/src/features/__g_regdoor/lib/__g_regdoor.ts",
    'declare function createRegistry<T>(name: string, ids: readonly string[], defs: T): unknown;\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
  );
  // placeholder-copy-registry: a PAIR of co-located `*-section` files sharing one (title, description)
  // placeholder — the cross-file distinctness "SAME" arm. The `-section` path shape (SECTION_FILE_RE)
  // matches ANY owner folder, so `__g_*` folders trip the real-tree scan with zero collision against the
  // real 7 (distinctness keys on the string pair, not the path).
  fx(
    "packages/client/src/features/__g_phcopy_a/lib/__g_phcopy_a-section.ts",
    'import type { SectionDefinition } from "#state";\nexport const gPhcopyASection: SectionDefinition = { id: "__g_phcopy_a", placeholder: { title: "Dup", description: "same copy" }, content: { planned: "x" }, context: { kind: "none" } };\n',
  );
  fx(
    "packages/client/src/features/__g_phcopy_b/lib/__g_phcopy_b-section.ts",
    'import type { SectionDefinition } from "#state";\nexport const gPhcopyBSection: SectionDefinition = { id: "__g_phcopy_b", placeholder: { title: "Dup", description: "same copy" }, content: { planned: "x" }, context: { kind: "none" } };\n',
  );
  // no-array-literal-querykey: a client options object minting a queryKey as an inline array literal
  // (keys are 100% tRPC-proxy-derived). These gates scope to packages/client/src ONLY, so writing the
  // banned shapes literally in THIS tests/tooling file can't self-trip them.
  fx("packages/client/src/features/__g_qkey/lib/__g_qkey.ts", `export const opts = { queryKey: ["chat", "list"], enabled: true };\n`);
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
  // form-factory-for-multifield: a feature component hand-rolling ≥3 controlled form inputs (value/checked
  // + an onChange-family handler) while importing NEITHER editor factory — the ≥3-field form that dodges
  // Form entirely (D54 §13.4).
  fx(
    "packages/client/src/features/__g_multifield/components/__g_multifield.tsx",
    "export function GMultiField() {\n  return (\n    <div>\n      <Input value={a} onChange={set} />\n      <Select value={b} onValueChange={set} />\n      <Switch checked={c} onCheckedChange={set} />\n    </div>\n  );\n}\n",
  );
  // no-manual-autosave-flush: a features/** function body calling BOTH a structural array op AND
  // handleSubmit — the retired §7-trap call-site flush the D78 SEAL armed (autosave-form-doctrine.md §7 G-A).
  fx(
    "packages/client/src/features/__g_autoflush/lib/__g_autoflush.ts",
    "export function gOnAdd(form: F): void {\n  form.pushFieldValue('items', v);\n  void form.handleSubmit();\n}\n",
  );
  // ── ledger-gate wave (activated 2026-07-09) — fixtures for the newly-live gates ──
  // ownerid-registry: an ownerId column on a table NOT in the D23 OWNERID_ALLOWLIST.
  fx(
    "packages/db/src/schema/__g_ownerid.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gOwnerid = sqliteTable("__g_ownerid", { ownerId: text("owner_id").references(() => gOwnerid.ownerId) });\n',
  );
  // lifecycle-portability: an OWNER-STAMPED canon table that no portable kind carries and no
  // NON_PORTABLE_CANON row classifies — the F1 shape (databank sat exactly here while every full-account
  // backup silently dropped it). Its own fixture rather than riding `__g_ownerid`'s: the two gates ask
  // different questions of the same column, and a shared fixture hides it when one of them dies.
  fx(
    "packages/db/src/schema/__g_lifecycle.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gLifecycle = sqliteTable("__g_lifecycle", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
  );
  // table-scoping-class: a schema table with NO row in TABLE_SCOPING_CLASSES — unclassified at birth.
  fx(
    "packages/db/src/schema/__g_scopeclass.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gScopeclass = sqliteTable("__g_scopeclass", { id: text("id").primaryKey() });\n',
  );
  // owner-scoped-reads: a bare `eq(T.id, …)` on the (a)-class `characters` table, no owner predicate,
  // no post-fetch compare, no marker.
  fx(
    "packages/server/src/domain/__g_ownerreads/persistence/__g_ownerreads.ts",
    'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport async function gLoad(db: D, id: string) {\n  return db.select().from(characters).where(eq(characters.id, id)).limit(1);\n}\n',
  );
  // owner-scoped-writes: a bare `eq(T.id, …)` DELETE on the (a)-class `characters` table, no owner
  // predicate and no `@owner-scope-write-ok:` marker.
  fx(
    "packages/server/src/domain/__g_ownerwrites/persistence/__g_ownerwrites.ts",
    'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport async function gDrop(db: D, id: string) {\n  return db.delete(characters).where(eq(characters.id, id));\n}\n',
  );
  // owner-scoped-upserts: an `onConflictDoUpdate` on the (a)-class `characters` table whose conflict target
  // is the bare PK — no owner column in target/targetWhere/setWhere and no `@owner-scope-upsert-ok:` marker.
  fx(
    "packages/server/src/domain/__g_ownerupserts/persistence/__g_ownerupserts.ts",
    'import { characters } from "@orb/db";\nexport async function gPut(db: D, row: R) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: characters.id, set: { name: row.name } });\n}\n',
  );
  // injected-op-caller-param: a domain contract op taking a branded entity id and returning a Promise, with
  // no caller/scope param and no CALLER_FREE_OPS row.
  fx(
    "packages/server/src/domain/__g_opcaller/contract/__g_opcaller.ts",
    'import type { CharacterId } from "@orb/kit/ids";\nexport type GRenameCardOp = (characterId: CharacterId, name: string) => Promise<void>;\n',
  );
  // brand-in-name-position: a signature taking `chatId: string` while `ChatId` is minted in @orb/kit/ids.
  // Post-terminal-state (the baseline was burned to {} and deleted, 2026-08-03) every finding reports
  // directly — this planted signature is the gate's standing live-tree bite proof.
  fx("packages/server/src/domain/__g_brandpos/verbs/__g_brandpos.ts", "export function gPost(chatId: string): void {\n  void chatId;\n}\n");
  // detached-work-traced: statement-position fire-and-forget with a DISCARDING rejection handler and no
  // detached root span. The real tracing module supplies the derived `withRequestSpan` vocabulary.
  fx(
    "packages/server/src/domain/__g_detached/__g_detached.ts",
    "export function gFire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
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
  fx("packages/server/src/infra/auth/__g_userid.ts", "export function gAuth(userId: string): string {\n  return userId;\n}\n");
  // content-part-seam: a ChatContentPart import from @orb/contracts/chat OUTSIDE the D51 seam set.
  fx(
    "packages/server/src/domain/__g_contentpart/x.ts",
    'import type { ChatContentPart } from "@orb/contracts/chat";\nexport const g = (p: ChatContentPart): ChatContentPart => p;\n',
  );
  // no-raw-egress: a bare `fetch(` in packages/server/src outside the sanctioned provider-egress zones.
  fx("packages/server/src/domain/__g_egress.ts", 'export async function gFetch(): Promise<unknown> {\n  return fetch("http://example.test");\n}\n');
  // contract-verb-presence: a __g_ domain whose contract/service.ts declares a verb on a *Service interface
  // with NO test in tests/server/domain/__g_verbpres/ (the domain tree is empty → the verb is uncovered).
  fx("packages/server/src/domain/__g_verbpres/contract/service.ts", "export interface GVerbPresService {\n  readonly gUntested: () => Promise<void>;\n}\n");
  // no-test-fabrication: a tests/ file with a `as unknown as` double-cast NOT in the baseline (baseline 0
  // for a __g_ path → over budget → RED). The banned cast is ASSEMBLED so the literal never appears in THIS
  // file's own source (which the gate also scans) — only the written fixture resolves to it (same technique
  // as the ambient-clock fixture above).
  fx("tests/server/__g_fab.test.ts", `export const g = ({} ${["as", "unknown", "as"].join(" ")} { n: number }).n;\n`);
  // asset-refs-fk-coverage: a schema column with a real FK to `assets.id` (importing the REAL
  // packages/db/src/schema/assets.ts) that is registered in NEITHER ASSET_REFS nor
  // DERIVED_ASSET_COLUMNS (domain/assets/persistence/asset-refs.ts) — the gate reads the real
  // registry file, so an injected __g_ table with no matching registry row always fires.
  fx(
    "packages/db/src/schema/__g_assetfk.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { assets } from "./assets";\nexport const gAssetFk = sqliteTable("__g_asset_fk", {\n  id: text("id").primaryKey(),\n  assetId: text("asset_id").references(() => assets.id),\n});\n',
  );
  // no-vanity-alias: a workspace rename-import whose original name isn't otherwise present in the module
  // (rule a — the cosmetic-alias case; @orb/ui + db-`*Table`/contracts-`*Wire` + genuine collisions are exempt).
  fx(`${D}/__g_vanity/x.ts`, 'import { Foo as Bar } from "@orb/kit/x";\nexport const g = Bar;\n');
  // warning-code-coverage: NOT fixtured here — it is a whole-corpus emit-coverage RATCHET (a tuple member
  // with no emit site across the real home + emit scope). An injected `__g_` file can neither match its
  // fixed tuple-home path nor REMOVE a real emit, so it cannot be driven from an isolated fixture; it is
  // proven to fire by its dedicated self-test (tests/tooling/warning-code-coverage.residual.test.ts) and is
  // exempted from the anti-drift assertion below.
  // list-row-adoption: a LIST-surface file (imports LibrarySurfaceShell) whose `.map()` row roots in a
  // plain interactive <div>, not ListRow/LibraryRow (client-architecture-lockdown.md §16 G6).
  fx(
    "packages/client/src/features/__g_listrow/surfaces/__g_listrow-surface.tsx",
    'import { LibrarySurfaceShell } from "#components";\ndeclare const items: { id: string; name: string }[];\ndeclare function select(item: unknown): void;\nexport const G = () => (\n  <LibrarySurfaceShell>\n    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n  </LibrarySurfaceShell>\n);\n',
  );
  // ui-skin-fragment-purity: a variants file OUTSIDE packages/ui/src/lib/ re-spelling a homed skin
  // fragment (the OVERLAY_ARROW diamond) by hand — the derive-W2 G25 seal. scanRoot covers ui/src sans
  // lib/, so a __g_ primitive variants file trips the real-tree scan.
  fx("packages/ui/src/primitives/__g_skinfrag/variants.ts", 'export const gArrow = "size-row rotate-45 border border-border bg-popover";\n');
  // feature-css-files: a .css file under features/** outside the shell.css allowlist
  // (client-architecture-lockdown.md §4/§16 G14). Reads via fs.globSync, not ts-morph, so the real-tree
  // fixture is picked up regardless of tsconfig excludes.
  fx("packages/client/src/features/__g_featurecss/lib/__g_featurecss.css", ".g { color: red; }\n");
  // feature-owns-definition: a features/* dir with only a non-definition file (no lib/*-{section,modal,
  // pane,chrome}.tsx) — the O2 empty-dir rule (client-architecture-lockdown.md §3/§18 O2). Reads via
  // node:fs, not ts-morph, so the real-tree fixture is picked up regardless of tsconfig excludes.
  fx("packages/client/src/features/__g_ownsnodef/lib/helper.ts", "export const g = 1;\n");
  // bus-channel-primitive: a bespoke `new EventEmitter()` under transport/, outside bus-channel.ts's own
  // home (client-architecture-lockdown.md §13/§16 G10 — the M9 unification).
  fx("packages/server/src/transport/__g_bce/x.ts", 'import { EventEmitter } from "node:events";\nexport const gEmitter = new EventEmitter();\n');
  // bus-definition-belts: a `*_EVENT_TYPES satisfies Record<X["type"], true>` const in @orb/contracts with
  // NEITHER a coverage-gate file naming it NOR a client-side total map in data/invalidation.ts — both belts
  // missing (client-architecture-lockdown.md §13 laws 4/5, §16 G11).
  fx(
    "packages/contracts/src/__g_busbelt/index.ts",
    'export type GBeltEvent = { type: "gTick" };\nexport const G_BELT_EVENT_TYPES = { gTick: true } satisfies Record<GBeltEvent["type"], true>;\n',
  );
  // membership-fan-guard: an actor-only `emitUserEvent` identifier inside domain/chat — member-visible
  // state must fan via emitChatChanged/the chat bus, never a single-user channel (client-architecture-
  // lockdown.md §13 law 2/§16 G12).
  fx(
    `${D}/chat/verbs/__g_mfg.ts`,
    'export const leak = (emitUserEvent: (u: string, e: unknown) => void): void => {\n  emitUserEvent("u1", { type: "x" });\n};\n',
  );
  // ── grit→ts-morph migration wave (2026-07-15) — fixtures for every ported plugin-turned-gate. Each is
  // the gate's own mustFlag violation shape planted at a real-tree path its scanRoot covers; banned
  // literals (ambient clock/random, unseeded UUID) are assembled so THIS file's source stays clean for
  // the textual test-determinism scan (same technique as the __g_det fixture above). ──
  // chat-stream-writes-in-bus-only: importing the stream store's write api outside data/bus/ + main.tsx.
  fx("packages/client/src/features/__g_streamwrite/hooks/__g_h.ts", 'import { chatStream } from "#state";\nexport const s = chatStream;\n');
  // client-cache-surgery-only-in-data: an imperative QueryClient cache call outside data/.
  fx(
    "packages/client/src/features/__g_cachesurgery/hooks/__g_h.ts",
    "export const f = (qc: { invalidateQueries: (a: unknown) => void }): void => {\n  qc.invalidateQueries({});\n};\n",
  );
  // no-await-db-in-loop: an awaited db query inside a for-of (the N+1 shape).
  fx(
    `${D}/__g_awaitloop/x.ts`,
    "declare const xs: string[];\ndeclare const db: { select: () => { from: (t: unknown) => Promise<unknown> } };\ndeclare const y: unknown;\nexport async function f(): Promise<void> {\n  for (const x of xs) {\n    void x;\n    await db.select().from(y);\n  }\n}\n",
  );
  // no-chat-trpc-in-surface: an inline chat-verb mutation in a surface file.
  fx("packages/client/src/features/__g_chattrpc/surfaces/__g_s.ts", "export const o = trpc.chat.send.mutationOptions();\n");
  // no-color-literals: an arbitrary hex color in a className.
  fx("packages/client/src/features/__g_colorlit/components/__g_c.tsx", 'export const C = () => <div className="text-[#fff000]" />;\n');
  // no-context-provider: the React-19-deprecated <Context.Provider> form.
  fx("packages/client/src/features/__g_ctxprov/components/__g_c.tsx", "export const Host = () => <MyContext.Provider value={1} />;\n");
  // no-context-returntype: a ReturnType<> DI-bundle type in a context.ts.
  fx(`${D}/__g_ctxret/context.ts`, "declare function makeCtx(): { n: number };\nexport type Ctx = ReturnType<typeof makeCtx>;\n");
  // no-decorators: a decorator (non-erasable syntax — no runtime under type-stripping).
  fx(`${D}/__g_decorator/x.ts`, "function dec(): void {}\nexport class A {\n  @dec foo(): number {\n    return 1;\n  }\n}\n");
  // no-default-props: the React-19-deprecated `defaultProps` assignment.
  fx("packages/ui/src/__g_defprops/__g_c.tsx", "const GDef = () => <div />;\nGDef.defaultProps = { id: 1 };\nexport { GDef };\n");
  // no-direct-useform: a direct useForm() call outside the shared #forms toolkit.
  fx("packages/client/src/features/__g_useform/hooks/__g_h.ts", "export const x = useForm({});\n");
  // no-external-media-without-gate: a raw <img> in a feature (outside MessageMedia).
  fx("packages/client/src/features/__g_extmedia/components/__g_c.tsx", 'export const C = (u: string) => <img src={u} alt="" />;\n');
  // no-fake-disabled-id: the empty-string branded-id fake-disabled sentinel.
  fx("packages/client/src/features/__g_fakeid/hooks/__g_h.ts", 'export const id = castId("");\n');
  // no-form-state-in-useeffect: form.state.values in a useEffect dep array.
  fx(
    "packages/client/src/features/__g_formeffect/components/__g_c.tsx",
    "declare function useEffect(fn: () => void, deps: unknown[]): void;\nexport function C(form: { state: { values: unknown } }): void {\n  useEffect(() => {}, [form.state.values]);\n}\n",
  );
  // no-forward-ref: the React-19-deprecated forwardRef import + call.
  fx(
    "packages/client/src/features/__g_fwdref/components/__g_c.tsx",
    'import { forwardRef } from "react";\nexport const GInput = forwardRef((props, ref) => <input ref={ref} />);\n',
  );
  // no-use-context: the React-19-deprecated useContext reader (both doors — the import and the call).
  fx("packages/client/src/features/__g_usectx/components/__g_c.tsx", 'import { useContext } from "react";\nexport const v = useContext(GCtx);\n');
  // no-manual-memo: a hand-written memo hook imported from react in compiled client code. The path is a
  // __g_ dir at the ui/src root (the __g_oversize / __g_motion / __g_defprops placement precedent) and is
  // NOT in the gate's EXEMPTIONS table, so its budget is zero.
  fx("packages/ui/src/__g_manualmemo/__g_manualmemo.ts", 'import { useMemo } from "react";\nexport const v = useMemo(() => 1, []);\n');
  // no-legacy-react-api: a legacy react import (arm 1). The gate's escape marker is NOT spelled anywhere in
  // this file — its stale-marker arm scans the shared project, tests/ included, so a literal marker here
  // would make this suite's own source a permanent violation (the __g_det / __g_fab self-reference dodge).
  fx("packages/ui/src/__g_legacyreact/__g_legacyreact.ts", 'import { cloneElement } from "react";\nexport const c = cloneElement;\n');
  // ── the baseui-* family (docs/design/baseui-crunch.md item 4) ─────────────────────────────────────
  // All five fixturable baseui gates read the COMMITTED surface manifest, which is present on the real
  // tree — so a `__g_` seal that imports @base-ui/react as a value is enough to drive each of them.
  // baseui-derives-not-respells: ARM A — a seal FORWARDING a re-declared Base UI handler one argument
  // short (the eventDetails strip). The spread is what puts the prop in play (the forwarding test).
  fx(
    "packages/ui/src/primitives/__g_bderive/__g_bderive.tsx",
    'import { Select as BaseSelect } from "@base-ui/react/select";\nexport interface GDeriveProps {\n  onValueChange?: (value: string) => void;\n}\nexport const GDerive = (p: GDeriveProps) => <BaseSelect.Root {...p} />;\n',
  );
  // baseui-render-prop-composition: the Radix `asChild` spelling on a Base UI part.
  fx("packages/ui/src/primitives/__g_baschild/__g_baschild.tsx", "export const GAsChild = <Menu.Trigger asChild={true} />;\n");
  // baseui-state-data-attributes: a React mirror of a part's OWN state key driving its className. The
  // key must be one Base UI publishes for that part (`Popover.Popup` → open/side/align/instant/...).
  fx(
    "packages/ui/src/primitives/__g_bstate/__g_bstate.tsx",
    'import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport const GState = () => {\n  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n};\n',
  );
  // baseui-portal-container-seam: a portal-bearing seal that neither declares nor wires `container`.
  fx(
    "packages/ui/src/primitives/__g_bportal/__g_bportal.tsx",
    'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface GPortalProps {\n  className?: string;\n}\nexport const GPortal = () => (\n  <BaseDialog.Portal>\n    <BaseDialog.Popup />\n  </BaseDialog.Portal>\n);\n',
  );
  // baseui-anatomy-completeness: its ARM B — a file that RENDERS a part the committed ledger rules
  // `sealed-away`. (ARM A, "exposed but nobody renders it", is not fixturable from a source file: a
  // `__g_` file can only ADD renders, and the finding would anchor on the manifest rather than a
  // `__g_` path, so it would survive the probe-artifact strip.) `Combobox.Backdrop` is sealed away
  // because a suggestion popup is non-modal by design — keep in sync with ui-package-design.md §14.
  fx(
    "packages/ui/src/primitives/__g_banatomy/__g_banatomy.tsx",
    'import { Combobox as BaseCombobox } from "@base-ui/react/combobox";\nexport const GAnatomy = () => <BaseCombobox.Backdrop />;\n',
  );
  // no-if-is-group: an isGroup boolean branch (solo is the degenerate group — D16).
  fx(`${D}/__g_isgroup/x.ts`, "export function f(isGroup: boolean): number {\n  if (isGroup) {\n    return 1;\n  }\n  return 0;\n}\n");
  // no-inline-optimistic-in-surface: optimistic-mutation plumbing in a surface file.
  fx(
    "packages/client/src/features/__g_optimistic/surfaces/__g_s.ts",
    "export const X = (queryClient: { setQueryData: (k: unknown, v: unknown) => void }): void => {\n  queryClient.setQueryData(['k'], 1);\n};\n",
  );
  // no-inline-types: an exported interface in a domain verb (types live in contract/).
  fx(`${D}/__g_inltypes/verbs/__g_v.ts`, "export interface Leak {\n  a: number;\n}\n");
  // no-layout-context-props: a layout-context boolean prop (compact) on JSX (D42).
  fx("packages/client/src/features/__g_layoutprops/components/__g_c.tsx", "export const G = <EntityCard compact={true} />;\n");
  // no-loose-id-cast: an `as never` type-check launder.
  fx(`${D}/__g_loosecast/x.ts`, "declare const x: unknown;\nexport const a = x as never;\n");
  // no-manual-token-estimate: the hand-rolled `.length / 4` token estimate.
  fx(`${D}/__g_tokest/__g_tok.ts`, "export function f(text: string): number {\n  return text.length / 4;\n}\n");
  // no-hardcoded-side-gen-sampling: a hardcoded sampling literal at a domain side-gen call site.
  fx(`${D}/__g_sidegen/__g_s.ts`, "export const opts = { temperature: 0.3, maxTokens: 24 };\n");
  // no-media-queries-in-features: a viewport breakpoint variant in a feature className.
  fx("packages/client/src/features/__g_mediaq/components/__g_c.tsx", 'export const C = () => <div className="md:flex-row" />;\n');
  // no-mint-via-cast: minting an id by laundering a fresh UUID through castId (assembled).
  fx(`${D}/__g_mintcast/x.ts`, `export const a = castId(crypto.${["random", "UUID"].join("")}());\n`);
  // no-multiplexed-mutation-error: two mutations' errors multiplexed through ??.
  fx(
    "packages/client/src/features/__g_muxerr/hooks/__g_h.ts",
    "export const e = (a: { error: unknown }, b: { error: unknown }): unknown => a.error ?? b.error;\n",
  );
  // no-raw-clock: an ambient clock read outside the @orb/kit/time seam (assembled).
  fx(`${D}/__g_rawclock/x.ts`, `export const t = ${["Date", "now"].join(".")}();\n`);
  // no-raw-container-widths: a raw content-width utility on a container element.
  fx("packages/client/src/features/__g_containerw/components/__g_c.tsx", 'export const C = () => <div className="w-[600px]" />;\n');
  // no-raw-id: an Id field typed as raw z.string() (no brand).
  fx(`${D}/__g_rawid/x.ts`, 'import { z } from "zod";\nexport const s = z.object({ chatId: z.string() });\n');
  // no-raw-intl-time: a raw Intl API construction outside the time seam.
  fx("packages/client/src/features/__g_intl/lib/__g_time.ts", 'export const f = new Intl.DateTimeFormat("en-US");\n');
  // no-raw-matchmedia: a raw matchMedia call outside the sanctioned viewport-hook homes.
  fx("packages/client/src/features/__g_matchmedia/hooks/__g_h.ts", 'export const f = window.matchMedia("(prefers-reduced-motion: reduce)");\n');
  // no-raw-random: an ambient random call in shipped source (assembled).
  fx(`${D}/__g_rawrandom/x.ts`, `export const r = Math.${["ran", "dom"].join("")}();\n`);
  // no-raw-spacing-in-features: a raw spacing utility in a feature className.
  fx("packages/client/src/features/__g_rawspacing/components/__g_c.tsx", 'export const C = () => <div className="p-4" />;\n');
  // no-raw-typography-in-features: a raw typography utility in a feature className.
  fx("packages/client/src/features/__g_rawtypo/components/__g_c.tsx", 'export const C = () => <p className="text-sm" />;\n');
  // no-raw-z-index: a raw z-index utility in a className.
  fx("packages/client/src/features/__g_rawz/components/__g_c.tsx", 'export const C = () => <div className="z-50" />;\n');
  // no-raw-zustand-persist: a bare zustand persist() outside the two minting factories.
  fx(
    "packages/client/src/features/__g_rawpersist/lib/__g_store.ts",
    "declare function create(x: unknown): unknown;\ndeclare function persist(init: unknown): unknown;\nexport const useGRogueStore = create(persist(() => ({})));\n",
  );
  // no-static-staletime: the banned `staleTime: "static"` (the bus drives freshness).
  fx("packages/client/src/features/__g_staletime/hooks/__g_h.ts", 'export const o = { staleTime: "static" };\n');
  // no-untrusted-html-in-main-dom: dangerouslySetInnerHTML outside the sanctioned seals (D44).
  fx("packages/client/src/features/__g_rawhtml/components/__g_c.tsx", "export const C = (s: string) => <div dangerouslySetInnerHTML={{ __html: s }} />;\n");
  // persistence-no-in-memory-state: a module-scope Map in a persistence/ file.
  fx(`${D}/__g_memstate/persistence/__g_p.ts`, "export const m = new Map();\n");
  // query-machine-seals: a useMutation import outside data/ (client-architecture-lockdown.md §16 G9).
  fx("packages/client/src/features/__g_qseals/hooks/__g_h.ts", 'import { useMutation } from "@tanstack/react-query";\nexport const m = useMutation;\n');
  // testid-typed-only: a freeform string data-testid (must come from the typed test-id home).
  fx("packages/client/src/features/__g_testid/components/__g_c.tsx", 'export const C = () => <div data-testid="freeform-string" />;\n');
  // theme-override-only-via-scope: an inline style overriding a color token custom property.
  fx("packages/client/src/features/__g_themeover/components/__g_c.tsx", "export const C = () => <div style={{ '--color-primary': 'red' }} />;\n");
  // zustand-selector-stability: a store-hook selector returning a fresh object literal.
  fx(
    "packages/client/src/features/__g_selstab/hooks/__g_h.ts",
    "declare const useGStore: (sel: (s: { a: number }) => unknown) => unknown;\nexport const v = useGStore((s) => ({ a: s.a }));\n",
  );
  // registry-context-via-mint: a hand createContext typed over a *Registry outside the mint home (G26).
  fx("packages/client/src/features/__g_regctx/hooks/__g_h.ts", "export const GRegCtx = createContext<Registry<string, number> | null>(null);\n");
  // selection-store-via-factory: a per-section selection store minting the raw createGatedStore door (G27).
  fx("packages/client/src/state/__g_gdrill-selection-store.ts", 'export const useGDrill = createGatedStore("g-drill-selection", () => ({ id: null }));\n');
  // bound-field-via-hook: a bound field importing the raw useFieldContext door instead of useBoundField (G28).
  fx("packages/client/src/forms/bound-fields/__g_field.tsx", 'import { useFieldContext } from "../contexts";\nexport const f = useFieldContext;\n');
  // dialog-via-composite: a features/** file importing the raw Dialog root from @orb/ui/dialog, not on the
  // allowlist — the FormDialog/ConfirmDialog composite door (derive-modernization-audit.md §W1 G24).
  fx(
    "packages/client/src/features/__g_dialog/components/__g_dialog.tsx",
    'import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";\nexport const G = <Dialog><DialogPopup><DialogTitle>x</DialogTitle></DialogPopup></Dialog>;\n',
  );
  // render-error-via-battery: a hand-rolled `renderError` arm (not QueryErrorState-rooted) in a client
  // file outside the allowlist — the read-error drift G29 seals (derive-modernization-audit.md §W4).
  fx("packages/client/src/features/__g_rerror/components/__g_rerror.tsx", "export const G = <B renderError={() => <Text>failed</Text>} />;\n");
  // settings-section-anchored: a heading-bearing <Section> with no `id` in a *-settings-surface.tsx — the
  // invisible-to-nav/search class the G4 arm seals (derive-modernization-audit.md §W5 item 9).
  fx(
    "packages/client/src/features/__g_settingsanchor/surfaces/__g_settingsanchor-settings-surface.tsx",
    'export const G = <Section heading="Host Claude"><span>x</span></Section>;\n',
  );
  // ui-size-via-variant: a call-site SIZE utility (the F2 `size-auto` incident shape) on a JSX element
  // imported from @orb/ui, at a path with no ALLOWLIST row (the debt baseline is gone — terminal zero).
  fx(
    "packages/client/src/features/__g_uisize/components/__g_uisize.tsx",
    'import { Button } from "@orb/ui/button";\nexport const G = <Button className="size-auto">x</Button>;\n',
  );
  // scrubber-home: the stateful hidden-span stream scrubber constructed outside its producer home
  // (domain/chat/substrate/member-visibility.ts) — the ed2aafc5 cold-scrubber reconnect-leak shape.
  fx(
    "packages/server/src/transport/__g_scrubhome.ts",
    'import { createHiddenSpanStreamScrubber } from "@orb/kit/content";\nexport const s = createHiddenSpanStreamScrubber();\n',
  );
  // macro-resolution-home: a client FORM component importing + calling the display pipeline's macro
  // resolver — the writable-field corruption class (the editor round-trips resolved text over the stored
  // template). Both arms fire on this one file.
  fx(
    "packages/client/src/features/__g_macrores/components/__g_macrores.tsx",
    'import { renderMessageForDisplay } from "#lib";\nexport const V = renderMessageForDisplay();\n',
  );
  // ct-no-oneshot-live-read-assert: a non-retrying `expect(await <locator>.boundingBox()).not.toBe(...)` in a
  // *.ct.tsx — the exact DEF-14 layout-rect shape the HARD (zero-baseline) gate flags on sight. Unescaped +
  // a plain value matcher → RED.
  fx(
    "tests/ui/primitives/__g_oneshot/__g_oneshot.ct.tsx",
    'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  const el = page.locator("div");\n  expect(await el.boundingBox()).not.toBe(null);\n});\n',
  );
  // two-class-role-authority: an inline `role === "host"` in an ENFORCEMENT position (the comparison gates a
  // `throw`) in a domain file that is neither a SANCTIONED_HOMES chokepoint nor ALLOWLISTed — the founding
  // shape (the six rpg verbs that re-spelled their chokepoint's compare). The gate's scanRoot is
  // `packages/server/src/domain/` ONLY, so writing the shape literally here cannot self-trip it, and the
  // fixture leaves the real-tree anchor (chat/substrate/auth/decide.ts) untouched — its both-ways stale arms
  // keep judging the REAL chokepoints, so this row adds a violation without faking one.
  fx(`${D}/__g_roleauth/verbs/x.ts`, 'export function f(role: string): void {\n  if (role !== "host") {\n    throw new Error("nope");\n  }\n}\n');
  // contract-derives-not-respells (ARM B): a hand-written `*Row` interface in a domain `contract/` whose
  // prefix names a REAL drizzle table (`WorkloadScheduleRow` → the live `workloadSchedules` export in
  // packages/db/src/schema/workloads.ts) instead of deriving `typeof workloadSchedules.$inferSelect`. ARM B is
  // the fixturable one: ARM A needs a name the sibling `packages/contracts/src/<domain>/` also exports, and a
  // `__g_` domain has no contracts sibling (planting one would need a SECOND fixture in contracts/ whose
  // domain name matches — the same shape, twice the surface, for no extra proof).
  // The gate's ALLOWLIST stale arm keys on the REAL-TREE anchor + real files, which this fixture does not
  // touch, so the added finding is the ARM-B bite alone.
  fx(`${D}/__g_cdnr/contract/probe-row.ts`, "export interface WorkloadScheduleRow {\n  readonly id: string;\n  readonly enabled: boolean;\n}\n");
  // zod-modern-spellings: ARM A (`.strict()` on a `z.object(…)` — respell as `z.strictObject`). Its other
  // three arms (all-literal union, hand-flattened `error.issues`, the `z.enum(["true","false"])` env
  // hand-roll) fire on the same fixture would be redundant here — one arm proves the gate is wired into the
  // live pass, which is all this anti-drift suite claims; every arm's own bite is proven per-arm by
  // gate-conformance's mustFlag rows. The gate scans `packages/**` only, so writing the shape literally in
  // THIS file cannot self-trip it, and the fixture leaves the real-tree anchor (foundation/env/index.ts)
  // untouched so its ISSUES_ALLOWLIST ratchet keeps judging the six real join sites.
  fx("packages/contracts/src/__g_zodspell/index.ts", 'import { z } from "zod";\nexport const gZodSpell = z.object({ a: z.string() }).strict();\n');
  // gate-modernization ARM A: a module in the gate corpus that exports no `gate` descriptor. The loader
  // SKIPS such a file (`mod.gate === undefined ⇒ continue`), so it enforces nothing forever with no signal
  // — the exact hole arm A closes. This is the ONE arm a throwaway file can drive: arm B needs a real
  // one-sided exemption table (planting one would ALSO have to defeat the committed handoff baseline) and
  // arm C needs a real doc whose §-anchor is missing. Both of those are proven by the gate's own conformance
  // mustFlag rows + its three live catches at mint. The fixture leaves the real corpus untouched, so the
  // baseline's stale-row arm keeps judging the REAL 16 tables.
  // no-hardcoded-model-prose: a fresh ≥12-word model-facing teach authored at a SEAM (rpg substrate) — a
  // new file has no baseline budget, so the slot-that-escaped-the-registry shape reds immediately.
  fx(
    "packages/server/src/domain/rpg/substrate/__g_prose.ts",
    'export const G_TEACH =\n  "When the scene calls for it, teach the model to answer in the narrator voice and keep that voice steady.";\n',
  );
  // ui-accname-survives-spread: a caller-props rest spread followed by an accessible-name attribute — the
  // avatar-stack clobber shape (the caller's aria-label can never win).
  fx(
    "packages/ui/src/primitives/__g_accn/__g_accn.tsx",
    'export function GAccn({ x, ...rest }: { x?: number }) {\n  return <div {...rest} aria-label="always mine" />;\n}\n',
  );
  // no-floorless-control-in-wrap: ONE mapped floorless Button inside a flex-wrap container = N runtime
  // siblings whose overflowing touch pseudos overlap across wrapped rows (the weather-picker geometry).
  fx(
    "packages/client/src/features/__g_floorless/components/__g_grid.tsx",
    'const ICONS = ["a", "b", "c"];\nexport function GGrid() {\n  return (\n    <div className="flex-wrap">\n      {ICONS.map((n) => (\n        <Button key={n} size="glyph-lg">{n}</Button>\n      ))}\n    </div>\n  );\n}\n',
  );
  // freeze-provenance-write-pairing: the founding D129-F defect verbatim — a `message_variants` UPDATE that
  // replaces `content` and leaves `rawContent`/`macroFreezes` attached, so the row keeps a freeze record
  // describing bytes that are gone. The fixture writes a NEW file, so canon-write.ts's real (fixed) writers
  // and the gate's own blindness tripwires keep judging the real tree untouched.
  fx(
    "packages/server/src/domain/chat/persistence/__g_freezeprov.ts",
    'import { messageVariants } from "@orb/db";\nexport const gStmt = db.update(messageVariants).set({ content: "replaced" }).where(eq(messageVariants.id, id));\n',
  );
  fx("scripts/check/gates/__g_nodescriptor.ts", "export const notAGateDescriptor = 1;\n");
}

// Registered gates that CANNOT be driven by an injected `__g_` fixture — whole-corpus ratchets whose
// trigger needs the real single-home tuple + emit corpus (removing an emit / adding a tuple member),
// which a throwaway file can't reproduce. Each is proven to fire by its OWN self-test in tests/tooling/.
// verify-registry-parity reconciles the ROOT package.json against the verify registry — a throwaway `__g_`
// file can't add a verification-shaped script to the real package.json (and injecting one there would be a
// real, non-throwaway edit), so it can't be driven by a fixture. Its bite is proven by its conformance
// mustFlag (a synthetic package.json with an unplaced test:* script) + its dedicated verify-run test.
// enforcement-registry-parity: its `__g_` arm is retired (the gate-file-vs-registry job is now the loader's
// fail-closed responsibility); its contract-form doc-reconciliation bite is proven by gate-conformance.
// tsconfig-routing-parity spawns `tsgo --showConfig` over the REAL tsconfig tree (the 7 programs) and
// reconciles their root membership against selection.ts's routing algebra — a throwaway `__g_` file can't
// alter a program's resolved include/files, so it can't be fixture-driven. Its bite is proven by its
// conformance mustFlag (a synthetic reach-back-include tree) + a real-tree break-confirm (misroute one
// file → RED → restore byte-identical).
// bus-coverage: its DEFERRED map is EMPTY (every ChatBusEvent member now emits — the E3 classify emit closed
// the last deferral). STALE needs a deferred member (none); MISSING needs an un-emitted REAL union member,
// which a throwaway `__g_` file can't add to the single-home `CHAT_BUS_EVENT_TYPES`. Its bite stays proven by
// its conformance mustFlag (a synthetic un-emitted member) + the `user-bus-coverage` twin's live STALE fixture.
// bus-payload-allowlist: scopes to 5 EXACT bus-contract file paths (BUS_FILES) — a __g_ sentinel path
// can't match. Bite proven by gate-conformance's mustFlag + the D16 real-file backup-pattern proof
// (apiKey planted on user-bus settingsChanged → RED → restored).
// knob-wire-coverage (D107): a whole-corpus coverage ratchet over SINGLE-HOME member sources
// (EffectiveAppConfig / USER_SETTINGS_SECTIONS / appSettingsSchema / DEFAULT_FORMAT_STRINGS /
// chatMetadataSchema). Its MISSING arm needs an UNWIRED member added to one of those single-home sources —
// a throwaway `__g_` file can't add a member to the real union/interface/schema, and the STALE/ORPHAN arms
// need a real registry edit. Its bite is proven by gate-conformance (per-arm mustFlag + STALE + the
// paired-anchor tripwire mustFlag) + its live run on the real tree with the founding registry.
// message-kind-policy-coverage: every REAL MessageKindPolicy axis (prompt/memory/reading) now has either a
// production reader or is single-LITERAL, and its DEFERRED map is empty — so on the real tree there is no
// unread axis left for a `__g_` file to fake a MISSING finding against (the interface itself is a single-home
// real file this fixture can't extend), and the STALE/ORPHAN arms need a live DEFERRED row that doesn't exist
// (see the note beside DEFERRED in message-kind-policy-coverage.ts). Its bite is proven by gate-conformance's
// mustFlag rows (a fresh unread axis, and mode B) + the founding catch when the `comment` row's
// `prompt:"never"` cell shipped unenforced.
// baseui-surface-manifest: it compares two ARTIFACTS — the installed `@base-ui/react` under
// packages/ui/node_modules and the committed surface manifest — and neither is something a `__g_`
// source file can perturb. Its bite is proven by six conformance mustFlag examples that materialize a
// synthetic installed package + manifest into a real temp dir (a new part, a new prop, an `unresolved`
// disposition, a reason-less `sealed-away`, the package missing entirely, and the reader's own
// learned-nothing tripwire), plus its live run on the real tree at the founding 1.7.0 surface.
const UNFIXTURABLE_GATES = new Set([
  "baseui-surface-manifest",
  "warning-code-coverage",
  "verify-registry-parity",
  "enforcement-registry-parity",
  "tsconfig-routing-parity",
  "bus-coverage",
  "rpg-bus-coverage",
  "bus-payload-allowlist",
  "knob-wire-coverage",
  "message-kind-policy-coverage",
]);

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
}, 300_000);

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

// Gates DELIBERATELY held DORMANT (`status:"dormant"` descriptors) — built + self-tested but not run by
// the live pass (runPass filters to status:"active"), so report.ts never prints them and they're absent
// from `registry`. Each has its own header explaining why + a residual self-test proving it still fires
// (tests/tooling/{monotonic-tests}.residual.test.ts drives the monotonic gate directly). This is the ONE
// sanctioned exemption from the file-vs-registry anti-drift check below.
const DORMANT_GATES = new Set<string>([]);

test("every ACTIVE gate file in scripts/check/gates is run by report.ts (anti-drift)", () => {
  // A gate file whose descriptor is status:"active" but that report.ts's live pass never prints would be
  // silently doing nothing. The loader IS the registry — an invalid/unwired gate file is a load-time RED —
  // so this closes the residual hole: every gate-file basename (kebab) must equal a gate name report.ts
  // prints, UNLESS it's an explicitly DORMANT gate (status:"dormant", not run by the live pass).
  const unregistered = GATE_FILES.filter((g) => !(registry.has(g) || DORMANT_GATES.has(g)));
  expect(unregistered).toEqual([]);
});
