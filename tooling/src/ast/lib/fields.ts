// contract-field-liveness collectors: producers / consumers / model-projection fences.
import type { JsxAttribute, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { FieldHitClass, FieldIndexes, TemplateBracket } from "../contract/fields.ts";
import type { ContractField, FieldReadSites, Hit } from "../contract/types.ts";
import { relPath } from "../ops/swallowed.ts";
import { hitOf } from "./emit.ts";
import { isTestPath } from "./root.ts";

// ── contract-field-liveness: contracts fields DECLARED but never POPULATED (INFORMATIONAL) ─────────────
// The caption class one tier up from a db column, and the shape no other lens in this file can see:
// `orphans`/`apisurface`/knip all work on EXPORTS, and a dead FIELD lives inside a very much alive export.
// The silent-reader audit (docs/history/reviews/misc/2026-08-18-silent-reader-audit.md §5) swept 2,296 contract
// fields with this method and found two real ones: `RepetitionDetection.maxPatternSize` — declared,
// plumbed through five hops, read on the vLLM wire, and NEVER constructed outside a test, so the loop guard
// its header advertised did not run — and `AssembleContext.activeSpeakerCharacterId`, which occurred exactly
// ONCE in the repository (its own declaration) while carrying a doc comment asserting live behaviour. BOTH
// WERE DELETED (issue #185): neither symbol is on the tree any more, so they read here as the lens's
// provenance, not as findable examples — the ast-lens conformance fixture keeps a synthetic twin.
//
// IT IS INFORMATIONAL AND NEVER GATES, for the `regkeys` reason: a key-based index cannot see every
// producer, so acting on a line without reading the call sites deletes live code.
//
// THE FENCE IS THE DECLARATION SITE, NEVER A PACKAGE (the audit's corrected fence — an earlier pass fenced
// "the producer must live outside packages/contracts" and produced 27 false hits). `contracts` legitimately
// holds pure BUILDERS: `StImportResult.sectionCount` is produced at `preset/index.ts:3083` and rendered in
// the client, and it looked exactly like the defect under the wrong fence.
//
// DECLARED BLIND SPOTS, each one measured:
//   • A TEMPLATE-LITERAL producer is invisible. TanStack Form writes `name={`sections[${i}].forbid…`}` —
//     a real write path that no key index will ever find (audit §9.2). Any field a FORM edits can appear
//     here and be fully alive.
//   • A SAME-NAMED field anywhere in the corpus hides a finding, so this lens UNDER-reports (never over-).
//     A hit means "this exact name is spelled by no producer", which is strong; a clean run is weak.
//   • Brand PHANTOM SYMBOLS (`[historyFloorBrand]`) are computed names, skipped by construction — they are
//     declaration-only artifacts of the branded-type idiom, not fields (4 of the audit's 6 raw hits).
//   • A SPREAD producer (`{ ...parsed }`) names no key at all, and neither does a `z.object` DECLARATION —
//     a property whose initializer is a `z.` chain is read as a declaration, not as a producer.
//
// THE #210 TRIAGE (docs/history/reviews/misc/2026-08-19-lens-triage-210.md) READ ALL 70 HITS OF THE FIRST BUILD and
// found 2 real defects under 68 hits the lens could not see the producer of. Everything below the four
// blind spots above is the remedy, each one measured against that classification:
//   • SAME-FILE readers were discarded by a whole-FILE filter, so a schema consumed by its own file's
//     importer printed the strongest possible tail ("the declaration is its only occurrence") about a fully
//     live field (8 hits). The fence is now the DECLARATION NODE's span, not its file.
//   • ELEMENT-ACCESS writes (`out["creation_date"] = …`) are producers — the read side already counted
//     `x["k"]`, and the asymmetry was the bug.
//   • A JSX `name="chatWidthPct"` / `setFieldValue("params.advanced.dynamicContext", …)` string IS the
//     TanStack Form write path (17 hits). The banner named only the template-literal spelling of it.
//   • A `.default()` on the field's OWN chain makes the schema its own producer (`chunkParams`).
//   • A COMPUTED key whose expression is a string const (`{ [ATTACHED_BOOKS_WIRE_KEY]: refs }`) resolves
//     through the corpus's `const X = "…"` bindings.
//   • MODEL-PROJECTED schemas are FENCED, not reported ({@link modelProjectedSchemas}): when a schema is
//     handed to `projectJsonSchema`/`z.toJSONSchema` or registered as a tool's `argsSchema`, the producer of
//     its keys is the LLM. There is no on-tree producer by construction and there never will be, so a key
//     index cannot distinguish "the model writes it" from "nothing writes it" — 25 unadjudicable hits is
//     what buried the two real ones. The fenced COUNT is printed, so the exclusion is visible, never silent.
// STILL REPORTED, deliberately: a wire-INPUT-only schema (a tRPC `.input(…)`, a plugin-guest DTO). Fencing
// by router input would fence most of `contracts` — the two real defects live in schemas one hop from an
// import route — so that class stays adjudicable and its hits carry the normal caveat.
//
// #879 / Brief 3 §5 — LENS HYGIENE, two changes, both about the reader's HOUR rather than the lens's reach:
//   • THE SCHEMA-COMPOSITION ALIAS is FENCED. `thresholdPct: generationKnobSchemas.compactionThresholdPct`
//     (`contracts/src/preset/index.ts`) REUSES a declared schema under a different wire name, so the source
//     field's own name is spelled by no producer and never will be — a permanent false positive, twice over
//     at the 2026-08-30 census. The fence is OWNER-MATCHED (`<owner>.<field>` must appear as a property
//     initializer somewhere in the corpus), not a bare name match, because a bare one would absolve every
//     `dims: block.dims` pass-through and this lens must never over-fence.
//   • EVERY HIT CARRIES ITS CLASS, so a run is triage-free and only `unclassified` is worth a human read.
//     DERIVED, never declared: `template-key` (a corpus producer BUILDS the key — a template's own head/tail
//     brackets the name, or a key-BUILDING file's string literal is a name part, which is what the live
//     `statsDeltaSchema.*Samples` producer needs since its template carries no literal text at all), `guest`
//     (the plugin key space), `foreign-format` (an ST / character-card schema). `dormant-cited` is
//     DELIBERATELY ABSENT: the 2026-08-30 census called eight hits "cited dormancy", but nothing in
//     `contracts` EXPRESSES dormancy (`INTENTIONAL-DORMANT` matches zero lines), and inferring it from prose
//     would be a guess wearing a label — they land in `unclassified`, which is honest.
export const CONTRACTS_SRC = "/packages/contracts/src/";

const ZOD_INIT_RE = /^z\s*\./u;

/** How many read sites a field's line names before collapsing. */
const FIELD_READ_SITES_SHOWN = 3;

/** The JSX attribute whose string value names a form field (TanStack Form's `<form.AppField name="x">`). */
const FIELD_NAME_ATTR = "name";

/** The imperative half of the same write path — `form.setFieldValue("params.advanced.x", v)`. */
const SET_FIELD_VALUE = "setFieldValue";

/** A `sections[3]` path segment — the index is not a field name. */
const PATH_INDEX_RE = /\[[^\]]*\]/gu;

/** A path segment that is a bare array index — positional, never a field name. */
const NUMERIC_SEGMENT_RE = /^\d+$/u;

/** The two doors a zod schema goes through on its way to a MODEL, and the tool-registry key that does the
 *  same job — the structural marker of "the producer of these keys is off-tree by construction". */
export const MODEL_PROJECTION_CALLEES = new Set(["projectJsonSchema", "toJSONSchema"]);

export const TOOL_ARGS_SCHEMA_KEY = "argsSchema";

/** The nearest named owner of a field declaration — the interface / type alias / schema const it sits in. */
function fieldOwner(node: Node): string {
  for (const a of node.getAncestors()) {
    const named = a.asKind(SyntaxKind.InterfaceDeclaration) ?? a.asKind(SyntaxKind.TypeAliasDeclaration) ?? a.asKind(SyntaxKind.VariableDeclaration);
    if (named !== undefined) {
      return named.getName();
    }
  }
  return "(anonymous)";
}

/** `z.object({...})`'s keys are DECLARATIONS, not producers — the property's initializer is a `z.` chain. */
function isZodField(prop: Node): boolean {
  const init = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return init !== undefined && ZOD_INIT_RE.test(init.getText());
}

/** Every field a contracts file DECLARES: interface/type-literal property signatures + `z.object` keys.
 *  A COMPUTED name (the brand phantom-symbol idiom) is skipped — it is not a field. */
export function contractFieldsOf(sf: SourceFile): ContractField[] {
  const out: ContractField[] = [];
  for (const ps of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
    if (!Node.isComputedPropertyName(ps.getNameNode())) {
      out.push({ name: ps.getName(), node: ps, owner: fieldOwner(ps) });
    }
  }
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (isZodField(pa) && !Node.isComputedPropertyName(pa.getNameNode())) {
      out.push({ name: pa.getName(), node: pa, owner: fieldOwner(pa) });
    }
  }
  return out;
}

/** Credit a form-field PATH (`params.advanced.dynamicContext`, `sections[3].name`) as a producer of every
 *  segment it names — the leaf is the field, and the parents are fields of their own owners. */
function addFieldPath(path: string, out: Set<string>): void {
  for (const segment of path.replace(PATH_INDEX_RE, "").split(".")) {
    if (segment !== "" && !NUMERIC_SEGMENT_RE.test(segment)) {
      out.add(segment);
    }
  }
}

/** The string value of a JSX attribute, in both spellings a form uses: `name="x"` and `name={"x"}`. */
function jsxStringAttrValue(attr: JsxAttribute): string | undefined {
  const init = attr.getInitializer();
  if (init === undefined) {
    return;
  }
  const direct = init.asKind(SyntaxKind.StringLiteral);
  if (direct !== undefined) {
    return direct.getLiteralText();
  }
  const inner = init.asKind(SyntaxKind.JsxExpression)?.getExpression()?.asKind(SyntaxKind.StringLiteral);
  return inner?.getLiteralText();
}

/** The TanStack Form write path, which no property-key index can see: a `name="chatWidthPct"` JSX attribute
 *  and a `setFieldValue("params.advanced.dynamicContext", v)` call BOTH populate the named field. 17 of the
 *  #210 triage's 70 hits were exactly this, all of them fully live. */
function formFieldNamesOf(sf: SourceFile, out: Set<string>): void {
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const value = attr.getNameNode().getText() === FIELD_NAME_ATTR ? jsxStringAttrValue(attr) : undefined;
    if (value !== undefined) {
      addFieldPath(value, out);
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (calleeName(call.getExpression()) !== SET_FIELD_VALUE) {
      continue;
    }
    const first = call.getArguments()[0]?.asKind(SyntaxKind.StringLiteral);
    if (first !== undefined) {
      addFieldPath(first.getLiteralText(), out);
    }
  }
}

/** The NAME a call expression dispatches on — `projectJsonSchema(…)` and `z.toJSONSchema(…)` alike. */
export function calleeName(callee: Node): string {
  const asProp = callee.asKind(SyntaxKind.PropertyAccessExpression);
  if (asProp !== undefined) {
    return asProp.getName();
  }
  return callee.asKind(SyntaxKind.Identifier)?.getText() ?? "";
}

/** Names this file PRODUCES: an object-literal key (excluding a `z.object` declaration), a shorthand, an
 *  assignment target (`x.foo = …` AND `x["foo"] = …` — the read side already counted both spellings, and
 *  the asymmetry was a live-field false positive), or a form-field name string. */
function producedNamesOf(sf: SourceFile, out: Set<string>): void {
  formFieldNamesOf(sf, out);
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (!(isZodField(pa) || Node.isComputedPropertyName(pa.getNameNode()))) {
      out.add(pa.getName());
    }
  }
  for (const sp of sf.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)) {
    out.add(sp.getName());
  }
  // An ACCESSOR/METHOD member is a producer too — `get imageEmbedModel(): string { … }` in
  // entry/compose/role-clients.ts is the live shape, and a key-only index read it as unpopulated.
  for (const member of [
    ...sf.getDescendantsOfKind(SyntaxKind.GetAccessor),
    ...sf.getDescendantsOfKind(SyntaxKind.SetAccessor),
    ...sf.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
  ]) {
    out.add(member.getName());
  }
  for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (bin.getOperatorToken().getText() !== "=") {
      continue;
    }
    const left = bin.getLeft();
    const dotted = left.asKind(SyntaxKind.PropertyAccessExpression);
    if (dotted !== undefined) {
      out.add(dotted.getName());
      continue;
    }
    // `out["creation_date"] = fields.creationDate` — the card serde's emit shape, and a producer the
    // dot-only sweep read as "nothing populates this" (triage §4 F2).
    const indexed = left.asKind(SyntaxKind.ElementAccessExpression)?.getArgumentExpression()?.asKind(SyntaxKind.StringLiteral);
    if (indexed !== undefined) {
      out.add(indexed.getLiteralText());
    }
  }
}

/** A `const X = "literal"` binding, and every COMPUTED key spelled `[X]` — collected separately because
 *  resolving one against the other needs the whole corpus (`{ [ATTACHED_BOOKS_WIRE_KEY]: refs }` in the card
 *  serde names a key declared in `contracts`). Resolved in {@link fieldIndexes}. */
function computedKeyEvidenceOf(sf: SourceFile, stringConsts: Map<string, string>, computedKeys: Set<string>): void {
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const literal = decl.getInitializer()?.asKind(SyntaxKind.StringLiteral);
    if (literal !== undefined) {
      stringConsts.set(decl.getName(), literal.getLiteralText());
    }
  }
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const computed = pa.getNameNode().asKind(SyntaxKind.ComputedPropertyName)?.getExpression().asKind(SyntaxKind.Identifier);
    if (computed !== undefined) {
      computedKeys.add(computed.getText());
    }
  }
}

/** Names this file READS, in all three property-read shapes plus OBJECT destructuring (a dot-only sweep is a
 *  known false clean in this repo). An ARRAY binding element (`const [author, role] = …`) is POSITIONAL and
 *  names no property — crediting it printed a false consumer for `pluginManifestSchema.author` (triage §4).
 *  Returns the sites per name so a hit can name its consumers and fence its own declaration. */
function consumedNamesOf(sf: SourceFile, out: Map<string, FieldReadSites>): void {
  const filePath = sf.getFilePath();
  const trackOffsets = filePath.includes(CONTRACTS_SRC);
  const credit = (name: string, pos: number): void => {
    const bucket = out.get(name) ?? new Map<string, number[]>();
    const sites = bucket.get(filePath) ?? [];
    if (trackOffsets) {
      sites.push(pos);
    }
    bucket.set(filePath, sites);
    out.set(name, bucket);
  };
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    credit(pa.getName(), pa.getStart());
  }
  for (const ea of sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = ea.getArgumentExpression();
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      credit(arg.getLiteralText(), ea.getStart());
    }
  }
  for (const be of sf.getDescendantsOfKind(SyntaxKind.BindingElement)) {
    const pn = be.getPropertyNameNode() ?? be.getNameNode();
    if (Node.isIdentifier(pn) && be.getParent().getKind() === SyntaxKind.ObjectBindingPattern) {
      credit(pn.getText(), be.getStart());
    }
  }
}

/** `<owner>.<field>` for every SCHEMA-COMPOSITION ALIAS: a property whose initializer is a bare
 *  `Ident.name` property access, i.e. a declared schema REUSED under another wire name
 *  (`thresholdPct: generationKnobSchemas.compactionThresholdPct`). Owner-matched on purpose — crediting the
 *  NAME alone would absolve every `dims: block.dims` pass-through and blind the lens to real hits. */
function compositionAliasesOf(sf: SourceFile, out: Set<string>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const access = pa.getInitializer()?.asKind(SyntaxKind.PropertyAccessExpression);
    const receiver = access?.getExpression().asKind(SyntaxKind.Identifier);
    if (access !== undefined && receiver !== undefined) {
      out.add(`${receiver.getText()}.${access.getName()}`);
    }
  }
}

/** How much literal text a template part must carry before it may bracket a field name. A one-character
 *  head would match half the corpus. */
const TEMPLATE_PART_MIN = 3;

/** How long a bare string literal must be before it counts as a name PART. */
const KEY_PART_MIN = 6;

/** Does this file BUILD property keys — a computed key whose expression is computed
 *  (`{ [field("TokensIn")]: n }`) or an element-access write through a template (an `acc[…]` write keyed by the template `tokensIn${k}`)?
 *  Only such a file's string literals are read as name PARTS below; anywhere else a 6-char literal that
 *  happens to end a field name is a coincidence, not evidence. */
function buildsKeys(sf: SourceFile): boolean {
  const computed = sf
    .getDescendantsOfKind(SyntaxKind.ComputedPropertyName)
    .some((c) => c.getExpression().getKind() === SyntaxKind.CallExpression || c.getExpression().getKind() === SyntaxKind.TemplateExpression);
  return (
    computed || sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression).some((e) => e.getArgumentExpression()?.getKind() === SyntaxKind.TemplateExpression)
  );
}

/** The literal text a corpus producer BRACKETS a built key with — the shape no key index can see. Two
 *  sources, because the live producers use both: a template EXPRESSION's own head/tail
 *  (the `acc[…]` write keyed by `tokensIn${kind}`), and, inside a key-BUILDING file, its bare string literals used as name
 *  parts (`const suffix = "MeasuredSamples"` feeding the template `${prefix}${axis}${suffix}` — the live
 *  `statsDeltaSchema.*Samples` producer, whose template has NO literal text of its own at all). */
function templateBracketsOf(sf: SourceFile, out: TemplateBracket[]): void {
  for (const tmpl of sf.getDescendantsOfKind(SyntaxKind.TemplateExpression)) {
    const head = tmpl.getHead().getLiteralText();
    const tail = tmpl.getTemplateSpans().at(-1)?.getLiteral().getLiteralText() ?? "";
    if (head.length >= TEMPLATE_PART_MIN || tail.length >= TEMPLATE_PART_MIN) {
      out.push({ head, tail });
    }
  }
  if (!buildsKeys(sf)) {
    return;
  }
  for (const lit of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const text = lit.getLiteralText();
    if (text.length >= KEY_PART_MIN && !text.includes(" ") && !text.includes("/")) {
      out.push({ head: "", tail: text });
      out.push({ head: text, tail: "" });
    }
  }
}

/** The producer / consumer indexes over the PRODUCTION corpus (tests excluded — a test constructing a
 *  fixture is not a producer, the same rule `testonly` and `regkeys` apply). `aliased` and `templates` are
 *  the #879 hygiene halves: the composition-alias fence and the `template-key` class evidence. */
export function fieldIndexes(project: SourceCorpus): FieldIndexes {
  const produced = new Set<string>();
  const consumed = new Map<string, FieldReadSites>();
  const aliased = new Set<string>();
  const templates: TemplateBracket[] = [];
  const stringConsts = new Map<string, string>();
  const computedKeys = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (isTestPath(sf.getFilePath())) {
      continue;
    }
    producedNamesOf(sf, produced);
    consumedNamesOf(sf, consumed);
    computedKeyEvidenceOf(sf, stringConsts, computedKeys);
    compositionAliasesOf(sf, aliased);
    templateBracketsOf(sf, templates);
  }
  for (const ident of computedKeys) {
    const resolved = stringConsts.get(ident);
    if (resolved !== undefined) {
      produced.add(resolved);
    }
  }
  return { produced, consumed, aliased, templates };
}

/** An ST (`stPresetSchema`) or character-card schema — a FOREIGN file's key space, produced off-tree. */
const FOREIGN_FORMAT_OWNER_RE = /^st[A-Z]|[Cc]ardV\d/u;
/** The plugin key space: a guest authors these keys, so no on-tree producer exists by construction. */
const GUEST_OWNER_RE = /plugin/iu;
const GUEST_PATH = "/plugin";

/** ONE hit's CLASS, derived — never declared. `unclassified` is the only one worth a human read. */
export function fieldClass(field: ContractField, indexes: FieldIndexes): FieldHitClass {
  if (indexes.templates.some((t) => field.name.startsWith(t.head) && field.name.endsWith(t.tail) && field.name.length > t.head.length + t.tail.length)) {
    return "template-key";
  }
  if (GUEST_OWNER_RE.test(field.owner) || field.node.getSourceFile().getFilePath().includes(GUEST_PATH)) {
    return "guest";
  }
  return FOREIGN_FORMAT_OWNER_RE.test(field.owner) ? "foreign-format" : "unclassified";
}

/** A zod field whose OWN chain carries `.default(…)` populates itself — the schema is the producer, and the
 *  value reaches every consumer of the parse. Only the field's top-level chain counts: a `.default()` on a
 *  NESTED key would otherwise absolve the outer field it is nested inside. */
function isSelfDefaulted(node: Node): boolean {
  let current = Node.isPropertyAssignment(node) ? node.getInitializer() : undefined;
  while (current !== undefined) {
    const call = current.asKind(SyntaxKind.CallExpression);
    if (call === undefined) {
      return false;
    }
    if (calleeName(call.getExpression()) === "default") {
      return true;
    }
    current = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression)?.getExpression();
  }
  return false;
}

/** The files that SPELL this field's name as a read, excluding the field's OWN declaration span. The fence is
 *  the declaration NODE, not its file: a contracts file that declares a foreign wire schema and consumes it
 *  in its own importer 400 lines below is a live producer/reader, and the old whole-file filter printed the
 *  strongest possible "nothing reads it" tail about 8 such fields (triage §4 F1). */
function readersOf(field: ContractField, consumed: ReadonlyMap<string, FieldReadSites>): string[] {
  const declFile = field.node.getSourceFile().getFilePath();
  const start = field.node.getStart();
  const end = field.node.getEnd();
  const readers: string[] = [];
  for (const [filePath, offsets] of consumed.get(field.name) ?? []) {
    if (filePath !== declFile || offsets.some((pos) => pos < start || pos >= end)) {
      readers.push(filePath);
    }
  }
  return readers;
}

/** Is this field a SCHEMA-COMPOSITION ALIAS — a declared schema REUSED under another wire name (#879)? Its
 *  own name has no producer BY CONSTRUCTION, so it is a permanent false positive. Fenced in the op (beside
 *  the model-projection fence) rather than swallowed here, so the excluded COUNT stays visible. */
export function isCompositionAlias(field: ContractField, indexes: FieldIndexes): boolean {
  return indexes.aliased.has(`${field.owner}.${field.name}`);
}

/** ONE field's verdict line, or undefined when a producer spells it (or the schema defaults it itself). */
export function fieldHit(field: ContractField, indexes: FieldIndexes): Hit | undefined {
  const { produced, consumed } = indexes;
  if (produced.has(field.name) || isSelfDefaulted(field.node)) {
    return;
  }
  const readers = readersOf(field, consumed);
  const kind = readers.length === 0 ? "field-declared-only" : "field-consumed-never-populated";
  const where = readers.slice(0, FIELD_READ_SITES_SHOWN).map(relPath).join(", ");
  // "SPELL this name", never "READ it": the index credits a NAME, not a resolved receiver type, so an
  // unrelated same-named property on another shape lands here (triage §4 — `MoveMessageParams.toSeq` was
  // credited as a reader of `loreEntryProvenanceSchema.span.toSeq`). The claim is exactly what it can prove.
  const tail =
    readers.length === 0
      ? "and NOTHING spells it either — the declaration is its only occurrence (the activeSpeakerCharacterId class)"
      : `but ${readers.length} site(s) SPELL this NAME as a read (${where}${readers.length > FIELD_READ_SITES_SHOWN ? ", …" : ""}) — the RepetitionDetection class, name-matched not type-resolved`;
  const hit = hitOf(field.node, kind);
  hit.text = `[${fieldClass(field, indexes)}] ${field.owner}.${field.name} — NO producer spells this name outside its own declaration, ${tail}`;
  return hit;
}
