// CT SUITE: ACCESSIBLE-NAME QUALITY — the app is navigable by (role, accessible name) alone (lane NAMECRAFT).
//
// THE TWIN OF form-identity.suite.ct.tsx, and deliberately a DIFFERENT question. That suite asks whether
// every control is IDENTIFIED (an `id` or a `name` attribute — Chrome's autofill predicate). This one asks
// whether every control is FINDABLE: an agent — or a screen-reader user — drives this app through the
// accessibility tree, by role + name, and a name that is empty, ambiguous, or diverges from what is on
// screen makes a control unreachable no matter how well-formed its attributes are.
//
// The convention is `UI-Primitives-and-Reuse.md` §13.10; the mechanical predicates live in
// `tests/support/browser/accessible-names.ts` (which carries the WHY of each one and the measured ariaSnapshot
// shape it parses). Four predicates, all machine-checkable:
//
//   1. nameless-control    — every interactive role carries a non-empty accessible name.
//   2. ambiguous-duplicate — no two same-role controls share a name under the same scope chain.
//   3. unnamed/duplicate-landmark — every landmark is named and distinguishable from its role-twins.
//   4. label-not-in-name   — WCAG 2.5.3: an `aria-label` never drops a word that is on screen.
//
// The judgment-y half of §13.10 (is the verb the user's verb, is the noun the domain's noun, does the
// stable identity lead) is NOT here — it is a review rule, and a CT that tried to score taste would either
// be vacuous or wrong. What IS here bites: the negative-control test below plants each defect class.
//
// SURFACE COVERAGE IS THE POINT AND IT GROWS. Each surface below is a real feature story mounted the way
// its own CT mounts it; adding a surface here is how a new pane gets held to the convention. A story that
// renders nothing (an unstubbed read, a missing settle barrier) would pass VACUOUSLY, so every case
// barriers on a SETTLED rendered control before it measures.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { ariaTreeFindings, formatFindings, labelInNameFindings, nameQualityFindings } from "../../support/browser/accessible-names.ts";
import { CHAT_AND_INBOX_READS_EMPTY } from "../../support/node/chat-and-inbox-reads-empty.ts";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { AppShellStory, RailStory } from "../features/app-shell/_ct-stories.tsx";
import { CharacterLibrarySurfaceStory } from "../features/character/_ct-stories.tsx";
import { makeCharacterSummary, makeTagFixture } from "../features/character/fixtures.ts";
import { ComposerStory, MembersPanelStory, NewChatPickerStory } from "../features/chat/_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES } from "../features/chat/fixtures.ts";
import { ConfigHostStory } from "../features/config/_ct-stories.tsx";
import { CharacterCreateBandStory, PresetRenameDialogStory } from "../forms/editor/_form-identity-stories.tsx";

const USER_SETTINGS_VIEW = { userId: "user_ct_namecraft", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/**
 * The viewer-identity reads the composer's own subtree pulls in beyond {@link CHAT_AMBIENT_ROUTES} /
 * {@link CHAT_ROOM_ROUTES} — `Composer` mounts `ActiveChatOptionsMenu` (`chat.getChat`, covered by
 * `CHAT_ROOM_ROUTES`) alongside the persona/session identity every composer-adjacent surface resolves
 * for the speaker chip. Feeding these turns `Composer`'s real selection/gate logic on instead of it
 * resolving through routeTrpc's unstubbed-null branch (#629/#649).
 */
const VIEWER_IDENTITY_ROUTES: Readonly<Record<string, unknown>> = {
  // The config LIST paints every shelf, so the four collection bands read their rosters — fed empty.
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  "sessions.me": { userId: "user_ct_namecraft", globalRole: "user", handle: "namecraft" },
  "persona.list": [],
  // The config host's appearance target mounts `appearance-looks-section.tsx`, whose
  // `useSuspenseQuery(trpc.settings.listThemes…)` would otherwise run inert on routeTrpc's null fulfil
  // (the unfed-read ratchet, #1052/0040bebae) — fed empty per the "no themes yet" default.
  "settings.listThemes": [],
};

/** The empty `chat.listChats` page (`ChatListPage` wire shape) — the honest "no chats yet" default the
 *  home masthead / library resume-strip readers compose over (character-library-surface.tsx:175,
 *  home-masthead-body.tsx:58). */
const EMPTY_CHAT_LIST = { items: [], nextCursor: null, totalCount: 0 };

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria Nightshade", createdAt: 3000, tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })] });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt", createdAt: 2000, tags: [] });

/** Asserts the whole rendered page is clean, printing every offender so the fix site is obvious. Page-wide
 *  rather than mount-scoped: Base UI portals every dialog/popup to the portal root, so a mount-rooted
 *  query would skip exactly the overlay surfaces this suite exists to cover. */
async function expectEveryNameNavigable(page: Page, surface: string): Promise<void> {
  const findings = await nameQualityFindings(page);
  expect(
    findings,
    `${surface}: every control must be findable by role + accessible name (UI-Primitives-and-Reuse §13.10).\n${formatFindings(findings)}`,
  ).toEqual([]);
}

// ── The control: each predicate actually BITES ───────────────────────────────────────────────────────
// Without these, a parser that silently returned [] (a changed ariaSnapshot shape, a bad selector) would
// make every surface below pass forever. Each defect class is planted and must be reported.

test("the tree predicates BITE — a nameless control, an ambiguous duplicate, and an unnamed landmark", () => {
  const planted = [
    '- navigation "Primary":',
    '  - button "Home"',
    "- navigation:", // unnamed landmark, and a second `navigation` besides
    "  - button", // nameless control
    '  - button "Edit"',
    '  - button "Edit"', // ambiguous duplicate under one scope
  ].join("\n");
  const rules = ariaTreeFindings(planted).map((f) => f.rule);
  expect(rules).toContain("nameless-control");
  expect(rules).toContain("ambiguous-duplicate");
  expect(rules).toContain("unnamed-landmark");
});

test("the duplicate predicate is SCOPE-AWARE — the same name in differently-named rows is not a finding", () => {
  const scoped = ['- listitem "Aria":', '  - button "Edit"', '- listitem "Bolt":', '  - button "Edit"'].join("\n");
  expect(ariaTreeFindings(scoped)).toEqual([]);
});

test("the Label-in-Name predicate BITES — an aria-label that drops on-screen words is reported", async ({ mount, page }) => {
  await mount(
    <div>
      {/* Deliberately divergent: the label says one thing, the pixels say another. */}
      <button aria-label="Open the command palette" type="button">
        Jump
      </button>
    </div>,
  );
  const findings = await labelInNameFindings(page);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.detail).toContain('"jump"');
});

test("the Label-in-Name predicate PASSES a label that CONTAINS the visible text, and ignores a description", async ({ mount, page }) => {
  await mount(
    <div>
      <button aria-label="Group by tag" type="button">
        Group
      </button>
      {/* `responding` is a DESCRIPTION, not a label — stripping it is the Members-row precedent. */}
      <button aria-describedby="desc" aria-label="Aria — character" type="button">
        Aria{" "}
        {/* biome-ignore lint/correctness/useUniqueElementIds: a FIXED id is the point — this one mount pins the describedby target the probe must strip; a `useId` value would be unwritable in the sibling's attribute. */}
        <span id="desc">responding</span>
      </button>
    </div>,
  );
  expect(await labelInNameFindings(page)).toEqual([]);
});

test("the Label-in-Name predicate compares WORDS, not substrings — 'art' is not in 'cart' (#1492)", async ({ mount, page }) => {
  // THE DEFECT: `lowered.includes(word)` accepted any accessible name that merely CONTAINED the visible
  // word's letters, so a control reading "art" under the name "Cart" passed — a real WCAG 2.5.3 violation
  // reported as clean. The whole predicate is a lens; a lens that cannot fail on its own worked example is
  // decoration. Both sides are tokenized with the same word regex now.
  await mount(
    <div>
      <button aria-label="Cart" type="button">
        art
      </button>
    </div>,
  );
  const findings = await labelInNameFindings(page);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.detail).toContain('"art"');
});

test("…and the tokenizer does not over-fire: a real multi-word label still passes (#1492 positive control)", async ({ mount, page }) => {
  await mount(
    <div>
      {/* The word IS in the name, as a word — and case is not a difference. */}
      <button aria-label="Add to cart" type="button">
        cart
      </button>
      <button aria-label="Add to cart" type="button">
        Add to cart
      </button>
    </div>,
  );
  expect(await labelInNameFindings(page)).toEqual([]);
});

// ── The surfaces ────────────────────────────────────────────────────────────────────────────────────

test("the rail is navigable by name", async ({ mount, page }) => {
  const rail = await mount(<RailStory />);
  await expect(rail.getByRole("button", { name: "Chats" })).toBeVisible();
  await expectEveryNameNavigable(page, "rail");
});

test("the app shell is navigable by name", async ({ mount, page }) => {
  // The topbar-trail inbox bell (#1627 retired its `multiHumanCapable` gate, so it mounts for every authed
  // principal now) brings its own `useInbox` read into the shell tree — FED empty rather than left on
  // routeTrpc's null fulfil, so the bell this suite must name renders its real empty-inbox lens (#1663).
  // `chat.listChats` (the rail's library roster / the masthead recents reader) is fed the same way (#1817
  // — the #1797 whole-tree census caught this file's shell mount leaving it unstubbed and INERT).
  await routeTrpc(page, {
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    ...VIEWER_IDENTITY_ROUTES,
    ...CHAT_AND_INBOX_READS_EMPTY,
  });
  const shell = await mount(<AppShellStory />);
  await expect(shell.getByRole("main")).toBeVisible();
  await expectEveryNameNavigable(page, "app shell");
});

test("the chat composer is navigable by name", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, ...VIEWER_IDENTITY_ROUTES });
  const composer = await mount(<ComposerStory />);
  await expect(composer.getByRole("button", { name: "Send message" })).toBeVisible();
  await expectEveryNameNavigable(page, "chat composer");
});

test("the members panel is navigable by name", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, ...VIEWER_IDENTITY_ROUTES });
  const members = await mount(<MembersPanelStory />);
  await expect(members.getByRole("button", { name: "Mute Aria" })).toBeVisible();
  await expectEveryNameNavigable(page, "members panel");
});

test("the character library is navigable by name", async ({ mount, page }) => {
  await routeTrpc(page, {
    "rosterPreset.list": [],
    "character.list": () => ({ items: [ARIA, BOLT], nextCursor: null }),
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "chat.listChats": () => EMPTY_CHAT_LIST,
  });
  const library = await mount(<CharacterLibrarySurfaceStory />);
  await expect(library.getByRole("button", { name: "Chat with Aria Nightshade" })).toBeVisible();
  await expectEveryNameNavigable(page, "character library");
});

test("the config host (the Settings section's LIST + CONTENT) is navigable by name", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW, ...VIEWER_IDENTITY_ROUTES });
  const settings = await mount(<ConfigHostStory target="appearance" />);
  await expect(settings.getByRole("switch", { name: "Show avatars in chat" })).toBeVisible();
  await expectEveryNameNavigable(page, "config host");
});

test("the new-chat picker is navigable by name", async ({ mount, page }) => {
  // The picker's saved-cast plane reads the cast roster beside the character list — fed empty.
  await routeTrpc(page, { "character.list": () => ({ items: [ARIA, BOLT], nextCursor: null }), "rosterPreset.list": [] });
  await mount(<NewChatPickerStory />);
  await expect(page.getByRole("option", { name: "Aria Nightshade" })).toBeVisible();
  await expectEveryNameNavigable(page, "new-chat picker");
});

test("the character create dialog is navigable by name", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const band = await mount(<CharacterCreateBandStory />);
  await band.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("textbox", { name: "Character name" })).toBeVisible();
  await expectEveryNameNavigable(page, "character create dialog");
});

test("the preset rename dialog is navigable by name", async ({ mount, page }) => {
  const dialog = await mount(<PresetRenameDialogStory />);
  await expect(dialog.page().getByRole("textbox", { name: "Preset name" })).toBeVisible();
  await expectEveryNameNavigable(page, "preset rename dialog");
});
