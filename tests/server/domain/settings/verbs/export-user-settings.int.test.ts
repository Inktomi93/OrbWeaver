// verb: exportUserSettings — projects the owner's settings to the share-safe allowlist and serializes them. THE
// LOAD-BEARING SECURITY PIN (R3): a settings blob carrying secret-adjacent config (routing / connection source)
// EXPORTS WITHOUT IT — exercised through the REAL read path (a stored user_settings row), not just the serde.

import type { PortableParse } from "@orb/contracts/portability";
import { createExportUserSettings, createSettingsContext } from "@orb/server/domain/settings";
import { parseUserSettingsBackup } from "@orb/server/kit/serde/user-settings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** The parse outcome's value — the portable serdes return a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

describe("exportUserSettings", () => {
  test("a settings blob WITH secret-adjacent fields exports WITHOUT them", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    // Store a SHARE-SAFE pref (appearance) AND a fenced-out connection assignment (routing.chat.source/model).
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { fontScale: 1.25 } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: {
        section: "routing",
        patch: { roleDefaults: { chat: { source: "openrouter", model: "fenced-model-xyz" } } },
      },
    });

    const file = await createExportUserSettings(ctx)(owner);
    expect(file.filename).toBe("user-settings.json");

    // The fenced connection config never appears in the exported bytes.
    const text = new TextDecoder().decode(file.bytes);
    expect(text).not.toContain("fenced-model-xyz");
    expect(text).not.toContain("roleDefaults");

    const parsed = must(parseUserSettingsBackup(file.bytes));
    expect("routing" in (parsed ?? {})).toBe(false);
    expect(parsed?.appearance?.fontScale).toBe(1.25); // the share-safe pref DID travel
  });
});
