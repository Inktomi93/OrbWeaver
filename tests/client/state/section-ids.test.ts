// The section vocabulary's pure guards — mirror of packages/client/src/state/section-ids.ts.
// resolveSectionPath is #181's deep-link resolver: a URL segment is an ASSERTION (miss ⇒ null ⇒ the
// router's notFound), deliberately unlike the stored-section heal whose miss arm is the born default.

import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { isSectionId, RETIRED_SECTION_HEAL, resolveSectionPath, SECTION_IDS } from "../../../packages/client/src/state/section-ids.ts";

describe("resolveSectionPath", () => {
  test("resolves every live section id to itself — the path spelling IS the section id", () => {
    for (const id of SECTION_IDS) {
      expect(resolveSectionPath(id)).toBe(id);
    }
  });

  test("heals every retired id to its recorded successor, same as a stored id would land", () => {
    for (const [retired, successor] of Object.entries(RETIRED_SECTION_HEAL)) {
      expect(isSectionId(retired)).toBe(false);
      expect(resolveSectionPath(retired)).toBe(successor);
    }
  });

  test("returns null for a non-section segment — /nonsense must reach notFound, never teleport home", () => {
    expect(resolveSectionPath("definitely-not-a-section")).toBeNull();
    expect(resolveSectionPath("")).toBeNull();
    // A section id is exact — no case-insensitive or prefix admission.
    expect(resolveSectionPath("Chats")).toBeNull();
    expect(resolveSectionPath("chats/")).toBeNull();
  });
});
