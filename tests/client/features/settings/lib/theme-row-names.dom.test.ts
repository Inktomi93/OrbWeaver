// The LITERAL control for the theme row's accessible-name builder (#2261).
//
// Every other pin on this name now IMPORTS `themeActionsName`, which is exactly what makes the coupling
// compile-time — and exactly what makes those pins blind to a COPY change: assert `name: themeActionsName(x)`
// against a component that renders `themeActionsName(x)` and any wording survives. So the wording is pinned
// ONCE, here, at the builder's own home. If this test goes red the copy changed; that is the whole point.
//
// The `Theme actions:` prefix itself is a RULING (#2252, stated in `theme-row-menu.tsx`'s header): the bare
// house `Actions for <name>` collided with Playwright's substring matching against the theme card's own
// `role=radio, name="Mocha"`, so a locator for "Mocha" resolved to the kebab and opened a backdrop that ate
// every later click. Changing this string is changing that ruling.

import { themeActionsName } from "@orb/client/features/settings";
import { expect, test } from "../../../../support/fixtures.ts";

test("the theme kebab is named `Theme actions: <name>` — NOT the house `Actions for <name>`", () => {
  expect(themeActionsName("Mocha")).toBe("Theme actions: Mocha");
  expect(themeActionsName("My Theme")).toBe("Theme actions: My Theme");
  // The ruled distinction from `#lib`'s rowActionsName — a regression to the house grammar fails here.
  expect(themeActionsName("Mocha")).not.toBe("Actions for Mocha");
});
