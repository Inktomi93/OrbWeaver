// Gate: no-parallel-section-map (client-architecture-lockdown.md §5 rule 4 / §16 G2) — the composition
// bug was a section smeared across parallel static maps no gate forced to agree. Three shapes are RED
// outside the sanctioned homes: (1) a VALUE object literal hardcoding ≥2 SectionId keys (the
// `SECTION_PANEL_DEFAULTS` shape); (2) an array literal of `{ id: <SectionId>, … }` elements covering ≥2
// SectionIds (the deleted `RAIL_SECTIONS` shape); (3) a `Record<SectionId, …>` type annotation on a value
// declaration (catches a hardcoded map whose value literal the object-literal arm can't see, e.g. built by
// a function call). Derive from the registry, never re-declare — a DERIVED map (`registry.list().filter…`)
// has no literal SectionId keys/type, so it passes (the load-bearing false-positive check).
//
// SCOPE (this wave): the SectionId vocabulary only. The ModalSlotId arm lands at M4 (when modal bodies
// move to the door) and the SettingsCategoryId arm at M6 (settings de-god) — staged, not forgotten.
import type { ObjectLiteralExpression, Project, SourceFile, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";
/** ≥ this many SectionId keys in one object literal = a re-declared parallel map (not an incidental pair). */
const MIN_SECTION_KEYS = 2;
/** A co-located section definition file: `features/<owner>/lib/<id>-section.{ts,tsx}`. */
const SECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-section\.tsx?$/;
const RECORD_SECTION_ID_RE = /\bRecord<\s*SectionId\b/;
const PARTIAL_RECORD_SECTION_ID_RE = /\bPartial<\s*Record<\s*SectionId\b/;

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The SectionId vocabulary tuple members (§5 rule 5 — SECTION_IDS is the one home). */
function readSectionIds(project: Project): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const decl = sf.getVariableDeclaration("SECTION_IDS");
    const init = decl?.getInitializer();
    if (init === undefined) {
      continue;
    }
    // `["chats", "characters", …] as const` — the ArrayLiteral is the init or the `as const` expression.
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

/** The sanctioned homes for a SectionId-keyed map: the vocabulary tuple, the door assembly, the section
 *  definition files, + the two FLAG[lockdown-M3] CONTEXT scaffolds (context-slots + app-root's bridge). */
function isAllowlisted(repoRelPath: string): boolean {
  return (
    repoRelPath.endsWith("/state/shell-store.ts") ||
    repoRelPath.endsWith("/client/src/main.tsx") ||
    SECTION_FILE_RE.test(repoRelPath) ||
    repoRelPath.endsWith("/app-shell/lib/context-slots.ts") || // FLAG[lockdown-M3]
    repoRelPath.endsWith("/routes/app-root.tsx") // FLAG[lockdown-M3]: the slim sectionContext bridge
  );
}

/** A parallel section map = an object literal whose NAMED keys are ALL SectionIds, ≥2 of them. Requiring
 *  every named key to be a SectionId excludes an incidental collision (a TagUsage map that happens to
 *  carry `characters`/`chats` alongside `worldBooks`/`personas`). */
function isPureSectionMap(obj: ObjectLiteralExpression, ids: ReadonlySet<string>): boolean {
  let section = 0;
  for (const prop of obj.getProperties()) {
    if (!(Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop))) {
      continue; // spreads / methods / computed keys — not a hardcoded per-section entry
    }
    if (ids.has(prop.getName())) {
      section += 1;
    } else {
      return false; // a foreign named key ⇒ this is not a section-space map
    }
  }
  return section >= MIN_SECTION_KEYS;
}

/** The string value of an element's `id:`/`id`(shorthand) property, or undefined (not a section-shaped
 *  element). Shorthand (`{ id }`) never carries a literal SectionId, so it can't match — only `id: "x"`. */
function elementSectionId(el: ObjectLiteralExpression): string | undefined {
  const prop = el.getProperty("id");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** A parallel section map, array form: an array literal whose elements are object literals each carrying
 *  an `id:` string that is a SectionId, ≥2 distinct SectionIds covered (the deleted `RAIL_SECTIONS` shape,
 *  `[{ id: 'chats', … }, { id: 'characters', … }]`). A non-section element (a foreign id, or no `id` at
 *  all) makes the array NOT pure section-space, same false-positive guard as the object-literal arm. */
function isSectionArray(
  arr: readonly ObjectLiteralExpression[],
  ids: ReadonlySet<string>,
): boolean {
  const covered = new Set<string>();
  for (const el of arr) {
    const id = elementSectionId(el);
    if (id === undefined || !ids.has(id)) {
      return false;
    }
    covered.add(id);
  }
  return covered.size >= MIN_SECTION_KEYS;
}

/** A `Record<SectionId, …>` (or `Partial<Record<SectionId, …>>`) type reference on a value declaration —
 *  catches a hardcoded map whose value the object-literal arm can't see (built by a function call, not a
 *  literal). A bare TYPE ALIAS (`type X = Record<SectionId, Y>`) is not a value and can't hold data, so
 *  only VARIABLE declarations are checked. */
function isSectionRecordType(typeNode: TypeNode | undefined): boolean {
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return false;
  }
  const text = typeNode.getText();
  return RECORD_SECTION_ID_RE.test(text) || PARTIAL_RECORD_SECTION_ID_RE.test(text);
}

function scanFile(sf: SourceFile, ids: ReadonlySet<string>, out: Violation[]): void {
  const path = sf.getFilePath();
  if (!path.includes(CLIENT_SRC) || isAllowlisted(rel(path))) {
    return;
  }
  for (const obj of sf.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    if (isPureSectionMap(obj, ids)) {
      out.push({
        file: rel(path),
        line: obj.getStartLineNumber(),
        message:
          "an object literal is keyed entirely by SectionIds — a parallel section map that no gate forces " +
          "to agree with the registry (the SECTION_PANEL_DEFAULTS bug). Derive from the section registry " +
          "(registry.list()/get()), never re-declare per-section data — client-architecture-lockdown.md §5.",
      });
    }
  }
  for (const arr of sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    const elements = arr.getElements().filter(Node.isObjectLiteralExpression);
    if (elements.length !== arr.getElements().length || elements.length === 0) {
      continue; // a mixed/empty array isn't a pure `{ id }` section list
    }
    if (isSectionArray(elements, ids)) {
      out.push({
        file: rel(path),
        line: arr.getStartLineNumber(),
        message:
          "an array literal of `{ id: … }` elements covers ≥2 SectionIds — a parallel section map (the " +
          "deleted RAIL_SECTIONS shape). Derive from the section registry (registry.list()), never " +
          "re-declare per-section data — client-architecture-lockdown.md §5.",
      });
    }
  }
  for (const decl of sf.getVariableDeclarations()) {
    if (isSectionRecordType(decl.getTypeNode())) {
      out.push({
        file: rel(path),
        line: decl.getStartLineNumber(),
        message:
          `"${decl.getName()}" is typed \`Record<SectionId, …>\` — a parallel section map (the composition-` +
          "drift bug) even without a literal value the object-literal arm can see. Derive from the section " +
          "registry (registry.list()/get()), never re-declare per-section data — client-architecture-lockdown.md §5.",
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
    "an object literal / array of `{ id }` elements / `Record<SectionId, …>`-typed value hardcoding ≥2 SectionIds is a parallel section map (the composition-drift bug) — derive from the registry, never re-declare. Homes: the SECTION_IDS tuple, the main.tsx door, the *-section definition files, and the FLAG[lockdown-M3] context scaffolds.",
  fix: "delete the map and read the section registry (registry.get(id)/list()); if it is tracked scaffolding, home it in an allowlisted file with its FLAG marker.",
  run: (ctx) => {
    const ids = readSectionIds(ctx.project);
    if (ids.size === 0) {
      return;
    }
    const out: Violation[] = [];
    for (const sf of ctx.project.getSourceFiles()) {
      scanFile(sf, ids, out);
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/panel-defaults.ts":
          "export const M = {\n  chats: { list: 1 },\n  characters: { list: 2 },\n};\n",
      },
      expect: { messageIncludes: "parallel section map" },
      why: "a re-declared per-section map (≥2 SectionId keys) outside the sanctioned homes — the target bug",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/rail-sections.ts":
          "export const RAIL_SECTIONS = [\n" +
          '  { id: "chats", label: "Chats" },\n' +
          '  { id: "characters", label: "Characters" },\n' +
          "];\n",
      },
      expect: { messageIncludes: "array literal" },
      why: "an array of `{ id: … }` elements covering ≥2 SectionIds — the deleted RAIL_SECTIONS shape",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/labels.ts":
          'import type { SectionId } from "../../../state/shell-store";\n' +
          "declare function build(): Record<SectionId, string>;\n" +
          "export const LABELS: Record<SectionId, string> = build();\n",
      },
      expect: { messageIncludes: "Record<SectionId" },
      why: "a `Record<SectionId, …>`-typed value built by a function call — no literal the object-literal arm can see",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/derived.ts":
          "declare const registry: { list: () => { id: string; mobilePrimary: boolean }[] };\n" +
          "export const MOBILE_PRIMARY_SECTIONS = registry.list().filter((d) => d.mobilePrimary);\n",
      },
      why: "a DERIVED map (no literal SectionId keys) — the mandated false-positive check, must pass",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/routes/app-root.tsx":
          "export const bridge = { chats: 1, characters: 2 };\n",
      },
      why: "the FLAG[lockdown-M3] context bridge lives in the allowlisted app-root.tsx — tracked scaffolding, passes",
    },
    {
      files: {
        "packages/client/src/state/shell-store.ts":
          'export const SECTION_IDS = ["chats", "characters", "corpus"] as const;\n',
        "packages/client/src/features/x/lib/mixed-array.ts":
          "declare const registry: { list: () => { id: string }[] };\n" +
          'export const NOT_A_SECTION_MAP = [{ id: "chats" }, { other: "value" }];\n' +
          "export const DERIVED = registry.list();\n",
      },
      why: "an array with a non-`id` element isn't pure section-space (the array false-positive guard), passes",
    },
  ],
};
