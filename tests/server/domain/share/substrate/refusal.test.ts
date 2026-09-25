// substrate/refusal — the share preconditions as one ordered decision; the first unmet one is the refusal.

import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES } from "@orb/contracts/identity";
import type { ShareFacts } from "@orb/server/domain/share";
import { describe } from "vitest";
import { shareRefusal } from "../../../../../packages/server/src/domain/share/substrate/refusal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SETUP = "http://localhost:9999";

function facts(
  authMode: AuthMode,
  options: { readonly inContainer?: boolean; readonly ownerNeedsPassword?: boolean } = {},
): { readonly reads: string[]; readonly facts: ShareFacts } {
  const reads: string[] = [];
  return {
    reads,
    facts: {
      authMode,
      inContainer: options.inContainer ?? false,
      ownerNeedsPassword: (): Promise<boolean> => {
        reads.push("ownerNeedsPassword");
        return Promise.resolve(options.ownerNeedsPassword ?? false);
      },
      localSetupUrl: (): string => SETUP,
    },
  };
}

const MODE_VERDICT: Record<AuthMode, string | null> = {
  "single-user": "share_single_user",
  "forward-header": "share_forward_header",
  local: null,
  oidc: null,
};

describe("shareRefusal", () => {
  test("only local and oidc let a relayed visitor sign in; every mode has a verdict", async () => {
    for (const mode of AUTH_MODES) {
      expect((await shareRefusal(facts(mode).facts))?.code ?? null, mode).toBe(MODE_VERDICT[mode]);
    }
  });

  test("the mode refusal comes before the container one, and the container one before the owner read", async () => {
    const single = facts("single-user", { inContainer: true, ownerNeedsPassword: true });
    expect((await shareRefusal(single.facts))?.code).toBe("share_single_user");
    const boxed = facts("local", { inContainer: true, ownerNeedsPassword: true });
    expect((await shareRefusal(boxed.facts))?.code).toBe("share_in_container");
    expect(boxed.reads).toEqual([]);
  });

  test("an unclaimed local owner refuses with the setup address in the sentence", async () => {
    const unclaimed = facts("local", { ownerNeedsPassword: true });
    const refusal = await shareRefusal(unclaimed.facts);
    expect(refusal?.code).toBe("share_owner_unclaimed");
    expect(refusal?.message).toContain(`Open ${SETUP} on this machine`);
  });

  test("oidc has no first-run claim, so the owner row is never read there", async () => {
    const oidc = facts("oidc", { ownerNeedsPassword: true });
    expect(await shareRefusal(oidc.facts)).toBeNull();
    expect(oidc.reads).toEqual([]);
  });
});
