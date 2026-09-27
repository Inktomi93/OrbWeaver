// substrate/refusal — the share preconditions as one ordered decision; the first unmet one is the refusal.

import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES } from "@orb/contracts/identity";
import type { ShareFacts } from "@orb/server/domain/share";
import { loopbackOrigin } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { shareRefusal } from "../../../../../packages/server/src/domain/share/substrate/refusal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SETUP = "http://localhost:9999";
const PUBLIC_ADDRESS = "https://orb.example.com";

function facts(
  authMode: AuthMode,
  options: { readonly ownerNeedsPassword?: boolean; readonly bindHost?: string } = {},
): { readonly reads: string[]; readonly facts: ShareFacts } {
  const reads: string[] = [];
  return {
    reads,
    facts: {
      authMode,
      ownerNeedsPassword: (): Promise<boolean> => {
        reads.push("ownerNeedsPassword");
        return Promise.resolve(options.ownerNeedsPassword ?? false);
      },
      localSetupUrl: (): string => SETUP,
      publicAddresses: [PUBLIC_ADDRESS],
      loopbackUpstream: loopbackOrigin(options.bindHost, 8788) !== null,
    },
  };
}

const MODE_VERDICT: Record<AuthMode, string | null> = {
  "single-user": "share_single_user",
  "forward-header": "share_forward_header",
  local: null,
  oidc: "share_oidc",
};

describe("shareRefusal", () => {
  test("only local lets a relayed visitor sign in; every mode has a verdict", async () => {
    for (const mode of AUTH_MODES) {
      expect((await shareRefusal(facts(mode).facts))?.code ?? null, mode).toBe(MODE_VERDICT[mode]);
    }
  });

  test("a refused mode refuses before the owner row is read", async () => {
    const single = facts("single-user", { ownerNeedsPassword: true });
    expect((await shareRefusal(single.facts))?.code).toBe("share_single_user");
    expect(single.reads).toEqual([]);
  });

  test("an unclaimed local owner refuses with the setup address in the sentence", async () => {
    const unclaimed = facts("local", { ownerNeedsPassword: true });
    const refusal = await shareRefusal(unclaimed.facts);
    expect(refusal?.code).toBe("share_owner_unclaimed");
    expect(refusal?.message).toContain(`Open ${SETUP} on this machine`);
  });

  test("oidc refuses with the address friends already reach, and never reads the owner row", async () => {
    const oidc = facts("oidc", { ownerNeedsPassword: true });
    const refusal = await shareRefusal(oidc.facts);
    expect(refusal?.code).toBe("share_oidc");
    expect(refusal?.message).toContain(PUBLIC_ADDRESS);
    expect(oidc.reads).toEqual([]);
  });

  test("a bind to one public interface is refused: the relay would reach the app from an untrusted peer", async () => {
    const refusal = await shareRefusal(facts("local", { bindHost: "81.2.69.160" }).facts);
    expect(refusal?.code).toBe("share_bind_address");
    expect(refusal?.message).toContain("BIND_HOST");
  });

  test("a bind to one LAN interface is refused too, the same rule the IP certificate applies", async () => {
    await expect(shareRefusal(facts("local", { bindHost: "192.168.1.5" }).facts)).resolves.toMatchObject({ code: "share_bind_address" });
  });

  test("control: every-interface and loopback binds share", async () => {
    for (const bindHost of [undefined, "0.0.0.0", "::", "127.0.0.1"]) {
      expect({ bindHost, refusal: await shareRefusal(facts("local", bindHost === undefined ? {} : { bindHost }).facts) }).toEqual({ bindHost, refusal: null });
    }
  });
});
