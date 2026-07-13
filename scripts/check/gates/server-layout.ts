// Gate: server-layout (core/Core-0-Architecture-and-Structure.md §3)
// The server package's tiers ARE its directories. The only legal items at the root of
// packages/server/src/ are the 6 tier directories and index.ts.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const SERVER_SRC = "packages/server/src";
const ALLOWED_ENTRIES: ReadonlySet<string> = new Set([
  "entry",
  "transport",
  "domain",
  "infra",
  "foundation",
  "kit",
  "index.ts",
]);

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanServerLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  const srcDir = join(root, SERVER_SRC);
  if (!existsSync(srcDir)) {
    return violations;
  }
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!ALLOWED_ENTRIES.has(entry.name)) {
      violations.push({
        file: `${SERVER_SRC}/${entry.name}`,
        line: 0,
        message: `illegal top-level entry '${entry.name}' — packages/server/src/ is locked to the 6 tier directories and index.ts (core/Core-0-Architecture-and-Structure.md §3)`,
      });
    }
  }
  return violations;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// server-layout reads the real fs (readdirSync of packages/server/src) — a `run` descriptor over
// ctx.root reusing the scan, with `fsBacked` so conformance materializes examples to a real temp dir.
// File-level findings. Byte-identical to the legacy Check.
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
  },
  mustFlag: [
    {
      files: { "packages/server/src/stray.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "illegal top-level entry" },
      why: "a stray file at the server src root — locked to the 6 tiers + index.ts (§3)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const y = 1;\n",
      },
      why: "index.ts + a tier directory (domain/) — the sanctioned server root, passes",
    },
  ],
};
