// Gate: placeholder-copy-registry (design-enforcement.md §3.2 — the distinct-not-identical half of the
// section-placeholder work; ux-flow-revamp J10). The SECTION_PLACEHOLDER_COPY map
// (features/**/lib/section-placeholder-copy.ts) gives every rail SectionId its own honest "not built yet"
// copy. This gate pins the ONE rule the type layer can't: every entry's `(title, description)` pair is
// DISTINCT. Three sections sharing one string was the "snap agent sees no differences" root cause
// (punchlist §0) — a duplicate pair here fails the build, so an unbuilt hub can never silently read as an
// identical sparkle again. The `Record<SectionId, …>` already forces FULL coverage (a missing section is a
// tsc error); the companion vitest test pins that at runtime + this gate pins distinctness structurally.
//
// SHAPE (fixture-able, the `__g_*` pattern — the modal-body-not-placeholder twin): for every
// `**/lib/section-placeholder-copy.ts` it walks the `SECTION_PLACEHOLDER_COPY` object's entries, reads each
// entry's `title`+`description` string literals, and flags any entry whose pair duplicates an earlier one.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

const COPY_MAP = "SECTION_PLACEHOLDER_COPY";

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

function checkFile(sf: SourceFile, out: Violation[]): void {
  const decl = sf.getVariableDeclaration(COPY_MAP);
  const init = decl?.getInitializer();
  if (init === undefined || !Node.isObjectLiteralExpression(init)) {
    return;
  }
  // pair signature (`title␟description`) → the first section id that used it; a second is a duplicate.
  const seen = new Map<string, string>();
  for (const prop of init.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue;
    }
    const entry = prop.getInitializer();
    if (entry === undefined || !Node.isObjectLiteralExpression(entry)) {
      continue;
    }
    const title = stringProp(entry, "title");
    const description = stringProp(entry, "description");
    if (title === undefined || description === undefined) {
      continue;
    }
    // U+241F (SYMBOL FOR UNIT SEPARATOR) can't appear in copy — an unambiguous pair join key.
    const key = `${title}␟${description}`;
    const firstOwner = seen.get(key);
    if (firstOwner !== undefined) {
      out.push({
        file: rel(sf.getFilePath()),
        line: prop.getStartLineNumber(),
        message:
          `SECTION_PLACEHOLDER_COPY entry "${prop.getName()}" has the SAME (title, description) as ` +
          `"${firstOwner}" — every section's placeholder must be DISTINCT (the "all sections look ` +
          'identical" root cause). Give it its own copy per docs/architecture/history/ux-flow-revamp.md J10.',
      });
      continue;
    }
    seen.set(key, prop.getName());
  }
}

export const gate: GateDescriptor = {
  name: "placeholder-copy-registry",
  docRow: "design-enforcement.md §3.2 (ux-flow-revamp.md J10)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "two SECTION_PLACEHOLDER_COPY entries share the same (title, description) — every section's placeholder must be DISTINCT (the 'all sections look identical' root cause). Give each its own copy (ux-flow-revamp.md J10).",
  fix: "give the duplicate section its own honest (title, description) placeholder copy — no two sections share a pair.",
  scanRoot: (p) => p.endsWith("/lib/section-placeholder-copy.ts"),
  visitFile: (sf, ctx: GateRunCtx) => {
    const violations: Violation[] = [];
    checkFile(sf, violations);
    for (const v of violations) {
      ctx.report({
        file: v.file,
        line: v.line,
        column: 0,
        message: v.message,
        token: "duplicate pair",
      });
    }
  },
  mustFlag: [
    {
      files:
        'export const SECTION_PLACEHOLDER_COPY = {\n  a: { title: "T", description: "D" },\n  b: { title: "T", description: "D" },\n};\n',
      at: "packages/client/src/features/x/lib/section-placeholder-copy.ts",
      why: "two entries with the SAME (title, description) — an identical-sparkle duplicate (J10)",
    },
  ],
  mustPass: [
    {
      files:
        'export const SECTION_PLACEHOLDER_COPY = {\n  a: { title: "T1", description: "D1" },\n  b: { title: "T2", description: "D2" },\n};\n',
      at: "packages/client/src/features/x/lib/section-placeholder-copy.ts",
      why: "each entry's (title, description) pair is distinct — the sanctioned honest copy, passes",
    },
  ],
};
