/**
 * dependency-cruiser — the import-graph backstop for the layer cake + the server tier order.
 *
 * The cake (kit ← contracts ← db ← server ← client) is PRIMARILY resolver-physics (a package can't
 * import an undeclared dep). dep-cruiser is the tier-3 backstop that (a) catches deep relative `../../`
 * escapes that dodge the package boundary, (b) distinguishes type-only edges (the client→server tRPC
 * AppRouter bridge, drivers' param types), and (c) enforces everything INSIDE @orb/server — the server
 * tier order + per-feature isolation — which the resolver cannot see (it's all one package).
 *
 * Scanned via `pnpm depcruise` (= `depcruise packages --config .dependency-cruiser.cjs`); cross-package
 * `@orb/*` imports resolve through the workspace into `packages/<pkg>/src/...`, so the path regexes below
 * match resolved edges. Authoritative rule sources: structure.md §3/§7, the tier docs (foundation/infra/
 * providers/transport/db/entry), domains.md, and reports/PRE-SCAFFOLD-CHECKLIST.md §A1.
 *
 * HOUSE STYLE (from neo, kept): generic-over-enumerated (one capture-group rule auto-covers future
 * features); `dependencyTypesNot: ["type-only"]` is the contract-vs-coupling discriminator (a type-only
 * import declares an injected dep's SHAPE, wired at a composition root — allowed; a value import is real
 * coupling — blocked); every rule carries a `comment` saying WHY (it's what surfaces on a violation).
 *
 * NOT here (deferred / enforced elsewhere, per the docs): client layering (Phase 6 — structure undecided);
 * assets-single-writer / discovery-no-vector-write / serde-core-single-mapper / ASSUMES(single-replica)
 * presence (method-call/comment shape → ts-morph gates, see reports/ENFORCEMENT.md backlog);
 * persistence-no-in-memory-state (a grit plugin); no-inline-types / exhaustive-dispatch (biome + ts-morph);
 * "runner/family never leave providers" (compile-time + a grep). no-orphans is set to ignore until code
 * wires up (the placeholder tree is all orphans; knip is the dead-code authority — ENFORCEMENT backlog).
 *
 * FEATURES USED beyond the forbidden-list: `reachable` (the transitive credential firewall),
 * `dependencyTypesNot:["type-only"]` (the contract-vs-coupling discriminator), `tsPreCompilationDeps`
 * (so type-only edges exist to discriminate), `skipAnalysisNotInRules` (speed), content-strategy `cache`,
 * the `archi`/`dot` collapse reporters + the package.json graph scripts (`depcruise:graph` mermaid,
 * `:focus`, `:reaches`, `:affected`), and `--output-type err-long` on the validator so a violation prints
 * its WHY (the rule comment) — load-bearing since agents are the authors.
 *
 * DELIBERATE feature non-adoptions (evaluated, declined — don't re-litigate without new evidence):
 * `metrics`/instability gates (churn every edit → noisy advisory, not a stable invariant); baseline /
 * known-violations / `--ignore-known` (that's for adopting on a DIRTY codebase — we're green-to-ship);
 * `scope:"folder"` cycle rules (neo MEASURED 161 phantom cycles from the type-only client→server bridge;
 * the one-directional rules already encode the acyclicity that matters); `allowed`/whitelist mode (a
 * forbidden-list fits a known cake); `required` rules (no current "must-import" invariant the structural
 * gates don't already cover).
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */

const KIT = "^packages/kit/src/";
const CONTRACTS = "^packages/contracts/src/";
const DB = "^packages/db/src/";
const CLIENT = "^packages/client/src/";
const SRV = "^packages/server/src/";
const TEST_FILES = "\\.(test|int\\.test|contract\\.test|parity\\.test|spec|test-d|ct)\\.[jt]sx?$";

/** Domain fixed-slot subdirs (the uniform 8-slot template, structure.md §4). Anything ELSE under a
 *  feature dir is a named SUBSYSTEM (engine/ assembly/ memory/ themes/ …) — substrate-mediated. */
const FIXED_SLOTS = "(contract|verbs|persistence|substrate)";

// The graph-reporter collapse pattern (one tier/package per node). Hoisted + suppressed once: biome's
// noSecrets false-positives on the high-entropy regex alternation.
// biome-ignore lint/security/noSecrets: a path-collapse regex for the dot/archi reporters, not a secret.
const COLLAPSE = "^packages/(server/src/[^/]+|client/src/[^/]+|kit|contracts|db)";

module.exports = {
  extends: "dependency-cruiser/configs/recommended-strict",

  forbidden: [
    // ════════════════════════ The package cake (backstop to the resolver) ════════════════════════
    {
      name: "kit-purity",
      comment:
        "@orb/kit is the isomorphic leaf: pure primitives + engines. It MAY use isomorphic npm (zod, typeid-js, luxon, remend) but NOT any higher package — and NOT Node built-ins (the kit-no-node-builtins rule below). Node-only-pure code goes to @orb/server/kit (e.g. the node:vm regex guard). (DECISIONS-LEDGER §0.6 — the kit-purity ruling: 'zero runtime deps' = zero domain/I-O/Node deps, not zero npm.)",
      severity: "error",
      from: { path: KIT },
      // NOTE: conditions WITHIN a single `to` are AND'd by dep-cruiser, so node:* (a separate concern)
      // gets its OWN rule below — combining `path` + `dependencyTypes:["core"]` here would match nothing.
      to: { path: [CONTRACTS, DB, "^packages/server/", CLIENT] },
    },
    {
      name: "kit-no-node-builtins",
      comment:
        "@orb/kit must not import node:* — it is browser-safe (isomorphic). The node:vm ReDoS guard and any other Node-only-pure helper live in @orb/server/kit, not here. (shared-dissolution.md §0/§2.)",
      severity: "error",
      from: { path: KIT },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "contracts-cake",
      comment:
        "@orb/contracts (the wire: cross-boundary types + zod) deps only @orb/kit. It must never import @orb/db, @orb/server, or @orb/client. (structure.md §2 cake.)",
      severity: "error",
      from: { path: CONTRACTS },
      to: { path: [DB, "^packages/server/", CLIENT] },
    },
    {
      name: "db-cake",
      comment:
        "@orb/db (drizzle schema + libSQL) deps only kit + contracts. A db→server or db→client import is impossible by the cake; the OTel wrapper is INJECTED into createDb, never imported. (tiers/db.md.)",
      severity: "error",
      from: { path: DB },
      to: { path: ["^packages/server/", CLIENT] },
    },
    {
      name: "server-no-client",
      comment: "Server code must never import the browser/presentation package.",
      severity: "error",
      from: { path: "^packages/server/" },
      to: { path: CLIENT },
    },
    {
      name: "client-no-backend-runtime",
      comment:
        "The browser bundle must never pull @orb/server or @orb/db RUNTIME code. Type-only imports ARE allowed — that's how the client gets the tRPC AppRouter type — so this fires only on real value imports. (structure.md §2: client deps kit+contracts+server[type-only]; boundary-scan: client→server is 100% type-only today.)",
      severity: "error",
      from: { path: CLIENT },
      to: { path: ["^packages/server/", DB], dependencyTypesNot: ["type-only"] },
    },

    // ════════════════════ The server tier order (entry>transport>domain>infra>foundation>kit) ═══════
    {
      name: "foundation-reaches-up-to-nothing",
      comment:
        "foundation (env · config · observability) is read DOWN by every tier and reaches UP to none. No foundation→entry/transport/domain/infra import. It MAY import @orb/db (the /_debug probes read schema down — db is a lower package) + @orb/contracts + @orb/kit + server/kit. The killed DEFAULT_*_MODEL_ID foundation→infra edge is the canary. (tiers/foundation.md invariant #2.)",
      severity: "error",
      from: { path: `${SRV}foundation/` },
      to: { path: `${SRV}(entry|transport|domain|infra)/` },
    },
    {
      name: "infra-below-domain",
      comment:
        "infra is a sealed I/O executor BELOW domain. A providers/auth/crypto/network/storage/image adapter must not import a domain, the transport drivers, or entry — the db-dependent steps a domain needs are INJECTED in, never imported. (tiers/infra.md sealed-executor invariant.)",
      severity: "error",
      from: { path: `${SRV}infra/` },
      to: { path: `${SRV}(entry|transport|domain)/` },
    },
    {
      name: "infra-no-db",
      comment:
        "infra is db-free physics: NO @orb/db import. The proof case is oidc-store.ts — because it imports @orb/db it CANNOT live in sealed infra (it moved to domain/sessions/persistence). Storage/crypto/network/auth all stay db-free; the db steps arrive via injected ResolveDeps. (tiers/infra.md invariant #1; tiers/db.md: infra does not read the schema.)",
      severity: "error",
      from: { path: `${SRV}infra/` },
      to: { path: DB },
    },
    {
      name: "domain-below-drivers",
      comment:
        "domain (business logic) is below the drivers + entry. A domain must not import transport/ or entry/ — drivers call DOWN into domain front doors, never the reverse. (structure.md §3.)",
      severity: "error",
      from: { path: `${SRV}domain/` },
      to: { path: `${SRV}(entry|transport)/` },
    },
    {
      name: "transport-below-entry",
      comment:
        "transport (the tRPC + jobs drivers) is below entry (the composition root). A driver must not import entry/. (structure.md §3.)",
      severity: "error",
      from: { path: `${SRV}transport/` },
      to: { path: `${SRV}entry/` },
    },
    {
      name: "drivers-through-domain",
      comment:
        "Drivers stay THIN: tRPC routers + job workers reach the database and infra adapters THROUGH a domain front door at RUNTIME, never directly. Type-only imports ARE allowed (a driver may declare `db: Db` as a param type — a contract, not coupling). EXEMPT: transport/rate-limit.ts — the DB-backed limiter primitive legitimately imports the @orb/db PACKAGE (a cake dep below server; instances are constructed at entry/). (tiers/transport.md: routers import no @orb/db/infra; the limiter is the one exception.)",
      severity: "error",
      from: { path: `${SRV}transport/`, pathNot: `${SRV}transport/rate-limit\\.ts$` },
      to: { path: [DB, `${SRV}infra/`], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-cross-driver",
      comment:
        "transport/trpc and transport/jobs are independent drivers — neither imports the other. Shared work lives in the domain layer they both call down into. (tiers/transport.md.)",
      severity: "error",
      from: { path: `${SRV}transport/(trpc|jobs)/` },
      to: { path: `${SRV}transport/(trpc|jobs)/`, pathNot: `${SRV}transport/$1/` },
    },
    {
      name: "server-kit-reaches-up-to-nothing",
      comment:
        "@orb/server/kit is the server-only-pure bottom tier (node-only-pure: post-process, serde, content-hash, the node:vm regex guard). It may use node:* + @orb/db + @orb/contracts + @orb/kit (all at/below it), but must reach UP to nothing in server — no entry/transport/domain/infra import. (shared-dissolution.md §2.)",
      severity: "error",
      from: { path: `${SRV}kit/` },
      to: { path: `${SRV}(entry|transport|domain|infra|foundation)/` },
    },

    // ════════════════════════════ Domain feature isolation ═══════════════════════════════════════
    {
      name: "domain-no-cross-feature",
      comment:
        "Domain features stay independent: a module in domain/<a>/ must not import another feature's internals at RUNTIME. There is NO domain/_shared in orbweaver (principle #3) — cross-feature primitives are @orb/kit, cross-feature services are their own feature. TYPE-ONLY imports across features ARE allowed (a verb declaring the SHAPE of an injected cross-feature op — wired at the composition root). (structure.md §4; domains.md.)",
      severity: "error",
      from: { path: `${SRV}domain/([^/]+)/` },
      to: {
        path: `${SRV}domain/([^/]+)/`,
        pathNot: `${SRV}domain/$1/`,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "domain-feature-front-door",
      comment:
        "Enter a domain feature through its PUBLIC API (domain/<feature>/index.ts), not its internals — so a feature can refactor freely. Callers above (transport, entry) import the index only. (structure.md §4; the one sanctioned barrel.)",
      severity: "error",
      from: { pathNot: `${SRV}domain/` },
      to: {
        path: `${SRV}domain/[^/]+/.+`,
        pathNot: `${SRV}domain/[^/]+/index\\.ts$`,
      },
    },
    {
      name: "domain-no-cross-verb",
      comment:
        "GENERIC verb isolation (every feature with a verbs/ dir). A verb file must not import another verb file's VALUE — verb-to-verb deps are wired EXPLICITLY at service.ts via factory injection (createSend(ctx, { runCompaction })). Type-only imports between verbs ARE allowed (declare an injected dep's typed shape). Group barrels (verbs/<group>/index.ts) are the composition point — exempt both sides. (structure.md §4; verb-naming gate is its sibling.)",
      severity: "error",
      from: { path: `${SRV}domain/([^/]+)/verbs/.+\\.ts$`, pathNot: "/index\\.ts$" },
      to: {
        path: `${SRV}domain/$1/verbs/.+\\.ts$`,
        pathNot: "/index\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "domain-no-reach-up-into-verbs",
      comment:
        "GENERIC substrate-below-verbs. Any non-verbs subdir of a feature (substrate/ persistence/ + named subsystems) sits BELOW the verbs that consume it and must not import them. persistence is called BY verbs, a subsystem is dispatched BY a verb — never the reverse. Feature-root files (service/context/index) are out of scope (not in a subdir). (structure.md §4.)",
      severity: "error",
      from: { path: `${SRV}domain/([^/]+)/(?!verbs/)[^/]+/` },
      to: { path: `${SRV}domain/$1/verbs/`, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "domain-substrate-mediates-subsystems",
      comment:
        "A feature's verbs + root files reach a NAMED SUBSYSTEM (any subdir that is NOT a fixed slot: contract/verbs/persistence/substrate) ONLY through substrate/. A verb importing ./memory/generate directly bypasses the DI seam, making the dep invisible at the composition root + the subsystem refactor-unsafe. Generic because orbweaver's template is uniform (the fixed-slot set is global — no per-feature map). Type-only exempt (declare an injected shape). service.ts/index.ts/context.ts (composition surfaces) are exempt FROM. (structure.md §4; the orbweaver-clean form of neo's substrate-only-subsystem-access.)",
      severity: "error",
      from: {
        path: `${SRV}domain/([^/]+)/(verbs/)?[^/]+\\.ts$`,
        pathNot: `${SRV}domain/[^/]+/(service|index|context)\\.ts$`,
      },
      to: {
        path: `${SRV}domain/([^/]+)/[^/]+/`,
        pathNot: [`${SRV}domain/$1/${FIXED_SLOTS}/`],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "domain-no-cross-subsystem",
      comment:
        "A feature's named subsystems stay independent: a file in subsystem A can't import subsystem B (same feature, different non-fixed-slot subdir). Cross-subsystem coordination goes through substrate/ (the DI seam) — exempt both sides, along with the fixed slots (substrate split across files, not subsystems). (structure.md §4.)",
      severity: "error",
      from: {
        path: `${SRV}domain/([^/]+)/([^/]+)/`,
        pathNot: [`${SRV}domain/[^/]+/${FIXED_SLOTS}/`],
      },
      to: {
        path: `${SRV}domain/([^/]+)/([^/]+)/`,
        pathNot: [`${SRV}domain/$1/$2/`, `${SRV}domain/[^/]+/${FIXED_SLOTS}/`],
        dependencyTypesNot: ["type-only"],
      },
    },

    // ════════════════════════════ infra/providers (the sealed executor) ══════════════════════════
    {
      name: "providers-public-surface-only",
      comment:
        "Code outside infra/providers may import ONLY the public surface — the front door (providers/index.ts), the role dispatchers (roles/), and the contract barrel (contract/). Reaching INTO a sealed family (backends/<x>) or the local engine (vllm/) is RED — the family boundary is internal, and the agent-sdk credential firewall must not leak through a deep import. Wildcard match means new families inherit the seal. tests/support is exempt (mock runners instantiate family shapes). (tiers/providers.md invariants #1/#4.)",
      severity: "error",
      from: { pathNot: [`${SRV}infra/providers/`, "^tests/support/"] },
      to: { path: `${SRV}infra/providers/(backends|vllm)/` },
    },
    {
      name: "infra-strategy-isolation",
      comment:
        "Strategy-pattern infra (providers/backends/<family>, auth/modes/<mode>) stays independent: a module in <group>/<strategy>/ must not import a SIBLING strategy's internals. Cross-strategy work goes through the role/mode contract or a shared pure helper — never a direct reach. One generic rule covers both groups + every future member. (tiers/providers.md invariant #2; tiers/infra.md MODE_RESOLVERS.)",
      severity: "error",
      from: { path: `${SRV}infra/(providers/backends|auth/modes)/([^/]+)/` },
      to: {
        path: `${SRV}infra/$1/([^/]+)/`,
        pathNot: [`${SRV}infra/$1/$2/`, `${SRV}infra/providers/backends/kit/`],
      },
    },
    {
      name: "vllm-surface-isolation",
      comment:
        "The vLLM engine's five role surfaces are independent: surfaces/<a> must not import surfaces/<b>. Surfaces register against engine/ (down); changing one surface never touches another. (tiers/providers.md invariant #7.)",
      severity: "error",
      from: { path: `${SRV}infra/providers/vllm/surfaces/([^/]+)` },
      to: {
        path: `${SRV}infra/providers/vllm/surfaces/([^/]+)`,
        pathNot: `${SRV}infra/providers/vllm/surfaces/$1`,
      },
    },
    {
      name: "credential-firewall-openrouter-not-agent-sdk",
      comment:
        "TRANSITIVE credential firewall (CLAUDE.md hard-won fact: the Max-sub OAuth credential must NEVER leak into the OpenRouter paths — token extraction is what got an account banned). strategy-isolation blocks the DIRECT edge; `reachable: true` closes the transitive hole — no openrouter module may reach agent-sdk through ANY chain (e.g. via a backends/kit helper). (tiers/providers.md §7.1 firewall; shared-dissolution.md §9.)",
      severity: "error",
      from: { path: `${SRV}infra/providers/backends/openrouter/` },
      to: { path: `${SRV}infra/providers/backends/agent-sdk/`, reachable: true },
    },

    // ════════════════════════════ Persistence + fine-grained domain ═════════════════════════════
    {
      name: "persistence-no-io",
      comment:
        "persistence/ is db queries ONLY — no node:* I/O (no node:fs / node:net / raw fetch). A raw fetch vs a user URL is infra (e.g. fetchOpenAiModels → infra/network), reached via an injected op. (structure.md §7; tiers/infra.md openai-models move.) The no-module-scope-Map half is a grit plugin (persistence-no-in-memory-state).",
      severity: "error",
      from: { path: `${SRV}domain/[^/]+/persistence/` },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "stats-no-vector-tables",
      comment:
        "stats is ECONOMICS (tokens/cost/cache/timing) — it touches ZERO vector tables. discovery is SEMANTICS (themes/hubness/facets). The line is type-enforced: domain/stats must not import the embeddings vector schema. (domains.md 'stats/discovery line as a type'; knowledge-cluster.md §11.7.) Forward rule — matches once db/schema/embeddings lands.",
      severity: "error",
      from: { path: `${SRV}domain/stats/` },
      to: { path: `${DB}schema/embeddings` },
    },

    // ════════════════════════════ Hygiene ═══════════════════════════════════════════════════════
    {
      name: "not-to-test",
      comment:
        "Production code (packages/*/src) must not import the centralized tests/ tree or any test/spec file. Src holds no test files (they all live in tests/), so the rule is the TO half. (structure.md §5.)",
      severity: "error",
      from: { path: "^packages/[^/]+/src/" },
      to: { path: ["^tests/", TEST_FILES] },
    },
    {
      // Override the recommended-strict no-orphans (error): the placeholder scaffold tree is ALL orphans
      // (comment-only stubs with no imports/importers). knip is the dead-code authority (ENFORCEMENT
      // backlog, post-Phase-1); re-enable this as warn once the tree wires up.
      name: "no-orphans",
      comment:
        "Disabled until code wires up — the Phase-0 placeholder tree is all orphans; knip owns dead-code detection (reports/ENFORCEMENT.md backlog). Re-enable as warn post-Phase-1.",
      severity: "ignore",
      from: { orphan: true, pathNot: [] },
      to: {},
    },
  ],

  options: {
    // No `tsConfig` — VERIFIED unneeded (2026-06-26, three tests: cross-package relative resolution,
    // the type-only-vs-value discriminator, AND `#` subpath resolution all behave IDENTICALLY with and
    // without it). We have zero tsconfig `paths`, and enhancedResolveOptions + tsPreCompilationDeps below
    // do the real work. (Per the options reference, tsConfig only applies `paths` aliases.) The root
    // tsconfig.json exists for vitest's type lane + Stryker's typescript-checker (Phase 4), not this.
    //
    // REQUIRED for the `dependencyTypesNot: ["type-only"]` discriminator (client→server bridge, drivers'
    // param types, cross-feature/verb type shapes) — surfaces pre-compilation (type-only) edges.
    tsPreCompilationDeps: true,
    // depcruise derives which analyses (cycles/orphans/reachability) the ruleset needs — free speed.
    skipAnalysisNotInRules: true,
    enhancedResolveOptions: {
      // Extensionless ESM + the package.json `exports` map (cross-package `@orb/*` → ./src/*.ts).
      // (The `#` intra-package subpath imports resolve via the tsConfig the TS parser reads; dep-cruiser's
      // enhancedResolveOptions has no `importsFields` key.)
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    // TanStack Router codegen (client, Phase 6) — not ours to police.
    exclude: { path: "routeTree\\.gen\\.ts$" },
    // content strategy (not git-metadata) so caching works in CI checkouts without full history.
    cache: { strategy: "content" },
    reporterOptions: {
      dot: { collapsePattern: COLLAPSE },
      archi: { collapsePattern: COLLAPSE },
    },
  },
};
