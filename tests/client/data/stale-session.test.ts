// Stale-session recovery belt (#23b): a mid-session tRPC UNAUTHORIZED hard-redirects to /login exactly ONCE;
// any other error (FORBIDDEN / leak-free NOT_FOUND / a plain throw), and being already on /login, are no-ops.
// The one-shot guard is module state, so each case re-imports a fresh module via `vi.resetModules()`.

import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const STALE_SESSION_MODULE = "../../../packages/client/src/data/stale-session.ts";
const UNAUTHORIZED = { data: { code: "UNAUTHORIZED" } };

/** Re-import the module so its one-shot `recovering` flag starts fresh for each assertion. */
async function freshRecover(): Promise<(error: unknown) => void> {
  vi.resetModules();
  const mod = await import(STALE_SESSION_MODULE);
  return mod.recoverIfStaleSession as (error: unknown) => void;
}

/** Stub `globalThis.location` with a spy `assign` and a controllable `pathname`. */
function stubLocation(pathname: string): ReturnType<typeof vi.fn> {
  const assign = vi.fn();
  vi.stubGlobal("location", { pathname, assign });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recoverIfStaleSession (#23b)", () => {
  test("an UNAUTHORIZED tRPC error hard-redirects to /login", async () => {
    const assign = stubLocation("/");
    const recover = await freshRecover();
    recover(UNAUTHORIZED);
    expect(assign).toHaveBeenCalledExactlyOnceWith("/login");
  });

  test("a burst of 401s redirects at most ONCE (loop guard)", async () => {
    const assign = stubLocation("/");
    const recover = await freshRecover();
    recover(UNAUTHORIZED);
    recover(UNAUTHORIZED);
    recover(UNAUTHORIZED);
    expect(assign).toHaveBeenCalledOnce();
  });

  test("already on /login → no redirect (avoids the loop)", async () => {
    const assign = stubLocation("/login");
    const recover = await freshRecover();
    recover(UNAUTHORIZED);
    expect(assign).not.toHaveBeenCalled();
  });

  test("a non-UNAUTHORIZED error (FORBIDDEN / NOT_FOUND / plain throw) is a no-op", async () => {
    const assign = stubLocation("/");
    const recover = await freshRecover();
    recover({ data: { code: "FORBIDDEN" } });
    recover({ data: { code: "NOT_FOUND" } });
    recover(new Error("network blip"));
    expect(assign).not.toHaveBeenCalled();
  });
});
