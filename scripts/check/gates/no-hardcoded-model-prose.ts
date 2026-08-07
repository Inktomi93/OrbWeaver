// Gate: no-hardcoded-model-prose — PROSE-1 §7 (docs/design/prose-1-spec.md): at a PROMPT-ASSEMBLY SEAM,
// model-facing prose (≥12 words with a lowercase run; +-chains/array-joins/template statics aggregated) is
// authored ONLY in a prose CATALOG — everywhere else it is a slot that escaped the registry (the disease that
// let a hardcoded nudge ride every turn for a campaign). ARM A: seam literals vs a SHRINK-ONLY per-file baseline
// (terminal {} at PROSE-1 S3/S4 — then delete baseline+generator). ARM B: a catalog prose const nothing
// references is DEAD prose (the RPG_STATE_TRACKING_GUIDE row-27 class). Escapes: logger/*Error/throw args are
// structural; `// PROSE-OK: <reason>` is the marker (two-sided: stale RED, malformed RED). DECLARED LIMITS
// (mustPass rows): sub-12-word structural labels; prose assembled through an imported helper; a barrel
// re-export does NOT make a catalog const alive (ImportSpecifiers only).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded, repoRel } from "../pass.ts";

/** The closed prompt-assembly seam list (PROSE-1 §7.1, adapted to the landed tree). Bare repo-relative
 *  prefixes — the §3 path-format law. */
export const SEAM_PREFIXES = [
  "packages/server/src/domain/rpg/substrate/",
  "packages/server/src/domain/rpg/tools/",
  "packages/server/src/domain/chat/assembly/",
  "packages/server/src/domain/chat/memory/build/substrate/",
  "packages/server/src/domain/imagery/substrate/",
  "packages/server/src/domain/imagery/tool/",
] as const;
export const SEAM_FILES = [
  "packages/server/src/entry/compose/rpg.ts",
  "packages/server/src/domain/chat/engine/smart-arbitrate.ts",
  "packages/server/src/domain/chat/verbs/compaction.ts",
  "packages/server/src/domain/automation/engine/arm-executors.ts",
  "packages/contracts/src/rpg/extraction-prompt.ts",
] as const;
/** The sanctioned authoring homes (the landed PROSE-1 registry + the two legacy-adapted catalogs). */
const CATALOGS = [
  "packages/contracts/src/prose/index.ts",
  "packages/contracts/src/prose-slot/index.ts",
  "packages/contracts/src/chat/prose.ts",
  "packages/contracts/src/preset/prose.ts",
  "packages/contracts/src/automation/prose.ts",
  "packages/contracts/src/discovery/prose.ts",
  "packages/contracts/src/imagery/index.ts",
  "packages/contracts/src/preset/index.ts",
] as const;
const CATALOG_SET: ReadonlySet<string> = new Set(CATALOGS);

const BASELINE_REL = "scripts/check/gates/no-hardcoded-model-prose.baseline.json";
const GATE_SELF = "scripts/check/gates/no-hardcoded-model-prose.ts";
/** Real-tree anchor for the baseline stale arms — the registry door, present on every real run and planted
 *  by no example (§4.5). */
const REAL_TREE_ANCHOR = "packages/contracts/src/prose/index.ts";

const PROSE_MIN_WORDS = 12;
const WORD_RE = /\S+/gu;
const LOWER_RUN_RE = /[a-z]{3,}/u;
const OPERATOR_CALLEE_RE = /^(?:logger|log|console)\b|getLog\(\)/u;
const ERROR_NAME_RE = /Error$/u;
const MARKER = "PROSE-OK";
const MARKER_RE = /\/\/\s*PROSE-OK(?<colon>:?)\s*(?<reason>\S?)/u;

const MESSAGE =
  "model-facing prose hardcoded at a prompt-assembly seam — every string whose bytes reach a model is a " +
  "PROSE-1 slot (a shipped default in a contracts prose catalog + resolveProse), not a constant; a hardcoded " +
  "seam string is invisible to hosts and to the registry (docs/design/prose-1-spec.md §7). Author it as a " +
  "slot row in the domain's prose catalog (packages/contracts/src/*/prose.ts) and resolve it at the seam.";
const FIX =
  "move the bytes into the owning domain's prose catalog as a slot row and call resolveProse/resolveProseText " +
  "at the seam; a genuinely structural string (a wire token, a stub grammar) below 12 words never trips this — " +
  "a deliberate longer one takes `// PROSE-OK: <reason>` on its line or the line above.";

function isSeam(rel: string): boolean {
  if (CATALOG_SET.has(rel)) {
    return false;
  }
  return SEAM_PREFIXES.some((p) => rel.startsWith(p)) || (SEAM_FILES as readonly string[]).includes(rel);
}

function wordCount(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

/** Ordered literal text of a string-producing expression: literals + template statics; `${…}`/identifier
 *  parts contribute nothing (a gap, like the spec's evaluator). */
function unitText(node: Node): string {
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return node.getLiteralText();
  }
  if (node.isKind(SyntaxKind.TemplateExpression)) {
    return [node.getHead().getLiteralText(), ...node.getTemplateSpans().map((s) => s.getLiteral().getLiteralText())].join(" ");
  }
  if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
    return unitText(node.getExpression());
  }
  if (node.isKind(SyntaxKind.BinaryExpression)) {
    return `${unitText(node.getLeft())} ${unitText(node.getRight())}`;
  }
  if (node.isKind(SyntaxKind.CallExpression)) {
    const arr = node.getExpression().isKind(SyntaxKind.PropertyAccessExpression)
      ? node.getExpression().asKind(SyntaxKind.PropertyAccessExpression)?.getExpression()
      : undefined;
    if (arr?.isKind(SyntaxKind.ArrayLiteralExpression) === true) {
      return arr.getElements().map(unitText).join(" ");
    }
  }
  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return node.getElements().map(unitText).join(" ");
  }
  return "";
}

/** Climb from a literal to the outermost same-unit aggregation (`+` chains, parens, `[…].join(…)`) so a
 *  chunk-split dodge is judged as ONE unit and each unit reports once. */
function topOfUnit(lit: Node): Node {
  let top: Node = lit;
  for (;;) {
    const p: Node | undefined = top.getParent();
    if (p === undefined) {
      return top;
    }
    if (p.isKind(SyntaxKind.ParenthesizedExpression)) {
      top = p;
      continue;
    }
    if (p.isKind(SyntaxKind.BinaryExpression) && p.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
      top = p;
      continue;
    }
    const joined = joinAggregate(p);
    if (joined !== undefined) {
      top = joined;
      continue;
    }
    return top;
  }
}

/** The `[…].join(…)` CallExpression over an array literal, when `p` is that array — else undefined. */
function joinAggregate(p: Node): Node | undefined {
  if (!p.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return;
  }
  const access = p.getParent();
  if (access?.isKind(SyntaxKind.PropertyAccessExpression) !== true || access.getName() !== "join") {
    return;
  }
  const call = access.getParent();
  return call?.isKind(SyntaxKind.CallExpression) === true ? call : undefined;
}

/** Operator-facing ancestry (PROSE-1 §7.2 class 2): an argument to logger/log/console/getLog(), a
 *  `new *Error(…)`, or inside a `throw` never reaches a model. */
function isOperatorFacing(node: Node): boolean {
  let cur: Node | undefined = node;
  while (cur !== undefined) {
    if (cur.isKind(SyntaxKind.ThrowStatement)) {
      return true;
    }
    if (cur.isKind(SyntaxKind.NewExpression) && ERROR_NAME_RE.test(cur.getExpression().getText())) {
      return true;
    }
    if (cur.isKind(SyntaxKind.CallExpression) && OPERATOR_CALLEE_RE.test(cur.getExpression().getText())) {
      return true;
    }
    cur = cur.getParent();
  }
  return false;
}

interface ProseSite {
  readonly line: number;
  /** The marker line that escaped this site, when one did. */
  readonly escapedAt: number | undefined;
}

interface MarkerLine {
  readonly line: number;
  readonly malformed: boolean;
}

function markerLines(sf: SourceFile): MarkerLine[] {
  const out: MarkerLine[] = [];
  sf.getFullText()
    .split("\n")
    .forEach((text, i) => {
      if (!text.includes(MARKER)) {
        return;
      }
      const m = MARKER_RE.exec(text);
      if (m !== undefined && m !== null) {
        out.push({ line: i + 1, malformed: m.groups?.["colon"] !== ":" || (m.groups?.["reason"] ?? "") === "" });
      }
    });
  return out;
}

/** Every prose UNIT in one seam file — the shared detector (the generator imports this; §4.8 single writer). */
export function modelProseSites(sf: SourceFile): ProseSite[] {
  const markers = new Map(markerLines(sf).map((m) => [m.line, m.malformed] as const));
  const seen = new Set<number>();
  const sites: ProseSite[] = [];
  for (const kind of [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateExpression] as const) {
    for (const lit of sf.getDescendantsOfKind(kind)) {
      const top = topOfUnit(lit);
      if (seen.has(top.getStart())) {
        continue;
      }
      seen.add(top.getStart());
      const text = unitText(top);
      if (wordCount(text) < PROSE_MIN_WORDS || !LOWER_RUN_RE.test(text) || isOperatorFacing(top)) {
        continue;
      }
      const line = top.getStartLineNumber();
      const escapedAt = [line, line - 1].find((l) => markers.get(l) === false);
      sites.push({ line, escapedAt });
    }
  }
  return sites.sort((a, b) => a.line - b.line);
}

function loadBaseline(root: string): Record<string, number> {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
}

/** ARM B: a prose-shaped const in a CATALOG file that nothing references — in-file (a slot row, a compose)
 *  or via an ImportSpecifier elsewhere. A barrel RE-export (ExportSpecifier) is deliberately NOT life. */
function deadCatalogProse(ctx: GateRunCtx, sf: SourceFile): { line: number; name: string }[] {
  const out: { line: number; name: string }[] = [];
  for (const decl of sf.getVariableDeclarations()) {
    const init = decl.getInitializer();
    if (init === undefined) {
      continue;
    }
    const text = unitText(init);
    if (wordCount(text) < PROSE_MIN_WORDS || !LOWER_RUN_RE.test(text)) {
      continue;
    }
    const name = decl.getName();
    const inFileRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === name).length;
    if (inFileRefs > 1) {
      continue;
    }
    // Full-text pre-filter (structural-fast budget): only files that MENTION the name pay for an AST walk.
    const imported = ctx.project
      .getSourceFiles()
      .some(
        (other) =>
          other !== sf && other.getFullText().includes(name) && other.getDescendantsOfKind(SyntaxKind.ImportSpecifier).some((s) => s.getName() === name),
      );
    if (!imported) {
      out.push({ line: decl.getStartLineNumber(), name });
    }
  }
  return out;
}

function reportSeamFile(ctx: GateRunCtx, sf: SourceFile, rel: string, budget: number): number {
  const sites = modelProseSites(sf);
  const live = sites.filter((s) => s.escapedAt === undefined);
  const consumed = new Set(sites.flatMap((s) => (s.escapedAt === undefined ? [] : [s.escapedAt])));
  for (const m of markerLines(sf)) {
    if (m.malformed) {
      ctx.report({
        file: rel,
        line: m.line,
        column: 0,
        message: `malformed \`// ${MARKER}: <reason>\` — the reason is REQUIRED; a bare marker exempts NOTHING: scripts/check/gates/no-hardcoded-model-prose.ts`,
      });
    } else if (!consumed.has(m.line)) {
      ctx.report({
        file: rel,
        line: m.line,
        column: 0,
        message: `stale \`// ${MARKER}\` marker guarding no live prose unit — a loaded gun; delete it: scripts/check/gates/no-hardcoded-model-prose.ts`,
      });
    }
  }
  for (const site of live.slice(budget)) {
    ctx.report({ file: rel, line: site.line, column: 0 });
  }
  return live.length;
}

export const gate: GateDescriptor = {
  name: "no-hardcoded-model-prose",
  docRow: "docs/design/prose-1-spec.md §7 (Core-Enforcement-Active-Gates.md Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => isSeam(p) || CATALOG_SET.has(p),
  run: (ctx) => {
    const baseline = loadBaseline(ctx.root);
    const liveCounts = new Map<string, number>();
    for (const sf of ctx.files) {
      const rel = repoRel(ctx.root, sf.getFilePath());
      if (isSeam(rel)) {
        liveCounts.set(rel, reportSeamFile(ctx, sf, rel, baseline[rel] ?? 0));
      } else if (CATALOG_SET.has(rel)) {
        for (const dead of deadCatalogProse(ctx, sf)) {
          ctx.report({
            file: rel,
            line: dead.line,
            column: 0,
            message: `\`${dead.name}\` is DEAD catalog prose — authored, referenced by nothing (no in-file use, no importer): the RPG_STATE_TRACKING_GUIDE class, docs/design/prose-1-spec.md §2 row 27. Wire it into a slot row or delete it.`,
          });
        }
      }
    }
    // The baseline's two stale modes (§4.4a), anchor-guarded so a mini-project can't misfire them.
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    for (const [rel, budget] of Object.entries(baseline)) {
      const live = liveCounts.get(rel);
      if (live === undefined) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `baseline row for a file the scan never visited (moved/deleted/de-seamed): ${rel} — regenerate and commit the shrink: scripts/check/gen-model-prose-baseline.ts`,
        });
      } else if (live < budget) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `baseline row above the live count for ${rel} (${budget} > ${live}) — the ratchet only SHRINKS; regenerate and commit the shrink in this change: scripts/check/gen-model-prose-baseline.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export const NEW_TEACH =\n  "When the scene calls for it, teach the model to answer in the voice of the narrator and keep it steady.";\n',
      at: "packages/server/src/domain/rpg/substrate/__probe.ts",
      expect: { count: 1, messageIncludes: "PROSE-1" },
      why: "the founding shape — a fresh model-facing teach authored at a seam instead of a catalog slot (no baseline budget on a new file)",
    },
    {
      files: 'export const DESC = {\n  description: "Use this tool whenever the story needs a dice roll and report the result in plain words.",\n};\n',
      at: "packages/server/src/domain/rpg/tools/__probe.ts",
      expect: { count: 1 },
      why: "a tool `description:` is model-facing prose — the §2.5 class",
    },
    {
      files: 'export const SPLIT = "Record only what the story actually " + "establishes and never invent numbers, " + "items, or events it does not show.";\n',
      at: "packages/server/src/domain/chat/assembly/__probe.ts",
      expect: { count: 1 },
      why: "a `+`-chunked dodge — the chain is ONE unit, judged on its concatenated text, reported once",
    },
    {
      files:
        "export const JOINED = [\n" +
        '  "You distill a block of roleplay transcript",\n' +
        '  "into a compact retrieval-optimized memory unit",\n' +
        '  "and never add commentary or markdown headers.",\n' +
        '].join("\\n");\n',
      at: "packages/server/src/domain/chat/memory/build/substrate/__probe.ts",
      expect: { count: 1 },
      why: "the array-join spelling of the same dodge — aggregated, one unit, one finding",
    },
    {
      files:
        "export const DEAD_GUIDE =\n" +
        '  "Track every plane the beat changes and restate the current values so the panel reflects the story.";\n' +
        "export const USED = { text: DEAD_GUIDE_OTHER };\nconst DEAD_GUIDE_OTHER = 'x';\n",
      at: "packages/contracts/src/chat/prose.ts",
      expect: { count: 1, messageIncludes: "DEAD catalog prose" },
      why: "ARM B — a catalog prose const referenced by nothing (the RPG_STATE_TRACKING_GUIDE row-27 class)",
    },
    {
      files:
        "// PROSE-OK\n" +
        'export const X = "Twelve honest words that would otherwise be caught by the seam prose fence here.";\n' +
        "// PROSE-OK: reason with no guarded unit on the next line\nexport const n = 1;\n",
      at: "packages/server/src/domain/rpg/substrate/__probe2.ts",
      expect: { count: 3 },
      why: "the marker's two-sided arms: a BARE marker exempts nothing (the unit still reds + the malformed red), and a well-formed marker guarding nothing is a stale loaded gun",
    },
  ],
  mustPass: [
    {
      files:
        "export const SLOT = {\n" +
        "  id: 'chat.recovery.narrativeContinuation',\n" +
        '  text: "Continue the story naturally from where it left off and keep the same narrative voice throughout.",\n' +
        "};\nexport const TABLE = { slot: SLOT };\n",
      at: "packages/contracts/src/chat/prose.ts",
      why: "prose authored in its CATALOG and referenced by the table — the sanctioned home",
    },
    {
      files:
        'import { logger } from "#foundation";\n' +
        'export const f = () => logger.warn({ n: 1 }, "this operator-facing warning has more than twelve words and still must never trip the model-prose fence");\n',
      at: "packages/server/src/domain/chat/assembly/__probe.ts",
      why: "§7.2 class 2 — a logger argument faces an operator, never a model",
    },
    {
      files:
        "export function f(x: number) {\n" +
        '  if (x > 1) throw new Error("a refusal sentence with well over twelve words that reaches an operator or a caller, never a model");\n' +
        "  return x;\n}\n",
      at: "packages/server/src/domain/rpg/substrate/__probe.ts",
      why: "`new *Error` / `throw` arguments are the refusal class — structural, not wording-matched",
    },
    {
      files: 'export const LABEL = "Party:";\nexport const STUB = "[image omitted]";\n',
      at: "packages/server/src/domain/chat/assembly/__probe.ts",
      why: "DECLARED LIMIT written down: sub-12-word structural labels/stubs are the seam's GRAMMAR (PROSE-1 §2.11), below the threshold by design",
    },
    {
      files:
        "// PROSE-OK: a deliberate structural exception, ends when S4 lands\n" +
        'export const KEPT = "Twelve deliberate words kept at the seam for a reason the marker states right above here.";\n',
      at: "packages/server/src/domain/rpg/substrate/__probe3.ts",
      why: "a WELL-FORMED marker with its reason escapes the unit — and is consumed, so the stale arm stays quiet",
    },
    {
      files: 'export const V = ["a", "b"].join(", ");\nexport const SHORT = `only a few short template words here`;\n',
      at: "packages/server/src/entry/compose/rpg.ts",
      why: "short joins/templates below the word floor never trip — the wire vocabulary stays legal",
    },
  ],
};
