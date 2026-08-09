// Gate: zod-modern-spellings — the anti-backslide ratchet for the zod 4.4.3 leverage audit
// (docs/reviews/stickler/2026-08-02-zod-leverage-audit.md). Every arm here is a RULED finding whose
// remedy already landed on the tree; the gate exists so the old spelling cannot creep back in through a
// copy-paste from an older file, a stale comment, or an agent's zod-3 muscle memory. Three of the four
// arms land at ZERO on the tree at landing — which is the only honest thing a ratchet can be — and the
// fourth (ARM C) landed one real fix in this gate's own commit.
//
// ARM A — `.strict()` DIRECTLY on a `z.object(…)` call → `z.strictObject(…)` [F2].
//   The five sites that carried this spelling did so for a WRITTEN reason that is FALSE on 4.4.3:
//   preset/index.ts used to say strictObject "inflates the inferred type with an index-signature tag that
//   propagates through `.optional()` and trips `noPropertyAccessFromIndexSignature`". Probed against the
//   installed d.ts (`core/schemas.d.ts`: `$strict = { out: {}; in: {} }`, byte-identical to `$strip`) and
//   type-level-probed under the repo's own strict flags with a planted-error control: clean. The comment
//   was corrected and all five sites respelled; `.strict()` is tagged legacy-compat in the installed
//   `classic/schemas.d.ts`. DELIBERATELY NARROW — the flagged receiver must be the `z.object(…)` call
//   itself, because that is the only shape with a mechanical remedy. A `.strict()` on a schema VARIABLE
//   (`baseSchema.strict()`) has no `z.strictObject` respelling at all, so flagging it would be demanding a
//   fix that does not exist; zero such sites exist, and this sentence is the written baseline a future
//   widening starts from.
//
// ARM B — an ALL-LITERAL `z.union([z.literal(a), z.literal(b), …])` → multi-value `z.literal([a, b, …])` [F7].
//   Not cosmetic: the union form emits a NESTED `invalid_union` issue on failure, the multi-value literal
//   emits ONE `invalid_value` naming every option — the difference between a refusal a human can act on and
//   one they cannot. Same accepted set, same inferred type. Undiscriminated unions of non-literals
//   (`z.union([z.number(), z.string()])`, the json-value lazy union, the dynamic lift member list) are a
//   DIFFERENT construct and are never touched: the arm requires EVERY member to be a `z.literal(…)` call.
//
// ARM C — a hand-flattened `<…>.error.issues` read outside the CITED model-facing join sites [F4].
//   `z.prettifyError` is the law for a USER-facing refusal: the old `issues[0]?.message` printed
//   "Too small: expected string to have >=1 characters" with no path, so an operator importing a
//   500-section preset got a refusal naming no field. The sanctioned survivors are the MODEL-facing
//   `path.join(".") + ": " + message` joins (a model reads them against its own schema) and the two
//   write-guard re-emits — each carries its reason in the ISSUES_ALLOWLIST below, with a both-ways
//   ratchet, so a site that stops earning its sanction goes RED instead of keeping it. This arm found and
//   fixed one live offender in its landing commit (`domain/plugin/substrate/manifest.ts` — an
//   operator-facing bundle refusal that dropped the path via `issues.map(i => i.message)`).
//
// ARM D — `z.enum(["true", "false"])` → `z.stringbool({truthy:["true"], falsy:["false"], case:"sensitive"})` [F5].
//   The seven env boolean knobs now share ONE `envBool` codec (foundation/env/index.ts). The PARAMS are the
//   whole point and the arm exists to keep them: bare `z.stringbool()` is case-INSENSITIVE and also accepts
//   `1/0/yes/no/on/off` (probed on 4.4.3), so an unpinned drop-in silently WIDENS a boot-refusal vocabulary.
//   The arm bites the hand-rolled ENUM, not a bare `z.stringbool()` — a gate cannot judge whether an
//   unpinned codec is a mistake or a deliberate wide knob; the pinning lives in `envBool`'s one home, and
//   `sole-env-reader` already keeps env parsing there.
//
// NOT AN ARM, deliberately — `.transform()` on the tool/extraction PROJECTION surface (the
// [tool-schema-no-branded-transform] toxin). `tests/contracts/rpg/tools.contract.test.ts` already runs the
// REAL `z.toJSONSchema` over all seven tool arg schemas, which catches a transform anywhere in the
// reachable graph (nested, imported, or added later to a shared helper) — something a syntactic gate cannot
// follow. The list is closed by construction: an eighth tool needs a member in `RPG_LITE_TOOL_NAMES`, whose
// 7-tuple is pinned by the test one block above. A syntactic arm here would be strictly weaker AND noisy
// (the legitimate off-projection `.transform()` sites — `kit/ids`'s `typeIdSchema` at the tRPC edges — are
// exactly the ones it would flag).
//
// SCOPE: `packages/**` only. `scripts/` and `tests/` are OUT — dev tooling is KISS by doctrine, and a test
// may plant an old spelling deliberately as a fixture. DECLARED BLIND SPOTS beyond the ARM-A one above: a
// schema assembled through a helper (`makeStrict(z.object(…))`) carries none of these shapes in its own
// source, the literal-shape reader's honest limit.
//
// SUPPRESSION: the four SPELLING arms report NODE-anchored and carry their arm as the finding's token, so
//   `// @orb-gate-ignore zod-modern-spellings(strict-object|literal-union|error-issues|bool-enum): <reason>`
//   works AND names its position (§4.3a — one line really can carry two of these: a
//   `z.object({k: z.union([z.literal("a"), z.literal("b")])}).strict()` is both ARM A and ARM B). Until
//   2026-08-08 all four reported through the explicit-`Finding` overload, which bypasses `hasGateIgnore` by
//   construction: EVERY marker on every arm was inert, and nothing said so (the same defect
//   `platform-spellings` carried — this gate is where it was copied from). The per-arm `Finding.message`
//   overrides went with it; the reason now lives once on `MESSAGE`, which is where the harness homes it.
//   The `finalize` STALE arm KEEPS the Finding overload deliberately — it anchors on this gate FILE, has no
//   node to read a marker from, and §1 reserves the overload for exactly that.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const ZOD_NS = "z";
const OBJECT_METHOD = "object";
const STRICT_METHOD = "strict";
const UNION_METHOD = "union";
const LITERAL_METHOD = "literal";
const ENUM_METHOD = "enum";
const ISSUES_PROPERTY = "issues";
const ERROR_PROPERTY = "error";
const BOOL_STRINGS: ReadonlySet<string> = new Set(["true", "false"]);
const BOOL_ENUM_ARITY = 2;
const MIN_LITERAL_UNION_MEMBERS = 2;
const SCAN_PREFIX = "packages/";
const GATE_SELF = "scripts/check/gates/zod-modern-spellings.ts";
const LEADING_SLASH_RE = /^\/+/u;

/** The tell that a run's fileset IS the real tree — a synthetic conformance mini-project also reports
 *  `scope.kind === "project"`, so without an anchor every self-proof example would "prove" that all six
 *  sanctioned join sites had vanished (the `own-tables-only` / `contract-derives-not-respells` idiom). The
 *  env schema is the anchor because no example may plausibly need that exact path (and the examples all use
 *  `probe-` filenames for the same reason). */
const REAL_TREE_ANCHOR = "packages/server/src/foundation/env/index.ts";

/** ARM C survivors — the MODEL-facing `path: message` joins and the two write-guard re-emits. Both-ways
 *  ratchet: a row whose file no longer reads `.error.issues` is RED, so a site that got prettified (or
 *  moved) cannot keep a standing exemption. */
const ISSUES_ALLOWLIST: Record<string, string> = {
  "packages/server/src/domain/tool-use/verbs/register.ts":
    "MODEL-facing: the tool registry hands the failing model `path.join('.') + ': ' + message` so it can match the refusal against its own arg schema. The path is CARRIED, not dropped — the opposite of the F4 defect — and `z.prettifyError`'s human layout (`→ at config.sections[0].id`) is the wrong shape for a wire the model re-reads.",
  "packages/server/src/domain/tool-use/verbs/register-plugin-tool.ts":
    "MODEL-facing, the plugin twin of `register.ts` — the identical `path: message` convention, deliberately kept byte-identical between the two registration doors so a model sees one refusal vocabulary.",
  "packages/server/src/domain/refinery/substrate/schema-forge.ts":
    "STRUCTURAL RE-EMIT: the §4.5 lift-refusal bridge maps each document-belt issue into the OUTER envelope parse (`ctx.addIssue({path: issue.path, …})`) so the bounded retry's correction prompt carries construct + path to the MODEL — the path is carried, never dropped, and prettify's human layout is the wrong shape for a wire the model re-reads.",
  "packages/server/src/kit/structured-turn/index.ts":
    "MODEL-facing: the issue summary is fed straight BACK to the model as the retry prompt (`args.run(first.issues)`), so it must be the schema-addressable `path: message` form, not a human-formatted tree.",
  "packages/contracts/src/rpg/extraction.ts":
    "MODEL-facing: `issueLines` renders the salvage drop list in the same `path: message` convention (the shared-plane proof means the structured plane and its tool validate through the identical schema, so the two refusal texts must agree).",
  "packages/contracts/src/persona/index.ts":
    "a write-guard RE-EMIT, not a message render: `personaMetadataWriteSchema`'s superRefine forwards each inner issue as `ctx.addIssue({code:'custom', message, path})`. It keeps `path` — `prettifyError` returns a STRING and would collapse the whole issue array into one opaque message on the outer error.",
  "packages/contracts/src/world-info/index.ts":
    "the same write-guard RE-EMIT for `entryMetadataWriteSchema` (its header cites the persona rationale verbatim) — issues forwarded structurally, never flattened to a display string.",
};

// THE ONE REASON, printed once per group. It carries all four arms BY TOKEN — the per-arm `Finding.message`
// overrides are gone with the Finding overload that carried them (see the header's SUPPRESSION note), so the
// load-bearing halves of each ("byte-identical", "widens the vocabulary") had to come home here rather than
// die. Each occurrence's token says which arm it is.
const MESSAGE =
  "a superseded zod spelling — the zod 4.4.3 leverage audit ruled each of these and its remedy already " +
  "landed on the tree (docs/reviews/stickler/2026-08-02-zod-leverage-audit.md). `strict-object`: `.strict()` " +
  "on a `z.object(…)` is legacy-compat (F2 — the documented reason to avoid `z.strictObject` claimed it " +
  "inflates the inferred type with an index-signature tag; that is FALSE on 4.4.3, where `$strict` is " +
  "byte-identical to `$strip`). `literal-union`: an all-literal `z.union` emits a nested `invalid_union` " +
  "where multi-value `z.literal([…])` emits one option-naming `invalid_value` (F7) — same accepted set, same " +
  "inferred type, an actionable refusal. `error-issues`: a hand-flattened `error.issues` drops the PATH from " +
  'a user-facing refusal, which `z.prettifyError` carries (F4 — `issues[0].message` printed "Too small: ' +
  'expected string to have >=1 characters" and named no field). `bool-enum`: a `z.enum(["true","false"])` ' +
  "hand-rolls `z.stringbool` (F5) — and the PARAMS are the point, since a bare `z.stringbool()` is " +
  "case-INSENSITIVE and also accepts `1/0/yes/no/on/off`, silently widening a knob whose old vocabulary was " +
  "a LOUD boot refusal. Every one is semantics-preserving — there is no legitimate survivor to allowlist " +
  "except the CITED model-facing join sites.";

const FIX =
  "respell it: `z.object({…}).strict()` → `z.strictObject({…})`; `z.union([z.literal(a), z.literal(b)])` → " +
  "`z.literal([a, b])`; a user-facing refusal → `z.prettifyError(result.error)` (it carries the path — see " +
  "packages/contracts/src/preset/index.ts `parsePresetFile`); an env boolean → the pinned `envBool` codec in " +
  "packages/server/src/foundation/env/index.ts. If a `.error.issues` read is genuinely MODEL-facing (the " +
  "`path: message` convention a model matches against its own schema) or a structural write-guard re-emit, " +
  "it takes an ISSUES_ALLOWLIST row WITH that reason in scripts/check/gates/zod-modern-spellings.ts.";

/** The ARM tokens — each finding's `token`, and therefore the POSITION an `@orb-gate-ignore` names. They are
 *  self-identifying labels rather than lexemes (the `no-inline-union-redecl` idiom), because a lexeme could
 *  not tell these arms apart: ARM A and ARM B both anchor on a `CallExpression` whose text starts `z.`.
 *  DELIBERATELY COUNT-FREE — the retired `UNION_MESSAGE(count)` named the member count, and a position that
 *  moved every time someone added a union member would break a standing marker on an unrelated edit. The
 *  count is legible at the anchored line; the position has to be stable to be namable. */
const ARM_TOKENS = { strictObject: "strict-object", literalUnion: "literal-union", errorIssues: "error-issues", boolEnum: "bool-enum" } as const;

/** GATE-AUTHORING §1: the NODE overload for every node-anchored, suppressible finding. The Finding overload
 *  bypasses `hasGateIgnore` entirely — reported that way, no `@orb-gate-ignore` on this gate could ever
 *  work. Only `finalize`'s stale arm keeps it, and only because it anchors on this gate FILE. */
function report(node: Node, token: string, ctx: GateRunCtx): void {
  ctx.report(node, { token, offset: 0 });
}

const STALE_ISSUES_PREFIX =
  "ISSUES_ALLOWLIST row for a file that no longer reads `.error.issues` — the sanction is unused (ratchet " +
  "down): delete the stale row in zod-modern-spellings.ts: ";

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

/** Is `node` the call `z.<method>(…)`? */
function isZodCall(node: Node, method: string): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = node.getExpression();
  return callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === method && callee.getExpression().getText() === ZOD_NS;
}

/** The sole argument of a call, when it is an array literal. */
function soleArrayArgument(node: Node): readonly Node[] | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const args = node.getArguments();
  const first = args[0];
  if (args.length !== 1 || first === undefined || !first.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return;
  }
  return first.getElements();
}

/** ARM A: `z.object({…}).strict()` — the receiver must be the `z.object(…)` call itself (see the header's
 *  narrowness note: a `.strict()` on a schema VARIABLE has no `z.strictObject` respelling). */
function isStrictOnZodObject(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression) || node.getArguments().length > 0) {
    return false;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === STRICT_METHOD)) {
    return false;
  }
  return isZodCall(callee.getExpression(), OBJECT_METHOD);
}

/** ARM B: `z.union([z.literal(…), z.literal(…), …])` — EVERY member a literal, ≥2 of them. */
function literalUnionSize(node: Node): number | undefined {
  if (!isZodCall(node, UNION_METHOD)) {
    return;
  }
  const members = soleArrayArgument(node);
  if (members === undefined || members.length < MIN_LITERAL_UNION_MEMBERS) {
    return;
  }
  return members.every((m) => isZodCall(m, LITERAL_METHOD)) ? members.length : undefined;
}

/** ARM D: `z.enum(["true", "false"])` in either order — the hand-rolled env boolean codec. */
function isBooleanStringEnum(node: Node): boolean {
  if (!isZodCall(node, ENUM_METHOD)) {
    return false;
  }
  const members = soleArrayArgument(node);
  if (members === undefined || members.length !== BOOL_ENUM_ARITY) {
    return false;
  }
  const texts = members.flatMap((m) => (m.isKind(SyntaxKind.StringLiteral) ? [m.getLiteralText()] : []));
  return texts.length === BOOL_ENUM_ARITY && texts.every((t) => BOOL_STRINGS.has(t)) && texts[0] !== texts[1];
}

/** ARM C: a `.issues` read whose receiver's TAIL is `error` — `parsed.error.issues`, `known.error.issues`,
 *  and the bare `error.issues` of a helper taking a `z.ZodError` parameter. `first.issues` (our own
 *  `ParseOutcome`) and `this.issues` (the StructuredOutputError field) are a different receiver and never
 *  match. */
function isZodErrorIssuesRead(node: Node): boolean {
  if (!(node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === ISSUES_PROPERTY)) {
    return false;
  }
  const receiver = node.getExpression();
  if (receiver.isKind(SyntaxKind.Identifier)) {
    return receiver.getText() === ERROR_PROPERTY;
  }
  return receiver.isKind(SyntaxKind.PropertyAccessExpression) && receiver.getName() === ERROR_PROPERTY;
}

const passSeenIssuesAllowed = new Set<string>();

function visitCall(node: Node, ctx: GateRunCtx): void {
  if (isStrictOnZodObject(node)) {
    report(node, ARM_TOKENS.strictObject, ctx);
    return;
  }
  if (literalUnionSize(node) !== undefined) {
    report(node, ARM_TOKENS.literalUnion, ctx);
    return;
  }
  if (isBooleanStringEnum(node)) {
    report(node, ARM_TOKENS.boolEnum, ctx);
  }
}

export const gate: GateDescriptor = {
  name: "zod-modern-spellings",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — docs/reviews/stickler/2026-08-02-zod-leverage-audit.md §F2/F4/F5/F7",
  status: "active",
  scopeSafety: "incremental-safe", // per-file verdicts; the ARM-C ratchet self-guards in finalize
  message: MESSAGE,
  fix: FIX,
  // Sanctioned join sites are SCANNED, not scoped out (the macro-resolution-home precedent): the only
  // exemption is a CITED row, so a moved/renamed file goes RED instead of carrying its sanction along.
  scanRoot: (p) => p.includes(SCAN_PREFIX),
  kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression],

  begin: () => {
    passSeenIssuesAllowed.clear();
  },

  visit: (node, sf, ctx) => {
    if (node.isKind(SyntaxKind.CallExpression)) {
      visitCall(node, ctx);
      return;
    }
    if (!isZodErrorIssuesRead(node)) {
      return;
    }
    const rel = repoRel(sf.getFilePath());
    if (rel in ISSUES_ALLOWLIST) {
      passSeenIssuesAllowed.add(rel);
      return;
    }
    report(node, ARM_TOKENS.errorIssues, ctx);
  },

  finalize: (ctx) => {
    // The stale arm is a WHOLE-TREE claim: never below project scope, and never on a fileset that is not the
    // real tree (a conformance mini-project also reports scope.kind === "project").
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    // THE SANCTIONED Finding overload (§1): this finding anchors on the GATE FILE, not on a node — there is
    // no source node to hang an `@orb-gate-ignore` off, and a stale exemption must not be suppressible anyway.
    for (const rel of Object.keys(ISSUES_ALLOWLIST)) {
      if (!passSeenIssuesAllowed.has(rel)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_ISSUES_PREFIX}"${rel}" — scripts/check/gates/zod-modern-spellings.ts` });
      }
    }
  },

  mustFlag: [
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ a: z.string() }).strict();\n',
      at: "packages/contracts/src/probe-strict/index.ts",
      expect: { count: 1, token: "strict-object" },
      why: "ARM A — the exact spelling all five sites carried, kept alive by a comment whose premise (strictObject inflates the inferred type) is false on 4.4.3",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.union([z.literal("none"), z.literal("raw"), z.literal("escaped")]);\n',
      at: "packages/contracts/src/probe-union/index.ts",
      expect: { count: 1, token: "literal-union" },
      why: "ARM B — the regex domain's retired three-arm literal union; the remedy names the FAILURE-shape difference, not a style preference",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.union([z.literal(true), z.literal(false)]);\n',
      at: "packages/contracts/src/probe-union2/index.ts",
      expect: { count: 1, token: "literal-union" },
      why: "ARM B at its floor — a TWO-member, non-string literal union is the same respelling (`z.literal([true, false])`); the arity floor is 2, not 3",
    },
    {
      files:
        "export function refuse(result: { error: { issues: readonly { message: string }[] } }): string {\n" +
        '  return result.error.issues.map((i) => i.message).join("; ");\n' +
        "}\n",
      at: "packages/server/src/domain/probe-plugin/substrate/manifest.ts",
      expect: { count: 1, token: "error-issues" },
      why: "ARM C — the live offender this gate's landing commit fixed: an operator-facing bundle refusal that mapped issues to MESSAGE ONLY, dropping the path that names the bad field",
    },
    {
      files:
        "export function refuse(result: { error: { issues: readonly { message: string }[] } }): string {\n" +
        '  return result.error.issues[0]?.message ?? "schema mismatch";\n' +
        "}\n",
      at: "packages/server/src/domain/probe-preset/verbs/import-file.ts",
      expect: { count: 1, token: "error-issues" },
      why: "ARM C's founding shape — the `issues[0]` first-issue hand-flatten from F4 itself (a 500-section preset refused with no field named)",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.enum(["true", "false"]).default("false").transform((v) => v === "true");\n',
      at: "packages/server/src/probe-env/index.ts",
      expect: { count: 1, token: "bool-enum" },
      why: "ARM D — the hand-rolled env boolean codec the seven knobs carried before `envBool`; the remedy names the PINNED params, since an unpinned `z.stringbool()` would widen the accepted vocabulary",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.enum(["false", "true"]);\n',
      at: "packages/server/src/probe-env2/index.ts",
      expect: { count: 1, token: "bool-enum" },
      why: "ARM D is order-insensitive — the same hand-roll written the other way round is the same hand-roll",
    },
  ],
  mustPass: [
    {
      files: 'import { z } from "zod";\nexport const s = z.strictObject({ a: z.string() });\n',
      at: "packages/contracts/src/probe-ok-strict/index.ts",
      why: "ARM A's remedy — the direct spelling the corrected comment now recommends",
    },
    {
      files: 'import { z } from "zod";\ndeclare const base: z.ZodObject;\nexport const s = base.strict();\n',
      at: "packages/contracts/src/probe-var-strict/index.ts",
      why: "DECLARED LIMIT, proven not assumed: `.strict()` on a schema VARIABLE has NO `z.strictObject` respelling, so flagging it would demand a fix that does not exist. Zero such sites exist; this row is the written baseline a future widening starts from",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.literal(["none", "raw", "escaped"]);\n',
      at: "packages/contracts/src/probe-ok-union/index.ts",
      why: "ARM B's remedy — the multi-value literal, one node and one option-naming issue",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.union([z.number(), z.string()]);\n',
      at: "packages/contracts/src/probe-mixed-union/index.ts",
      why: "a genuinely undiscriminated union of TYPES (the tracker value plane) — a different construct with no literal spelling; the every-member-is-a-literal test is what keeps it out",
    },
    {
      files:
        'import { z } from "zod";\nexport const s = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), cause: z.string() })]);\n',
      at: "packages/contracts/src/probe-obj-union/index.ts",
      why: "literal DISCRIMINATORS inside object arms — the members are `z.object` calls, not literals; collapsing this would be a semantic change, not a respelling",
    },
    {
      files:
        'import { z } from "zod";\n' +
        "export const s = z.record(z.string(), z.unknown()).superRefine((val, ctx) => {\n" +
        "  const known = z.object({ a: z.string() }).safeParse(val);\n" +
        "  if (!known.success) {\n" +
        "    for (const issue of known.error.issues) {\n" +
        '      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });\n' +
        "    }\n" +
        "  }\n" +
        "});\n",
      at: "packages/contracts/src/persona/index.ts",
      why: "the write-guard RE-EMIT at its real (allowlisted) home — issues forwarded STRUCTURALLY with their paths, which `prettifyError`'s string return cannot express",
    },
    {
      files:
        'import { z } from "zod";\n' +
        "export function summarize(parsed: { error: z.ZodError }): string {\n" +
        // biome-ignore lint/suspicious/noTemplateCurlyInString: gate self-proof fixture — this string IS the model-facing join's source text, template literal and all.
        '  return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");\n' +
        "}\n",
      at: "packages/server/src/kit/structured-turn/index.ts",
      why: "a CITED model-facing join at its real home — the `path: message` summary is fed back to the model as the retry prompt, so it must stay schema-addressable rather than human-formatted",
    },
    {
      files: "export function fail(first: { issues: string }): string {\n  return first.issues;\n}\n",
      at: "packages/server/src/probe-outcome/index.ts",
      why: "a NON-zod `.issues` field (our own `ParseOutcome`/`StructuredOutputError` shape) — the arm keys on an `error`-tailed receiver, so it never reaches these",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.enum(["true", "false", "auto"]);\n',
      at: "packages/server/src/probe-tristate/index.ts",
      why: "a THREE-value vocabulary that merely contains the boolean words is a real enum, not a hand-rolled codec — the arity-2 fence holds",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.stringbool({ truthy: ["true"], falsy: ["false"], case: "sensitive" }).default(false);\n',
      at: "packages/server/src/probe-ok-env/index.ts",
      why: "ARM D's remedy with the params PINNED — the `envBool` body itself, which must obviously pass",
    },
  ],
};
