// Which named types in a shape packages/contracts cannot hold, by where each is declared. Contracts reaches kit, zod,
// the standard library and the repository's ambient declarations. A server type is domain data that moves with the
// shape; a platform global, an `@orb/db` or an `@orb/inference` type is a runtime type that stays with its owner.
import ts from "typescript";

const CONTRACTS_REACH = [
  /\/packages\/(?:contracts|kit)\/src\//u,
  /\/typescript\/lib\/lib\.(?!dom)/u,
  /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:zod|@total-typescript\/ts-reset)\//u,
];
const FOREIGN_HOMES = [
  { kind: "server", pattern: /\/packages\/(?:server|default-content)\/src\//u },
  { kind: "db", pattern: /\/packages\/db\/src\/|\/drizzle-orm\//u },
  { kind: "inference", pattern: /\/packages\/inference\/src\//u },
] as const;
/** `platform`: a global the runtime supplies (`AbortSignal`, `Buffer`) or another library outside contracts' reach. */
export type ForeignKind = (typeof FOREIGN_HOMES)[number]["kind"] | "platform";
export type ForeignTypes = Readonly<Record<ForeignKind, readonly string[]>>;

/** The `@orb/db` types that carry a database handle or an unexecuted statement across a boundary. */
export const DB_HANDLE_TYPES: ReadonlySet<string> = new Set([
  "DatabaseHandle",
  "BatchHandle",
  "StatementToken",
  "AwaitableStatementToken",
  "SQL",
  "DbAssemblyInput",
]);

// A root ambient declaration (`reset.d.ts`, `platform.d.ts`) sits outside every package and every library.
const isAmbient = (file: string): boolean => file.endsWith(".d.ts") && !file.includes("/packages/") && !file.includes("/node_modules/");

function foreignKind(file: string): ForeignKind | null {
  const path = file.replaceAll("\\", "/");
  if (isAmbient(path) || CONTRACTS_REACH.some((pattern) => pattern.test(path))) {
    return null;
  }
  return FOREIGN_HOMES.find(({ pattern }) => pattern.test(path))?.kind ?? "platform";
}

/** A symbol through its import alias to the declaration it names. */
export const aliased = (checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined =>
  // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
  symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

/** The named types `node` mentions that packages/contracts cannot reach, by kind. */
export function foreignTypes(checker: ts.TypeChecker, node: ts.Node): ForeignTypes {
  const found: Record<ForeignKind, Set<string>> = { server: new Set(), db: new Set(), inference: new Set(), platform: new Set() };
  const followed = new Set<ts.Node>();
  const classify = (reference: ts.TypeReferenceNode, declaration: ts.Declaration): void => {
    // A rename (`type SideGenSampling = RolePresetParams`) is classified at the type it names.
    if (ts.isTypeAliasDeclaration(declaration) && ts.isTypeReferenceNode(declaration.type)) {
      if (!followed.has(declaration)) {
        followed.add(declaration);
        visit(declaration.type);
      }
      return;
    }
    const kind = foreignKind(declaration.getSourceFile().fileName);
    if (kind !== null) {
      found[kind].add(reference.typeName.getText());
    }
  };
  const visit = (child: ts.Node): void => {
    if (ts.isTypeReferenceNode(child)) {
      for (const declaration of aliased(checker, checker.getSymbolAtLocation(child.typeName))?.declarations ?? []) {
        classify(child, declaration);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return { server: [...found.server].sort(), db: [...found.db].sort(), inference: [...found.inference].sort(), platform: [...found.platform].sort() };
}

export const mergeForeignTypes = (parts: readonly ForeignTypes[]): ForeignTypes => ({
  server: [...new Set(parts.flatMap((part) => part.server))].sort(),
  db: [...new Set(parts.flatMap((part) => part.db))].sort(),
  inference: [...new Set(parts.flatMap((part) => part.inference))].sort(),
  platform: [...new Set(parts.flatMap((part) => part.platform))].sort(),
});

/** The runtime types a shape names: they stay with their owners, so the shape splits rather than moving whole. */
export const runtimeTypes = (foreign: ForeignTypes): readonly string[] => [...foreign.platform, ...foreign.db, ...foreign.inference];

export const passesDbHandle = (foreign: ForeignTypes): boolean => foreign.db.some((name) => DB_HANDLE_TYPES.has(name.replace(/^.*\./u, "")));

/** A split is done when the signature names runtime types and no server data: its data already comes from contracts.
 *  A db handle never counts as done; the ledger decides whether its batch is a ruled joint batch. */
export const isSplitSignature = (foreign: ForeignTypes): boolean => runtimeTypes(foreign).length > 0 && foreign.server.length === 0 && !passesDbHandle(foreign);

export function describeForeignTypes(foreign: ForeignTypes): string {
  const labels: Readonly<Record<ForeignKind, string>> = { server: "data to contracts", platform: "platform", db: "@orb/db", inference: "@orb/inference" };
  return (Object.keys(labels) as ForeignKind[])
    .filter((kind) => foreign[kind].length > 0)
    .map((kind) => `${labels[kind]}: ${foreign[kind].join(", ")}`)
    .join("; ");
}
