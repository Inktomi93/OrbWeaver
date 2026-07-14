// Gate: placeholder-copy-registry (client-architecture-lockdown.md §6a / §16 G13) — a SectionDefinition's
// `placeholder: { title, description }` gives every rail SectionId its own honest "not built yet" copy.
// Reconciles ACROSS the 7 co-located `features/*/lib/*-section.{ts,tsx}` files: every section's pair is
// DISTINCT (the "all sections look identical" root cause) and non-empty (a title/description that types
// as a string but is blank is the same silent-sparkle failure). Cross-file, so whole-project.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** A co-located section definition file: `features/<owner>/lib/<id>-section.{ts,tsx}`. */
const SECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-section\.tsx?$/;

/** `packages/...`-relative path for a violation location. */
function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The string value of a named string-literal property (`title: "Corpus"` → "Corpus"), or undefined. */
function stringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

type SectionEntry = { readonly name: string; readonly file: string; readonly line: number };
type PlaceholderFound = {
  readonly entry: SectionEntry;
  readonly title: string | undefined;
  readonly description: string | undefined;
};

/** A `SectionDefinition`-typed declaration's `placeholder` object literal, or undefined. */
function declPlaceholder(decl: {
  readonly getTypeNode: () => Node | undefined;
  readonly getInitializer: () => Node | undefined;
}): ObjectLiteralExpression | undefined {
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !typeNode.getText().startsWith("SectionDefinition")) {
    return;
  }
  const init = decl.getInitializer();
  if (init === undefined || !Node.isObjectLiteralExpression(init)) {
    return;
  }
  const prop = init.getProperty("placeholder");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const placeholder = prop.getInitializer();
  return placeholder !== undefined && Node.isObjectLiteralExpression(placeholder)
    ? placeholder
    : undefined;
}

/** The one `<x>Section: SectionDefinition<...>` declaration's `placeholder` object literal, per section
 *  file (a section file declares exactly one, per the co-location gate). */
function readPlaceholder(sf: SourceFile): PlaceholderFound | undefined {
  const found = sf
    .getVariableDeclarations()
    .map((decl) => ({ decl, placeholder: declPlaceholder(decl) }))
    .find((d) => d.placeholder !== undefined);
  return found === undefined || found.placeholder === undefined
    ? undefined
    : {
        entry: {
          name: found.decl.getName(),
          file: rel(sf.getFilePath()),
          line: found.decl.getStartLineNumber(),
        },
        title: stringProp(found.placeholder, "title"),
        description: stringProp(found.placeholder, "description"),
      };
}

export const gate: GateDescriptor = {
  name: "placeholder-copy-registry",
  docRow: "client-architecture-lockdown.md §6a / §16 G13",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a SectionDefinition's placeholder (title, description) is either empty or duplicates another section's — every section's placeholder must be a DISTINCT, non-empty pair (the 'all sections look identical' root cause) — client-architecture-lockdown.md §6a.",
  fix: "give the section its own honest, non-empty (title, description) placeholder copy — no two sections share a pair.",
  run: (ctx) => {
    // pair signature (`title␟description`) → the first section that used it; a second is a duplicate.
    const seen = new Map<string, SectionEntry>();
    for (const sf of ctx.project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!SECTION_FILE_RE.test(path)) {
        continue;
      }
      const found = readPlaceholder(sf);
      if (found === undefined) {
        continue;
      }
      const { entry, title, description } = found;
      if (title === undefined || description === undefined) {
        continue; // not a string-literal placeholder — out of this gate's reach (tsc types the field)
      }
      if (title.length === 0 || description.length === 0) {
        ctx.report({
          file: entry.file,
          line: entry.line,
          column: 0,
          message: `section "${entry.name}" has an empty placeholder title/description — every section's placeholder must be a non-empty (title, description) pair (client-architecture-lockdown.md §6a).`,
        });
        continue;
      }
      // U+241F (SYMBOL FOR UNIT SEPARATOR) can't appear in copy — an unambiguous pair join key.
      const key = `${title}␟${description}`;
      const firstOwner = seen.get(key);
      if (firstOwner !== undefined) {
        ctx.report({
          file: entry.file,
          line: entry.line,
          column: 0,
          message: `section "${entry.name}" has the SAME (title, description) placeholder as "${firstOwner.name}" — every section's placeholder must be DISTINCT (client-architecture-lockdown.md §6a).`,
        });
        continue;
      }
      seen.set(key, entry);
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      expect: { messageIncludes: "SAME" },
      why: "two co-located sections with the SAME (title, description) — an identical-sparkle duplicate",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      expect: { messageIncludes: "empty" },
      why: "an empty placeholder title — the non-empty arm",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "T1", description: "D1" }, content: { planned: "x" }, context: { kind: "none" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T2", description: "D2" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      why: "each section's (title, description) pair is distinct and non-empty — the sanctioned honest copy, passes",
    },
  ],
};
