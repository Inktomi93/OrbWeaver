// Gate: feature-structure (core/Core-0-Architecture-and-Structure.md §7) — every domain feature follows the per-feature template.
// Requires the universal slots: index.ts (front door), service.ts (composition root), context.ts
// (DI bundle), and contract/ + verbs/ dirs. persistence/ and substrate/ are per-feature (export has
// no persistence/; chat/workloads have no substrate/), so they are NOT required here.
//
// Two documented exceptions to "only index/service/context at root":
// - `guard.ts` is a ratified, cross-domain 9th slot (Core-Laws-and-Precedents.md "Committed decisions" —
//   the `can()` authority seam: `requireAdmin` lives in `domain/admin/guard.ts`). It's an I/O-touching,
//   non-verb gate primitive — can't live in zero-I/O `substrate/`, isn't a verb. Allowed at ANY domain root.
// - A handful of domain-specific root singletons, each individually justified in that domain's own spec
//   doc (docs/architecture/domains/<domain>.md) but not yet promoted to the cross-domain ledger.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const DOMAIN_REL = "packages/server/src/domain";
const REQUIRED_FILES = ["index.ts", "service.ts", "context.ts"] as const;
const REQUIRED_DIRS = ["contract", "verbs"] as const;

/** `guard.ts` — the ratified `can()` authority-seam pattern (Core-Laws-and-Precedents.md, Identity/auth/
 *  permission "Committed decisions"). Allowed at any domain root, not just admin's. */
const ALWAYS_ALLOWED_ROOT_FILES = ["guard.ts"] as const;

/** Domain-specific root singletons, sanctioned by that domain's own spec doc:
 *  - chat.md: `bus.ts` (chat bus emitter + replay ring), `active-turns.ts` (in-memory controller Set),
 *    `connected-persona.ts` (one-connection-only auto-activate) — none fit verbs/substrate/a subsystem.
 *  - preset: `constants.ts` (SYSTEM_DEFAULT_PRESET_ID, domain-internal), `seed.ts` (boot-time
 *    ensureSystemDefaultPreset — too small to be its own subsystem).
 *  - settings: `constants.ts` (the theme seed sentinel TypeIDs, domain-internal), `seed-themes.ts`
 *    (boot-time `ensureSeedThemes` — the preset `seed.ts` precedent, named `-themes` since the domain
 *    root's `seed.ts` slot may host a different concern later — themes-design.md §5).
 *  - buddy: `bus.ts` (the observer's per-user reaction feed emitter + replay ring — the chat/bus.ts
 *    precedent; a feature-root collaborator the observer emits onto, PD-45). */
const DOMAIN_SPECIFIC_ROOT_FILES: Readonly<Record<string, readonly string[]>> = {
  buddy: ["bus.ts"],
  chat: ["bus.ts", "active-turns.ts", "connected-persona.ts"],
  preset: ["constants.ts", "seed.ts"],
  settings: ["constants.ts", "seed-themes.ts"],
};

function isAllowedRootFile(feature: string, fileName: string): boolean {
  const allNames: readonly string[] = REQUIRED_FILES;
  if (
    allNames.includes(fileName) ||
    (ALWAYS_ALLOWED_ROOT_FILES as readonly string[]).includes(fileName)
  ) {
    return true;
  }
  return (DOMAIN_SPECIFIC_ROOT_FILES[feature] ?? []).includes(fileName);
}

function checkRequiredSlots(featureDir: string, feature: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(featureDir, file))) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${file}`,
        line: 0,
        message: `missing template file '${file}' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(featureDir, dir))) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${dir}/`,
        line: 0,
        message: `missing template dir '${dir}/' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  return violations;
}

function checkLooseFiles(featureDir: string, feature: string): Violation[] {
  const violations: Violation[] = [];
  for (const entry of readdirSync(featureDir, { withFileTypes: true })) {
    if (entry.isFile() && !isAllowedRootFile(feature, entry.name)) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${entry.name}`,
        line: 0,
        message: `loose file '${entry.name}' not allowed at feature root (must be index.ts, service.ts, context.ts, guard.ts, or a domain-specific documented root file — Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  return violations;
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanFeatureStructure(root: string): Violation[] {
  const violations: Violation[] = [];
  const domainDir = join(root, DOMAIN_REL);
  if (!existsSync(domainDir)) {
    return violations;
  }
  for (const feature of readdirSync(domainDir)) {
    const featureDir = join(domainDir, feature);
    if (!statSync(featureDir).isDirectory()) {
      continue;
    }
    violations.push(
      ...checkRequiredSlots(featureDir, feature),
      ...checkLooseFiles(featureDir, feature),
    );
  }
  return violations;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// feature-structure reads the real filesystem (readdirSync/existsSync/statSync of the domain dir), never
// the ts-morph Project — so it ports as a `run` descriptor over ctx.root reusing the exact scan, and
// declares `fsBacked` so the conformance runner materializes its examples into a real temp dir. Findings
// are file-level (line 0). Byte-identical to the legacy Check.
export const gate: GateDescriptor = {
  name: "feature-structure",
  docRow: "core/Core-0-Architecture-and-Structure.md §7 (§4)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a domain feature does not follow the per-feature template — it is missing a required slot (index.ts / service.ts / context.ts / contract/ / verbs/) or carries a loose non-template file at its root (Core-0-Architecture-and-Structure.md §4).",
  fix: "add the missing template slot, or move the loose file into verbs/ / substrate/ / a subsystem (only index/service/context/guard + documented singletons live at the feature root).",
  run: (ctx) => {
    for (const v of scanFeatureStructure(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: { "packages/server/src/domain/broken/index.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "missing template" },
      why: "a domain feature with only index.ts — missing service.ts/context.ts/contract/verbs (§4)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/whole/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/whole/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/whole/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/whole/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/whole/verbs/x.ts": "export const v = 1;\n",
      },
      why: "a feature with all required slots (index/service/context + contract/ + verbs/) — the template, passes",
    },
  ],
};
