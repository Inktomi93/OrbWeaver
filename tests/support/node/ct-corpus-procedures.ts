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

/** A served procedure whose answer waits for the test: the in-flight state is stable until `release()`. */
export interface HeldCorpusProcedure<TPath extends TrpcProcedurePath> {
  /** The one-entry route map to spread into `routeTrpc` after the served set, so this path is held. */
  readonly routes: TrpcRoutes<TPath>;
  /** Resolves once the client's request has reached the stub. */
  readonly requested: Promise<void>;
  /** Answer the held request with the server's output for the input the client sent. */
  readonly release: () => void;
}

/** Hold one procedure's request, then answer it from `caller` like {@link serveCorpusProcedures} once released. */
export function holdCorpusProcedure<const TPath extends TrpcProcedurePath>(caller: object, path: TPath): HeldCorpusProcedure<TPath> {
  const call = procedureAt(caller, path);
  const hold = trpcHold<TPath>();
  type Release = Parameters<typeof hold.release>[0];
  let sent: { readonly input: unknown } | null = null;
  const respond = (input: unknown): unknown => {
    sent = { input };
    return hold;
  };
  return {
    routes: { [path]: respond } as TrpcRoutes<TPath>,
    requested: hold.requested,
    release: (): void => {
      if (sent === null) {
        throw new Error(`${path} was released before it was requested`);
      }
      call(sent.input).then(
        (output) => hold.release(JSON.parse(JSON.stringify(output ?? null)) as Release),
        (error: unknown) => hold.release(trpcError({ code: failureCode(error), message: String(error) }) as Release),
      );
    },
  };
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
