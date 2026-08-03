// Gate: gate-modernization — the META-gate. The gate corpus is the enforcement layer; nothing else
// enforces ITS shape, so a gate could register nothing, carry a one-sided exemption table, or cite a
// section that does not exist, forever and silently. Three mechanical axes, all keyed on the corpus itself:
// A DESCRIPTOR (a gate file must register a proven descriptor) · B EXEMPTIONS (an exemption vocabulary
// promises a STALE arm) · C CITATION (a docRow `§` anchor must resolve in the doc it names).
// The law these arms mechanize is scripts/check/GATE-AUTHORING.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { repoRel } from "../pass.ts";

const GATES_REL = "scripts/check/gates/";
const GATE_SELF = "scripts/check/gates/gate-modernization.ts";
const LAW = "scripts/check/GATE-AUTHORING.md";
const BASELINE_REL = "scripts/check/gates/gate-modernization.baseline.json";
const GEN_CMD = "pnpm exec tsx scripts/check/gen-gate-modernization-baseline.ts";
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

const MESSAGE =
  "a gate file breaks the gate-authoring law (scripts/check/GATE-AUTHORING.md): it registers no proven " +
  "descriptor, carries an exemption vocabulary with no STALE arm, or cites a `§` anchor that does not exist " +
  "in the doc it names. The gate corpus is the enforcement layer — nothing else enforces its shape.";

const FIX =
  "A: export a `gate: GateDescriptor` with ≥1 mustFlag + ≥1 mustPass (scripts/check/contract.ts). " +
  "B: give the exemption table a STALE arm in `finalize` — a row matching zero live sites must be RED, " +
  `guarded on a real-tree anchor, not on \`scope.kind\` alone (${LAW} §4); if the collection is a ` +
  "scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary. " +
  "C: repoint the `§` to an anchor the cited doc actually defines.";

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────────
const NO_DESCRIPTOR = (rel: string): string =>
  `${rel} lives in the gate corpus but exports no \`gate\` descriptor object — the loader SKIPS such a ` +
  "module (`mod.gate === undefined ⇒ continue`, scripts/check/loader.ts), so the file enforces nothing and " +
  `reports nothing, forever. Export a valid descriptor or delete the file (${LAW} §1).`;

const NO_PROOF = (rel: string, field: string): string =>
  `${rel}'s descriptor has no non-empty \`${field}\` — a gate without a self-proof cannot be shown to bite ` +
  "(scripts/check/contract.ts; the loader refuses it at run time and gate-conformance runs it). Add ≥1 " +
  `\`${field}\` example WITH a \`why\` (${LAW} §5).`;

/** The `gate` descriptor object literal of a gate module, if it declares one. */
function descriptorOf(sf: SourceFile): Node | undefined {
  return sf.getVariableDeclaration("gate")?.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
}

/** Is a descriptor property a non-empty array literal? */
function hasNonEmptyArrayProp(obj: Node, field: string): boolean {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty(field) : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return init !== undefined && TsNode.isArrayLiteralExpression(init) && init.getElements().length > 0;
}

function armDescriptor(sf: SourceFile, rel: string, ctx: GateRunCtx): Node | undefined {
  const obj = descriptorOf(sf);
  if (obj === undefined) {
    ctx.report({ file: rel, line: 1, column: 0, message: NO_DESCRIPTOR(rel) });
    return;
  }
  for (const field of ["mustFlag", "mustPass"]) {
    if (!hasNonEmptyArrayProp(obj, field)) {
      ctx.report({ file: rel, line: obj.getStartLineNumber(), column: 0, message: NO_PROOF(rel, field) });
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
  readonly line: number;
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
      out.push({ name, line: vd.getStartLineNumber(), count });
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

const ONE_SIDED = (rel: string, name: string, count: number): string =>
  `\`${name}\` (${count} row(s)) in ${rel} is an EXEMPTION table with no STALE arm — this gate module ` +
  "contains no diagnostic that fires when a row stops matching a live violation. A one-sided exemption rots " +
  "into a lie: the violation gets fixed, the row stays, and the next violation written at that site inherits " +
  `an exemption nobody granted it. Add the stale arm in \`finalize\`, guarded on a real-tree anchor (${LAW} ` +
  "§4). If this collection is a scan-SCOPE decision and not an exemption, rename it out of the exemption " +
  "vocabulary — the name is the signal.";

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

const GHOST_SECTION = (rel: string, ref: string, section: string): string =>
  `${rel}'s docRow cites \`${ref} §${section}\`, but ${ref} defines no such section — no heading and no ` +
  "line-start anchor. A §-cite that leads nowhere is drift the amnesiac reader cannot tell from a real home " +
  `(the UI-Gates §12.6 phantom class). Repoint it to an anchor the doc actually defines (${LAW} §1).`;

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

function armCitation(obj: Node, rel: string, ctx: GateRunCtx): void {
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
      ctx.report({ file: rel, line: obj.getStartLineNumber(), column: 0, message: GHOST_SECTION(rel, owner.ref, section.trim()) });
    }
  }
}

// ── the RETRO handoff baseline (arm B only) ──────────────────────────────────────────────────────────
// The one-sided exemption tables that predate this gate. OWNER-SANCTIONED as a handoff ledger, not debt
// parking: the burn-down is a named sibling lane's work, the baseline only ever SHRINKS, and it is
// two-sided — a row whose collection gained its stale arm (or vanished) is RED. Terminal state: `{}`, then
// delete the baseline AND its generator.
type Baseline = Readonly<Record<string, readonly string[]>>;

function loadBaseline(root: string): Baseline {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {}; // absent in a conformance temp tree — the arm then judges nothing stale (the anchor guard)
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Baseline;
}

const STALE_BASELINE_GATE = (rel: string): string =>
  `${BASELINE_REL} lists "${rel}", but that gate file no longer exists — the ratchet only goes down: regenerate it (${GEN_CMD}) and commit the shrink.`;

const STALE_BASELINE_ROW = (rel: string, name: string): string =>
  `${BASELINE_REL} lists "${rel}" → \`${name}\` as a one-sided exemption, but it is not one any more (the ` +
  "collection gained a stale arm, was emptied, or was renamed) — the ratchet only goes down: regenerate it " +
  `(${GEN_CMD}) and commit the shrink.`;

// ── the pass ─────────────────────────────────────────────────────────────────────────────────────────
/** Gate modules in this run's project, repo-relative path → SourceFile, sorted. */
function gateFiles(ctx: GateRunCtx): Map<string, SourceFile> {
  const out = new Map<string, SourceFile>();
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(ctx.root, sf.getFilePath());
    if (rel.startsWith(GATES_REL) && TS_EXT_RE.test(rel)) {
      out.set(rel, sf);
    }
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The per-run state arm B threads: the committed baseline and the rows it actually suppressed (the stale
 *  arm's truth set). One bag rather than two params — `useMaxParams` caps at 4. */
interface BaselineRun {
  readonly baseline: Baseline;
  readonly seen: Set<string>;
}

/** Arm B for one gate module: the one-sided collections it carries (baseline-suppressed or reported). */
function armExemptions(sf: SourceFile, rel: string, ctx: GateRunCtx, { baseline, seen }: BaselineRun): void {
  const collections = exemptionCollections(sf);
  if (collections.length === 0 || hasStaleArm(sf)) {
    return;
  }
  const budgeted = baseline[rel] ?? [];
  for (const c of collections) {
    if (budgeted.includes(c.name)) {
      seen.add(`${rel}\u0000${c.name}`);
      continue;
    }
    ctx.report({ file: rel, line: c.line, column: 0, message: ONE_SIDED(rel, c.name, c.count) });
  }
}

function reportStaleBaseline(ctx: GateRunCtx, files: ReadonlyMap<string, SourceFile>, { baseline, seen }: BaselineRun): void {
  if (!existsSync(join(ctx.root, BASELINE_REL))) {
    return; // REAL-TREE ANCHOR: no committed baseline in this tree ⇒ no stale claim to make
  }
  for (const [rel, names] of Object.entries(baseline)) {
    if (!files.has(rel)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_BASELINE_GATE(rel) });
      continue;
    }
    for (const name of names) {
      if (!seen.has(`${rel}\u0000${name}`)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_BASELINE_ROW(rel, name) });
      }
    }
  }
}

export const gate: GateDescriptor = {
  name: "gate-modernization",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — scripts/check/GATE-AUTHORING.md",
  status: "active",
  scopeSafety: "whole-project", // it reconciles the WHOLE gate corpus against a committed baseline
  fsBacked: true, // arm C reads docs off disk; the baseline is a committed JSON file
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    const run: BaselineRun = { baseline: loadBaseline(ctx.root), seen: new Set<string>() };
    const files = gateFiles(ctx);
    for (const [rel, sf] of files) {
      const obj = armDescriptor(sf, rel, ctx);
      armExemptions(sf, rel, ctx, run);
      if (obj !== undefined) {
        armCitation(obj, rel, ctx);
      }
    }
    reportStaleBaseline(ctx, files, run);
  },

  mustFlag: [
    {
      files: { "scripts/check/gates/__probe.ts": "export const notAGate = 1;\n" },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — the loader's silent `continue`: a module in the gate corpus that registers nothing enforces nothing, forever, with no signal",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [{ files: "x" }], mustPass: [] };\n',
      },
      expect: { messageIncludes: "no non-empty `mustPass`" },
      why: "ARM A — an empty self-proof arm: a gate nobody can show does not false-positive",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned because reasons" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      expect: { messageIncludes: "no STALE arm" },
      why: "ARM B — the founding shape: a populated allowlist with no diagnostic that fires when a row stops matching (the ~57-gate one-sided census)",
    },
    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## 11. A real section\n\nprose.\n\nSee §12.6 for more.\n",
        "scripts/check/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §12.6", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      expect: { messageIncludes: "defines no such section" },
      why: "ARM C — the UI-Gates §12.6 phantom EXACTLY: the doc REFERENCES the anchor in prose but never DEFINES it, so a reference-counting check would false-pass",
    },
  ],
  mustPass: [
    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## Cross-tier composition (who reads db)\n\n### 6b. A sub-anchor\n\nprose.\n",
        "scripts/check/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §Cross-tier composition / __g_gm_doc.md §6b", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C passes both anchor spellings — a PHRASE heading and a numbered sub-heading (`### 6b.`), the two forms the corpus actually uses",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — the two-sided shape: the module carries a stale-arm diagnostic, so its populated allowlist is a promise it can keep",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'const ALLOWLIST: Record<string, string> = {};\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — an EMPTY exemption table has no row to rot; it reds the moment a row lands, so flagging it now would be noise (`no-hover-display-swap`'s born-empty ALLOWLIST is the live precedent)",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'const SKIP_DIRS = ["dist", "generated"];\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], skip: SKIP_DIRS };\n',
      },
      why: "ARM B — DECLARED SCOPE: a scan-scope constant is not an exemption. The vocabulary is deliberately narrow (`SKIP`/`SCANNED`/`ROOTS` are out) so scope decisions do not inherit the two-sidedness promise",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
        "scripts/check/gates/gate-modernization.baseline.json": '{ "scripts/check/gates/__probe.ts": ["ALLOWLIST"] }\n',
      },
      why: "ARM B — a baselined one-sided table is suppressed (the RETRO handoff ledger), and its stale-row arm sees the collection still one-sided, so nothing fires either way",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "member-visibility.ts §3.6 producer-stamp", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — DECLARED LIMIT: a `§` bound to a CODE file cites a source-file section, not a doc anchor; binding to the nearest preceding PATH token (md OR code) keeps it out of scope instead of misattributing it to an earlier `.md`",
    },
    {
      files: {
        "scripts/check/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "NO-SUCH-DOC-ANYWHERE.md §4", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — a docRow naming a doc that resolves NOWHERE is `dangling-refs`' finding, not a second red here: one defect, one diagnostic",
    },
  ],
};
