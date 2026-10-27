// Section procedures for a component spec, answered by the production server root over a corpus clone for each exact
// request. Only the named procedures are served; routeTrpc still fails the test for any other.

import { procedureAt } from "./corpus-procedure.ts";
import type { TrpcErrorCode } from "./matchers.ts";
import type { TrpcErrorMarker, TrpcInput, TrpcProcedurePath, TrpcRoutes } from "./route-trpc.ts";
import { trpcError, trpcHold } from "./route-trpc.ts";

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

/** A request held until the test lets the server answer it, or fails it. It carries no data of its own. */
export interface ServedHold {
  /** Resolves once a request has reached the hold. */
  readonly requested: Promise<void>;
  /** Let the held request through: the server answers it now, from the state it holds now. */
  readonly release: () => void;
  /** Answer the held request with a failure instead of the server's answer. */
  readonly fail: () => void;
}

interface HoldGate {
  readonly arrived: () => void;
  readonly verdict: Promise<"serve" | "fail">;
}

const holdGates = new WeakMap<ServedHold, HoldGate>();

/** A hold for {@link ServeIntercept} to return: `release()` runs the real caller, so a held request can never settle with a test's data. */
export function holdServed(): ServedHold {
  const arrived = Promise.withResolvers<void>();
  const verdict = Promise.withResolvers<"serve" | "fail">();
  const hold: ServedHold = { requested: arrived.promise, release: (): void => verdict.resolve("serve"), fail: (): void => verdict.resolve("fail") };
  holdGates.set(hold, { arrived: arrived.resolve, verdict: verdict.promise });
  return hold;
}

/**
 * A request the test fails or holds instead of answering at once, or `undefined` to let the server answer it. It can
 * only fail or delay: the data a request settles with always comes from the server.
 */
export type ServeIntercept<TPath extends TrpcProcedurePath> = (input: TrpcInput<TPath>) => TrpcErrorMarker | ServedHold | undefined;

/**
 * Serve each named procedure from `caller`, a composed root's `internalCallerFor(...)`, with the server's own
 * output for the request the client sent. The answer is held until the server settles, so it can never be a
 * fixture's guess at a page size or a filter. An `intercept` fails or holds chosen requests before the server sees them.
 */
export function serveCorpusProcedures<const TPath extends TrpcProcedurePath>(
  caller: object,
  paths: readonly TPath[],
  intercept?: ServeIntercept<NoInfer<TPath>>,
): TrpcRoutes<TPath> {
  const routes = Object.fromEntries(
    paths.map((path) => {
      const call = procedureAt(caller, path);
      const respond = (input: unknown): unknown => {
        const early = intercept?.(input as TrpcInput<TPath>);
        const hold = trpcHold<TPath>();
        // The release type is conditional on the generic path, so both settlements name it explicitly.
        type Release = Parameters<typeof hold.release>[0];
        const settle = (): void => {
          call(input).then(
            (output) => hold.release(JSON.parse(JSON.stringify(output ?? null)) as Release),
            (error: unknown) => hold.release(trpcError({ code: failureCode(error), message: String(error) }) as Release),
          );
        };
        const gate = early === undefined || !("release" in early) ? undefined : holdGates.get(early);
        if (early !== undefined && gate === undefined) {
          return early;
        }
        if (gate === undefined) {
          settle();
        } else {
          gate.arrived();
          gate.verdict.then(
            (verdict) => (verdict === "serve" ? settle() : hold.release(trpcError() as Release)),
            () => hold.release(trpcError() as Release),
          );
        }
        return hold;
      };
      return [path, respond];
    }),
  );
  return routes as TrpcRoutes<TPath>;
}
