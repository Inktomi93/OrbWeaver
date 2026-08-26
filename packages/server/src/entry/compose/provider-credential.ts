// Entry-tier credential→provider error adapter. Credential storage/configuration failures originate in the
// credentials domain; once resolution is serving a provider role, the single ProviderError taxonomy must
// classify them for retry policy and operator logs. The safe domain message is retained, but no cause chain:
// crypto throws can carry opaque/enumerable secret-bearing state and must end at the credential boundary.

import type { CredentialsService } from "#domain/credentials";
import { CredentialsDecryptError } from "#domain/credentials";
import { ProviderError } from "#infra/providers";

/** Wrap credentials.resolve for a provider-facing consumer. Every non-decrypt refusal passes through. */
export function mapProviderCredentialResolver(resolve: CredentialsService["resolve"]): CredentialsService["resolve"] {
  return async (params) => {
    try {
      return await resolve(params);
    } catch (error) {
      if (error instanceof CredentialsDecryptError) {
        // biome-ignore lint/style/useErrorCause: The credential boundary deliberately severs any secret-bearing cause chain.
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: error.message,
          detail: error.code,
        });
      }
      throw error;
    }
  };
}
