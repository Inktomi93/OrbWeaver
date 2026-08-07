// verb: storageStatus — is per-user credential STORAGE available at all on this deployment?
//
// CREDENTIAL-STORAGE-SILENT-FAIL. Without a `CREDENTIALS_KEY` the SecretBox is disabled, boot only WARNs, and
// the app comes up healthy — so the "Save API key" form looked completely operational, and the only way to
// learn otherwise was to type a secret into it and submit. `add` has always refused (a coded
// `credentials_disabled`), which makes the failure honest but far too late: the user has already handed a live
// key to a form that cannot keep it.
//
// This is the READ half — the same fact, BEFORE the typing. It is deliberately a boolean about the
// DEPLOYMENT's capability and carries nothing about any key, any owner, or any row, so it needs no scoping
// beyond `authed` (an authenticated user learning that key storage is off on the server they are logged into
// is not a disclosure — it is the operator's configuration, which their own failing save would tell them
// anyway).
//
// Principal-free by construction: the answer is the same for every caller, so the verb takes no params.

import type { CredentialContext } from "../context.ts";
import type { CredentialsService } from "../contract/service.ts";
import type { CredentialStorageStatus } from "../contract/views.ts";

export function createStorageStatus(ctx: CredentialContext): CredentialsService["storageStatus"] {
  return (): Promise<CredentialStorageStatus> => Promise.resolve({ enabled: ctx.box.enabled });
}
