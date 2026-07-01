// verb: mintVllmCredential — the boot-time keyless vLLM loopback marker.

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness } from "../_support.ts";

describe("mintVllmCredential", () => {
  test("mints the keyless vllm marker (no row, no key)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    expect(svc.mintVllmCredential()).toEqual({ source: "vllm", credentialId: null });
  });
});
