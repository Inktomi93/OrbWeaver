// The ONE reader of "which SectionDefinitions does this file declare, and can each be read?" — shared by
// the two gates whose subject IS that population (`section-registry-completeness`,
// `placeholder-copy-registry`). It exists because they had the same reader twice and only one of them
// would ever be widened: a subject that drifts between two gates is the defect this file prevents.
//
// It knows BOTH sanctioned authoring shapes (client-architecture-lockdown.md §6a/§6b, M3): the annotated
// CONST declaration, read through as/satisfies wrappers and same-file indirection; and the FACTORY, a
// function whose declared RETURN type is SectionDefinition — live on chats/characters/home/config, and
// invisible to a reader that only walks variable declarations.
// Anything else comes back `unresolved` WITH its shape named, so a gate fails closed instead of returning.
import type { Node, SourceFile } from "ts-morph";
import type { ObjectLiteralRead } from "../contract/ast-read.ts";
import { readObjectLiteral, readReturnedObjectLiteral } from "./ast-read.ts";

/** A co-located section definition file: `features/<owner>/lib/<id>-section.{ts,tsx}`. */
export const SECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-section\.tsx?$/;

/** Where a discovered definition sits — the coordinates a finding is anchored on. */
export interface SectionSite {
  /** The declared name (`corpusSection`, `makeChatsSection`). */
  readonly name: string;
  /** `packages/...`-relative path. */
  readonly file: string;
  readonly line: number;
}

/** One discovered section definition: its site, its authoring shape, and the literal behind it (or the
 *  refusal, which is a value the caller must handle). */
export interface SectionDef {
  readonly site: SectionSite;
  readonly shape: "const" | "factory";
  readonly read: ObjectLiteralRead;
  /** The DECLARING node (the `const` declaration or the factory function) — a gate reporting node-anchored
   *  needs it, since the Finding overload gets no block-scoped suppression (GATE-AUTHORING.md §1). */
  readonly node: Node;
}

/** `packages/...`-relative path for a violation location. */
function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Is this annotation a `SectionDefinition` (bare or generic)? An ARRAY of them is a derivation, never a
 *  definition — the assembler declares `ChromeEntry[]`-shaped locals, and a `startsWith` subject would
 *  swallow that class the day one moved to top level. */
function isSectionAnnotation(typeText: string): boolean {
  return typeText === "SectionDefinition" || typeText.startsWith("SectionDefinition<");
}

/** Every section definition `sf` declares, in document order: the annotated consts first, then the
 *  factories. Callers apply their own co-location law to `site.file`. */
export function sectionDefsIn(sf: SourceFile): readonly SectionDef[] {
  const file = rel(sf.getFilePath());
  const out: SectionDef[] = [];
  for (const decl of sf.getVariableDeclarations()) {
    if (isSectionAnnotation(decl.getTypeNode()?.getText() ?? "")) {
      out.push({
        site: { name: decl.getName(), file, line: decl.getStartLineNumber() },
        shape: "const",
        read: readObjectLiteral(decl.getInitializer()),
        node: decl,
      });
    }
  }
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined && isSectionAnnotation(fn.getReturnTypeNode()?.getText() ?? "")) {
      out.push({ site: { name, file, line: fn.getStartLineNumber() }, shape: "factory", read: readReturnedObjectLiteral(fn), node: fn });
    }
  }
  return out;
}
