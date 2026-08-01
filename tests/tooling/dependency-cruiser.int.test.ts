// Pins that EVERY rule in .dependency-cruiser.cjs actually fires — the config-robustness guarantee.
// For each rule we write a minimal violating fixture at the real tier path the rule's regex anchors on,
// run dep-cruiser once over packages/, and assert the rule appears in the violations. Also asserts the
// allowed edges (client→server TYPE-ONLY) do NOT fire. (The real tree being violation-free is enforced
// separately by `pnpm depcruise` in check/CI — not re-asserted here.) A broken regex / backreference /
// typo makes a rule silently match nothing — this test is what catches that.
//
// Fixtures are all named `__dc*` so cleanup is a single find -prune -rm; the one non-__dc target
// (db/schema/embeddings.ts, which the stats rule anchors on by name) is tracked + removed if created.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../support/fixtures";

interface DcRule {
  readonly name: string;
  readonly severity?: string;
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

const ROOT = join(import.meta.dirname, "..", "..");
const VAL = "export const t = 1;\n";
const DC_FIXTURE_RE = /(^|\/)__dc/u;

function fx(rel: string, content: string): void {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function cleanFixtures(): void {
  execFileSync("find", ["packages", "-name", "__dc*", "-prune", "-exec", "rm", "-rf", "{}", "+"], {
    cwd: ROOT,
  });
}

// db/schema/embeddings.ts is the stats-rule anchor — it may already exist as a placeholder.
const EMBEDDINGS = "packages/db/src/schema/embeddings.ts";
let createdEmbeddings = false;

let firedRules = new Set<string>();
let fixtureFiles = new Set<string>();

function writeAllFixtures(): void {
  const S = "packages/server/src";
  // no-orphans: a module nothing imports and that imports nothing — the rule's own fixture. Without it the
  // case only passed when the REAL tree happened to carry an orphan (for months: leaked `__g_*` gate-test
  // fixtures); a genuinely clean tree made it flake red (2026-07-17).
  fx(`${S}/__dc_orphan.ts`, VAL);
  // shared targets (value exports the violating imports point at)
  fx(`${S}/foundation/__dc/target.ts`, VAL);
  fx("packages/db/src/__dc/target.ts", VAL);
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
  fx(`${S}/foundation/__dc/toclient.ts`, `import "../../../../client/src/__dc/target.ts";\n`);
  fx("packages/client/src/__dc/value.ts", `import { t } from "../../../server/src/foundation/__dc/target.ts";\nexport const u = t;\n`);
  // negative: client→server TYPE-ONLY must NOT fire
  fx(`${S}/foundation/__dc/ty.ts`, "export type Ty = number;\n");
  fx("packages/client/src/__dc/typeonly.ts", `import type { Ty } from "../../../server/src/foundation/__dc/ty.ts";\nexport const a: Ty = 1;\n`);

  // ── client feature isolation (UI-Arch §2.1/§11.0; mirrors domain isolation below) ──
  fx("packages/client/src/features/__dc_cfeat/index.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat/internal.ts", VAL);
  fx("packages/client/src/features/__dc_cfeat2/index.ts", VAL);
  // client-features-no-cross: feature A imports feature B's internals at RUNTIME.
  fx("packages/client/src/features/__dc_cfeat/cross.ts", `import "../__dc_cfeat2/index.ts";\n`);
  // client-feature-front-door: a non-feature caller (routes/) imports a feature INTERNAL, not its index.
  fx("packages/client/src/routes/__dc_frontdoor.ts", `import "../features/__dc_cfeat/internal.ts";\n`);
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

  fx(`${S}/infra/providers/backends/__dc_back/i.ts`, VAL);
  fx(`${S}/infra/providers/backends/__dc_back2/i.ts`, VAL);
  fx(`${S}/domain/__dc_feat/usebackend.ts`, `import "../../infra/providers/backends/__dc_back/i.ts";\n`);
  fx(`${S}/infra/providers/backends/__dc_back/cross.ts`, `import "../__dc_back2/i.ts";\n`);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s2.ts`, VAL);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s1.ts`, `import "./__dc_s2.ts";\n`);
  fx(`${S}/infra/providers/backends/agent-sdk/__dc.ts`, VAL);
  fx(`${S}/infra/providers/backends/openrouter/__dc.ts`, `import "../agent-sdk/__dc.ts";\n`);

  fx(`${S}/domain/__dc_feat/persistence/io.ts`, `import "node:fs";\n`);
  if (!existsSync(join(ROOT, EMBEDDINGS))) {
    fx(EMBEDDINGS, VAL);
    createdEmbeddings = true;
  }
  fx(`${S}/domain/stats/__dc.ts`, `import "../../../../db/src/schema/embeddings.ts";\n`);
  fx("packages/kit/src/__dc/totest.ts", `import "../../../../tests/support/clock.ts";\n`);

  // not-to-dev-dep: a production src file importing a PURE devDependency. drizzle-kit is db's devDep;
  // db's runtime drizzle-orm resolves as `npm` (not `npm-dev`) so it would NOT fire — only pure devDeps do.
  fx("packages/db/src/__dc/devdep.ts", `import { defineConfig } from "drizzle-kit";\nexport const x = defineConfig;\n`);

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

  // client-components-tier (G5): components/ never imports UP into features/routes/main.tsx.
  fx("packages/client/src/components/__dc_t/i.ts", VAL);
  fx("packages/client/src/components/__dc_up.ts", `import "../features/__dc_cfeat/index.ts";\n`);
  // client-lib-below-components (G5): the floor reaching UP into components/.
  fx("packages/client/src/lib/__dc_up_components.ts", `import "../components/__dc_t/i.ts";\n`);
  // client-state-below-components (G5): a store reaching UP into components/.
  fx("packages/client/src/state/__dc_up_components.ts", `import "../components/__dc_t/i.ts";\n`);
}

interface Violation {
  readonly from: string;
  readonly to: string;
  readonly rule: { readonly name: string };
}

function runCruise(): Violation[] {
  let stdout: string;
  try {
    // `--config.verify-deps-before-run=false`: with a stale deps-state (any package.json/lockfile mtime
    // past `lastValidatedTimestamp` — routine when sibling worktree lanes install concurrently) pnpm 11
    // runs an implicit install and PREPENDS its banner to stdout, which makes the JSON.parse below throw
    // in beforeAll. Same root cause as check-gates.int.test.ts's phantom-`Lockfile` flake.
    stdout = execFileSync(
      "pnpm",
      ["--config.verify-deps-before-run=false", "exec", "depcruise", "packages", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
      {
        cwd: ROOT,
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
  cleanFixtures();
  writeAllFixtures();
  const violations = runCruise();
  firedRules = new Set(violations.map((v) => v.rule.name));
  fixtureFiles = new Set(violations.flatMap((v) => [v.from, v.to]).filter((p) => DC_FIXTURE_RE.test(p) || p === EMBEDDINGS));
});

afterAll(() => {
  cleanFixtures();
  if (createdEmbeddings) {
    rmSync(join(ROOT, EMBEDDINGS), { force: true });
  }
});

test("derives a non-trivial set of active rules from the config (the list isn't silently empty)", () => {
  expect(ACTIVE_RULES.length).toBeGreaterThan(20);
});

test.each(ACTIVE_RULES)("config rule %s fires on its fixture", (rule) => {
  expect(firedRules).toContain(rule);
});

test("allows client→server TYPE-ONLY (the tRPC bridge) — no client-no-backend-runtime on it", () => {
  // the type-only fixture imports server but must NOT be reported; the value fixture is the one that does.
  const all = [...fixtureFiles];
  expect(all.some((p) => p.includes("client/src/__dc/value.ts"))).toBe(true);
  expect(all.some((p) => p.includes("client/src/__dc/typeonly.ts"))).toBe(false);
});
