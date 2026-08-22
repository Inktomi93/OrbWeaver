// CT: the You sheet's persona list (`personaChrome.body("sheet")` → `PersonaPanelSurface`) — #458.
//
// THE DEFECT THIS PINS: two personas can legitimately carry the same name (the user names two "Traveler",
// duplicates one, restores a backup beside its original), and the row's two name-embedding controls then
// announce IDENTICAL accessible names — the census taken off the live mobile sheet read
// `actionRows: ["Actions for Traveler","Actions for Traveler"]`. A screen-reader or agent walk of the list
// cannot tell those rows apart, which is exactly the collision `rowQualifiers` exists to resolve (#443, the
// regex roster's "New script" × 2). The qualifier is resolved with the WHOLE list in hand — a per-row
// derivation cannot know that its name collided.
//
// WHAT THIS FILE DELIBERATELY DOES NOT PIN — the reported symptom's other half. The mobile sheet also showed
// two rows both subtitled "Your default persona" with one crown. That subtitle is `persona.title`, which is
// USER-EDITABLE PROSE (the seeder authors the string at
// packages/server/src/entry/boot/seed-default-persona.ts); it is not derived from any flag, and no client
// change can make prose agree with state without deleting what the user wrote. The crown alone is the
// default's statement, and the last test here fences exactly that: N rows may CLAIM default in prose, only
// the one the settings pointer names wears the crown.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PersonaYouSheetStory } from "../_ct-stories.tsx";

const NOVA = "persona_nova";
const TRAVELER_OLD = "persona_traveler_old";
const TRAVELER_NEW = "persona_traveler_new";

const SEEDED_TITLE = "Your default persona";

const ACTIONS_LABEL = /^Actions for /;
const SWITCH_LABEL = /^Switch to /;
const QUALIFIED_TRAVELER = /^Actions for "Traveler" · .+/;

// THREE rows, two of them same-named — the shape the collision actually needs. A two-row list cannot show it
// on the SELECT target: the surface's current-persona resolution (current → default → first) always makes
// one of two rows the current one, and the current arm's label differs by construction. With a third row
// holding "current", both Travelers are switch-targets and the collision is reachable on both controls.
//
// Both Travelers carry the SEEDED title verbatim (the live receipt: two byte-identical seeded rows) so the
// crown fence below runs against the exact prose that contradicted it on screen.
const PERSONAS = [
  {
    id: NOVA,
    name: "Nova",
    title: "the navigator",
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: TRAVELER_OLD,
    name: "Traveler",
    title: SEEDED_TITLE,
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1_787_334_249_923,
    updatedAt: 1_787_334_249_923,
  },
  {
    id: TRAVELER_NEW,
    name: "Traveler",
    title: SEEDED_TITLE,
    description: "",
    starred: false,
    avatarAssetId: null,
    avatarHash: null,
    metadata: null,
    createdAt: 1_787_404_033_943,
    updatedAt: 1_787_404_033_943,
  },
];

/** Nova is BOTH the current and the default persona, so neither Traveler is current and neither is crowned. */
function stub(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: NOVA } },
      updatedAt: 0,
    }),
  });
}

/** The accessible names of every control matching `pattern`, in DOM order. Read off `aria-label` because
 *  that IS the computed name for these icon-only / stretched controls, and the assertion is about the string
 *  a reader hears, not about a class or a prop. */
async function labels(page: Page, pattern: RegExp): Promise<readonly string[]> {
  const all = await page
    .locator("button[aria-label]")
    .evaluateAll((els: readonly Element[]): readonly string[] => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return all.filter((label) => pattern.test(label));
}

/** Every `aria-label`-named control INSIDE a persona row, grouped by row, in DOM order. Scoped to the rows
 *  (each row is the `persona-row-name` column's parent) so the band's own verbs — New persona, Restore — are
 *  not mistaken for row controls. */
function rowControlLabels(page: Page): Promise<readonly (readonly string[])[]> {
  return page
    .locator('[data-slot="persona-row-name"]')
    .evaluateAll((els: readonly Element[]): readonly (readonly string[])[] =>
      els.map((el) =>
        Array.from((el.parentElement as HTMLElement).querySelectorAll("button[aria-label]")).map((button) => button.getAttribute("aria-label") ?? ""),
      ),
    );
}

// ── EVERY ROW CONTROL NAMES ITS ROW (#463) ──────────────────────────────────────────────────────────
// #458 fixed the two controls that already embedded the name (the kebab + the stretched select target) and
// left the other five GENERIC: "Rename persona", "Change avatar", "Favorite"/"Unfavorite", "Set as default",
// "Show details" were byte-identical on EVERY row. That collision does not need two personas to share a name
// — it exists between any two rows — so a reader tabbing the list hears the same five controls three times
// and cannot tell which persona they act on. The fix is the #443 subject on every one of them, which is why
// this pin is a set-size claim over the whole list rather than a per-label spelling.
test("no two controls in the persona list share an accessible name — every row control names its row", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const rows = await rowControlLabels(page);
  expect(rows).toHaveLength(3);
  const all = rows.flat();
  // The receipt names the offenders rather than a bare count — the defect read
  // ["Rename persona","Rename persona","Rename persona","Change avatar", …].
  expect(all.filter((label, index) => all.indexOf(label) !== index)).toEqual([]);
});

// The mechanism behind the set-size claim, stated so a future "make them unique some other way" cannot pass:
// what a row's controls carry is the row's own SUBJECT (the persona's name, plus the #458 qualifier where the
// name itself collided) — never an opaque index or an id.
test("each row's controls all embed that row's persona name", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const [nova, ...travelers] = await rowControlLabels(page);
  expect(nova?.length ?? 0).toBeGreaterThan(3);
  expect((nova ?? []).filter((label) => !label.includes("Nova"))).toEqual([]);
  for (const row of travelers) {
    expect(row.filter((label) => !label.includes("Traveler"))).toEqual([]);
  }
});

test("two same-named personas get DISTINCT kebab names — the row's actions announce which row they belong to", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const actions = await labels(page, ACTIONS_LABEL);
  expect(actions).toHaveLength(3);
  // The defect: ["Actions for Traveler", "Actions for Traveler"] — one accessible name, two controls.
  expect(new Set(actions).size).toBe(3);
  // …and the escalation wears the HOUSE grammar (`rowActionSubject`: `"name" · qualifier`), not some
  // row-local spelling. The qualifier itself is time-relative and ages, so the pin is its SHAPE.
  expect(actions.filter((label) => QUALIFIED_TRAVELER.test(label))).toHaveLength(2);
});

test("two same-named personas get DISTINCT switch-target names — the stretched select button too", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  const switches = await labels(page, SWITCH_LABEL);
  expect(switches).toHaveLength(2); // Nova is current, so its row carries the current arm instead
  expect(new Set(switches).size).toBe(2);
});

// The qualifier is SPENT, not sprayed. A persona row shows no timestamp (unlike the chats/presets/regex rows
// the lib was written for), so announcing a stamp on a row whose name is already unique would name a datum
// that is nowhere on screen. Rows that are already distinct keep the bare name.
test("a row whose name does NOT collide keeps its bare name — no qualifier is spent", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Actions for Nova", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova — current persona", exact: true })).toBeVisible();
});

// THE CROWN IS THE DEFAULT'S ONE STATEMENT (#458). Two rows here carry the seeded title "Your default
// persona" as PROSE while neither is the default — the exact state the mobile sheet was screenshotted in.
// The prose is the user's to edit and the client renders it verbatim; what must never drift is the marker
// that is actually derived from `seeds.defaultPersonaId`.
test("exactly ONE row wears the crown, however many rows CLAIM default in their subtitle prose", async ({ mount, page }) => {
  await stub(page);
  await mount(<PersonaYouSheetStory />);
  await expect(page.getByText("Nova", { exact: true })).toBeVisible();

  await expect(page.getByText(SEEDED_TITLE)).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Your default" })).toHaveCount(1);
});
