// verb: signInMode. The read-only sign-in helper in Multi-user: the boot-fixed mode, where it came from and the
// install shape, with the refusal Start sharing would meet under each target mode. It names no env value but the mode.

import { SIGN_IN_TARGET_MODES } from "@orb/contracts/identity";
import type { ShareParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";
import { modeShareRefusal } from "../substrate/refusal.ts";

export function createSignInMode(ctx: ShareContext): ShareService["signInMode"] {
  // The gate runs inside the promise, so a refused caller gets a rejection like every other verb, never a sync throw.
  return ({ principal }: ShareParams) =>
    Promise.resolve().then(() => {
      ctx.requireAdmin(principal);
      return {
        mode: ctx.authMode,
        source: ctx.authModeSource,
        install: ctx.install,
        targets: SIGN_IN_TARGET_MODES.map((mode) => ({ mode, shareRefusal: modeShareRefusal(mode, ctx) })),
      };
    });
}
