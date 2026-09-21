// The helper MANIFEST — every kit helper, grouped by category (the `pnpm codemod list` data).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm codemod <verb>");

/**
 * Structured manifest of every helper in this kit. This is what
 * `pnpm codemod` (and the `--help` / `--list` / `--recipe` flags) read.
 *
 * Why structured: agents don't read 1600-line files. They run `pnpm codemod`,
 * see a short overview + a categorized list, and can dig into one section
 * or one recipe. The manifest's also greppable from the terminal.
 *
 * Format per entry:
 *   name     — the export name in this file
 *   summary  — one-line description (what it does)
 *   when     — one-line "use when..." pointer (when to reach for it)
 */

interface ManifestEntry {
  readonly name: string;
  readonly summary: string;
  readonly when: string;
}

interface ManifestCategory {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly ManifestEntry[];
}

export const MANIFEST: readonly ManifestCategory[] = [
  {
    id: "bootstrap",
    title: "Bootstrap & harness",
    entries: [
      {
        name: "createCodemodProject",
        summary: "Build the mutable syntax carrier with the repo's standard authored globs (src/tests/scripts).",
        when: "Always — at the start of every codemod. The harness calls it for you if you use runCodemod.",
      },
      {
        name: "runCodemod",
        summary: "The CLI harness — --apply / --dry-run flags, snapshots, diff rendering, save, and the refusal when a plan mutates a file it never declared.",
        when: "Always wrap your codemod with this. It's the only legitimate way to write changes.",
      },
      {
        name: "composePlans",
        summary: "Merge several Plans into one with a single description.",
        when: "When a logical operation involves multiple sub-plans you want shown as one line in the preview.",
      },
    ],
  },
  {
    id: "validation",
    title: "Validation & path helpers",
    entries: [
      {
        name: "assert",
        summary: "Throw CodemodError if the condition is falsy.",
        when: "For invariant checks. Surfaces uniformly in the harness output.",
      },
      {
        name: "assertPathString",
        summary: "Reject empty / non-string paths early.",
        when: "At the top of any helper that takes a path.",
      },
      {
        name: "absolutePath",
        summary: "Resolve a path against the repo root; refuse paths that escape it.",
        when: "Whenever you accept a user-supplied path. Guards against accidental rm -rf above the repo.",
      },
      {
        name: "repoRelative",
        summary: "Format a path for the preview output.",
        when: "When printing paths to the operator. Don't show absolute paths in summaries.",
      },
      {
        name: "isUnderSrc / isTestFile / siblingTestPath",
        summary: "Predicates + helpers for common file-path checks.",
        when: "Filtering / co-moving tests alongside their sources.",
      },
    ],
  },
  {
    id: "files",
    title: "File operations",
    entries: [
      {
        name: "moveFiles",
        summary: "Move files; ts-morph rewrites every relative import in the project graph.",
        when: "Restructure / reorg. The reference codemod is chat-restructure-stage1.ts.",
      },
      {
        name: "deleteFiles",
        summary: "Delete files. REQUIRES { confirm: true } — there's no second chance.",
        when: "After you've moved or absorbed a file's contents and the old path is dead.",
      },
      {
        name: "createSourceFile",
        summary: "Create a new source file with given text. Refuses to overwrite unless confirmed.",
        when: "Generating a new contract file, new front-door barrel, etc.",
      },
      {
        name: "copyFile",
        summary: "Copy a file to a new path (ts-morph fixes relative imports in the copy).",
        when: "Forking a file in two. Rare.",
      },
      {
        name: "removeEmptyDirectory",
        summary: "rm -rf a directory after a move — refuses if anything still lives there.",
        when: "Clean up after moving every file out of a substrate/ etc.",
      },
    ],
  },
  {
    id: "imports",
    title: "Import operations",
    entries: [
      {
        name: "findImporters",
        summary: "Find every ImportDeclaration with an EXACT module specifier.",
        when: "Repointing alias-path imports; symbol routing.",
      },
      {
        name: "findImportersOfFile",
        summary: "Find every importer that resolves to a given SourceFile (handles relative paths).",
        when: "Asking 'who depends on this file?' (not 'who imports this string?').",
      },
      {
        name: "findAllReferencersOfFile",
        summary: "Like findImportersOfFile but also returns re-exports, require() calls, import =.",
        when: "Audit / full-coverage sweeps.",
      },
      {
        name: "repointImports",
        summary: 'Rewrite every `from "OLD"` to `from "NEW"` in one pass.',
        when: "After a file move where the old path was an alias path.",
      },
      {
        name: "repointAliasPaths",
        summary: "Regex sweep of full file text — catches comments + dynamic import() too.",
        when: "Filling the alias-path gap ts-morph's move() leaves. The one footgun the kit can't auto-fix.",
      },
      {
        name: "addNamedImport",
        summary: 'Idempotent `import { X } from "Y"` — merges into existing declaration if present.',
        when: "Adding a new dep to a file when you don't want to write the boilerplate twice.",
      },
      {
        name: "removeNamedImport",
        summary: "Remove specific named imports; drops the declaration if it ends up empty.",
        when: "Cleaning up an unused symbol after refactoring.",
      },
      {
        name: "renameNamedImport",
        summary: "Rename one specific named import everywhere it's imported from a module.",
        when: "Upstream renamed the export and you need every consumer to match.",
      },
      {
        name: "makeImportTypeOnly",
        summary: "Flip imports to `import type` (per-specifier).",
        when: "When the value side of a symbol is going away and only the type remains.",
      },
      {
        name: "routeSymbolsByMap",
        summary: "Split one file's exports across many: route each importer to the right destination.",
        when: "Restructure stage 2 — types.ts → contract/views/params/results/errors split.",
      },
    ],
  },
  {
    id: "exports",
    title: "Export / barrel operations",
    entries: [
      {
        name: "addReExport",
        summary: 'Idempotent `export { X } from "Y"`. Merges into an existing export declaration.',
        when: "Growing a front-door barrel after lifting an internal symbol.",
      },
      {
        name: "removeReExport",
        summary: "Remove specific re-exports; drops empty declarations.",
        when: "Trimming a barrel that's outgrown its purpose.",
      },
      {
        name: "dedupeReExports",
        summary: "Walk a barrel + dedupe re-exports of the same symbol from the same source.",
        when: "After multiple codemods or hand-edits have inflated a barrel.",
      },
    ],
  },
  {
    id: "refs",
    title: "Symbol & reference discovery",
    entries: [
      {
        name: "findReferencesByName",
        summary: "Find every reference to an exported symbol across its native compiler worlds (pass ctx; alias-aware).",
        when: "Audit: 'who actually uses this exported foo()?'",
      },
      {
        name: "findExportedDeclaration",
        summary: "Look up an exported declaration by name in a file.",
        when: "Inside another helper. Usually paired with findReferencesByName / renameExportedSymbol.",
      },
      {
        name: "listExports",
        summary: "List every exported symbol with its declarations.",
        when: "Auditing what a file exposes. Useful in surface-coverage checks.",
      },
      {
        name: "findCallSites",
        summary: "Plain text match on call-expression callee text.",
        when: "Quick 'where is foo() called' when you don't need alias resolution.",
      },
    ],
  },
  {
    id: "rename",
    title: "Renames (cross-file, language-service-aware)",
    entries: [
      {
        name: "renameExportedSymbol",
        summary: "Rename an exported declaration through ctx's native compiler worlds; every authored importer is updated.",
        when: "Renaming a symbol cleanly across the whole project, including re-exports.",
      },
    ],
  },
  {
    id: "text",
    title: "Stale-node-safe text replacements",
    entries: [
      {
        name: "applyTextReplacements",
        summary: "Apply many {start,end,text} plans in end-descending order. Validates non-overlap.",
        when: "Any time you collect AST-derived plans + need to apply them without invalidating each other.",
      },
      {
        name: "replacementsForNodes",
        summary: "Snapshot AST nodes into {start,end,text} BEFORE any mutation.",
        when: "When you have a list of AST nodes + a per-node text producer. Pairs with applyTextReplacements.",
      },
    ],
  },
  {
    id: "idbrand",
    title: "ID branding (TypeID migration)",
    entries: [
      {
        name: "retypeIdAnnotations",
        summary: "Retype `chatId: string` → `chatId: ChatId` on every named param/field/var; preserves `| null`/`?`; adds the import.",

        when: "Per-entity TypeID rollout, production side — after the DB columns carry `.$type<Brand>()`. Parameterized by id names + brand.",
      },
      {
        name: "castIdInObjectLiterals",
        summary: 'Wrap fixture id string-literals (`chatId: "ch1"`, table-scoped `id: "ch1"`) in `castId<Brand>(...)`. Test-scoped.',
        when: "Per-entity TypeID rollout, test side — the literal-fixture insert/values bulk the column brand now rejects.",
      },
      {
        name: "castIdInComparisons",
        summary: 'Wrap string literals compared against a branded column (`eq(chats.id, "ch1")`, `inArray`) in `castId<Brand>(...)`.',
        when: "Per-entity TypeID rollout — WHERE-clause literals that surface as TS2769 on the operator, which the other cast passes can't see.",
      },
      {
        name: "castStringLiteralsByDiagnostic",
        summary: "Wrap every tsc-flagged string literal unassignable to the brand (call args, assignments, returns) in `castId<Brand>(...)`.",

        when: 'Run LAST — type-checker-driven mop-up of literal value sites that `retypeIdAnnotations` pushes errors to (e.g. `f(db, "ch1")`).',
      },
    ],
  },
  {
    id: "jsx",
    title: "JSX (for client codemods)",
    entries: [
      {
        name: "findJsxByTag",
        summary: "Find every JSX element with a given tag name (opening + self-closing).",
        when: "Sweeping every <OldButton> in the client.",
      },
      {
        name: "renameJsxTag",
        summary: "Rename a JSX tag; updates the opening + closing element together.",
        when: "Component rename. Pair with renameNamedImport for the import side.",
      },
      {
        name: "findJsxAttributes",
        summary: "Find every JSX attribute with a name.",
        when: "Audit / sweep specific attributes across components.",
      },
    ],
  },
  {
    id: "diagnostics",
    title: "Diagnostics",
    entries: [
      {
        name: "printDiagnostics",
        summary: "Print pre-emit diagnostics from every native compiler world selected by ctx.",
        when: "After --apply when you want to manually verify the codemod didn't break TS.",
      },
    ],
  },
] as const;

/**
 * Common recipes — the "I want to do X, what's the shape?" answer. Each
 * recipe has a name, a description, and a code snippet that compiles when
 * pasted into a real codemod. The CLI surfaces them via
 * `pnpm codemod recipes` and `pnpm codemod recipe <name>`.
 */
