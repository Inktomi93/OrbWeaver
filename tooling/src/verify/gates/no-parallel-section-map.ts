// Policy: no-parallel-section-map (client-architecture-lockdown.md §5 rule 4 / client-architecture-state-and-gates.md §16 G2) — the composition
// bug was a section (or modal, config group, chrome widget) smeared across parallel static maps no gate
// forced to agree. Five shapes are RED outside the sanctioned homes:
//
// (1) a VALUE object literal whose NAMED keys are ALL vocabulary ids, ≥2 of them (the deleted
//     `SECTION_PANEL_DEFAULTS`/`YOU_MODAL_ROWS` shape);
// (2) an array literal of `{ id: <VocabId>, … }` elements covering ≥2 ids (the deleted
//     `RAIL_SECTIONS`/`RAIL_ACTIONS` shape);
// (3) a `Record<VocabId, …>` / `Partial<Record<VocabId, …>>` annotation on a VALUE declaration — the
//     hardcoded map whose value literal arm (1) cannot see because a call built it;
// (4) a bare array literal of ≥2 distinct vocab-id STRING literals (the deleted `YOU_MODAL_IDS` shape —
//     same drift spelled as ids rather than `{id:…}` objects, which arm (2) has zero object elements to see);
// (5) the CHROME arm — chrome has NO id vocabulary, it is a
//     contributor-style OPEN set over the CLOSED `CHROME_ZONES` axis, so the id-keyed arms cannot see it. A
//     hand-maintained chrome list is an array of ≥2 object literals EACH carrying a `zone:` that is a
//     CHROME_ZONES member, outside the door / the pure assembler / a co-located `*-chrome` def.
//
// Derive from the registry, never re-declare: a DERIVED map (`registry.list().filter…`) has no literal
// keys and no `Record<…>` annotation, so it passes — the load-bearing false-positive check. Every arm also
// requires the literal to be PURE vocabulary space (one foreign key, one foreign `id`, one foreign string,
// one non-chrome `zone` and it is not a parallel map), so an incidental collision is not an accusation.
//
// EVERY VOCABULARY IS RESOLVED, NOT READ FLAT (#942). The four tuples are read through the shared
// `lib/tuple-read.ts` (`readTupleDeclaration`), which follows a sanctioned spread of a local or imported
// sibling tuple and REFUSES loudly — a thrown ToolError, exit 2 — on every other composition shape, on an
// unresolvable binding, on a cycle, and on a spread resolving to nothing. The live
// `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]` is FOUR zones; the old direct-element reader saw ONE and
// every `rail.*`-zoned parallel map escaped while the file scan stayed healthy.
//
// WHY THIS READER ONCE COULD NOT BE `tupleVocabularyFact`, measured 2026-09-12: the shared FACT could not
// serve two of these four vocabularies on the REAL tree. Its
// authored-value reader refuses a composite whose binding has ANY invoked member
// (`lib/static-authored-value.ts` `explicitCompositeRefusal` → `invokedMemberThroughAliases`, reason
// `dynamic`), and `section-ids.ts:33` / `config-group-ids.ts:41` both call `.includes(v)` inside their own
// `isSectionId`/`isConfigGroupId` guard. Driven against the real client tree the fact answered SECTION_IDS
// 0 members / CONFIG_GROUP_IDS 0 members (MODAL_SLOT_IDS 11 and CHROME_ZONES 4 resolved), which WITHHELD
// this whole policy on every real run while all 21 conformance rows stayed green — the
// `freeze-provenance-write-pairing` class, invisible to a virtual proof corpus. `readTupleDeclaration`
// takes a DECLARATION rather than a Project, so §3's traversal ban is not engaged (only
// `readTupleVocabulary(project, …)` is unusable behind `defineGate`), and it returns the legacy numbers:
// SECTION_IDS 10, MODAL_SLOT_IDS 11, CONFIG_GROUP_IDS 13, CHROME_ZONES 4 through the spread. The widening
// that would let the fact serve these — an `as const` assertion PROVES immutability, so an invoked member
// on it is not evidence of dynamism — is corpus-wide build work and has its own row, not a line here.
//
// THE RULING SURVIVES; ITS INPUT CHANGED (#1950 D2, landed by lane `p-hooks-wave-refute`). A NARROWER
// widening than the `as const` one above has now landed in the shared reader: `collectInvokedMembers`
// (`_shared/reference-fact-writes.ts` READ_ONLY_MEMBERS) no longer records a single named read-only
// `Array.prototype` member, so a binding consumed ONLY through `.includes(v)` is no longer `dynamic`.
// The measured 0-members refusal above therefore describes a condition that no longer holds, and the
// paragraph is kept for its MECHANISM rather than its number. What has NOT changed and is why this module
// now reads through `tupleVocabularyFact`: the INPUT changed and the shared reader re-measured all four
// vocabularies through the real client corpus before this switch. The old ruling and its mechanism remain
// here because widening the authored-value reader beyond proven read-only members would recreate the same
// blindness class.
//
// AND A VOCABULARY THAT STOPS RESOLVING NOW WITHHOLDS THE VERDICT INSTEAD OF RETIRING ITS ARM. Legacy
// skipped a vocabulary whose tuple read empty (`if (vocab.ids.size === 0) continue`), so a renamed or moved
// `CONFIG_GROUP_IDS` silently retired that arm while the other four stayed green — exactly the half-migration
// the §4.6 blindness rule bans. THE FOUR POPULATION RECEIPTS ARE LOAD-BEARING, one per vocabulary: absent
// (no exported declaration claims the name), AMBIGUOUS (two do — never a silently merged vocabulary) and
// EMPTY each file `unresolved: 1` or `members: 0`, and a policy receipt that resolved zero members refuses
// the run and withholds this policy. A silent blind spot became a loud one, which is the whole point.
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` plus
// `lib/registry-definition-{anchor,field,home}.ts`; this member reads the family's `lib/registry-definition-
// home.ts` for the four co-located definition-home slots (`-section`, `-modal`, `-group`, `-chrome`), which is
// why its sanctioned homes and the completeness policies' co-location law cannot drift apart. Its vocabulary
// axis rides `lib/tuple-read.ts`, a shared PRIMITIVE, NOT a second family.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (8d93d820f); the final population is `@client`. The per-vocabulary sanctioned HOMES stay INSIDE the arms
// rather than in the population, because each vocabulary allows a different set and a file that is a home
// for one vocabulary is an ordinary accused file for the other three.
import type { ArrayLiteralExpression, Expression, Node as MorphNode, ObjectLiteralExpression, TypeNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { DefinitionSlot } from "../contract/registry-definition-home.ts";
import { DEFINITION_SLOTS } from "../contract/registry-definition-home.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { isDefinitionHome } from "../lib/registry-definition-home.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

/** ≥ this many vocabulary keys in one literal = a re-declared parallel map, not an incidental pair. */
const MIN_KEYS = 2;
const CHROME_TUPLE = "CHROME_ZONES";
const CHROME_ASSEMBLER = "/state/assemble-chrome.ts";

/** The TUPLE HOMES — the state modules that legitimately hold a bare all-ids string array, because there
 *  the array IS the vocabulary rather than a map over it. A vocabulary's tuple gets its own module once it
 *  has two readers (`settings-categories.ts` split out of `shell-store.ts` on 2026-08-24 and became
 *  `config-group-ids.ts` when the config revamp unified the vocabulary, #866 S1). The tuples are read BY
 *  SYMBOL, so a tuple that moves stays VISIBLE and only this list has to learn its new home. */
const TUPLE_HOME_SUFFIXES = ["/state/shell-store.ts", "/state/section-ids.ts", "/state/config-group-ids.ts", "/state/modal-slot-ids.ts"] as const;

/** One vocabulary the parallel-map ban covers: its tuple, its `Record<Name>` annotation shapes, and the
 *  co-located definition slot whose files are its own sanctioned home. */
interface VocabSpec {
  readonly name: string;
  readonly tupleConst: string;
  readonly recordRe: RegExp;
  readonly partialRecordRe: RegExp;
  readonly slot: DefinitionSlot;
}

const VOCAB_SPECS: readonly VocabSpec[] = [
  {
    name: "SectionId",
    tupleConst: "SECTION_IDS",
    recordRe: /\bRecord<\s*SectionId\b/,
    partialRecordRe: /\bPartial<\s*Record<\s*SectionId\b/,
    slot: DEFINITION_SLOTS.section,
  },
  {
    name: "ModalSlotId",
    tupleConst: "MODAL_SLOT_IDS",
    recordRe: /\bRecord<\s*ModalSlotId\b/,
    partialRecordRe: /\bPartial<\s*Record<\s*ModalSlotId\b/,
    slot: DEFINITION_SLOTS.modal,
  },
  {
    name: "ConfigGroupId",
    tupleConst: "CONFIG_GROUP_IDS",
    recordRe: /\bRecord<\s*ConfigGroupId\b/,
    partialRecordRe: /\bPartial<\s*Record<\s*ConfigGroupId\b/,
    slot: DEFINITION_SLOTS.group,
  },
];

const MESSAGE =
  "a hardcoded map (object literal / `{ id }` array / bare id array / `Record<…>` annotation) covering ≥2 " +
  "SectionIds, ModalSlotIds or ConfigGroupIds, or an array of ≥2 CHROME_ZONES-zoned chrome entries, is a " +
  "parallel section/modal/config-group/chrome map — the composition-drift bug. Derive from the registry, " +
  "never re-declare. Homes: the vocabulary tuple, the main.tsx/compose door, the *-section/*-modal/*-group/" +
  "*-chrome definition files (client-architecture-lockdown.md §5 rule 4 / client-architecture-state-and-gates.md §16 G2).";
const FIX =
  'delete the map and read the registry (registry.get(id) / registry.list()), or move it into the vocabulary\'s own sanctioned home. For a deliberate exception, write an adjacent `@orb-waive no-parallel-section-map(<position>): <why + end condition>` — the position is the DISCRIMINATING MEMBER this policy reports, which is the first vocabulary key of an object map (`chats`), the first covered `id`/zone string literal WITH its quotes (`"chats"`, `"rail.nav"`) for an array, and the DECLARED NAME for a `Record<…>`-annotated declaration.';

/** THE DOOR IS TWO MODULES, not one file: `main.tsx` boots and `compose/*` composes (the #43 boot
 *  code-split put every registry assembly behind the `/` route's lazy boundary, so an unauthenticated
 *  client never parses the feature graph). The same allowance `registry-assembly-at-door-only` (G8) makes;
 *  a door-keyed home naming only main.tsx would red the assemblies it exists to sanction. */
function isDoorFile(repoRelativePath: string): boolean {
  return repoRelativePath.endsWith("/client/src/main.tsx") || repoRelativePath.includes("/client/src/compose/");
}

/** The sanctioned homes for a vocabulary-keyed map: a tuple home, the door, or the vocabulary's own
 *  co-located definition files (the same slot law the completeness policies judge co-location by). */
function isVocabHome(repoRelativePath: string, vocab: VocabSpec): boolean {
  return TUPLE_HOME_SUFFIXES.some((home) => repoRelativePath.endsWith(home)) || isDoorFile(repoRelativePath) || isDefinitionHome(repoRelativePath, vocab.slot);
}

/** The sanctioned homes for a hand-assembled chrome list: the door, the pure assembler, and the co-located
 *  `*-chrome` widget definitions. */
function isChromeHome(repoRelativePath: string): boolean {
  return isDoorFile(repoRelativePath) || repoRelativePath.endsWith(CHROME_ASSEMBLER) || isDefinitionHome(repoRelativePath, DEFINITION_SLOTS.chrome);
}

/** A finding's anchor: the DISCRIMINATING MEMBER — the key, id or zone that makes this literal a parallel
 *  map — expressed as the token/offset pair the waiver position is derived from. Anchoring on the member
 *  rather than on the literal keeps two findings in one statement separately waivable (guide §6.2) and
 *  makes the reported position the thing a reader would point at. */
function anchorOn(node: MorphNode, member: MorphNode): { readonly token: string; readonly offset: number } {
  return { token: member.getText(), offset: member.getStart() - node.getStart() };
}

/** The first NAMED key that is a vocabulary id, when EVERY named key is one and there are ≥2 — requiring
 *  every key excludes an incidental collision (a TagUsage map carrying `characters`/`chats` alongside
 *  `worldBooks`/`personas`). Spreads, methods and computed keys are not hardcoded per-id entries. */
function pureVocabMapKey(object: ObjectLiteralExpression, ids: ReadonlySet<string>): MorphNode | undefined {
  let first: MorphNode | undefined;
  let hits = 0;
  for (const property of object.getProperties()) {
    if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property))) {
      continue;
    }
    if (!ids.has(property.getName())) {
      return;
    }
    hits += 1;
    first ??= property.getNameNode();
  }
  return hits >= MIN_KEYS ? first : undefined;
}

/** The string value of an element's named property, with the literal node that carries it. Shorthand
 *  (`{ id }`) never carries a literal, so it cannot match — only `id: "x"`. */
function elementField(element: ObjectLiteralExpression, name: string): { readonly value: string; readonly node: Expression } | undefined {
  const property = element.getProperty(name);
  if (property === undefined || !Node.isPropertyAssignment(property)) {
    return;
  }
  const initializer = property.getInitializer();
  if (initializer === undefined) {
    return;
  }
  const value = readStringValue(initializer);
  return value === undefined ? undefined : { value, node: initializer };
}

/** An array of object literals each carrying an `id:` that is a vocabulary id, ≥2 DISTINCT covered (the
 *  deleted `RAIL_SECTIONS`/`RAIL_ACTIONS` shape). A foreign element makes the array not vocabulary-space. */
function vocabArrayAnchor(elements: readonly ObjectLiteralExpression[], ids: ReadonlySet<string>): MorphNode | undefined {
  const covered = new Set<string>();
  let first: MorphNode | undefined;
  for (const element of elements) {
    const id = elementField(element, "id");
    if (id === undefined || !ids.has(id.value)) {
      return;
    }
    covered.add(id.value);
    first ??= id.node;
  }
  return covered.size >= MIN_KEYS ? first : undefined;
}

/** A bare array whose elements are ALL string literals, ≥2 of them DISTINCT vocabulary ids (the deleted
 *  `YOU_MODAL_IDS` shape — a hand list with no `{id:…}` wrapper, invisible to the object-element arm). */
function vocabStringArrayAnchor(elements: readonly Expression[], ids: ReadonlySet<string>): MorphNode | undefined {
  const covered = new Set<string>();
  let first: MorphNode | undefined;
  for (const element of elements) {
    const text = readStringValue(element);
    if (text === undefined || !ids.has(text)) {
      return;
    }
    covered.add(text);
    first ??= element;
  }
  return covered.size >= MIN_KEYS ? first : undefined;
}

/** An array of ≥2 object literals EACH carrying a CHROME_ZONES `zone:` — a hand chrome list. A non-chrome
 *  `zone` (the preset assembly's `"setup"`/`"post"`) makes the array not chrome-space. */
function chromeArrayAnchor(elements: readonly ObjectLiteralExpression[], zones: ReadonlySet<string>): MorphNode | undefined {
  let first: MorphNode | undefined;
  let count = 0;
  for (const element of elements) {
    const zone = elementField(element, "zone");
    if (zone === undefined || !zones.has(zone.value)) {
      return;
    }
    count += 1;
    first ??= zone.node;
  }
  return count >= MIN_KEYS ? first : undefined;
}

/** A `Record<VocabId, …>` or `Partial<Record<VocabId, …>>` annotation on a VALUE declaration — the
 *  hardcoded map whose value a call built, so no literal exists for the object-literal arm to see. A bare
 *  TYPE ALIAS is not a value and cannot hold data, so only variable declarations are asked. */
function isVocabRecordType(typeNode: TypeNode | undefined, vocab: VocabSpec): boolean {
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return false;
  }
  const text = typeNode.getText();
  return vocab.recordRe.test(text) || vocab.partialRecordRe.test(text);
}

/** The two array shapes are mutually exclusive by construction: an all-object array has zero string
 *  elements and vice versa. */
function objectElementsOf(array: ArrayLiteralExpression): readonly ObjectLiteralExpression[] | undefined {
  const elements = array.getElements();
  const objects = elements.filter(Node.isObjectLiteralExpression);
  return objects.length === elements.length && objects.length > 0 ? objects : undefined;
}

/** The literals one invocation collected, held in `create` state and judged once per vocabulary. */
interface Candidates {
  readonly objects: ObjectLiteralExpression[];
  readonly arrays: ArrayLiteralExpression[];
  readonly declarations: VariableDeclaration[];
}

/** The two capabilities every arm needs from the policy context, and nothing else. */
interface Judge {
  readonly pathOf: (node: MorphNode) => string;
  readonly report: (node: MorphNode, member: MorphNode, detail: string) => void;
}

function collectCandidate(node: MorphNode, into: Candidates): void {
  if (Node.isObjectLiteralExpression(node)) {
    into.objects.push(node);
  } else if (Node.isArrayLiteralExpression(node)) {
    into.arrays.push(node);
  } else if (Node.isVariableDeclaration(node)) {
    into.declarations.push(node);
  }
}

/** Arm (1) — a per-id object literal outside the vocabulary's homes. */
function judgeObjectMaps(candidates: Candidates, vocab: VocabSpec, ids: ReadonlySet<string>, judge: Judge): void {
  for (const object of candidates.objects) {
    const key = isVocabHome(judge.pathOf(object), vocab) ? undefined : pureVocabMapKey(object, ids);
    if (key !== undefined) {
      judge.report(object, key, `A per-id object literal re-declares ≥${MIN_KEYS} ${vocab.name}s outside the sanctioned homes.`);
    }
  }
}

/** Arms (2) and (4) — the `{ id: … }` array and the bare id-string array, mutually exclusive by shape. */
function judgeVocabArrays(candidates: Candidates, vocab: VocabSpec, ids: ReadonlySet<string>, judge: Judge): void {
  for (const array of candidates.arrays) {
    if (isVocabHome(judge.pathOf(array), vocab)) {
      continue;
    }
    const objectElements = objectElementsOf(array);
    const anchor = objectElements === undefined ? vocabStringArrayAnchor(array.getElements(), ids) : vocabArrayAnchor(objectElements, ids);
    if (anchor !== undefined) {
      const shape = objectElements === undefined ? "A bare array of id strings" : "An array of `{ id: … }` elements";
      judge.report(array, anchor, `${shape} covers ≥${MIN_KEYS} ${vocab.name}s outside the sanctioned homes.`);
    }
  }
}

/** A MODULE-LEVEL declaration: its statement's parent is the source file itself.
 *
 *  THE RECORD-TYPE ARM'S SCOPE FENCE, and it is load-bearing rather than incidental. The legacy gate read
 *  `sourceFile.getVariableDeclarations()`, which returns TOP-LEVEL declarations only; the visitor this
 *  conversion runs on delivers every `VariableDeclaration` in the tree, function-scoped ones included.
 *  Measured 2026-09-12 over the real client corpus, that widening produced exactly one new finding and it
 *  was a FALSE POSITIVE: the render-time accumulator at `app-shell.tsx:178`, a function-scoped
 *  `Partial\<Record\<SectionId, ReactNode\>\>` binding filled by a loop over `registry.list()` — the
 *  DERIVED map this law exists to ask for. A
 *  function-scoped accumulator is a render-time derivation; a parallel map is a DECLARED module-level
 *  table that outlives every call. So the arm keeps the legacy scope, stated as a fence instead of
 *  inherited from a reader's default. The object-literal and array arms are deep in both runtimes
 *  (legacy reached them through `getDescendantsOfKind`) and are unchanged. */
function isModuleLevel(declaration: VariableDeclaration): boolean {
  const statement = declaration.getVariableStatement();
  return statement !== undefined && Node.isSourceFile(statement.getParent());
}

/** Arm (3) — the `Record<VocabId, …>` annotation whose value no literal carries. */
function judgeRecordTypes(candidates: Candidates, vocab: VocabSpec, judge: Judge): void {
  for (const declaration of candidates.declarations) {
    if (!isModuleLevel(declaration)) {
      continue;
    }
    if (!isVocabHome(judge.pathOf(declaration), vocab) && isVocabRecordType(declaration.getTypeNode(), vocab)) {
      judge.report(declaration, declaration.getNameNode(), `A \`Record<${vocab.name}, …>\` annotation declares a per-id map outside the sanctioned homes.`);
    }
  }
}

/** Arm (5) — the zone-keyed chrome list, on its OWN homes: chrome has no id tuple to key on. */
function judgeChromeArrays(candidates: Candidates, zones: ReadonlySet<string>, judge: Judge): void {
  for (const array of candidates.arrays) {
    if (isChromeHome(judge.pathOf(array))) {
      continue;
    }
    const objectElements = objectElementsOf(array);
    const anchor = objectElements === undefined ? undefined : chromeArrayAnchor(objectElements, zones);
    if (anchor !== undefined) {
      judge.report(array, anchor, `A hand-maintained chrome list re-declares ≥${MIN_KEYS} ${CHROME_TUPLE}-zoned entries outside the door.`);
    }
  }
}

const VOCAB_FIXTURES = {
  "packages/client/src/state/section-ids.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
  "packages/client/src/state/modal-slot-ids.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
  "packages/client/src/state/config-group-ids.ts": 'export const CONFIG_GROUP_IDS = ["personas", "appearance", "tags"] as const;\n',
  "packages/client/src/state/section-registry.ts": 'export const RAIL_ZONES = ["rail.nav", "rail.brand", "rail.end"] as const;\n',
  "packages/client/src/state/chrome-registry.ts":
    'import { RAIL_ZONES } from "./section-registry.ts";\nexport const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;\n',
} as const;

export const gate = defineGate({
  id: "no-parallel-section-map",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: Candidates = { objects: [], arrays: [], declarations: [] };
    const judge: Judge = {
      pathOf: (node) => ctx.relativePath(node.getSourceFile()),
      report: (node, member, detail) => ctx.report.node(node, { ...anchorOn(node, member), message: `${MESSAGE} ${detail}`, fix: FIX }),
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ObjectLiteralExpression, SyntaxKind.ArrayLiteralExpression, SyntaxKind.VariableDeclaration],
          visit: (node): void => collectCandidate(node, candidates),
        },
      ],
      evaluate: () => {
        const tuples = ctx.fact(tupleVocabularyFact);
        const read = (tupleConst: string): ReadonlySet<string> | undefined => {
          const vocabulary = tuples.read(tupleConst);
          ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(vocabulary) });
          return vocabulary.kind === "resolved" ? new Set(vocabulary.entries.map(({ value }) => value)) : undefined;
        };
        const vocabularies = VOCAB_SPECS.map((vocab) => ({ vocab, ids: read(vocab.tupleConst) }));
        const zones = read(CHROME_TUPLE);
        // A vocabulary that did not resolve has already refused through its own receipt, which withholds
        // this whole policy. Judging the ones that DID resolve would render a partial verdict that reads
        // exactly like a clean one — the blindness legacy shipped as `if (vocab.ids.size === 0) continue`.
        if (zones === undefined || zones.size === 0 || vocabularies.some(({ ids }) => ids === undefined || ids.size === 0)) {
          return;
        }
        for (const { vocab, ids } of vocabularies) {
          if (ids !== undefined) {
            judgeObjectMaps(candidates, vocab, ids, judge);
            judgeVocabArrays(candidates, vocab, ids, judge);
            judgeRecordTypes(candidates, vocab, judge);
          }
        }
        judgeChromeArrays(candidates, zones, judge);
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/panel-defaults.ts": "export const M = {\n  chats: { list: 1 },\n  characters: { list: 2 },\n};\n",
      },
      expect: { count: 1, token: "chats", messageIncludes: "per-id object literal re-declares" },
      why: "THE TARGET BUG: a re-declared per-section map (≥2 SectionId keys) outside the sanctioned homes — the deleted SECTION_PANEL_DEFAULTS shape",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/rail-sections.ts":
          'export const RAIL_SECTIONS = [\n  { id: "chats", label: "Chats" },\n  { id: "characters", label: "Characters" },\n];\n',
      },
      expect: { count: 1, token: '"chats"', messageIncludes: "`{ id: … }` elements" },
      why: "an array of `{ id: … }` elements covering ≥2 SectionIds — the deleted RAIL_SECTIONS shape. The reported position is the covered id WITH its quotes, which is why `fix` spells it",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/labels.ts":
          'import type { SectionId } from "../../../state/section-ids.ts";\n' +
          "declare function build(): Record<SectionId, string>;\n" +
          "export const LABELS: Record<SectionId, string> = build();\n",
      },
      expect: { count: 1, token: "LABELS", messageIncludes: "`Record<SectionId, …>` annotation" },
      why: "a `Record<SectionId, …>`-typed value built by a function call — there is no literal for the object-literal arm to see, and the position is the declared name",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/partial-labels.ts":
          'import type { ModalSlotId } from "../../../state/modal-slot-ids.ts";\n' +
          "declare function build(): Partial<Record<ModalSlotId, string>>;\n" +
          "export const LABELS: Partial<Record<ModalSlotId, string>> = build();\n",
      },
      expect: { count: 1, token: "LABELS", messageIncludes: "`Record<ModalSlotId, …>` annotation" },
      why: "THE PARTIAL ARM, which legacy advertised in a second regex per vocabulary and proved with no row: `Partial<Record<ModalSlotId, …>>` is the same hardcoded per-id map with optional entries, and a policy carrying an unproven arm cannot tell an unreachable one from a live one",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/you-rows.ts": "export const ROWS = {\n  theme: { label: 1 },\n  settings: { label: 2 },\n};\n",
      },
      expect: { count: 1, token: "theme", messageIncludes: "ModalSlotIds" },
      why: "a re-declared per-modal map (≥2 ModalSlotId keys) — the deleted YOU_MODAL_ROWS shape",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/rail-actions.ts":
          'export const RAIL_ACTIONS = [\n  { id: "theme", label: "Theme" },\n  { id: "settings", label: "Settings" },\n];\n',
      },
      expect: { count: 1, token: '"theme"', messageIncludes: "ModalSlotIds" },
      why: "an array of `{ id: … }` elements covering ≥2 ModalSlotIds — the deleted RAIL_ACTIONS shape",
    },
    {
      mode: "types",
      files: { ...VOCAB_FIXTURES, "packages/client/src/features/x/lib/you-modal-ids.ts": 'export const YOU_MODAL_IDS = ["account", "settings", "theme"];\n' },
      expect: { count: 1, token: '"account"', messageIncludes: "bare array of id strings" },
      why: "a bare string array of ≥2 ModalSlotIds outside an allowlisted home — the deleted YOU_MODAL_IDS shape (the G2 gap a fresh verifier found: a bare id array has zero object elements and is invisible to the `{id:…}` array arm)",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/you-modal-ids.ts": 'export const YOU_MODAL_IDS = ["account" as const, "settings" as const];\n',
      },
      expect: { count: 1, token: '"account" as const', messageIncludes: "bare array of id strings" },
      why: "the same bare-id array with each element written `x as const` (an AsExpression) — the wrapped-literal shape a plain StringLiteral element reader silently PASSED before hardening. The position is the whole element, because that is the node the accusation reads",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/config-labels.ts": "export const LABELS = {\n  personas: { label: 1 },\n  appearance: { label: 2 },\n};\n",
      },
      expect: { count: 1, token: "personas", messageIncludes: "ConfigGroupIds" },
      why: "a re-declared per-group map (≥2 ConfigGroupId keys) outside the sanctioned homes — the M6.1 arm, re-keyed by the config revamp (#866 S1)",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/hand-list.ts":
          'export const HAND = [\n  { id: "a", zone: "rail.end" },\n  { id: "b", zone: "topbar.trail" },\n];\n',
      },
      expect: { count: 1, token: '"rail.end"', messageIncludes: "hand-maintained chrome list" },
      why: "a hand array of ≥2 CHROME_ZONES-zoned chrome entries outside the door and not a `*-chrome` file — the chrome arm (5)",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/hand-rail.ts": 'export const HAND = [\n  { id: "a", zone: "rail.nav" },\n  { id: "b", zone: "rail.brand" },\n];\n',
      },
      expect: { count: 1, token: '"rail.nav"', messageIncludes: "hand-maintained chrome list" },
      why: 'THE #942 SPLIT: the live `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]` shape, with a parallel hand list over two zones that reach the vocabulary ONLY through the imported spread. A direct-element reader saw 1 of 4 zones and this map escaped; this row dies the moment the tuple stops being RESOLVED',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/derived.ts":
          "declare const registry: { list: () => { id: string; mobilePrimary: boolean }[] };\n" +
          "export const MOBILE_PRIMARY_SECTIONS = registry.list().filter((d) => d.mobilePrimary);\n",
      },
      why: "THE MANDATED FALSE-POSITIVE CHECK: a DERIVED map has no literal keys and no `Record<…>` annotation, so deriving from the registry — the thing the law asks for — must pass",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/consumer.ts":
          'import type { SectionId } from "../../../state/section-ids.ts";\nexport declare const render: (labels: Record<SectionId, string>) => void;\n',
      },
      why: "THE TYPE-REFERENCE FENCE, and the row that dies without it: a declaration whose annotation MENTIONS `Record<SectionId, …>` inside a function type CONSUMES a per-id map, it does not hold one. The arm asks whether the declaration's own type node IS the Record reference, so cutting `Node.isTypeReference` down to a bare `getText()` match on any type node accuses this consumer and REDS this row",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/app-shell/surfaces/app-shell.tsx":
          'import type { SectionId } from "../../../state/section-ids.ts";\n' +
          "declare const registry: { list: () => { id: SectionId; content: () => unknown }[] };\n" +
          "export function AppShell(): unknown {\n" +
          "  const contentBySection: Partial<Record<SectionId, unknown>> = {};\n" +
          "  for (const def of registry.list()) {\n" +
          "    contentBySection[def.id] = def.content();\n" +
          "  }\n" +
          "  return contentBySection;\n" +
          "}\n",
      },
      why: "THE MODULE-LEVEL FENCE, taken from the REAL TREE and the row that dies without it: this is `app-shell.tsx:178`'s live shape, a function-scoped `Partial<Record<SectionId, …>>` accumulator filled by a loop over `registry.list()` — the DERIVED map the law asks for. The §4.6 differential measured it as the ONE new finding the visitor-fed conversion would have produced over the legacy top-level reader, and it was a false positive; deleting `isModuleLevel` reds this row and re-creates it",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/tag-usage.ts": "export const USAGE = {\n  chats: 1,\n  characters: 2,\n  worldBooks: 3,\n};\n",
      },
      why: "THE OBJECT-MAP FALSE-POSITIVE GUARD, and the row that dies without it: a map carrying TWO SectionId-looking keys alongside a foreign one is an incidental collision (the live TagUsage shape), not vocabulary space. Deleting the `return` on a foreign named key in `pureVocabMapKey` flags this map and REDS this row — nothing else in the set visits that clause, because every other fixture is either pure vocabulary space or has no vocabulary key at all",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/one-key.ts":
          'export const ONE = { chats: 1 };\nexport const ONE_LIST = [{ id: "chats" }];\nexport const ONE_ID = ["account"];\nexport const EMPTY = [];\n',
      },
      why: "THE ≥2 THRESHOLD, pinned on all three id arms at once: ONE vocabulary key, ONE `{id:…}` element and ONE bare id string are an ordinary reference to a section or a modal, not a re-declared map over the vocabulary. Lowering `MIN_KEYS` to 1 reds this row three times, and without it the `≥2` in the message is a claim no row visits. `EMPTY` is the CONSTRUCTED FIXTURE for `objectElementsOf`'s `objects.length > 0` clause (§4.1, measured 2026-09-12): an empty array literal is the only shape that clause routes differently, and it passes identically with the clause, without it, and with it cut alongside `MIN_KEYS = 1` — both arms behind it require ≥2 members, so the clause is MUTUALLY REDUNDANT with the threshold rather than unenforced. It is kept because it states which arm owns an empty array",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/mixed-array.ts":
          "declare const registry: { list: () => { id: string }[] };\n" +
          'export const NOT_A_SECTION_MAP = [{ id: "chats" }, { other: "value" }];\n' +
          "export const DERIVED = registry.list();\n",
      },
      why: "THE FOUNDING GUARD ROW, carried: an array with a non-`id` element is not pure section-space. It is NOT the row that dies when the guard is cut — measured 2026-09-12, cutting `vocabArrayAnchor`'s foreign-element refusal leaves it green, because only ONE covered id survives and the ≥2 threshold refuses anyway. The row below is the discriminating one",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/mixed-pair.ts": 'export const NOT_A_SECTION_MAP = [{ id: "chats" }, { id: "characters" }, { other: "value" }];\n',
      },
      why: "THE ARRAY GUARD'S DISCRIMINATING ROW (§4.1, measured 2026-09-12): TWO covered SectionIds beside one foreign element. Only here does `vocabArrayAnchor`'s foreign-element refusal decide the verdict alone — cut it to a `continue` and the two ids clear the threshold and this row REDS, while the founding row above stays green for the unrelated reason that it never had two",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/mixed-strings.ts": 'export const NOT_A_MODAL_LIST = ["theme", "settings", "someOtherFeature"];\n',
      },
      why: "THE STRING-ARRAY GUARD'S DISCRIMINATING ROW (§4.1, measured 2026-09-12), for the same reason: two covered ModalSlotIds beside one foreign string. Cutting `vocabStringArrayAnchor`'s refusal REDS this row; the two-element legacy row below cannot, because one covered id never reaches the threshold",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/mixed-zones.ts":
          'export const MIXED = [\n  { id: "a", zone: "rail.end" },\n  { id: "b", zone: "topbar.trail" },\n  { id: "c", zone: "setup" },\n];\n',
      },
      why: "THE CHROME GUARD'S DISCRIMINATING ROW (§4.1, measured 2026-09-12): two CHROME_ZONES-zoned entries beside one preset-zoned element. A list that mixes zones from two axes is not a chrome registry, and this is the only row where `chromeArrayAnchor`'s foreign-zone refusal is the deciding clause — the all-foreign `preset-zones` row below survives the cut on the ≥2 threshold",
    },
    {
      mode: "types",
      files: { ...VOCAB_FIXTURES },
      why: "THE TUPLE HOMES: `section-ids.ts`/`modal-slot-ids.ts`/`config-group-ids.ts` ARE bare all-ids string arrays and `chrome-registry.ts` composes one, but each is the sanctioned ONE home for its vocabulary — allowlisted, must pass. Deleting `TUPLE_HOME_SUFFIXES` reds this row on the three id tuples",
    },
    {
      mode: "types",
      files: { ...VOCAB_FIXTURES, "packages/client/src/features/x/lib/foreign-strings.ts": 'export const NOT_A_MODAL_LIST = ["theme", "someOtherFeature"];\n' },
      why: "a foreign string in the mix is not pure vocabulary space — the string-array false-positive guard. Cutting the foreign-element refusal in `vocabStringArrayAnchor` reds this row",
    },
    {
      mode: "types",
      files: { ...VOCAB_FIXTURES, "packages/client/src/features/x/lib/appearance-group.tsx": "export const M = { personas: 1, appearance: 2 };\n" },
      why: "a ConfigGroupId-keyed object literal inside a co-located `*-group.tsx` definition file — the vocabulary's own home, judged by the family's shared `isDefinitionHome` reader rather than by a private regex. Cutting the `isDefinitionHome` clause reds this row",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/x-chrome.tsx": 'export const XS = [\n  { id: "a", zone: "rail.end" },\n  { id: "b", zone: "topbar.trail" },\n];\n',
      },
      why: "a chrome-entry array inside a co-located `*-chrome.tsx` definition file — allowlisted, must pass",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/state/assemble-chrome.ts": 'export const XS = [\n  { id: "a", zone: "rail.end" },\n  { id: "b", zone: "topbar.trail" },\n];\n',
      },
      why: "THE PURE ASSEMBLER, pinned: `state/assemble-chrome.ts` is a chrome home and is NOT a home for the three id vocabularies, which is why the sanctioned homes stay per-arm instead of being lifted into the population. Deleting the assembler clause reds this row",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/preset-zones.ts": 'export const PZ = [\n  { id: "a", zone: "setup" },\n  { id: "b", zone: "post" },\n];\n',
      },
      why: "an array whose `zone`s are NOT CHROME_ZONES members (the preset assembly's setup/post) is not chrome-space — the chrome false-positive guard. It is ALSO the row that proves resolving the spread widens the denominator without widening the accusation: all four zones are live here",
    },
    {
      mode: "types",
      files: { ...VOCAB_FIXTURES, "packages/client/src/compose/authed-app.tsx": "export const sections = { chats: 1, characters: 2 };\n" },
      why: "the door's OTHER half — a `compose/` module carries the real section assembly since the #43 code-split (G8 already names compose/ a door home), must pass. Cutting the `compose/` clause out of `isDoorFile` reds this row",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/main.tsx": 'export const widgets = [\n  { id: "a", zone: "rail.end" },\n  { id: "b", zone: "topbar.trail" },\n];\n',
      },
      why: "the door's chrome WIDGET list at the composition root — the chrome arm's door allowance follows the assembly. Cutting the `main.tsx` clause out of `isDoorFile` reds this row",
    },
    {
      mode: "types",
      files: {
        ...VOCAB_FIXTURES,
        "packages/client/src/features/x/lib/you-modal-ids.ts":
          '// @orb-waive no-parallel-section-map("account"): pinned identity arm; ends when this list derives from the modal registry.\n' +
          'export const YOU_MODAL_IDS = ["account", "settings", "theme"];\n',
      },
      why: 'THE IDENTITY ARM (§4.2): the twin of the bare-id-array mustFlag row, which produces EXACTLY ONE finding, waived by the one central marker at the position this policy actually reports — the first covered id INCLUDING ITS QUOTES (`"account"`), never the declaration name a reader would reach for',
    },
  ],
});
