// Gate: no-parallel-section-map (client-architecture-lockdown.md §5 rule 4 / §16 G2) — the composition
// bug was a section (or modal) smeared across parallel static maps no gate forced to agree. Four shapes
// are RED outside the sanctioned homes: (1) a VALUE object literal hardcoding ≥2 vocabulary keys (the
// `SECTION_PANEL_DEFAULTS`/`YOU_MODAL_ROWS` shape); (2) an array literal of `{ id: <VocabId>, … }` elements
// covering ≥2 ids (the deleted `RAIL_SECTIONS`/`RAIL_ACTIONS` shape); (3) a `Record<VocabId, …>` type
// annotation on a value declaration (catches a hardcoded map whose value literal the object-literal arm
// can't see, e.g. built by a function call); (4) a bare array literal of ≥2 distinct vocab-id STRING
// LITERALS (the deleted `YOU_MODAL_IDS` shape — same drift, spelled as ids not `{id:…}` objects, which arm
// (2) can't see since it has zero object elements). Derive from the registry, never re-declare — a DERIVED
// map (`registry.list().filter…`) has no literal keys/type, so it passes (the load-bearing false-positive
// check). The vocabulary TUPLES themselves (`SECTION_IDS`/`MODAL_SLOT_IDS` in shell-store.ts) are bare
// all-ids string arrays too — they're the sanctioned ONE home, allowlisted like every other arm.
//
// SCOPE: the SectionId, ModalSlotId, AND SettingsCategoryId vocabularies (all LIVE — the SettingsCategoryId
// arm lands at M6.1; its allowlist mirrors the modal arm: the tuple home (shell-store.ts), the door, and
// its own co-located *-pane.tsx defs).
import type { Expression, ObjectLiteralExpression, Project, SourceFile, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
/** ≥ this many vocab keys in one object literal = a re-declared parallel map (not an incidental pair). */
const MIN_KEYS = 2;
/** A co-located section definition file: `features/<owner>/lib/<id>-section.{ts,tsx}`. */
const SECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-section\.tsx?$/;
/** A co-located modal definition file: `features/<owner>/lib/<id>-modal.{ts,tsx}`. */
const MODAL_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-modal\.tsx?$/;

/** A vocabulary the parallel-map ban covers: its ids, its `Record<Name>` type regexes, its sanctioned
 *  homes, and the registry name for the fix message. */
interface Vocab {
  readonly name: string;
  readonly tupleConst: string;
  readonly ids: ReadonlySet<string>;
  readonly recordRe: RegExp;
  readonly partialRecordRe: RegExp;
  readonly isDefFile: (repoRelPath: string) => boolean;
  readonly registry: string;
}

const SECTION_RECORD_RE = /\bRecord<\s*SectionId\b/;
const SECTION_PARTIAL_RE = /\bPartial<\s*Record<\s*SectionId\b/;
const MODAL_RECORD_RE = /\bRecord<\s*ModalSlotId\b/;
const MODAL_PARTIAL_RE = /\bPartial<\s*Record<\s*ModalSlotId\b/;
const SETTINGS_RECORD_RE = /\bRecord<\s*SettingsCategoryId\b/;
const SETTINGS_PARTIAL_RE = /\bPartial<\s*Record<\s*SettingsCategoryId\b/;
/** A co-located settings-pane definition file: `features/<owner>/lib/<id>-pane.{ts,tsx}`. */
const PANE_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-pane\.tsx?$/;

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The members of a `<CONST> = [...] as const` tuple (the one home of a shell vocabulary). */
function readTuple(project: Project, tupleConst: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const decl = sf.getVariableDeclaration(tupleConst);
    const init = decl?.getInitializer();
    if (init === undefined) {
      continue;
    }
    const arr = Node.isAsExpression(init) ? init.getExpression() : init;
    if (Node.isArrayLiteralExpression(arr)) {
      for (const el of arr.getElements()) {
        if (Node.isStringLiteral(el)) {
          ids.add(el.getLiteralText());
        }
      }
    }
  }
  return ids;
}

/** The three shell vocabularies the gate covers (all LIVE). */
function readVocabs(project: Project): readonly Vocab[] {
  return [
    {
      name: "SectionId",
      tupleConst: "SECTION_IDS",
      ids: readTuple(project, "SECTION_IDS"),
      recordRe: SECTION_RECORD_RE,
      partialRecordRe: SECTION_PARTIAL_RE,
      // Section homes: the vocabulary tuple, the door assembly, the co-located section definition files.
      isDefFile: (p) => SECTION_FILE_RE.test(p),
      registry: "section",
    },
    {
      name: "ModalSlotId",
      tupleConst: "MODAL_SLOT_IDS",
      ids: readTuple(project, "MODAL_SLOT_IDS"),
      recordRe: MODAL_RECORD_RE,
      partialRecordRe: MODAL_PARTIAL_RE,
      // Modal homes: the vocabulary tuple, the door assembly, the co-located *-modal definition files.
      isDefFile: (p) => MODAL_FILE_RE.test(p),
      registry: "modal",
    },
    {
      name: "SettingsCategoryId",
      tupleConst: "SETTINGS_CATEGORY_IDS",
      ids: readTuple(project, "SETTINGS_CATEGORY_IDS"),
      recordRe: SETTINGS_RECORD_RE,
      partialRecordRe: SETTINGS_PARTIAL_RE,
      // Settings homes: the vocabulary tuple, the door assembly, the co-located *-pane definition files.
      isDefFile: (p) => PANE_FILE_RE.test(p),
      registry: "settings",
    },
  ];
}

/** The sanctioned homes for a vocab-keyed map: the vocabulary tuple + door (shell-store/main.tsx, shared
 *  by both vocabs) and the vocab's own co-located definition files. */
function isAllowlisted(repoRelPath: string, vocab: Vocab): boolean {
  return repoRelPath.endsWith("/state/shell-store.ts") || repoRelPath.endsWith("/client/src/main.tsx") || vocab.isDefFile(repoRelPath);
}

/** A parallel vocab map = an object literal whose NAMED keys are ALL vocab ids, ≥2 of them. Requiring
 *  every named key to be a vocab id excludes an incidental collision (a TagUsage map that happens to carry
 *  `characters`/`chats` alongside `worldBooks`/`personas`). */
function isPureVocabMap(obj: ObjectLiteralExpression, ids: ReadonlySet<string>): boolean {
  let hits = 0;
  for (const prop of obj.getProperties()) {
    if (!(Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
      continue; // spreads / methods / computed keys — not a hardcoded per-id entry
    }
    if (ids.has(prop.getName())) {
      hits += 1;
    } else {
      return false; // a foreign named key ⇒ this is not a vocab-space map
    }
  }
  return hits >= MIN_KEYS;
}

/** The string value of an element's `id:` property, or undefined. Shorthand (`{ id }`) never carries a
 *  literal, so it can't match — only `id: "x"`. */
function elementId(el: ObjectLiteralExpression): string | undefined {
  const prop = el.getProperty("id");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** An array literal whose elements are object literals each carrying an `id:` that is a vocab id, ≥2
 *  distinct covered (the deleted `RAIL_SECTIONS`/`RAIL_ACTIONS` shape). A non-vocab element (a foreign id,
 *  or no `id`) makes the array NOT pure vocab-space, same false-positive guard as the object-literal arm. */
function isVocabArray(arr: readonly ObjectLiteralExpression[], ids: ReadonlySet<string>): boolean {
  const covered = new Set<string>();
  for (const el of arr) {
    const id = elementId(el);
    if (id === undefined || !ids.has(id)) {
      return false;
    }
    covered.add(id);
  }
  return covered.size >= MIN_KEYS;
}

/** A bare array literal whose elements are ALL string literals, ≥2 of them DISTINCT vocab ids (the
 *  deleted `YOU_MODAL_IDS` shape — a hand list of ids with no `{id:…}` wrapper, invisible to the
 *  object-element array arm). A foreign string in the mix makes it not pure vocab-space, same
 *  false-positive guard as the other arms. */
function isVocabStringArray(elements: readonly Expression[], ids: ReadonlySet<string>): boolean {
  const covered = new Set<string>();
  for (const el of elements) {
    if (!Node.isStringLiteral(el)) {
      return false;
    }
    const text = el.getLiteralText();
    if (!ids.has(text)) {
      return false;
    }
    covered.add(text);
  }
  return covered.size >= MIN_KEYS;
}

/** A `Record<VocabId, …>` (or `Partial<Record<VocabId, …>>`) type reference on a value declaration —
 *  catches a hardcoded map whose value the object-literal arm can't see (built by a function call, not a
 *  literal). A bare TYPE ALIAS is not a value and can't hold data, so only VARIABLE declarations checked. */
function isVocabRecordType(typeNode: TypeNode | undefined, vocab: Vocab): boolean {
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return false;
  }
  const text = typeNode.getText();
  return vocab.recordRe.test(text) || vocab.partialRecordRe.test(text);
}

/** The two array shapes: a `{ id: … }[]` list (arm 2) or a bare id-string `[]` (arm 4) — mutually
 *  exclusive by construction (an all-object array has zero string elements and vice versa). */
function scanArrayForVocab(sf: SourceFile, vocab: Vocab, path: string, out: Violation[]): void {
  for (const arr of sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    const rawElements = arr.getElements();
    const objectElements = rawElements.filter(Node.isObjectLiteralExpression);
    if (objectElements.length === rawElements.length && objectElements.length > 0) {
      if (isVocabArray(objectElements, vocab.ids)) {
        out.push({
          file: rel(path),
          line: arr.getStartLineNumber(),
          message: `an array literal of \`{ id: … }\` elements covers ≥2 ${vocab.name}s — a parallel ${vocab.registry} map (the deleted RAIL_SECTIONS/RAIL_ACTIONS shape). Derive from the ${vocab.registry} registry (registry.list()), never re-declare — client-architecture-lockdown.md §5.`,
        });
      }
      continue;
    }
    if (isVocabStringArray(rawElements, vocab.ids)) {
      out.push({
        file: rel(path),
        line: arr.getStartLineNumber(),
        message: `a bare array literal of ${vocab.name} string literals covers ≥2 ids — a parallel ${vocab.registry} map (the deleted YOU_MODAL_IDS shape). Derive from the ${vocab.registry} registry (registry.list()), never re-declare — client-architecture-lockdown.md §5.`,
      });
    }
  }
}

function scanFileForVocab(sf: SourceFile, vocab: Vocab, out: Violation[]): void {
  const path = sf.getFilePath();
  if (!path.includes(CLIENT_SRC) || isAllowlisted(rel(path), vocab)) {
    return;
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    if (isPureVocabMap(obj, vocab.ids)) {
      out.push({
        file: rel(path),
        line: obj.getStartLineNumber(),
        message: `an object literal is keyed entirely by ${vocab.name}s — a parallel ${vocab.registry} map that no gate forces to agree with the registry (the SECTION_PANEL_DEFAULTS/YOU_MODAL_ROWS bug). Derive from the ${vocab.registry} registry (registry.list()/get()), never re-declare — client-architecture-lockdown.md §5.`,
      });
    }
  }
  scanArrayForVocab(sf, vocab, path, out);
  for (const decl of sf.getVariableDeclarations()) {
    if (isVocabRecordType(decl.getTypeNode(), vocab)) {
      out.push({
        file: rel(path),
        line: decl.getStartLineNumber(),
        message: `"${decl.getName()}" is typed \`Record<${vocab.name}, …>\` — a parallel ${vocab.registry} map (the composition-drift bug) even without a literal value the object-literal arm can see. Derive from the ${vocab.registry} registry (registry.list()/get()), never re-declare — client-architecture-lockdown.md §5.`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "no-parallel-section-map",
  docRow: "client-architecture-lockdown.md §5 rule 4 / §16 G2",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a hardcoded map (object literal / `{ id }` array / `Record<…>` type) covering ≥2 SectionIds or ModalSlotIds is a parallel section/modal map (the composition-drift bug) — derive from the registry, never re-declare. Homes: the vocab tuple, the main.tsx door, the *-section/*-modal files.",
  fix: "delete the map and read the registry (registry.get(id)/list()); if it is tracked scaffolding, home it in an allowlisted file with its FLAG marker.",
  run: (ctx) => {
    const out: Violation[] = [];
    for (const vocab of readVocabs(ctx.project)) {
      if (vocab.ids.size === 0) {
        continue;
      }
      for (const sf of ctx.project.getSourceFiles()) {
        scanFileForVocab(sf, vocab, out);
      }
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/panel-defaults.ts": "export const M = {\n  chats: { list: 1 },\n  characters: { list: 2 },\n};\n",
      },
      expect: { messageIncludes: "parallel section map" },
      why: "a re-declared per-section map (≥2 SectionId keys) outside the sanctioned homes — the target bug",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/rail-sections.ts":
          'export const RAIL_SECTIONS = [\n  { id: "chats", label: "Chats" },\n  { id: "characters", label: "Characters" },\n];\n',
      },
      expect: { messageIncludes: "array literal" },
      why: "an array of `{ id: … }` elements covering ≥2 SectionIds — the deleted RAIL_SECTIONS shape",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/labels.ts":
          'import type { SectionId } from "../../../state/shell-store";\n' +
          "declare function build(): Record<SectionId, string>;\n" +
          "export const LABELS: Record<SectionId, string> = build();\n",
      },
      expect: { messageIncludes: "Record<SectionId" },
      why: "a `Record<SectionId, …>`-typed value built by a function call — no literal the object-literal arm can see",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
        "packages/client/src/features/x/lib/you-rows.ts": "export const ROWS = {\n  theme: { label: 1 },\n  settings: { label: 2 },\n};\n",
      },
      expect: { messageIncludes: "parallel modal map" },
      why: "a re-declared per-modal map (≥2 ModalSlotId keys) — the deleted YOU_MODAL_ROWS shape",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
        "packages/client/src/features/x/lib/rail-actions.ts":
          'export const RAIL_ACTIONS = [\n  { id: "theme", label: "Theme" },\n  { id: "settings", label: "Settings" },\n];\n',
      },
      expect: { messageIncludes: "the deleted RAIL_SECTIONS/RAIL_ACTIONS shape" },
      why: "an array of `{ id: … }` elements covering ≥2 ModalSlotIds — the deleted RAIL_ACTIONS shape",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
        "packages/client/src/features/x/lib/you-modal-ids.ts": 'export const YOU_MODAL_IDS = ["account", "settings", "theme"];\n',
      },
      expect: { messageIncludes: "the deleted YOU_MODAL_IDS shape" },
      why: "a bare string array of ≥2 ModalSlotIds outside an allowlisted home — the deleted YOU_MODAL_IDS shape (the G2 gap a fresh verifier found: a bare id array has zero object elements, invisible to the `{id:…}` array arm)",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SETTINGS_CATEGORY_IDS = ["account", "appearance", "tags"] as const;\n',
        "packages/client/src/features/x/lib/settings-labels.ts": "export const LABELS = {\n  account: { label: 1 },\n  appearance: { label: 2 },\n};\n",
      },
      expect: { messageIncludes: "parallel settings map" },
      why: "a re-declared per-category map (≥2 SettingsCategoryId keys) outside the sanctioned homes — the M6.1 arm",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/derived.ts":
          "declare const registry: { list: () => { id: string; mobilePrimary: boolean }[] };\n" +
          "export const MOBILE_PRIMARY_SECTIONS = registry.list().filter((d) => d.mobilePrimary);\n",
      },
      why: "a DERIVED map (no literal SectionId keys) — the mandated false-positive check, must pass",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/mixed-array.ts":
          "declare const registry: { list: () => { id: string }[] };\n" +
          'export const NOT_A_SECTION_MAP = [{ id: "chats" }, { other: "value" }];\n' +
          "export const DERIVED = registry.list();\n",
      },
      why: "an array with a non-`id` element isn't pure section-space (the array false-positive guard), passes",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n' +
          'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
      },
      why: "the SECTION_IDS/MODAL_SLOT_IDS vocab tuples ARE bare all-ids string arrays, but shell-store.ts is the sanctioned one home — allowlisted, must pass",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const MODAL_SLOT_IDS = ["theme", "settings", "account"] as const;\n',
        "packages/client/src/features/x/lib/foreign-strings.ts": 'export const NOT_A_MODAL_LIST = ["theme", "someOtherFeature"];\n',
      },
      why: "a foreign string in the mix isn't pure vocab-space (the string-array false-positive guard), passes",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts": 'export const SETTINGS_CATEGORY_IDS = ["account", "appearance", "tags"] as const;\n',
        "packages/client/src/features/x/lib/appearance-pane.tsx": "export const M = { account: 1, appearance: 2 };\n",
      },
      why: "a SettingsCategoryId-keyed object literal inside a co-located *-pane.tsx def file — allowlisted, must pass",
    },
  ],
};
