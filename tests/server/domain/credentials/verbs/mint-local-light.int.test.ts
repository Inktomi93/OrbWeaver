// verb: mintLocalLightCredential — the keyless in-process local-light marker (PD-9 / D39).

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness } from "../_support.ts";

describe("mintLocalLightCredential", () => {
  test("mints the keyless local-light marker (no row, no key)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    expect(svc.mintLocalLightCredential()).toEqual({ source: "local-light", credentialId: null });
  });
});
