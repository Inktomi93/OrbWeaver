import { userCredentials } from "@orb/db";
import type { CredentialContext } from "../context.ts";
import { CredentialsDecryptError } from "../contract/errors.ts";
import type { CredentialsService } from "../contract/service.ts";
import { aadFor } from "../persistence/aad.ts";
import { decryptSealed } from "../substrate/decrypt.ts";

/** Boot probe: decrypts the FIRST stored credential row to catch a rotated/lost CREDENTIALS_KEY vs EXISTING ciphertext. */
export function createProbeKeyDecrypt(ctx: CredentialContext): CredentialsService["probeKeyDecrypt"] {
  return async (): Promise<boolean> => {
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
      return true;
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

    try {
      decryptSealed(ctx.box, sealed, aadFor(r.ownerId, r.provider));
      return true;
    } catch (error) {
      if (error instanceof CredentialsDecryptError) {
        return false;
      }
      throw error;
    }
  };
}
