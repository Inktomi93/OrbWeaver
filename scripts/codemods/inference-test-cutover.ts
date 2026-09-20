// One-shot codemod for the `@orb/inference` cut-over's TEST-TREE half (docs/design/orbweaver-inference-package.md
// §13 step 6/6b/7 — the server landed; ~1,100 stale pins remained). Everything here is DIAGNOSTIC-DRIVEN off the
// tests program, so the codemod touches exactly the sites `tsc` names and nothing it does not:
//
//   • import repoints — the deleted `@orb/server/infra/providers` root → `@orb/inference` (the package that
//     absorbed its contract), the deleted `…/vllm/engine` → the tooling `engine-fleet` the fleet was yeeted to.
//   • TS2741 "Property 'funderUserId' is missing" — every side-call arg shape gained a funder (§8.5b). The value
//     is the nearest IN-SCOPE identifier from a priority list (`funder` … `owner` … `userId`), or the literal's own
//     `ownerId:` value; a site with no candidate is REPORTED, never guessed.
//   • TS2353 "'X' does not exist in type" for a RETIRED property — the consent belt (`ownerConsented`), the budget
//     belts (`debitBudget`/`resolveTurnPolicy`), the vLLM/engine seams, the D17 governance trio, the active-slot
//     flag, the settings `routing` blob, the preset `customParameters`, the bus `source` word — deleted from the
//     literal. The receiving TYPE is checked against an allowlist per property, so a same-named live property
//     elsewhere is never swept.
//   • TS2322/TS2345 to `ProviderId` — a bare `"openrouter"` literal wrapped in `castId<ProviderId>(…)` (the
//     column is branded now, §5.3c class 2), with both imports added.
//
// Preview:  pnpm codemod:run scripts/codemods/inference-test-cutover.ts
// Apply:    pnpm codemod:run scripts/codemods/inference-test-cutover.ts --apply

import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { addNamedImport, applyTextReplacements, composePlans, Node, repointImports, runCodemod, SyntaxKind } from "@orb/tooling/codemod";
import type { Diagnostic, ObjectLiteralExpression } from "ts-morph";

const TS_MISSING_PROPERTY = 2741;
const TS_UNKNOWN_PROPERTY = 2353;
const TS_ASSIGNMENT_MISMATCH = 2322;
const TS_ARGUMENT_MISMATCH = 2345;

/** The identifiers a funder is spelled as, in priority order — the first one in scope wins. */
const FUNDER_CANDIDATES = ["funderUserId", "funder", "hostUserId", "host", "hostId", "ownerId", "owner", "userId", "user", "triggerer", "caller", "author", "admin", "alice"] as const;

/** A retired property → the receiving-type substrings it may be deleted from (a live same-named property on any
 *  other type is left alone and reported). `*` = any receiving type. */
const RETIRED_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  ownerConsented: ["*"],
  debitBudget: ["EngineDeps", "ChatServiceDeps"],
  resolveTurnPolicy: ["EngineDeps", "ChatServiceDeps"],
  vllmDisabled: ["ServicesDeps"],
  vllmClient: ["*"],
  vllmEngines: ["AdminService"],
  restartVllmEngine: ["AdminService"],
  vllm: ["AdminContext"],
  getOrSkinTierModels: ["*"],
  refreshAgentSdkCatalog: ["*"],
  resolveRole: ["*"],
  resolveChat: ["ConnectionService"],
  inspectEndpoint: ["CredentialsService"],
  requireOwner: ["CredentialContext"],
  active: ["CredentialView"],
  allowNonOwnerMaxProSub: ["*"],
  allowNonOwnerLocalCompute: ["*"],
  nonOwnerLocalComputeBudget: ["*"],
  nonOwnerLocalComputeBudgetWindowMs: ["*"],
  engineLaunch: ["*"],
  vllmConcurrency: ["*"],
  routing: ["schemaVersion"],
  customParameters: ["schemaVersion", "TurnRequest"],
  source: ["turnStarted", "intent: string"],
  onEmbedModelChanged: ["SettingsServiceDeps"],
  credential: ["ImageGenerateRequest"],
};

interface Report {
  readonly unresolvedFunder: string[];
  readonly skippedRetired: string[];
}

function diagnosticMessage(diag: Diagnostic): string {
  const raw = diag.getMessageText();
  return typeof raw === "string" ? raw : raw.getMessageText();
}

function nodeAt(diag: Diagnostic): { sf: SourceFile; node: Node } | undefined {
  const sf = diag.getSourceFile();
  const start = diag.getStart();
  if (sf === undefined || start === undefined) {
    return undefined;
  }
  const node = sf.getDescendantAtPos(start);
  return node === undefined ? undefined : { sf, node };
}

function enclosingObjectLiteral(node: Node): ObjectLiteralExpression | undefined {
  return Node.isObjectLiteralExpression(node) ? node : node.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression);
}

/** Every variable / parameter name declared in a scope that ENCLOSES `node`, nearest scope first. */
function namesInScope(node: Node): string[] {
  const names: string[] = [];
  for (const ancestor of node.getAncestors()) {
    if (Node.isParameterDeclaration(ancestor)) {
      continue;
    }
    for (const child of ancestor.getChildren().flatMap((c) => (c.getKind() === SyntaxKind.SyntaxList ? c.getChildren() : [c]))) {
      if (Node.isVariableStatement(child)) {
        for (const decl of child.getDeclarationList().getDeclarations()) {
          const name = decl.getNameNode();
          if (Node.isIdentifier(name)) {
            names.push(name.getText());
          } else if (Node.isObjectBindingPattern(name)) {
            names.push(...name.getElements().map((e) => e.getName()));
          }
        }
      }
    }
    if (Node.isFunctionLikeDeclaration(ancestor) || Node.isArrowFunction(ancestor)) {
      for (const param of ancestor.getParameters()) {
        const name = param.getNameNode();
        if (Node.isIdentifier(name)) {
          names.push(name.getText());
        } else if (Node.isObjectBindingPattern(name)) {
          names.push(...name.getElements().map((e) => e.getName()));
        }
      }
    }
  }
  return names;
}

function funderExpressionFor(literal: ObjectLiteralExpression): string | undefined {
  const own = literal.getProperty("ownerId");
  if (own !== undefined && Node.isPropertyAssignment(own)) {
    return own.getInitializerOrThrow().getText();
  }
  if (own !== undefined && Node.isShorthandPropertyAssignment(own)) {
    return "ownerId";
  }
  const scoped = new Set(namesInScope(literal));
  return FUNDER_CANDIDATES.find((candidate) => scoped.has(candidate));
}

function insertFunderPlans(ctx: CodemodContext, diags: readonly Diagnostic[], report: Report): Plan {
  const seen = new Set<string>();
  const replacements: { filePath: string; start: number; end: number; text: string; label: string }[] = [];
  for (const diag of diags) {
    if (diag.getCode() !== TS_MISSING_PROPERTY || !diagnosticMessage(diag).includes("'funderUserId' is missing")) {
      continue;
    }
    const at = nodeAt(diag);
    if (at === undefined) {
      continue;
    }
    const literal = enclosingObjectLiteral(at.node);
    if (literal === undefined) {
      report.unresolvedFunder.push(`${at.sf.getFilePath()}:${diag.getLineNumber() ?? 0} (no object literal at the diagnostic)`);
      continue;
    }
    const key = `${at.sf.getFilePath()}:${literal.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const expr = funderExpressionFor(literal);
    if (expr === undefined) {
      report.unresolvedFunder.push(`${at.sf.getFilePath()}:${diag.getLineNumber() ?? 0}`);
      continue;
    }
    const text = literal.getText();
    const multiline = text.includes("\n");
    const inner = text.slice(1, -1);
    const property = expr === "funderUserId" ? "funderUserId" : `funderUserId: ${expr}`;
    const newInner = inner.trim() === "" ? ` ${property} ` : multiline ? `${inner.replace(/\s*$/u, "")},\n${indentOf(literal)}${property},\n${indentOf(literal).slice(2)}` : `${inner.replace(/\s*$/u, "").replace(/,$/u, "")}, ${property} `;
    replacements.push({ filePath: at.sf.getFilePath(), start: literal.getStart(), end: literal.getEnd(), text: `{${newInner}}`, label: `funderUserId ← ${expr}` });
  }
  return applyTextReplacements(ctx, replacements, { note: `insert funderUserId at ${replacements.length} literal(s)` });
}

/** The indentation of the literal's FIRST property (so an inserted one lines up). */
function indentOf(literal: ObjectLiteralExpression): string {
  const first = literal.getProperties()[0];
  if (first === undefined) {
    return "  ";
  }
  const sf = literal.getSourceFile();
  const lineStart = sf.getFullText().lastIndexOf("\n", first.getStart()) + 1;
  return sf.getFullText().slice(lineStart, first.getStart());
}

function retiredMatches(property: string, receivingType: string): boolean {
  const allowed = RETIRED_PROPERTIES[property];
  return allowed !== undefined && (allowed.includes("*") || allowed.some((hint) => receivingType.includes(hint)));
}

function deleteRetiredPlans(ctx: CodemodContext, diags: readonly Diagnostic[], report: Report): Plan {
  const seen = new Set<string>();
  const replacements: { filePath: string; start: number; end: number; text: string; label: string }[] = [];
  for (const diag of diags) {
    if (diag.getCode() !== TS_UNKNOWN_PROPERTY) {
      continue;
    }
    const message = diagnosticMessage(diag);
    const match = /and '([A-Za-z_]+)' does not exist in type '([^']*)'/u.exec(message);
    if (match === null) {
      continue;
    }
    const [, property, receivingType] = match;
    if (property === undefined || receivingType === undefined) {
      continue;
    }
    const at = nodeAt(diag);
    if (at === undefined) {
      continue;
    }
    const assignment = Node.isPropertyAssignment(at.node) || Node.isShorthandPropertyAssignment(at.node) ? at.node : at.node.getFirstAncestor((a) => Node.isPropertyAssignment(a) || Node.isShorthandPropertyAssignment(a));
    if (assignment === undefined || assignment.getName() !== property) {
      continue;
    }
    if (!retiredMatches(property, receivingType)) {
      report.skippedRetired.push(`${at.sf.getFilePath()}:${diag.getLineNumber() ?? 0} ${property} in ${receivingType.slice(0, 40)}`);
      continue;
    }
    const key = `${at.sf.getFilePath()}:${assignment.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    // Remove the property plus its trailing comma (or, for a last property, its leading comma).
    const full = at.sf.getFullText();
    let start = assignment.getStart();
    let end = assignment.getEnd();
    const after = full.slice(end).match(/^\s*,/u);
    if (after !== null) {
      end += after[0].length;
    } else {
      const before = full.slice(0, start).match(/,\s*$/u);
      if (before !== null) {
        start -= before[0].length;
      }
    }
    // Swallow the property's own leading whitespace/newline so no blank line is left behind.
    const lead = full.slice(0, start).match(/[ \t]*(\r?\n)?[ \t]*$/u);
    if (lead !== null && after !== null) {
      start -= lead[0].length;
      const trailingWs = full.slice(end).match(/^[ \t]*/u);
      end += trailingWs?.[0].length ?? 0;
    }
    replacements.push({ filePath: at.sf.getFilePath(), start, end, text: after !== null && lead !== null ? (lead[1] ?? "") : "", label: `drop retired ${property}` });
  }
  return applyTextReplacements(ctx, replacements, { note: `delete ${replacements.length} retired propert(y/ies)` });
}

function castProviderIdPlans(ctx: CodemodContext, diags: readonly Diagnostic[]): Plan {
  const seen = new Set<string>();
  const files = new Set<string>();
  const replacements: { filePath: string; start: number; end: number; text: string; label: string }[] = [];
  for (const diag of diags) {
    const code = diag.getCode();
    if (code !== TS_ASSIGNMENT_MISMATCH && code !== TS_ARGUMENT_MISMATCH) {
      continue;
    }
    if (!/type '(?:ProviderId|[^']*\[brand\]: "ProviderId"[^']*)'\.?$/u.test(diagnosticMessage(diag))) {
      continue;
    }
    const at = nodeAt(diag);
    if (at === undefined) {
      continue;
    }
    const literal = Node.isStringLiteral(at.node) ? at.node : at.node.getFirstAncestorByKind(SyntaxKind.StringLiteral);
    if (literal === undefined) {
      continue;
    }
    const key = `${at.sf.getFilePath()}:${literal.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    files.add(at.sf.getFilePath());
    replacements.push({ filePath: at.sf.getFilePath(), start: literal.getStart(), end: literal.getEnd(), text: `castId<ProviderId>(${literal.getText()})`, label: "castId<ProviderId>" });
  }
  const plans: Plan[] = [applyTextReplacements(ctx, replacements, { note: `cast ${replacements.length} ProviderId literal(s)` })];
  for (const file of files) {
    plans.push(addNamedImport(ctx, file, { moduleSpecifier: "@orb/kit/ids", name: "castId" }));
    plans.push(addNamedImport(ctx, file, { moduleSpecifier: "@orb/contracts/inference", name: "ProviderId", isTypeOnly: true }));
  }
  return composePlans(`ProviderId casts (${replacements.length} site(s), ${files.size} file(s))`, plans);
}

const report: Report = { unresolvedFunder: [], skippedRetired: [] };

await runCodemod(
  "inference-test-cutover",
  (ctx: CodemodContext) => {
    ctx.plan(repointImports(ctx, "@orb/server/infra/providers", "@orb/inference"));
    ctx.plan(repointImports(ctx, "@orb/server/infra/providers/vllm/engine", "@orb/tooling/stack/lib/engine-fleet"));
    const diags = ctx.project.getPreEmitDiagnostics().filter((d) => {
      const fp = d.getSourceFile()?.getFilePath();
      return fp !== undefined && fp.includes("/tests/");
    });
    ctx.plan(insertFunderPlans(ctx, diags, report));
    ctx.plan(deleteRetiredPlans(ctx, diags, report));
    ctx.plan(castProviderIdPlans(ctx, diags));
  },
  { argv: process.argv.slice(2), skipDiagnosticsCheck: true },
);

if (report.unresolvedFunder.length > 0) {
  process.stdout.write(`\nUNRESOLVED funder (hand-patch):\n  ${report.unresolvedFunder.join("\n  ")}\n`);
}
if (report.skippedRetired.length > 0) {
  process.stdout.write(`\nSKIPPED retired-property sites (receiving type not allowlisted):\n  ${report.skippedRetired.join("\n  ")}\n`);
}
