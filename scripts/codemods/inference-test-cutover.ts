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
// Preview:  pnpm codemod:run scripts/codemods/inference-test-cutover.ts --log /tmp/tests-tsc.log
// Apply:    pnpm codemod:run scripts/codemods/inference-test-cutover.ts --log /tmp/tests-tsc.log --apply

import { readFileSync } from "node:fs";
import process from "node:process";
import type { CodemodContext, Plan, SourceFile } from "@orb/tooling/codemod";
import { addNamedImport, applyTextReplacements, composePlans, Node, repointImports, runCodemod, SyntaxKind } from "@orb/tooling/codemod";
import type { ObjectLiteralExpression } from "ts-morph";

/** One `tsc --pretty false` line, parsed. The tests program's OWN diagnostics (`pnpm exec tsc -p tsconfig.json
 *  --noEmit --pretty false > <log>`) drive the codemod: the kit's glob-built project resolves the workspace
 *  differently enough (no vitest globals, looser subpath resolution) that its pre-emit diagnostics hide most
 *  of the funder / ProviderId sites. Pass the log with `--log <path>`. */
interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: number;
  readonly message: string;
  getCode(): number;
  getLineNumber(): number;
}

const TSC_LINE = /^(?<file>[^(]+)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+): (?<message>.*)$/u;

function readTscLog(path: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const m = TSC_LINE.exec(raw);
    if (m?.groups === undefined) {
      continue;
    }
    const d = {
      file: m.groups["file"] ?? "",
      line: Number(m.groups["line"]),
      column: Number(m.groups["col"]),
      code: Number(m.groups["code"]),
      message: m.groups["message"] ?? "",
    };
    out.push({ ...d, getCode: () => d.code, getLineNumber: () => d.line });
  }
  return out;
}

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

/** TS2741 fills: `funder` = the nearest in-scope funder identifier; anything else is literal text. `onlyIn`
 *  restricts the fill to receiving types whose printed name carries one of the hints. */
const MISSING_PROPERTY_FILLS: Readonly<Record<string, { readonly value: "funder" | string; readonly onlyIn?: readonly string[] | undefined }>> = {
  funderUserId: { value: "funder" },
  hostUserId: { value: "funder" },
  ownerId: { value: "funder", onlyIn: ["MemoryQueryOptions", "DocumentSearchParams", "SegmentSearchParams", "StoreParams"] },
  modalities: { value: '["text"]' },
  connectionId: { value: "null", onlyIn: ["MessageView"] },
};

/** TS2345 "not assignable to parameter of type X": the ONE property such an argument literal lacks. */
const PARAMETER_TYPE_FILLS: Readonly<Record<string, string>> = {
  StoreParams: "ownerId",
  DistillCharactersOptions: "funderUserId",
  ComputeThemesOptions: "funderUserId",
};

interface Report {
  readonly unresolvedFunder: string[];
  readonly skippedRetired: string[];
}

function diagnosticMessage(diag: Diagnostic): string {
  return diag.message;
}

let activeProject: CodemodContext["project"] | undefined;

function nodeAt(diag: Diagnostic): { sf: SourceFile; node: Node } | undefined {
  const sf = activeProject?.getSourceFile(`${process.cwd()}/${diag.file}`);
  if (sf === undefined) {
    return undefined;
  }
  const pos = sf.compilerNode.getPositionOfLineAndCharacter(diag.line - 1, diag.column - 1);
  const node = sf.getDescendantAtPos(pos);
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
  const inScope = FUNDER_CANDIDATES.find((candidate) => scoped.has(candidate));
  if (inScope !== undefined) {
    return inScope;
  }
  // A describe-level `let owner` assigned in a `beforeEach` is a sibling scope the walk above cannot see; a
  // file-wide declaration of a candidate name is the next-honest answer (the suite's one funder).
  const fileWide = new Set(literal.getSourceFile().getDescendantsOfKind(SyntaxKind.VariableDeclaration).map((d) => d.getName()));
  return FUNDER_CANDIDATES.find((candidate) => fileWide.has(candidate));
}

function insertFunderPlans(ctx: CodemodContext, diags: readonly Diagnostic[], report: Report): Plan {
  const seen = new Set<string>();
  const replacements: { filePath: string; start: number; end: number; text: string; label: string }[] = [];
  for (const diag of diags) {
    const code = diag.getCode();
    if (code !== TS_MISSING_PROPERTY && code !== TS_ARGUMENT_MISMATCH) {
      continue;
    }
    // TS2741 names the property; TS2345 names only the parameter type, so the fill is keyed on that type.
    const missing = /^Property '([A-Za-z_]+)' is missing in type '[^']*' but required in type '([^']*)'/u.exec(diagnosticMessage(diag));
    const argMismatch = /is not assignable to parameter of type '([^']*)'/u.exec(diagnosticMessage(diag));
    const byParam = argMismatch?.[1] === undefined ? undefined : PARAMETER_TYPE_FILLS[argMismatch[1]];
    const propertyName = missing?.[1] ?? byParam;
    const requiredIn = missing?.[2] ?? argMismatch?.[1] ?? "";
    if (propertyName === undefined || !(propertyName in MISSING_PROPERTY_FILLS)) {
      continue;
    }
    const fill = MISSING_PROPERTY_FILLS[propertyName];
    if (fill === undefined || (fill.onlyIn !== undefined && !fill.onlyIn.some((hint) => requiredIn.includes(hint)))) {
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
    const expr = fill.value === "funder" ? funderExpressionFor(literal) : fill.value;
    if (expr === undefined) {
      report.unresolvedFunder.push(`${at.sf.getFilePath()}:${diag.getLineNumber() ?? 0} (${propertyName})`);
      continue;
    }
    const text = literal.getText();
    const multiline = text.includes("\n");
    const inner = text.slice(1, -1);
    const property = expr === propertyName ? propertyName : `${propertyName}: ${expr}`;
    const newInner = inner.trim() === "" ? ` ${property} ` : multiline ? `${inner.replace(/\s*$/u, "").replace(/,$/u, "")},\n${indentOf(literal)}${property},\n${indentOf(literal).slice(2)}` : `${inner.replace(/\s*$/u, "").replace(/,$/u, "")}, ${property} `;
    replacements.push({ filePath: at.sf.getFilePath(), start: literal.getStart(), end: literal.getEnd(), text: `{${newInner}}`, label: `${propertyName} ← ${expr}` });
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
    activeProject = ctx.project;
    const logFlag = process.argv.indexOf("--log");
    const logPath = logFlag === -1 ? undefined : process.argv[logFlag + 1];
    if (logPath === undefined) {
      throw new Error("pass --log <tsc log path> (pnpm exec tsc -p tsconfig.json --noEmit --pretty false > <path>)");
    }
    const diags = readTscLog(logPath).filter((d) => d.file.startsWith("tests/"));
    // Every diagnostic is resolved to its node against the UNMODIFIED project first — a plan's transform runs at
    // the plan boundary and shifts positions, so the log's line/column is only valid before the first plan.
    const fills = insertFunderPlans(ctx, diags, report);
    const deletions = deleteRetiredPlans(ctx, diags, report);
    const casts = castProviderIdPlans(ctx, diags);
    ctx.plan(fills);
    ctx.plan(deletions);
    ctx.plan(casts);
    ctx.plan(repointImports(ctx, "@orb/server/infra/providers", "@orb/inference"));
    ctx.plan(repointImports(ctx, "@orb/server/infra/providers/vllm/engine", "@orb/tooling/stack/lib/engine-fleet"));
  },
  { argv: process.argv.slice(2), skipDiagnosticsCheck: true },
);

if (report.unresolvedFunder.length > 0) {
  process.stdout.write(`\nUNRESOLVED funder (hand-patch):\n  ${report.unresolvedFunder.join("\n  ")}\n`);
}
if (report.skippedRetired.length > 0) {
  process.stdout.write(`\nSKIPPED retired-property sites (receiving type not allowlisted):\n  ${report.skippedRetired.join("\n  ")}\n`);
}
