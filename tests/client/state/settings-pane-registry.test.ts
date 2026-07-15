// `settingsAnchorId` (state/settings-pane-registry.ts) — the DOM anchor-id derivation every pane
// surface (owner features + the settings host's scroll-spy) shares. Pins the exact stamp format and
// that distinct category/subcategory pairs never collide.

import { settingsAnchorId } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("settingsAnchorId", () => {
  test("stamps settings-anchor-<category>-<sub>", () => {
    expect(settingsAnchorId("personas", "personas")).toBe("settings-anchor-personas-personas");
    expect(settingsAnchorId("workloads", "jobs")).toBe("settings-anchor-workloads-jobs");
  });

  test("distinct categories with the same subcategory id never collide", () => {
    expect(settingsAnchorId("admin", "engines")).not.toBe(settingsAnchorId("system", "engines"));
  });
});
