// Gate: wire-schema-vocab-one-home (Core-Path-Registry.md D93) — a JSON-Schema KEYWORD table spelled outside
// the one scrub engine. Three hand-rolled walkers drifted three ways over the same vocabulary before
// `packages/kit/src/json-schema/wire-subset.ts` absorbed them (the agent-sdk's was position-aware, vLLM's was
// not, OpenRouter had none), so a re-spelling is the rot signature. The vocabulary is READ OFF the engine's
// own const arrays. Fence: ≥2 DISTINCT keywords in one file (a lone `"title"`/`"default"` is English).
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { repoRel } from "../pass.ts";

// The ENGINE — the single source of truth for both the vocabulary and this gate's own liveness.
const ENGINE_REL = "packages/kit/src/json-schema/wire-subset.ts";
const LIFT_REL = "packages/kit/src/json-schema/lift.ts";
// The const arrays inside the engine whose string members ARE the keyword vocabulary. Reading them (rather
// than re-listing them here) means a keyword added to the engine arms this gate in the same commit.
const VOCAB_CONSTS: readonly string[] = ["BOUND_KEYWORDS", "META_KEYWORDS", "ANNOTATION_KEYWORDS"];
// Two distinct keywords in one file is a keyword TABLE; one is prose. Measured against the real tree: the
// only files clearing this fence are the engine and its inverse (`lift.ts`), both allowlisted below.
const TABLE_FENCE = 2;
const GATE_SELF = "scripts/check/gates/wire-schema-vocab-one-home.ts";

// The sanctioned homes are SCANNED, not scoped out (GATE-AUTHORING.md §3): a moved file goes RED at its new
// path instead of silently carrying its exemption. Both rows are PERMANENT — they ARE the engine.
const ALLOWLIST: ExemptionTable = {
  [ENGINE_REL]: {
    why: "THE engine — this file DEFINES the vocabulary the gate reads. Ends only if the wire-subset scrub is deleted or re-homed (then ENGINE_REL and this row move together).",
  },
  [LIFT_REL]: {
    why: "the INVERSE direction (JSON Schema → zod): it must read the bound keywords to rebuild the zod belt, so it is a READER of the vocabulary, not a second wire-subset table. Ends if lifting moves behind the scrub engine.",
  },
};

const MESSAGE =
  "a JSON-Schema wire KEYWORD vocabulary is spelled outside the one scrub engine " +
  "(packages/kit/src/json-schema/wire-subset.ts). Which keywords a wire may carry is per-WIRE vocabulary, and " +
  "three hand-rolled walkers already drifted three ways over it — one was position-aware and one silently " +
  "deleted a field literally named `title` from the guided-decoding wire, while a third backend scrubbed " +
  "nothing at all and shipped keywords both vendors document as unsupported (D93). A second table is that " +
  "drift starting again.";

const FIX =
  "call the engine instead of re-spelling its table: `scrubWireSchema(schema, mode)` from " +
  "`@orb/kit/json-schema`, with the WireSchemaMode this wire speaks (hosted-common · anthropic-format · " +
  "guided-decoding · strict-compatible). A wire needing a subset no mode expresses gets a NEW mode in " +
  "wire-subset.ts — the mapped Record makes tsc demand a row for it — never a local walk.";

const DEAD_ENGINE =
  `${ENGINE_REL} resolves but declares none of ${VOCAB_CONSTS.join("/")} — this gate reads its vocabulary from ` +
  "those arrays, so it is now scanning for NOTHING and reports ✓ forever. Repoint the const names in " +
  `${GATE_SELF} (scripts/check/GATE-AUTHORING.md §4).`;

const RESPELLS = (names: readonly string[]): string =>
  `this file spells the wire keyword table itself (${names.join(", ")}) instead of calling ${ENGINE_REL}. ${MESSAGE}`;

const STALE_ROW = (rel: string): string =>
  `the ALLOWLIST row \`${rel}\` in ${GATE_SELF} matches no live keyword table any more — the file moved, was ` +
  "deleted, or stopped spelling the vocabulary. A stale exemption is a loaded gun: delete the row " +
  "(scripts/check/GATE-AUTHORING.md §4).";

/** Where a wire request is BUILT (server) and where a shared walk could be re-invented (kit). The TEST corpus
 *  is out by construction: `tests/kit/json-schema/wire-subset.test.ts` asserts on every keyword by name. */
function inScope(p: string): boolean {
  return (p.startsWith("packages/server/src/") || p.startsWith("packages/kit/src/")) && !p.includes(".test.");
}

/** The keyword vocabulary, read from the engine's own `const X = [...] as const` arrays. */
function vocabulary(engine: SourceFile | undefined): Set<string> {
  const out = new Set<string>();
  if (engine === undefined) {
    return out;
  }
  for (const name of VOCAB_CONSTS) {
    const init = engine.getVariableDeclaration(name)?.getInitializer();
    const arr = init !== undefined && Node.isAsExpression(init) ? init.getExpression() : init;
    if (arr === undefined || !Node.isArrayLiteralExpression(arr)) {
      continue;
    }
    for (const el of arr.getElements()) {
      if (Node.isStringLiteral(el)) {
        out.add(el.getLiteralText());
      }
    }
  }
  return out;
}

/** The DISTINCT vocabulary keywords this file spells as string literals, with the line of the first one. */
function keywordTable(sf: SourceFile, vocab: ReadonlySet<string>): { readonly names: string[]; readonly line: number } {
  const names = new Set<string>();
  let line = 1;
  const literals = [...sf.getDescendantsOfKind(SyntaxKind.StringLiteral), ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)].sort(
    (a, b) => a.getStart() - b.getStart(),
  );
  for (const lit of literals) {
    const text = lit.getLiteralText();
    if (!vocab.has(text) || names.has(text)) {
      continue;
    }
    if (names.size === 0) {
      line = lit.getStartLineNumber();
    }
    names.add(text);
  }
  return { names: [...names].sort(), line };
}

function scan(ctx: GateRunCtx): void {
  const engine = ctx.project.getSourceFile(`${ctx.root}/${ENGINE_REL}`);
  const vocab = vocabulary(engine);
  if (vocab.size === 0) {
    // §4.6 blindness tripwire: the engine is HERE but its vocabulary arrays are not — the gate is a no-op.
    // (No engine at all ⇒ this fileset is not the real tree; judge nothing.)
    if (engine !== undefined) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: DEAD_ENGINE });
    }
    return;
  }
  const hitAllowlisted = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const rel = repoRel(ctx.root, sf.getFilePath());
    if (!inScope(rel)) {
      continue;
    }
    const table = keywordTable(sf, vocab);
    if (table.names.length < TABLE_FENCE) {
      continue;
    }
    if (rel in ALLOWLIST) {
      hitAllowlisted.add(rel);
      continue;
    }
    ctx.report({ file: rel, line: table.line, column: 0, message: RESPELLS(table.names) });
  }
  // The two-sided arm, guarded on the ENGINE as its real-tree anchor (never a `scope.kind` check — a
  // conformance mini-project reports "project" too and would red this gate's own self-proof).
  for (const rel of Object.keys(ALLOWLIST)) {
    if (!hitAllowlisted.has(rel)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_ROW(rel) });
    }
  }
}

// Every example plants BOTH sanctioned homes: the engine (which supplies the vocabulary) and `lift.ts`
// (whose allowlist row's stale arm would otherwise fire and drown the example's own expectation).
const ENGINE_SRC =
  'const BOUND_KEYWORDS = ["minLength", "maxLength", "minimum"] as const;\n' +
  'const META_KEYWORDS = ["$schema"] as const;\n' +
  'const ANNOTATION_KEYWORDS = ["title", "default"] as const;\n' +
  "export const x = [BOUND_KEYWORDS, META_KEYWORDS, ANNOTATION_KEYWORDS];\n";
const LIFT_SRC = 'export const bounds = ["minLength", "maxLength"];\n';

export const gate: GateDescriptor = {
  name: "wire-schema-vocab-one-home",
  docRow: "Core-Path-Registry.md D93",
  status: "active",
  scopeSafety: "whole-project", // the vocabulary itself is read from another file (the engine)
  message: MESSAGE,
  fix: FIX,
  scanRoot: inScope,
  run: scan,
  mustFlag: [
    {
      files: {
        [ENGINE_REL]: ENGINE_SRC,
        [LIFT_REL]: LIFT_SRC,
        "packages/server/src/infra/providers/backends/newvendor/schema.ts":
          'const DROP = new Set(["minLength", "maxLength", "$schema"]);\n' +
          "export function clean(n: Record<string, unknown>): void {\n  for (const k of Object.keys(n)) {\n    if (DROP.has(k)) {\n      delete n[k];\n    }\n  }\n}\n",
      },
      expect: { count: 1 },
      why: "the founding shape — a FOURTH backend re-spelling the keyword table in its own walk, exactly how the agent-sdk / vLLM / OpenRouter walkers drifted three ways before D93 unified them",
    },
    {
      files: {
        [ENGINE_REL]: ENGINE_SRC,
        [LIFT_REL]: LIFT_SRC,
        "packages/kit/src/wire/subset2.ts": 'export const TABLE = { minimum: true, title: true } as const;\nexport const keys = ["minimum", "title"];\n',
      },
      expect: { count: 1 },
      why: "a SECOND engine inside kit itself — the rot need not be in a backend; the scan covers every place a shared walk could be re-invented, and an object-literal table counts as much as an array",
    },
    {
      files: {
        [ENGINE_REL]: "export const nothing = 1;\n",
        [LIFT_REL]: LIFT_SRC,
      },
      expect: { messageIncludes: "scanning for NOTHING" },
      why: "the §4.6 BLINDNESS tripwire: the engine exists but its vocabulary consts were renamed away, which would otherwise make this gate report ✓ forever over an empty keyword set",
    },
  ],
  mustPass: [
    {
      files: { [ENGINE_REL]: ENGINE_SRC, [LIFT_REL]: LIFT_SRC },
      why: "the two sanctioned homes alone: the engine (which DEFINES the vocabulary) and the inverse `lift.ts` reader. Both are SCANNED and allowlisted with a reason, so a move reds at the new path (§3) — and both being HIT keeps the two-sided stale arm quiet",
    },
    {
      files: {
        [ENGINE_REL]: ENGINE_SRC,
        [LIFT_REL]: LIFT_SRC,
        "packages/server/src/domain/credentials/verbs/add.ts": 'const DEFAULT_LABEL = "default";\nexport const label = DEFAULT_LABEL;\n',
        "packages/server/src/domain/databank/verbs/scrape/scrape-wiki.ts": 'export const key = "title";\n',
      },
      why: 'THE FENCE, measured on the real tree: `"default"`/`"title"` are ordinary English living all over the server (credential labels, preset ids, wiki query params). ONE keyword in a file is prose; two DISTINCT is a table',
    },
    {
      files: {
        [ENGINE_REL]: ENGINE_SRC,
        [LIFT_REL]: LIFT_SRC,
        "packages/server/src/infra/providers/backends/agent-sdk/output-schema.ts":
          'import { scrubWireSchema } from "@orb/kit/json-schema";\nexport const clean = (s: Record<string, unknown>): unknown => scrubWireSchema(s, "anthropic-format");\n',
      },
      why: "the SANCTIONED shape — a backend that names its WireSchemaMode and delegates the walk. A mode string is not vocabulary, so calling the engine can never trip its own gate",
    },
  ],
};
