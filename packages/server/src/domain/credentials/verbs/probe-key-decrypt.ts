import { userCredentials } from "@orb/db";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { decryptSealed } from "../substrate/decrypt";

/** Boot probe: decrypts the FIRST stored credential row to catch a rotated/lost CREDENTIALS_KEY vs EXISTING ciphertext. */
export function createProbeKeyDecrypt(
  ctx: CredentialContext,
): CredentialsService["probeKeyDecrypt"] {
  return async (): Promise<boolean> => {
    if (!ctx.box.enabled) {
      return true; // No key to probe
    }

    const rows = await ctx.db
      .select({
        ownerId: userCredentials.ownerId,
        provider: userCredentials.provider,
        ciphertext: userCredentials.ciphertext,
        iv: userCredentials.iv,
        tag: userCredentials.tag,
      })
      .from(userCredentials)
      .limit(1);

    if (rows.length === 0) {
      return true; // No credentials to test against
    }

    const r = rows[0];
    if (r === undefined) {
      return true;
    }

    const sealed = {
      ciphertext: r.ciphertext,
      iv: r.iv,
      tag: r.tag,
    };

    const decrypted = decryptSealed(ctx.box, sealed, aadFor(r.ownerId, r.provider));
    return decrypted !== null;
  };
}
