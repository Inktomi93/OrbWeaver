// verb: buildKeylessCatalogCredential — the keyless public-OpenRouter catalog credential (empty key, no row).

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness } from "../_support.ts";

describe("buildKeylessCatalogCredential", () => {
  test("mints an empty-key openrouter credential with no row", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    expect(svc.buildKeylessCatalogCredential()).toEqual({
      source: "openrouter",
      apiKey: "",
      credentialId: null,
    });
  });
});
