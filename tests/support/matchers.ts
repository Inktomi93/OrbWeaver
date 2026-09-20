// tests/support/matchers — the custom matchers (core/Spine-Testing.md §4: hard cap 5; each must encode an
// invariant whose diff message beats a generic assertion). ONE module: runtime impl + the TS `declare
// module` augmentation. Registered by side-effect import from `support/fixtures.ts` (the barrel every
// test imports `test`/`expect` from — gate: test-fixture-imports), so any test using the composed `test`
// has them live.
//
// Three matchers today (2 slots free):
//   • toThrowTRPCError(code) — closes the silent-pass class where `.rejects.toThrow()` (no arg) accepts
//     ANY rejection (an FK violation, a null deref) and an auth-gate test passes despite the wrong error.
//   • toThrowProviderError(kind) — the typed provider-failure surface (`ProviderError`, @orb/inference'
//     one error class across all seven roles — orbweaver's ChatError descendant). Pins the class AND its
//     stable `kind` discriminant, replacing message-regex assertions that rot on rewording.
//   • toExitWith(code) — the tooling exit contract (0 clean · 1 violations · 2 tool-broke · 3 misuse,
//     @orb/tooling/_shared/exit-contract) over a runCli result: names BOTH codes by contract name and
//     prints stdout/stderr tails on mismatch — a bare `expect(res.code).toBe(0)` failure prints `1 ≠ 0`
//     and nothing else, which is why the class exists (docs/architecture/core/Core-Tooling-Law.md §5.2).
//
// CROSS-REALM NOTE: `@trpc/server` is NOT a root dependency (only `packages/server` declares it), so this
// file cannot `instanceof TRPCError`. It duck-types `e.name === "TRPCError" && typeof e.code === "string"`
// — tRPC's OWN sanctioned cross-realm check (`getTRPCErrorFromUnknown`, trpc/trpc#4848) — and derives the
// code union from `classifyDomainError`'s return type instead of `TRPC_ERROR_CODE_KEY`, so a typo'd code
// is still a compile error.

// RUNTIME-LIGHT ON PURPOSE: this module is side-effect-imported by the fixtures barrel, which EVERY
// test file imports — so its only static runtime dependency is vitest. `ProviderError` (the whole
// `@orb/server` graph, including the throw-on-misconfig `foundation/env` parse) is dynamic-imported
// inside the matcher body: a kit/ui/client unit test that never asserts a provider failure never loads
// the server graph. The server types ride in `import type` (erased).

import type { ProviderErrorKind } from "@orb/inference";
import type { classifyDomainError } from "@orb/server/transport/trpc";
import { expect } from "vitest";

/** The tRPC error-code union, derived through the transport classifier (see the cross-realm note). */
export type TrpcErrorCode = NonNullable<ReturnType<typeof classifyDomainError>>["code"];

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

interface TrpcErrorLike {
  readonly code: string;
  readonly message: string;
}

/** tRPC's own cross-realm duck-type (`getTRPCErrorFromUnknown`): an Error named "TRPCError" with a
 *  string `code`. Never `instanceof` — `@trpc/server` doesn't resolve from the root test context. */
function asTrpcError(e: unknown): TrpcErrorLike | null {
  if (e instanceof Error && e.name === "TRPCError" && "code" in e) {
    const code: unknown = (e as Error & { code?: unknown }).code;
    if (typeof code === "string") {
      return { code, message: e.message };
    }
  }
  return null;
}

const EXCERPT_MAX = 200;

function excerpt(message: string): string {
  return message.length > EXCERPT_MAX ? `${message.slice(0, EXCERPT_MAX)}…` : message;
}

function stringify(v: unknown): string {
  try {
    return excerpt(JSON.stringify(v) ?? String(v));
  } catch {
    return String(v);
  }
}

/** Normalize the assertion target (a Promise or a thunk) to a Promise. */
function toPromise(received: Promise<unknown> | (() => unknown)): Promise<unknown> {
  return typeof received === "function" ? Promise.resolve().then(received) : received;
}

/** The runCli outcome shape (structural — the one home is `SpawnNicedResult`,
 *  `@orb/tooling/_shared/proc`; duck-typed here so this module stays runtime-light). */
interface CliResultLike {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const TAIL_MAX = 400;

function tail(label: string, s: string): string {
  const t = s.length > TAIL_MAX ? `…${s.slice(-TAIL_MAX)}` : s;
  return t.trim() === "" ? "" : `\n${label}: ${t}`;
}

expect.extend({
  async toExitWith(received: CliResultLike, code: number): Promise<MatcherResult> {
    // Dynamic on purpose (the runtime-light law) — module-cached after the first use.
    const { describeExit } = await import("@orb/tooling/_shared/exit-contract");
    const pass = received.code === code;
    return {
      pass,
      message: (): string =>
        pass
          ? `expected the CLI NOT to exit ${describeExit(code)}, but it did`
          : `expected exit ${describeExit(code)}, got ${received.code === null ? "null (killed/timeout)" : describeExit(received.code)}${tail("stdout", received.stdout)}${tail("stderr", received.stderr)}`,
    };
  },

  async toThrowTRPCError(received: Promise<unknown> | (() => unknown), code: TrpcErrorCode): Promise<MatcherResult> {
    let resolved: unknown;
    try {
      resolved = await toPromise(received);
    } catch (e) {
      const trpcError = asTrpcError(e);
      if (trpcError === null) {
        const got = (e as Error | null)?.constructor?.name ?? typeof e;
        const message = (e as Error | null)?.message ?? "";
        return {
          pass: false,
          message: (): string => `expected TRPCError "${code}", but got ${got}: ${excerpt(message)}`,
        };
      }
      const pass = trpcError.code === code;
      return {
        pass,
        message: (): string =>
          pass
            ? `expected TRPCError NOT to be "${code}", but it was`
            : `expected TRPCError "${code}", but got "${trpcError.code}" — ${excerpt(trpcError.message)}`,
      };
    }
    return {
      pass: false,
      message: (): string => `expected the promise to reject with TRPCError "${code}", but it resolved with: ${stringify(resolved)}`,
    };
  },

  async toThrowProviderError(received: Promise<unknown> | (() => unknown), kind: ProviderErrorKind): Promise<MatcherResult> {
    // Dynamic on purpose (see the header note) — module-cached after the first use.
    const { ProviderError } = await import("@orb/inference");
    let resolved: unknown;
    try {
      resolved = await toPromise(received);
    } catch (e) {
      if (!(e instanceof ProviderError)) {
        const got = (e as Error | null)?.constructor?.name ?? typeof e;
        const message = (e as Error | null)?.message ?? "";
        return {
          pass: false,
          message: (): string => `expected ProviderError "${kind}", but got ${got}: ${excerpt(message)}`,
        };
      }
      const pass = e.kind === kind;
      return {
        pass,
        message: (): string =>
          pass ? `expected ProviderError NOT to be "${kind}", but it was` : `expected ProviderError "${kind}", but got "${e.kind}" — ${excerpt(e.message)}`,
      };
    }
    return {
      pass: false,
      message: (): string => `expected the promise to reject with ProviderError "${kind}", but it resolved with: ${stringify(resolved)}`,
    };
  },
});

// ── Type augmentation ────────────────────────────────────────────────────────────────────────────────
// Vitest 4's signature is `interface Matchers<T = any>` — ONE generic param (the value type). Augmenting
// with a different arity fails with "All declarations of 'Matchers' must have identical type parameters."
// Living in this .ts file (not a .d.ts) guarantees TS picks it up the moment matchers.ts is imported.

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: matches Vitest's own `Matchers<T = any>` signature — a different arity is a compile error.
  interface Matchers<T = any> {
    /**
     * Assert the awaited Promise (or thunk) rejects with a tRPC error whose `.code` equals the given
     * value. Specific where `.rejects.toThrow()` is not — the wrong error can no longer pass.
     *
     * `await expect(otherCaller.persona.get({ personaId })).toThrowTRPCError("NOT_FOUND");`
     */
    toThrowTRPCError: (code: TrpcErrorCode) => Promise<void>;
    /**
     * Assert the awaited Promise (or thunk) rejects with a `ProviderError` whose `.kind` equals the
     * given value — the typed provider-failure discriminant, not a message regex.
     *
     * `await expect(executor.runChatTurn(req)).toThrowProviderError("rate_limit");`
     */
    toThrowProviderError: (kind: ProviderErrorKind) => Promise<void>;
    /**
     * Assert a `runCli` result's exit code against the tooling exit contract; a mismatch prints both
     * codes BY CONTRACT NAME plus bounded stdout/stderr tails.
     *
     * `await expect(await runCli("snap", ["--help"])).toExitWith(EXIT.clean);`
     */
    toExitWith: (code: number) => Promise<void>;
  }
}
