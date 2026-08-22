// ID branding (TypeID / branded-id migration): annotation retyping.
// ── §14.5 ─ ID branding (TypeID / branded-id migration) ──────────────────────
//
// Two passes that automate the mechanical bulk of branding ONE entity's id once
// its DB columns carry `.$type<Brand>()` (which flips drizzle `inferSelect`/insert
// from `string` to the brand, lighting up every plain-`string` consumer). They are
// parameterized by the id's NAMES + the BRAND symbol, so the SAME two calls migrate
// each successive entity in the TypeID rollout — the reusable engine the unattended
// loop drives per-entity. The tsc gate is the proof: a mis-retype goes red, so these
// passes act on the mechanical ~90% and leave genuine edge cases for the gate to flag.
//
//   retypeIdAnnotations  — production: `chatId: string` → `chatId: ChatId` on every
//                          param / interface-field / class-field / variable whose NAME
//                          matches, preserving `| null` / `| undefined` / `?`.
//   castIdInObjectLiterals — tests: wrap literal fixture ids (`chatId: "ch1"`, and
//                          `id: "ch1"` inside an `insert(<table>)`) in `castId<Brand>()`.

import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CodemodContext, Plan, RetypeIdAnnotationsOptions } from "../contract/types.ts";
import { addNamedImport } from "./imports.ts";
import { assert, assertPathString, composePlans } from "./plans.ts";
import { applyTextReplacements, replacementsForNodes } from "./text.ts";

/** The `string` keyword node(s) inside a string-family annotation — the bare
 *  `string`, or the `string` member of a `string | null` / `string | undefined`
 *  union. `[]` when the annotation isn't string-family (so nothing is rewritten). */
function stringKeywordNodes(typeNode: Node | undefined): Node[] {
  if (typeNode === undefined) {
    return [];
  }
  if (typeNode.getKind() === SyntaxKind.StringKeyword) {
    return [typeNode];
  }
  // Union (`string | null`, `string | undefined`): the member type nodes hang off a SyntaxList,
  // so `getChildrenOfKind` (immediate children only) misses them — use the union's typed members.
  const union = typeNode.asKind(SyntaxKind.UnionType);
  if (union !== undefined) {
    return union.getTypeNodes().filter((t) => t.getKind() === SyntaxKind.StringKeyword);
  }
  return [];
}

/**
 * Retype every `string` (or `string | null` / `string | undefined`) annotation on a
 * declaration NAMED in `opts.names` to `opts.brand`, and add a type-only import of the
 * brand to each touched file. Covers parameters, interface/type-literal property
 * signatures, class property declarations, and explicitly-annotated variables.
 *
 * Only the `string` keyword itself is rewritten (not the whole annotation), so `| null`,
 * `| undefined`, and a trailing `?` survive. Binding-pattern declarations (`const { chatId }`)
 * are skipped — there's no annotation to retype. Idempotent (a brand annotation isn't
 * string-family, so a second run is a no-op).
 */
export function retypeIdAnnotations(ctx: CodemodContext, opts: RetypeIdAnnotationsOptions): Plan {
  assert(opts.names.length > 0, "retypeIdAnnotations: names must be non-empty");
  assertPathString(opts.brand, "brand");
  assertPathString(opts.importModule, "importModule");
  const nameSet = new Set(opts.names);
  const exclude = opts.excludePathSubstrings ?? ["/shared/lib/ids."];
  const keywords: Node[] = [];
  const files = new Set<string>();

  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (exclude.some((s) => fp.includes(s))) {
      continue;
    }
    const consider = (name: string | undefined, typeNode: Node | undefined): void => {
      if (name === undefined || !nameSet.has(name)) {
        return;
      }
      const sks = stringKeywordNodes(typeNode);
      if (sks.length === 0) {
        return;
      }
      for (const sk of sks) {
        keywords.push(sk);
      }
      files.add(fp);
    };
    for (const d of sf.getDescendantsOfKind(SyntaxKind.Parameter)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.PropertyDeclaration)) {
      consider(d.getName(), d.getTypeNode());
    }
    for (const d of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      consider(d.getName(), d.getTypeNode());
    }
  }

  const plans: Plan[] = [];
  if (keywords.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(keywords, () => ({
          text: opts.brand,
          label: `string → ${opts.brand}`,
        })),
        { note: `retype ${keywords.length} ${opts.brand} annotation(s)` },
      ),
    );
    for (const fp of files) {
      plans.push(
        addNamedImport(ctx, fp, {
          moduleSpecifier: opts.importModule,
          name: opts.brand,
          isTypeOnly: true,
        }),
      );
    }
  }
  return composePlans(`retype {${opts.names.join(", ")}}: string → ${opts.brand} (${keywords.length} site(s) across ${files.size} file(s))`, plans);
}

/** The table identifier an object literal is being `insert(...).values()` /
 *  `update(...).set()` into — `undefined` if the property isn't in such a call. */
