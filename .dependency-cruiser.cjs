/**
 * dependency-cruiser — the import-graph backstop for the layer cake + the server tier order.
 *
 * The cake (kit ← contracts ← db ← server ← client) is PRIMARILY resolver-physics (a package can't
 * import an undeclared dep). dep-cruiser is the tier-3 backstop that (a) catches deep relative `../../`
 * escapes that dodge the package boundary, (b) distinguishes type-only edges (the client→server tRPC
 * AppRouter bridge, drivers' param types), and (c) enforces everything INSIDE @orb/server — the server
 * tier order + per-feature isolation — which the resolver cannot see (it's all one package).
 *
 * Scanned via `pnpm depcruise` = `node scripts/depcruise.mjs`, which cruises `packages`, `tooling`, and
 * every helper world root that exists (`HELPER_WORLD_DIRS` — tests/support/{iso,node,browser}). The scope
 * is DERIVED there, not spelled here, so a new helper world joins the cruise without a header edit; this
 * file's own tooling section (tooling-cli-via-index, tooling-shared-floor, tooling-no-provider-families,
 * the tooling/src/<tool>/ slot rules) is inside that reach. Cross-package `@orb/*` imports resolve through
 * the workspace into `packages/<pkg>/src/...`, so the path regexes below match resolved edges.
 * Authoritative rule sources: Core-0-Architecture-and-Structure.md (the cake, the server tier order, the
 * 8-slot feature template), the Tier-* docs under docs/architecture/core/, and AGENTS.md §6 (the domain
 * map). Each rule's own `comment` carries its citation.
 *
 * HOUSE STYLE (from neo, kept): generic-over-enumerated (one capture-group rule auto-covers future
 * features); `dependencyTypesNot: ["type-only"]` is the contract-vs-coupling discriminator (a type-only
 * import declares an injected dep's SHAPE, wired at a composition root — allowed; a value import is real
 * coupling — blocked); every rule carries a `comment` saying WHY (it's what surfaces on a violation).
 *
 * NOT here (enforced elsewhere, by shape): assets-single-writer / discovery-no-vector-write /
 * serde-core-single-mapper / ASSUMES(single-replica) presence — all method-call or comment shapes, so they
 * are structural gates under tooling/src/verify/gates/, not import edges; persistence-no-in-memory-state
 * (also a gate — the GritQL layer it used to be was retired in 64ab26501 and every plugin recreated as a
 * ts-morph gate); no-inline-types / exhaustive-dispatch (biome + gates); "runner/family never leave
 * providers" (compile-time + a gate). CLIENT LAYERING IS HERE, not deferred — 17 `client-*` rules carry
 * the client's own tier order, decided at the client-foundation wave (see the section note at the
 * client-lib-floor rule). `no-orphans` is ACTIVE at `severity: "warn"` (re-enabled 2026-07-13 when its own
 * stated trigger arrived); knip remains the full dead-code/dead-export authority.
 *
 * CYCLES — THIS FILE IS THE AUTHORITY OF RECORD, AND IT IS NOT THE ONLY GATE (#1332). `no-circular` comes
 * from the `recommended-strict` preset (which is why the word "circular" appears in no rule below), and an
 * exemption is granted HERE because this is the only one of the three with a rule-level `pathNot` seam.
 * knip has already deferred in writing (`knip.ts`, `cycles: "warn"` — the report twin). biome's
 * `suspicious/noImportCycles` is "error" repo-wide with NO per-rule seam, and its SCOPE IS WIDER than this
 * file's: `pnpm depcruise` runs `depcruise packages tooling`, so biome is the only cycle gate over `tests/`,
 * `scripts/` and `playwright/`. Layered enforcement is doctrine (constitution §2), so three gates on one true
 * invariant is intended — do not turn one off to de-duplicate. biome carries no comment of its own beside
 * either rule because it CANNOT: measured 2026-09-19 with `biome rage --linter` in both directions, a `//`
 * line in `biome.json` makes biome 2.5.1 silently skip the file and load an ancestor config with no parse
 * error and exit 0 (`json.parser.allowComments` governs the .json files biome LINTS, not its own loader).
 * The declared-dependency question has the same shape and is already answered below at `no-duplicate-dep-types`:
 * biome's `noUndeclaredDependencies` and knip's `unlisted` answer it with INDEPENDENT allowlists — knip
 * carries `ignoreDependencies`, biome carries none — which is recorded so it is not rediscovered, and needs
 * no change while nothing can fire.
 *
 * FEATURES USED beyond the forbidden-list: `reachable` (the transitive credential firewall),
 * `dependencyTypesNot:["type-only"]` (the contract-vs-coupling discriminator), `tsPreCompilationDeps`
 * (so type-only edges exist to discriminate), `skipAnalysisNotInRules` (speed),
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

const { TEST_KIND_SUFFIXES } = require("./tooling/src/_shared/test-kinds.ts");

const KIT = "^packages/kit/src/";
const CONTRACTS = "^packages/contracts/src/";
const DB = "^packages/db/src/";
const CLIENT = "^packages/client/src/";
const UI = "^packages/ui/src/";
const SRV = "^packages/server/src/";
const CLIENT_TRPC = `${CLIENT}data/trpc\\.ts$`;
const SERVER_ROOT = `${SRV}index\\.ts$`;
const SHOWCASE = "^packages/showcase-plugins/";
const INFERENCE = "^packages/inference/src/";
const DEFAULT_CONTENT = "^packages/default-content/";
const TEST_FILES = `(?:${TEST_KIND_SUFFIXES.map((suffix) => suffix.replaceAll(".", "\\.")).join("|")})$`;
const CLIENT_CSS_ENTRY = `${CLIENT}styles/index\\.ts$`;
const CLIENT_SHELL_CSS = `${CLIENT}features/app-shell/surfaces/shell\\.css$`;

/** Domain fixed-slot subdirs (the uniform 8-slot template, Core-0-Architecture-and-Structure.md §4). Anything ELSE under a
 *  feature dir is a named SUBSYSTEM (engine/ assembly/ memory/ themes/ …) — substrate-mediated. */
const FIXED_SLOTS = "(contract|verbs|persistence|substrate)";

// The graph-reporter collapse pattern (one tier/package per node). Hoisted + suppressed once: biome's
// noSecrets false-positives on the high-entropy regex alternation.
const COLLAPSE = "^packages/(server/src/[^/]+|client/src/[^/]+|kit|contracts|db)";

module.exports = {
  extends: "dependency-cruiser/configs/recommended-strict",

  forbidden: [
    {
      name: "test-helper-world-direction",
      comment:
        "Node helpers cannot import browser helpers; isomorphic helpers cannot import either. Type-only edges also carry compiler dependencies, so they obey the same direction.",
      severity: "error",
      from: { path: "^tests/support/(iso|node)/" },
      to: { path: "^tests/support/(node|browser)/", pathNot: "^tests/support/$1/", reachable: true },
    },
    // ════════════════════════ The package cake (backstop to the resolver) ════════════════════════
    {
      name: "kit-purity",
      comment:
        "@orb/kit is the isomorphic leaf: pure primitives + engines. It MAY use isomorphic npm (zod, typeid-js, luxon, remend) but NOT any higher package — and NOT Node built-ins (the kit-no-node-builtins rule below). Node-only-pure code goes to @orb/server/kit (e.g. the node:vm regex guard). (DECISIONS-LEDGER §0.6 — the kit-purity ruling: 'zero runtime deps' = zero domain/I-O/Node deps, not zero npm.)",
      severity: "error",
      from: { path: KIT },
      // NOTE: conditions WITHIN a single `to` are AND'd by dep-cruiser, so node:* (a separate concern)
      // gets its OWN rule below — combining `path` + `dependencyTypes:["core"]` here would match nothing.
      to: { path: [CONTRACTS, DB, INFERENCE, "^packages/server/", CLIENT] },
    },
    {
      name: "kit-no-node-builtins",
      comment:
        "@orb/kit must not import node:* — it is browser-safe (isomorphic). The node:vm ReDoS guard and any other Node-only-pure helper live in @orb/server/kit, not here. (Core-Shared-Dissolution.md §0; per-symbol map: history/Shared-Drawer-Dissolution-Map.md §2.)",
      severity: "error",
      from: { path: KIT },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "contracts-cake",
      comment:
        "@orb/contracts (the wire: cross-boundary types + zod) deps only @orb/kit. It must never import @orb/db, @orb/inference, @orb/server, or @orb/client. (Core-0-Architecture-and-Structure.md §2 cake.)",
      severity: "error",
      from: { path: CONTRACTS },
      to: { path: [DB, INFERENCE, "^packages/server/", CLIENT] },
    },
    {
      name: "bus-contract-no-credentials",
      comment:
        "D16 bus-payload firewall: a bus-event contract module (chat/user-bus/notifications/events/world-info/rpg/automation/workloads — the room-public / per-user / durable-inbox streams) must NEVER import @orb/contracts/credentials, the ONLY home of the secret-bearing shapes (ResolvedCredential, apiKey, baseUrl, headers). This is the resolve-time (tier-1) arm of the allowlist — even a TYPE import of a credential shape into a bus module is forbidden, so a producer can't structurally place a secret onto the wire. The SAFE `CredentialSource` enum reaches chat via #connection's verbatim re-export (routing's source axis), which is NOT this module — that path stays legal. THE SCOPE IS EVERY LIVE WIRE-EVENT UNION, not the original four (#1030 F4): world-info (WiBusEvent, embedded in ChatBusEvent), rpg (RpgBusEvent — the room stream), automation (AutomationBusEvent) and workloads (WorkloadEvent) were outside this arm while carrying real fan-out, so for the rpg room stream NEITHER D16 arm applied. Paired with the `bus-payload-allowlist` ts-morph gate (field-name arm). (Core-Laws-and-Precedents.md D16; client-architecture-lockdown.md §13.)",
      severity: "error",
      from: { path: `${CONTRACTS}(chat|user-bus|notifications|events|world-info|rpg|automation|workloads)/` },
      to: { path: `${CONTRACTS}credentials/` },
    },
    {
      name: "db-cake",
      comment:
        "@orb/db (drizzle schema + libSQL) deps only kit + contracts. A db→inference, db→server or db→client import is impossible by the cake; the OTel wrapper is INJECTED into createDb, never imported. (Tier-1-DB.md.)",
      severity: "error",
      from: { path: DB },
      to: { path: [INFERENCE, "^packages/server/", CLIENT] },
    },
    {
      name: "inference-cake",
      comment:
        "@orb/inference is the provider RUNTIME (executor · one backend per wire · funnel · capability synthesis — docs/design/orbweaver-inference-package.md §3.1): kit ← contracts ← db ← inference ← server. It may reach @orb/kit + @orb/contracts and the provider SDKs; NEVER @orb/db (snapshot/connection/binding persistence are PORTS the server wires), @orb/server, @orb/client or @orb/ui. The package.json dependency list is the resolve-time physics; this is the tier-3 backstop that names the direction.",
      severity: "error",
      from: { path: INFERENCE },
      to: { path: [DB, "^packages/server/", CLIENT, UI] },
    },
    {
      name: "browser-no-inference",
      comment:
        "The browser packages must never import @orb/inference: it is NODE-ONLY (the agent-sdk subprocess, the ONNX runtime, undici-guarded fetch) and the client renders the picker from the ISOMORPHIC vocabulary in @orb/contracts/inference instead.",
      severity: "error",
      from: { path: [CLIENT, UI] },
      to: { path: INFERENCE },
    },
    {
      name: "default-content-cake",
      comment:
        "@orb/default-content is CONTENT plus its reader (D160 — the avatar PNGs + demo-chat transcripts, the family @orb/showcase-plugins was the first half of). It sits BELOW `server` in the cake because the server's seeders consume it AT RUNTIME, so it may reach only @orb/kit (the CharacterHandle brand) — never @orb/contracts, @orb/db, @orb/server, @orb/client or @orb/ui. The package.json dependency list is the resolve-time physics; this is the tier-3 backstop that names the direction.",
      severity: "error",
      from: { path: DEFAULT_CONTENT },
      to: { path: [CONTRACTS, DB, "^packages/server/", CLIENT, UI] },
    },
    {
      name: "browser-no-default-content",
      comment:
        "The browser packages must never import @orb/default-content: it is a NODE reader (it reads shipped files off disk with node:fs) and its bytes reach the client only as stored assets through the assets/chat verbs. (D160.)",
      severity: "error",
      from: { path: [CLIENT, UI] },
      to: { path: DEFAULT_CONTENT },
    },
    {
      name: "showcase-plugins-cake",
      comment:
        "@orb/showcase-plugins is CONTENT plus its packer (#1692, the #1238 §2 house shape). It sits BELOW `server` in the cake because the server's seeder consumes it AT RUNTIME, so it may reach only @orb/kit + @orb/contracts (the bundle-entry vocabulary + the manifest schema the install funnel judges by) — never @orb/db, @orb/server, @orb/client or @orb/ui. The package.json dependency list is the resolve-time physics; this is the tier-3 backstop that names the direction.",
      severity: "error",
      from: { path: SHOWCASE },
      to: { path: [DB, "^packages/server/", CLIENT, UI] },
    },
    {
      name: "browser-no-showcase-plugins",
      comment:
        "The browser packages must never import @orb/showcase-plugins: it is a NODE reader (it reads bundle directories off disk with node:fs) and its content is GUEST code for the QuickJS sandbox, delivered to the client only as installed-plugin bytes through the plugin verbs. (#1692.)",
      severity: "error",
      from: { path: [CLIENT, UI] },
      to: { path: SHOWCASE },
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
        "The browser bundle must never pull @orb/server or @orb/db RUNTIME code. The one server-owned tRPC contract crosses as a type-only edge governed separately by client-backend-types-only-through-trpc and client-trpc-type-target. (Core-0-Architecture-and-Structure.md §2.)",
      severity: "error",
      from: { path: CLIENT },
      to: { path: ["^packages/server/", DB], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "client-backend-types-only-through-trpc",
      comment:
        "Client code may reach backend-owned types only through data/trpc.ts, the single owner of the server-derived AppRouter client seam. An arbitrary server or DB type import expands that intentional compiler dependency. (#1890.)",
      severity: "error",
      from: { path: CLIENT, pathNot: CLIENT_TRPC },
      to: { path: ["^packages/server/", DB], dependencyTypes: ["type-only"] },
    },
    {
      name: "client-trpc-type-target",
      comment:
        "Client data/trpc.ts may import only the type-only @orb/server root, whose public surface is AppRouter. It may not reach server internals or DB types; dependency-cruiser constrains resolved paths and edge kinds, while TypeScript constrains the imported name through the root's type-only export. (#1890.)",
      severity: "error",
      from: { path: CLIENT_TRPC },
      to: { path: ["^packages/server/", DB], pathNot: SERVER_ROOT, dependencyTypes: ["type-only"] },
    },
    {
      name: "client-feature-front-door",
      comment:
        "Enter a client feature through its PUBLIC API (features/<name>/index.ts), not its internals — so a feature can refactor freely (UI-Arch §2.1). Callers outside features/ (routes/data/forms/lib/main) import the index only; the front-door mirror of the server's domain-feature-front-door. The exact styles/index.ts → app-shell/surfaces/shell.css stylesheet edge is governed together with client-css-front-door-shell-only because client-architecture-lockdown.md §4.5 mandates that source order.",
      severity: "error",
      from: { path: CLIENT, pathNot: [`${CLIENT}features/`, CLIENT_CSS_ENTRY] },
      to: {
        path: `${CLIENT}features/[^/]+/.+`,
        pathNot: `${CLIENT}features/[^/]+/index\\.ts$`,
      },
    },
    {
      name: "client-css-front-door-shell-only",
      comment:
        "The second half of the relational CSS-front-door exception: modules under client/styles may not import feature internals other than app-shell/surfaces/shell.css. Combined with client-feature-front-door (which exempts only styles/index.ts as a source), client-architecture-lockdown.md §4.5's exact styles/index.ts → shell.css edge is legal while every other source/target pairing remains forbidden (#959).",
      severity: "error",
      from: { path: `${CLIENT}styles/` },
      to: {
        path: `${CLIENT}features/[^/]+/.+`,
        pathNot: CLIENT_SHELL_CSS,
        dependencyTypes: ["import"],
      },
    },
    {
      name: "client-features-no-cross",
      comment:
        "Client features stay independent: a module in features/<a>/ must not import another feature's internals at RUNTIME. There is NO features/_shared drawer (dissolved — generics → @orb/ui, the form toolkit → forms/). TYPE-ONLY imports across features ARE allowed (a shape wired at the composition root). What replaces the import is CHANNEL-SPECIFIC — the blanket 'cross-feature reads → trpc.*' is WRONG for client-ephemeral state (there is no row to fetch): the eleven-row decision table is client-architecture-lockdown.md §12 (server-persisted entity → cache-first trpc; ephemeral pointer/selection → the #state commons; EXTENDING a host surface → a contributor registry assembled at the door).",
      severity: "error",
      from: { path: `${CLIENT}features/([^/]+)/` },
      to: {
        path: `${CLIENT}features/([^/]+)/`,
        pathNot: `${CLIENT}features/$1/`,
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "confirm-uses-composite",
      comment:
        "ConfirmDialog (client-shared, tier-2 components/) is the ONLY feature-tier confirm — a features/** module must not reach past it for the raw alert-dialog primitive (client-architecture-lockdown.md §14/§16 G7).",
      severity: "error",
      from: { path: `${CLIENT}features/` },
      to: { path: "^packages/ui/src/primitives/alert-dialog/" },
    },
    {
      name: "view-transition-fence",
      comment:
        "withViewTransition is fenced to state/shell-store.ts — a #state content swap through view-transition outside that one sanctioned file is a defect (view-transition.ts header, UI-Arch §4a, #1830). motionIsReduced reaches features through the lib barrel; the direct import of the module is shell-store's privilege. The barrel (lib/index.ts) re-exports motionIsReduced only; withViewTransition is deliberately absent from it.",
      severity: "error",
      from: {
        path: CLIENT,
        pathNot: [`${CLIENT}lib/index\\.ts$`, `${CLIENT}lib/view-transition\\.ts$`, `${CLIENT}state/shell-store\\.ts$`],
      },
      to: { path: `${CLIENT}lib/view-transition\\.ts$` },
    },

    // ════════════════════ @orb/ui — the frontend cake leaf (D42; ui-package-design.md §8) ═══════════
    {
      name: "ui-cake",
      comment:
        "@orb/ui is DOMAIN-AGNOSTIC (D42): kit ← ui ← client. It may import @orb/kit + its sealed satellites, NEVER @orb/contracts / @orb/db / @orb/server / @orb/client — a ui component that needs a domain shape takes ui-local STRUCTURAL props instead (ui-package-design.md §1). Primary enforcement is the resolver (those packages are not in ui's package.json); this is the deep-relative-escape backstop.",
      severity: "error",
      from: { path: UI },
      to: { path: [CONTRACTS, DB, "^packages/server/", CLIENT] },
    },
    {
      name: "ui-no-node-builtins",
      comment:
        "@orb/ui is browser code — no node:* imports (same posture as kit; the tokens.build.ts codegen script lives at the package ROOT, outside src/, precisely so src/ stays browser-pure).",
      severity: "error",
      from: { path: UI },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "ui-satellite-seals",
      comment:
        "Each satellite lib is sealed behind ONE @orb/ui group (D52/D54; UI-Gates §11.3): echarts→charts/ · react-virtual→primitives/{virtual-list,message-list,media-grid}/ · codemirror→code-editor/ · streamdown/remark/shiki→markdown/ · cmdk→primitives/command/ · @dnd-kit→primitives/sortable/ · diff→diff/ · lucide→primitives/icons/ · minisearch→{primitives/macro-textarea/, fuzzy-search/} (the macro autocomplete seal + the generic browse-search hook — ONE lib, TWO sanctioned homes). Importing a sealed lib from any OTHER ui module is a seal breach.",
      severity: "error",
      from: {
        path: UI,
        pathNot: [
          `${UI}charts/`,
          `${UI}primitives/(virtual-list|message-list|media-grid)/`,
          `${UI}code-editor/`,
          `${UI}markdown/`,
          `${UI}primitives/command/`,
          `${UI}primitives/sortable/`,
          `${UI}diff/`,
          `${UI}primitives/icons/`,
          `${UI}primitives/macro-textarea/`,
          `${UI}fuzzy-search/`,
        ],
      },
      to: {
        path: "node_modules/(echarts|echarts-for-react|@tanstack/react-virtual|@tanstack/virtual-core|codemirror|@codemirror|streamdown|remark|strip-markdown|cmdk|@dnd-kit|diff|lucide-react|minisearch|shiki|@shikijs)/",
      },
    },
    {
      name: "ui-class-merge-seal",
      comment:
        "tailwind-merge is sealed to packages/ui/src/lib/class-merge.ts — the ONE module that configures it and the ONE home of `cn` + `tv`. A second construction site is a second config, and a merger built without the governed token groups silently drops custom-token classes (2026-08-02 root-fix; #949 compiler-parity + merge-receipt arm).",
      severity: "error",
      from: {
        path: UI,
        pathNot: `${UI}lib/class-merge\\.ts$`,
      },
      to: { path: "node_modules/tailwind-merge/" },
    },
    {
      name: "ui-tailwind-variants-runtime-seal",
      comment:
        "tailwind-variants runtime construction is sealed to packages/ui/src/lib/class-merge.ts, where createTV disables its internal merge and Orb performs exactly one configured final merge. Type-only VariantProps imports remain legal; any second runtime factory can bypass Orb's governed groups and __orb.css receipt (#949).",
      severity: "error",
      from: {
        path: UI,
        pathNot: `${UI}lib/class-merge\\.ts$`,
      },
      to: {
        path: "node_modules/tailwind-variants/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "search-minisearch-seal",
      comment:
        "minisearch (server side) is sealed to domain/search/substrate/field-index.ts — the ONE lexical BM25 engine home (PD-37). Any other server module importing it is a seal breach; the vector verbs scan the DB, not minisearch.",
      severity: "error",
      from: {
        path: "^packages/server/",
        pathNot: "^packages/server/src/domain/search/substrate/field-index\\.ts$",
      },
      to: { path: "node_modules/minisearch/" },
    },
    // NOTE (deliberate non-rule): "client ⇏ raw satellite libs" is RESOLVER physics (the libs are not
    // in @orb/client's package.json → the import cannot resolve under pnpm isolation) + biome
    // noUndeclaredDependencies. A dep-cruiser twin here would be unfireable-by-construction (its own
    // pin test could never make it fire), so it is intentionally absent. (ui-package-design.md §8.)

    // ════════════════════ The @orb/ui INTERNAL cake (groups → primitives → lib/tokens) ═════════════
    {
      name: "ui-lib-tokens-floor",
      comment:
        "lib/ + tokens/ are @orb/ui's floor — read DOWN-into by every group, reaching UP to none. A lib/tokens module importing primitives/ or a group dir inverts the package's own cake. (UI-Arch §2; the ui mirror of foundation-reaches-up-to-nothing.)",
      severity: "error",
      from: { path: `${UI}(lib|tokens)/` },
      to: {
        path: `${UI}(primitives|layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/`,
      },
    },
    {
      name: "ui-primitives-below-groups",
      comment:
        "primitives/ sit BELOW the composed groups (layout/charts/markdown/stream/content/code-editor/diff): a primitive may import lib/tokens + sibling primitives (relative-path variant composition, §13.7), never a group dir. Groups compose primitives; primitives never know a group exists. (UI-Arch §2.)",
      severity: "error",
      from: { path: `${UI}primitives/` },
      to: { path: `${UI}(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/` },
    },
    {
      name: "ui-groups-independent",
      comment:
        "The composed groups (layout/charts/markdown/stream/content/code-editor/diff) stay independent — no group imports another group's internals. Shared needs live in primitives/ or lib/ (push it DOWN, never sideways) — the ui mirror of domain-no-cross-feature. Type-only exempt (a shape at a composition seam).",
      severity: "error",
      from: { path: `${UI}(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/` },
      to: {
        path: `${UI}(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/`,
        pathNot: `${UI}$1/`,
        dependencyTypesNot: ["type-only"],
      },
    },

    // ═══════════ The @orb/client INTERNAL cake (main → routes → features → forms/data → state → lib) ═══════════
    // The client's own tier order (UI-Arch §2.1, decided at the client-foundation wave — supersedes
    // this header's old "client layering deferred" note): lib/ is the floor; state/ holds the gated
    // stores; data/ (Query+tRPC) may reach state (the bus reducer drives the stream store) + lib;
    // forms/ may reach state (draft mirrors) + lib but NOT data (a form factory takes `save` INJECTED
    // — binding a mutation is the feature's composition job); features compose everything below;
    // routes compose features; main.tsx (with index.ts) is the composition root nothing imports.
    {
      name: "client-lib-floor",
      comment:
        "client lib/ is the floor — the cross-cutting seams (time/notify/test-ids/VT) reach UP to nothing inside the client. (UI-Arch §2.1; the client mirror of foundation-reaches-up-to-nothing.)",
      severity: "error",
      from: { path: `${CLIENT}lib/` },
      to: { path: `${CLIENT}(state|data|forms|features|routes)/` },
    },
    {
      name: "client-state-below-data",
      comment:
        "client state/ (the gated Zustand stores) sits below data/forms/features/routes — a store never reads the Query layer, a form, or a surface. Server state NEVER lives in a store (§5); anything a store needs arrives as a plain value through its action params.",
      severity: "error",
      from: { path: `${CLIENT}state/` },
      to: { path: `${CLIENT}(data|forms|features|routes)/` },
    },
    {
      name: "client-data-direction",
      comment:
        "client data/ (Query + tRPC + the bus + the factories) may reach state/ (the bus reducer drives the stream store) + lib/, never forms/features/routes — the data layer serves surfaces, it doesn't know them.",
      severity: "error",
      from: { path: `${CLIENT}data/` },
      to: { path: `${CLIENT}(forms|features|routes)/` },
    },
    {
      name: "client-forms-direction",
      comment:
        "client forms/ (the editor factories + bound fields) may reach state/ (draft mirrors) + lib/, never data/features/routes. A factory takes `save` INJECTED — the feature binds the mutation at composition; a forms→data import would hard-couple every editor to the Query layer. Type-only exempt.",
      severity: "error",
      from: { path: `${CLIENT}forms/` },
      to: { path: `${CLIENT}(data|features|routes)/`, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "client-features-below-routes",
      comment:
        "client features/ sit below routes/ + the entry files — a feature never imports a route module or main.tsx (routes compose features, never the reverse).",
      severity: "error",
      from: { path: `${CLIENT}features/` },
      to: { path: [`${CLIENT}routes/`, `${CLIENT}main\\.tsx$`] },
    },
    {
      name: "client-nothing-imports-main",
      comment: "main.tsx is the composition root — the top of the client cake; nothing imports it (the mirror of 'nothing imports entry/').",
      severity: "error",
      from: { path: CLIENT, pathNot: `${CLIENT}main\\.tsx$` },
      to: { path: `${CLIENT}main\\.tsx$` },
    },
    {
      name: "client-composition-tier-door-only",
      comment:
        "The composition-tier DIRECTORY MODULES (client/src/agent-handles/, agent-nav/, agent-plugin/, agent-rpg/, agent-seed/) are main.tsx's OWN glue: dev-only bridge implementations that must compose feature FRONT DOORS plus #state module actions — a privilege no tier below the door has (the lib/ floor that homes agent-bridge.ts may not import #state/#features/#data, which is why the impls live here and not there). Only main.tsx imports them — the client-nothing-imports-main mirror. Without this wall a feature could reach another feature's front door THROUGH one of them (features/x → agent-nav → features/chat) with every individual hop passing client-feature-front-door AND client-features-no-cross. A sibling composition-tier module may compose another (they are all door glue); nothing else may — which is how `agent-handles/` legally assembles the other three behind main.tsx's DEV-only dynamic import (#433). (client-architecture-lockdown.md §3/§7.)",
      severity: "error",
      from: { path: CLIENT, pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}(agent-handles|agent-nav|agent-plugin|agent-rpg|agent-seed)/`] },
      to: { path: `${CLIENT}(agent-handles|agent-nav|agent-plugin|agent-rpg|agent-seed)/` },
    },
    {
      name: "client-compose-door-only",
      comment:
        "client/src/compose/ is the DOOR'S OWN half, not a tier: it holds every registry assembly (the `registry-assembly-at-door-only` gate names main.tsx OR a compose/ module as the two legal call sites) and therefore imports every feature front door — the whole app. Since the #43 boot code-split it is reached through routes/router.tsx's lazy `/` boundary, which is what keeps the 3.4 MB feature graph out of the boot chunk an unauthenticated visitor downloads. Exactly three importers: main.tsx (the boot half), routes/router.tsx (the lazy boundary), and a compose/ sibling. Without this wall a feature could reach another feature's front door THROUGH the assembly module (features/x -> compose/authed-app -> features/chat) with every individual hop passing client-feature-front-door AND client-features-no-cross — the same backdoor client-composition-tier-door-only closes for agent-nav/agent-seed. (client-architecture-lockdown.md §5/§7.)",
      severity: "error",
      from: { path: CLIENT, pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}routes/router\\.tsx$`, `${CLIENT}compose/`] },
      to: { path: `${CLIENT}compose/` },
    },
    {
      name: "client-components-tier",
      comment:
        "components/ (tier 2, domain-aware cross-feature composites) never imports UP into features/routes/main.tsx — a composite is consumed BY features, it never depends on one (client-architecture-lockdown.md §3/§16 G5).",
      severity: "error",
      from: { path: `${CLIENT}components/` },
      to: { path: [`${CLIENT}features/`, `${CLIENT}routes/`, `${CLIENT}main\\.tsx$`] },
    },
    {
      name: "client-lib-below-components",
      comment:
        "lib/ (tier 4, the util floor) sits BELOW components/ (tier 2) — the reuse ladder's tier order, not just the existing client-lib-floor edges (client-architecture-lockdown.md §3/§16 G5).",
      severity: "error",
      from: { path: `${CLIENT}lib/` },
      to: { path: `${CLIENT}components/` },
    },
    {
      name: "client-state-below-components",
      comment:
        "state/ (tier 3, the gated stores) sits below components/ (tier 2) — a store never reads a cross-feature composite (client-architecture-lockdown.md §3/§16 G5).",
      severity: "error",
      from: { path: `${CLIENT}state/` },
      to: { path: `${CLIENT}components/` },
    },

    // ════════════════════ The server tier order (entry>transport>domain>infra>foundation>kit) ═══════
    {
      name: "foundation-reaches-up-to-nothing",
      comment:
        "foundation (env · config · observability) is read DOWN by every tier and reaches UP to none. No foundation→entry/transport/domain/infra import. It MAY import @orb/db (the /_debug probes read schema down — db is a lower package) + @orb/contracts + @orb/kit + server/kit. The killed DEFAULT_*_MODEL_ID foundation→infra edge is the canary. (Tier-2-Foundation.md invariant #2.)",
      severity: "error",
      from: { path: `${SRV}foundation/` },
      to: { path: `${SRV}(entry|transport|domain|infra)/` },
    },
    {
      name: "infra-below-domain",
      comment:
        "infra is a sealed I/O executor BELOW domain. A providers/auth/crypto/network/storage/image adapter must not import a domain, the transport drivers, or entry — the db-dependent steps a domain needs are INJECTED in, never imported. (Tier-3-Infra.md sealed-executor invariant.)",
      severity: "error",
      from: { path: `${SRV}infra/` },
      to: { path: `${SRV}(entry|transport|domain)/` },
    },
    {
      name: "infra-no-db",
      comment:
        "infra is db-free physics: NO @orb/db import. The proof case is oidc-store.ts — because it imports @orb/db it CANNOT live in sealed infra (it moved to domain/sessions/persistence). Storage/crypto/network/auth all stay db-free; the db steps arrive via injected ResolveDeps. (Tier-3-Infra.md invariant #1; Tier-1-DB.md: infra does not read the schema.)",
      severity: "error",
      from: { path: `${SRV}infra/` },
      to: { path: DB },
    },
    {
      name: "domain-below-drivers",
      comment:
        "domain (business logic) is below the drivers + entry. A domain must not import transport/ or entry/ — drivers call DOWN into domain front doors, never the reverse. (Core-0-Architecture-and-Structure.md §3.)",
      severity: "error",
      from: { path: `${SRV}domain/` },
      to: { path: `${SRV}(entry|transport)/` },
    },
    {
      name: "transport-below-entry",
      comment:
        "transport (the tRPC + jobs drivers) is below entry (the composition root). A driver must not import entry/. (Core-0-Architecture-and-Structure.md §3.)",
      severity: "error",
      from: { path: `${SRV}transport/` },
      to: { path: `${SRV}entry/` },
    },
    {
      name: "drivers-through-domain",
      comment:
        "Drivers stay THIN: tRPC routers + job workers reach the database and infra adapters THROUGH a domain front door at RUNTIME, never directly. Type-only imports ARE allowed (a driver may declare `db: Db` as a param type — a contract, not coupling). EXEMPT: transport/rate-limit.ts — the DB-backed limiter primitive legitimately imports the @orb/db PACKAGE (a cake dep below server; instances are constructed at entry/). (Tier-4-Transport.md: routers import no @orb/db/infra; the limiter is the one exception.)",
      severity: "error",
      from: { path: `${SRV}transport/`, pathNot: `${SRV}transport/rate-limit\\.ts$` },
      to: { path: [DB, `${SRV}infra/`], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-cross-driver",
      comment:
        "transport/trpc and transport/jobs are independent drivers — neither imports the other. Shared work lives in the domain layer they both call down into. (Tier-4-Transport.md.)",
      severity: "error",
      from: { path: `${SRV}transport/(trpc|jobs)/` },
      to: { path: `${SRV}transport/(trpc|jobs)/`, pathNot: `${SRV}transport/$1/` },
    },
    {
      name: "server-kit-reaches-up-to-nothing",
      comment:
        "@orb/server/kit is the server-only-pure bottom tier (node-only-pure: post-process, serde, content-hash, the node:vm regex guard). It may use node:* + @orb/db + @orb/contracts + @orb/kit (all at/below it), but must reach UP to nothing in server — no entry/transport/domain/infra import. (history/Shared-Drawer-Dissolution-Map.md §2 — the per-symbol map; the surviving law is Core-Shared-Dissolution.md.)",
      severity: "error",
      from: { path: `${SRV}kit/` },
      to: { path: `${SRV}(entry|transport|domain|infra|foundation)/` },
    },

    // ════════════════════════════ Domain feature isolation ═══════════════════════════════════════
    {
      name: "domain-no-cross-feature",
      comment:
        "Domain features stay independent: a module in domain/<a>/ must not import another feature's internals at RUNTIME. There is NO domain/_shared in orbweaver (principle #3) — cross-feature primitives are @orb/kit, cross-feature services are their own feature. TYPE-ONLY imports across features ARE allowed (a verb declaring the SHAPE of an injected cross-feature op — wired at the composition root). (Core-0-Architecture-and-Structure.md §4; AGENTS.md §6 domain map.)",
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
        "Enter a domain feature through its PUBLIC API (domain/<feature>/index.ts), not its internals — so a feature can refactor freely. Callers above (transport, entry) import the index only. (Core-0-Architecture-and-Structure.md §4; the one sanctioned barrel.)",
      severity: "error",
      from: { pathNot: `${SRV}domain/` },
      to: {
        path: `${SRV}domain/[^/]+/.+`,
        pathNot: `${SRV}domain/[^/]+/index\\.ts$`,
      },
    },
    {
      name: "domain-sibling-front-door",
      comment:
        "A domain reaching a SIBLING domain enters through its PUBLIC API (domain/<sibling>/index.ts) — NEVER a deep import of the sibling's internals (../../embeddings/contract/service). The front door re-exports every legal cross-feature shape, so a deep path buys nothing and breaks silently on the sibling's internal renames. Distinct from domain-feature-front-door (which fires only for callers OUTSIDE domain/); this is the sibling arm. Crucially NO type-only exemption — domain-no-cross-feature already exempts type-only, so a type-only deep import (the injected-op SHAPE) would otherwise bypass the front door ungated. The one-directional-flow front-door law is a SHAPE rule, not a value-vs-type rule: even an injected-op type crosses via the door. Intra-module relative imports (a verb reaching its own contract/) stay legal via the $1 self-match. (Core-0-Architecture-and-Structure.md §4; audit F9.)",
      severity: "error",
      from: { path: `${SRV}domain/([^/]+)/` },
      to: {
        path: `${SRV}domain/([^/]+)/.+`,
        pathNot: [`${SRV}domain/$1/`, `${SRV}domain/[^/]+/index\\.ts$`],
      },
    },
    {
      name: "domain-no-cross-verb",
      comment:
        "GENERIC verb isolation (every feature with a verbs/ dir). A verb file must not import another verb file's VALUE — verb-to-verb deps are wired EXPLICITLY at service.ts via factory injection (createSend(ctx, { runCompaction })). Type-only imports between verbs ARE allowed (declare an injected dep's typed shape). Group barrels (verbs/<group>/index.ts) are the composition point — exempt both sides. (Core-0-Architecture-and-Structure.md §4; verb-naming gate is its sibling.)",
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
        "GENERIC substrate-below-verbs. Any non-verbs subdir of a feature (substrate/ persistence/ + named subsystems) sits BELOW the verbs that consume it and must not import them. persistence is called BY verbs, a subsystem is dispatched BY a verb — never the reverse. Feature-root files (service/context/index) are out of scope (not in a subdir). (Core-0-Architecture-and-Structure.md §4.)",
      severity: "error",
      from: { path: `${SRV}domain/([^/]+)/(?!verbs/)[^/]+/` },
      to: { path: `${SRV}domain/$1/verbs/`, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "domain-substrate-mediates-subsystems",
      comment:
        "A feature's verbs + root files reach a NAMED SUBSYSTEM (any subdir that is NOT a fixed slot: contract/verbs/persistence/substrate) ONLY through substrate/. A verb importing ./memory/generate directly bypasses the DI seam, making the dep invisible at the composition root + the subsystem refactor-unsafe. Generic because orbweaver's template is uniform (the fixed-slot set is global — no per-feature map). Type-only exempt (declare an injected shape). service.ts/index.ts/context.ts (composition surfaces) are exempt FROM — and so is workload-contributions.ts, the ratified cross-domain root slot that is itself a composition surface (a compose-built factory over the domain's own ops; the workloads junk-drawer exit). (Core-0-Architecture-and-Structure.md §4; the orbweaver-clean form of neo's substrate-only-subsystem-access.)",
      severity: "error",
      from: {
        path: `${SRV}domain/([^/]+)/(verbs/)?[^/]+\\.ts$`,
        pathNot: `${SRV}domain/[^/]+/(service|index|context|workload-contributions)\\.ts$`,
      },
      to: {
        path: `${SRV}domain/([^/]+)/[^/]+/`,
        pathNot: [`${SRV}domain/$1/${FIXED_SLOTS}/`],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "domain-teaching-contribution-compose-only",
      comment:
        "The ratified `teaching-contribution.ts` root slot (the S2 model-teaching seam) is a COMPOSITION SURFACE: a domain's teaching contributions reach the turn ONLY by being registered onto `ChatContext.teaching` at entry/compose, never by a verb (or anything else) importing the factory and calling it inline. So the ONLY legal importer is the owning domain's own front door (index.ts), which is what entry/compose imports through — every other reader, in this domain or any other, would be bypassing the injected registry and re-creating the hard-wired call site the seam exists to delete. Not type-only-exempt: the factory is a VALUE and its shapes live in chat's contract/, so nobody needs a type from this file. (interaction-direction-spec §3-S2; the workload-contributions.ts precedent, D117.)",
      severity: "error",
      from: { pathNot: `${SRV}domain/[^/]+/index\\.ts$` },
      to: { path: `${SRV}domain/[^/]+/teaching-contribution\\.ts$` },
    },
    {
      name: "domain-no-cross-subsystem",
      comment:
        "A feature's named subsystems stay independent: a file in subsystem A can't import subsystem B (same feature, different non-fixed-slot subdir). Cross-subsystem coordination goes through substrate/ (the DI seam) — exempt both sides, along with the fixed slots (substrate split across files, not subsystems). (Core-0-Architecture-and-Structure.md §4.)",
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

    // ══════════════════ @orb/inference — the sealed provider executor (was infra/providers) ══════════
    // ALL FOUR STANZAS BELOW WERE RE-POINTED 2026-09-20 (the `@orb/inference` extraction, #2 of
    // docs/design/orbweaver-inference-package.md): the provider runtime moved WHOLE out of
    // `packages/server/src/infra/providers/` into `packages/inference/src/`, and every one of these rules
    // was still aimed at the deleted tree — a `pathNot` exemption over an empty set is an over-grant nobody
    // can see, which `depcruise-grant-liveness` is what caught. The program's own §12 names the successor
    // posture verbatim: "Resolve-time: package boundary; BackendKey, backends, credentials never leave
    // index.ts; dep-cruiser backstop" — so these are the BACKSTOP half, the `ui-cake`/`packages-no-tooling`
    // posture, with the resolver (a one-entry `exports` map) as the primary.
    // A FIFTH, `vllm-surface-isolation`, was DELETED rather than re-pointed, by the same document's
    // ruling: "there is no vllm module left to isolate" — the five role surfaces are gone, vLLM is a
    // provider ROW on the openai-compat wire, and the owner's fleet is `tooling/src/stack/lib/engine-fleet/`.
    // Following it there would have widened a provider-execution seal into the instrument tree by side
    // effect, which is the mistake the `no-raw-egress` engine-plane rows already refused to make.
    {
      name: "providers-public-surface-only",
      comment:
        'Code outside @orb/inference may import ONLY its public surface — the package front door (packages/inference/src/index.ts). Reaching INTO a sealed family (backends/<x>), the funnel, the registry or the contract internals is RED: the family boundary is internal, and the agent-sdk credential firewall must not leak through a deep import. RE-POINTED 2026-09-20 from `packages/server/src/infra/providers/**`, a tree the extraction deleted; the seal that used to need a per-subdir enumeration is now the whole package, because `packages/inference/package.json` exports exactly `".": "./src/index.ts"` — so this stanza is the deep-relative-escape backstop over resolver physics, exactly like `ui-cake`. tests/support is exempt (mock runners instantiate family shapes); tooling is governed by its own narrower half, `tooling-no-provider-families`. (docs/design/orbweaver-inference-package.md §12; Tier-3b-Providers.md invariants #1/#4, whose body still describes the pre-extraction tree.)',
      severity: "error",
      from: { pathNot: [INFERENCE, "^tests/support/", "^tooling/"] },
      to: {
        path: INFERENCE,
        pathNot: `${INFERENCE}index\\.ts$`,
      },
    },
    {
      name: "infra-strategy-isolation",
      comment:
        "Strategy-pattern backends stay independent: a module in `packages/inference/src/backends/<wire>/` must not import a SIBLING backend's internals. Cross-backend work goes through the role contract or the two SHARED PURE seams — `backends/kit/` (the openai-compat reducer, cache-control, retry, error-classify) and `backends/v4/` (the Vercel `LanguageModelV4` slice both hosted wires spell identically) — never a direct reach. One generic rule covers every future wire. THE TWO EXEMPT DIRS ARE DERIVED, NOT PICKED: `WIRES` (`packages/contracts/src/inference/wires.ts:10`) is the closed four-member tuple `openai-compat · anthropic-messages · agent-sdk · local-light`, and everything else under `backends/` is by construction a shared seam — a fifth wire inherits the seal for free, while a third shared seam has to be added here on purpose. RE-POINTED 2026-09-20 from `packages/server/src/infra/(providers/backends|auth/modes)/<x>/`: the providers half moved into @orb/inference, and the auth half went dead in the SAME window for an unrelated reason — `infra/auth/modes/` is five FLAT FILES (cookie-session · forward-header · local · oidc · single-user), so the `<group>/<strategy>/` shape this rule is built on has no member there and a mode has no internals to seal. THE NAME still says `infra`, which is now only historically true; it is kept because `Core-Enforcement-Active-Gates.md` and `Tier-3b-Providers.md` cite it by name and those live outside this change's fence. (docs/design/orbweaver-inference-package.md §12; Tier-3b-Providers.md invariant #2.)",
      severity: "error",
      from: { path: `${INFERENCE}backends/([^/]+)/` },
      to: {
        path: `${INFERENCE}backends/([^/]+)/`,
        pathNot: [`${INFERENCE}backends/$1/`, `${INFERENCE}backends/(kit|v4)/`],
      },
    },
    {
      name: "credential-firewall-openrouter-not-agent-sdk",
      comment:
        "TRANSITIVE credential firewall (hard-won fact: the Max-sub OAuth credential must NEVER leak into the OpenRouter paths — token extraction is what got an account banned). `reachable: true` closes the transitive hole that the direct-edge rule above cannot: no sibling backend may reach the subscription plane through ANY chain (e.g. via a backends/kit helper). WIDENED 2026-09-20, and the widening is what makes the rule survive its own subject: openrouter is no longer a backend FAMILY — its runners collapsed into the shared `backends/openai-compat/` transport and its identity is a provider row's `dialect` — so the OpenRouter EXECUTION path is now shared with every other OpenAI-shaped provider and cannot be directory-fenced at all. Fencing the one name would have left the actual credential-leak surface (the shared transport every hosted provider runs through) open, so the `from` is every backend EXCEPT agent-sdk itself, plus the two surviving openrouter-NAMED catalog/capability modules — a superset of what the pre-extraction `backends/openrouter/` rule covered, and one that a future wire inherits for free. THE NAME still says `openrouter`, which is now only historically true; it is kept because `Core-Enforcement-Active-Gates.md` and `Tier-3b-Providers.md` cite it by name and a rename strands those citations. The threat the old rule closed was mode-2, the OpenRouter agent-sdk skin, which the same program DELETED by owner word (2026-09-19, F18: `agent-sdk` is the subscription's wire and nothing else's) — this rule is what keeps a new one from growing back through a shared seam. The planted-violation proof that it FIRES (never merely that it passes) is `tests/tooling/dependency-cruiser.int.test.ts`. (Tier-3b-Providers.md §7.1 firewall; Core-Shared-Dissolution.md §9.)",
      severity: "error",
      from: {
        path: [`${INFERENCE}backends/([^/]+)/`, `${INFERENCE}(catalog|capability/sources/[^/]+)/openrouter\\.ts$`],
        pathNot: `${INFERENCE}backends/agent-sdk/`,
      },
      to: { path: `${INFERENCE}backends/agent-sdk/`, reachable: true },
    },

    // ════════════════════════════ Persistence + fine-grained domain ═════════════════════════════
    {
      name: "persistence-no-io",
      comment:
        "persistence/ is db queries ONLY — no node:* I/O (no node:fs / node:net / raw fetch). A raw fetch against a user URL is an infra adapter reached through an injected op; the live precedent is DatabankContext.fetchUrl → entry/compose/databank.ts → infra/network.fetchWebDocument. (Core-0-Architecture-and-Structure.md §3; Tier-3-Infra.md.) The no-module-scope-Map half is a structural gate (persistence-no-in-memory-state) — it was a GritQL plugin until 64ab26501 retired that layer.",
      severity: "error",
      from: { path: `${SRV}domain/[^/]+/persistence/` },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "stats-no-vector-tables",
      comment:
        "stats is ECONOMICS (tokens/cost/cache/timing) — it touches ZERO vector tables. discovery is SEMANTICS (themes/hubness/facets). The line is type-enforced: domain/stats must not import the embeddings vector schema. (AGENTS.md §6 domain map, stats vs discovery; Knowledge-Cluster.md invariant 5.) LIVE since db/schema/embeddings landed (was a forward rule; regex-liveness verified 2026-08-03).",
      severity: "error",
      from: { path: `${SRV}domain/stats/` },
      to: { path: `${DB}schema/embeddings` },
    },
    // NOTE (2026-07-13): the discovery↔stats rollup seal is NOT a dep-cruiser rule — every `@orb/db`
    // import resolves to the barrel (exports map "." → src/index.ts), so a `to: schema/stats` regex can
    // never fire (empirically verified: a probe `import { ownerStats }` in discovery cruised green). The
    // real enforcement is the ts-morph structure gate `discovery-no-stats-rollups`
    // (scripts/check/gates/) which matches the named table symbols at the ImportSpecifier level — the
    // same mechanism vector-scope-derived/no-direct-users-read use for barrel-resolved table seals.

    // ════════════════════ @orb/tooling — the tool fleet ABOVE the cake (docs/architecture/core/Core-Tooling-Law.md §4.6) ════════════════════
    {
      name: "packages-no-tooling",
      comment:
        "One-way glass: nothing in packages/** may import @orb/tooling — tools sit ABOVE the cake (may import any app package; never the reverse). Primary enforcement is resolver physics (no package declares the dep); this is the deep-relative-escape backstop, the ui-cake posture. (Core-Tooling-Law.md §1/§4.6.)",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^tooling/" },
    },
    {
      name: "tooling-internal-direction",
      comment:
        "Cross-tool imports enter through the sibling's index.ts — never its ops/lib/contract internals. NO type-only exemption (the domain-sibling-front-door precedent: the front-door law is a SHAPE rule). The ts-morph twin (tooling-front-door) is the lane-speed arm; this is the whole-graph resolved-edge backstop. (Core-Tooling-Law.md §4.2/§4.6.)",
      severity: "error",
      from: { path: "^tooling/src/([^/]+)/" },
      to: { path: "^tooling/src/([^/]+)/(ops|lib|contract)/", pathNot: "^tooling/src/$1/" },
    },
    {
      name: "tooling-cli-via-index",
      comment:
        "A tool's cli.ts consumes its OWN tool only through ./index.ts (argv parse + dispatch fronts the programmatic API; a cli reaching into ops/lib couples the argv surface to internals). _shared imports stay legal (a different top dir, not matched here). (Core-Tooling-Law.md §4.2/§4.6.)",
      severity: "error",
      from: { path: "^tooling/src/([^/]+)/cli\\.ts$" },
      to: { path: "^tooling/src/$1/", pathNot: "^tooling/src/$1/index\\.ts$" },
    },
    {
      name: "tooling-shared-floor",
      comment:
        "_shared/ is @orb/tooling's floor — read DOWN-into by every tool, reaching UP to none (the foundation-reaches-up-to-nothing mirror). (Core-Tooling-Law.md §2.4/§4.6.)",
      severity: "error",
      from: { path: "^tooling/src/_shared/" },
      to: { path: "^tooling/src/", pathNot: "^tooling/src/_shared/" },
    },
    {
      name: "tooling-no-provider-families",
      comment:
        "The tooling half of `providers-public-surface-only`. Tools sit ABOVE the cake and may import any app package (Core-Tooling-Law.md §1), so a tool reaching @orb/inference's front door is legal — what stays SEALED is the part the original rule's WHY is about: the provider FAMILIES (backends/<x>, where the agent-sdk credential firewall lives) and the contract internals. RE-POINTED 2026-09-20 from `packages/server/src/infra/providers/(backends|contract)/`, a tree the @orb/inference extraction deleted. THE OLD CARVE-OUT IS GONE WITH ITS SUBJECT: this comment used to exempt `vllm/engine`'s spawn-spec/wake-budget builders because the fleet launcher and the in-server supervisor shared them and must not drift — there is no in-server supervisor any more, the fleet moved WHOLE to `tooling/src/stack/lib/engine-fleet/`, and nothing in @orb/inference builds an engine argv. (Core-Tooling-Law.md §1/§4.6; docs/design/orbweaver-inference-package.md §12.)",
      severity: "error",
      from: { path: "^tooling/" },
      to: {
        path: `${INFERENCE}(backends|contract)/`,
        pathNot: `${INFERENCE}contract/index\\.ts$`,
      },
    },

    // ════════════════════════════ Hygiene ═══════════════════════════════════════════════════════
    {
      name: "not-to-test",
      comment:
        "Production code (packages/*/src) must not import the centralized tests/ tree or any test/spec file. Src holds no test files (they all live in tests/), so the rule is the TO half. (Core-0-Architecture-and-Structure.md §5.)",
      severity: "error",
      from: { path: "^packages/[^/]+/src/" },
      to: { path: ["^tests/", TEST_FILES] },
    },
    {
      // Overrides recommended-strict's `not-to-unresolvable`, per dep-cruiser's own prescription for
      // intentional cases, and NARROWED to exactly one shape: a VITE ASSET-URL REQUEST for a `.wasm`.
      //
      // WHY IT IS NOT AN IMPORT AT ALL. `import url from "….wasm?url"` does not pull in a module: it asks the
      // bundler to EMIT a binary and hand back its hashed URL string. There is no code behind the edge, no
      // transitive graph, and nothing a layer/boundary rule could have an opinion about. depcruise cannot see
      // that — enhanced-resolve carries the whole `?url` suffix into the package-`exports` lookup, finds
      // nothing, and reports `couldNotResolve` while the file sits right there on disk (probed: its `resolved`
      // is the raw specifier).
      //
      // THE THREE ALTERNATIVES WERE PROBED, ALL LOST (2026-08-28, plugin-ui-plane #679 U4 — the Tier-C QuickJS
      // wasm): (1) `enhancedResolveOptions.alias` is REFUSED BY THE CONFIG SCHEMA ("must NOT have additional
      // properties"); (2) `options.exclude.path` does NOT reach an unresolvable dependency node (the pattern
      // matched its `resolved` string and the violation still fired); (3) dropping the suffix in favour of
      // `assetsInclude: ["**/*.wasm"]` does not win — vite still applies its `?init` wasm transform and the
      // worker bundle FAILS TO BUILD. And the suffix is load-bearing, not cosmetic: without an explicit
      // `wasmLocation` the QuickJS variant derives its wasm path from `import.meta.url` at runtime, which
      // resolves inside node_modules in dev and 404s from a hashed production chunk.
      //
      // SCOPE, deliberately tight, and the PATTERN IS EXACT rather than approximate: the request that reaches
      // this rule is `@jitl/quickjs-ng-wasmfile-release-sync/wasm?url` — an `exports` SUBPATH named `wasm`, with
      // no file extension, so the obvious `\\.wasm\\?url$` matches NOTHING and would have shipped a rule that
      // silently did not apply (measured: it still fired). Every other unresolvable import — a `?raw`, a
      // `.ts?url`, a genuinely missing package — still fires at ERROR, and this one fires again the day the
      // wasm stops being real, because the BUILD is what proves it (`pnpm --filter @orb/client build` emits
      // `assets/emscripten-module-*.wasm`).
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, pathNot: ["^@jitl/quickjs-ng-wasmfile-release-sync/wasm\\?url$"] },
    },
    {
      // Overrides recommended-strict's ERROR-severity rule, per dep-cruiser's own prescription for
      // intentional cases. WHY: react/react-dom are deliberately peer+dev in @orb/ui (peer = the
      // consumer provides the runtime copy; dev = local typecheck/CT — ui-package-design.md §1), and
      // the rule has no peer carve-out knob. Cost accepted: the (non-peer) dep+devDep double-listing
      // mistake class is no longer machine-caught — biome noUndeclaredDependencies + review carry it.
      name: "no-duplicate-dep-types",
      severity: "ignore",
      from: {},
      to: { moreThanOneDependencyType: true },
    },
    {
      name: "not-to-dev-dep",
      comment:
        "Production code (packages/*/src) must not import a devDependency — devDeps are build/test-only and won't ship, so a runtime import of one is a prod crash waiting to happen. depcruise resolves per-package: a module that is a package's real `dependency` (e.g. drizzle-orm in @orb/db) is `npm`, not `npm-dev`, and stays allowed — only PURE devDeps (drizzle-kit, vitest, …) fire. Type-only imports + @types are exempt. (recommended-strict OMITS this rule — it lives only in dep-cruiser's --init template; neo-tavern had it — restored 2026-06-27.)",
      severity: "error",
      // `.d.ts` exempt: an ambient declaration file emits no runtime JS, so a devDep TYPE reference
      // from one (e.g. `vite-env.d.ts` → `vite/client`) can never be a prod crash. dep-cruiser doesn't
      // classify a triple-slash type-reference as `type-only`, so the exemption above misses it.
      from: { path: "^packages/[^/]+/src/", pathNot: [TEST_FILES, "\\.d\\.ts$"] },
      to: {
        dependencyTypes: ["npm-dev"],
        // npm-peer exempt: a dep declared peer+dev (react in @orb/ui — the consumer provides the
        // runtime copy, the devDep only feeds local typecheck/CT) is a legit runtime import, not a
        // prod crash. Without this every hook-using ui component fires. (ui-package-design.md §1.)
        dependencyTypesNot: ["type-only", "npm-peer"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      // Re-enabled as warn 2026-07-13 (its own stated trigger arrived: the tree is wired; a ts-morph
      // audit measured ~22 orphan files). knip (`pnpm knip`) is the deeper dead-code authority — this
      // is the cheap in-graph tripwire for NEW orphans.
      name: "no-orphans",
      comment:
        "A module nothing imports (and that imports nothing reachable) is dead weight or a wiring mistake — delete it or wire it. knip (`pnpm knip`) is the full dead-code/dead-export authority. instruments.ts is carved: the tooling-instrument-proof gate reads it STRUCTURALLY (an AST read, no import edge exists by design — Core-Tooling-Law.md §4.5); knip covers it via the tooling workspace entry. The seeded EXAMPLE-PLUGIN bundles are carved for a stronger reason: `seed-assets/plugins/<slug>/{main,ui}.js` is GUEST source, not host source — it is read as BYTES by `packSeedPluginBundle`, zipped, and executed inside a QuickJS sandbox against a global that does not exist in this graph (`orb.host(1)` on the server, `orb.ui(1)` in the browser worker — plugin-ui-plane #679 U4). An import edge is not merely absent, it is impossible: neither guest realm has a module loader. They live in the `@orb/showcase-plugins` workspace package the server declares as a dependency (#1692 — they used to ride `packages/server/src` because that was the only tree the image copies, which is exactly the image-copy dependence the #1238 ruling refused), and their liveness is proven behaviourally by `tests/server/entry/boot/seed-example-plugins.int.test.ts`, which installs each one and round-trips the scripted example's `ui.js` back out through `getUiBundle`.",
      severity: "warn",
      from: {
        // Helper entry roots omit their test consumers; native runner/Knip discovery owns their liveness.
        path: "^(?:packages|tooling)/",
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)index\\.ts$",
          "^tooling/src/_shared/instruments\\.ts$",
          // `main.js` (the SERVER guest) and `ui.js` (the Tier-C CLIENT guest, plugin-ui-plane #679 U4) — the
          // SAME carve for the same reason, widened to the second entry name rather than loosened to a
          // directory glob, so a stray `helper.js` beside them is still a real orphan.
          "^packages/showcase-plugins/bundles/[^/]+/(main|ui)\\.js$",
        ],
      },
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
    // A `process.getBuiltinModule("fs")` call dodges every import-edge rule (kit-no-node-builtins /
    // ui-no-node-builtins / persistence-no-io all key on core IMPORT edges). This makes such calls
    // core deps too — closing the dodge (installed-surface audit 2026-08-03; v18 option).
    detectProcessBuiltinModuleCalls: true,
    enhancedResolveOptions: {
      // Extensionless ESM + the package.json `exports` map (cross-package `@orb/*` → ./src/*.ts).
      // The `#` intra-package subpath imports resolve via enhanced-resolve's NATIVE package-`imports`
      // support (no tsConfig here, and none needed — probe-VERIFIED 2026-08-03: `#lib` from
      // client/state resolves to packages/client/src/lib/index.ts, couldNotResolve:false, so the
      // internal-cake rules see real resolved paths; the inherited not-to-unresolvable would red
      // any regression).
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    // TanStack Router codegen (client, Phase 6) — not ours to police. The `(^|/)__g_` exclude left at #2176
    // Phase F (2026-09-14) with its reviewed-grant row `depcruise-grant-liveness:g-fixture`: it covered the
    // LEGACY gate self-test's transient real-tree plants, and those planters are deleted — a final policy
    // proves itself on a virtual overlay and writes nothing to the tree.
    // The DevTools frontend root is an exact-revision GENERATED RUNTIME CLOSURE, not first-party source:
    // its path-closed manifest + hashes + licenses are governed by devtools-frontend-assets, and the
    // materialized subset deliberately contains imports outside the 477-resource runtime closure. Graphing
    // it creates false unresolvable edges and subjects third-party bytes to Orb's package cake. Keep this
    // exclusion anchored to that one generated root (Core-Tooling-Law.md §2.6 / #950).
    // The dist exclude is ANCHORED to workspace packages (`^packages/*/dist/`): a bare `(^|/)dist/` also
    // matches `node_modules/<lib>/dist/`, dropping the sealed-lib import edges (minisearch/echarts/shiki/…)
    // so the satellite-seal rules silently stop firing on their fixtures.
    exclude: { path: ["^packages/[^/]+/dist/", "^tooling/src/snap/lib/devtools-frontend/"] },
    // NO RESULT CACHE (removed 2026-08-22, #393 P6 — planted-control receipt below). It was
    // `cache: { strategy: "content" }`, and a WARM cruise is BLIND TO A NEWLY-ADDED FILE: planting
    // `packages/kit/src/__dc/node.ts` with `import "node:fs"` and cruising warm reported 0 violations;
    // dropping the cache dir and cruising the SAME tree reported exactly 1 — `kit-no-node-builtins`. That
    // is a false green in the `imports:depcruise` COMMIT stage (a new boundary-violating file is the most
    // common shape there is), and it is what made tests/tooling/dependency-cruiser.int.test.ts — which
    // plants 60-odd fixtures and cruises — fail 59/60 whenever any earlier cruise had warmed the cache.
    // MEASURED before removing: warm 4.25s vs cold 4.28s over `packages tooling`. The cache bought 0.03s.
    reporterOptions: {
      dot: { collapsePattern: COLLAPSE },
      archi: { collapsePattern: COLLAPSE },
    },
  },
};
