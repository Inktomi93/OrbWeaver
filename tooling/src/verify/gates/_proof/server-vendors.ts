// Shared isolated-project vendor surfaces for the server-side sanctioned-home policies whose subject is a
// MEMBER declared by a third-party type module (`@trpc/server`'s procedure builder).
//
// These are real package doors in the proof workspace, resolved by the same node module walk the live tree
// uses, so a proof exercises `declaredByPackage` against an actual `/node_modules/<pkg>/` declaration home
// rather than a stub. The LOOKALIKE twin exports the same member names from a different package — that pair
// is the whole identity claim, and every policy here owes a row on both sides.
export const TRPC_SERVER_HOME = "node_modules/@trpc/server/index.d.ts";
export const RPC_LOOKALIKE_HOME = "node_modules/rpc-lookalike/index.d.ts";

const BUILDER = [
  "export interface ProcedureBuilder {",
  "  input(schema: unknown): ProcedureBuilder;",
  "  query(resolver: (opts: unknown) => unknown): unknown;",
  "  mutation(resolver: (opts: unknown) => unknown): unknown;",
  "  subscription(resolver: (opts: unknown) => unknown): unknown;",
  "}",
  "export declare const authedProcedure: ProcedureBuilder;",
  "export declare function router<Routes>(routes: Routes): Routes;",
  "",
].join("\n");

/** The tRPC server surface as a router module reads it: a chainable procedure builder plus the router mint. */
export function trpcServerProof(): Readonly<Record<string, string>> {
  return { [TRPC_SERVER_HOME]: BUILDER };
}

/** The same member names from a package that is not the home — the counterfactual half of the claim. */
export function rpcLookalikeProof(): Readonly<Record<string, string>> {
  return { [RPC_LOOKALIKE_HOME]: BUILDER };
}
