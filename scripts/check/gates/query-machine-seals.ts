import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const EXEMPT_DATA = /\/packages\/client\/src\/data\//u;
const EXEMPT_COLLECTION = /\/packages\/client\/src\/data\/create-collection-surface\.ts$/u;
const EXEMPT_TEST = /\.test\.tsx?$/u;

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
      ctx.report(node, { token: "useInfiniteQuery", offset: 0 });
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
  ],
};
