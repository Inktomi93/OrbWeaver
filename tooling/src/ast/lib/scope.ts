// Scope normalization + validation (a zero-file scope is a tool error) + ownExports.
import type { Node, SourceFile } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Scope } from "../contract/types.ts";
import { exitToolError, noteScope } from "./ledger.ts";
import { LEADING_SLASHES_RE, TEST_FILE_RE, TRAILING_SLASHES_RE, WORKSPACE_PACKAGES } from "./root.ts";

/** Normalize a scope arg into a path SUBSTRING the file-loop matches on. A bare package name becomes the
 *  package src prefix; a path form (`packages/server/src/x`, with or without a leading `/`) becomes that
 *  path wrapped so `.includes()` bites. The scope is NOT trusted — the caller proves it matches ≥1 file. */
function normalizeScope(arg: string): Scope {
  const cleaned = arg.replace(LEADING_SLASHES_RE, "").replace(TRAILING_SLASHES_RE, "");
  if ((WORKSPACE_PACKAGES as readonly string[]).includes(cleaned)) {
    return { prefix: `/packages/${cleaned}/src/`, label: cleaned };
  }
  if (cleaned.startsWith("packages/")) {
    return { prefix: `/${cleaned}`, label: cleaned };
  }
  // Bare, non-package word (a typo, or a sub-path missing its `packages/` root) — build the most likely
  // intended prefix and let the file-count gate reject it with a spelling hint.
  return { prefix: `/packages/${cleaned}`, label: cleaned };
}

/** Resolve + VALIDATE a scope arg for the rot verbs. A scope that matches zero non-test source files is a
 *  tool error (the `/packages/packages/…` silent-green footgun — a bad arg once read as a clean package),
 *  so it prints what was tried + a suggestion and exits 2. Never returns a zero-file scope. */
export function resolveScope(project: SourceCorpus, arg: string, verb: string): Scope {
  const scope = normalizeScope(arg);
  const matched = project.getSourceFiles().some((sf) => {
    const fp = sf.getFilePath();
    return fp.includes(scope.prefix) && !TEST_FILE_RE.test(fp);
  });
  if (matched) {
    return scope;
  }
  const guess = WORKSPACE_PACKAGES.find((p) => arg.includes(p));
  const hint =
    guess === undefined
      ? `expected one of: ${WORKSPACE_PACKAGES.join(", ")}, or a path like packages/server/src/domain`
      : `did you mean \`pnpm ast ${verb} ${guess}\` (a package name), or a path under packages/${guess}/src/?`;
  noteScope(`path:${scope.prefix}(no-files)`);
  exitToolError(`ast ${verb}: scope "${arg}" (tried path substring "${scope.prefix}") matched no source files — ${hint}`);
}

/** A candidate export of `sf` that a consumer might reach: `(name, first-decl)` for each export whose
 *  ORIGIN is `sf` (re-export slots — decls that live elsewhere — belong to their own file, not here). */
export function* ownExports(sf: SourceFile): Generator<{ name: string; decl: Node }> {
  const fp = sf.getFilePath();
  for (const [name, decls] of sf.getExportedDeclarations()) {
    const d = decls[0];
    if (d !== undefined && d.getSourceFile().getFilePath() === fp) {
      yield { name, decl: d };
    }
  }
}
