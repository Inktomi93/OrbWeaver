// The boot owner claim code (D258). Only its SHA-256 is held, and a presented code is compared in constant time, so neither
// the process heap nor response timing hands out the code the operator's log printed.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OwnerClaimCode } from "./contract.ts";

const CODE_BYTES = 32;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** A claim code holder with no live code; the boot calls `issue` while the owner is unclaimed. */
export function createOwnerClaimCode(): OwnerClaimCode {
  let live: Buffer | null = null;
  const held = new Set<string>();
  return {
    issue: (): string => {
      const code = randomBytes(CODE_BYTES).toString("base64url");
      live = digest(code);
      held.clear();
      return code;
    },
    hold: (state: string, presented: string): boolean => {
      if (live === null || !timingSafeEqual(digest(presented), live)) {
        return false;
      }
      held.add(state);
      return true;
    },
    redeem: (state: string): boolean => {
      if (!held.delete(state) || live === null) {
        return false;
      }
      live = null;
      held.clear();
      return true;
    },
  };
}
