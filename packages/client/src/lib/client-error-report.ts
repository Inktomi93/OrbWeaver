// `buildClientErrorPayload` — the pure PD-58 wire-payload builder for a caught client error (UI-Arch
// §2.1 lib/: cross-cutting display/util). Deliberately tRPC-free: `data/trpc.ts` already imports FROM
// `lib/` (`IS_DEV`/`formatTrpcOp`), so `lib/` sits BELOW `data/` in the one-directional client cake — a
// module here reaching back into `#data` for the tRPC client would be the exact cycle that discipline
// forbids. The actual wire call (`trpcClient.clientError.mutate(...)`) is wired at the composition root
// (main.tsx), which already holds the client; this module only shapes the payload.
//
// `url` is INJECTED (not read from `globalThis.location` in here) — same determinism-at-the-edge
// discipline `Spine-Testing.md §3` applies to the clock/id seams: a function that reaches for an ambient
// DOM global can't run under the node unit lane (no jsdom — Spine-Testing.md §7 bans Vitest browser
// mode), so the ONE `location` read lives at the real call site (main.tsx, which nothing imports and so
// never runs under a test), keeping this builder plain-data-in/plain-data-out and cheaply testable.
// Path+search only (no origin) — mirrors `long-task-tracer.ts`'s `route()` helper (same same-origin app,
// so the origin is redundant on every line; smaller log lines besides).

/** The `clientError` procedure's input shape (server: transport/trpc/router.ts). */
export interface ClientErrorPayload {
  readonly message: string;
  readonly stack?: string;
  readonly ownerStack?: string;
  readonly url: string;
}

/** Build the report payload from a caught render error + its (DEV-only, possibly null) owner stack. */
export function buildClientErrorPayload(
  error: Error,
  ownerStack: string | null,
  url: string,
): ClientErrorPayload {
  return {
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(ownerStack === null ? {} : { ownerStack }),
    url,
  };
}
