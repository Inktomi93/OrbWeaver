// Gate: placeholder-copy-registry (client-architecture-lockdown.md §6a / §16 G13) — a SectionDefinition's
// `placeholder: { title, description }` gives every rail SectionId its own honest "not built yet" copy.
// Reconciles ACROSS the co-located `features/*/lib/*-section.{ts,tsx}` files: every section's pair is
// DISTINCT (the "all sections look identical" root cause) and non-empty (a title/description that types
// as a string but is blank is the same silent-sparkle failure). Cross-file, so whole-project.
//
// THE SUBJECT IS BOTH SANCTIONED AUTHORING SHAPES (#944, 2026-09-01) — the const definition AND the
// FACTORY (`export function makeChatsSection(…): SectionDefinition { return {…}; }`, ratified at
// client-architecture-lockdown.md §6b/M3 and live on chats/characters/home/config). Reading only typed
// `const` declarations left FOUR of the ten live sections unjudged while the gate reported a healthy file
// count — a distinctness gate that never saw four of the pairs it exists to compare. It also FAILS CLOSED
// on an initializer it cannot resolve to a co-located literal (an imported definition), and declares its
// SECTION POPULATION (#946) so the next shrink is loud instead of silent.
import type { ObjectLiteralExpression } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import type { SectionDef, SectionSite } from "../lib/section-defs.ts";
import { SECTION_FILE_RE, sectionDefsIn } from "../lib/section-defs.ts";

/** The string value of a named string-literal property (`title: "Corpus"` → "Corpus"), through any
 *  as/satisfies/paren wrapper, or undefined. */
function stringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init === undefined ? undefined : readStringValue(init);
}

/** A section definition's `placeholder` object literal, or undefined when it declares none. */
function placeholderOf(section: ObjectLiteralExpression): ObjectLiteralExpression | undefined {
  const prop = section.getProperty("placeholder");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const placeholder = prop.getInitializer();
  return placeholder !== undefined && Node.isObjectLiteralExpression(placeholder) ? placeholder : undefined;
}

/** The population's stable name — what a reader diffs run over run (#946). */
const POPULATION = "SectionDefinition";

/** What one `run` counted: the members it JUDGED, the definitions it could not read (denominator loss),
 *  and the ONE declared limit (a placeholder written as something other than a string literal). */
interface Tally {
  members: number;
  unresolved: number;
  nonLiteralCopy: number;
}

/** Judge ONE discovered section: fail closed when unreadable, else compare its pair against the others. */
function judgeSection(ctx: GateRunCtx, def: SectionDef, seen: Map<string, SectionSite>, tally: Tally): void {
  // FAIL CLOSED (#944): an unreadable definition is not "no placeholder to judge" — it is a section whose
  // copy this gate cannot see, which is exactly what a re-home behind an import produces.
  if (def.read.kind === "unresolved") {
    tally.unresolved += 1;
    ctx.report({
      file: def.site.file,
      line: def.site.line,
      column: 0,
      message: `section "${def.site.name}" has an UNREADABLE definition — ${def.read.shape} — so its placeholder copy is invisible to the distinctness comparison. Write the definition as a co-located object literal, or a factory returning one (client-architecture-lockdown.md §6a).`,
    });
    return;
  }
  tally.members += 1;
  const placeholder = placeholderOf(def.read.object);
  if (placeholder === undefined) {
    return; // the section declares no placeholder at all — tsc owns whether that is legal
  }
  const title = stringProp(placeholder, "title");
  const description = stringProp(placeholder, "description");
  if (title === undefined || description === undefined) {
    tally.nonLiteralCopy += 1; // the declared limit — counted, not silent
    return;
  }
  judgePair(ctx, { entry: def.site, title, description }, seen);
}

/** One section's placeholder copy, ready to judge. */
interface Pair {
  readonly entry: SectionSite;
  readonly title: string;
  readonly description: string;
}

/** The two live arms: a blank half of the pair, and a pair another section already owns. */
function judgePair(ctx: GateRunCtx, { entry, title, description }: Pair, seen: Map<string, SectionSite>): void {
  if (title.length === 0 || description.length === 0) {
    ctx.report({
      file: entry.file,
      line: entry.line,
      column: 0,
      message: `section "${entry.name}" has an empty placeholder title/description — every section's placeholder must be a non-empty (title, description) pair (client-architecture-lockdown.md §6a).`,
    });
    return;
  }
  // U+241F (SYMBOL FOR UNIT SEPARATOR) can't appear in copy — an unambiguous pair join key.
  const key = `${title}␟${description}`;
  const firstOwner = seen.get(key);
  if (firstOwner === undefined) {
    seen.set(key, entry);
    return;
  }
  ctx.report({
    file: entry.file,
    line: entry.line,
    column: 0,
    message: `section "${entry.name}" has the SAME (title, description) placeholder as "${firstOwner.name}" — every section's placeholder must be DISTINCT (client-architecture-lockdown.md §6a).`,
  });
}

export const gate: GateDescriptor = {
  name: "placeholder-copy-registry",
  docRow: "client-architecture-lockdown.md §6a / §16 G13",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a SectionDefinition's placeholder is unreadable, empty, or duplicates another section's — a definition this gate cannot resolve to a co-located object literal (an imported definition) hides its copy from the comparison entirely, and every section's placeholder must be a DISTINCT, non-empty (title, description) pair (the 'all sections look identical' root cause) — client-architecture-lockdown.md §6a.",
  fix: "write the definition as a co-located object literal or a `make<X>Section(): SectionDefinition` factory (both are read); give the section its own honest, non-empty (title, description) placeholder copy — no two sections share a pair.",
  run: (ctx) => {
    const tally: Tally = { members: 0, unresolved: 0, nonLiteralCopy: 0 };
    // pair signature (`title␟description`) → the first section that used it; a second is a duplicate.
    const seen = new Map<string, SectionSite>();
    for (const sf of ctx.project.getSourceFiles()) {
      if (!SECTION_FILE_RE.test(sf.getFilePath())) {
        continue;
      }
      for (const def of sectionDefsIn(sf)) {
        judgeSection(ctx, def, seen, tally);
      }
    }
    // The SEMANTIC denominator (#946) beside the harness's file one: `members` is what this distinctness
    // comparison actually ran over, `unresolved` is denominator loss (exit 2), and `non-literal-copy` is
    // this gate's ONE declared limit — counted, never silent.
    ctx.scan({
      unit: "section",
      scanned: tally.members,
      candidates: tally.members + tally.unresolved,
      skipped: tally.nonLiteralCopy > 0 ? { "non-literal-copy": tally.nonLiteralCopy } : {},
      population: [{ source: POPULATION, members: tally.members, unresolved: tally.unresolved }],
    });
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
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const aSection: SectionDefinition = { id: "a", placeholder: { title: "" as string, description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      expect: { messageIncludes: "empty" },
      why: 'an empty title written `"" as string` (AsExpression) — the wrapped-literal shape the plain StringLiteral reader treated as "out of reach" (undefined) and silently PASSED before hardening',
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-definition.ts":
          'export const aDef = { id: "a", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nimport { aDef } from "./a-definition.ts";\nexport const aSection: SectionDefinition = aDef;\n',
      },
      expect: { messageIncludes: "UNREADABLE definition" },
      why: "THE #944 CONTROL: the definition moved behind an IMPORT. The section file is still co-located so every path check stays green, and before the fail-closed arm this section's copy simply vanished from the distinctness comparison",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { SectionDefinition } from "#state";\nexport function makeASection(): SectionDefinition {\n  return { id: "a", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n}\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T", description: "D" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      expect: { messageIncludes: "SAME" },
      why: "THE FACTORY CONTROL (§6b/M3): a `make<X>Section(): SectionDefinition` factory duplicating a const section's copy. Four of the ten live sections are authored this way (chats/characters/home/config) and NONE of them was a subject before #944 — the gate compared six pairs and called it complete",
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
    {
      files: {
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { SectionDefinition } from "#state";\nexport function makeASection(): SectionDefinition {\n  return { id: "a", placeholder: { title: "T1", description: "D1" }, content: { planned: "x" }, context: { kind: "none" } };\n}\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "#state";\nexport const bSection: SectionDefinition = { id: "b", placeholder: { title: "T2", description: "D2" }, content: { planned: "x" }, context: { kind: "none" } };\n',
      },
      why: "the factory arm's FALSE branch — a factory section with its own distinct copy passes, so the widened subject is not a blanket accusation",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "#state";\nconst aDef = { id: "a", placeholder: { title: "T1", description: "D1" }, content: { planned: "x" }, context: { kind: "none" } };\nexport const aSection: SectionDefinition = aDef;\n',
      },
      why: "SAME-FILE indirection — still co-located, so it resolves and is judged normally. The declared limit this row writes down: only an import/builder fails closed",
    },
  ],
};
