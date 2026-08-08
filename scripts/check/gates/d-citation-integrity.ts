// Gate: d-citation-integrity — the D-ledger (Core-Path-Registry.md) is the ONE home for standing rulings;
// code + core docs cite one as a bare `D<n>`. Makes the registry↔citation link physics: every bare `D<n>`
// in packages/** + docs/architecture/core/** must resolve against the LIVE registry — either it has an
// entry anchor `- **D<n>** —`, or it falls inside the RESERVED RANGE (D79–D105, main-era rulings that
// rolled back while the surviving code kept citing them). A citation above the live ceiling and outside any
// anchor/reserved slot is DANGLING (RED). The D-sibling of pd-citation-integrity (same scan machinery,
// keyed off the registry's own anchors — NEVER a hardcoded ceiling, which would be the
// path-keyed-gates-die-on-rename failure in number form). Catches the F2 dangling-D class (the
// contracts-layer audit's #1 gate rec): code citing D-numbers that resolve to nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

// The LIVE registry. Shared as the ONE anchor of this gate — a registry move updates the constant here.
const REGISTRY = "docs/architecture/core/Core-Path-Registry.md";
// Registry entry anchor. Both forms in the file: `- **D66 — title.**` (em-dash INSIDE the bold) and
// `- **D67** — …` — the `\b` after the digits matches both (`**` or a space follows). The `^- ` prefix pins
// it to a list-item anchor, so a prose `D79` mention (e.g. the reserved-range note's own body) never
// registers as an entry.
const ANCHOR_RE = /^- \*\*D(\d+)\b/gmu;
// The reserved-range note is machine-anchored on this exact literal — `**RESERVED RANGE — D<lo>–D<hi>:**`
// (an en-dash between the two numbers, matching the note's own text). Keying off THIS (not a hardcoded
// 79..105 pair) means the range moves with the note. If the note text is ever rephrased, this gate goes RED
// on every reserved citation loudly — the reserved range is load-bearing, so a silent drift is unacceptable.
const RESERVED_RE = /\*\*RESERVED RANGE\s*[—-]\s*D(\d+)[–-]D(\d+)/u;
// A bare `D<n>` citation. The non-`P`/non-word/non-hyphen left boundary is the audit's measured
// false-positive control: it excludes `PD-<n>` (the sibling namespace pd-citation-integrity owns) and any
// `<word>D<n>` substring, while still matching `D79`, `(D79`, ` D79`, `,D79`.
const CITE_RE = /(?<![A-Za-z0-9-])D(\d+)\b/gu;
// The gate corpus: shipped code + the CORE doc set. history/** is scoped OUT — archaeology legitimately
// cites dead/renumbered ledger entries. The registry file itself IS scanned (its own cross-refs must
// resolve), which is why ANCHOR_RE pins to the list-item form, not a bare `D79` in the reserved note.
function inScope(rel: string): boolean {
  if (rel.startsWith("packages/") && (rel.endsWith(".ts") || rel.endsWith(".tsx"))) {
    return true;
  }
  return rel.startsWith("docs/architecture/core/") && rel.endsWith(".md");
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The live registry: the set of minted entry numbers + the reserved [lo, hi] range. */
function readRegistry(root: string): { ids: Set<number>; reserved: { lo: number; hi: number } | null } {
  const ids = new Set<number>();
  let reserved: { lo: number; hi: number } | null = null;
  const path = join(root, REGISTRY);
  if (!existsSync(path)) {
    return { ids, reserved };
  }
  const text = readFileSync(path, "utf8");
  for (const m of text.matchAll(ANCHOR_RE)) {
    const n = m[1];
    if (n !== undefined) {
      ids.add(Number(n));
    }
  }
  const r = RESERVED_RE.exec(text);
  if (r?.[1] !== undefined && r[2] !== undefined) {
    reserved = { lo: Number(r[1]), hi: Number(r[2]) };
  }
  return { ids, reserved };
}

function resolves(n: number, ids: Set<number>, reserved: { lo: number; hi: number } | null): boolean {
  if (ids.has(n)) {
    return true;
  }
  return reserved !== null && n >= reserved.lo && n <= reserved.hi;
}

/** Dangling `D<n>` citations in one file (number has no registry anchor and is outside the reserved range). */
function danglingCitesIn(sf: SourceFile, root: string, ids: Set<number>, reserved: { lo: number; hi: number } | null): Violation[] {
  const out: Violation[] = [];
  const text = sf.getFullText();
  for (const m of text.matchAll(CITE_RE)) {
    const raw = m[1];
    if (raw === undefined || m.index === undefined) {
      continue;
    }
    const n = Number(raw);
    if (!resolves(n, ids, reserved)) {
      // @finding-overload-ok: a TEXT-scan position — `m.index` is a regex match offset into the raw file text (a citation in a comment or a doc), NOT a node start, so there is nothing for hasGateIgnore to read a marker off. Ends if this scanner ever resolves its hits to real nodes
      out.push({
        file: relPath(root, sf.getFilePath()),
        line: sf.getLineAndColumnAtPos(m.index).line,
        message: `D${n} cites a D-ledger entry with no anchor and outside the reserved range (D79–D105) — mint the entry, fix the number, or drop the citation. See Core-Path-Registry.md.`,
      });
    }
  }
  return out;
}

/** Whole-tree reconciliation: the live registry (fs) vs every bare `D<n>` citation in the scoped corpus. */
function reconcileDCitations(root: string, project: Project): Violation[] {
  const violations: Violation[] = [];
  const { ids, reserved } = readRegistry(root);
  for (const sf of project.getSourceFiles()) {
    if (!inScope(relPath(root, sf.getFilePath()))) {
      continue;
    }
    violations.push(...danglingCitesIn(sf, root, ids, reserved));
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "d-citation-integrity",
  docRow: "core/Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a bare D<n> ledger citation resolves to nothing — it has no `- **D<n>** —` anchor in Core-Path-Registry.md and is not inside the reserved range (D79–D105). A dangling D-citation is drift a reader can't distinguish from a real ruling. See Core-Path-Registry.md.",
  fix: "mint the entry in Core-Path-Registry.md (next free is D106+), fix the number to an existing entry, or drop the citation. Reserved-range numbers (D79–D105) resolve as-is until re-minted.",
  run: (ctx) => {
    for (const v of reconcileDCitations(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "packages/contracts/src/x.ts": "// per D999 — a dangling citation, no anchor, above the ceiling.\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "cites a D-ledger entry with no anchor" },
      why: "a bare D999 citation with no registry anchor and above the reserved range — a dangling D-citation (the F2 class)",
    },
  ],
  mustPass: [
    {
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        // D1 resolves via the anchor; D99 resolves via the reserved range; PD-17 is the sibling
        // namespace (excluded by the non-P left boundary) and must NOT trip this gate.
        "packages/contracts/src/y.ts": "// per D1 (anchored), D99 (reserved), FLAG[PD-17] (sibling — not a D cite).\nexport const y = 1;\n",
      },
      why: "an anchored D1 + a reserved-range D99 + a PD-17 (sibling namespace) — every citation resolves, the link is intact",
    },
  ],
};
