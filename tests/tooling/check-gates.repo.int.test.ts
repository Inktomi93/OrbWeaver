// Pins that EVERY ts-morph/fs structural gate actually fires on a violation — the gate self-test the
// dep-cruiser suite has, now for tooling/src/verify/gates/*. A gate with a broken regex / AST query silently
// matches nothing and passes green (the exact failure the dep-cruiser test was built to catch); this is
// its structural-gate twin. The gate roster is DERIVED from the MIXED `check:structure` run's own output
// (loadMixedGateCorpus → runPass + runPolicyPass → renderPass + renderPolicyPass, #1584): every LEGACY gate it
// prints must fire on some fixture, so a new legacy gate added without a fixture FAILS here (anti-drift). A
// FINAL `defineGate` policy is printed on the same roster (its line carries the population denominator instead
// of a file scan) but is NOT asserted to fire on a `__g_` fixture: its bite receipt is `structure:policy-conformance`
// (`pnpm check:policy-conformance`), which runs every final policy's own mustFlag/mustPass rows through the
// production dispatcher on every `pnpm check` — a stronger receipt than one planted file. This is the live-tree
// complement to gate-conformance.repo.int.test.ts's synthetic mustFlag/mustPass examples.
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
import { loadMixedGateCorpus } from "../../tooling/src/verify/lib/loader.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { runPnpmWithBudget, scaledBudget } from "./_load-budget.ts";

// LOAD-HONEST BUDGET (#606). This hook runs `check:structure` TWICE — once CLEAN (→ the registry + the
// scan-health/ratchet/denominator assertions, which MUST read a clean tree) and once WITH `__g_` fixtures
// (→ the fired set). The two are NOT collapsible: the clean pass measures blindness/denominators over the
// REAL tree, and a fixture landing in a rotted gate's scanRoot would MASK a gate that is blind on the real
// tree — so both passes stay. A legacy-only pass measured ~214s quiet and ~250s under load; the MIXED pass
// (both dispatchers over one shared ts-morph Project) measured 173s quiet on 2026-09-11 — 129s legacy + 38s
// final, 7.7GB peak RSS (docs/reviews/gate-runtime/mixed-runtime-front-door.md §11.3) — so the 300s base still
// holds with margin and is KEPT, not re-guessed. Two passes never fit the old fixed 300s hook budget under any
// real contention. Each pass runs under its OWN load-scaled child `timeout` that throws a SELF-IDENTIFYING
// load kill (ORB-LOAD-KILL, exit-2 class) instead of letting vitest's opaque hook timeout fire and read as a
// real red. Solo (factor 1): PER_PASS=300s, HOOK=660s — both above the measured pass, so solo behavior is unchanged.
const PER_PASS_BUDGET = scaledBudget(300_000, 4);
const HOOK_BUDGET = 2 * PER_PASS_BUDGET + scaledBudget(60_000, 4);

const ROOT = join(import.meta.dirname, "..", "..");
// Both patterns are ANCHORED to the renderers' EXACT line shapes (`  ✓ <name>` / `  ✗ <name> (<n>)` / `  ⚠ <name>`,
// tooling/src/verify/lib/render.ts) — two-space indent, whole line. An unanchored `✓\s+(\w+)` scraped ANY ✓ on
// the child's stdout, and `pnpm exec` interleaves its own: after a deps-state invalidation (a sibling
// worktree install, a lockfile mtime bump) pnpm 11 runs an implicit install and prints
// `✓ Lockfile passes supply-chain policies (…)` ONCE, on the next `pnpm` invocation in that tree. If
// that one landed on the clean run, `Lockfile` entered `registry` as a phantom gate that nothing can
// ever fire → a one-shot "unfired: [Lockfile]" red that passed on immediate re-run. Anchoring makes the
// scrape total w.r.t. any ambient child chatter; if renderPass's format ever drifts the registry goes
// empty and the `registry.size > 8` test below fails LOUD rather than silently.
//
// The `  ·  scanned N/M files…` SCAN-HEALTH suffix (2026-08-13) rides every LEGACY gate line, and since the
// mixed runtime (#1584) every FINAL policy line carries `  ·  final <authority>/<severity> · population N source
// · M resource…` instead — the same denominator claim in the final vocabulary — so each pattern ends in ONE
// optional suffix group that admits either shape rather than a bare `$`: still anchored (the whole line is
// described), still total against ambient `pnpm` chatter. A third shape joined with scan health: `  ⚠ <name>`
// for a gate whose run is NOT A VERDICT — a legacy gate that scanned ZERO files, or a final policy whose owner
// failed or was WITHHELD by authority. It is scraped into the registry (the gate did run) AND asserted absent
// by its own test below — without the scrape, such a gate would silently drop out of `registry` and surface as
// a baffling "unregistered gate file" red instead of the thing it is. (This pin used to spell that glyph `!`;
// the renderer has printed `⚠` since the tooling move (68c8f42d6), so the arm matched nothing and `blind` was
// an unfailable empty set — repaired with the mixed-roster re-derivation, 2026-09-11.)
const SCAN_SUFFIX = String.raw` {2}·  scanned \d+/\d+ files.*`;
const FINAL_SUFFIX = String.raw` {2}·  final (?:hard|ordinary|reviewed-grant)/(?:error|warning) · population \d+ source · \d+ resource.*`;
const LINE_SUFFIX = `(?:${SCAN_SUFFIX}|${FINAL_SUFFIX})`;
// A final ✓ line may carry `(N warning(s))` between the name and its suffix — warning-severity findings never block.
const OK_RE = new RegExp(String.raw`^ {2}✓ (?<gate>[a-z0-9-]+)(?: \(\d+ warning\(s\)\))?(?:${LINE_SUFFIX})?$`, "gmu");
const FIRED_RE = new RegExp(String.raw`^ {2}✗ (?<gate>[a-z0-9-]+) \(\d+\)(?:${LINE_SUFFIX})?$`, "gmu");
const BLIND_RE = new RegExp(`^ {2}⚠ (?<gate>[a-z0-9-]+)(?:${LINE_SUFFIX})?$`, "gmu");
const TS_EXT_RE = /\.ts$/u;
const GATE_DIR = join(ROOT, "tooling", "src", "verify", "gates");
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
  execFileSync("find", ["packages", "tests", "scripts", "tooling", "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"], {
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
  // The child uses the supported `pnpm check:structure` workspace entry, preserving its configured heap and
  // dependency contract. `runPnpmWithBudget` returns the report on
  // a normal finish AND on report.ts's exit-1-when-a-gate-fires (both are stdout), and THROWS a legible
  // ORB-LOAD-KILL only when the child is killed by its load-scaled `timeout` — so a load kill self-identifies
  // as exit-2/not-a-verdict instead of surfacing as an opaque hook timeout that reads like a real red (#606).
  return runPnpmWithBudget(
    ["check:structure"],
    {
      cwd: ROOT,
      // THIS suite's child runs must SEE the __g_ fixtures it plants — the real-tree entrypoints strip
      // probe-artifact findings by default (a concurrent battery's transient fixtures must not red an
      // independent structure run; tooling/src/verify/lib/pass.ts stripProbeFindings). The env opts this run out.
      // biome-ignore lint/style/noProcessEnv: passthrough env for the child run — harness plumbing, not app config.
      // biome-ignore lint/correctness/noProcessGlobal: same passthrough — this test file is node-run tooling.
      // biome-ignore lint/style/useNamingConvention: ORB_GATE_FIXTURES is an environment variable name.
      env: { ...process.env, ORB_GATE_FIXTURES: "1" },
      // The fixture-run report (every gate firing on its __g_ fixture) exceeds execFileSync's 1MB default
      // buffer — a truncated tail would silently drop the last-sorted gates from `fired` (a false anti-drift
      // failure). 64MB headroom keeps the whole report captured as the gate/fixture set grows.
      maxBuffer: 64 * 1024 * 1024,
    },
    PER_PASS_BUDGET,
    "check:structure pass (check-gates.int beforeAll)",
  );
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
  // RETIRED SUBJECT (#2061/#2062): `test-presence` is a `defineGate` policy now, so `loadGates` no longer returns it and
  // this fixture proves nothing here — its arms run on the static bar through `structure:policy-conformance`.
  // The FILE is left planted rather than deleted because this suite is orchestrator-only and not
  // concurrency-safe, so the lane could not run it to prove no OTHER gate reads the same path; deleting it is
  // the orchestrator's, on the train that next runs this suite.
  fx(`${D}/__g_pres/verbs/act.ts`, "export function createAct(): number {\n  return 1;\n}\n");
  // RETIRED SUBJECT (#2061/#2062): `test-presence` is a `defineGate` policy now, so `loadGates` no longer returns it and
  // this fixture proves nothing here — its arms run on the static bar through `structure:policy-conformance`.
  // The FILE is left planted rather than deleted because this suite is orchestrator-only and not
  // concurrency-safe, so the lane could not run it to prove no OTHER gate reads the same path; deleting it is
  // the orchestrator's, on the train that next runs this suite.
  // (contracts index.ts hole, fixed 2026-07-10): a contracts domain whose zod schemas
  // co-locate in index.ts (the convention — NOT a re-export barrel) with no .contract.test.ts mirror. The
  // OLD gate blanket-skipped every index.ts, silently exempting whole contract domains (imagery shipped
  // with zero tests). This fixture pins that a schema-bearing contracts index.ts is now presence-gated.
  fx("packages/contracts/src/__g_prescontract/index.ts", 'import { z } from "zod";\nexport const gSchema = z.object({ n: z.number() });\n');
  // RETIRED SUBJECT (#2061/#2062): `test-presence` is a `defineGate` policy now, so `loadGates` no longer returns it and
  // this fixture proves nothing here — its arms run on the static bar through `structure:policy-conformance`.
  // The FILE is left planted rather than deleted because this suite is orchestrator-only and not
  // concurrency-safe, so the lane could not run it to prove no OTHER gate reads the same path; deleting it is
  // the orchestrator's, on the train that next runs this suite.
  // (workloads runners/ arm, added 2026-07-10): a runner with REAL logic (touches ctx.env,
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
  // over-exempting) is driven on the real tree by tests/tooling/gate-ignore-grammar.repo.int.test.ts.
  fx("packages/server/src/__g_ignoreinv.ts", "// @orb-gate-ignore g-no-such-gate: fixture — names a gate that does not exist\nexport const x = 1;\n");
  // no-inline-union-redecl: fixture RETIRED with its #1584 conversion — both arms now run on the static
  // bar through `structure:policy-conformance`, and a fixture for a converted gate reports UNFIRED here
  // forever because `loadGates` returns the legacy list alone.
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
  // enforcement-registry-parity: NO fixture — the contract-form gate reconciles the DISCOVERED DESCRIPTOR
  // SET vs the doc; the old "gate file missing from the registry" arm is STRUCTURALLY RETIRED (the loader's
  // fail-closed assertDescriptor makes an unwired/invalid gate file a load-time RED, §7). A `__g_` fixture
  // can't cleanly trigger the doc-reconciliation arm (it would need a valid mustFlag/mustPass descriptor
  // whose name is absent from the real doc — a heavy live-doc edit), so this gate is exempted from the
  // anti-drift assertion below; its bite is proven by gate-conformance (its mustFlag).
  // RETIRED SUBJECT (#2061/#2062): `test-layout` is a `defineGate` policy now, so `loadGates` no longer returns it and
  // this fixture proves nothing here — its arms run on the static bar through `structure:policy-conformance`.
  // The FILE is left planted rather than deleted because this suite is orchestrator-only and not
  // concurrency-safe, so the lane could not run it to prove no OTHER gate reads the same path; deleting it is
  // the orchestrator's, on the train that next runs this suite.
  fx("tests/server/__g_nomirror.test.ts", "export {};\n");
  // test-world-browser-contracts: a Node-intent type test consumes the real browser-authored InputProps
  // contract through its public primitive barrel. React's empty Node-world DOM declarations must not make
  // this compile-only mismatch read as a valid Node test.
  fx(
    "tests/ui/primitives/input/__g_browser-contract.test-d.ts",
    'import type { InputProps } from "../../../../packages/ui/src/primitives/input/index.ts";\nexport type Subject = InputProps;\n',
  );
  // ── @orb/tooling (docs/architecture/core/Core-Tooling-Law.md §4) ──
  // tooling-front-door: a cross-tool deep import into a sibling's ops/ (the front-door law).
  fx("tooling/src/__g_tb/ops/y.ts", "export const y = 1;\n");
  fx("tooling/src/__g_ta/x.ts", `import "../__g_tb/ops/y.ts";\n`);
  // tooling-size: one line over the 450 default cap.
  fx("tooling/src/__g_big/ops/big.ts", "export const x = 1;\n".repeat(451));
  // tooling-argv-front-door: a LIBRARY module reading the GLOBAL argv — legal only in a cli.ts or a
  // censused bash-fronted entry (#971). The fixture is under lib/ so it does not also trip the
  // ops-direct-invocation arm below.
  fx("tooling/src/__g_argv/lib/reader.ts", 'import process from "node:process";\nexport const flag = process.argv.slice(2)[0];\n');
  // tooling-ops-direct-invocation: an ops/ LIBRARY module that would exit 0 if it were RUN — no module-scope
  // refusal and no module-scope entry runner (#509's lying-instrument shape). The guard spelling is written
  // into a STRING here on purpose: the fixture proves the check is AST-positional, since a text search would
  // call this module armed.
  fx("tooling/src/__g_opsguard/ops/x.ts", 'export const SCAFFOLD = `refuseDirectInvocation(import.meta.url, "pnpm x");`;\n');
  // evaluate-no-scope-capture: fixture RETIRED with its #1584 conversion — the policy's own `mustFlag`
  // rows carry all three arms and run on the static bar through `structure:policy-conformance`, and a
  // fixture for a converted gate reports UNFIRED here forever because `loadGates` returns the legacy
  // list alone.
  // tooling-instrument-proof · design-audit-rule-proof · agent-bridge-lock: the three §12.6 single-policy
  // fixtures RETIRED with their #1584 conversions, for the reason stated above `evaluate-no-scope-capture`
  // — `loadGates` returns the legacy descriptor list ALONE, so a fixture for a converted gate reports
  // UNFIRED here forever. Every arm each fixture carried is now a declared `mustFlag` row running on the
  // static bar through `structure:policy-conformance`, and the conversion differential replaying the
  // legacy examples through both engines is `verify/gates/mixed-hook-singletons-conversion.test.ts`.
  // test-determinism: ambient clock in a test (tooling/ is scanned; only support/+e2e/ are exempt).
  // The banned call is assembled so the literal isn't present in THIS file's source (which the gate
  // also scans) — only the written fixture resolves to the ambient-clock call.
  fx("tests/tooling/__g_det.test.ts", `export const t = ${["Date", "now"].join(".")}();\n`);
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
  // wire-schema-vocab-one-home: a second JSON-Schema keyword table outside the one scrub engine. Two
  // DISTINCT keywords clears the fence (one alone is ordinary English).
  fx("packages/server/src/__g_wirevocab.ts", 'export const drop = new Set(["minLength", "maxLength"]);\n');
  // external-id-single-writer: a `users.externalId` column write (updateUser({ externalId })) outside the two
  // sanctioned sessions verbs (provision-identity.ts + link-external-id.ts) — the U1 second-linking-site hole.
  fx(
    `${D}/__g_extidwrite/persistence/x.ts`,
    "declare function updateUser(db: unknown, id: string, patch: unknown): Promise<void>;\nexport async function link(db: unknown, id: string, externalId: string): Promise<void> {\n  await updateUser(db, id, { externalId, updatedAt: 0 });\n}\n",
  );
  // assumes-single-replica: a module-scope mutable cache in a file with no ASSUMES(single-replica).
  fx("packages/server/src/domain/__g_replica.ts", "export const cache = new Map<string, number>();\n");
  // no-caller-user-id: the D19-forbidden `callerUserId` identifier (in the fixture's source, not here).
  fx("packages/server/src/__g_caller.ts", "export const callerUserId = 1;\n");
  // test-factory-contract: makeX taking db, seedX without db.
  fx("tests/support/factories/__g_factory.ts", "export function makeWrong(db: any) {}\nexport function seedWrong(a: any) {}\n");
  // test-no-stubs: a test block with no assertions.
  fx("tests/__g_stub.test.ts", `import { test } from "support/test";\ntest("stub", () => {\n  const x = 1;\n});\n`);
  // audit-client-tests: fixture RETIRED with its #1584 conversion — all five arms are its own `mustFlag`
  // rows now, each with an `expect` naming the arm's own position and message.
  // server-layout: an illegal directory at the root of server/src.
  fx("packages/server/src/__g_rogue_drawer/index.ts", "export const x = 1;\n");
  // package-layout: a loose file at the root of kit/src.
  fx("packages/kit/src/__g_rogue.ts", "export const x = 1;\n");
  // ui-primitive-structure: a primitive dir missing its trio (no <name>.tsx/variants.ts) + no test.
  // ALSO drives ui-exports-map-complete arm A1 — the dir has an index.ts and packages/ui/package.json
  // names no `"./__g_uiprim"` entry, which is exactly the unimportable-module shape. If this fixture ever
  // moves, that gate reports UNFIRED here rather than going quietly dead.
  fx("packages/ui/src/primitives/__g_uiprim/index.ts", "export const x = 1;\n");
  // client-structure: a BUILT feature (has code) with a stray root file + no index.ts front door.
  fx("packages/client/src/features/__g_cfeat/stray.ts", "export const x = 1;\n");
  // stale-draft-commit: a once-seeded draft committed under `draft !== source` — the founding shape,
  // verbatim from the pre-8e9158e14 tracker-value.tsx (#1585). The guarded branch hands the DRAFT to a
  // non-setter call, which is the half that separates it from the reseed idiom.
  fx(
    "packages/client/src/features/__g_stalecommit/lib/cell.tsx",
    "import { useState } from 'react';\n" +
      "export function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n" +
      "  const [draft, setDraft] = useState(source);\n" +
      "  const commit = () => {\n" +
      "    if (draft !== source) {\n" +
      "      onEdit(draft);\n" +
      "    }\n" +
      "  };\n" +
      "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n" +
      "}\n",
  );
  // seed-theme-ink-contrast: NO fixture. It CONVERTED 2026-09-13 (#2182) into a final `reviewed-grant`
  // policy on `product-css` + the `@client`/`@ui` class walk, so the mixed roster partitions it out and a
  // `__g_` carrier planted for it would be a working-tree fixture no legacy owner reads. The shape this
  // fixture planted — a SURFACE token painted as TEXT, `--color-card` as ink on the `--color-card` ground at
  // 1.00:1 by construction — is `mustFlag[2]`'s subject in the module's own rows, and the nine
  // decorative-stroke exemptions that used to live in its `ExemptionTable` are now reviewed grants whose
  // consumption is held two-sided in tests/tooling/verify/gates/seed-theme-ink-family.test.ts.
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
  // config-group-completeness: a `ConfigGroupDefinition`-typed var in a file that is NOT a `*-group.tsx`
  // def file — the co-location arm (the settings-pane gate re-keyed by the config revamp, #866 S1; its
  // folded-in collection arms and the anchor-outside-registry arm are proven by conformance).
  fx("packages/client/src/features/__g_ggroup/lib/stray.ts", "export const strayGroup: ConfigGroupDefinition = { id: 'x' };\n");
  // no-parallel-section-map: a ConfigGroupId-keyed object literal outside the sanctioned homes.
  fx("packages/client/src/features/__g_g2config/lib/parallel.ts", "export const M = { personas: 1, appearance: 1, admin: 1 };\n");
  // context-definition-shape: a hand-rolled `{kind:"tabs",useResolved}` object literal outside
  // lib/registry-contracts.ts — a badge-wearing tabs renderer bypassing the mint (arm 1). Converted to a
  // final `defineGate` occurrence policy (gate-runtime-standardization.md, #1584) — same per-file AST
  // bite, still driven by this real-tree fixture, only the reported POSITION moved (`useResolved`, an
  // authored token a waiver can bind to; the legacy arms carried no token at all). Its new
  // entire-population `context-definition-shape-health` sibling holds the two single-writer COUNT arms
  // and is proven separately by its own conformance rows
  // (tests/tooling/verify/gates/ordinary-client-and-ct-wave.test.ts).
  fx("packages/client/src/features/__g_g3ctx/lib/g3-badge.ts", 'export const gBadgeCtx = { kind: "tabs", useResolved: () => null };\n');
  // state-files: a flat state/ file exporting the minted store handle (rule 3 — no exported handle).
  // Converted to a final `defineGate` occurrence policy (#1584) — same per-file AST bite, still driven by
  // this real-tree fixture; the finding now anchors on the exported DECLARATION NAME (`useGStore`) rather
  // than a synthetic `exported-handle` token, and a file leaking two handles reports twice instead of once.
  fx("packages/client/src/state/__g_state.ts", 'export const useGStore = createGatedStore("g", () => ({ n: 0 }));\n');
  // duplicate-action-doors: one tRPC mutation wired from TWO components on one plane, with no baseline
  // budget for the pair — the second door is a NEW door (#252).
  fx("packages/client/src/features/__g_doors/components/__g_a.tsx", "export const A = () => trpc.chat.forkChat.mutationOptions();\n");
  fx("packages/client/src/features/__g_doors/components/__g_b.tsx", "export const B = () => trpc.chat.forkChat.mutationOptions();\n");
  // class-token-splice: a `${…}` spliced INSIDE a class token — the composed class never appears as a
  // whole literal, so Tailwind registers no rule and it paints nothing (#249).
  fx("packages/client/src/features/__g_splice/components/__g_c.tsx", 'const gSide = "end";\nexport const C = () => <div className={`inset-${gSide}-0`} />;\n');
  // component-size: a client source over the 450-line cap (in lib/, not a feature, so it trips
  // component-size alone). 451 padded lines.
  fx("packages/client/src/lib/__g_oversize.ts", "// pad line\n".repeat(451));
  // component-size-ui: the @orb/ui twin (activated 2026-07-17) — a ui source over the 450-line cap,
  // in its own __g_ dir at the src root (the __g_motion/__g_defprops placement precedent).
  fx("packages/ui/src/__g_oversize/__g_oversize.ts", "// pad line\n".repeat(451));
  // no-off-token-radius-shadow: a default-scale shadow utility in a real className site, off-token,
  // not in ALLOWLIST.
  fx("packages/client/src/features/__g_offtoken/components/__g_offtoken.tsx", 'export const G = <div className="rounded-lg shadow-md" />;\n');
  // no-hover-display-swap: a hover-keyed DISPLAY utility (the P0 hit-test oscillator), not in ALLOWLIST.
  fx("packages/client/src/features/__g_hoverswap/components/__g_hoverswap.tsx", 'export const G = <div className="group-hover/row:hidden" />;\n');
  // no-tailwind-dark-variant: polarity is derived by ThemeScope; a named-theme class variant is a second axis.
  fx("packages/client/src/features/__g_darkvariant/components/__g_darkvariant.tsx", 'export const G = <div className="dark:bg-card" />;\n');
  // integer-line-boxes: Tailwind's unitless core leading (1.25 × a fractional voice size = a fractional box).
  fx("packages/client/src/features/__g_lineboxes/components/__g_lineboxes.tsx", 'export const G = <div className="text-micro leading-tight" />;\n');
  // rest-transform-grid: a REST-state scale (no state variant) — a permanent sub-pixel resample of the subtree.
  fx("packages/client/src/features/__g_resttransform/components/__g_resttransform.tsx", 'export const G = <div className="scale-95" />;\n');
  // css-var-defined: an exact arbitrary-variable carrier names no generated, authored, or runtime property.
  fx("packages/client/src/features/__g_cssvar/components/__g_cssvar.tsx", 'export const G = <div className="z-(--definitely-undefined)" />;\n');
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
  // zustand-selector-derived: a store-hook selector returning a fresh object literal, unwrapped.
  fx(
    "packages/client/src/state/__g_zustand.ts",
    "declare const useGStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\nexport const v = useGStore((s) => ({ a: s.a, b: s.b }));\n",
  );
  // `chat-viewer-plane-canon-reads`'s `__g_vpcr` plant was removed 2026-09-13 with that gate's conversion
  // into the final `chat-viewer-plane` family (occurrence + `-health` siblings). A final policy does not
  // join the `writeFixtures()`/`UNFIXTURABLE_GATES` ritual (GATE-AUTHORING §2); its catch is proved by
  // declared rows and `tests/tooling/verify/gates/chat-viewer-plane-family.test.ts`. The fixture had one
  // incidental second reader — `no-loose-id-cast.ts`'s paren-anchor row — which carries those bytes inline.
  // firehose-import-allowlist: the unclamped all-chats firehose imported outside entry/compose (D79).
  fx("packages/server/src/transport/trpc/__g_firehose.ts", 'import { subscribeAllChatEvents } from "./index";\nexport const f = subscribeAllChatEvents;\n');
  // assets-single-writer arm 1: storeBlob imported outside domain/assets (the CAS write chokepoint).
  fx(`${D}/hub/__g_asw1.ts`, 'import { storeBlob } from "../assets/persistence/queries.ts";\nexport const s = storeBlob;\n');
  // assets-single-writer arm 2: a raw insert(assets) outside domain/assets.
  fx(`${D}/hub/__g_asw2.ts`, 'import { assets } from "@orb/db";\nexport const w = (db: { insert: (t: unknown) => void }) => db.insert(assets);\n');
  // own-tables-only: a VERB importing another domain's table off the @orb/db barrel. `__g_own` owns no
  // schema file, so `characters` (character's) is foreign, and the path is outside `persistence/` — the one
  // slot the gate scopes out. (The `__g_asw2` fixture above trips it too, incidentally; this row is the
  // deliberate one, so a change to that fixture can never silently un-fire this gate.)
  fx(`${D}/__g_own/verbs/x.ts`, 'import { characters } from "@orb/db";\nexport const x = characters;\n');
  // serde-core-seal: the PNG card-chunk engine imported outside the import/export serde homes. Converted
  // to a final `defineGate` occurrence policy (gate-runtime-standardization.md, #1584) — same per-file
  // AST bite, still driven by this real-tree fixture; its new entire-population `serde-core-seal-health`
  // stale-ratchet sibling is proven separately by its own conformance rows
  // (tests/tooling/verify/gates/contract-shape-wave-1.test.ts).
  fx(`${D}/hub/__g_serde.ts`, 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n');
  // query-freshness-coverage: a consumed query key with no invalidation row and no registry cite — the
  // frozen-surface class (the read is keyed on a ghost router so it can never collide with a real proc).
  fx("packages/client/src/features/__g_qfresh/components/__g_qfresh.tsx", "export const g = trpc.__g_ghost.frozenRead.queryOptions({});\n");
  // dangling-doc-cite: a source COMMENT naming a doc that does not exist. The path must be a `__g_` name so
  // it can never collide with a real doc, and the cite must sit in a COMMENT — the same string in a literal
  // is deliberately out of scope (that is what keeps every fixture map on the tree from self-flagging).
  fx("packages/kit/src/__g_doccite.ts", "// See docs/design/__g_ghost-nowhere.md for the shape.\nexport const g = 1;\n");
  // dangling-refs arm 1: a gates-dir stub whose `gate` object cites a ghost doc. NOT exported — the loader
  // skips it as un-ported (the __g_diaglegi precedent); the arm-1 scanner reads the local `gate` variable.
  fx("tooling/src/verify/gates/__g_dangl.ts", 'const gate = { docRow: "__g_ghost-nowhere.md" };\nexport const stub = gate;\n');
  // suppressions: INERT since 2026-09-12 (#2063). This planted the exceed arm of a per-file count ratchet
  // that no longer exists — `suppressions` is now a FINAL reviewed-grant policy, partitioned out of the
  // legacy anti-drift arm below, and `lint/suspicious/noExplicitAny` is a ruled class in `source` scope, so
  // this marker is licensed rather than flagged. Left in place deliberately: deleting a `__g_` fixture is a
  // coupled-site edit in a suite the converting lane could not run (it is not concurrency-safe with itself
  // and belongs to the merge train), so it is reported as owed rather than removed blind.
  fx(`${D}/hub/__g_suppr.ts`, "// biome-ignore lint/suspicious/noExplicitAny: fixture probe\nexport const g = 1;\n");
  // A pseudo-skip fixture: metadata claims "skipped" but an early return records a passed test. Its
  // original consumer (`monotonic-tests` tooth 1) was retired with the gate (#2217); the fixture stays
  // because the planted-corpus shape is shared, and a fixture no live gate reads is inert, not wrong.
  fx(
    "tests/tooling/__g_pseudoskip.test.ts",
    'import { test } from "support/test";\ntest("g", () => {\n  test.info().annotations.push({ type: "skipped" });\n  return;\n});\n',
  );
  // bus-producer-coverage: NO fixture. The five per-union coverage modules (`bus-coverage`,
  // `rpg-bus-coverage`, `automation-bus-coverage`, `domain-events-coverage`, `user-bus-coverage`) collapsed
  // into this ONE final `defineGate` policy on the shared bus producer fact (#1584), quantified over every
  // belted union; their DEFERRED maps are gone. MISSING needs an un-emitted REAL union member, which a
  // throwaway `__g_` file cannot add to a single-home `*_EVENT_TYPES` belt. As a FINAL policy it is partitioned
  // out of the anti-drift arm below (not an UNFIXTURABLE row): its bite is `structure:policy-conformance` running
  // its own rows through the production dispatcher, plus `user-bus-deferred-member`.
  // domain-freshness-plane: a mutating domain with no DOMAIN_FRESHNESS row — the refinery arm, which is the
  // state the tree was actually in before 2026-08-14.
  fx(
    `${D}/__g_fresh/verbs/write-thing.ts`,
    'import { chats } from "@orb/db";\nexport async function writeThing(ctx: { db: { update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } } } }): Promise<void> {\n  await ctx.db.update(chats).set({ title: "g" }).where(1);\n}\n',
  );
  // domain-freshness-plane, SECOND arm (room reach): a chat-anchored junction that seats a `settings` row in
  // a room. `settings` answers `roomReach: none`, so the schema now contradicts the row → SEATED-red. This
  // fixture is a REAL-TREE one on purpose: the seating derivation reads `packages/db/src/schema/*.ts`, which
  // no conformance mini-project can populate without also arming the whole-roster ORPHAN sweep.
  fx(
    "packages/db/src/schema/__g_seat.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { chats } from "./chat.ts";\nimport { userSettings } from "./settings.ts";\n\nexport const chatSeatProbe = sqliteTable("chat_seat_probe", {\n  chatId: text("chat_id").references(() => chats.id),\n  settingId: text("setting_id").references(() => userSettings.id),\n});\n',
  );
  // json-column-write-parity: a WHOLE-RECORD replace of `chats.metadata` (a JSON column whose seven live
  // writers all merge key-wise off a loaded row) — the straddle, from the side the gate reports.
  fx(
    `${D}/chat/__g_jsonstraddle.ts`,
    'import { chats } from "@orb/db";\nexport async function clobber(ctx: { db: { update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } } } }, patch: { metadata: unknown }): Promise<void> {\n  await ctx.db.update(chats).set({ metadata: patch.metadata }).where(1);\n}\n',
  );
  // open-json-column-key-parity: the caption_meta class, planted whole — an OPEN json column whose writer
  // stores `{ model }` while a reader json_extracts `$.artStyle` off it. TWO files by necessity: the column
  // set is DERIVED from packages/db/src/schema/**, which no mini-project can populate, and the verdict is a
  // comparison across writer and reader.
  fx(
    "packages/db/src/schema/__g_openjson.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n\nexport const gOpenProbe = sqliteTable("g_open_probe", {\n  id: text("id").primaryKey(),\n  probeMeta: text("probe_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
  );
  fx(
    `${D}/discovery/__g_openjsonread.ts`,
    'import { gOpenProbe } from "@orb/db";\nimport { sql } from "drizzle-orm";\nexport async function write(ctx: { db: { insert: (t: unknown) => { values: (v: unknown) => Promise<void> } } }, model: string): Promise<void> {\n  await ctx.db.insert(gOpenProbe).values({ probeMeta: { model } });\n}\nexport const read = sql`SELECT id FROM g_open_probe p WHERE json_extract(p.probe_meta, \'$.artStyle\') IS NOT NULL`;\n',
  );
  // scroll-container-positioned: a vertical scroller class string with no positioning class. Written as a
  // bare const (not JSX) on purpose — it also exercises the UNFENCED arm the gate is built around.
  fx("packages/client/src/features/__g_scroller/lib/__g_scroller.ts", 'export const paneClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain";\n');
  // windowed-infinite-query: `maxPages` with no recoverable rewind — the 2026-08-13 dogfood P1 shape.
  fx(
    "packages/client/src/features/__g_window/lib/__g_window.ts",
    "export const q = (trpc: { character: { list: { infiniteQueryOptions: (i: unknown, o: unknown) => unknown } } }): unknown =>\n  trpc.character.list.infiniteQueryOptions({ limit: 30 }, { maxPages: 5, getPreviousPageParam: () => undefined });\n",
  );
  // member-card-clamped: a re-spelled MemberCardView declaration outside contracts (D22/PD-111).
  fx(`${D}/character/__g_mcv.ts`, "export interface MemberCardView {\n  readonly name: string;\n}\n");
  // diagnostic-legibility: fixture RETIRED with its #1584 conversion — its own `mustFlag` rows carry both
  // descriptor halves of the mixed corpus and run on the static bar. The `finding-overload-provenance`
  // fixture below no longer needs to carry a pointer for this gate's sake, but keeps one anyway: the note
  // documents an authoring convention, not a live coupling.
  // finding-overload-provenance: a NEW gate-corpus module building a node-anchored `Finding` literal (a
  // derived column) with no marker — the authoring-time red this gate exists for (born-compliant since
  // its ratchet baseline reached `{}` and was deleted, GATE-AUTHORING.md §4.8: nothing absolves it any
  // more). Like the diagnostic-legibility fixture above it lives in the gate corpus (that is this gate's
  // scanRoot) and exports no `gate`, so the loader skips it. It carries a pointer in its message so it
  // does not ALSO trip diagnostic-legibility.
  fx(
    "tooling/src/verify/gates/__g_findprov.ts",
    'export function gFindProv(node: N, ctx: C): void {\n  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 7, message: "see tooling/src/verify/gates/GATE-AUTHORING.md" });\n}\n',
  );
  // RETIRED SUBJECT (#2061/#2062): `test-presence-client` is a `defineGate` policy now, so `loadGates` no longer returns it and
  // this fixture proves nothing here — its arms run on the static bar through `structure:policy-conformance`.
  // The FILE is left planted rather than deleted because this suite is orchestrator-only and not
  // concurrency-safe, so the lane could not run it to prove no OTHER gate reads the same path; deleting it is
  // the orchestrator's, on the train that next runs this suite.
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
  // bus-on-data-no-store-write: a raw .setState() inside a subscription onData body in data/bus/.
  fx(
    "packages/client/src/data/bus/__g_buswrite.ts",
    "declare const store: { setState: (s: unknown) => void };\nexport const sub = {\n  onData: (): void => {\n    store.setState({ x: 1 });\n  },\n};\n",
  );
  // no-form-reset-in-autosave: a file importing createAutosaveEntityForm that calls .reset() on a form.
  // Converted to a final `defineGate` occurrence policy (#1584) — same per-file AST bite, still driven by
  // this real-tree fixture; the position moved from the unwaivable synthetic token `reset()` (its
  // parentheses make every `@orb-waive` marker parse as MALFORMED) to the member NAME `reset`. The third
  // legacy arm — the `Omit<…, "reset">` type-strip presence check on forms/editor/autosave-contract.ts —
  // is now the hard, entire-population `no-form-reset-in-autosave-health` sibling, proven by its own
  // conformance rows (tests/tooling/verify/gates/ordinary-client-and-ct-wave.test.ts).
  fx(
    "packages/client/src/features/__g_autoreset/hooks/__g_autoreset.ts",
    'import { createAutosaveEntityForm } from "#forms/editor";\nexport const useGThing = createAutosaveEntityForm<{ a: string }>({ defaultValues: { a: "" } });\nexport function gBad(form: { reset: () => void }): void {\n  form.reset();\n}\n',
  );
  // persist-partialize-and-total-migrate: a bare zustand persist() outside the two minting factories.
  fx(
    "packages/client/src/features/__g_persist/lib/__g_persist.ts",
    'declare function persist(init: unknown, opts: unknown): unknown;\nexport const gStore = persist(() => ({}), { name: "x" });\n',
  );
  // form-factory-for-multifield: a feature component hand-rolling ≥3 controlled form inputs (value/checked
  // + an onChange-family handler) while importing NEITHER editor factory — the ≥3-field form that dodges
  // Form entirely (D54 §13.4). Converted to a final `defineGate` occurrence policy (#1584) — same
  // per-component AST bite and the same #620 exclusive-arm count, still driven by this real-tree fixture;
  // the position moved from the unwaivable `GMultiField (3 fields)` (parentheses make every marker parse
  // as MALFORMED) to the first controlled field's TAG NAME, with the component name and count in the
  // message.
  fx(
    "packages/client/src/features/__g_multifield/components/__g_multifield.tsx",
    "export function GMultiField() {\n  return (\n    <div>\n      <Input value={a} onChange={set} />\n      <Select value={b} onValueChange={set} />\n      <Switch checked={c} onCheckedChange={set} />\n    </div>\n  );\n}\n",
  );
  // ── ledger-gate wave (activated 2026-07-09) — fixtures for the newly-live gates ──
  // lifecycle-portability: an OWNER-STAMPED canon table that no portable kind carries and no
  // NON_PORTABLE_CANON row classifies — the F1 shape (databank sat exactly here while every full-account
  // backup silently dropped it). Its own fixture on purpose: an ownerId-bearing fixture answers two
  // different questions, and a shared one hides whichever gate dies first — which is exactly what
  // happened to the reference this comment used to name (`__g_ownerid`, retired with ownerid-registry's
  // conversion to a final policy the legacy loader cannot run).
  fx(
    "packages/db/src/schema/__g_lifecycle.ts",
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const gLifecycle = sqliteTable("__g_lifecycle", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
  );
  // table-scoping-class: a schema table with NO row in TABLE_SCOPING_ROWS (lib/tenancy-scope.ts) — unclassified at birth.
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
  // public-route-body-cap: a mutating non-tRPC route that parses the body with no cap middleware.
  fx("packages/server/src/entry/http/__g_bodycap.ts", 'app.post("/api/__g", async (c) => c.json(await c.req.json()));\n');
  // injected-op-caller-param: a domain contract op taking a branded entity id and returning a Promise, with
  // no caller/scope param and no CALLER_FREE_OPS row. Converted to a final `defineGate` occurrence policy
  // (gate-runtime-standardization.md, #1584) — same per-file AST bite, still driven by this real-tree
  // fixture; its new entire-population `injected-op-caller-param-health` stale/blindness sibling is proven
  // separately by its own conformance rows (tests/tooling/verify/gates/contract-shape-wave-1.test.ts).
  fx(
    "packages/server/src/domain/__g_opcaller/contract/__g_opcaller.ts",
    'import type { CharacterId } from "@orb/kit/ids";\nexport type GRenameCardOp = (characterId: CharacterId, name: string) => Promise<void>;\n',
  );
  // brand-in-name-position: a signature taking `chatId: string` while `ChatId` is minted in @orb/kit/ids.
  // Post-terminal-state (the baseline was burned to {} and deleted, 2026-08-03) every finding reports
  // directly — this planted signature is the gate's standing live-tree bite proof.
  fx("packages/server/src/domain/__g_brandpos/verbs/__g_brandpos.ts", "export function gPost(chatId: string): void {\n  void chatId;\n}\n");
  // detached-work-traced: fixture RETIRED with its #1584 conversion, which also SPLIT the blindness arm
  // into `detached-work-traced-health`. Both halves carry their own rows; the health arm's real-tree anchor
  // probe is replaced by `execution: "entire-population"`.
  // caught-failure-ownership: a reasonless empty catch is syntactically handled and names no runtime owner.
  fx("packages/server/src/domain/__g_caught/__g_caught.ts", "export function gCaught(): void {\n  try { risky(); } catch {}\n}\n");
  // infra-auth-no-userid: a `userId` identifier under infra/auth/** (D40 — infra never yields a userId).
  fx("packages/server/src/infra/auth/__g_userid.ts", "export function gAuth(userId: string): string {\n  return userId;\n}\n");
  // contract-verb-presence: a __g_ domain whose contract/service.ts declares a verb on a *Service interface
  // with NO test in tests/server/domain/__g_verbpres/ (the domain tree is empty → the verb is uncovered).
  fx("packages/server/src/domain/__g_verbpres/contract/service.ts", "export interface GVerbPresService {\n  readonly gUntested: () => Promise<void>;\n}\n");
  // no-vanity-alias: a workspace rename-import whose original name isn't otherwise present in the module
  // (rule a — the cosmetic-alias case; @orb/ui + db-`*Table`/contracts-`*Wire` + genuine collisions are exempt).
  fx(`${D}/__g_vanity/x.ts`, 'import { Foo as Bar } from "@orb/kit/x";\nexport const g = Bar;\n');
  // warning-code-coverage: NOT fixtured here — it is a whole-corpus emit-coverage RATCHET (a tuple member
  // with no emit site across the real home + emit scope). An injected `__g_` file can neither match its
  // fixed tuple-home path nor REMOVE a real emit, so it cannot be driven from an isolated fixture. It is a
  // FINAL policy now, partitioned out of the anti-drift arm below; its bite is `structure:policy-conformance`.
  // sanctioned-css-homes: NO fixture. It CONVERTED 2026-09-13 (#2183) into a final `defineGate` policy on
  // `authored-tree:packages` under the `css-home-topology` family, so the mixed roster partitions it out and
  // a `__g_` stylesheet planted for it would be a working-tree fixture no legacy owner reads. Its bite is
  // `structure:policy-conformance` running its own three arms — five `mustFlag` rows covering both
  // false-negative directions the two fixtures here used to plant (a feature-local stylesheet and an extra
  // stylesheet beside an approved UI home), a `mustRefuse` row for the absent tree, and the receipt pair in
  // tests/tooling/verify/gates/css-home-topology-family.test.ts.
  // feature-owns-definition: a features/* dir with only a non-definition file (no lib/*-{section,modal,
  // group,chrome}.tsx) — the O2 empty-dir rule (client-architecture-lockdown.md §3/§18 O2). Reads via
  // node:fs, not ts-morph, so the real-tree fixture is picked up regardless of tsconfig excludes.
  fx("packages/client/src/features/__g_ownsnodef/lib/helper.ts", "export const g = 1;\n");
  // bus-definition-belts: NO fixture. It is a final `defineGate` policy on the shared bus definition fact
  // (#1584), split into belt/totality/consumer/owner ids whose proofs run in the hermetic conformance
  // runtime (tests/tooling/verify/gates/bus-pair.test.ts); no `__g_` file enters the working tree.
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
  // no-color-literals: an arbitrary hex color in a className.
  fx("packages/client/src/features/__g_colorlit/components/__g_c.tsx", 'export const C = () => <div className="text-[#fff000]" />;\n');
  // no-raw-color-in-css: a raw hex color in a feature CSS file (outside the theme.css token home). Reads via
  // fs.globSync, so the real-tree __g_ fixture is picked up regardless of tsconfig excludes.
  fx("packages/client/src/features/__g_rawcsscolor/__g_rawcsscolor.css", ".g {\n  color: #abcdef;\n}\n");
  // over-art-plate-arm: a translucent glass surface mixed over `transparent` with no [data-has-bg-image]
  // light-dark() plate arm (D144(b)). Also fs.globSync-read. The subject is a __g_ slot name so the fixture
  // can never collide with a real surface's ratchet row.
  fx(
    "packages/client/src/features/__g_plate/__g_plate.css",
    'html[data-blur-panels] [data-slot="__g-plate-probe"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
  );
  // no-decorators: a decorator (non-erasable syntax — no runtime under type-stripping).
  fx(`${D}/__g_decorator/x.ts`, "function dec(): void {}\nexport class A {\n  @dec foo(): number {\n    return 1;\n  }\n}\n");
  // no-default-props: the React-19-deprecated `defaultProps` assignment.
  fx("packages/ui/src/__g_defprops/__g_c.tsx", "const GDef = () => <div />;\nGDef.defaultProps = { id: 1 };\nexport { GDef };\n");
  // no-external-media-without-gate: a raw <img> in a feature (outside MessageMedia).
  fx("packages/client/src/features/__g_extmedia/components/__g_c.tsx", 'export const C = (u: string) => <img src={u} alt="" />;\n');
  // no-fake-disabled-id: the empty-string branded-id fake-disabled sentinel.
  fx("packages/client/src/features/__g_fakeid/hooks/__g_h.ts", 'export const id = castId("");\n');
  // no-form-state-in-useeffect: form.state.values in a useEffect dep array.
  fx(
    "packages/client/src/features/__g_formeffect/components/__g_c.tsx",
    "declare function useEffect(fn: () => void, deps: unknown[]): void;\nexport function C(form: { state: { values: unknown } }): void {\n  useEffect(() => {}, [form.state.values]);\n}\n",
  );
  // ── the baseui-* family (docs/history/design/baseui-crunch.md item 4) ─────────────────────────────────────
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
  // no-layout-context-props: a layout-context boolean prop (compact) on JSX (D42).
  fx("packages/client/src/features/__g_layoutprops/components/__g_c.tsx", "export const G = <EntityCard compact={true} />;\n");
  // no-loose-id-cast: an `as never` type-check launder.
  fx(`${D}/__g_loosecast/x.ts`, "declare const x: unknown;\nexport const a = x as never;\n");
  // no-media-queries-in-features: a viewport breakpoint variant in a feature className.
  fx("packages/client/src/features/__g_mediaq/components/__g_c.tsx", 'export const C = () => <div className="md:flex-row" />;\n');
  // no-mint-via-cast: minting an id by laundering a fresh UUID through castId (assembled).
  fx(`${D}/__g_mintcast/x.ts`, `export const a = castId(crypto.${["random", "UUID"].join("")}());\n`);
  // no-raw-container-widths + css-length-tokens: a raw content-width utility on a container element. The
  // latter consumes #961's class provenance, so this one producer-anchored fixture proves both gates are
  // live without mutating the canonical shell.css home during a whole-tree fixture run.
  fx("packages/client/src/features/__g_containerw/components/__g_c.tsx", 'export const C = () => <div className="w-[600px]" />;\n');
  // no-raw-id: an Id field typed as raw z.string() (no brand).
  fx(`${D}/__g_rawid/x.ts`, 'import { z } from "zod";\nexport const s = z.object({ chatId: z.string() });\n');
  // no-raw-spacing-in-features: a raw spacing utility in a feature className.
  fx("packages/client/src/features/__g_rawspacing/components/__g_c.tsx", 'export const C = () => <div className="p-4" />;\n');
  // no-raw-typography-in-features: a raw typography utility in a feature className.
  fx("packages/client/src/features/__g_rawtypo/components/__g_c.tsx", 'export const C = () => <p className="text-sm" />;\n');
  // session-channel-boundary: a second cross-tab channel outside lib/session-channel.ts (the ONE home).
  fx("packages/client/src/features/__g_bchan/lib/__g_sync.ts", 'export const c = new BroadcastChannel("chat:sync");\n');
  // query-machine-seals: a useMutation import outside data/ (client-architecture-lockdown.md §16 G9).
  fx("packages/client/src/features/__g_qseals/hooks/__g_h.ts", 'import { useMutation } from "@tanstack/react-query";\nexport const m = useMutation;\n');
  // testid-typed-only: a freeform string data-testid (must come from the typed test-id home).
  fx("packages/client/src/features/__g_testid/components/__g_c.tsx", 'export const C = () => <div data-testid="freeform-string" />;\n');
  // settings-section-anchored: an anchor-stamping section file (it calls `configAnchorId`, the content-keyed
  // arm — the path-keyed `*-settings-surface.tsx` arm retired with the #866 S1 skimmer ruling) with a second,
  // UNANCHORED heading-bearing <Section> — the invisible-to-nav/search class the G4 arm seals
  // (derive-modernization-audit.md §W5 item 9).
  fx(
    "packages/client/src/features/__g_settingsanchor/components/__g_settingsanchor-section.tsx",
    'import { configAnchorId } from "#state";\nexport const A = <Section heading="A" id={configAnchorId("admin", "a")} />;\nexport const G = <Section heading="Host Claude"><span>x</span></Section>;\n',
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
  // ct-story-single-import: the same local name bound by TWO import specifiers in one CT file — the
  // literal duplicate-import spelling of the "Identifier already declared" bundler collision.
  fx(
    "tests/ui/primitives/__g_ctdupe/__g_ctdupe.ct.tsx",
    'import { StoryA } from "./_ct-stories.tsx";\nimport { StoryA as StoryA } from "./_ct-stories.tsx";\nStoryA;\n',
  );
  // route-trpc-lifo-order: page.route("**/api/trpc/**", ...) registered BEFORE routeTrpc(page, ...) in
  // the same test body — the LIFO inversion (#643/#629). routeTrpc is a bare imported identifier here
  // (no real support/node/route-trpc.ts import needed — the gate matches on callee NAME, AST-only).
  // Converted to a final `defineGate` occurrence policy (#1584) — same AST bite and the same `page.route`
  // position token, still driven by this real-tree fixture.
  fx(
    "tests/ui/primitives/__g_lifo/__g_lifo.ct.tsx",
    'import { test } from "@playwright/experimental-ct-react";\ndeclare function routeTrpc(page: unknown, routes: unknown): Promise<unknown>;\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n  await routeTrpc(page, {});\n});\n',
  );
  // contract-derives-not-respells (ARM B): a hand-written `*Row` interface in a domain `contract/` whose
  // prefix names a REAL drizzle table (`WorkloadScheduleRow` → the live `workloadSchedules` export in
  // packages/db/src/schema/workloads.ts) instead of deriving `typeof workloadSchedules.$inferSelect`. ARM B is
  // the fixturable one: ARM A needs a name the sibling `packages/contracts/src/<domain>/` also exports, and a
  // `__g_` domain has no contracts sibling (planting one would need a SECOND fixture in contracts/ whose
  // domain name matches — the same shape, twice the surface, for no extra proof).
  // The gate's ALLOWLIST stale arm keys on the REAL-TREE anchor + real files, which this fixture does not
  // touch, so the added finding is the ARM-B bite alone. Converted to a final `defineGate` occurrence
  // policy (gate-runtime-standardization.md, #1584) — same per-file AST bite, still driven by this
  // real-tree fixture; the new entire-population `contract-derives-not-respells-health` staleness sibling
  // is proven separately by its own conformance rows (tests/tooling/verify/gates/contract-shape-wave-1.test.ts).
  fx(`${D}/__g_cdnr/contract/probe-row.ts`, "export interface WorkloadScheduleRow {\n  readonly id: string;\n  readonly enabled: boolean;\n}\n");
  // gate-modernization ARM A: a module in the gate corpus that exports no `gate` descriptor. The loader
  // SKIPS such a file (`mod.gate === undefined ⇒ continue`), so it enforces nothing forever with no signal
  // — the exact hole arm A closes. This is the ONE arm a throwaway file can drive: arm B needs a real
  // one-sided exemption table and arm C needs a real doc whose §-anchor is missing. Both of those are
  // proven by the gate's own conformance mustFlag rows + its three live catches at mint. The fixture
  // leaves the real corpus untouched (the handoff baseline and its reader are both gone — §4.8 terminal).
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
  // freeze-provenance-write-pairing: the founding D129-F defect verbatim — a `message_variants` UPDATE that
  // replaces `content` and leaves `rawContent`/`macroFreezes` attached, so the row keeps a freeze record
  // describing bytes that are gone. The fixture writes a NEW file, so canon-write.ts's real (fixed) writers
  // and the gate's own blindness tripwires keep judging the real tree untouched.
  fx(
    "packages/server/src/domain/chat/persistence/__g_freezeprov.ts",
    'import { messageVariants } from "@orb/db";\nexport const gStmt = db.update(messageVariants).set({ content: "replaced" }).where(eq(messageVariants.id, id));\n',
  );
  fx("tooling/src/verify/gates/__g_nodescriptor.ts", "export const notAGateDescriptor = 1;\n");
  // ct-poll-schedule-and-paint (ARM A): a module-scope interval array handed to `expect.poll` — Playwright's
  // pollAgainstDeadline pops/shifts the caller's array, so the schedule is drained after its first use. ARM A
  // is the fixturable one: ARM B needs a barrier-vocabulary derivation plus an ordered trigger/poll pair,
  // which is a whole test body, and ARM C is the founding-anchor tripwire (a `__g_` file cannot move the real
  // motion-stats CT). Both are proven per-arm by gate-conformance's mustFlag rows. The fixture leaves the
  // real anchor untouched, so ARM C keeps judging the real tree.
  fx(
    "tests/client/features/__g_ctpoll/__g_ctpoll.ct.tsx",
    'import { expect, test } from "@playwright/experimental-ct-react";\nconst G_SCHEDULE = [50, 100, 250];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: G_SCHEDULE, timeout: 10_000 }).toBe(1);\n});\n',
  );
  // no-parallel-section-map (arm 5), THE #942 SPLIT ON THE REAL TREE: a hand chrome list over `rail.nav` +
  // `rail.brand` — two zones that reach the gate's vocabulary ONLY through the live
  // `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]` spread. A direct-element reader saw one zone of four
  // and this parallel map escaped; conformance proves the resolver, and only this drives it against the
  // REAL chrome-registry/section-registry pair.
  fx(
    "packages/client/src/features/__g_grailzones/lib/hand-rail.ts",
    'export const HAND = [\n  { id: "a", zone: "rail.nav" },\n  { id: "b", zone: "rail.brand" },\n];\n',
  );
  // ── #944 FAIL-CLOSED DISCOVERY: the permanent IMPORTED-DEFINITION controls, on the REAL tree ─────────
  // The audited escape (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md) is a
  // definition that moved behind an import: the file stays at its sanctioned path, every co-location and
  // path check stays green, and the gate's duplicate-id / reachability / honesty / distinctness arms
  // silently return. Conformance mini-projects prove the matcher; THESE prove it on the tree the gates
  // actually run over — the pairs are `__g_` so they vanish with the rest of the fixtures.
  //
  // Each pair also exercises the #946 receipt: the gate's line reports `… member(s), 1 UNRESOLVED`. It does
  // NOT raise a population ALARM here, and that asymmetry is deliberate — the gate REPORTED the
  // declaration, so it rides the ordinary violation exit (lib/population.ts); an alarm would turn every
  // legitimate fail-closed finding into an exit-2 "the checker is broken" verdict, and this very suite
  // would then throw instead of reading its report.
  //
  // section-registry-completeness + placeholder-copy-registry (one pair drives BOTH — they share
  // the shared per-kind registryDefinitionFacts in lib/registry-fact.ts, which is the point of the shared discovery).
  fx(
    "packages/client/src/features/__g_impsec/lib/__g_impsec-definition.ts",
    'export const gImpSecDef = { id: "__g_impsec", content: () => null, context: { kind: "none" } };\n',
  );
  fx(
    "packages/client/src/features/__g_impsec/lib/__g_impsec-section.ts",
    'import { gImpSecDef } from "./__g_impsec-definition.ts";\nexport const gImpSecSection: SectionDefinition = gImpSecDef;\n',
  );
  // modal-registry-completeness + modal-body-not-placeholder (one pair drives BOTH).
  fx(
    "packages/client/src/features/__g_impmodal/lib/__g_impmodal-definition.tsx",
    'export const gImpModalDef = { id: "__g_impmodal", body: () => <SectionPlaceholder /> };\n',
  );
  fx(
    "packages/client/src/features/__g_impmodal/lib/__g_impmodal-modal.tsx",
    'import { gImpModalDef } from "./__g_impmodal-definition.tsx";\nexport const gImpModalModal: ModalDefinition = gImpModalDef;\n',
  );
  // config-group-completeness — the collection accumulator (the audit's exact fixture: an imported body
  // with no `create`, which the create-is-data arm would have caught).
  fx("packages/client/src/features/__g_impcoll/lib/__g_impcoll-definition.ts", 'export const gImpCollDef = { emptyText: "none" };\n');
  fx(
    "packages/client/src/features/__g_impcoll/lib/__g_impcoll-collection.tsx",
    'import { gImpCollDef } from "./__g_impcoll-definition.ts";\nexport const gImpCollCollection: CollectionContribution = gImpCollDef;\n',
  );
  // chrome-registry-completeness — the imported ChromeEntry. Its `rail.nav` zone with no `mobile` is what
  // the rail-mobile arm would have caught; before the fail-closed arm the discovery returned silently at a
  // sanctioned `*-chrome.tsx` path. This pair lands AFTER the #942 vocabulary work, so the zone axis it
  // fails closed in front of is the DERIVED one.
  fx(
    "packages/client/src/features/__g_impchrome/lib/__g_impchrome-definition.ts",
    'export const gImpChromeDef = { id: "__g_impchrome", zone: "rail.nav", label: "G", behavior: { kind: "widget", body: () => null } };\n',
  );
  fx(
    "packages/client/src/features/__g_impchrome/lib/__g_impchrome-chrome.tsx",
    'import { gImpChromeDef } from "./__g_impchrome-definition.ts";\nexport const gImpChromeChrome: ChromeEntry = gImpChromeDef;\n',
  );
  // json-column-write-parity ARM B (#879): a whole-replace writer of `user_settings.config` — a
  // VERSIONED-CONFIG column, derived from `defineVersionedConfig<UserSettings>` — with no
  // `requireIntactStoredConfig` dominating it. The #471 wipe, planted at a real domain path so the real
  // schema and the real contracts derivation are both in scope.
  fx(
    `${D}/settings/__g_undominated.ts`,
    'import { userSettings } from "@orb/db";\nexport async function gClobberConfig(ctx: { db: { update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => Promise<void> } } } }, config: unknown, at: number): Promise<void> {\n  await ctx.db.update(userSettings).set({ config, updatedAt: at }).where(1);\n}\n',
  );
}

// Registered LEGACY gates that CANNOT be driven by an injected `__g_` fixture — whole-corpus ratchets whose
// trigger needs the real single-home tuple + emit corpus (removing an emit / adding a tuple member),
// which a throwaway file can't reproduce. Each is proven to fire by its OWN self-test in tests/tooling/.
// A FINAL `defineGate` policy is NEVER a row here: the anti-drift arm partitions final ids out by the mixed
// roster (`loadMixedGateCorpus`), because their bite is `structure:policy-conformance` on every `pnpm check`,
// and the two-sided test below REDs a row that names a converted policy — seven rows had gone stale that way
// (eslint-grant-liveness, depcruise-grant-liveness, warning-code-coverage, verify-registry-parity,
// bus-producer-coverage, message-kind-policy-coverage, ct-poll-schedule-and-paint-health) by 2026-09-11.
// enforcement-registry-parity: its `__g_` arm is retired (the gate-file-vs-registry job is now the loader's
// fail-closed responsibility); its contract-form doc-reconciliation bite is proven by gate-conformance and by
// tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts over both contracts.
// bus-payload-allowlist CONVERTED 2026-09-13 (#1584) and its row is GONE from the set below: it SPLIT into
// `bus-payload-allowlist` (reviewed-grant) + `bus-payload-allowlist-health` (hard) over one shared
// `busPayloadFact` provider, and a final policy is partitioned out by the mixed roster, so a row naming
// either half fails the two-sided arm. Its unfixturability was never about the `__g_` sentinel: the family
// dispatches on EIGHT exact bus-contract paths and reaches a carrier only because a REAL bus file
// `extends`/aliases/imports it, which a throwaway file cannot make it do — and a final policy's `mode:
// "types"` proof rows materialise a whole synthetic contracts tree with its own carriers, which is exactly
// the substrate the legacy harness could not give it. Its bite is `structure:policy-conformance` running
// twelve `mustFlag` + nine `mustPass` rows on the reviewed half (imported-carrier, aliased-arm, merged
// declaration, the zod imported-initializer arm, the two #1047 distribution positions, the #1066 tuple
// element, and the grant-granularity aggregation row) and eight + six on the hard half (unresolved-base,
// index-signature, `Record` field, unresolved-schema, `.loose()`, the unenumerable constraint, the #1066
// conditional field type and the empty-denominator tripwire), plus
// tests/tooling/verify/gates/bus-payload-family.test.ts, which carries the real-corpus liveness pin and the
// blindness sweep the conformance substrate structurally cannot reach.
// knob-wire-coverage (D107): a whole-corpus coverage ratchet over its semantic member sources
// (EffectiveAppConfig / USER_SETTINGS_SECTIONS / appSettingsSchema / imported Appearance schema /
// DEFAULT_FORMAT_STRINGS / chatMetadataSchema). Its MISSING arm needs an UNWIRED member added to one of
// those contract sources —
// a throwaway `__g_` file can't add a member to the real union/interface/schema, and the STALE/ORPHAN arms
// need a real registry edit. Its bite is proven by gate-conformance (per-arm mustFlag + STALE + the
// paired-anchor tripwire mustFlag) + its live run on the real tree with the founding registry.
// baseui-surface-manifest CONVERTED 2026-09-13 (#1584) and its row is GONE from the set below: a final
// policy is partitioned out by the mixed roster, so a row naming one fails the two-sided arm at the end of
// this file. It still compares two ARTIFACTS — the installed `@base-ui/react` and the committed surface
// manifest — neither of which a `__g_` source file can perturb; that was never about the `__g_` sentinel
// either, because a final policy's `mode: "resource"` proofs materialise their OWN temp repository with a
// synthetic installed package planted where node's resolver finds it, which is exactly the substrate the
// legacy harness could not give it. Its bite is `structure:policy-conformance` running seven `mustFlag`
// rows (a new part, a new prop, a new STATE key, an `unresolved` disposition, a reason-less `sealed-away`,
// the reader's learned-nothing tripwire and its truncation twin, and a ledger that is valid JSON and is not
// a ledger) plus tests/tooling/verify/gates/baseui-and-surface-family.repo.int.test.ts, which pins the two
// refusals a proof row cannot express — the missing ledger and the uninstalled package, which the legacy
// descriptor reported as its own findings behind a hand-rolled real-tree anchor.
// baseui-anatomy-completeness and baseui-derives-not-respells converted in the same commit, and the latter
// SPLIT (the `hard` handler arm is `baseui-derives-not-respells-health`). Neither was ever in the set below
// — both are fixturable and both still fire on the `__g_` seals planted above, which is why those fixtures
// stay: a `__g_` file is ambient corpus for every gate in the pass, not a per-gate input, and deleting one
// because its author's gate converted is how a sibling's only fixture disappears.
// biome-grant-liveness and tsconfig-entry-liveness CONVERTED 2026-09-12 (#2021) and their names are GONE
// from the set below, for the same reason runner-config-path-liveness's is: a final policy is partitioned
// out by the mixed roster, so a row naming one fails the two-sided arm. Each became a PAIR (the policy plus
// a `hard` `-health` sibling), and each pair's bite is `structure:policy-conformance` running its own rows
// plus tests/tooling/verify/gates/{grant-liveness-family.test.ts,<id>.int.test.ts}. Their unfixturability
// was never about the `__g_` sentinel anyway — a final policy's resource proofs materialise their own temp
// repository, which is exactly the substrate the legacy harness could not give them.
// runner-config-path-liveness CONVERTED 2026-09-12 (#1584) and its row is GONE from the table below: a final
// policy is partitioned out by the mixed roster, and leaving its name here would fail the two-sided arm that
// refuses a row naming a converted policy. Its bite is `structure:policy-conformance` running its own rows,
// plus tests/tooling/verify/gates/{grant-liveness-family.test.ts,runner-config-path-liveness.int.test.ts}.
// tokens-contract CONVERTED 2026-09-13 (#2182 — `a97454714`'s own subject line; this comment cited #2183,
// its NEIGHBOUR's issue, until #2294) and its row is GONE from the set below: a final policy is
// partitioned out by the mixed roster, so a row naming one fails the two-sided arm. It still reads the seven
// exact canonical JSON/schema paths, which a throwaway `__g_` file could never perturb without mutating the
// live vault; its bite is `structure:policy-conformance` running its own three arms plus
// tests/tooling/verify/gates/token-contract-family.test.ts, which pins the Git removal ratchet the legacy
// descriptor gated on a real-tree anchor no fixture could ever satisfy.
// css-family-ownership and css-selector-has-a-writer CONVERTED 2026-09-13 (#2181, #2182) and their rows are
// GONE from the set below, for the same reason the config-liveness pair's and tokens-contract's are: a final
// policy is partitioned out by the mixed roster, so a row naming one fails the two-sided arm. Each SPLIT by
// authority, so the two names became five ids — `css-family-ownership` + `-health` +
// `css-family-direct-client-mechanism`, and `css-selector-has-a-writer` + `-health` — under one family
// (`css-hook-provenance`). Their unfixturability was never about the `__g_` sentinel: a final policy's
// `mode: "resource"` rows materialise their own temp repository carrying the whole five-home CSS identity,
// the installed vendor surface and the committed Base UI manifest, which is exactly the substrate the legacy
// harness could not give them. Their bite is `structure:policy-conformance` running every declared arm plus
// tests/tooling/verify/gates/css-hook-provenance-family.test.ts.
// playwright-css-topology CONVERTED 2026-09-13 (#2183) and its row is GONE from the set below, for the same
// reason the config-liveness pair's is: a final policy is partitioned out by the mixed roster, so a row
// naming one fails the two-sided arm. Its unfixturability was never about the `__g_` sentinel either — a
// final policy's resource proofs materialise their own temp repository with the whole front-door topology
// in it, which is exactly the substrate the legacy harness could not give it. Its bite is
// `structure:policy-conformance` running thirteen `mustFlag` rows (including the ORDER, PRESENCE and
// TARGET clauses of the CT config, and the unresolvable-@import arm #2231 found structurally dead), three
// `mustPass` rows (one of which pins that a COMMENTED-OUT import in the CT boot is not an import), THREE
// `mustRefuse` rows — a vanished `exact-file` anchor plus BOTH reachable statuses of `product-css`,
// `missing` and `malformed` (#2294 added the third; this sentence said "two" until then) — and
// tests/tooling/verify/gates/css-home-topology-family.test.ts. Counts re-derived from the module's own
// arrays, never carried forward: `gate.mustFlag/mustPass/mustRefuse.length` = 13 / 3 / 3.
// devtools-frontend-assets CONVERTED 2026-09-13 (#1584) and its row is GONE from the set below, for the
// same reason the tokens-contract and config-liveness rows are: a final policy is partitioned out by the
// mixed roster, so a row naming one fails the two-sided arm. Its unfixturability was never about the `__g_`
// sentinel either — it reads the exact generated closure under tooling/src/snap/lib/devtools-frontend, which
// a throwaway source file could never perturb without mutating the live vendored root, and a final policy's
// resource proofs materialise their own temp repository WITH a planted node_modules, which is exactly the
// substrate the legacy harness could not give it. Its bite is `structure:policy-conformance` running four
// `mustFlag` rows (hash drift, the exact inventory, the canonical-path fence and the installed
// Playwright/Chromium tuple), one `mustPass` and two `mustRefuse` rows, plus
// tests/tooling/verify/gates/devtools-frontend-assets.int.test.ts, which pins the real-corpus liveness the
// legacy descriptor held with a `tooling/src/snap/cli.ts` anchor no fixture could satisfy.
const UNFIXTURABLE_GATES = new Set([
  "enforcement-registry-parity",
  // "bus-payload-allowlist" removed 2026-09-13 (#2296) — the conversion at `a196a35d7` rewrote the comment
  // block above to say this row was GONE and then left the ENTRY here, so the two-sided arm below read
  // `legacy=false, final=true` and this suite went red on `main`. The commit could not see it: the suite is
  // orchestrator-only (it plants `__g_` fixtures and is not concurrency-safe with itself), so the lane
  // correctly did not run it, and nothing else reads this set. **A conversion that edits this file owes the
  // ENTRY deletion, not just the comment** — and the entry is the half the arm checks.
  // "css-family-ownership" + "css-selector-has-a-writer" removed 2026-09-13 (#2181, #2182) for the same
  // reason, with their comment block above: both converted and SPLIT into five final ids.
  "knob-wire-coverage",
]);

let registry = new Set<string>();
let fired = new Set<string>();
let cleanRun = "";
let blind = new Set<string>();
/** The mixed roster the assertions partition on — read through the loader, never scraped from a name. */
let corpusFiles: readonly string[] = [];
let unregisteredModules: readonly string[] = [];
let legacyNames = new Set<string>();
let finalIds = new Set<string>();

beforeAll(async () => {
  cleanFixtures();
  const corpus = await loadMixedGateCorpus(ROOT);
  corpusFiles = corpus.files;
  unregisteredModules = corpus.unregistered;
  legacyNames = new Set(corpus.legacy.map((g) => g.name));
  finalIds = new Set(corpus.final.map((p) => p.id));
  // registry = every gate report.ts prints, ✓ OR ✗. A gate can be legitimately ✗ on the real tree
  // (e.g. test-presence flagging a not-yet-tested infra/foundation file) and must still count as
  // "registered" — otherwise the dir-cross-check below would mistake an honest red for an unregistered gate.
  const cleanReport = runStructure();
  cleanRun = cleanReport;
  blind = names(BLIND_RE, cleanReport);
  registry = new Set([...names(OK_RE, cleanReport), ...names(FIRED_RE, cleanReport), ...blind]);
  writeFixtures();
  fired = names(FIRED_RE, runStructure()); // with fixtures: the gates that caught a violation
}, HOOK_BUDGET);

afterAll(() => {
  cleanFixtures();
});

test("derives a non-trivial gate registry from report.ts (not silently empty)", () => {
  expect(registry.size).toBeGreaterThan(8);
});

test("reserved proof files stay project inputs but never become descriptor corpus, and the roster accounts for every module once", () => {
  expect(corpusFiles.filter((file) => file.includes("/__g_") || file.includes("/__dc_"))).toEqual([]);
  expect(unregisteredModules).toEqual([]);
  // The accounting identity the run manifest reconciles (contract/gate-corpus.ts): one roster row per module.
  expect(corpusFiles.length).toBe(legacyNames.size + finalIds.size + unregisteredModules.length);
});

// Any glyph, then the denominator suffix — a status line that carries no count fails this. A legacy line carries the
// FILE scan; a final line carries the resolved POPULATION (source + resource paths).
const SCANNED_RE = /^ {2}[✓✗⚠] (?<gate>[a-zA-Z0-9-]+).*? {2}· {2}scanned \d+\/\d+ files/gmu;
const FINAL_POPULATION_RE = /^ {2}[✓✗⚠] (?<gate>[a-zA-Z0-9-]+).*? {2}· {2}final [a-z-]+\/[a-z]+ · population \d+ source · \d+ resource/gmu;
const DENSITY_ADMITTED_RE = /^ {2}[✓✗!] density-tier.*admitted-by-ratchet: \d+/mu;
// #569: the admitted number is SPLIT BY CLASS everywhere it prints — a ratified admission is permanent by a
// recorded ruling and must not read as burnable backlog. THE CARRIER MOVED 2026-09-12 (#2063): `suppressions`
// used to be the ledger carrying both halves, and its per-file count ratchet was DELETED when the policy
// converted to reviewed-grant authority, so it prints no `admitted-by-ratchet` line at all any more.
// `density-tier` carries the split now — a live ratchet whose rows are ratified. Like every carrier in this
// file, it is LEGACY BY REQUIREMENT: the split line is a legacy-runtime artifact and this whole suite retires
// with the legacy roster at the atomic cutover rather than being re-pointed forever.
const RATCHET_SPLIT_RE = /^ {2}[✓✗!] density-tier.*admitted-by-ratchet: (?<total>\d+) \((?<debt>\d+) debt · (?<ratified>\d+) ratified\)/mu;
const SINGLE_PASS_SPLIT_RE = /^single-pass: (?<total>\d+) finding\(s\) admitted by ratchet baselines \((?<debt>\d+) debt · (?<ratified>\d+) ratified\)/mu;

test("every LEGACY gate reports the SCAN DENOMINATOR behind its verdict (Codex GA-H-01)", () => {
  // A verdict without a denominator cannot be audited: ✓ reads identically whether the gate examined
  // 4,796 files or none of them. This is the permanent form of that guarantee over the REAL corpus; a final
  // policy's denominator is its POPULATION, asserted by the next test in the final vocabulary.
  const counted = names(SCANNED_RE, cleanRun);
  expect([...registry].filter((g) => !(counted.has(g) || finalIds.has(g)))).toEqual([]);
});

test("every FINAL policy reports the POPULATION DENOMINATOR behind its verdict — the same claim, the final vocabulary", () => {
  const counted = names(FINAL_POPULATION_RE, cleanRun);
  expect([...registry].filter((g) => finalIds.has(g) && !counted.has(g))).toEqual([]);
  // The partition above is only as honest as the final set it reads: an EMPTY set would hand every row to the
  // legacy arm and the two anti-drift arms silently. The mixed loader classifies by brand, so zero here means the
  // classifier died, not that the corpus is legacy-only (163 final at re-derivation, never restated as a pin).
  expect(finalIds.size).toBeGreaterThan(0);
});

test("no gate's real-tree run is a NON-VERDICT: no legacy gate scanned ZERO files, no final owner failed or was WITHHELD", () => {
  // A gate whose scanRoot admits nothing runs, finds nothing, and renders green; a final policy whose owner threw
  // or whose fact was refused is withheld before it can judge. The front door calls both a TOOL error (exit 2) —
  // this pins the population at zero so the day one appears it is attributed here and not mistaken for an
  // unregistered-gate drift red.
  expect([...blind]).toEqual([]);
});

test("a ratchet gate names the debt it admits in normal output (Codex GA-H-02)", () => {
  // green ≠ clean population: a live ratchet carries a committed per-file budget, and until 2026-08-13
  // the only way to learn the number was to run the generator. finding-overload-provenance's own ratchet
  // reached `{}` and was deleted (GATE-AUTHORING.md §4.8) — it is born-compliant now, so it carries no
  // admitted-by-ratchet line any more.
  expect(cleanRun).toMatch(DENSITY_ADMITTED_RE);
});

test("the admitted number is split into DEBT and RATIFIED, and the split adds up (#569)", () => {
  // The owner's complaint this classification answers: an undifferentiated admitted total makes 346 ruled
  // suppressions and 6 ruled door pairs read as "a glut of backlog". Both the per-gate line and the
  // single-pass footer carry the split, and the two halves must SUM to the total — an arithmetic that
  // silently drifts would be worse than no split at all.
  const perGate = RATCHET_SPLIT_RE.exec(cleanRun)?.groups;
  expect(perGate).toBeDefined();
  expect(Number(perGate?.["debt"]) + Number(perGate?.["ratified"])).toBe(Number(perGate?.["total"]));
  expect(Number(perGate?.["ratified"])).toBeGreaterThan(0);
  const footer = SINGLE_PASS_SPLIT_RE.exec(cleanRun)?.groups;
  expect(footer).toBeDefined();
  expect(Number(footer?.["debt"]) + Number(footer?.["ratified"])).toBe(Number(footer?.["total"]));
});

test("every registered LEGACY gate fires on its fixture (anti-drift)", () => {
  // A FINAL policy is partitioned out by the mixed roster, not carried as an UNFIXTURABLE row: its bite is
  // `structure:policy-conformance` running its own mustFlag/mustPass rows through the production dispatcher
  // (`runPolicyPass`) on every `pnpm check` — a stronger receipt than one `__g_` fixture.
  const unfired = [...registry].filter((g) => !(fired.has(g) || UNFIXTURABLE_GATES.has(g) || finalIds.has(g)));
  expect(unfired).toEqual([]);
});

test("every UNFIXTURABLE row names a LEGACY module on the mixed roster — a row naming a converted policy or nothing is stale", () => {
  // The two-sided arm this exemption table owed (GATE-AUTHORING.md §4.4): when a gate converts to `defineGate`
  // its bite moves to the conformance stage and its row here is dead text that hides nothing and teaches the
  // wrong home. Seven rows had gone stale that way by 2026-09-11; this arm was RED on them before they were removed.
  expect([...UNFIXTURABLE_GATES].filter((g) => !legacyNames.has(g))).toEqual([]);
});

// Gates DELIBERATELY held DORMANT (`status:"dormant"` descriptors) — built + self-tested but not run by
// the live pass (runPass filters to status:"active"), so report.ts never prints them and they're absent
// from `registry`. Each has its own header explaining why + a residual self-test proving it still fires
// (the worked example was `monotonic-tests`' residual suite, retired with that gate in #2217). This is the ONE
// sanctioned exemption from the file-vs-registry anti-drift check below.
const DORMANT_GATES = new Set<string>([]);

test("every ACTIVE gate file in tooling/src/verify/gates is run by report.ts (anti-drift)", () => {
  // A gate file whose descriptor is status:"active" but that report.ts's live pass never prints would be
  // silently doing nothing. The loader IS the registry — an invalid/unwired gate file is a load-time RED —
  // so this closes the residual hole: every gate-file basename (kebab) must equal a gate name report.ts
  // prints, UNLESS it's an explicitly DORMANT gate (status:"dormant", not run by the live pass).
  const unregistered = GATE_FILES.filter((g) => !(registry.has(g) || DORMANT_GATES.has(g)));
  expect(unregistered).toEqual([]);
});
