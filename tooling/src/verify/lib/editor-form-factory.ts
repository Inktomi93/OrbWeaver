// The ONE reader for "does this module route its form through an editor form factory" — the question
// `form-factory-for-multifield` and `no-form-reset-in-autosave` both ask, from opposite directions.
//
// WHY IT IS SHARED RATHER THAN TWO PRIVATE COPIES. `form-factory-for-multifield` EXEMPTS a file that
// imports either factory (the form is routed through the machinery that bakes seed / key-remount /
// post-submit reset / reseed-guard / draft-mirror semantics); `no-form-reset-in-autosave` ARMS on a file
// that imports the AUTOSAVE factory (the type strip is only a type strip, so a runtime `.reset(` there is
// the #1144 loop). Those are one predicate read two ways, and if they ever disagreed about what counts as
// "routed through the factory", a file would be simultaneously exempt from the first and invisible to the
// second. The factory VOCABULARY therefore has one home: adding a third factory is one edit here, not a
// hunt through two gate modules.
//
// IDENTITY, DELIBERATELY BY NAME. The predicate is a NAMED IMPORT SPECIFIER whose name is one of the
// factories — not a resolved module origin. That is the legacy predicate, carried unchanged, and the
// reason to carry it is measured rather than lazy: the factories are reached through the `#forms/editor`
// subpath import alias, which the conformance runtime's virtual project (no `node_modules`, no
// package.json imports map) cannot resolve at all. An origin-resolving reader would classify every
// fixture as an unresolvable door and acquit it, so the rows would go green while the real tree's
// behaviour changed underneath them (§4.8b, the shape that took a live policy from 21 findings to 0).
// A LOCALLY-DECLARED function of the same name is therefore not seen here, and is not meant to be: both
// consumers ask about the import, and the import is what the two factory homes actually publish.
import type { SourceFile } from "ts-morph";

/** The autosave factory: bakes the draft mirror, and strips `reset` at the type level. */
export const AUTOSAVE_FORM_FACTORY = "createAutosaveEntityForm";
/** The saved-entity factory: explicit submit, no live draft mirror. */
const SAVED_FORM_FACTORY = "createSavedEntityForm";

/** Both editor form factories — the set `form-factory-for-multifield` treats as "routed through Form". */
export const EDITOR_FORM_FACTORIES: ReadonlySet<string> = new Set([AUTOSAVE_FORM_FACTORY, SAVED_FORM_FACTORY]);

/** The autosave factory's own module — the file whose RETURNED object must carry no `reset` property.
 *  Post-#1861 home (`forms/` was split into `forms/editor/`); the pre-split path is a stale permission. */
export const EDITOR_FORM_FACTORY_FILE = "packages/client/src/forms/editor/create-autosave-entity-form.tsx";

/** The autosave session's TYPE home — the declaration that must keep the `Omit<…, "reset">` strip.
 *  Split out of the factory `.tsx` for the `component-size` cap (2026-08-14, client-forms-01), so the
 *  strip check follows the DECLARATION while the returned-object check stays on the file that builds it. */
export const EDITOR_FORM_CONTRACT_FILE = "packages/client/src/forms/editor/autosave-contract.ts";

/** Does this file carry an `import { <factory> }` declaration for any of `factories`?
 *
 *  An `export … from` RE-EXPORT (the `forms/editor/index.ts` barrel) is not an import declaration, so the
 *  barrel is never treated as a consumer — which is the point: the barrel routes nothing. */
export function importsEditorFormFactory(sourceFile: SourceFile, factories: ReadonlySet<string> | string): boolean {
  const wanted = typeof factories === "string" ? new Set([factories]) : factories;
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getNamedImports().some((specifier) => wanted.has(specifier.getName()))) {
      return true;
    }
  }
  return false;
}
