// Gate: enforcement-registry-parity — Core-Enforcement-Active-Gates.md must agree with the DISCOVERED
// gate-descriptor set (the loader IS the registry): its Layer-3 ACTIVE table names exactly the
// `status:"active"` descriptors, its DORMANT table exactly the `status:"dormant"` ones, and its "(N
// registered gates)" count matches — and that count has ONE home, so a SECOND core doc stating a figure for
// it is RED too (`client-architecture-lockdown.md` froze at 133 while the registry held 207). Both directions RED. Self-hosts via its own ts-morph Project (fsBacked) — never imports report.ts, so no import cycle.
// DESCRIPTION MIRRORS (#910): a row whose description COPIES its descriptor's runtime `message` is a
// coupled site, and it drifted silently for months (`no-if-is-group` taught retired vocabulary in the very
// string a violating agent reads). A mirror is DECLARED by ending the description cell with
// `(@mirrors-message)` — never DERIVED, because a derived rule stops recognising the row at the exact
// moment it drifts, which is the definition of an unfailable gate. Three arms: a declared mirror that
// differs from the message is RED; a declared mirror whose message is not statically readable is RED (the
// promise must be keepable); and an UNDECLARED row byte-equal to the message is RED too, so the vocabulary
// cannot be dodged by copying without saying so. DECLARED LIMIT: a PARAPHRASE is prose and is not judged —
// mirror fully and declare it, or summarize; there is no third state a checker can police. Census at mint
// (2026-09-01): 3 byte-exact mirrors of 247 rows, 234 independent prose, 9 messages this reader cannot
// resolve (a call/property-access initializer) — those are counted, never silently skipped.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { readExpressionString } from "../lib/config-static-read.ts";

const CORE_DOCS_REL = "docs/architecture/core";
const DOC_REL = `${CORE_DOCS_REL}/Core-Enforcement-Active-Gates.md`;
const GATES_DIR_REL = "tooling/src/verify/gates";
const TS_EXT_RE = /\.ts$/u;
const COUNT_RE = /\((?<count>\d+) registered gates\)/u;
/** WIDER than COUNT_RE on purpose: a second home does not have to copy the parenthesised spelling, and the
 *  one that rotted did not (`**133 registered gates**`). Any FIGURE beside the phrase is the violation. */
const ANY_COUNT_RE = /\d+\s+registered gates/u;
const ACTIVE_TABLE_START_RE = /## Layer 3 — Structural gates/u;
const DORMANT_TABLE_START_RE = /### Layer 3 — DORMANT structural gates/u;
const TABLE_ROW_RE = /^\|\s*`(?<name>[a-zA-Z0-9-]+)`\s*\|(?<rest>.*)$/gmu;

/** Every gate row in a doc REGION, with its description cell and its absolute line number. The description
 *  is the FIRST cell after the name, bounded by the next UNESCAPED pipe (a row carries five trailing empty
 *  columns, and a description may contain an escaped pipe). */
function tableRows(doc: string, region: string, regionStart: number): DocRow[] {
  const before = doc.slice(0, Math.max(regionStart, 0)).split("\n").length - 1;
  return [...region.matchAll(TABLE_ROW_RE)].map((m) => {
    const rest = m.groups?.["rest"] ?? "";
    const end = CELL_END_RE.exec(rest);
    return {
      name: m.groups?.["name"] ?? "",
      description: (end === null ? rest : rest.slice(0, end.index)).trim().replaceAll("\\|", "|"),
      line: before + region.slice(0, m.index).split("\n").length,
    };
  });
}

/** The Layer-3 ACTIVE table's rows, between its header and the DORMANT sub-table. */
function activeTableRows(doc: string): DocRow[] {
  const start = doc.search(ACTIVE_TABLE_START_RE);
  const dormantStart = doc.search(DORMANT_TABLE_START_RE);
  return tableRows(doc, doc.slice(start, dormantStart === -1 ? undefined : dormantStart), start);
}

// The loader IS the registry, so this gate compares the doc to the contract: every gate file exports a
// `gate` descriptor with a name + a status; the doc's ACTIVE table == the set of `status:"active"`
// descriptors, the DORMANT table == the `status:"dormant"` descriptors, and the "(N registered gates)"
// count == the active-descriptor count. It reads each `tooling/src/verify/gates/*.ts` descriptor's
// name+status straight from the source AST, never importing report.ts.
const STATUS_ACTIVE = "active";
const STATUS_DORMANT = "dormant";

interface DescriptorMeta {
  readonly name: string;
  readonly status: string;
  /** The descriptor's runtime `message`, statically evaluated — `undefined` when its initializer is a
   *  shape the ordered evaluator cannot read (a call, a property access). Never guessed. */
  readonly message: string | undefined;
}

/** One Layer-3 doc row: its gate name, its description cell, and the 1-based line it sits on. */
interface DocRow {
  readonly name: string;
  readonly description: string;
  readonly line: number;
}

/** A description cell ENDING with this marker declares itself a verbatim copy of the descriptor's runtime
 *  `message`. Opt-IN to a stricter check, not a suppression — so, unlike the `@orb-gate-ignore` family
 *  (GATE-AUTHORING.md §4.3), it carries no reason: the reason is the byte-equality it promises. */
/** Conformance fixture paths — the gate reads exactly these two real-tree coordinates. */
const GATE_FILE = `${GATES_DIR_REL}/x.ts`;
const DOC_FILE = DOC_REL;
const MIRROR_MARKER = "(@mirrors-message)";
/** The corpus size at which the mirror reader's blindness tripwire comes alive — the real gate dir holds
 *  ~250 descriptors; a conformance mini-project plants one or two. */
const MIRROR_READER_ANCHOR = 50;
/** An UNESCAPED table-cell boundary — a description may carry `\|` inside it. */
const CELL_END_RE = /(?<!\\)\|/u;

const DOC_ACTIVE_MISSING = (name: string): string =>
  `active gate "${name}" (its descriptor is status:"active") has no row in ${DOC_REL}'s Layer-3 ACTIVE ` +
  "table — add it (docs/architecture/core/Core-Enforcement-Active-Gates.md).";
const DOC_ACTIVE_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 ACTIVE table names "${name}" but no active descriptor of that name exists ` +
  '(tooling/src/verify/gates/) — remove the row, or set the gate\'s status to "active".';
const DOC_DORMANT_MISSING = (name: string): string =>
  `dormant gate "${name}" (its descriptor is status:"dormant") has no row in ${DOC_REL}'s Layer-3 ` +
  "DORMANT table — add it (docs/architecture/core/Core-Enforcement-Active-Gates.md).";
const DOC_DORMANT_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 DORMANT table names "${name}" but no dormant descriptor of that name exists ` +
  '(tooling/src/verify/gates/) — remove the row, or set the gate\'s status to "dormant".';
const SECOND_COUNT_HOME = (rel: string): string =>
  `${rel} states its own "(N registered gates)" figure — the count has ONE home (${DOC_REL}), where this ` +
  "gate checks it against the discovered descriptor set. A second copy is ungated by construction and " +
  'rots silently (this one sat at "133 registered gates" for a month past the real 207). Cite ' +
  `${DOC_REL} instead of restating the number.`;
const COUNT_CONTRACT_MISMATCH = (docCount: number, actual: number): string =>
  `${DOC_REL} declares "${docCount} registered gates" but there are ${actual} active gate descriptors ` +
  "(tooling/src/verify/gates/) — update the count line (docs/architecture/core/Core-Enforcement-Active-Gates.md).";

const MIRROR_DRIFT = (name: string): string =>
  `${DOC_REL}'s row for "${name}" declares itself a MIRROR of the gate's runtime \`message\` ` +
  `(the ${MIRROR_MARKER} marker) but the two texts differ. The doc row and the descriptor's message are ONE ` +
  "coupled site: the string a violating agent READS is the descriptor's, so a drifted doc row teaches " +
  "vocabulary the gate does not speak (no-if-is-group taught retired roster words for months, #909). " +
  `Repair the doc cell to the descriptor's message byte-for-byte, or drop the ${MIRROR_MARKER} marker and ` +
  "write an independent summary.";
const MIRROR_UNVERIFIABLE = (name: string): string =>
  `${DOC_REL}'s row for "${name}" declares itself a MIRROR (${MIRROR_MARKER}) but that gate's \`message\` ` +
  "initializer is a shape the ordered string evaluator cannot read (a call, a property access), so the " +
  "promise is UNKEEPABLE and a ✓ here would be a lie about a check that never ran. Spell the message as a " +
  "literal/const the reader resolves (tooling/src/verify/lib/config-static-read.ts), or drop the marker and " +
  "summarize.";
const UNDECLARED_MIRROR = (name: string): string =>
  `${DOC_REL}'s row for "${name}" is BYTE-EQUAL to the gate's runtime \`message\` but does not declare it. ` +
  `Append ${MIRROR_MARKER} to the description cell so the pair is checked from now on — an undeclared copy ` +
  "is exactly the row that drifts unnoticed, because nothing knows it was ever coupled.";
const MIRROR_READER_BLIND = (total: number): string =>
  `zero of ${total} gate descriptors yielded a readable \`message\` — the ordered string evaluator has rotted ` +
  "past the whole corpus, so every mirror verdict below is vacuous (GATE-AUTHORING.md §4.6). Re-derive the " +
  "reader in tooling/src/verify/lib/config-static-read.ts.";

/** The string value of an object literal's `status`/`name` property (inline literal only). */
function literalProp(obj: Node, key: string): string | undefined {
  if (!Node.isObjectLiteralExpression(obj)) {
    return;
  }
  const prop = obj.getProperty(key);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** An object-literal property evaluated through the shared ORDERED string evaluator — every `message` in the
 *  corpus is built from `+`-concatenated fragments, and most sit behind a named const, so a bare
 *  `isStringLiteral` read here would be the literal-shape blindness class. `undefined` = "I could not read
 *  it", never "it is empty": the caller turns that into a loud arm for a DECLARED mirror. */
function evaluatedProp(obj: Node, key: string): string | undefined {
  if (!Node.isObjectLiteralExpression(obj)) {
    return;
  }
  const prop = obj.getProperty(key);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  if (init === undefined) {
    return;
  }
  const read = readExpressionString(init);
  return read.unresolved.length === 0 && read.values.length === 1 ? read.values[0] : undefined;
}

/** The MIRROR arms (#910): a declared mirror must equal its descriptor's message byte-for-byte, a declared
 *  mirror whose message is unreadable is a promise nothing can keep, and an UNDECLARED byte-equal row must
 *  declare itself — otherwise the vocabulary is optional and the coupling stays invisible. Rows naming no
 *  descriptor are the ORPHAN arms' business, not this one's. */
function mirrorViolations(rows: readonly DocRow[], byName: ReadonlyMap<string, DescriptorMeta>): Violation[] {
  const out: Violation[] = [];
  for (const row of rows) {
    const meta = byName.get(row.name);
    if (meta === undefined) {
      continue;
    }
    if (!row.description.endsWith(MIRROR_MARKER)) {
      if (meta.message !== undefined && row.description === meta.message) {
        out.push({ file: DOC_REL, line: row.line, message: UNDECLARED_MIRROR(row.name) });
      }
      continue;
    }
    const mirrored = row.description.slice(0, -MIRROR_MARKER.length).trim();
    if (meta.message === undefined) {
      out.push({ file: DOC_REL, line: row.line, message: MIRROR_UNVERIFIABLE(row.name) });
    } else if (mirrored !== meta.message) {
      out.push({ file: DOC_REL, line: row.line, message: MIRROR_DRIFT(row.name) });
    }
  }
  return out;
}

/** One gate file's `export const gate: GateDescriptor = { name, status, message, … }` descriptor, or
 *  undefined when the file registers nothing readable (the loader tolerates a legacy-only module). */
function descriptorOf(sf: SourceFile): DescriptorMeta | undefined {
  const init = sf.getVariableDeclaration("gate")?.getInitializer();
  const obj = init?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (obj === undefined) {
    return;
  }
  const name = literalProp(obj, "name");
  const status = literalProp(obj, "status");
  return name === undefined || status === undefined ? undefined : { name, status, message: evaluatedProp(obj, "message") };
}

/** Every descriptor's name+status+message, read from the gate-file source AST (fsBacked — this gate's own
 *  Project over the gates dir). */
function discoverDescriptorMeta(gatesDir: string): DescriptorMeta[] {
  if (!existsSync(gatesDir)) {
    return [];
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const out: DescriptorMeta[] = [];
  for (const entry of readdirSync(gatesDir).sort()) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    const meta = descriptorOf(project.addSourceFileAtPath(join(gatesDir, entry)));
    if (meta !== undefined) {
      out.push(meta);
    }
  }
  return out;
}

/** The Layer-3 DORMANT table's rows (after the DORMANT header to end-of-doc). */
function dormantTableRows(doc: string): DocRow[] {
  const start = doc.search(DORMANT_TABLE_START_RE);
  return start === -1 ? [] : tableRows(doc, doc.slice(start), start);
}

function reconcileTable(
  descriptorNames: ReadonlySet<string>,
  docNames: ReadonlySet<string>,
  missing: (name: string) => string,
  orphan: (name: string) => string,
): Violation[] {
  const violations: Violation[] = [];
  for (const name of descriptorNames) {
    if (!docNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: missing(name) });
    }
  }
  for (const name of docNames) {
    if (!descriptorNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: orphan(name) });
    }
  }
  return violations;
}

function contractCountViolations(doc: string, activeCount: number): Violation[] {
  const match = COUNT_RE.exec(doc);
  if (match === null) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message: `${DOC_REL} has no "(N registered gates)" count line to check against the active descriptor set (docs/architecture/core/Core-Enforcement-Active-Gates.md).`,
      },
    ];
  }
  const declared = Number(match.groups?.["count"]);
  return declared === activeCount ? [] : [{ file: DOC_REL, line: 0, message: COUNT_CONTRACT_MISMATCH(declared, activeCount) }];
}

/** The count has ONE home. A SECOND copy of it in another core law doc is ungated by construction (this
 *  gate reads exactly one file), and `client-architecture-lockdown.md` carried "133 registered gates" for a
 *  month past the real 207 — a law doc lying about the enforcement inventory. Any other
 *  `docs/architecture/core/*.md` stating a NUMBER of registered gates is RED: cite the doc, never
 *  restate the figure. */
function secondCountHomeViolations(root: string): Violation[] {
  const dir = join(root, CORE_DOCS_REL);
  if (!existsSync(dir)) {
    return [];
  }
  const out: Violation[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const rel = `${CORE_DOCS_REL}/${entry}`;
    if (!entry.endsWith(".md") || rel === DOC_REL) {
      continue;
    }
    const text = readFileSync(join(dir, entry), "utf-8");
    const line = text.split("\n").findIndex((l) => ANY_COUNT_RE.test(l));
    if (line !== -1) {
      out.push({ file: rel, line: line + 1, message: SECOND_COUNT_HOME(rel) });
    }
  }
  return out;
}

/** The contract-conformance reconciliation shared by the descriptor's `run` and its self-test. */
function reconcileContract(root: string): Violation[] {
  const docPath = join(root, DOC_REL);
  if (!existsSync(docPath)) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message: "docs/architecture/core/Core-Enforcement-Active-Gates.md is missing (docs/architecture/core/Core-Enforcement-Active-Gates.md).",
      },
    ];
  }
  const doc = readFileSync(docPath, "utf-8");
  const descriptors = discoverDescriptorMeta(join(root, GATES_DIR_REL));
  const active = new Set(descriptors.filter((d) => d.status === STATUS_ACTIVE).map((d) => d.name));
  const dormant = new Set(descriptors.filter((d) => d.status === STATUS_DORMANT).map((d) => d.name));
  const byName = new Map(descriptors.map((d) => [d.name, d] as const));
  const rows = [...activeTableRows(doc), ...dormantTableRows(doc)];
  // The §4.6 blindness tripwire for the mirror reader: an anchor-sized corpus yielding NO readable message
  // means every mirror verdict is vacuous. Guarded on the real corpus size so a conformance mini-project
  // (which plants one or two descriptors) cannot fire it.
  const readable = descriptors.filter((d) => d.message !== undefined).length;
  const readerBlind =
    descriptors.length >= MIRROR_READER_ANCHOR && readable === 0 ? [{ file: DOC_REL, line: 0, message: MIRROR_READER_BLIND(descriptors.length) }] : [];
  return [
    ...contractCountViolations(doc, active.size),
    ...secondCountHomeViolations(root),
    ...reconcileTable(active, new Set(activeTableRows(doc).map((r) => r.name)), DOC_ACTIVE_MISSING, DOC_ACTIVE_ORPHAN),
    ...reconcileTable(dormant, new Set(dormantTableRows(doc).map((r) => r.name)), DOC_DORMANT_MISSING, DOC_DORMANT_ORPHAN),
    ...readerBlind,
    ...mirrorViolations(rows, byName),
  ];
}

export const gate: GateDescriptor = {
  name: "enforcement-registry-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    'Core-Enforcement-Active-Gates.md disagrees with the discovered gate-descriptor set — its ACTIVE table must list exactly the status:"active" gates, its DORMANT table exactly the status:"dormant" gates, and its "(N registered gates)" count must equal the active-descriptor count; that count has ONE home, so no other docs/architecture/core doc may state a figure for it; and a row whose description MIRRORS the gate\'s runtime `message` declares it with the `(@mirrors-message)` marker and then matches byte-for-byte, in both directions (Core-Enforcement-Active-Gates.md).',
  fix: "add/remove the doc row for the gate (ACTIVE vs DORMANT tables match the descriptor's status), update the \"(N registered gates)\" count to the active-descriptor total in docs/architecture/core/Core-Enforcement-Active-Gates.md, and in any other core doc CITE that line instead of restating the number. For a MIRROR row: repair the description to the descriptor's message byte-for-byte and keep the `(@mirrors-message)` marker at the end of the cell, or drop the marker and write an independent summary — a copy that does not say it is a copy is the row that drifts.",
  run: (ctx) => {
    for (const v of reconcileContract(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "ACTIVE table" },
      why: "an active descriptor `x` with no ACTIVE-table row (and a count that ignores it) — the doc lies about the registry",
    },
    {
      files: {
        // No active descriptors, but the ACTIVE table names `ghost` — a doc row for a gate that doesn't exist.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `ghost` | names no descriptor |\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n",
      },
      expect: { messageIncludes: "no active descriptor of that name exists" },
      why: "the ACTIVE table names `ghost` with no matching active descriptor — the DOC_ACTIVE_ORPHAN arm",
    },
    {
      files: {
        // A dormant descriptor `x` absent from the DORMANT table — DOC_DORMANT_MISSING.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "DORMANT table" },
      why: "a dormant descriptor `x` with no DORMANT-table row — the DOC_DORMANT_MISSING arm (distinct message)",
    },
    {
      files: {
        // The DORMANT table names `phantom` with no dormant descriptor — DOC_DORMANT_ORPHAN.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n| `phantom` | names no descriptor |\n",
      },
      expect: { messageIncludes: "no dormant descriptor of that name exists" },
      why: "the DORMANT table names `phantom` with no matching dormant descriptor — the DOC_DORMANT_ORPHAN arm",
    },
    {
      files: {
        // The ACTIVE table + descriptor agree, but the count line is wrong (says 0, one active) — COUNT mismatch.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "registered gates" },
      why: "the ACTIVE table matches but the count says 0 for one active descriptor — the COUNT_CONTRACT_MISMATCH arm",
    },
    {
      files: {
        // A SECOND core doc restating the figure. Everything else agrees, so this arm is the only red —
        // and it is spelled the way the live rot was (`**133 registered gates**`, no parentheses).
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
        "docs/architecture/core/client-architecture-lockdown.md": "the authoritative live count is **133 registered gates** (2026-07-16).\n",
      },
      expect: { count: 1, messageIncludes: "ONE home" },
      why: "the live rot, replayed: a second core doc froze the count at 133 while the registry held 207 — one home for the figure, cited everywhere else",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact runtime text" };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | the DRIFTED text (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "declares itself a MIRROR" },
      why: "#910's founding shape — a row that declares itself a copy of the runtime message and has since drifted (no-if-is-group taught retired roster vocabulary in the very string a violating agent reads)",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact runtime text" };\n',
        [DOC_FILE]: "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | the exact runtime text |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "does not declare it" },
      why: "the vocabulary cannot be OPTIONAL: an undeclared byte-equal copy is exactly the row that drifts unnoticed, because nothing knows the pair was ever coupled",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: buildMessage("x") };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | whatever it says (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "UNKEEPABLE" },
      why: "a declared mirror whose message is a shape the evaluator cannot read is a promise nothing can check — refuse loudly rather than pass as a clean zero",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "dormant", message: "the exact runtime text" };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | the DRIFTED text (@mirrors-message) |\n",
      },
      expect: { count: 1, messageIncludes: "declares itself a MIRROR" },
      why: "the DORMANT table is judged too — a dormant gate's doc row is read by exactly the agent deciding whether to arm it",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "the ACTIVE table lists exactly the one active descriptor and the count matches — the doc agrees with the registry, passes",
    },
    {
      files: {
        // The correct way for another core doc to talk about the inventory: CITE the one home, no figure.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
        "docs/architecture/core/client-architecture-lockdown.md":
          "the live count is `docs/architecture/core/Core-Enforcement-Active-Gates.md`'s own registered-gates line.\n",
      },
      why: "a citation carries no figure to rot — this row is the written difference between referencing the count and copying it",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact " + "runtime text" };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | the exact runtime text (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "the sanctioned MIRROR: declared, and byte-equal to a message the ORDERED evaluator assembles from `+`-concatenated fragments — the shape every real gate message uses",
    },
    {
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact runtime text" };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | a short human summary of what x enforces |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "DECLARED LIMIT — an independent summary is prose and is never compared; only a declared mirror (or an exact accidental copy) is judged, because a PARAPHRASE has no checkable relation to the message",
    },
  ],
};
