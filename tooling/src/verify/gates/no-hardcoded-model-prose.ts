// Policy: no-hardcoded-model-prose — PROSE-1 §7 (D132): at a PROMPT-ASSEMBLY
// SEAM, model-facing prose (≥12 words with a lowercase run; +-chains/array-joins/template statics
// aggregated) is authored ONLY in a prose CATALOG — everywhere else it is a slot that escaped the registry
// (the disease that let a hardcoded nudge ride every turn for a campaign). ARM A: seam literals, flat (the
// SHRINK-ONLY per-file baseline reached its terminal `{}` at #578 and was DELETED). ARM B: a catalog prose
// const nothing references is DEAD prose (the RPG_STATE_TRACKING_GUIDE row-27 class). Escapes:
// logger/*Error/throw args are structural.
//
// THE PRIVATE `// PROSE-OK: <reason>` MARKER RETIRES INTO THE CENTRAL `@orb-waive` GRAMMAR. Legacy parsed
// its own two-sided (stale RED, malformed RED) marker in `markerLines`/`reportSeamFile`; the final contract
// gives ordinary policies that staleness/malformed sweep centrally (guide §2/§6.2), so ARM A now reports
// every live prose unit unconditionally and the central engine owns suppression. DECLARED LIMITS (mustPass
// rows, unchanged): sub-12-word structural labels; prose assembled through an imported helper (out of
// structural reach — unchanged); a barrel re-export does NOT make a catalog const alive.
//
// FAMILY: singleton. No shared `lib/` reader elsewhere resolves "is this name imported anywhere" or "is
// this string ≥12 words with a lowercase run" — the census hypothesis ("prompt/prose static-value") named
// no existing sibling, and none was found.
//
// POPULATION PORT: WIDENED, not byte-identical, and the widening is load-bearing. Legacy `scanRoot` was
// `isSeam(p) || CATALOG_SET.has(p)` — the seam+catalog set only. But ARM B's liveness check
// (`ctx.project.getSourceFiles()`) read the WHOLE ts-morph Project, because a catalog const's ONE live
// consumer is routinely a CLIENT file (`@orb/contracts/prose` is imported directly from
// `packages/client/src/features/{chat,preset}/**`, confirmed on the real tree) — never seam-or-catalog. The
// final population is `@authored` (all nine roots): reporting still fires ONLY on seam/catalog files (an
// in-code filter, unchanged), but the ImportSpecifier liveness sweep must see every possible importer or
// ARM B silently narrows to "dead within the old scanRoot", which is not what "dead" means. Narrowing the
// population back to seam+catalog would be the exact `ctx.relativePath` population-fence failure guide
// §12.3 documents for `freeze-provenance-write-pairing`.
//
// THE IDENTIFIER-FREQUENCY AND IMPORT-LIVENESS CENSUSES ARE VISITORS, NOT DESCENDANT WALKS (guide §3:
// gate modules cannot call `getDescendantsOfKind`). Legacy walked one file's Identifiers per catalog
// candidate and the whole Project's ImportSpecifiers per candidate name (both re-run per candidate); both
// are now single population-wide visitors (`SyntaxKind.Identifier`, `SyntaxKind.ImportSpecifier`) collected
// once and read by every candidate.
//
// §4.6 DIFFERENTIAL (committed at tests/tooling/verify/gates/simple-visitors-1584.suite.test.ts): every legacy
// mustFlag/mustPass PROSE-DETECTION example (the word-count/lower-run/operator-facing/aggregation shapes)
// replays byte-identically. The two marker-mechanics rows (bare marker, stale marker) do NOT carry forward —
// they tested the PRIVATE grammar this conversion retires; the central engine's own suppression/staleness
// proof (`ordinary-waiver.test.ts`) is the successor, per guide §6.2 ("do not copy a negative arm into a
// gate"). ARM B's liveness predicate gained real reach (client importers) that the narrow legacy population
// could never see — a strengthening, not a behavior change on any FIXTURE example.
//
// THE ORDINARY DOOR IS REAL for both arms: ARM A reports at the first STATIC word of the prose unit
// (`firstStaticWord`), explicitly skipping any `${…}` interpolation span so the token can never contain a
// paren, newline or solidus even when the unit is a template; ARM B reports at the catalog const's own bare
// declared name. Both are guaranteed authored text at their own offset. Driven (not merely claimed) in the
// family test's `assumes-single-replica` control, which exercises the shared position mechanism every
// ordinary policy in this lane uses.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-hardcoded-model-prose` descriptor at d2d0f644c46ee75c2ac44d962d22d18a97a375fe, the parent of the conversion
// `04e455f4d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,455 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 55 and final `population` admits 7,454. legacy − final = ∅. final − legacy = 7,399 `@authored` sources
// outside the seam/catalog set — the ARM B importer census reach recorded above; findings still fire only on
// seam/catalog files. Controls: inside: no virtual sibling fits the exact-path population, so the real shared member
// `packages/contracts/src/automation/prose.ts` is the control, admitted by both; outside
// `packages/showcase-plugins/src/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { CallExpression, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

/** The closed prompt-assembly seam list (PROSE-1 §7.1, adapted to the landed tree). Bare repo-relative
 *  prefixes — the §3 path-format law. */
export const SEAM_PREFIXES = [
  "packages/server/src/domain/rpg/substrate/",
  "packages/server/src/domain/rpg/tools/",
  "packages/server/src/domain/chat/assembly/",
  "packages/server/src/domain/chat/memory/generate/substrate/",
  "packages/server/src/domain/imagery/substrate/",
  "packages/server/src/domain/imagery/tool/",
] as const;
export const SEAM_FILES = [
  "packages/server/src/entry/compose/rpg.ts",
  "packages/server/src/domain/chat/engine/smart-arbitrate.ts",
  "packages/server/src/domain/chat/verbs/compaction.ts",
  "packages/server/src/domain/automation/engine/arm-executors.ts",
  "packages/server/src/domain/automation/engine/analysis-arm.ts",
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

const PROSE_MIN_WORDS = 12;
const WORD_RE = /\S+/gu;
const LOWER_RUN_RE = /[a-z]{3,}/u;
const OPERATOR_CALLEE_RE = /^(?:logger|log|console)\b|getLog\(\)/u;
const ERROR_NAME_RE = /Error$/u;

const MESSAGE =
  "model-facing prose hardcoded at a prompt-assembly seam — every string whose bytes reach a model is a " +
  "PROSE-1 slot (a shipped default in a contracts prose catalog + resolveProse), not a constant; a hardcoded " +
  "seam string is invisible to hosts and to the registry (D132). Author it as a " +
  "slot row in the domain's prose catalog (packages/contracts/src/*/prose.ts) and resolve it at the seam.";
const FIX =
  "move the bytes into the owning domain's prose catalog as a slot row and call resolveProse/resolveProseText " +
  "at the seam; a genuinely structural string (a wire token, a stub grammar) below 12 words never trips this. " +
  "A deliberate exception waives with `@orb-waive no-hardcoded-model-prose(<word>): <reason + end condition>` " +
  "— the position is the first STATIC word of the unit (skipping any `${…}` interpolation), the literal text " +
  "the report passes explicitly at that word's own offset.";
const DEAD_MESSAGE =
  "DEAD catalog prose — authored, referenced by nothing (no in-file use, no importer): the RPG_STATE_TRACKING_GUIDE " +
  "class, D132. Wire it into a slot row or delete it.";

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
    return joinCallText(node);
  }
  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return node.getElements().map(unitText).join(" ");
  }
  return "";
}

function joinCallText(node: CallExpression): string {
  const callee = node.getExpression();
  const arr = callee.isKind(SyntaxKind.PropertyAccessExpression) ? callee.getExpression() : undefined;
  return arr?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? arr.getElements().map(unitText).join(" ") : "";
}

/** The `[…].join(…)` CallExpression over an array literal, when `p` is that array — else undefined. */
function joinAggregate(p: Node): Node | undefined {
  const access = p.isKind(SyntaxKind.ArrayLiteralExpression) ? p.getParent() : undefined;
  const isJoinAccess = access !== undefined && access.isKind(SyntaxKind.PropertyAccessExpression) && access.getName() === "join";
  const call = isJoinAccess ? access.getParent() : undefined;
  return call?.isKind(SyntaxKind.CallExpression) === true ? call : undefined;
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

const WORD_START_RE = /[A-Za-z][A-Za-z0-9]*/u;

/** The first STATIC word in `text`, skipping any `${…}` interpolation span — guarantees a token free of
 *  parens/newlines (guide §2.1's marker-grammar hazard) and never inside live-evaluated source. */
function firstStaticWord(text: string): { readonly token: string; readonly offset: number } | undefined {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("${", i)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (depth > 0) {
      if (text[i] === "}") {
        depth -= 1;
      }
      continue;
    }
    const rest = text.slice(i);
    const match = WORD_START_RE.exec(rest);
    if (match !== null && match.index === 0) {
      return { token: match[0], offset: i };
    }
  }
  // biome-ignore lint/complexity/noUselessUndefined: tsconfig.base.json enables noImplicitReturns.
  return undefined;
}

interface ProseSite {
  readonly top: Node;
}

/** Every prose UNIT in one seam file. Population-wide callers filter to seam files before calling this. */
function seamProseSites(seen: Set<number>, lit: Node): ProseSite | undefined {
  const top = topOfUnit(lit);
  const alreadySeen = seen.has(top.getStart());
  seen.add(top.getStart());
  const text = unitText(top);
  const qualifies = !alreadySeen && wordCount(text) >= PROSE_MIN_WORDS && LOWER_RUN_RE.test(text) && !isOperatorFacing(top);
  // biome-ignore lint/complexity/noUselessUndefined: tsconfig.base.json enables noImplicitReturns.
  return qualifies ? { top } : undefined;
}

interface CatalogCandidate {
  readonly decl: VariableDeclaration;
  readonly file: string;
  readonly name: string;
}

export const gate = defineGate({
  id: "no-hardcoded-model-prose",
  family: "no-hardcoded-model-prose",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const seenBySeamFile = new Map<string, Set<number>>();
    const freqByFile = new Map<string, Map<string, number>>();
    const importedNameFiles = new Map<string, Set<string>>();
    const catalogCandidates: CatalogCandidate[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateExpression],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            if (!isSeam(rel)) {
              return;
            }
            const seen = seenBySeamFile.get(rel) ?? new Set<number>();
            const site = seamProseSites(seen, node);
            seenBySeamFile.set(rel, seen);
            if (site !== undefined) {
              const text = site.top.getText();
              const anchor = firstStaticWord(text);
              // A qualifying finding's `unitText` already proved a ≥12-word static run, so `text` (its raw
              // superset, interpolations included) always contains a static word; the fallback exists only
              // so the return type stays honest about `firstStaticWord`'s general (unreachable-here) shape.
              // biome-ignore lint/suspicious/noUnnecessaryConditions: unreachable in practice, not in type.
              const token = anchor?.token ?? text.slice(0, 1);
              // biome-ignore lint/suspicious/noUnnecessaryConditions: unreachable in practice, not in type.
              const offset = anchor?.offset ?? 0;
              ctx.report.node(site.top, { token, offset, message: MESSAGE, fix: FIX });
            }
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            const freq = freqByFile.get(rel) ?? new Map<string, number>();
            const text = node.getText();
            freq.set(text, (freq.get(text) ?? 0) + 1);
            freqByFile.set(rel, freq);
          },
        },
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile) => {
            if (!Node.isImportSpecifier(node)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            const name = node.getName();
            const files = importedNameFiles.get(name) ?? new Set<string>();
            files.add(rel);
            importedNameFiles.set(name, files);
          },
        },
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!Node.isVariableDeclaration(node)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            if (!CATALOG_SET.has(rel)) {
              return;
            }
            const init = node.getInitializer();
            if (init === undefined) {
              return;
            }
            const text = unitText(init);
            if (wordCount(text) < PROSE_MIN_WORDS || !LOWER_RUN_RE.test(text)) {
              return;
            }
            catalogCandidates.push({ decl: node, file: rel, name: node.getName() });
          },
        },
      ],
      evaluate: () => {
        for (const candidate of catalogCandidates) {
          const inFileRefs = freqByFile.get(candidate.file)?.get(candidate.name) ?? 0;
          if (inFileRefs > 1) {
            continue;
          }
          const importers = importedNameFiles.get(candidate.name);
          const importedElsewhere = importers !== undefined && [...importers].some((f) => f !== candidate.file);
          if (importedElsewhere) {
            continue;
          }
          const nameNode = candidate.decl.getNameNode();
          ctx.report.node(candidate.decl, {
            token: nameNode.getText(),
            offset: nameNode.getStart() - candidate.decl.getStart(),
            message: `${MESSAGE} ${DEAD_MESSAGE}`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/rpg/substrate/__probe.ts":
          'export const NEW_TEACH =\n  "When the scene calls for it, teach the model to answer in the voice of the narrator and keep it steady.";\n',
      },
      expect: { count: 1, token: "When" },
      why: "the founding shape — a fresh model-facing teach authored at a seam instead of a catalog slot (the gate is flat now — #578, no baseline to admit it)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/rpg/tools/__probe.ts":
          'export const DESC = {\n  description: "Use this tool whenever the story needs a dice roll and report the result in plain words.",\n};\n',
      },
      expect: { count: 1, token: "Use" },
      why: "a tool `description:` is model-facing prose — the §2.5 class",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/assembly/__probe.ts":
          'export const SPLIT = "Record only what the story actually " + "establishes and never invent numbers, " + "items, or events it does not show.";\n',
      },
      expect: { count: 1, token: "Record" },
      why: "a `+`-chunked dodge — the chain is ONE unit, judged on its concatenated text, reported once",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/memory/generate/substrate/__probe.ts":
          "export const JOINED = [\n" +
          '  "You distill a block of roleplay transcript",\n' +
          '  "into a compact retrieval-optimized memory unit",\n' +
          '  "and never add commentary or markdown headers.",\n' +
          '].join("\\n");\n',
      },
      expect: { count: 1, token: "You" },
      why: "the array-join spelling of the same dodge — aggregated, one unit, one finding",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          "export const DEAD_GUIDE =\n" +
          '  "Track every plane the beat changes and restate the current values so the panel reflects the story.";\n' +
          "export const USED = { text: DEAD_GUIDE_OTHER };\nconst DEAD_GUIDE_OTHER = 'x';\n",
      },
      expect: { count: 1, token: "DEAD_GUIDE", messageIncludes: "DEAD catalog prose" },
      why: "ARM B — a catalog prose const referenced by nothing (the RPG_STATE_TRACKING_GUIDE row-27 class)",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/discovery/prose.ts":
          "export const DEAD_TWO =\n" +
          '  "This second dead prose line also has enough words to trip the twelve word floor for the catalog.";\n' +
          'export const OTHER = { note: "short" };\n',
      },
      expect: { count: 1, token: "DEAD_TWO", messageIncludes: "DEAD catalog prose" },
      why: "a SECOND catalog file's dead prose — proves the identifier-frequency/import-liveness censuses are per-file/per-name, not accidentally global-singleton state left over from the first candidate",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          'export const REMOTE_TEACH =\n  "This teach line stays in the catalog with no local reference at all in this file whatsoever.";\n',
        "packages/client/src/features/chat/lib/uses-it.ts":
          'import { REMOTE_TEACH } from "../../../../contracts/src/chat/prose.ts";\nexport const t = REMOTE_TEACH;\n',
      },
      why: "THE POPULATION WIDENING PROVEN: a catalog const with zero in-file references is ALIVE because a CLIENT file imports it — the exact shape (`@orb/contracts/prose` consumed from `packages/client/src/features/{chat,preset}/**`) that made the narrow legacy population blind. Narrowing back to seam+catalog is the row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          "export const SLOT = {\n" +
          "  id: 'chat.recovery.narrativeContinuation',\n" +
          '  text: "Continue the story naturally from where it left off and keep the same narrative voice throughout.",\n' +
          "};\nexport const TABLE = { slot: SLOT };\n",
      },
      why: "prose authored in its CATALOG and referenced by the table — the sanctioned home",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/assembly/__probe.ts":
          'import { logger } from "#foundation";\n' +
          'export const f = () => logger.warn({ n: 1 }, "this operator-facing warning has more than twelve words and still must never trip the model-prose fence");\n',
      },
      why: "§7.2 class 2 — a logger argument faces an operator, never a model",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/rpg/substrate/__probe.ts":
          "export function f(x: number) {\n" +
          '  if (x > 1) throw new Error("a refusal sentence with well over twelve words that reaches an operator or a caller, never a model");\n' +
          "  return x;\n}\n",
      },
      why: "`new *Error` / `throw` arguments are the refusal class — structural, not wording-matched",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/assembly/__probe.ts": 'export const LABEL = "Party:";\nexport const STUB = "[image omitted]";\n' },
      why: "DECLARED LIMIT written down: sub-12-word structural labels/stubs are the seam's GRAMMAR (PROSE-1 §2.11), below the threshold by design",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/compose/rpg.ts": 'export const V = ["a", "b"].join(", ");\nexport const SHORT = `only a few short template words here`;\n',
      },
      why: "short joins/templates below the word floor never trip — the wire vocabulary stays legal",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/rpg/substrate/__probe.ts":
          "// @orb-waive no-hardcoded-model-prose(When): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const NEW_TEACH =\n  "When the scene calls for it, teach the model to answer in the voice of the narrator and keep it steady.";\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of mustFlag[0], producing exactly one finding, waived by the one central marker at the position this policy actually reports (the first static word `When`)",
    },
  ],
});
