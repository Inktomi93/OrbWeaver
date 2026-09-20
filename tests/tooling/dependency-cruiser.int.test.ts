// Pins that EVERY rule in .dependency-cruiser.cjs actually fires — the config-robustness guarantee.
// For each rule we write a minimal violating fixture at the real tier path the rule's regex anchors on
// inside a unique scratch root, run dep-cruiser once over that native package graph, and assert the rule
// appears in the violations. Real package manifests and resolved dependencies keep package exports and
// dependency types honest without exposing transient fixtures to any scanner of the checkout.
//
// Also asserts the one exact client→server AppRouter type seam and the stylesheet edges stay silent. The
// real tree being clean is enforced separately by `pnpm depcruise`; a broken regex / backreference / typo
// reds here.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { TEST_KIND_SUFFIXES } from "../../tooling/src/_shared/test-kinds.ts";
import { expect, test } from "../support/tool-fixtures.ts";

interface DcRestriction {
  readonly path?: string | readonly string[];
}
interface DcRule {
  readonly name: string;
  readonly severity?: string;
  readonly from?: DcRestriction;
  readonly to?: DcRestriction;
}
interface DcConfig {
  readonly forbidden?: DcRule[];
  readonly required?: DcRule[];
}

// .dependency-cruiser.cjs is CommonJS (module.exports); a static default import trips biome's
// no-default-export resolver, so load it via dynamic import (top-level await — vitest evaluates the
// module before collecting `it.each`). `.default` is the module.exports object.
// @ts-expect-error -- the .cjs config ships no type declaration (implicit any); its shape is asserted by the cast.
const CONFIG = ((await import("../../.dependency-cruiser.cjs")) as { default: DcConfig }).default;

// The rules to test = EVERY active rule in the config (derived, NOT hardcoded). Deriving from the config
// is the anti-drift guard: add a rule to .dependency-cruiser.cjs without a fixture below and its case
// here fires with nothing → FAILS. (recommended-strict's inherited rules aren't in our `forbidden`
// literal, so they're out of scope — dep-cruiser ships them tested.)
const ACTIVE_RULES = [...(CONFIG.forbidden ?? []), ...(CONFIG.required ?? [])].filter((r) => r.severity !== "ignore").map((r) => r.name);
const NOT_TO_TEST = CONFIG.forbidden?.find((rule) => rule.name === "not-to-test");
function pathValues(value: string | readonly string[] | undefined): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  return value ?? [];
}
const NOT_TO_TEST_PATHS = pathValues(NOT_TO_TEST?.to?.path);
const TEST_FILES_PATTERN = NOT_TO_TEST_PATHS.find((path) => path !== "^tests/");
if (TEST_FILES_PATTERN === undefined) {
  throw new Error("not-to-test has no registered-kind selector");
}

const ROOT = join(import.meta.dirname, "..", "..");
const VAL = "export const t = 1;\n";
const CACHE_TRIPWIRE_FIXTURE = "packages/kit/src/__dc_cache_fresh_node.ts";
let fixtureRoot = "";

function fx(rel: string, content: string): void {
  const abs = join(fixtureRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function copyFixtureFile(rel: string): void {
  const destination = join(fixtureRoot, rel);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(ROOT, rel), destination);
}

function linkPackageDependency(packageDir: string, dependency: string, target = join(ROOT, packageDir, "node_modules", dependency)): void {
  const destination = join(fixtureRoot, packageDir, "node_modules", dependency);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(target, destination, "dir");
}

function writeNativeSubstrate(): void {
  for (const packageDir of [
    "packages/kit",
    "packages/contracts",
    "packages/db",
    "packages/inference",
    "packages/server",
    "packages/client",
    "packages/ui",
    "packages/showcase-plugins",
    "packages/default-content",
  ]) {
    copyFixtureFile(`${packageDir}/package.json`);
  }

  linkPackageDependency("packages/db", "drizzle-kit");
  linkPackageDependency("packages/server", "minisearch");
  for (const dependency of ["@tanstack/react-virtual", "diff", "minisearch", "tailwind-merge", "tailwind-variants"]) {
    linkPackageDependency("packages/ui", dependency);
  }
  linkPackageDependency("packages/client", "@orb/ui", join(fixtureRoot, "packages/ui"));

  fx("packages/contracts/src/credentials/index.ts", "export interface ResolvedCredential { readonly apiKey: string; }\n");
  fx("packages/server/src/index.ts", "export type AppRouter = { readonly ping: true };\n");
  fx("packages/client/src/features/app-shell/surfaces/shell.css", ".shell {}\n");
  fx("packages/client/src/main.tsx", VAL);
  fx("packages/client/src/styles/index.ts", `import "../features/app-shell/surfaces/shell.css";\n`);
  fx("packages/ui/src/primitives/alert-dialog/index.ts", "export const AlertDialog = {};\n");
  fx("tests/support/clock.ts", VAL);
}

// db/schema/embeddings.ts is the stats-rule anchor.
const EMBEDDINGS = "packages/db/src/schema/embeddings.ts";

let firedRules = new Set<string>();

function writeAllFixtures(): void {
  writeNativeSubstrate();
  const S = "packages/server/src";
  // no-orphans: a module nothing imports and that imports nothing — the rule's own fixture. Without it the
  // case only passed when the REAL tree happened to carry an orphan (for months: leaked `__g_*` gate-test
  // fixtures); a genuinely clean tree made it flake red (2026-07-17).
  fx(`${S}/__dc_orphan.ts`, VAL);
  // shared targets (value exports the violating imports point at)
  fx(`${S}/foundation/__dc/target.ts`, `${VAL}export type Ty = number;\n`);
  fx("packages/db/src/__dc/target.ts", `${VAL}export type DbTy = number;\n`);
  fx("packages/client/src/__dc/target.ts", VAL);
  fx(`${S}/domain/__dc_feat/index.ts`, VAL);
  fx(`${S}/domain/__dc_feat/internal.ts`, VAL);
  fx(`${S}/domain/__dc_feat2/index.ts`, VAL);
  fx(`${S}/transport/__dc/target.ts`, VAL);
  fx(`${S}/entry/__dc/target.ts`, VAL);

  fx("packages/kit/src/__dc/up.ts", `import "../../../server/src/foundation/__dc/target.ts";\n`);
  fx("packages/kit/src/__dc/node.ts", `import "node:fs";\n`);
  fx("packages/contracts/src/__dc/up.ts", `import "../../../db/src/__dc/target.ts";\n`);
  // bus-contract-no-credentials (D16): a bus-event contract module reaching into the secret-bearing
  // credentials module — the type-import path a producer would use to smuggle apiKey/ResolvedCredential
  // onto the wire. `../credentials/index.ts` is the real module (always present).
  fx(
    "packages/contracts/src/chat/__dc_buscred.ts",
    `import type { ResolvedCredential } from "../credentials/index.ts";\nexport type X = ResolvedCredential;\n`,
  );
  fx("packages/db/src/__dc/up.ts", `import "../../../server/src/foundation/__dc/target.ts";\n`);
  // inference-cake + browser-no-inference: the runtime sits between db and server — an inference→db edge
  // reaches UP the cake (db must be a port), and the browser never pulls the node-only runtime.
  fx("packages/inference/src/__dc/target.ts", VAL);
  fx("packages/inference/src/__dc/up.ts", `import "../../../db/src/__dc/target.ts";\n`);
  fx("packages/client/src/__dc/inference.ts", `import "../../../inference/src/__dc/target.ts";\n`);
  fx("packages/showcase-plugins/__dc/target.ts", VAL);
  fx("packages/showcase-plugins/__dc/up.ts", `import "../../db/src/__dc/target.ts";\n`);
  fx("packages/client/src/__dc/showcase.ts", `import "../../../showcase-plugins/__dc/target.ts";\n`);
  // default-content-cake + browser-no-default-content (D160): the same pair as showcase-plugins, for the
  // OTHER default-content package — it sits below `server` and may reach only @orb/kit, and the browser
  // never imports a node reader of shipped bytes.
  fx("packages/default-content/__dc/target.ts", VAL);
  fx("packages/default-content/__dc/up.ts", `import "../../db/src/__dc/target.ts";\n`);
  fx("packages/client/src/__dc/default-content.ts", `import "../../../default-content/__dc/target.ts";\n`);
  fx(`${S}/foundation/__dc/toclient.ts`, `import "../../../../client/src/__dc/target.ts";\n`);
  fx("packages/client/src/__dc/value.ts", `import { t } from "../../../server/src/foundation/__dc/target.ts";\nexport const u = t;\n`);
  fx("packages/client/src/__dc/value-db.ts", `import { t } from "../../../db/src/__dc/target.ts";\nexport const u = t;\n`);
  // The only legal backend type edge is this file → server root. Its two other imports plant the target
  // half of the wall; arbitrary client files below plant the source half for both server and DB.
  fx(
    "packages/client/src/data/trpc.ts",
    `import type { AppRouter } from "../../../server/src/index.ts";\nimport type { Ty } from "../../../server/src/foundation/__dc/target.ts";\nimport type { DbTy } from "../../../db/src/__dc/target.ts";\nexport type Client = AppRouter & { readonly server: Ty; readonly db: DbTy };\n`,
  );
  fx("packages/client/src/__dc/typeonly-server.ts", `import type { Ty } from "../../../server/src/foundation/__dc/target.ts";\nexport type A = Ty;\n`);
  fx("packages/client/src/__dc/typeonly-db.ts", `import type { DbTy } from "../../../db/src/__dc/target.ts";\nexport type A = DbTy;\n`);

  // ── client feature isolation (UI-Arch §2.1/§11.0; mirrors domain isolation below) ──
  fx("packages/client/src/features/__dc_cfeat/index.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat/internal.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat2/index.ts", VAL);
  // client-features-no-cross: feature A imports feature B's internals at RUNTIME.
  fx("packages/client/src/features/__dc_cfeat/cross.ts", `import "../__dc_cfeat2/index.ts";\n`);
  // client-feature-front-door: a non-feature caller (routes/) imports a feature INTERNAL, not its index.
  fx("packages/client/src/routes/__dc_frontdoor.ts", `import "../features/__dc_cfeat/internal.ts";\n`);
  // The split rules grant only styles/index.ts → shell.css: the broad rule catches another caller of
  // shell.css, while the styles-side rule catches another feature-internal target from styles/.
  fx("packages/client/src/routes/__dc_shell_css_bypass.ts", `import "../features/app-shell/surfaces/shell.css";\nexport const bypass = true;\n`);
  fx("packages/client/src/styles/__dc_css_frontdoor_bypass.ts", `import "../features/__dc_cfeat/internal.ts";\nexport const bypass = true;\n`);
  // view-transition-fence (#1830): `withViewTransition` is shell-store's privilege — any OTHER client module
  // importing `lib/view-transition.ts` directly is the fenced defect. The rule landed 2026-09-18 (ba641662d)
  // with no fixture, so the anti-drift `test.each(ACTIVE_RULES)` case had nothing to fire it and this suite
  // was RED on arrival; the fixture is added here with the D160 package move that had to run it.
  fx("packages/client/src/lib/view-transition.ts", VAL);
  fx("packages/client/src/__dc/view-transition.ts", `import "../lib/view-transition.ts";\n`);

  // confirm-uses-composite: a features/** module importing the raw @orb/ui/alert-dialog primitive
  // instead of the tier-2 ConfirmDialog composite (client-architecture-lockdown.md §16 G7).
  fx("packages/client/src/features/__dc_confirm/alert.ts", `import { AlertDialog } from "@orb/ui/alert-dialog";\nexport const g = AlertDialog;\n`);

  fx(`${S}/foundation/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);
  fx(`${S}/infra/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);
  fx(`${S}/infra/__dc/db.ts`, `import "../../../../db/src/__dc/target.ts";\n`);
  fx(`${S}/domain/__dc_feat/up.ts`, `import "../../transport/__dc/target.ts";\n`);
  fx(`${S}/transport/__dc/up.ts`, `import "../../entry/__dc/target.ts";\n`);
  fx(`${S}/transport/trpc/routers/__dc.ts`, `import { t } from "../../../../../db/src/__dc/target.ts";\nexport const u = t;\n`);
  fx(`${S}/transport/jobs/__dc.ts`, VAL);
  fx(`${S}/transport/trpc/__dc.ts`, `import "../jobs/__dc.ts";\n`);
  fx(`${S}/kit/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);

  fx(`${S}/domain/__dc_feat/cross.ts`, `import "../__dc_feat2/index.ts";\n`);
  // domain-sibling-front-door (audit F9/G3): a domain reaching into a SIBLING's internals instead of its
  // index. TYPE-ONLY on purpose — type-only is exempt from domain-no-cross-feature but NOT from this rule
  // (the front-door law is a shape rule; an injected-op shape must come through the front door too), so
  // this fixture isolates the new rule's bite AND pins the no-type-exemption design decision.
  fx(`${S}/domain/__dc_feat2/internal.ts`, "export type DeepTy = number;\n");
  fx(`${S}/domain/__dc_feat/deepcross.ts`, `import type { DeepTy } from "../__dc_feat2/internal.ts";\nexport type Z = DeepTy;\n`);
  fx(`${S}/transport/__dc/frontdoor.ts`, `import "../../domain/__dc_feat/internal.ts";\n`);
  fx(`${S}/domain/__dc_feat/verbs/b.ts`, "export const b = 1;\n");
  fx(`${S}/domain/__dc_feat/verbs/a.ts`, `import { b } from "./b.ts";\nexport const u = b;\n`);
  fx(`${S}/domain/__dc_feat/persistence/p.ts`, `import "../verbs/b.ts";\n`);
  fx(`${S}/domain/__dc_feat/memory/m.ts`, VAL);
  fx(`${S}/domain/__dc_feat/verbs/c.ts`, `import "../memory/m.ts";\n`);
  fx(`${S}/domain/__dc_feat/engine/e.ts`, VAL);
  fx(`${S}/domain/__dc_feat/memory/x.ts`, `import "../engine/e.ts";\n`);
  // domain-teaching-contribution-compose-only (interaction-direction-spec §3-S2; D117's
  // workload-contributions precedent): the ratified root slot is a COMPOSITION surface — the only legal
  // importer is the owning domain's own index.ts (which is what entry/compose reads through). A VERB
  // importing the factory to call it inline is the hard-wired call site the seam exists to delete. The
  // rule landed (2026-08-24, 171e4aa5e's S2 seam) without this fixture, so the anti-drift
  // `test.each(ACTIVE_RULES)` case had nothing to fire it and the suite was RED. The slot file is not
  // itself named `__dc*`; it lives under the per-run scratch root, so exact-root cleanup still removes it.
  fx(`${S}/domain/__dc_feat/teaching-contribution.ts`, "export const teachingContribution = () => 1;\n");
  fx(
    `${S}/domain/__dc_feat/verbs/__dc_teachcall.ts`,
    `import { teachingContribution } from "../teaching-contribution.ts";\nexport const u = teachingContribution;\n`,
  );

  fx(`${S}/infra/providers/backends/__dc_back/i.ts`, VAL);
  fx(`${S}/infra/providers/backends/__dc_back2/i.ts`, VAL);
  fx(`${S}/domain/__dc_feat/usebackend.ts`, `import "../../infra/providers/backends/__dc_back/i.ts";\n`);
  fx(`${S}/infra/providers/backends/__dc_back/cross.ts`, `import "../__dc_back2/i.ts";\n`);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s2.ts`, VAL);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s1.ts`, `import "./__dc_s2.ts";\n`);
  fx(`${S}/infra/providers/backends/agent-sdk/__dc.ts`, VAL);
  fx(`${S}/infra/providers/backends/openrouter/__dc.ts`, `import "../agent-sdk/__dc.ts";\n`);

  fx(`${S}/domain/__dc_feat/persistence/io.ts`, `import "node:fs";\n`);
  fx(EMBEDDINGS, VAL);
  fx(`${S}/domain/stats/__dc.ts`, `import "../../../../db/src/schema/embeddings.ts";\n`);
  fx("packages/kit/src/__dc/totest.ts", `import "../../../../tests/support/clock.ts";\n`);
  fx("packages/kit/testing/__dc_registered.repo.int.test.ts", VAL);
  fx("packages/kit/testing/__dc_unsupported.test.js", VAL);
  fx("packages/kit/src/__dc/test-kind.ts", `import "../../testing/__dc_registered.repo.int.test.ts";\nimport "../../testing/__dc_unsupported.test.js";\n`);

  // not-to-dev-dep: a production src file importing a PURE devDependency. drizzle-kit is db's devDep;
  // db's runtime drizzle-orm resolves as `npm` (not `npm-dev`) so it would NOT fire — only pure devDeps do.
  fx("packages/db/src/__dc/devdep.ts", `import { defineConfig } from "drizzle-kit";\nexport const x = defineConfig;\n`);

  // not-to-unresolvable (plugin-ui-plane #679 U4 override): the config reds on EVERY unresolvable import
  // except the one whitelisted `@jitl/quickjs-ng-wasmfile-release-sync/wasm?url` vite asset request. A
  // genuinely-missing package is the canonical firing case the rule's own comment names. The override rule
  // shipped (2026-08-28, plugin train) without this fixture, so the anti-drift `test.each(ACTIVE_RULES)`
  // case had nothing to fire it and the suite was RED — the domain-teaching / tooling-no-provider-families
  // precedents above.
  fx(`${S}/foundation/__dc/unresolvable.ts`, `import "__dc-nonexistent-package";\nexport const u = 1;\n`);

  // ── @orb/ui (the frontend cake leaf — ui-package-design.md §8) ──
  // ui-cake: a deep relative escape into contracts (the resolver can't see relative paths).
  fx("packages/contracts/src/__dc/target.ts", VAL);
  fx("packages/ui/src/__dc/up.ts", `import "../../../contracts/src/__dc/target.ts";\n`);
  // ui-no-node-builtins: browser package importing node:*.
  fx("packages/ui/src/__dc/node.ts", `import "node:fs";\n`);
  // ui-satellite-seals: a sealed lib imported OUTSIDE its one seal dir (diff belongs to src/diff/ only).
  fx("packages/ui/src/__dc/sealbreach.ts", `import { diffChars } from "diff";\nexport const d = diffChars;\n`);
  // ui-satellite-seals: the media-grid carve-out's regex is exact-dir-match (`primitives/media-grid/`)
  // — a look-alike sibling dir name must still fire, proving the added alternative isn't overly broad.
  fx(
    "packages/ui/src/primitives/__dc_media_grid_lookalike/x.ts",
    `import { useVirtualizer } from "@tanstack/react-virtual";\nexport const v = useVirtualizer;\n`,
  );
  // ui-satellite-seals (minisearch): minisearch belongs to primitives/macro-textarea/ only.
  fx("packages/ui/src/__dc/minisearch-sealbreach.ts", `import MiniSearch from "minisearch";\nexport const m = MiniSearch;\n`);
  // ui-class-merge-seal: tailwind-merge belongs to lib/class-merge.ts only (the ONE configured merger).
  fx("packages/ui/src/__dc/twmerge-sealbreach.ts", `import { twMerge } from "tailwind-merge";\nexport const m = twMerge;\n`);
  // ui-tailwind-variants-runtime-seal: every runtime factory belongs beside the ONE configured merger.
  // Type-only VariantProps imports across components remain legal by construction.
  fx("packages/ui/src/__dc/tv-factory-sealbreach.ts", `import { createTV } from "tailwind-variants";\nexport const v = createTV({ twMerge: false });\n`);
  fx("packages/ui/src/__dc/tv-typeonly-ok.ts", `import type { VariantProps } from "tailwind-variants";\nexport type V = VariantProps<() => string>;\n`);
  // search-minisearch-seal: minisearch (server side) belongs to domain/search/substrate/field-index.ts only.
  fx("packages/server/src/domain/search/__dc/minisearch-sealbreach.ts", `import MiniSearch from "minisearch";\nexport const m = MiniSearch;\n`);

  // ── The @orb/ui INTERNAL cake (groups → primitives → lib/tokens) ──
  fx("packages/ui/src/primitives/__dc_prim/i.ts", VAL);
  fx("packages/ui/src/markdown/__dc_g/i.ts", VAL);
  // ui-lib-tokens-floor: the floor reaching UP into primitives.
  fx("packages/ui/src/lib/__dc_up.ts", `import "../primitives/__dc_prim/i.ts";\n`);
  // ui-primitives-below-groups: a primitive reaching UP into a group.
  fx("packages/ui/src/primitives/__dc_prim/up.ts", `import "../../markdown/__dc_g/i.ts";\n`);
  // ui-groups-independent: group→group sideways (charts → markdown) at runtime.
  fx("packages/ui/src/charts/__dc_g/cross.ts", `import { t } from "../../markdown/__dc_g/i.ts";\nexport const u = t;\n`);

  // ── The @orb/client INTERNAL cake (main → routes → features → forms/data → state → lib) ──
  fx("packages/client/src/state/__dc_t/i.ts", VAL);
  fx("packages/client/src/data/__dc_t/i.ts", VAL);
  fx("packages/client/src/forms/__dc_t/i.ts", VAL);
  fx("packages/client/src/routes/__dc_rt.ts", VAL);
  // client-lib-floor: the floor reaching UP into state.
  fx("packages/client/src/lib/__dc_up.ts", `import "../state/__dc_t/i.ts";\n`);
  // client-state-below-data: a store reaching UP into the Query layer.
  fx("packages/client/src/state/__dc_up.ts", `import "../data/__dc_t/i.ts";\n`);
  // client-data-direction: the data layer reaching UP into forms.
  fx("packages/client/src/data/__dc_up.ts", `import "../forms/__dc_t/i.ts";\n`);
  // client-forms-direction: a form factory VALUE-importing the data layer (type-only is exempt).
  fx("packages/client/src/forms/__dc_up.ts", `import { t } from "../data/__dc_t/i.ts";\nexport const u = t;\n`);
  // client-features-below-routes: a feature importing a route module.
  fx("packages/client/src/features/__dc_cfeat/uproute.ts", `import "../../routes/__dc_rt.ts";\n`);
  // client-nothing-imports-main: anything importing the composition root (the real main.tsx).
  fx("packages/client/src/routes/__dc_main.ts", `import "../main.tsx";\n`);
  // client-composition-tier-door-only: the agent-nav/agent-seed dir modules are main.tsx's own glue —
  // a FEATURE reaching one of them is the backdoor to another feature's front door (F-3).
  fx("packages/client/src/agent-nav/__dc_t.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat/comptier.ts", `import "../../agent-nav/__dc_t.ts";\n`);
  // client-compose-door-only: a feature importing the composition door would expose every feature front
  // door through one apparently legal hop. The lazy-route composition split added this separate wall.
  fx("packages/client/src/compose/__dc_t.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat/compose-door.ts", `import "../../compose/__dc_t.ts";\n`);

  // ── @orb/tooling (the tool fleet ABOVE the cake — Core-Tooling-Law.md §4.6) ──
  fx("tooling/src/__dc_tb/ops/y.ts", VAL);
  fx("tooling/src/__dc_ta/x.ts", `import "../__dc_tb/ops/y.ts";\n`);
  // packages-no-tooling: the one-way glass — a cake package deep-relative-escaping into tooling.
  fx("packages/kit/src/__dc/toolingup.ts", `import "../../../../tooling/src/__dc_tb/ops/y.ts";\n`);
  // tooling-cli-via-index: a cli reaching its own internals instead of ./index.ts.
  fx("tooling/src/__dc_ta/cli.ts", `import "./x.ts";\n`);
  // tooling-shared-floor: the plumbing floor reaching UP into a tool.
  fx("tooling/src/_shared/__dc_up.ts", `import "../__dc_ta/x.ts";\n`);
  // tooling-no-provider-families — a tool reaching a provider FAMILY (backends/<x>, where the agent-sdk
  // credential firewall lives). The rule shipped without this pin, so the anti-drift `test.each(ACTIVE_RULES)`
  // case had nothing to fire it and the suite was RED on main before the P6 verify move touched it.
  fx("tooling/src/__dc_ta/families.ts", `import "../../../packages/server/src/infra/providers/backends/__dc_back/i.ts";\n`);

  // client-components-tier (G5): components/ never imports UP into features/routes/main.tsx.
  fx("packages/client/src/components/__dc_t/i.ts", VAL);
  fx("packages/client/src/components/__dc_up.ts", `import "../features/__dc_cfeat/index.ts";\n`);
  // client-lib-below-components (G5): the floor reaching UP into components/.
  fx("packages/client/src/lib/__dc_up_components.ts", `import "../components/__dc_t/i.ts";\n`);
  // client-state-below-components (G5): a store reaching UP into components/.
  fx("packages/client/src/state/__dc_up_components.ts", `import "../components/__dc_t/i.ts";\n`);

  // ── Test-helper worlds (iso ← node/browser; node ↛ browser) ──
  fx("tests/support/browser/__dc/target.ts", VAL);
  fx("tests/support/node/__dc/same.ts", "export type NodeTy = number;\n");
  fx("tests/support/node/__dc/to-browser.ts", `import "../../browser/__dc/target.ts";\n`);
  fx("tests/support/iso/__dc/same.ts", "export type IsoTy = number;\n");
  fx("tests/support/iso/__dc/to-node.ts", `import type { NodeTy } from "../../node/__dc/same.ts";\nexport type ImportedNodeTy = NodeTy;\n`);
  fx("tests/support/iso/__dc/same-world.ts", `import type { IsoTy } from "./same.ts";\nexport type ImportedIsoTy = IsoTy;\n`);
}

interface Violation {
  readonly from: string;
  readonly to: string;
  readonly rule: { readonly name: string };
}

let allViolations: readonly Violation[] = [];

function runCruise(): Violation[] {
  let stdout: string;
  try {
    // Resolve the tracked binary from the checkout but run it at the scratch root: invoking `pnpm exec`
    // changes the child cwd back to the workspace and silently cruises the real tree instead.
    stdout = execFileSync(
      join(ROOT, "node_modules/.bin/depcruise"),
      ["packages", "tooling", "tests/support", "--config", join(ROOT, ".dependency-cruiser.cjs"), "--output-type", "json"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch (err) {
    // depcruise exits non-zero when violations exist — the JSON is on stdout.
    stdout = (err as { stdout?: string }).stdout ?? "";
  }
  const parsed = JSON.parse(stdout) as { summary: { violations: Violation[] } };
  return parsed.summary.violations;
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "orb-dependency-cruiser-"));
  writeAllFixtures();
  runCruise();
  fx(CACHE_TRIPWIRE_FIXTURE, `import "node:fs";\n`);
  const violations = runCruise();
  allViolations = violations;
  firedRules = new Set(violations.map((v) => v.rule.name));
  // The explicit 30s applies to this hook independent of the project's default hookTimeout, and ALL of
  // this suite's work is in this hook. Measured 2026-08-24 at
  // load-avg ~18: a cruise took 9.5s and the hook timed out, which reads as a whole-file FAIL
  // with no rule named — a false red on contention, not a config defect.
}, 30_000);

afterAll(() => {
  if (fixtureRoot !== "") {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("derives a non-trivial set of active rules from the config (the list isn't silently empty)", () => {
  expect(ACTIVE_RULES.length).toBeGreaterThan(20);
});

test("the not-to-test selector covers every registered authored test kind and rejects unsupported extensions", () => {
  const matcher = new RegExp(TEST_FILES_PATTERN, "u");
  expect(TEST_KIND_SUFFIXES.every((suffix) => matcher.test(`subject${suffix}`))).toBe(true);
  expect(matcher.test("subject.test.js")).toBe(false);
});

test("the native graph rejects a planted registered test import and passes the unsupported control", () => {
  const violations = allViolations.filter((violation) => violation.rule.name === "not-to-test" && violation.from.endsWith("kit/src/__dc/test-kind.ts"));
  expect(violations.map((violation) => violation.to)).toEqual(["packages/kit/testing/__dc_registered.repo.int.test.ts"]);
});

// THE CACHE TRIPWIRE (#393 P6). `.dependency-cruiser.cjs` carried `cache: { strategy: "content" }`, and a
// WARM cruise was blind to a newly-added file — the shape of a new boundary violation in the
// `imports:depcruise` COMMIT stage. Warm the same scratch graph, add exactly one fresh kit→node edge, then
// cruise again and require that exact from-path + rule pair. If a result cache makes the second cruise
// reuse the first graph, this reds even though the original kit fixture still proves the rule itself fires.
// dependency-cruiser 18.1.0 sees the fresh edge with content caching enabled; this remains a regression
// guard for the historical failure rather than a claim that the installed cache is currently blind.
test("a cruise SEES files that did not exist when any previous cruise ran (the result-cache tripwire)", () => {
  const freshViolations = allViolations.filter((violation) => violation.from === CACHE_TRIPWIRE_FIXTURE && violation.rule.name === "kit-no-node-builtins");
  expect(freshViolations).toHaveLength(1);
});

test.each(ACTIVE_RULES)("config rule %s fires on its fixture", (rule) => {
  expect(firedRules).toContain(rule);
});

test("allows only data/trpc.ts → server root as the client backend type seam", () => {
  const typeSourceViolations = allViolations.filter((violation) => violation.rule.name === "client-backend-types-only-through-trpc");
  expect(typeSourceViolations.map((violation) => violation.from).toSorted()).toEqual([
    "packages/client/src/__dc/typeonly-db.ts",
    "packages/client/src/__dc/typeonly-server.ts",
  ]);

  const typeTargetViolations = allViolations.filter((violation) => violation.rule.name === "client-trpc-type-target");
  expect(typeTargetViolations.map((violation) => violation.to).toSorted()).toEqual([
    "packages/db/src/__dc/target.ts",
    "packages/server/src/foundation/__dc/target.ts",
  ]);
  expect(allViolations.some((violation) => violation.from === "packages/client/src/data/trpc.ts" && violation.to === "packages/server/src/index.ts")).toBe(
    false,
  );
});

test("rejects runtime client edges to both server and DB", () => {
  const runtimeViolations = allViolations.filter((violation) => violation.rule.name === "client-no-backend-runtime");
  expect(runtimeViolations.map((violation) => violation.from).toSorted()).toEqual([
    "packages/client/src/__dc/value-db.ts",
    "packages/client/src/__dc/value.ts",
  ]);
});

test("the TV seal catches the planted runtime factory and preserves type-only VariantProps imports", () => {
  const tvViolations = allViolations.filter((violation) => violation.rule.name === "ui-tailwind-variants-runtime-seal");
  expect(tvViolations.some((violation) => violation.from.endsWith("ui/src/__dc/tv-factory-sealbreach.ts"))).toBe(true);
  expect(tvViolations.some((violation) => violation.from.endsWith("ui/src/__dc/tv-typeonly-ok.ts"))).toBe(false);
});

test("the exact CSS front door may import shell.css while every other importer remains sealed", () => {
  const frontDoorViolations = allViolations.filter((violation) => violation.rule.name === "client-feature-front-door");
  expect(frontDoorViolations.some((violation) => violation.from.endsWith("client/src/styles/index.ts"))).toBe(false);
  expect(frontDoorViolations.some((violation) => violation.from.endsWith("client/src/routes/__dc_shell_css_bypass.ts"))).toBe(true);

  const cssFrontDoorViolations = allViolations.filter((violation) => violation.rule.name === "client-css-front-door-shell-only");
  expect(cssFrontDoorViolations.some((violation) => violation.from.endsWith("client/src/styles/index.ts"))).toBe(false);
  expect(cssFrontDoorViolations.some((violation) => violation.from.endsWith("client/src/styles/__dc_css_frontdoor_bypass.ts"))).toBe(true);
});

test("helper worlds reject node→browser and type-only iso→node while preserving same-world type imports", () => {
  const helperViolations = allViolations.filter((violation) => violation.rule.name === "test-helper-world-direction");
  expect(helperViolations.some((violation) => violation.from.endsWith("support/node/__dc/to-browser.ts"))).toBe(true);
  expect(helperViolations.some((violation) => violation.from.endsWith("support/iso/__dc/to-node.ts"))).toBe(true);
  expect(helperViolations.some((violation) => violation.from.endsWith("support/iso/__dc/same-world.ts"))).toBe(false);
});
