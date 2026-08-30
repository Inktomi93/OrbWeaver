// substrate/stored-config — requireIntactStoredConfig: the write-boundary refusal for an unreadable stored
// blob. Pins: an intact outcome returns the parsed value; a degraded outcome REFUSES with
// stored_config_unreadable rather than persisting the schema-default stand-in over real settings.

import type { VersionedParseOutcome } from "@orb/contracts/versioned-config";
import { DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { requireIntactStoredConfig } from "../../../../../packages/server/src/domain/settings/substrate/stored-config.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
});
