// Gate: gate-modernization — the META-gate. The gate corpus is the enforcement layer; nothing else
// enforces ITS shape, so a gate could register nothing, carry a one-sided exemption table, cite a
// section that does not exist, or carry a ratchet ledger nobody counts, forever and silently. Four
// mechanical axes, all keyed on the corpus itself: A DESCRIPTOR (a gate file must register under one of
// the two contracts) · B EXEMPTIONS (an exemption vocabulary promises a STALE arm) · C CITATION (a docRow
// `§` anchor must resolve in the doc it names) · D ADMITTED (a gate reading a committed ratchet ledger must
// DECLARE what it admitted). The law these arms mechanize is tooling/src/verify/gates/GATE-AUTHORING.md.
//
// MIXED RUNTIME (#1584, docs/reviews/gate-runtime/mixed-runtime-front-door.md §5): arm A recognises a module
// as REGISTERED under either contract — a legacy `gate` descriptor object, or a `gate = defineGate(…)` call
// whose callee resolves BY IMPORT ORIGIN to `contract/policy.ts` (`lib/gate-contract-origin.ts`; a same-named
// local `defineGate` is not the contract and the module registers nothing). A final module's proof floor
// (≥1 mustFlag/mustPass, no legacy fields) is `lib/policy-validation.ts`'s at load time, so arm A judges
// nothing further on it; arms B and D are MODULE-shape arms and run over both contracts (a one-sided
// exemption table or a silent ledger read is a defect whatever the descriptor); arm C reads `docRow`,
// which only a legacy descriptor carries. The corpus is the LOADER's corpus — top-level `gates/*.ts` —
// so the shared proof surfaces under `gates/_proof/` are inputs to policy proofs, never modules that owe
// a descriptor.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { isCanonicalDefineGate } from "../lib/gate-contract-origin.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";

const GATES_REL = "tooling/src/verify/gates/";
/** This module's own path — ARM D's real-tree anchor (§4.5) and the file its tripwire reports on. */
const GATE_SELF = `${GATES_REL}gate-modernization.ts`;
const LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";
const TS_EXT_RE = /\.ts$/u;

// ── ARM B vocabulary ─────────────────────────────────────────────────────────────────────────────────
// A const NAME carrying exemption vocabulary is a PROMISE: these rows are deliberate, permanent, and
// reasoned. Deliberately NARROW — `SKIP_DIRS`/`SCANNED`/`ROOTS` are scan-SCOPE decisions, not exemptions,
// and must not be dragged in. The name is the signal: if a collection is scope, name it scope.
const EXEMPTION_NAME_RE = /ALLOW|WHITELIST|EXEMPT|SANCTION|WAIV|GRANDFATHER|DEFERRED|DEBT|BASELINE|TOLERAT|PERMITTED/u;
// The STALE-arm signature: a diagnostic that tells a reader a row no longer matches anything. Read from
// STRING LITERALS only (a comment saying "stale" enforces nothing), which is why this is a necessary-
// condition test and its DECLARED LIMIT is recorded in a mustPass row.
const STALE_VOCAB_RE = /stale|ratchet down|no longer|delete (?:the |this |it)|unused (?:exemption|sanction|row)|dead (?:row|entry)|vanished/iu;

// ── ARM C parsing ────────────────────────────────────────────────────────────────────────────────────
// A `§` binds to the nearest preceding PATH token, md or code — `member-visibility.ts §3.6` cites a code
// file's section, not the `.md` earlier in the same string.
const PATH_TOKEN_RE = /[\w][\w./-]*\.(?:md|ts|tsx)\b/gu;
const SECTION_RE = /§\s*([^§()/·—\n,;"']+)/gu;
const HEADING_RE = /^#{1,6}\s+(.*)$/gmu;
const LIST_PREFIX_RE = /^[\s>*+\-#`|§]*/u;
const WS_RE = /\s+/u;
// The docRow bare-name resolution roots, in order — the same convention `dangling-refs` resolves against.
const BARE_ROOTS: readonly string[] = ["docs/architecture/core", "docs/architecture/history", "docs/architecture/proposed", "."];
const ANCHOR_TERMINATORS = ".):; ";

// THE ONE REASON. The three NODE-anchored arms name themselves through their token; their per-finding
// messages folded in here when they left the Finding overload (which bypasses `hasGateIgnore` —
// GATE-AUTHORING §1 — so every marker on them was inert). The file-level NO-DESCRIPTOR arm keeps its own
// message: it anchors on a file, not a node.
const MESSAGE =
  "a gate file breaks the gate-authoring law (tooling/src/verify/gates/GATE-AUTHORING.md): it registers no proven " +
  "descriptor under either contract, carries an exemption vocabulary with no STALE arm, or cites a `§` anchor that does not exist " +
  "in the doc it names. The gate corpus is the enforcement layer — nothing else enforces its shape. " +
  "A `mustFlag`/`mustPass` token: the descriptor has no non-empty array for that field — a gate without a " +
  "self-proof cannot be shown to bite, so add ≥1 example WITH a `why`. A `§<anchor>` token: the docRow cites " +
  "that section but the doc it names defines no such anchor — no heading, no line-start anchor — which is " +
  "drift the amnesiac reader cannot tell from a real home (the UI-Gates §12.6 phantom class). A token that " +
  "IS a committed ratchet-ledger path: this gate READS that ledger and never calls `ctx.scan({ admitted })`, " +
  "so every finding its budgets absolve is missing from the single-pass's admitted total — declared debt " +
  "that renders as ZERO declared debt, which is the one number a reader uses to know the debt is still " +
  "there (#551). Any other " +
  "token is an EXEMPTION TABLE by that name with no STALE arm: this gate module contains no diagnostic that " +
  "fires when a row stops matching a live violation, and a one-sided exemption rots into a lie — the " +
  "violation gets fixed, the row stays, and the next violation written at that site inherits an exemption " +
  "nobody granted it.";

const FIX =
  "A: export `gate = defineGate({…})` from tooling/src/verify/contract/policy.ts (its validator owns the proof floor), or a legacy " +
  "`gate: GateDescriptor` with ≥1 mustFlag + ≥1 mustPass (tooling/src/verify/contract/gate.ts). " +
  "B: give the exemption table a STALE arm in `finalize` — a row matching zero live sites must be RED, " +
  `guarded on a real-tree anchor, not on \`scope.kind\` alone (${LAW} §4); if the collection is a ` +
  "scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary. " +
  "C: repoint the `§` to an anchor the cited doc actually defines. " +
  `D: call \`ctx.scan({ admitted: <the findings your budgets absolved> })\` in the gate's \`run\`/\`finalize\` (${LAW} §1) — ` +
  "`density-tier` and `duplicate-action-doors` are the worked examples; `pnpm debt` enumerates the rows behind the number.";

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────────
const NO_DESCRIPTOR = (rel: string): string =>
  `${rel} lives in the gate corpus but exports no \`gate\` descriptor object and no canonical \`defineGate\` policy — ` +
  "the mixed loader records such a module as UNREGISTERED (tooling/src/verify/lib/loader.ts) and the front door " +
  "reconciles the roster, but the file itself enforces nothing and reports nothing, forever. Export a valid legacy " +
  `descriptor, a \`defineGate\` policy imported from tooling/src/verify/contract/policy.ts, or delete the file (${LAW} §1).`;

/** How a gate module registers: the legacy descriptor OBJECT (judged field by field below), or a canonical
 *  `defineGate(…)` CALL (registered; its shape is the final contract's own validation). */
type Registration = { readonly contract: "legacy"; readonly obj: Node } | { readonly contract: "final" };

/** The module's registration under either contract, or undefined when it registers under neither. Identity, not
 *  spelling: a `defineGate` whose import origin is not `contract/policy.ts` is a lookalike and registers nothing. */
function registrationOf(sf: SourceFile): Registration | undefined {
  const init = sf.getVariableDeclaration("gate")?.getInitializer();
  if (init === undefined) {
    return;
  }
  const value = unwrap(init);
  if (TsNode.isObjectLiteralExpression(value)) {
    return { contract: "legacy", obj: value };
  }
  if (!TsNode.isCallExpression(value)) {
    return;
  }
  const callee = value.getExpression();
  return TsNode.isIdentifier(callee) && isCanonicalDefineGate(callee) ? { contract: "final" } : undefined;
}

/** Is a descriptor property a non-empty array literal? */
function hasNonEmptyArrayProp(obj: Node, field: string): boolean {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty(field) : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return init !== undefined && TsNode.isArrayLiteralExpression(init) && init.getElements().length > 0;
}

/** ARM A for one module. Returns the LEGACY descriptor object for arm C, or undefined when there is nothing further
 *  to judge — a registered final policy (its floor is `lib/policy-validation.ts`) or an unregistered module. */
function armDescriptor(sf: SourceFile, rel: string, ctx: GateRunCtx): Node | undefined {
  const registration = registrationOf(sf);
  if (registration === undefined) {
    // THE SANCTIONED Finding overload (§1): FILE-LEVEL by construction — the module exports no descriptor,
    // so there is no node to anchor on or hang a marker off.
    ctx.report({ file: rel, line: 1, column: 0, message: NO_DESCRIPTOR(rel) });
    return;
  }
  if (registration.contract === "final") {
    return;
  }
  const { obj } = registration;
  for (const field of ["mustFlag", "mustPass"]) {
    if (!hasNonEmptyArrayProp(obj, field)) {
      // The missing FIELD is the token — both fields can be missing on the SAME descriptor node, which is
      // exactly the §4.3a case a line-scoped marker would over-exempt.
      ctx.report(obj, { token: field, offset: 0 });
    }
  }
  return obj;
}

// ── ARM B ────────────────────────────────────────────────────────────────────────────────────────────
/** One exemption-shaped collection: a module const whose NAME promises exemption rows and whose
 *  initializer is a non-empty object / array / `new Set([…])` literal. An EMPTY table is deliberately not
 *  flagged — it has no row to rot, and it reds the moment a row lands. */
interface Collection {
  readonly name: string;
  /** The declaration itself — ARM B reports NODE-anchored off it (it used to carry only `line`, which is
   *  what forced the explicit-`Finding` overload and left every `@orb-gate-ignore` on this arm inert). */
  readonly node: Node;
  readonly count: number;
}

function unwrap(node: Node): Node {
  let n = node;
  while (TsNode.isAsExpression(n) || TsNode.isSatisfiesExpression(n) || TsNode.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/** Entry count of a literal collection, or undefined when the initializer is not one. */
function entryCount(init: Node | undefined): number | undefined {
  if (init === undefined) {
    return;
  }
  const n = unwrap(init);
  if (TsNode.isObjectLiteralExpression(n)) {
    return n.getProperties().length;
  }
  if (TsNode.isArrayLiteralExpression(n)) {
    return n.getElements().length;
  }
  if (!TsNode.isNewExpression(n)) {
    return;
  }
  const arg = n.getArguments()[0];
  return arg !== undefined && TsNode.isArrayLiteralExpression(arg) ? arg.getElements().length : 0;
}

export function exemptionCollections(sf: SourceFile): Collection[] {
  const out: Collection[] = [];
  for (const vd of sf.getVariableDeclarations()) {
    const name = vd.getName();
    if (!EXEMPTION_NAME_RE.test(name)) {
      continue;
    }
    const count = entryCount(vd.getInitializer());
    if (count !== undefined && count > 0) {
      out.push({ name, node: vd, count });
    }
  }
  return out;
}

const STRING_KINDS = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
] as const;

/** Does this gate module carry a stale-arm DIAGNOSTIC (a string a reader would be shown when a row stops
 *  matching)? Necessary condition, not sufficient — see the DECLARED LIMIT mustPass row. */
export function hasStaleArm(sf: SourceFile): boolean {
  for (const kind of STRING_KINDS) {
    for (const n of sf.getDescendantsOfKind(kind)) {
      if (STALE_VOCAB_RE.test(n.getText())) {
        return true;
      }
    }
  }
  return false;
}

// ── ARM C ────────────────────────────────────────────────────────────────────────────────────────────
function resolveDoc(root: string, ref: string): string | undefined {
  if (ref.includes("/")) {
    return [join(root, ref), join(root, "docs/architecture", ref)].find((p) => existsSync(p));
  }
  return BARE_ROOTS.map((r) => join(root, r, ref)).find((p) => existsSync(p));
}

function headingsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(HEADING_RE)) {
    const t = m[1];
    if (t !== undefined) {
      out.push(t.trim().toLowerCase());
    }
  }
  return out;
}

/** Does the doc DEFINE this anchor at a line start (`### 6b. …`, `**F-2** …`, `- 13.4 …`)? A bare `§12.6`
 *  mention in prose does NOT count — that is a REFERENCE, and a doc citing an anchor it never defines is
 *  exactly the phantom this arm exists to catch. */
function definedAsListItem(src: string, token: string): boolean {
  for (const raw of src.split("\n")) {
    const line = raw.toLowerCase().replace(LIST_PREFIX_RE, "");
    if (!line.startsWith(token)) {
      continue;
    }
    const after = line.slice(token.length);
    if (after.length === 0 || ANCHOR_TERMINATORS.includes(after.charAt(0))) {
      return true;
    }
  }
  return false;
}

function anchorExists(src: string, section: string): boolean {
  const s = section.trim();
  if (s.length === 0) {
    return true;
  }
  const headings = headingsOf(src);
  if (headings.some((h) => h.includes(s.toLowerCase()))) {
    return true; // a phrase anchor: `§Cross-tier composition`
  }
  const first = (s.split(WS_RE)[0] ?? s).toLowerCase();
  if (headings.some((h) => h === first || h.startsWith(`${first}.`) || h.startsWith(`${first} `) || h.startsWith(`${first}:`) || h.includes(`§${first}`))) {
    return true;
  }
  return definedAsListItem(src, first);
}

/** The literal text of a docRow initializer (string or no-substitution template). */
function docRowText(obj: Node): string | undefined {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty("docRow") : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (init === undefined) {
    return;
  }
  const n = unwrap(init);
  return TsNode.isStringLiteral(n) || TsNode.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : undefined;
}

function armCitation(obj: Node, ctx: GateRunCtx): void {
  const value = docRowText(obj);
  if (value === undefined) {
    return;
  }
  const paths = [...value.matchAll(PATH_TOKEN_RE)].map((m) => ({ ref: m[0], at: m.index }));
  for (const sm of value.matchAll(SECTION_RE)) {
    const section = sm[1];
    if (section === undefined) {
      continue;
    }
    const owner = paths.findLast((p) => p.at < sm.index);
    if (owner === undefined || !owner.ref.endsWith(".md")) {
      continue; // a §-cite bound to a CODE file (or to nothing) — out of this arm's scope
    }
    const abs = resolveDoc(ctx.root, owner.ref);
    if (abs === undefined) {
      continue; // the doc itself does not resolve — that is `dangling-refs`' arm, not a second red here
    }
    if (!anchorExists(readFileSync(abs, "utf8"), section)) {
      // The ghost ANCHOR is the token — several ghost cites can ride one docRow on one node.
      ctx.report(obj, { token: `§${section.trim()}`, offset: 0 });
    }
  }
}

// ── ARM D ────────────────────────────────────────────────────────────────────────────────────────────
// A gate that reads a committed ratchet ledger and never calls `ctx.scan({ admitted })` is invisible in
// the single-pass's "N finding(s) admitted by ratchet baselines" line — declared debt that reads as ZERO
// declared debt. Measured 2026-08-23 (#546/#551): three of the six ledger-carrying gates were silent, and
// the printed total (216) omitted 523 budgeted findings across their baselines. GATE-AUTHORING.md §1 said
// so in prose ("any new baseline ratchet owes the same call"); prose is a wish, so this is its enforcer.
//
// A gate is a LEDGER READER when one of its string literals IS a ratchet-ledger path (anchored whole-text
// match, so the sentence you are reading — and every other prose mention — can never trip it).
// …and that literal is NOT inside a `mustFlag`/`mustPass` example (#569): a conformance FIXTURE ledger is
// something the gate JUDGES, never a budget it reads — `ratchet-row-integrity` is the worked case.
const LEDGER_PATH_RE = /^[\w./-]+\.baseline\.json$/u;
const ADMITTED_PROP = "admitted";
const SCAN_METHOD = "scan";
/** ARM D's fixture ledger, ASSEMBLED from parts. This module declares no admitted count of its own, so a
 *  whole string literal that IS a ledger path would make the arm accuse its own conformance rows
 *  (GATE-AUTHORING.md §5 — never spell a gate's trigger literally near its scan root). Neither piece
 *  satisfies the anchored match; only their concatenation does, and that exists at runtime only. */
const LEDGER_SUFFIX = ".baseline.json";
const PROBE_LEDGER = `${GATES_REL}__probe${LEDGER_SUFFIX}`;

const NO_ADMITTED_TRIPWIRE =
  "BLINDNESS TRIPWIRE (ARM D) — no gate module in the corpus was recognised as a ratchet-ledger reader, so " +
  "this arm would report ✓ over every silent ratchet forever. The ledger-path recogniser in " +
  "tooling/src/verify/gates/gate-modernization.ts stopped matching: re-point it (GATE-AUTHORING.md §4.6).";

/** The SELF-PROOF fields: a ledger path inside a conformance example is a FIXTURE, not a read (#569 — the
 *  `ratchet-row-integrity` gate JUDGES ledgers and admits nothing, so its example files legitimately name
 *  `*.baseline.json` paths and ARM D accused it three times over). Narrow on purpose: a real reader's path
 *  constant lives at module scope, so this carve cannot absolve one. */
const EXAMPLE_FIELDS: ReadonlySet<string> = new Set(["mustFlag", "mustPass"]);

/** Is this literal inside a `mustFlag`/`mustPass` example block? */
function inExampleBlock(node: Node): boolean {
  for (let cur = node.getParent(); cur !== undefined; cur = cur.getParent()) {
    if (TsNode.isPropertyAssignment(cur) && EXAMPLE_FIELDS.has(cur.getName())) {
      return true;
    }
  }
  return false;
}

/** The ratchet-ledger paths this gate module reads, as their literal nodes (the report anchor). A path that
 *  only ever appears in a conformance example is EXCLUDED — see `inExampleBlock`. */
function ledgerLiterals(sf: SourceFile): { readonly node: Node; readonly path: string }[] {
  const out: { node: Node; path: string }[] = [];
  for (const kind of STRING_KINDS) {
    for (const n of sf.getDescendantsOfKind(kind)) {
      const text = n.getLiteralText();
      if (LEDGER_PATH_RE.test(text) && !inExampleBlock(n)) {
        out.push({ node: n, path: text });
      }
    }
  }
  return out;
}

/** Does this module declare an admitted count — `<x>.scan({ admitted: … })` anywhere in it? AST-positional
 *  (a mention of the call in a comment or a doc string enforces nothing, and this arm's own header names it). */
export function declaresAdmitted(sf: SourceFile): boolean {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!TsNode.isPropertyAccessExpression(callee) || callee.getName() !== SCAN_METHOD) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && TsNode.isObjectLiteralExpression(arg) && arg.getProperty(ADMITTED_PROP) !== undefined) {
      return true;
    }
  }
  return false;
}

/** ARM D for one gate module. Returns whether it reads a ledger at all — the tripwire's evidence. */
function armAdmitted(sf: SourceFile, ctx: GateRunCtx): boolean {
  const ledgers = ledgerLiterals(sf);
  if (ledgers.length === 0 || declaresAdmitted(sf)) {
    return ledgers.length > 0;
  }
  for (const ledger of ledgers) {
    // NODE-anchored with the ledger path as its token: a gate can read two ledgers on two lines, and the
    // token is what a `@orb-gate-ignore` would have to name (§4.3a).
    ctx.report(ledger.node, { token: ledger.path, offset: 0 });
  }
  return true;
}

// ── the pass ─────────────────────────────────────────────────────────────────────────────────────────
/** Gate modules in this run's project, repo-relative path → SourceFile, sorted. The LOADER's corpus predicate —
 *  top-level `gates/*.ts` only (lib/loader.ts `corpusFiles`): a file under `gates/_proof/` is a shared proof surface
 *  the policy proofs import, not a module that owes a descriptor. */
function gateFiles(ctx: GateRunCtx): Map<string, SourceFile> {
  const out = new Map<string, SourceFile>();
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(ctx.root, sf.getFilePath());
    if (rel.startsWith(GATES_REL) && TS_EXT_RE.test(rel) && !rel.slice(GATES_REL.length).includes("/")) {
      out.set(rel, sf);
    }
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Arm B for one gate module: every one-sided exemption collection it carries. Unsuppressed by
 *  construction — the RETRO handoff baseline reached its terminal state `{}` (GATE-AUTHORING.md §4.8) and was
 *  deleted with its generator, so a NEW one-sided table is red on arrival with no ledger to add it to. */
function armExemptions(sf: SourceFile, ctx: GateRunCtx): void {
  if (hasStaleArm(sf)) {
    return;
  }
  for (const c of exemptionCollections(sf)) {
    ctx.report(c.node, { token: c.name, offset: 0 });
  }
}

export const gate: GateDescriptor = {
  name: "gate-modernization",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — tooling/src/verify/gates/GATE-AUTHORING.md",
  status: "active",
  scopeSafety: "whole-project", // it judges the WHOLE gate corpus in one pass, not per changed file
  fsBacked: true, // arm C reads the cited docs off disk
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    let ledgerReaders = 0;
    for (const [rel, sf] of gateFiles(ctx)) {
      const obj = armDescriptor(sf, rel, ctx);
      armExemptions(sf, ctx);
      ledgerReaders += armAdmitted(sf, ctx) ? 1 : 0;
      if (obj !== undefined) {
        armCitation(obj, ctx);
      }
    }
    // §4.6: this arm is keyed on a NAME shape, so a corpus with zero recognised ledger readers means the
    // recogniser died, not that the debt did. Real-tree anchored on this gate's own module — a conformance
    // mini-project holds only its `__probe.ts`, so the tripwire cannot misfire there.
    if (ledgerReaders === 0 && fileLoaded(ctx, GATE_SELF)) {
      // A GENUINELY file-level Finding (line/column 0, no node position) — the arm-E shape, so
      // `finding-overload-provenance` does not judge it and a marker here would itself be stale.
      ctx.report({ file: GATE_SELF, line: 0, column: 0, message: NO_ADMITTED_TRIPWIRE });
    }
  },

  mustFlag: [
    {
      files: { "tooling/src/verify/gates/__probe.ts": "export const notAGate = 1;\n" },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — a module in the gate corpus that registers under neither contract enforces nothing, forever; the mixed loader records it as unregistered, and this is the finding that names the file",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — IDENTITY, not spelling: a same-named LOCAL `defineGate` has no import origin in contract/policy.ts, so the module registers nothing (the loader would refuse its unbranded result too) and the arm names it rather than trusting the callee's name",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [{ files: "x" }], mustPass: [] };\n',
      },
      expect: { token: "mustPass" },
      why: "ARM A — an empty self-proof arm: a gate nobody can show does not false-positive",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned because reasons" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      expect: { token: "ALLOWLIST" },
      why: "ARM B — the founding shape: a populated allowlist with no diagnostic that fires when a row stops matching (the ~57-gate one-sided census)",
    },
    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## 11. A real section\n\nprose.\n\nSee §12.6 for more.\n",
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §12.6", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      expect: { token: "§12.6" },
      why: "ARM C — the UI-Gates §12.6 phantom EXACTLY: the doc REFERENCES the anchor in prose but never DEFINES it, so a reference-counting check would false-pass",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const LEDGER = "${PROBE_LEDGER}";\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.report({ file: LEDGER, line: 1, column: 0, message: "m" }); } };\n`,
      },
      expect: { token: PROBE_LEDGER },
      why: "ARM D — THE FOUNDING SHAPE (#551): a gate reading a committed ratchet ledger and declaring no admitted count. Its whole budgeted population then renders as ZERO in the single-pass's admitted line — measured at 523 findings across three gates",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `export const gate = { name: "__probe", docRow: "x", message: "m", run: (ctx) => { ctx.scan({ unit: "ledger row" }); }, mustFlag: [{ files: { "${PROBE_LEDGER}": "{}" }, why: "w" }], mustPass: [{ files: { "${PROBE_LEDGER}": "{}" }, why: "w" }] };\n`,
      },
      why: "ARM D's example carve (#569): a gate whose ONLY ledger path sits inside its mustFlag/mustPass fixtures JUDGES ledgers rather than reading budgets — accusing it of a silent ratchet was a false positive that cost `ratchet-row-integrity` three findings at landing",
    },
    {
      files: {
        // The origin reader resolves the relative import on disk (this gate is fsBacked, so its example is a real
        // temp root), exactly as it resolves the real contract/policy.ts on the real tree.
        "tooling/src/verify/contract/policy.ts": "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM A — a CANONICAL `defineGate` module is REGISTERED (the mixed loader classifies it final by brand; this arm by import origin), and its proof floor belongs to lib/policy-validation.ts — the arm judges nothing further on it (the #1584 widening: 163 converted modules read as 'exports no descriptor' before it)",
    },
    {
      files: { "tooling/src/verify/gates/_proof/__probe-surface.ts": "export const SURFACE = 1;\n" },
      why: "ARM A — the corpus is the LOADER's corpus (top-level `gates/*.ts`): a shared proof surface under `gates/_proof/` is an input the policy proofs import, not a module that owes a descriptor (six such files read as unregistered before the predicate matched the loader's)",
    },

    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## Cross-tier composition (who reads db)\n\n### 6b. A sub-anchor\n\nprose.\n",
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §Cross-tier composition / __g_gm_doc.md §6b", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C passes both anchor spellings — a PHRASE heading and a numbered sub-heading (`### 6b.`), the two forms the corpus actually uses",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — the two-sided shape: the module carries a stale-arm diagnostic, so its populated allowlist is a promise it can keep",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST: Record<string, string> = {};\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — an EMPTY exemption table has no row to rot; it reds the moment a row lands, so flagging it now would be noise (`no-hover-display-swap`'s born-empty ALLOWLIST is the live precedent)",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const SKIP_DIRS = ["dist", "generated"];\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], skip: SKIP_DIRS };\n',
      },
      why: "ARM B — DECLARED SCOPE: a scan-scope constant is not an exemption. The vocabulary is deliberately narrow (`SKIP`/`SCANNED`/`ROOTS` are out) so scope decisions do not inherit the two-sidedness promise",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "member-visibility.ts §3.6 producer-stamp", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — DECLARED LIMIT: a `§` bound to a CODE file cites a source-file section, not a doc anchor; binding to the nearest preceding PATH token (md OR code) keeps it out of scope instead of misattributing it to an earlier `.md`",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "NO-SUCH-DOC-ANYWHERE.md §4", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — a docRow naming a doc that resolves NOWHERE is `dangling-refs`' finding, not a second red here: one defect, one diagnostic",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const LEDGER = "${PROBE_LEDGER}";\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.scan({ admitted: LEDGER.length }); } };\n`,
      },
      why: "ARM D — the honest shape: the ledger reader declares what its budgets absolved, so the single-pass total includes it",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const NOTE = "regenerate the committed ${LEDGER_SUFFIX} ledger when the count shrinks";\nexport const gate = { name: "__probe", docRow: "x", message: NOTE, mustFlag: [1], mustPass: [1] };\n`,
      },
      why: "ARM D — DECLARED LIMIT and the anti-self-flag: the recogniser matches a literal that IS a ledger PATH (whole-text anchored), never prose that merely mentions one — otherwise this gate's own header and every gate's fix text would accuse themselves",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.scan({ scanned: 1 }); } };\n',
      },
      why: "ARM D — a gate that reads NO ledger owes no admitted count: the arm is about declared debt, not about every `ctx.scan` call (and the blindness tripwire stays quiet here, being real-tree anchored)",
    },
  ],
};
