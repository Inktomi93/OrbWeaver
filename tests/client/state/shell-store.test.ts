// Non-rendering reads of the shell store (the reactive ones are pinned in shell-store.ct.tsx).

import { describe } from "vitest";
import { activeSectionNow, setActiveSection } from "#client/state/shell-store.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("activeSectionNow", () => {
  test("answers the section the last switch landed on, for an action that needs to know where the user is", () => {
    setActiveSection("presets");
    expect(activeSectionNow()).toBe("presets");
    setActiveSection("home");
    expect(activeSectionNow()).toBe("home");
  });
});
