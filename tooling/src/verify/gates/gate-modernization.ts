// Gate: gate-modernization — the META-gate. The gate corpus is the enforcement layer; nothing else
// enforces ITS shape, so a gate could register nothing, carry a one-sided exemption table, or cite a
// section that does not exist, forever and silently. Three mechanical axes, all keyed on the corpus itself:
// A DESCRIPTOR (a gate file must register a proven descriptor) · B EXEMPTIONS (an exemption vocabulary
// promises a STALE arm) · C CITATION (a docRow `§` anchor must resolve in the doc it names).
// The law these arms mechanize is tooling/src/verify/gates/GATE-AUTHORING.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";

const GATES_REL = "tooling/src/verify/gates/";
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
  "descriptor, carries an exemption vocabulary with no STALE arm, or cites a `§` anchor that does not exist " +
  "in the doc it names. The gate corpus is the enforcement layer — nothing else enforces its shape. " +
  "A `mustFlag`/`mustPass` token: the descriptor has no non-empty array for that field — a gate without a " +
  "self-proof cannot be shown to bite, so add ≥1 example WITH a `why`. A `§<anchor>` token: the docRow cites " +
  "that section but the doc it names defines no such anchor — no heading, no line-start anchor — which is " +
  "drift the amnesiac reader cannot tell from a real home (the UI-Gates §12.6 phantom class). Any other " +
  "token is an EXEMPTION TABLE by that name with no STALE arm: this gate module contains no diagnostic that " +
  "fires when a row stops matching a live violation, and a one-sided exemption rots into a lie — the " +
  "violation gets fixed, the row stays, and the next violation written at that site inherits an exemption " +
  "nobody granted it.";

const FIX =
  "A: export a `gate: GateDescriptor` with ≥1 mustFlag + ≥1 mustPass (tooling/src/verify/contract/gate.ts). " +
  "B: give the exemption table a STALE arm in `finalize` — a row matching zero live sites must be RED, " +
  `guarded on a real-tree anchor, not on \`scope.kind\` alone (${LAW} §4); if the collection is a ` +
  "scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary. " +
  "C: repoint the `§` to an anchor the cited doc actually defines.";

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────────
const NO_DESCRIPTOR = (rel: string): string =>
  `${rel} lives in the gate corpus but exports no \`gate\` descriptor object — the loader SKIPS such a ` +
  "module (`mod.gate === undefined ⇒ continue`, tooling/src/verify/lib/loader.ts), so the file enforces nothing and " +
  `reports nothing, forever. Export a valid descriptor or delete the file (${LAW} §1).`;

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
    // THE SANCTIONED Finding overload (§1): FILE-LEVEL by construction — the module exports no descriptor,
    // so there is no node to anchor on or hang a marker off.
    ctx.report({ file: rel, line: 1, column: 0, message: NO_DESCRIPTOR(rel) });
    return;
  }
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
    for (const [rel, sf] of gateFiles(ctx)) {
      const obj = armDescriptor(sf, rel, ctx);
      armExemptions(sf, ctx);
      if (obj !== undefined) {
        armCitation(obj, ctx);
      }
    }
  },

  mustFlag: [
    {
      files: { "tooling/src/verify/gates/__probe.ts": "export const notAGate = 1;\n" },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — the loader's silent `continue`: a module in the gate corpus that registers nothing enforces nothing, forever, with no signal",
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
  ],
  mustPass: [
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
  ],
};
