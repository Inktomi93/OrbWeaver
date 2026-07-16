// Gate: gate-ignore-inventory — every `// @orb-gate-ignore <name>` suppression comment under
// `packages/**` must name a REAL registered gate. The loader IS the registry (`loader.ts`); an ignore
// naming a nonexistent/retired gate is stale suppression rot — it silently protects nothing (the gate
// it once dodged is gone, or never existed) while looking like an active exemption. Registered names are
// derived from each gate file's FILENAME (basename minus .ts), not a `name:` literal scan — the loader
// hard-enforces `descriptor.name === filename`, so the filename is the only source that cannot drift (a
// gate file can contain other `name:` literals in its own internal config objects, e.g.
// no-parallel-section-map.ts's `SectionId` vocab entry, which a first-match literal regex would
// misidentify as the registered name). Self-hosts via its own fs read of the gates dir (fsBacked —
// mirrors enforcement-registry-parity.ts), never importing loader.ts, so no import cycle.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";

const GATES_DIR_REL = "scripts/check/gates";
const TS_EXT_RE = /\.ts$/u;
const GATE_IGNORE_RE = /\/\/\s*@orb-gate-ignore\s+([a-zA-Z0-9-]+)/gu;

const MESSAGE =
  "`// @orb-gate-ignore <name>` names a gate that isn't registered (scripts/check/gates/) — stale suppression rot: either the gate was retired (delete the ignore comment) or the name is a typo (fix it to the real gate's kebab-case filename).";
const FIX = "delete the stale `@orb-gate-ignore` comment (its gate is gone), or correct the name to match a real gate file in scripts/check/gates/.";

/** Every registered gate's name, derived from its FILENAME (basename minus .ts) — the loader
 *  hard-enforces descriptor.name === filename, so the filename is the truth (fsBacked — this gate's
 *  own read of the gates dir, never importing the loader). */
function discoverGateNames(gatesDir: string): ReadonlySet<string> {
  if (!existsSync(gatesDir)) {
    return new Set();
  }
  const names = new Set<string>();
  for (const entry of readdirSync(gatesDir).sort()) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    names.add(entry.replace(TS_EXT_RE, ""));
  }
  return names;
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const gate: GateDescriptor = {
  name: "gate-ignore-inventory",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/"),
  visitFile: (sf, ctx) => {
    const registered = discoverGateNames(join(ctx.root, GATES_DIR_REL));
    const text = sf.getFullText();
    const lines = text.split("\n");
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(GATE_IGNORE_RE)) {
        const name = match[1];
        if (name !== undefined && !registered.has(name)) {
          ctx.report({
            file: relPath(ctx.root, sf.getFilePath()),
            line: index + 1,
            column: 0,
            token: name,
          });
        }
      }
    }
  },
  mustFlag: [
    {
      files: {
        "scripts/check/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore no-such-gate this comment names a retired/nonexistent gate\nexport const x = 1;\n",
      },
      why: "the ignore names a gate that doesn't exist in scripts/check/gates/ — stale suppression rot",
    },
    {
      files: {
        "scripts/check/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/server/src/domain/x/x.ts": "  // @orb-gate-ignore   no-such-gate-2   odd spacing before/after the name\n  export const y = 2;\n",
      },
      expect: { messageIncludes: "isn't registered" },
      why: "odd comment spacing (extra indent + extra spaces before/after the name) must still be parsed and still RED on a fake name",
    },
  ],
  mustPass: [
    {
      files: {
        "scripts/check/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate this ignore names a real registered gate\nexport const x = 1;\n",
      },
      why: "the ignore names `real-gate`, a registered descriptor discovered from scripts/check/gates/ — passes",
    },
    {
      files: {
        // A decoy `name:` literal (an internal vocab entry, mirroring no-parallel-section-map.ts's
        // `SectionId` config object) appears BEFORE the descriptor's own `name:` literal in the same
        // file — a first-match literal-regex scan would register the decoy, not the real gate, and
        // wrongly RED a legitimate ignore naming it. Filename-derived discovery isn't fooled: the
        // registered name is always the basename, regardless of what literals the file's body contains.
        "scripts/check/gates/parallel-map-gate.ts":
          'const vocab = { name: "SectionId", ids: ["a", "b"] };\nexport const gate = { name: "parallel-map-gate", vocab };\n',
        "packages/ui/src/x/x.ts":
          "// @orb-gate-ignore parallel-map-gate this ignore names the real gate, whose file also carries a decoy name literal\nexport const x = 1;\n",
      },
      why: "a legit ignore naming a gate whose file has a decoy name literal before its descriptor name must still pass — filename is the truth, not a first-match literal scan",
    },
  ],
};
