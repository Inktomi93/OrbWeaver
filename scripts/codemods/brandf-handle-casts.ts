#!/usr/bin/env tsx
// BRAND-F burn-down, phase 3b: cast-ONLY mop-up of the tests/ literal frontier the handle split (and the
// two new brands) pushed tsc errors onto. Identical mechanism to brandf-tests-sweep's cast phase — ONE
// whole-project diagnostics read, each flagged string LITERAL wrapped in `castId<Brand>(...)` where Brand
// is the LAST quoted known brand in the flattened message (the assignment target) — but with NO retype
// phase, because the handle corpus was classified per-site (brandf-handle-split.ts) and a name-driven
// retype here would undo that judgment.
//
// Run: pnpm tsx scripts/codemods/brandf-handle-casts.ts --apply --no-diagnostics-check
import type { Diagnostic, DiagnosticMessageChain, Node as TsNode } from "ts-morph";
import type { CodemodContext, Plan, TextReplacement } from "./codemod-kit.ts";
import { addNamedImport, applyTextReplacements, composePlans, Node, runCodemod, SyntaxKind } from "./codemod-kit.ts";

const IDS_MODULE = "@orb/kit/ids";
const CAST_FN = "castId";

const BRANDS: readonly string[] = [
  "ChatId",
  "CharacterId",
  "MessageId",
  "UserId",
  "PersonaId",
  "PresetId",
  "WorkloadId",
  "SessionId",
  "AssetId",
  "DocumentId",
  "TagId",
  "ThemeId",
  "AutomationRuleId",
  "RpgQuestId",
  "RpgJournalId",
  "RpgCheckpointId",
  "RegexScriptId",
  "WorldBookId",
  "Handle",
  "CharacterHandle",
];

const TS_ARGUMENT_TYPE_MISMATCH = 2345;
const TS_ASSIGNMENT_TYPE_MISMATCH = 2322;
const QUOTED_TYPE_RE = /'(?<type>[^']+)'/gu;

function flattenDiagnosticMessage(msg: string | DiagnosticMessageChain): string {
  if (typeof msg === "string") {
    return msg;
  }
  let out = msg.getMessageText();
  for (const next of msg.getNext() ?? []) {
    out += ` ${flattenDiagnosticMessage(next)}`;
  }
  return out;
}

/** The brand a diagnostic assigns INTO — the LAST quoted known brand in the message. `CharacterHandle`
 *  and `Handle` never collide here: the quoted spelling is exact-matched per union member. */
function targetBrandOf(message: string): string | undefined {
  const known = new Set(BRANDS);
  let hit: string | undefined;
  for (const match of message.matchAll(QUOTED_TYPE_RE)) {
    const quoted = match.groups?.["type"];
    if (quoted === undefined) {
      continue;
    }
    for (const part of quoted.split("|").map((p) => p.trim())) {
      if (known.has(part)) {
        hit = part;
      }
    }
  }
  return hit;
}

function literalAtDiagnostic(diag: Diagnostic): TsNode | undefined {
  const sf = diag.getSourceFile();
  const start = diag.getStart();
  if (sf === undefined || start === undefined) {
    return;
  }
  const node = sf.getDescendantAtPos(start);
  if (node === undefined) {
    return;
  }
  const lit =
    node.getKind() === SyntaxKind.StringLiteral ||
    node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral ||
    node.getKind() === SyntaxKind.TemplateExpression
      ? node
      : (node.getParentIfKind(SyntaxKind.StringLiteral) ??
        node.getParentIfKind(SyntaxKind.NoSubstitutionTemplateLiteral) ??
        node.getParentIfKind(SyntaxKind.TemplateExpression));
  if (lit === undefined) {
    return;
  }
  const parent = lit.getParent();
  if (parent !== undefined && Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    if (callee === CAST_FN || callee.startsWith(`${CAST_FN}<`)) {
      return;
    }
  }
  return lit;
}

/** A property-assignment diagnostic points at the NAME; when the initializer is a plain literal the cast
 *  belongs on it. This is the object-literal arm the pure literal resolver misses. */
function literalViaPropertyAssignment(diag: Diagnostic): TsNode | undefined {
  const sf = diag.getSourceFile();
  const start = diag.getStart();
  if (sf === undefined || start === undefined) {
    return;
  }
  const node = sf.getDescendantAtPos(start);
  const pa = node?.getParentIfKind(SyntaxKind.PropertyAssignment);
  if (pa === undefined) {
    return;
  }
  const init = pa.getInitializer();
  if (init === undefined) {
    return;
  }
  const isLit =
    init.getKind() === SyntaxKind.StringLiteral ||
    init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral ||
    init.getKind() === SyntaxKind.TemplateExpression;
  return isLit ? init : undefined;
}

await runCodemod("brandf-handle-casts", (ctx: CodemodContext) => {
  const codes = new Set([TS_ARGUMENT_TYPE_MISMATCH, TS_ASSIGNMENT_TYPE_MISMATCH]);
  const seen = new Set<string>();
  const replacements: TextReplacement[] = [];
  const importsByFile = new Map<string, Set<string>>();
  for (const diag of ctx.project.getPreEmitDiagnostics()) {
    if (!codes.has(diag.getCode())) {
      continue;
    }
    const fp = diag.getSourceFile()?.getFilePath();
    if (fp === undefined || !fp.includes("/tests/")) {
      continue;
    }
    const brand = targetBrandOf(flattenDiagnosticMessage(diag.getMessageText()));
    if (brand === undefined) {
      continue;
    }
    const lit = literalAtDiagnostic(diag) ?? literalViaPropertyAssignment(diag);
    if (lit === undefined) {
      continue;
    }
    const key = `${fp}:${lit.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    replacements.push({
      filePath: fp,
      start: lit.getStart(),
      end: lit.getEnd(),
      text: `${CAST_FN}<${brand}>(${lit.getText()})`,
      label: `wrap in ${CAST_FN}<${brand}>`,
    });
    const brands = importsByFile.get(fp) ?? new Set<string>();
    brands.add(brand);
    importsByFile.set(fp, brands);
  }
  const plans: Plan[] = [];
  if (replacements.length > 0) {
    plans.push(applyTextReplacements(ctx, replacements, { note: `cast ${replacements.length} tests/ literal(s)` }));
    for (const [fp, brands] of importsByFile) {
      plans.push(addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name: CAST_FN }));
      for (const brand of brands) {
        plans.push(addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name: brand, isTypeOnly: true }));
      }
    }
  }
  ctx.plan(composePlans(`cast tsc-flagged tests/ literals → castId<Brand> (${replacements.length} site(s) across ${importsByFile.size} file(s))`, plans));
});
