// Policy: enforcement-registry-parity — Core-Enforcement-Active-Gates.md must agree with the DISCOVERED
// gate roster (the loader IS the registry): its Layer-3 ACTIVE table names exactly the `status:"active"`
// LEGACY descriptors PLUS every FINAL `defineGate` policy (a policy has no status — it is always active), its
// DORMANT table exactly the `status:"dormant"` descriptors, and its "(N registered gates)" count matches the
// active-legacy + final total — and that count has ONE home, so a SECOND core doc stating a figure for it is
// RED too (`client-architecture-lockdown.md` froze at 133 while the registry held 207). Both directions RED.
// The source population is the loader's gate-module corpus; the named enforcement ledger and living-document
// index provide the Markdown inputs. No private Project or checkout filesystem read is involved.
// BOTH CONTRACTS, BY IDENTITY (#1584 mixed runtime, the front-door ruling §5): a
// module is FINAL when its `gate` initializer is a call whose callee resolves — by import origin, through
// `lib/gate-contract-origin.ts#isCanonicalDefineGate` — to `contract/policy.ts`'s `defineGate`, never by the
// spelling of the callee; a same-named local or re-branded `defineGate` is not the contract and its module
// registers nothing here, so its doc row reads as an ORPHAN (the loud direction). Until this reader learned
// the final shape the gate was blind to 163 converted modules and reported 154 live doc rows as orphans.
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
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateContractKind } from "../contract/gate-corpus.ts";
import type { GatePolicyContext, GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { DocumentIndex, MarkdownDocument } from "../contract/resource-document.ts";
import { readExpressionString } from "../lib/config-static-read.ts";
import { isCanonicalDefineGate } from "../lib/gate-contract-origin.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const CORE_DOCS_REL = "docs/law";
const DOC_REL = `${CORE_DOCS_REL}/Core-Enforcement-Active-Gates.md`;
const GATES_DIR_REL = "tooling/src/verify/gates";
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
// `gate` — a legacy descriptor object (name + status) or a canonical `defineGate({ id, … })` call; the doc's
// ACTIVE table == the `status:"active"` descriptors ∪ every final policy, the DORMANT table == the
// `status:"dormant"` descriptors, and the "(N registered gates)" count == that active total. It reads each
// `tooling/src/verify/gates/*.ts` module straight from the source AST, never importing report.ts.
const STATUS_ACTIVE = "active";
const STATUS_DORMANT = "dormant";

interface DescriptorMeta {
  readonly name: string;
  readonly status: string;
  /** Which contract the module registers under — a final policy is `status:"active"` by construction. */
  readonly contract: GateContractKind;
  /** The descriptor's runtime `message`, statically evaluated — `undefined` when its initializer is a
   *  shape the ordered evaluator cannot read (a call, a property access). Never guessed. */
  readonly message: string | undefined;
}

/** How a missing-row finding names the module's contract, so the reader repairs the right doc region. */
const CONTRACT_NOUN: Record<GateContractKind, string> = {
  legacy: 'a legacy descriptor with status:"active"',
  final: "a final defineGate policy, which is always active",
};

/** One Layer-3 doc row: its gate name, its description cell, and the 1-based line it sits on. */
interface DocRow {
  readonly name: string;
  readonly description: string;
  readonly line: number;
}

/** A description cell ENDING with this marker declares itself a verbatim copy of the descriptor's runtime
 *  `message`. Opt-IN to a stricter check, not a suppression — so, unlike the `@orb-gate-ignore` family
 *  (tooling/src/verify/gates/GATE-AUTHORING.md §4.3), it carries no reason: the reason is the byte-equality it promises. */
/** Conformance fixture paths — the gate reads exactly these two real-tree coordinates. */
const GATE_FILE = `${GATES_DIR_REL}/x.ts`;
const DOC_FILE = DOC_REL;
/** The FINAL-shape fixtures: a planted `contract/policy.ts` whose `defineGate` the origin reader resolves, and a
 *  canonical module importing it. Both land beside `x.ts` in the fs-backed mini-project — the gate's own Project is
 *  real-fs, so the relative import resolves on disk exactly as it does on the real tree. */
const POLICY_STUB_FILE = "tooling/src/verify/contract/policy.ts";
const POLICY_STUB = "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n";
const FINAL_GATE_FILE = `${GATES_DIR_REL}/y.ts`;
const FINAL_MODULE = (message: string): string =>
  `import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "y", message: ${message} });\n`;
/** The same spelling with a LOCAL `defineGate` — identity, not spelling, decides the contract. */
const LOOKALIKE_MODULE = 'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "y", message: "m" });\n';
const LEGACY_X = 'export const gate = { name: "x", status: "active" };\n';
const MIRROR_MARKER = "(@mirrors-message)";
/** The corpus size at which the mirror reader's blindness tripwire comes alive — the real gate dir holds
 *  ~250 descriptors; a conformance mini-project plants one or two. */
const MIRROR_READER_ANCHOR = 50;
/** An UNESCAPED table-cell boundary — a description may carry `\|` inside it. */
const CELL_END_RE = /(?<!\\)\|/u;

const DOC_ACTIVE_MISSING = (name: string, contract: GateContractKind): string =>
  `active gate "${name}" (${CONTRACT_NOUN[contract]}) has no row in ${DOC_REL}'s Layer-3 ACTIVE ` +
  "table — add it (docs/law/Core-Enforcement-Active-Gates.md).";
const DOC_ACTIVE_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 ACTIVE table names "${name}" but no active gate of that name exists — neither a ` +
  'status:"active" legacy descriptor nor a canonical defineGate policy (tooling/src/verify/gates/) — remove the ' +
  'row, set the legacy gate\'s status to "active", or register the module under the contract it claims.';
// Only a LEGACY descriptor can be dormant (a final policy has no status), so this arm needs no contract noun.
const DOC_DORMANT_MISSING = (name: string): string =>
  `dormant gate "${name}" (its descriptor is status:"dormant") has no row in ${DOC_REL}'s Layer-3 ` +
  "DORMANT table — add it (docs/law/Core-Enforcement-Active-Gates.md).";
const DOC_DORMANT_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 DORMANT table names "${name}" but no dormant descriptor of that name exists ` +
  '(tooling/src/verify/gates/) — remove the row, or set the gate\'s status to "dormant".';
const SECOND_COUNT_HOME = (rel: string): string =>
  `${rel} states its own "(N registered gates)" figure — the count has ONE home (${DOC_REL}), where this ` +
  "gate checks it against the discovered descriptor set. A second copy is ungated by construction and " +
  'rots silently (this one sat at "133 registered gates" for a month past the real 207). Cite ' +
  `${DOC_REL} instead of restating the number.`;
const COUNT_CONTRACT_MISMATCH = (docCount: number, legacy: number, final: number): string =>
  `${DOC_REL} declares "${docCount} registered gates" but there are ${legacy + final} active gate modules ` +
  `(${legacy} status:"active" legacy descriptors + ${final} final defineGate policies, tooling/src/verify/gates/) — ` +
  "update the count line (docs/law/Core-Enforcement-Active-Gates.md).";

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
  "past the whole corpus, so every mirror verdict below is vacuous (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the " +
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

/** `as` / `satisfies` / parentheses around the `gate` initializer are spelling, not identity. */
function unwrap(node: Node): Node {
  let n = node;
  while (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/** The LEGACY shape: `export const gate: GateDescriptor = { name, status, message, … }`. */
function legacyMeta(obj: Node): DescriptorMeta | undefined {
  const name = literalProp(obj, "name");
  const status = literalProp(obj, "status");
  return name === undefined || status === undefined ? undefined : { name, status, contract: "legacy", message: evaluatedProp(obj, "message") };
}

/** The FINAL shape: `export const gate = defineGate({ id, message, … })` — and ONLY when the callee's import origin
 *  is `contract/policy.ts`'s `defineGate` (a local or re-branded function of the same name registers nothing;
 *  its doc row then reads as an orphan). A policy carries no status: it is active by construction. */
function finalMeta(call: Node): DescriptorMeta | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  const arg = call.getArguments()[0];
  if (!(Node.isIdentifier(callee) && isCanonicalDefineGate(callee)) || arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return;
  }
  const id = literalProp(arg, "id");
  return id === undefined ? undefined : { name: id, status: STATUS_ACTIVE, contract: "final", message: evaluatedProp(arg, "message") };
}

/** One gate file's registration under either contract, or undefined when the file registers nothing readable
 *  (the mixed loader records such a module as unregistered — `gate-modernization` arm A is its finding). */
function descriptorOf(sf: SourceFile): DescriptorMeta | undefined {
  const init = sf.getVariableDeclaration("gate")?.getInitializer();
  if (init === undefined) {
    return;
  }
  const value = unwrap(init);
  return Node.isObjectLiteralExpression(value) ? legacyMeta(value) : finalMeta(value);
}

/** The Layer-3 DORMANT table's rows (after the DORMANT header to end-of-doc). */
function dormantTableRows(doc: string): DocRow[] {
  const start = doc.search(DORMANT_TABLE_START_RE);
  return start === -1 ? [] : tableRows(doc, doc.slice(start), start);
}

function reconcileTable(
  descriptors: readonly DescriptorMeta[],
  docNames: ReadonlySet<string>,
  missing: (name: string, contract: GateContractKind) => string,
  orphan: (name: string) => string,
): Violation[] {
  const violations: Violation[] = [];
  const descriptorNames = new Set(descriptors.map((d) => d.name));
  for (const d of descriptors) {
    if (!docNames.has(d.name)) {
      violations.push({ file: DOC_REL, line: 0, message: missing(d.name, d.contract) });
    }
  }
  for (const name of docNames) {
    if (!descriptorNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: orphan(name) });
    }
  }
  return violations;
}

function contractCountViolations(doc: string, legacyActive: number, final: number): Violation[] {
  const match = COUNT_RE.exec(doc);
  if (match === null) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message: `${DOC_REL} has no "(N registered gates)" count line to check against the active gate roster (docs/law/Core-Enforcement-Active-Gates.md).`,
      },
    ];
  }
  const declared = Number(match.groups?.["count"]);
  return declared === legacyActive + final ? [] : [{ file: DOC_REL, line: 0, message: COUNT_CONTRACT_MISMATCH(declared, legacyActive, final) }];
}

/** The count has ONE home. A SECOND copy of it in another core law doc is ungated by construction (this
 *  gate reads exactly one file), and `client-architecture-lockdown.md` carried "133 registered gates" for a
 *  month past the real 207 — a law doc lying about the enforcement inventory. Any other
 *  `docs/law/*.md` stating a NUMBER of registered gates is RED: cite the doc, never
 *  restate the figure. */
function secondCountHomeViolations(documents: readonly MarkdownDocument[]): Violation[] {
  const out: Violation[] = [];
  for (const document of documents) {
    if (!document.path.startsWith(`${CORE_DOCS_REL}/`) || document.path === DOC_REL) {
      continue;
    }
    const line = document.text.split("\n").findIndex((value) => ANY_COUNT_RE.test(value));
    if (line !== -1) {
      out.push({ file: document.path, line: line + 1, message: SECOND_COUNT_HOME(document.path) });
    }
  }
  return out;
}

/** The contract-conformance reconciliation shared by the descriptor's `run` and its self-test. */
function reconcileContract(doc: string, documents: readonly MarkdownDocument[], descriptors: readonly DescriptorMeta[]): Violation[] {
  // A final policy is `status:"active"` by construction (finalMeta), so this partition needs no contract branch.
  const active = descriptors.filter((d) => d.status === STATUS_ACTIVE);
  const dormant = descriptors.filter((d) => d.status === STATUS_DORMANT);
  const legacyActive = active.filter((d) => d.contract === "legacy").length;
  const byName = new Map(descriptors.map((d) => [d.name, d] as const));
  const rows = [...activeTableRows(doc), ...dormantTableRows(doc)];
  // The §4.6 blindness tripwire for the mirror reader: an anchor-sized corpus yielding NO readable message
  // means every mirror verdict is vacuous. Guarded on the real corpus size so a conformance mini-project
  // (which plants one or two descriptors) cannot fire it.
  const readable = descriptors.filter((d) => d.message !== undefined).length;
  const readerBlind =
    descriptors.length >= MIRROR_READER_ANCHOR && readable === 0 ? [{ file: DOC_REL, line: 0, message: MIRROR_READER_BLIND(descriptors.length) }] : [];
  return [
    ...contractCountViolations(doc, legacyActive, active.length - legacyActive),
    ...secondCountHomeViolations(documents),
    ...reconcileTable(active, new Set(activeTableRows(doc).map((r) => r.name)), DOC_ACTIVE_MISSING, DOC_ACTIVE_ORPHAN),
    ...reconcileTable(dormant, new Set(dormantTableRows(doc).map((r) => r.name)), DOC_DORMANT_MISSING, DOC_DORMANT_ORPHAN),
    ...readerBlind,
    ...mirrorViolations(rows, byName),
  ];
}

function policyDocuments(ctx: GatePolicyContext): { readonly roster: MarkdownDocument; readonly index: DocumentIndex } {
  const ledger = readyResourceValue(ctx.resources.ledger("gate-enforcement-roster"));
  const roster = ledger.documents.find((document) => document.path === DOC_REL);
  if (roster === undefined) {
    throw new Error(`gate-enforcement-roster did not serve ${DOC_REL}`);
  }
  const index = readyResourceValue(ctx.resources.documents());
  const refusedCore = index.refusals.find((refusal) => refusal.path.startsWith(`${CORE_DOCS_REL}/`));
  if (refusedCore !== undefined) {
    throw new Error(`core document ${refusedCore.path} was refused (${refusedCore.status}): ${refusedCore.reason}`);
  }
  return { roster, index };
}

function reportViolations(ctx: GatePolicyContext, violations: readonly Violation[]): void {
  for (const violation of violations) {
    ctx.report.file(violation.file, { line: Math.max(1, violation.line), column: 1, message: violation.message });
  }
}

interface CarriedProof {
  readonly files: Readonly<Record<string, string>>;
  readonly expect?: GatePolicyProof["expect"];
  readonly why: string;
}

function resourceProof(proof: CarriedProof): GatePolicyProof {
  return {
    mode: "resource",
    files: proof.files,
    ...(proof.expect === undefined ? {} : { expect: proof.expect }),
    why: proof.why,
  };
}

export const gate = defineGate({
  id: "enforcement-registry-parity",
  family: "enforcement-registry-parity",
  authority: "hard",
  severity: "error",
  population: {
    in: ["@tooling"],
    under: ["tooling/src/verify/gates/*.ts"],
    notNamed: ["*.d.ts", "__g_*", "__dc_*"],
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "gate-enforcement-roster" }, { kind: "documents" }],
  message:
    'Core-Enforcement-Active-Gates.md disagrees with the discovered gate roster — its ACTIVE table must list exactly the status:"active" legacy descriptors plus every canonical defineGate policy, its DORMANT table exactly the status:"dormant" descriptors, and its "(N registered gates)" count must equal that active total; that count has ONE home, so no other docs/law doc may state a figure for it; and a row whose description MIRRORS the gate\'s runtime `message` declares it with the `(@mirrors-message)` marker and then matches byte-for-byte, in both directions (Core-Enforcement-Active-Gates.md).',
  fix: "add/remove the doc row for the gate (a legacy descriptor's row follows its status — ACTIVE vs DORMANT; a defineGate policy's row is always ACTIVE), update the \"(N registered gates)\" count to the active-legacy + final total in docs/law/Core-Enforcement-Active-Gates.md, and in any other core doc CITE that line instead of restating the number. For a MIRROR row: repair the description to the descriptor's message byte-for-byte and keep the `(@mirrors-message)` marker at the end of the cell, or drop the marker and write an independent summary — a copy that does not say it is a copy is the row that drifts.",
  create: (ctx) => {
    const descriptors: DescriptorMeta[] = [];
    return {
      visitFile: (sourceFile) => {
        const descriptor = descriptorOf(sourceFile);
        if (descriptor !== undefined) {
          descriptors.push(descriptor);
        }
      },
      evaluate: () => {
        const { roster, index } = policyDocuments(ctx);
        reportViolations(ctx, reconcileContract(roster.text, index.documents, descriptors));
      },
    };
  },
  mustFlag: [
    {
      mode: "resource" as const,
      files: {
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md": "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 2, messageIncludes: "ACTIVE table" },
      why: "an active descriptor `x` with no ACTIVE-table row (and a count that ignores it) — the doc lies about the registry",
    },
    {
      mode: "resource" as const,
      files: {
        // No active descriptors, but the ACTIVE table names `ghost` — a doc row for a gate that doesn't exist.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `ghost` | names no descriptor |\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n",
      },
      expect: { count: 1, messageIncludes: "no active gate of that name exists" },
      why: "the ACTIVE table names `ghost` with no matching active descriptor — the DOC_ACTIVE_ORPHAN arm",
    },
    {
      mode: "resource" as const,
      files: {
        [GATE_FILE]: LEGACY_X,
        [FINAL_GATE_FILE]: FINAL_MODULE('"m"'),
        [POLICY_STUB_FILE]: POLICY_STUB,
        [DOC_FILE]: "## Layer 3 — Structural gates\n\n(2 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "final defineGate policy" },
      why: "the MIXED roster (#1584): a canonical defineGate module is a registered ACTIVE gate — the count already includes it, so its missing ACTIVE row is the one finding, and the finding names the contract the reader must repair against",
    },
    {
      mode: "resource" as const,
      files: {
        [FINAL_GATE_FILE]: LOOKALIKE_MODULE,
        [DOC_FILE]: "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `y` | a lookalike |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "no active gate of that name exists" },
      why: "IDENTITY, not spelling: a same-named LOCAL `defineGate` is not the contract (its import origin is not contract/policy.ts), so the module registers nothing and its doc row is an ORPHAN — the loud direction, never a silent pass",
    },
    {
      mode: "resource" as const,
      files: {
        [FINAL_GATE_FILE]: FINAL_MODULE('"the exact runtime text"'),
        [POLICY_STUB_FILE]: POLICY_STUB,
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `y` | the DRIFTED text (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "declares itself a MIRROR" },
      why: "the mirror arms read a FINAL policy's `message` off the defineGate object literal exactly as they read a legacy descriptor's — a drifted declared mirror of a converted gate is the same #910 defect",
    },
    {
      mode: "resource" as const,
      files: {
        // A dormant descriptor `x` absent from the DORMANT table — DOC_DORMANT_MISSING.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md": "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "DORMANT table" },
      why: "a dormant descriptor `x` with no DORMANT-table row — the DOC_DORMANT_MISSING arm (distinct message)",
    },
    {
      mode: "resource" as const,
      files: {
        // The DORMANT table names `phantom` with no dormant descriptor — DOC_DORMANT_ORPHAN.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n| `phantom` | names no descriptor |\n",
      },
      expect: { count: 1, messageIncludes: "no dormant descriptor of that name exists" },
      why: "the DORMANT table names `phantom` with no matching dormant descriptor — the DOC_DORMANT_ORPHAN arm",
    },
    {
      mode: "resource" as const,
      files: {
        // The ACTIVE table + descriptor agree, but the count line is wrong (says 0, one active) — COUNT mismatch.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "registered gates" },
      why: "the ACTIVE table matches but the count says 0 for one active descriptor — the COUNT_CONTRACT_MISMATCH arm",
    },
    {
      mode: "resource" as const,
      files: {
        // A SECOND core doc restating the figure. Everything else agrees, so this arm is the only red —
        // and it is spelled the way the live rot was (`**133 registered gates**`, no parentheses).
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
        "docs/law/client-architecture-lockdown.md": "the authoritative live count is **133 registered gates** (2026-07-16).\n",
      },
      expect: { count: 1, messageIncludes: "ONE home" },
      why: "the live rot, replayed: a second core doc froze the count at 133 while the registry held 207 — one home for the figure, cited everywhere else",
    },
    {
      mode: "resource" as const,
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact runtime text" };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | the DRIFTED text (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "declares itself a MIRROR" },
      why: "#910's founding shape — a row that declares itself a copy of the runtime message and has since drifted (no-if-is-group taught retired roster vocabulary in the very string a violating agent reads)",
    },
    {
      mode: "resource" as const,
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: "the exact runtime text" };\n',
        [DOC_FILE]: "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | the exact runtime text |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "does not declare it" },
      why: "the vocabulary cannot be OPTIONAL: an undeclared byte-equal copy is exactly the row that drifts unnoticed, because nothing knows the pair was ever coupled",
    },
    {
      mode: "resource" as const,
      files: {
        [GATE_FILE]: 'export const gate = { name: "x", status: "active", message: buildMessage("x") };\n',
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | whatever it says (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { count: 1, messageIncludes: "UNKEEPABLE" },
      why: "a declared mirror whose message is a shape the evaluator cannot read is a promise nothing can check — refuse loudly rather than pass as a clean zero",
    },
    {
      mode: "resource" as const,
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
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "the ACTIVE table lists exactly the one active descriptor and the count matches — the doc agrees with the registry, passes",
    },
    {
      files: {
        [GATE_FILE]: LEGACY_X,
        [FINAL_GATE_FILE]: FINAL_MODULE('"the exact " + "runtime text"'),
        [POLICY_STUB_FILE]: POLICY_STUB,
        [DOC_FILE]:
          "## Layer 3 — Structural gates\n\n(2 registered gates)\n\n| `x` | enforces x |\n| `y` | the exact runtime text (@mirrors-message) |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "the MIXED roster agrees: one legacy active descriptor + one canonical defineGate policy = a count of 2, both rows present, and the final policy's declared mirror matches a message the ORDERED evaluator assembles from `+`-fragments — the shape converted modules actually use",
    },
    {
      files: {
        // The correct way for another core doc to talk about the inventory: CITE the one home, no figure.
        "tooling/src/verify/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/law/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
        "docs/law/client-architecture-lockdown.md": "the live count is `docs/law/Core-Enforcement-Active-Gates.md`'s own registered-gates line.\n",
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
  ].map(resourceProof),
  mustRefuse: [
    resourceProof({
      files: { [GATE_FILE]: LEGACY_X, "docs/law/__registry_resource_anchor.md": "# anchor\n" },
      expect: { messageIncludes: "resource declaration ledger:gate-enforcement-roster is missing" },
      why: "a missing enforcement roster is a refused evidence plane, never a clean registry with zero rows",
    }),
  ],
});
