// verb: buildKeylessCatalogCredential — the ONE keyless OpenRouter catalog credential (credentials.md
// §"Verbs"; connection injects it for the public `/models` catalog fetch). The OpenRouter list endpoints
// are public, so this carries an empty key and no row — the catalog paths branch on `source` and never
// read the key. Constructed through the single brand home (`substrate/mint`); takes no ctx, no params
// (the keyless catalog needs no input).

import type { OpenRouterCredential } from "@orb/contracts/credentials";
import type { CredentialsService } from "../contract/service";
import { mintOpenRouter } from "../substrate/mint";

export function createBuildKeylessCatalog(): CredentialsService["buildKeylessCatalogCredential"] {
  return (): OpenRouterCredential => mintOpenRouter("", null);
}
