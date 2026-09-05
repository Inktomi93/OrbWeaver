// #1667 — THE PIN THAT MAKES THE MIRROR HONEST. The client spells the default palette's display name
// itself (`HEARTH_NAME`) because it cannot import the server constant that the db seed row is actually
// written from: `@orb/server` sits ABOVE `@orb/client` on the package cake. That mirror is only safe
// while the two values are byte-identical, and NOTHING else checks it — the divergence is invisible to
// tsc (two unrelated string literals), to every gate, and to the CTs (which stub the wire and therefore
// stub the very name under test).
//
// WHAT DIVERGENCE COSTS, which is why this is a test and not a comment: `appearance-looks-section.tsx`
// uses the name as its ACTIVE-CARD predicate (`theme.isSeed && theme.name === HEARTH_NAME` for the
// `selectedThemeId === null` arm), so a rename on either side leaves the Looks grid with no active card
// at all on the DEFAULT setting — the state most users are in — and `looks-fold-caption.tsx` renders the
// stale word into "advanced · your changes, on top of <look>".
//
// A test file may reach across the cake where a package may not; `tests/server/domain/settings/
// seed-theme-pairing.suite.test.ts` is the house precedent for importing server source by relative path.

import { HEARTH_NAME } from "../../../../../packages/client/src/features/settings/lib/seed-theme-identity.ts";
import { THEME_HEARTH_ID, THEME_HEARTH_NAME } from "../../../../../packages/server/src/domain/settings/constants.ts";
import { SEED_THEMES } from "../../../../../packages/server/src/domain/settings/seed-themes.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the client's HEARTH_NAME is byte-identical to the server's THEME_HEARTH_NAME", () => {
  expect(HEARTH_NAME).toBe(THEME_HEARTH_NAME);
});

test("that name is the one the SEEDER actually writes for the default palette row", () => {
  // The constant could match and still be wrong if the seeder stopped using it, so the pin walks one
  // rung further down the ladder: to the row the seeder emits, keyed by the sentinel id.
  const seeded = SEED_THEMES.find((theme) => theme.id === THEME_HEARTH_ID);
  expect(seeded).toBeDefined();
  expect(seeded?.name).toBe(HEARTH_NAME);
});
