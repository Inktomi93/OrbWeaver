// share.signInMode: owner or admin; the boot-fixed mode, its source and install shape, and per target mode the refusal
// Start sharing answers with, so the helper and a refused start say the same sentence.

import type { AuthMode, ShareRefusalNotice, SignInModeView, SignInTargetMode } from "@orb/contracts/identity";
import { SIGN_IN_TARGET_MODES, signInModeViewSchema } from "@orb/contracts/identity";
import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, shareHarness } from "../_support.ts";

const OIDC_ADDRESS = "https://orbweaver.example.com";

// What a refused owner start answers with under `mode`.
async function startRefusal(mode: AuthMode, publicAddresses: readonly string[] = []): Promise<{ readonly code: string; readonly message: string }> {
  const refused = await shareHarness({ authMode: mode, publicAddresses })
    .share.start({ principal: caller("owner") })
    .catch((error: unknown) => error);
  if (!(refused instanceof DomainOperationError)) {
    throw new Error(`a start under ${mode} was not refused`);
  }
  return { code: refused.code, message: refused.message };
}

function target(view: SignInModeView, mode: SignInTargetMode): ShareRefusalNotice | null | undefined {
  return view.targets.find((row) => row.mode === mode)?.shareRefusal;
}

describe("share.signInMode", () => {
  test("the owner and an admin read the mode, its source, the install shape and one row per target mode", async () => {
    for (const role of ["owner", "admin"] as const) {
      const h = shareHarness({ authMode: "single-user", authModeSource: "process-env", install: "container" });
      const view = await h.share.signInMode({ principal: caller(role) });
      expect(view).toMatchObject({ mode: "single-user", source: "process-env", install: "container" });
      expect(view.targets.map((row) => row.mode)).toEqual(SIGN_IN_TARGET_MODES);
      expect(h.calls, role).toEqual([]);
    }
  });

  test("a user is refused and learns nothing", async () => {
    const h = shareHarness({ authMode: "local" });
    await expect(h.share.signInMode({ principal: caller("user") })).rejects.toBeInstanceOf(DomainForbiddenError);
  });

  test("each target's refusal is the sentence a start under that mode answers with; local shares", async () => {
    const view = await shareHarness({ authMode: "single-user" }).share.signInMode({ principal: caller("owner") });
    expect(target(view, "local")).toBeNull();
    expect(target(view, "forward-header")).toEqual(await startRefusal("forward-header"));
    expect(target(view, "oidc")).toEqual(await startRefusal("oidc"));
  });

  test("the running oidc box names its own redirect address; another mode's oidc row names none of its addresses", async () => {
    const oidc = await shareHarness({ authMode: "oidc", publicAddresses: [OIDC_ADDRESS] }).share.signInMode({ principal: caller("owner") });
    expect(target(oidc, "oidc")).toEqual(await startRefusal("oidc", [OIDC_ADDRESS]));
    expect(target(oidc, "oidc")?.message).toContain(OIDC_ADDRESS);

    // A local box's public addresses are its ALLOWED_HOSTS names, which an identity provider never returns people to.
    const local = await shareHarness({ authMode: "local", publicAddresses: ["https://nas.example.com"] }).share.signInMode({ principal: caller("owner") });
    expect(target(local, "oidc")?.message).not.toContain("nas.example.com");
    expect(target(local, "oidc")).toEqual(await startRefusal("oidc"));
  });

  test("the view parses under the strict wire schema and carries no secret-shaped value", async () => {
    const view = await shareHarness({ authMode: "oidc", publicAddresses: [OIDC_ADDRESS] }).share.signInMode({ principal: caller("admin") });
    expect(signInModeViewSchema.parse(view)).toEqual(view);
    const wire = JSON.stringify(view);
    for (const secret of ["SESSION_SECRET", "CREDENTIALS_KEY", "OIDC_CLIENT_SECRET", "LOCAL_INITIAL_PASSWORD", "password"]) {
      expect(wire).not.toContain(secret);
    }
  });
});
