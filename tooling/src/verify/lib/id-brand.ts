// Canonical @orb/kit/ids call identity for the native mint ban and the TypeID boundary codemod.

import { literalMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { resolveCallableOrigin } from "@orb/tooling/floor/code-facts/reference-fact-call";
import type { CallExpression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { ID_BRAND_HOME } from "../../floor/code-facts/id-brand.ts";
import type { KitIdCallServices, KitIdCallVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

function importedNames(sourceFile: SourceFile, exportedName: string): ReadonlySet<string> {
  const names = new Set<string>([exportedName]);
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      // A project barrel may republish the canonical helper under its original export name. Include that
      // authored spelling in the cheap candidate fence and let resolveCallableOrigin decide identity; a
      // same-named local module still resolves to `other`. Direct kit imports take the same path.
      if (specifier.getName() === exportedName) {
        names.add(specifier.getAliasNode()?.getText() ?? exportedName);
      }
    }
  }
  return names;
}

function couldNameExport(call: CallExpression, exportedName: string, names: ReadonlySet<string>): boolean {
  const callee = call.getExpression();
  if (Node.isIdentifier(callee)) {
    return names.has(callee.getText());
  }
  return literalMemberAccess(callee, true)?.name === exportedName;
}

/** Invocation-local exact kit-call matcher; each source's import aliases are indexed once.
 *
 *  The verdict is three-valued: a call spelled like the canonical seam whose door cannot be read answers
 *  `unreadable`, never `other`, so a hard ban such as `orb/no-mint-via-cast` cannot acquit it silently. A local
 *  function, a parameter or any other proven non-module binding is a different identity and answers `other`
 *  (`classifyOriginRefusal`). The name prefilter keeps every non-candidate spelling out of the origin query. */
export function createKitIdCallMatcher(
  exportedName: string,
  services?: (call: CallExpression) => KitIdCallServices,
): (call: CallExpression) => KitIdCallVerdict {
  const namesBySource = new WeakMap<object, ReadonlySet<string>>();
  return (call) => {
    const sourceFile = call.getSourceFile();
    let names = namesBySource.get(sourceFile.compilerNode);
    if (names === undefined) {
      names = importedNames(sourceFile, exportedName);
      namesBySource.set(sourceFile.compilerNode, names);
    }
    if (!couldNameExport(call, exportedName, names)) {
      return "other";
    }
    const captured = services?.(call);
    const origin = resolveCallableOrigin(call, captured);
    if (origin.kind === "unresolved") {
      return classifyOriginRefusal(origin.reason, call.getExpression(), captured?.declarations);
    }
    const target = origin.value.target;
    if (target.kind !== "module" || target.exportedName !== exportedName || target.memberPath.length > 0) {
      return "other";
    }
    const canonical = target.canonical;
    const isKit =
      canonical.kind === "external-door"
        ? canonical.moduleSpecifier === "@orb/kit/ids"
        : canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`);
    return isKit ? "kit" : "other";
  };
}
