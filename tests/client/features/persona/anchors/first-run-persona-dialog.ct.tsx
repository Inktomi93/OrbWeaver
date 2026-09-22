// CT: the FIRST-RUN persona gate — the two-write submit (#1501).
//
// THE DEFECT: `create` and `setSeed` were awaited under ONE generic catch. A create-succeeds /
// seed-fails run therefore left an orphan persona with neither `currentPersonaId` nor `defaultPersonaId`
// pointing at it, told the reader "Couldn't create your persona — try again" (which would have minted a
// SECOND persona), and then unmounted the gate anyway the moment `persona.list` echoed a non-empty
// library — so the pointer the gate exists to write could never be written by anything.
//
// The two writes are separate facts, so they get separate arms: the gate holds the id it created, stays up
// while that persona is unseeded, names the remaining work on its own button, and a retry retries the SEED.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { FirstRunPersonaDialogStory } from "../_ct-stories.tsx";

// The gate is a `FormDialog`, which PORTALS to the body — so every locator here is PAGE-scoped. A mount-handle
// locator resolves inside `#root` and can never see it (the notification-bell popover precedent).

const CREATED: TrpcWireOutput<"persona.create"> = {
  id: "persona_000000000000000000001",
  name: "Alex",
  description: "",
  title: null,
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

/** A SECOND owned persona, with a LOWER id than {@link CREATED} — the orphan pick has to be a property of
 *  the set, not of the order the server happened to return it in. */
const OLDER: TrpcWireOutput<"persona.create"> = {
  id: "persona_000000000000000000000",
  name: "Ada",
  description: "A cartographer.",
  title: null,
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 0,
  updatedAt: 0,
};

/** The viewer's settings row with BOTH persona pointers unset — the orphan state a create-succeeds /
 *  seed-fails run leaves behind, and the state a RELOAD lands back in. */
const UNSEEDED_SETTINGS: TrpcWireOutput<"settings.getUserSettings"> = {
  userId: "user_ct_firstrun",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  configUnreadable: null,
};

/** …and the same row once the seed has landed: a viewer who can speak, whom the gate must leave alone. */
const SEEDED_SETTINGS = {
  ...UNSEEDED_SETTINGS,
  config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: CREATED.id, defaultPersonaId: CREATED.id } },
};

/** The zero-persona library the gate triggers on, with a create that lands and a SEED that does not. */
function routeSeedFails(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => [],
    "persona.create": () => CREATED,
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
    "settings.updateUserSettingsSection": () => trpcError({ message: "seed write failed" }),
  });
}

test("a create-succeeds / seed-FAILS run keeps the gate up and retries only the SEED (#1501)", async ({ mount, page }) => {
  const trpc = await routeSeedFails(page);
  await mount(<FirstRunPersonaDialogStory />);

  await page.getByTestId(testId("firstRunPersonaName")).fill("Alex");
  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect.poll(() => trpc.count("persona.create"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] }).toBe(1);

  // The gate is STILL UP — the persona exists but has no pointer, and nothing else in the app offers to
  // write one. Its verb names what is actually left, rather than offering to create a second persona.
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toHaveText("Finish setting up");

  await page.getByTestId(testId("firstRunPersonaCreate")).click();
  // The retry retries the HALF THAT FAILED: one more seed write, and still exactly one persona.
  await expect.poll(() => trpc.count("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] }).toBe(2);
  await expect.poll(() => trpc.count("persona.create"), { intervals: [20, 50, 100] }).toBe(1);
});

test("both writes landing closes the gate, and the seed points at the persona just created", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "persona.list": () => [],
    "persona.create": () => CREATED,
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
    "settings.updateUserSettingsSection": () => SEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);

  await page.getByTestId(testId("firstRunPersonaName")).fill("Alex");
  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect
    .poll(() => trpc.lastInput("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] })
    .toEqual({ section: "seeds", patch: { currentPersonaId: CREATED.id, defaultPersonaId: CREATED.id } });
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toHaveCount(0);
});

// ── #1570 item 1 · THE ORPHAN SURVIVES A RELOAD, AND SO MUST ITS RECOVERY ────────────────────────
// `createdId` is component state, so the retry arm above dies with the tab. Before this, a reload after a
// create-succeeds / seed-fails run was TERMINAL: the library is non-empty so the gate stood down, and no
// other surface in the app offers to write `currentPersonaId` — the viewer owned a persona they could not
// speak as, permanently. This mount carries NO session state (it is the reload), so the recovery has to be
// re-derived from the server: a non-empty library whose seeds are both null IS the orphan.
test("a FRESH mount over an unseeded library recovers the ORPHAN instead of minting a second persona (#1570)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "persona.list": () => [CREATED],
    "persona.create": () => CREATED,
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
    "settings.updateUserSettingsSection": () => SEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);

  // The gate is UP over a non-empty library, and it names the work that is actually left.
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toHaveText("Finish setting up");
  // …and it adopts the orphan's own name rather than showing an empty box over a persona that has one.
  await expect(page.getByTestId(testId("firstRunPersonaName"))).toHaveValue(CREATED.name);

  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect
    .poll(() => trpc.lastInput("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] })
    .toEqual({ section: "seeds", patch: { currentPersonaId: CREATED.id, defaultPersonaId: CREATED.id } });
  // The whole point: the row that exists is seeded, and NO second persona is minted.
  await expect.poll(() => trpc.count("persona.create"), { intervals: [20, 50, 100] }).toBe(0);
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toHaveCount(0);
});

// …and the trigger stays narrow: a viewer who CAN speak never sees this gate. Without this arm the fix
// above would be satisfiable by simply always showing the dialog.
test("a viewer with a persona AND a pointer never sees the gate (#1570)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "persona.list": () => [CREATED],
    "settings.getUserSettings": () => SEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);

  await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
});

// ── #1570 · THE RECOVERY ARM WRITES WHAT IT SHOWS ────────────────────────────────────────────────
// The arm paints an editable, pre-filled Name and Description over a persona that already has both, then
// went straight to `setSeed` — so a reader who fixed the name they typed before the interruption pressed
// Finish, saw no error, and kept the old values. That is the "state that lies" class this gate was reopened
// for, one layer in: the box is the promise, and the write is what has to keep it.
test("editing the fields on the RECOVERY arm actually saves them (#1570)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "persona.list": () => [CREATED],
    "persona.create": () => CREATED,
    "persona.update": () => CREATED,
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
    "settings.updateUserSettingsSection": () => SEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);

  // Both fields are adopted from the orphan — an empty Description box over a persona that has one is the
  // same lie as an empty Name box would be.
  await expect(page.getByTestId(testId("firstRunPersonaName"))).toHaveValue(CREATED.name);
  await page.getByTestId(testId("firstRunPersonaName")).fill("Nathaniel");

  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect
    .poll(() => trpc.lastInput("persona.update"), { intervals: [20, 50, 100] })
    .toEqual({ personaId: CREATED.id, input: { name: "Nathaniel", description: CREATED.description } });
  // …and the seed still lands, on the SAME persona, with no second row minted.
  await expect.poll(() => trpc.count("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("persona.create"), { intervals: [20, 50, 100] }).toBe(0);
});

// …and an UNTOUCHED recovery stays two round trips, so the write above is the edit's consequence rather
// than a third call every orphan pays for.
test("an untouched RECOVERY arm writes no update — only the seed (#1570)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "persona.list": () => [CREATED],
    "persona.update": () => CREATED,
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
    "settings.updateUserSettingsSection": () => SEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);
  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect.poll(() => trpc.count("settings.updateUserSettingsSection"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("persona.update"), { intervals: [20, 50, 100] }).toBe(0);
});

// THE PICK IS A PROPERTY OF THE SET, NOT OF THE LIST ORDER. `persona.list` is ordered `desc(createdAt)`
// server-side and the row carries no timestamp, so a client taking `personas[0]` would be choosing by an
// ordering it cannot see. The stub deliberately returns the higher id FIRST: the gate must still offer the
// lower one, and must offer the same one whichever way the list arrives.
for (const [label, rows] of [
  ["newest first", [CREATED, OLDER]],
  ["oldest first", [OLDER, CREATED]],
] as const) {
  test(`the orphan is picked deterministically by id — ${label} (#1570)`, async ({ mount, page }) => {
    await routeTrpc(page, {
      "persona.list": () => rows,
      "settings.getUserSettings": () => UNSEEDED_SETTINGS,
      "settings.updateUserSettingsSection": () => SEEDED_SETTINGS,
    });
    await mount(<FirstRunPersonaDialogStory />);

    await expect(page.getByTestId(testId("firstRunPersonaName"))).toHaveValue(OLDER.name);
  });
}

// The name is REQUIRED on the recovery arm too — it is the same editable box, and blanking it would rename
// the viewer to nothing. (The arm used to wave an empty name through, which only became reachable once the
// fields started being written.)
test("the RECOVERY arm refuses an empty name (#1570)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "persona.list": () => [CREATED],
    "settings.getUserSettings": () => UNSEEDED_SETTINGS,
  });
  await mount(<FirstRunPersonaDialogStory />);

  await page.getByTestId(testId("firstRunPersonaName")).fill("   ");
  await expect(page.getByTestId(testId("firstRunPersonaCreate"))).toBeDisabled();
});
