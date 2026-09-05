// kit/stored-config — requireIntactStoredConfig: the write-boundary refusal for an unreadable stored blob.
// Pins: an intact outcome returns the parsed value; a degraded outcome REFUSES with
// stored_config_unreadable rather than persisting the schema-default stand-in over real data; and the
// settings catalog entry is a REFERENCE to this module's constant, not a second spelling of the wire code.
// (Moved here from tests/server/domain/settings/substrate/ with its subject in #1026 — two domains now
// reach it, so a domain home would have been a sideways value import.)

import type { VersionedParseOutcome } from "@orb/contracts/versioned-config";
import { DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { SETTINGS_OP_CODES } from "../../../packages/server/src/domain/settings/contract/errors.ts";
import { requireIntactStoredConfig, STORED_CONFIG_UNREADABLE } from "../../../packages/server/src/kit/stored-config/index.ts";
import { expect, test } from "../../support/fixtures.ts";

interface Blob {
  readonly theme: string;
}

describe("requireIntactStoredConfig", () => {
  test("an intact outcome returns the parsed value", () => {
    const outcome: VersionedParseOutcome<Blob> = { intact: true, value: { theme: "dark" } };
    expect(requireIntactStoredConfig(outcome, "user_settings.config")).toEqual({ theme: "dark" });
  });

  test("a degraded outcome REFUSES rather than persisting the schema-default stand-in", () => {
    const outcome: VersionedParseOutcome<Blob> = { intact: false, value: { theme: "default" }, failure: "schema-rejected" };
    let thrown: unknown;
    try {
      requireIntactStoredConfig(outcome, "user_settings.config");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainOperationError);
    expect((thrown as DomainOperationError).code).toBe("stored_config_unreadable");
    expect((thrown as Error).message).toContain("user_settings.config");
  });

  test("the settings catalog entry REFERENCES this module's code — one home for the wire string", () => {
    expect(SETTINGS_OP_CODES.storedConfigUnreadable).toBe(STORED_CONFIG_UNREADABLE);
    expect(STORED_CONFIG_UNREADABLE).toBe("stored_config_unreadable");
  });
});
