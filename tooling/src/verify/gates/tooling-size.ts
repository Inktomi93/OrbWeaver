// Gate: tooling-size (docs/design/tooling-package.md §4.3) — the tooling twin of component-size: any
// tooling/src file >450 lines is RED; a cli.ts >200 is RED (argv parse + dispatch ONLY — the cap is what
// decomposes the monoliths BEFORE they land: snap 4,513 / ast 6,241 / codemod-kit 3,385 cannot move
// un-split). DECLARED CARVE: `verify/gates/**` is cap-exempt after P6 — a gate file is a single-purpose
// contract-headed module (largest live: 883 lines) and splitting one is worse than a long one. Counts comment lines (comments-INTENDED, like component-size).
import type { GateDescriptor } from "../contract/gate.ts";

const CAP_DEFAULT = 450;
const CAP_CLI = 200;
const TOOLING_PREFIX = "tooling/src/";
const GATES_CARVE = "tooling/src/verify/gates/";
const TRAILING_NL = /\n$/u;

function relOf(abs: string): string | null {
  const i = abs.replace(/\\/gu, "/").indexOf(`/${TOOLING_PREFIX}`);
  return i === -1 ? null : abs.slice(i + 1);
}

export const gate: GateDescriptor = {
  name: "tooling-size",
  docRow: "Core-Enforcement-Active-Gates.md (docs/design/tooling-package.md §4.3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a @orb/tooling source file exceeds the hard line cap (default 450; cli.ts 200) — split into ops/ files or extract pure helpers to lib/; a monolith tool is the drawer this package exists to end (docs/design/tooling-package.md §4.3).",
  fix: "decompose: one ops/ file per command family, pure logic to lib/, shapes to contract/; a cli.ts holds argv parse + dispatch only.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  visitFile: (sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null || rel.startsWith(GATES_CARVE)) {
      return;
    }
    // Trim a single trailing newline so a file ending in "\n" isn't counted one line over (the
    // component-size counting rule).
    const lines = sf.getFullText().replace(TRAILING_NL, "").split("\n").length;
    const cap = rel.endsWith("/cli.ts") ? CAP_CLI : CAP_DEFAULT;
    if (lines > cap) {
      ctx.report({ file: rel, line: 0, column: 0, message: `${lines} lines (cap ${cap}) — decompose before it grows (docs/design/tooling-package.md §4.3)` });
    }
  },
  mustFlag: [
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
      at: "tooling/src/snap/ops/big.ts",
      expect: { messageIncludes: "cap 450" },
      why: "one line over the default cap — the decomposition trigger",
    },
    {
      files: "export const x = 1;\n".repeat(CAP_CLI + 1),
      at: "tooling/src/snap/cli.ts",
      expect: { messageIncludes: "cap 200" },
      why: "a cli.ts over its tighter cap — argv parse + dispatch only",
    },
  ],
  mustPass: [
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT),
      at: "tooling/src/snap/ops/fits.ts",
      why: "exactly at the cap — passes",
    },
    {
      files: "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
      at: "tooling/src/verify/gates/long-gate.ts",
      why: "the DECLARED verify/gates carve — a gate file over the default cap is deliberate (§4.3)",
    },
  ],
};
