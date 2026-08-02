// Gate: query-machine-seals (client-architecture-lockdown.md §14/§16 G9) — `useMutation` rides
// createEntityMutation and `useInfiniteQuery` rides createCollectionSurface; a raw import outside the data/
// seals hand-rolls or skips the belt.
//
// TWO-SIDED (gate-hub #10): the `useInfiniteQuery` exemption is a SINGLE NAMED FILE — the sole paginated-
// browse factory — so it is checked at the strong grain: RED when that file has left the project OR no
// longer imports `useInfiniteQuery` (the factory moved and the exemption is now pointing at nothing, while
// the real home goes unsealed). The `data/` dir exemption stays at the honest weak grain (the tier is the
// seal home; zero raw mutations inside it is the healthy state, not a dead row) — a dir matching no file is
// RED. `.test.tsx?` is SCOPE, not an exemption: nothing to ratchet. The arms self-guard on a REAL-TREE
// ANCHOR (gate-hub #11): the read-side boundary that lives beside these seals.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const EXEMPT_DATA = /\/packages\/client\/src\/data\//u;
const EXEMPT_COLLECTION = /\/packages\/client\/src\/data\/create-collection-surface\.ts$/u;
const EXEMPT_TEST = /\.test\.tsx?$/u;

const GATE_SELF = "scripts/check/gates/query-machine-seals.ts";
/** Real-tree anchor (gate-hub #11): the read-side boundary that lives beside these seals. Deliberately not
 *  one of the seal files themselves — those are example subjects here. */
const ANCHOR = "packages/client/src/data/query-boundary.tsx";
const COLLECTION_REL = "packages/client/src/data/create-collection-surface.ts";
const INFINITE = "useInfiniteQuery";
const STALE_COLLECTION_GONE = "stale EXEMPT_COLLECTION — the sole paginated-browse factory is no longer in the project (ratchet down): ";
const STALE_COLLECTION_UNUSED =
  "stale EXEMPT_COLLECTION — the named factory no longer imports `useInfiniteQuery`, so the exemption " +
  "points at nothing while the file that DOES own the raw call goes unsealed (ratchet down): ";
const STALE_DATA_DIR =
  "stale EXEMPT_DATA — the pattern matches NO file in the project (ratchet down): the seal tier was renamed or deleted, so the row exempts nothing while reading as live law: ";

export const gate: GateDescriptor = {
  name: "query-machine-seals",
  docRow: "client-architecture-lockdown.md §14/§16 G9",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "useMutation or useInfiniteQuery imported from @tanstack/react-query outside data/ seals — every mutation rides createEntityMutation; createCollectionSurface is the sole paginated-browse factory. Raw calls hand-roll or skip the belt. See client-architecture-lockdown.md §14/§16 G9.",
  fix: "use createEntityMutation or createCollectionSurface",
  scanRoot: () => true,
  kinds: [SyntaxKind.ImportDeclaration],
  visit: (node, sf, ctx) => {
    if (!Node.isImportDeclaration(node)) {
      return;
    }
    const moduleSpecifier = node.getModuleSpecifierValue();
    if (moduleSpecifier !== "@tanstack/react-query") {
      return;
    }

    const namedImports = node.getImportClause()?.getNamedImports() || [];
    const importNames = namedImports.map((i) => i.getName());
    const p = `/${sf.getFilePath()}`;

    if (importNames.includes("useMutation") && !(EXEMPT_DATA.test(p) || EXEMPT_TEST.test(p))) {
      ctx.report(node, { token: "useMutation", offset: 0 });
    }

    if (importNames.includes("useInfiniteQuery") && !(EXEMPT_COLLECTION.test(p) || EXEMPT_TEST.test(p))) {
      ctx.report(node, { token: INFINITE, offset: 0 });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    const files = ctx.project.getSourceFiles();
    if (!files.some((sf) => EXEMPT_DATA.test(`/${sf.getFilePath()}`))) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_DATA_DIR}${EXEMPT_DATA.source} — the exemptions live in scripts/check/gates/query-machine-seals.ts`,
      });
    }
    const collection = ctx.project.getSourceFile(`${ctx.root}/${COLLECTION_REL}`);
    if (collection === undefined) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_COLLECTION_GONE}"${COLLECTION_REL}" — delete or re-point the row in scripts/check/gates/query-machine-seals.ts`,
      });
      return;
    }
    const importsInfinite = collection
      .getImportDeclarations()
      .some((d) => d.getModuleSpecifierValue() === "@tanstack/react-query" && d.getNamedImports().some((n) => n.getName() === INFINITE));
    if (!importsInfinite) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_COLLECTION_UNUSED}"${COLLECTION_REL}" — re-point the row in scripts/check/gates/query-machine-seals.ts`,
      });
    }
  },
  mustFlag: [
    {
      files: "import { useMutation } from '@tanstack/react-query';\n",
      at: "packages/client/src/components/foo.tsx",
      why: "useMutation outside data directory",
    },
    {
      files: "import { useInfiniteQuery } from '@tanstack/react-query';\n",
      at: "packages/client/src/data/other.ts",
      why: "useInfiniteQuery outside create-collection-surface.ts",
    },
    {
      files: {
        [ANCHOR]: "export const QueryBoundary = null;\n",
        [COLLECTION_REL]: "export const createCollectionSurface = null;\n",
      },
      expect: { count: 1, messageIncludes: "no longer imports `useInfiniteQuery`" },
      why: "THE STALE ARM at the strong grain: the anchor is loaded and the named factory still exists but has stopped importing the raw hook — the exemption now points at nothing while whatever DOES own the call goes unsealed",
    },
    {
      files: {
        [ANCHOR]: "export const QueryBoundary = null;\n",
      },
      expect: { count: 1, messageIncludes: "no longer in the project" },
      why: "the other staleness: the named factory file is gone entirely — path rot ratchets down too (the data/ dir row still matches the anchor, so it stays)",
    },
  ],
  mustPass: [
    {
      files: "import { useMutation } from '@tanstack/react-query';\n",
      at: "packages/client/src/data/create-entity-mutation.ts",
      why: "useMutation in data directory",
    },
    {
      files: "import { useInfiniteQuery } from '@tanstack/react-query';\n",
      at: "packages/client/src/data/create-collection-surface.ts",
      why: "useInfiniteQuery in create-collection-surface.ts",
    },
    {
      files: "import { useMutation, useInfiniteQuery } from '@tanstack/react-query';\n",
      at: "packages/client/src/components/foo.test.tsx",
      why: "exempt in tests",
    },
    {
      files: {
        [ANCHOR]: "export const QueryBoundary = null;\n",
        [COLLECTION_REL]: "import { useInfiniteQuery } from '@tanstack/react-query';\nexport const c = useInfiniteQuery;\n",
      },
      why: "both exemptions STILL EARNED, judged against the real-tree anchor: the seal tier matches files and the named factory owns the raw hook, so neither stale arm fires",
    },
  ],
};
