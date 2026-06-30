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
import { afterAll, beforeAll, expect, test } from "vitest";

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
// literal, so they're out of scope — dep-cruiser ships them tested.) `no-orphans` is severity "ignore"
// (disabled until code lands) so it's excluded.
const ACTIVE_RULES = [...(CONFIG.forbidden ?? []), ...(CONFIG.required ?? [])]
  .filter((r) => r.severity !== "ignore")
  .map((r) => r.name);

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
  // shared targets (value exports the violating imports point at)
  fx(`${S}/foundation/__dc/target.ts`, VAL);
  fx("packages/db/src/__dc/target.ts", VAL);
  fx("packages/client/src/__dc/target.ts", VAL);
  fx(`${S}/domain/__dc_feat/index.ts`, VAL);
  fx(`${S}/domain/__dc_feat/internal.ts`, VAL);
  fx(`${S}/domain/__dc_feat2/index.ts`, VAL);
  fx(`${S}/transport/__dc/target.ts`, VAL);
  fx(`${S}/entry/__dc/target.ts`, VAL);

  // ── package cake ──
  fx("packages/kit/src/__dc/up.ts", `import "../../../server/src/foundation/__dc/target.ts";\n`);
  fx("packages/kit/src/__dc/node.ts", `import "node:fs";\n`);
  fx("packages/contracts/src/__dc/up.ts", `import "../../../db/src/__dc/target.ts";\n`);
  fx("packages/db/src/__dc/up.ts", `import "../../../server/src/foundation/__dc/target.ts";\n`);
  fx(`${S}/foundation/__dc/toclient.ts`, `import "../../../../client/src/__dc/target.ts";\n`);
  fx(
    "packages/client/src/__dc/value.ts",
    `import { t } from "../../../server/src/foundation/__dc/target.ts";\nexport const u = t;\n`,
  );
  // negative: client→server TYPE-ONLY must NOT fire
  fx(`${S}/foundation/__dc/ty.ts`, "export type Ty = number;\n");
  fx(
    "packages/client/src/__dc/typeonly.ts",
    `import type { Ty } from "../../../server/src/foundation/__dc/ty.ts";\nexport const a: Ty = 1;\n`,
  );

  // ── server tiers ──
  fx(`${S}/foundation/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);
  fx(`${S}/infra/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);
  fx(`${S}/infra/__dc/db.ts`, `import "../../../../db/src/__dc/target.ts";\n`);
  fx(`${S}/domain/__dc_feat/up.ts`, `import "../../transport/__dc/target.ts";\n`);
  fx(`${S}/transport/__dc/up.ts`, `import "../../entry/__dc/target.ts";\n`);
  fx(
    `${S}/transport/trpc/routers/__dc.ts`,
    `import { t } from "../../../../../db/src/__dc/target.ts";\nexport const u = t;\n`,
  );
  fx(`${S}/transport/jobs/__dc.ts`, VAL);
  fx(`${S}/transport/trpc/__dc.ts`, `import "../jobs/__dc.ts";\n`);
  fx(`${S}/kit/__dc/up.ts`, `import "../../domain/__dc_feat/index.ts";\n`);

  // ── domain isolation ──
  fx(`${S}/domain/__dc_feat/cross.ts`, `import "../__dc_feat2/index.ts";\n`);
  fx(`${S}/transport/__dc/frontdoor.ts`, `import "../../domain/__dc_feat/internal.ts";\n`);
  fx(`${S}/domain/__dc_feat/verbs/b.ts`, "export const b = 1;\n");
  fx(`${S}/domain/__dc_feat/verbs/a.ts`, `import { b } from "./b.ts";\nexport const u = b;\n`);
  fx(`${S}/domain/__dc_feat/persistence/p.ts`, `import "../verbs/b.ts";\n`);
  fx(`${S}/domain/__dc_feat/memory/m.ts`, VAL);
  fx(`${S}/domain/__dc_feat/verbs/c.ts`, `import "../memory/m.ts";\n`);
  fx(`${S}/domain/__dc_feat/engine/e.ts`, VAL);
  fx(`${S}/domain/__dc_feat/memory/x.ts`, `import "../engine/e.ts";\n`);

  // ── infra/providers ──
  fx(`${S}/infra/providers/backends/__dc_back/i.ts`, VAL);
  fx(`${S}/infra/providers/backends/__dc_back2/i.ts`, VAL);
  fx(
    `${S}/domain/__dc_feat/usebackend.ts`,
    `import "../../infra/providers/backends/__dc_back/i.ts";\n`,
  );
  fx(`${S}/infra/providers/backends/__dc_back/cross.ts`, `import "../__dc_back2/i.ts";\n`);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s2.ts`, VAL);
  fx(`${S}/infra/providers/vllm/surfaces/__dc_s1.ts`, `import "./__dc_s2.ts";\n`);
  fx(`${S}/infra/providers/backends/agent-sdk/__dc.ts`, VAL);
  fx(`${S}/infra/providers/backends/openrouter/__dc.ts`, `import "../agent-sdk/__dc.ts";\n`);

  // ── persistence + stats + hygiene ──
  fx(`${S}/domain/__dc_feat/persistence/io.ts`, `import "node:fs";\n`);
  if (!existsSync(join(ROOT, EMBEDDINGS))) {
    fx(EMBEDDINGS, VAL);
    createdEmbeddings = true;
  }
  fx(`${S}/domain/stats/__dc.ts`, `import "../../../../db/src/schema/embeddings.ts";\n`);
  fx("packages/kit/src/__dc/totest.ts", `import "../../../../tests/support/clock.ts";\n`);

  // not-to-dev-dep: a production src file importing a PURE devDependency. drizzle-kit is db's devDep;
  // db's runtime drizzle-orm resolves as `npm` (not `npm-dev`) so it would NOT fire — only pure devDeps do.
  fx(
    "packages/db/src/__dc/devdep.ts",
    `import { defineConfig } from "drizzle-kit";\nexport const x = defineConfig;\n`,
  );
}

interface Violation {
  readonly from: string;
  readonly to: string;
  readonly rule: { readonly name: string };
}

function runCruise(): Violation[] {
  let stdout: string;
  try {
    stdout = execFileSync(
      "pnpm",
      [
        "exec",
        "depcruise",
        "packages",
        "--config",
        ".dependency-cruiser.cjs",
        "--output-type",
        "json",
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
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
  fixtureFiles = new Set(
    violations
      .flatMap((v) => [v.from, v.to])
      .filter((p) => DC_FIXTURE_RE.test(p) || p === EMBEDDINGS),
  );
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
