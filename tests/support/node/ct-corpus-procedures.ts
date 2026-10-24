// Section procedures for a component spec, answered by the production server root over a corpus clone for each exact
// request. Only the named procedures are served; routeTrpc still fails the test for any other.
import type { TrpcErrorCode } from "./matchers.ts";
import type { TrpcProcedurePath, TrpcRoutes } from "./route-trpc.ts";
import { trpcError, trpcHold } from "./route-trpc.ts";

type Procedure = (input: unknown) => Promise<unknown>;

function procedureAt(caller: object, path: string): Procedure {
  const [namespace, name] = path.split(".");
  const group: unknown = namespace === undefined ? undefined : Reflect.get(caller, namespace);
  // A tRPC caller's namespaces are proxy functions, so a namespace is any non-null object or function.
  const reachable = (typeof group === "object" && group !== null) || typeof group === "function";
  const procedure: unknown = reachable && name !== undefined ? Reflect.get(group, name) : undefined;
  if (typeof procedure !== "function") {
    throw new Error(`The corpus root has no procedure ${path}`);
  }
  return (input) => Reflect.apply(procedure, group, [input]) as Promise<unknown>;
}

function failureCode(error: unknown): TrpcErrorCode {
  const code: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  return typeof code === "string" ? (code as TrpcErrorCode) : "INTERNAL_SERVER_ERROR";
}

/**
 * Serve each named procedure from `caller`, a composed root's `internalCallerFor(...)`, with the server's own
 * output for the request the client sent. The answer is held until the server settles, so it can never be a
 * fixture's guess at a page size or a filter.
 */
export function serveCorpusProcedures<const TPath extends TrpcProcedurePath>(caller: object, paths: readonly TPath[]): TrpcRoutes<TPath> {
  const routes = Object.fromEntries(
    paths.map((path) => {
      const call = procedureAt(caller, path);
      const respond = (input: unknown): unknown => {
        const hold = trpcHold<TPath>();
        // The release type is conditional on the generic path, so both settlements name it explicitly.
        type Release = Parameters<typeof hold.release>[0];
        call(input).then(
          (output) => hold.release(JSON.parse(JSON.stringify(output ?? null)) as Release),
          (error: unknown) => hold.release(trpcError({ code: failureCode(error), message: String(error) }) as Release),
        );
        return hold;
      };
      return [path, respond];
    }),
  );
  return routes as TrpcRoutes<TPath>;
}
