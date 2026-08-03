#!/usr/bin/env tsx
// BRAND-F burn-down, phase 1: the tests/** mechanical sweep of the brand-in-name-position baseline.
// Retypes every brand-named `string` position in tests (params / property signatures / property
// declarations / annotated variables) to its @orb/kit/ids brand, then wraps the string LITERALS the
// retype pushes tsc errors onto in `castId<Brand>(...)` — the sanctioned untrusted-boundary cast, which
// a fixture literal is. `handle` is deliberately ABSENT: that corpus splits per-site into Handle vs
// CharacterHandle (user handle vs character card slug) and is classified by hand in a later phase.
//
// The cast phase is a MULTI-BRAND composition of the kit's own `castStringLiteralsByDiagnostic` shape:
// the kit helper computes a whole-project `getPreEmitDiagnostics()` per call, and 18 brands would mean
// 18 full typechecks. This pass computes diagnostics ONCE and routes each flagged literal to the brand
// its diagnostic names (the LAST quoted brand in the flattened message — the assignment TARGET).
//
// Run: pnpm tsx scripts/codemods/brandf-tests-sweep.ts            (dry-run preview)
//      pnpm tsx scripts/codemods/brandf-tests-sweep.ts --apply --no-diagnostics-check
// (--no-diagnostics-check because the sweep INTENTIONALLY leaves a residual frontier — object-literal /
//  overload mismatches the literal pass cannot see — for the follow-up hand-fix; see codemod-kit §4.)
import type { Diagnostic, DiagnosticMessageChain, Node as TsNode } from "ts-morph";
import type { CodemodContext, Plan, TextReplacement } from "./codemod-kit.ts";
import { addNamedImport, applyTextReplacements, composePlans, Node, retypeIdAnnotations, runCodemod, SyntaxKind } from "./codemod-kit.ts";

const IDS_MODULE = "@orb/kit/ids";
const CAST_FN = "castId";

/** name-position → brand for every brand with test-side baseline sites (worklist artifact,
 *  scripts/codemods/brandf-worklist.json). `handle` deliberately absent — see the header. */
const BRANDS: ReadonlyArray<{ readonly name: string; readonly brand: string }> = [
  { name: "chatId", brand: "ChatId" },
  { name: "characterId", brand: "CharacterId" },
  { name: "messageId", brand: "MessageId" },
  { name: "userId", brand: "UserId" },
  { name: "personaId", brand: "PersonaId" },
  { name: "presetId", brand: "PresetId" },
  { name: "workloadId", brand: "WorkloadId" },
  { name: "sessionId", brand: "SessionId" },
  { name: "assetId", brand: "AssetId" },
  { name: "documentId", brand: "DocumentId" },
  { name: "tagId", brand: "TagId" },
  { name: "themeId", brand: "ThemeId" },
  { name: "automationRuleId", brand: "AutomationRuleId" },
  { name: "rpgQuestId", brand: "RpgQuestId" },
  { name: "rpgJournalId", brand: "RpgJournalId" },
  { name: "rpgCheckpointId", brand: "RpgCheckpointId" },
  { name: "regexScriptId", brand: "RegexScriptId" },
  { name: "worldBookId", brand: "WorldBookId" },
];

/** Tests-only sweep: everything outside tests/ is excluded, plus the SPANGATE lane's observability
 *  tests (collision avoidance) and the agent-sdk frames test whose `sessionId` positions carry the
 *  ratified `@foreign-id-ok` marker (a retype there would launder a foreign wire's id into our brand). */
const RETYPE_EXCLUDES: readonly string[] = [
  "packages/",
  "scripts/",
  "tests/server/foundation/observability/",
  "tests/server/infra/providers/backends/agent-sdk/session/frames.test.ts",
];

const TS_ARGUMENT_TYPE_MISMATCH = 2345;
const TS_ASSIGNMENT_TYPE_MISMATCH = 2322;
const QUOTED_TYPE_RE = /'(?<type>[^']+)'/gu;

/** Flatten a diagnostic message (string or nested chain) to one string — the kit's own shape. */
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

/** The brand a diagnostic assigns INTO: the last quoted type in the flattened message that spells a
 *  known brand (elaborated chains put the target's terminal mismatch last). Undefined = not ours. */
function targetBrandOf(message: string): string | undefined {
  const known = new Set(BRANDS.map((b) => b.brand));
  let hit: string | undefined;
  for (const match of message.matchAll(QUOTED_TYPE_RE)) {
    const quoted = match.groups?.["type"];
    if (quoted === undefined) {
      continue;
    }
    // The quoted text may be a union ('ChatId | null') — split it into member spellings.
    for (const part of quoted.split("|").map((p) => p.trim())) {
      if (known.has(part)) {
        hit = part;
      }
    }
  }
  return hit;
}

/** The string-literal node a diagnostic points at (or just under), skipping literals already wrapped
 *  in castId(...) — the kit's `resolveDiagnosticCastLiteral` shape, verbatim in spirit. */
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

/** ONE diagnostics pass, all brands: wrap every tests/ string literal tsc reports unassignable to a
 *  brand in `castId<Brand>(...)`, and add the castId + brand imports per touched file. */
function castTestLiteralsAllBrands(ctx: CodemodContext): Plan {
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
    const lit = literalAtDiagnostic(diag);
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
    plans.push(applyTextReplacements(ctx, replacements, { note: `cast ${replacements.length} tests/ literal(s), all brands` }));
    for (const [fp, brands] of importsByFile) {
      plans.push(addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name: CAST_FN }));
      for (const brand of brands) {
        plans.push(addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name: brand, isTypeOnly: true }));
      }
    }
  }
  return composePlans(`cast tsc-flagged tests/ literals → castId<Brand> (${replacements.length} site(s) across ${importsByFile.size} file(s))`, plans);
}

await runCodemod("brandf-tests-sweep", (ctx) => {
  for (const { name, brand } of BRANDS) {
    ctx.plan(
      retypeIdAnnotations(ctx, {
        names: [name],
        brand,
        importModule: IDS_MODULE,
        excludePathSubstrings: RETYPE_EXCLUDES,
      }),
    );
  }
  // LAST, after every retype has settled: the cast pass reads the post-retype diagnostic frontier.
  ctx.plan(castTestLiteralsAllBrands(ctx));
});
