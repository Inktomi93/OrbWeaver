// Gate: server-layout (core/Core-0-Architecture-and-Structure.md §3)
// The server package's tiers ARE its directories. The only legal items at the root of
// packages/server/src/ are the 6 tier directories and index.ts.
//
// TIER_ENTRIES IS THE LAW, NOT AN EXEMPTION (GATE-AUTHORING.md §4 — "if the collection is not an exemption,
// rename it out of the exemption vocabulary"): it enumerates §3's legal set, and nothing here is a granted
// pass for a violation. It is still TWO-SIDED, at the mirror grain the law implies: an entry the law names
// that is NOT on disk is RED — a deleted tier must be a deliberate act (amend §3 + this list), never a line
// that quietly permits a name nothing occupies. The arm self-guards on a REAL-TREE ANCHOR (GATE-AUTHORING.md
// §4.5, the real-manifest shape): the workspace manifest, which a conformance temp dir never has.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const SERVER_SRC = "packages/server/src";
/** §3's legal root set: the 6 tier directories + the package entrypoint. */
const TIER_ENTRIES: readonly string[] = ["entry", "transport", "domain", "infra", "foundation", "kit", "index.ts"];
const GATE_SELF = "scripts/check/gates/server-layout.ts";
/** Real-tree anchor (GATE-AUTHORING.md §4.5): the workspace manifest — present on every real run, absent
 *  from the conformance temp dirs. */
const ANCHOR = "pnpm-workspace.yaml";
const MISSING_TIER = (name: string): string =>
  `\`${name}\` is named as a legal server-root entry but does not exist at ${SERVER_SRC}/ — the law names a ` +
  "home nothing occupies (ratchet down). A tier that dies dies deliberately: amend " +
  "core/Core-0-Architecture-and-Structure.md §3 and the TIER_ENTRIES list in scripts/check/gates/server-layout.ts.";

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanServerLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  const srcDir = join(root, SERVER_SRC);
  if (!existsSync(srcDir)) {
    return violations;
  }
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!TIER_ENTRIES.includes(entry.name)) {
      violations.push({
        file: `${SERVER_SRC}/${entry.name}`,
        line: 0,
        message: `illegal top-level entry '${entry.name}' — packages/server/src/ is locked to the 6 tier directories and index.ts (core/Core-0-Architecture-and-Structure.md §3)`,
      });
    }
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "server-layout",
  docRow: "core/Core-0-Architecture-and-Structure.md §3",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "an illegal top-level entry at packages/server/src/ — the server package's root is locked to the 6 tier directories (entry/transport/domain/infra/foundation/kit) + index.ts (core/Core-0-Architecture-and-Structure.md §3).",
  fix: "move the entry into the tier directory it belongs to; only the 6 tiers + index.ts live at the server src root.",
  run: (ctx) => {
    for (const v of scanServerLayout(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    if (!existsSync(join(ctx.root, ANCHOR))) {
      return; // synthetic tree — the mirror arm is a whole-tree claim
    }
    for (const name of TIER_ENTRIES) {
      if (!existsSync(join(ctx.root, SERVER_SRC, name))) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: MISSING_TIER(name) });
      }
    }
  },
  mustFlag: [
    {
      files: { "packages/server/src/stray.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "illegal top-level entry" },
      why: "a stray file at the server src root — locked to the 6 tiers + index.ts (§3)",
    },
    {
      files: {
        "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "does not exist at packages/server/src/" },
      why: "THE MIRROR ARM: with the real-tree anchor present, five tiers + index.ts exist and pass — `kit` is named by the law but absent, so the law names a home nothing occupies and ratchets down",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const y = 1;\n",
      },
      why: "index.ts + a tier directory (domain/) — the sanctioned server root, passes; with no workspace manifest this is not the real tree, so the mirror arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
        "packages/server/src/kit/x.ts": "export const x = 1;\n",
      },
      why: "every named tier occupied, judged against the real-tree anchor — the law and the disk agree, so neither arm fires",
    },
  ],
};
