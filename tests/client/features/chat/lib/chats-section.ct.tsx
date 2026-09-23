// CT: the chats section's COMMITTED context (chats-section.tsx's `defineContextTabs` over the committed
// arm of ChatContextState, rendered through the real SectionContextHost — members · "This chat" (field
// overrides + injections + group + background + tool-use sections) · preview). Drives the production path
// over the stubbed network (routeTrpc):
// `chat.getChat` supplies the roster (the host gate + the Members rows) + the current room overrides;
// `chat.listChatInjections` + `chat.previewAssembly` feed the tabs; `invites.*` feeds the mint dialog.
// Asserts the host vs member split (member loses the Preview tab and edits nothing), the Members tab
// gates + default-tab rule, the invite dialog wire, the preview trace render, an injection add, and an
// override save (autosave → setRoomOverrides).
//
// The roster stub returns only what the panel reads (`viewerIsHost` — the server-resolved, per-viewer
// host gate every tab now shares; `participants` for the D16 group size-gate; `roomOverrides` for the
// form) — a partial `ChatDetail`, the same posture as message-list-surface.ct's ROSTER_STUB. Every
// value crosses the routeTrpc JSON boundary as a plain object.

import type { RoomOverrides } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { hitExtent, touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { HOST_BAND, openContextSections } from "../../../../support/node/open-context-sections.ts";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import type { TrpcFixtureOutput, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatContextPanelStory, ChatContextTabContributorStory, ChatDeletedWhileOpenStory, RoomActivityTabStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES } from "../fixtures.ts";

// #629 — the "This chat" tab's OWN section reads, which this file never stubbed. An unlisted proc answers
// `null`, which is NOT a view: MacroPicksSection (two suspending reads, `useSuspenseQueries`) and the
// Documents rack both threw on it, so those sections sat in their QueryBoundary ERROR arms in every case
// that opens the tab — invisible, because the section headings are Section kickers rendered OUTSIDE the
// boundary and the headings are all this file asserts. Found by the CT reporter's unfed-read census, whose
// per-file line for this test named all three. Empty declarations = each section's teaching empty state,
// the arm with the smallest blast radius on the heading/count assertions around them.
const THIS_CHAT_TAB_READS: TrpcRoutes<"chat.getUserMacroPicks" | "chat.getVariablePicks" | "databank.listActiveForChat" | "worldInfo.listForChat"> = {
  "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
  "chat.getVariablePicks": () => ({ variables: [], values: {} }),
  "databank.listActiveForChat": () => [],
  // #637 — the Books section (chat-books-section.tsx, landed in #630) joined this tab with a SUSPENDING
  // `worldInfo.listForChat`, so an unfed read threw into its QueryBoundary and the "no read-error surface"
  // assertion below reddened. Exactly the "including one added tomorrow" case that assertion was written
  // for, and the unfed-read ratchet named the procedure in the same run. Empty = the section's empty state.
  "worldInfo.listForChat": () => [],
  // #1788 — the same story a third time, and the loudest arm of it: the #1742 Regex section joined this tab
  // with a HEADING CHIP that reads `chat.listEffectiveRegex` through a plain `useQuery` OUTSIDE every
  // disclosure, so the read fires on every mount here and the unfed answer took the tab's error arm — nine
  // tests in this file, most of which never mention regex. Off-and-empty (the shared support projection, now
  // its fourth borrower): this file counts rail cells and asserts "no read-error surface", so the section
  // must render its real quiet arm rather than rows.
  ...REGEX_READS_EMPTY,
};

/** One CELL of the pane's FOOT rail (the context bracket, #860): a BUTTON inside the toolbar named "Chat"
 *  (the section's `railLabel`), carrying `aria-current` while it holds the view — never a `tab` (#112, the
 *  rail model is universal now). `exact`, because the head band's roster chip is named "Members — N" and a
 *  loose match would seat the chip where the cell was meant. */
function cell(component: Locator, name: string): Locator {
  return component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name, exact: true });
}

const NATE_HOST_RE = /Nate — host/u;
const ARIA_CHARACTER_RE = /Aria — character/u;
const BUDDY_MEMBER_RE = /Buddy — member/u;

// `multiHumanCapable` now reads from `/api/auth/config` (not a prop), so the People-tab cases stub the
// deployment capability at the network boundary — the honest source the shell gates on. Unstubbed, the
// hook degrades to `false` (single-user), which the non-People cases already assume.
async function stubMultiHumanCapable(page: Page, capable: boolean): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "single",
        requiresLogin: false,
        localEnabled: false,
        oidcEnabled: false,
        discreetLogin: false,
        defaultHandle: null,
        multiHumanCapable: capable,
      }),
    }),
  );
}

// A human seat in the room — `role` seats a host/member (the roster shape); the surface's host gate is
// the separate server-resolved `viewerIsHost` field, NOT this seat's role. The rest is filler the panel
// ignores.
type ChatParticipant = TrpcWireOutput<"chat.getChat">["participants"][number];
type ChatIdentity = TrpcWireOutput<"chat.getChat">["identities"][number];
type FixtureArrayElement<T, TKey extends PropertyKey> = T extends unknown
  ? TKey extends keyof T
    ? NonNullable<T[TKey]> extends readonly (infer Item)[]
      ? Item
      : never
    : never
  : never;
type ParticipantFixture = FixtureArrayElement<TrpcFixtureOutput<"chat.getChat">, "participants">;
type HumanSeat = Pick<
  ChatParticipant,
  "activePersonaId" | "avatarHash" | "characterId" | "displayName" | "handle" | "id" | "kind" | "leftSeq" | "role" | "userId"
>;

function human(role: ParticipantRole): ParticipantFixture {
  return { kind: "human", role, userId: "user_ct", characterId: null };
}

// A character seat — the fields `resolveIsGroupChat` AND the Members Character rows read (the §7.1 merge
// projects displayName/disabled/talkativeness/avatarHash into `MemberCharacterRow`s).
function character(key: string): ParticipantFixture {
  return {
    id: `participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: key.charAt(0).toUpperCase() + key.slice(1),
    disabled: false,
    talkativeness: 0.5,
    avatarHash: null,
    leftSeq: null,
  };
}

// `role` seats the viewer's OWN human row AND sets the server-resolved `viewerIsHost` to match — the
// honest single-human case where the seat and the server field agree (the proxy-vs-server DISAGREEMENT
// is exercised by its own dedicated test below).
function chatDetail(
  role: ParticipantRole,
  roomOverrides: RoomOverrides = {},
  characters: readonly ParticipantFixture[] = [],
): TrpcFixtureOutput<"chat.getChat"> {
  return {
    participants: [human(role), ...characters],
    // `ChatDetail.identities` is server-populated on every getChat; a tab that resolves a seat's persona through it
    // (the Members tab) reads an empty producer as "this seat plays nobody", never as a crash.
    identities: [],
    roomOverrides,
    viewerIsHost: role === "host",
  };
}

// A minimal AssemblyPreview ({ prompt, trace }) — proves the Preview tab renders the assembled halves +
// the trace without asserting the assembler's own logic (that is the server's read.int.test's lane).
/** The Preview tab's System source-row drill-in trigger. */
const RE_SYSTEM_ROW = /System/;

type AssemblyPreview = TrpcWireOutput<"chat.previewAssembly">;
type AssemblyTrace = AssemblyPreview["trace"];

const PREVIEW = {
  prompt: {
    static: "SYSTEM: be a helpful guide",
    dynamic: "",
    afterHistory: [],
    sendHistory: true,
    trace: emptyTrace(),
  },
  trace: emptyTrace(),
  budget: {
    ceilingTokens: 8192,
    ceilingEstimated: false,
    totalTokens: 120,
    sources: [
      {
        source: "system",
        detail: "main prompt",
        tokens: 120,
        parts: [{ label: "main prompt", tokens: 120, text: "SYSTEM: be a helpful guide" }],
        text: "SYSTEM: be a helpful guide",
      },
    ],
    sections: [],
  },
} satisfies AssemblyPreview;

function emptyTrace(): AssemblyTrace {
  return {
    staticSections: ["main_prompt"],
    dynamicSections: [],
    worldInfoIncluded: 0,
    worldInfoDropped: [],
    worldInfoActivated: [],
    matchedKeys: [],
    compactSummaryIncluded: false,
    memoryIncluded: false,
    memoryRecall: null,
    databankIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
    overrideSources: { mainPrompt: "room override" },
  };
}

// A PRESENT human seat with the fields the People tab renders (multi-human invites lane):
// `leftSeq: null` is load-bearing — the projection keeps only present seats. `activePersonaId` is equally
// load-bearing now: a human row renders the PERSONA it is playing, resolved against the room's characters producer
// (#162). The `handle` stays on the WIRE stub, spelled as an EMAIL exactly as an OIDC install ships it,
// because the point of the change is that no row can render it as a second identity beside the name.
function humanSeat(id: string, displayName: string, role: ParticipantRole): HumanSeat {
  return {
    id: `participant_${id}`,
    kind: "human",
    role,
    userId: `user_${id}`,
    characterId: null,
    activePersonaId: `persona_${id}`,
    displayName,
    handle: `${displayName.toLowerCase()}@example.test`,
    avatarHash: null,
    leftSeq: null,
  };
}

/** The persona IDENTITY entry a {@link humanSeat} is playing — what turns its `activePersonaId` into a name. */
function personaEntry(id: string, name: string): ChatIdentity {
  return { kind: "persona", id: `persona_${id}`, name, description: "", avatarHash: null };
}

// A `ChatDetail` stub for the People-tab cases — carries the server-resolved `viewerIsHost` (the
// invite-controls gate; NOT the first-seat proxy the older tabs still use) and the room's characters producer.
function multiHumanChat(viewerIsHost: boolean, humans: readonly HumanSeat[]): TrpcFixtureOutput<"chat.getChat"> {
  return {
    participants: [...humans, character("aria")],
    identities: humans.map((h) => personaEntry(String(h["userId"]).replace("user_", ""), String(h["displayName"]))),
    roomOverrides: {},
    viewerIsHost,
  };
}

const CREATED_INVITE = {
  invite: { id: "chatinvite_ct_new", status: "pending" },
  token: "tok_ct_minted",
} satisfies TrpcFixtureOutput<"invites.createInvite">;

test("host sees the consolidated tabs (This chat · Preview)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  // Overrides + Injections + Group consolidated into ONE "This chat" tab (panel-redesign): the strip is
  // Members · This chat · Preview. Overrides + Injections are no longer their own tabs — they are SECTIONS
  // inside "This chat". (Members leads the declared order, so it is also the DEFAULT tab; a host always has
  // it now — #162's floor-zero ruling — hence the explicit click before asserting this tab's body.)
  await expect(cell(component, "This chat")).toBeVisible();
  await expect(cell(component, "Settings")).toHaveCount(0);
  await expect(cell(component, "Overrides")).toHaveCount(0);
  await expect(cell(component, "Injections")).toHaveCount(0);
  await expect(cell(component, "Group")).toHaveCount(0);
  await expect(cell(component, "Preview")).toBeVisible();
  // Field overrides + Injections are SECTIONS inside the tab, with real h3s.
  await cell(component, "This chat").click();
  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Injections", level: 3 })).toBeVisible();
  // #830 made every section but Field overrides a CLOSED disclosure whose kicker IS its trigger, and a
  // closed Base UI panel is REMOVED from the DOM — so the body read below presses Macro picks open first.
  // The headings above are unaffected: the kicker renders whether the panel is open or not.
  await openContextSections(component, "Macro picks");
  // …and the sections actually RENDERED, rather than each heading standing over a read-error body (#629).
  // The Macro-picks body is the read's own empty state, so this is the section's real output, not its
  // boundary's. `QueryErrorState` is the house's ONE read-error surface, so its absence covers every
  // section in the tab at once — including one added tomorrow.
  await expect(component.getByText("declares no variables and no macro inputs", { exact: false })).toBeVisible();
  await expect(component.getByText("Couldn't load", { exact: false })).toHaveCount(0);
});

// ── #860 / #846: THE HEAD BAND names the room, whole, over its chips ────────────────────────────────────
test("#860: the context bracket's head band carries the room's title WHOLE and the members · memory · preset chips; the meta rail sits at the foot", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    // A long, crushable name (the seeded prefix every room shares) on a three-seat roster — every seat
    // PRESENT (`leftSeq: null`), which is what the chip counts.
    "chat.getChat": () => ({
      ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
      participants: [humanSeat("ct", "Nate", "host"), character("aria"), character("buddy")],
      title: "Example — The Ashen Spire",
    }),
    "preset.list": () => [{ id: "preset_ct_house", name: "House style" }],
    // The "This chat" cell is clicked below, and its Injections kicker reads the list for its count chip.
    "chat.listChatInjections": () => [],
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: "preset_ct_house" } },
      configUnreadable: null,
      updatedAt: 0,
    }),
  });
  const component = await mount(<ChatContextPanelStory />);

  const band = component.locator('[data-slot="context-bracket-band"]');
  const title = band.locator('[data-slot="chat-context-band-title"]');
  await expect(title).toHaveText("Example — The Ashen Spire");
  // WHOLE — a 2-line clamp is allowed, an ellipsis is not: the rendered box holds the whole run.
  await expect.poll(() => title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The chips: the roster count (the ONE roster doorway, with its word), the standing memory control, the
  // viewer's active preset by NAME (a chat carries no preset binding — this is the viewer's, D58).
  //
  // THE ROSTER CHIP IS A DATUM AT REST NOW (#878 F18 — "the ruling survives, its INPUT changed"). This
  // line used to assert a BUTTON here, and that was the defect: the pane OPENS on Members, so the chip's
  // door was already open and pressing it did nothing visible. The doorway ruling is untouched — the chip
  // is still the one roster door, and it is still a button everywhere the view is elsewhere (both
  // directions are driven in the F11/F18 pin below). What changed is the state it is asserted IN.
  await expect(band.locator('[data-slot="chat-context-band-members"]')).toHaveText("3 members");
  await expect(band.getByRole("button", { name: /^Memory — / })).toBeVisible();
  await expect(band.locator('[data-slot="chat-context-band-preset"]')).toHaveText("House style");
  // The band is ABOVE the rail, and the rail is the pane's foot: no tablist, no head strip.
  await expect(component.getByRole("tablist")).toHaveCount(0);
  const [bandBox, railBox] = await Promise.all([band.boundingBox(), component.getByRole("toolbar", { name: "Chat" }).boundingBox()]);
  expect((bandBox?.y ?? Number.NaN) + (bandBox?.height ?? 0)).toBeLessThan(railBox?.y ?? Number.NaN);
  // The roster chip opens the Members cell.
  await cell(component, "This chat").click();
  await expect(cell(component, "This chat")).toHaveAttribute("aria-current", "true");
  await band.getByRole("button", { name: "Members — 3" }).click();
  await expect(cell(component, "Members")).toHaveAttribute("aria-current", "true");
});

test("#1502: the preset chip SAYS it could not name the preset — it does not vanish into looking like no preset", async ({ mount, page }) => {
  // THE DEFECT: the chip rendered nothing whenever the name was not in hand, so a settled-but-unnameable
  // read (the list failed, or the seed points at a preset that is gone) was pixel-identical to a band that
  // simply carries no preset chip. Both SETTLED arms are driven here — a named preset and an unnameable
  // one — because the difference between them is the whole finding. The PENDING arm is deliberately not
  // asserted: it exists only while a query is in flight, so pinning it would be a flake by construction.
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => ({
      ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
      participants: [humanSeat("ct", "Nate", "host"), character("aria"), character("buddy")],
      title: "Example — The Ashen Spire",
    }),
    // The viewer's seed names a preset the library does NOT contain — the settled, unnameable case.
    "preset.list": () => [],
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: "preset_ct_gone" } },
      configUnreadable: null,
      updatedAt: 0,
    }),
  });
  const component = await mount(<ChatContextPanelStory />);
  const chip = component.locator('[data-slot="chat-context-band-preset"]');
  // Present, and saying which of the three states it is in — not absent.
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-preset-state", "unnameable");
  await expect(chip).toHaveText("Preset unavailable");
  await expect(chip).toHaveAttribute("title", /Couldn't name the preset/u);
});

test("#1502: a viewer on the built-in preset is an ANSWER, and reads as one", async ({ mount, page }) => {
  // The other settled arm, and the one the absence used to be confused with: `defaultPresetId: null` means
  // the built-in governs — a fact, needing no second read to be true.
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => ({
      ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
      participants: [humanSeat("ct", "Nate", "host"), character("aria"), character("buddy")],
      title: "Example — The Ashen Spire",
    }),
  });
  const component = await mount(<ChatContextPanelStory />);
  const chip = component.locator('[data-slot="chat-context-band-preset"]');
  await expect(chip).toHaveAttribute("data-preset-state", "named");
  await expect(chip).toHaveText("Built-in preset");
});

// ── #875 F6: THE BAND'S INTERACTIVE TEXT OBEYS THE FLOOR THE RAIL BESIDE IT REFUSES TO BREAK ───────────
// `context-rail.tsx` states it: the mock draws 10.5px cell captions and is NOT followed, because the
// readable-floor ruling (side-eye #102, which drove sub-11px interactive text to zero) outranks the
// artboard. The two bands shipped in the same commit pair at 10.5px anyway — `design-audit` reported
// `undersized-ui-text` on `chat-context-band` AND `character-context-band` in every arm, and on mobile the
// memory chip measured 40×44 against the 44px short side. A design-audit row proves a day; this proves
// every day. The character band's twin is in characters-section.ct.tsx.
const READABLE_FLOOR_PX = 11;
/** The band's visible label census: the title, the roster chip's word, the MEMORY chip's word (#878 F11 —
 *  this pin caught its arrival, which is what the stated census is for) and the preset chip. Stated so a
 *  story or chip change that empties the sweep reds instead of passing on zero rows. */
const CHAT_BAND_LABELS = 4;

test("#875 F6: every visible label in the chat band clears the 11px readable floor", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => ({
      ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
      participants: [humanSeat("ct", "Nate", "host"), character("aria"), character("buddy")],
      title: "Example — Midnight Run",
    }),
    "preset.list": () => [{ id: "preset_ct_house", name: "House style" }],
    // The preset chip is one of the two labels swept below, so its two cache-first reads are both fed.
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: "preset_ct_house" } },
      configUnreadable: null,
      updatedAt: 0,
    }),
  });
  const component = await mount(<ChatContextPanelStory />);
  const band = component.locator('[data-slot="chat-context-band"]');
  await expect(band).toBeVisible();
  await expect(band.locator('[data-slot="chat-context-band-preset"]')).toHaveText("House style");

  // Every VISIBLE label the band paints — the title, the roster chip's word, the preset chip. Swept as a
  // set rather than named one by one, so a fourth chip added tomorrow is covered. The union spells BOTH
  // slot families on purpose: a call site that passes its own `data-slot` REPLACES the primitive's (Badge
  // spreads props after its own attribute), so a `[data-slot="badge"]`-only sweep silently misses every
  // chip that named itself — which is every chip in this band.
  const labels = band.locator('[data-slot="text"], [data-slot^="chat-context-band"]');
  // The population is asserted on the auto-retrying matcher — a bare `await …count()` samples before the
  // preset chip's two cache reads land, and a zero would pass the sweep below silently.
  await expect(labels).toHaveCount(CHAT_BAND_LABELS);
  for (let index = 0; index < CHAT_BAND_LABELS; index += 1) {
    const label = labels.nth(index);
    await expect
      .poll(() => label.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)), { message: `band label #${String(index)} font-size` })
      .toBeGreaterThanOrEqual(READABLE_FLOOR_PX);
  }
});

// ── #878 F11 + F18: THE BAND'S CHIP ROW SAYS WHAT IT IS AND WHAT IT DOES ───────────────────────────────
test("#878 F11/F18: the memory chip shows its word, and the members chip is a DATUM while Members holds the view", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => ({
      ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
      participants: [humanSeat("ct", "Nate", "host"), character("aria"), character("buddy")],
      title: "Example — Midnight Run",
    }),
    // FED, not inert: this pin CLICKS "This chat", whose Injections kicker reads the list for its count.
    "chat.listChatInjections": () => [],
  });
  const component = await mount(<ChatContextPanelStory />);
  const band = component.locator('[data-slot="chat-context-band"]');

  // F11 — the visible word IS the accessible name, so Label-in-Name holds by construction rather than by
  // two strings someone keeps in sync. It shipped as a bare glyph: named for AT, nameless for the eye.
  const memory = band.getByRole("button", { name: /^Memory — / });
  await expect(memory).toHaveText(/^Memory — /i);
  // CASE-INSENSITIVE on purpose: the chip's `interactiveKicker` voice UPPERCASES its glyph-run
  // (`MEMORY — IDLE` on screen, `Memory — idle` as the name), and WCAG 2.5.3's own note rules case
  // differences acceptable — it is the WORDS that must match, which is exactly what this compares. The
  // roster chip beside it already ships the same pairing.
  const visible = await memory.innerText();
  await expect(memory).toHaveAccessibleName(new RegExp(`^${visible}$`, "iu"));

  // F18 — the pane OPENS on Members, so at rest the members chip's door is already open: it renders as the
  // inert datum pill, not as a control that does nothing.
  await expect(band.locator('[data-slot="chat-context-band-members"]')).toHaveText("3 members");
  await expect(band.getByRole("button", { name: "Members — 3" })).toHaveCount(0);

  // …and it becomes a real door again the moment the view is elsewhere — both directions, because a
  // one-directional check passes on a chip that is stuck.
  await cell(component, "This chat").click();
  await expect(cell(component, "This chat")).toHaveAttribute("aria-current", "true");
  await expect(band.getByRole("button", { name: "Members — 3" })).toBeVisible();
  await expect(band.locator('[data-slot="chat-context-band-members"]')).toHaveCount(0);
  // …and pressing it puts the view back, which is what makes it a door and not a decoration.
  await band.getByRole("button", { name: "Members — 3" }).click();
  await expect(cell(component, "Members")).toHaveAttribute("aria-current", "true");
  await expect(band.locator('[data-slot="chat-context-band-members"]')).toHaveText("3 members");
});

test.describe("#875 F6 — the band's chips at a coarse pointer", () => {
  test.use({ hasTouch: true });

  // DEMOTED HONESTLY: this arm is a FENCE, not a defect proof. Run against the pre-#875 source it PASSED —
  // design-audit measured the 40×44 on the LIVE app at 430 coarse, and the CT mount does not reproduce that
  // width (the band there is not carrying the live topbar's neighbours). The coarse INLINE floor
  // (`CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE`) is still the right fix and this holds the floor from here on; the
  // live row itself is verified on the stage, not here.
  test("FENCE — the glyph-only memory chip clears the 44px floor on BOTH axes", async ({ mount, page }) => {
    await page.setViewportSize({ width: 430, height: 860 });
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...THIS_CHAT_TAB_READS,
      "chat.getChat": () => ({
        ...multiHumanChat(true, [humanSeat("ct", "Nate", "host")]),
        participants: [humanSeat("ct", "Nate", "host"), character("aria")],
        title: "Example — Midnight Run",
      }),
    });
    const component = await mount(<ChatContextPanelStory />);
    // The emulation is PROVEN before any geometry is trusted — a narrow viewport at a FINE pointer renders
    // a layout no phone produces, and `--spacing-touch-target` is pointer-conditional.
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const floor = await touchFloorPx(page);
    expect(floor).toBe(44);

    const memory = component.locator('[data-slot="chat-context-band"]').getByRole("button", { name: /^Memory — / });
    await expect(memory).toBeVisible();
    // At rest this chip is glyph-only, so its SHORT side is its width — the axis `Button`'s height ramp
    // cannot answer and the one design-audit measured at 40.
    await expect.poll(() => hitExtent(memory, "x")).toBeGreaterThanOrEqual(floor);
    await expect.poll(() => hitExtent(memory, "y")).toBeGreaterThanOrEqual(floor);
  });
});

// RULING CHANGED (#162, owner 2026-08-17). This case used to assert the OPPOSITE — "host in a SOLO
// (1-character) chat sees no Members tab (D16 size-gate)" — because the Characters section demanded >=2
// characters. That floor is what produced the owner's live complaint: the Members tab is the room's ROSTER
// surface, and in a 1:1 room it rendered nothing but their own People row ("now it just shows my email").
// A room with characters has a roster; the tab shows it. (There is no "size-gate" clause in the D-ledger — the
// old rule lived only in this title and a one-line roster.ts comment.)
test("host in a SOLO (1-character) chat GETS the Members tab — its characters ARE its roster (#162)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host", {}, [character("aria")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(cell(component, "Preview")).toBeVisible();
  await expect(cell(component, "Members")).toBeVisible();
  await cell(component, "Members").click();
  await expect(page.getByTestId("members-panel").getByRole("button", { name: ARIA_CHARACTER_RE })).toBeVisible();
});

// The floor is ZERO for a HOST (owner ruling 2026-08-18): the Members tab is the room's one roster home in
// every state, so a character-less room gets the tab with a load-bearing empty state instead of a hidden tab.
test("a HOST with NO characters still gets the Members tab — the empty state IS the add door", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host", {}, []),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "character.list": () => ({ items: [], nextCursor: null }),
  });

  const component = await mount(<ChatContextPanelStory />);

  await cell(component, "Members").click();
  const panel = page.getByTestId("members-panel");
  await expect(panel).toContainText("No characters in this chat yet");
  await expect(panel.getByRole("button", { name: "Add a character" })).toBeVisible();
});

test("a MEMBER with no characters and no People arm still has no Members tab (nothing to show, nothing to do)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("member", {}, []),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(cell(component, "This chat")).toBeVisible();
  await expect(cell(component, "Members")).toHaveCount(0);
});

test("host in a GROUP (2-character) chat sees the Members tab AND it is the default tab (§7)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  const members = cell(component, "Members");
  await expect(members).toBeVisible();
  // The §7 ONE rule: with no tab requested, a group composition opens to Members.
  await expect(members).toHaveAttribute("aria-current", "true");
  // The Character rows render with the row contract's accessible names.
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Bryn — character" })).toBeVisible();
});

// ── CP-1 group-level omit matrix: the merged Settings tab's "Group behavior" section is host+group-only ──
// The gate that used to hide the WHOLE Group tab (chats-section.tsx `when: isHost && isGroupChat`) now
// gates the SECTION inside Settings. HOST of a group chat sees it; a MEMBER of the same group does not.

test("CP-1: HOST of a group chat sees the Group behavior section inside Settings", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    // The group section suspends on its own read (getGroupConfig) — the Group tab body's query, unchanged.
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
  });

  const component = await mount(<ChatContextPanelStory />);
  // Members is the default in a group; open "This chat" to reach the sections.
  await cell(component, "This chat").click();

  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  // Group behavior lives INSIDE the host-ops band, which #830 closed by default — its own trigger does not
  // exist until the band is pressed open (the band's children then stay open, so one press reaches it).
  await openContextSections(component, HOST_BAND);
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
});

test("CP-1: MEMBER of a group chat sees Settings but NOT the Group behavior section (§8.1 host-only omit)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("member", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "This chat").click();

  // Field overrides is present (read-only for a member); Group behavior is omitted for a non-host.
  await expect(component.getByRole("heading", { name: "Field overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
});

test("NOT multi-human capable → no People section anywhere (single-user renders no invite surface)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(true, [humanSeat("nate", "Nate", "host")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  // The default story mounts WITHOUT the capability prop — the single-user composition.
  const component = await mount(<ChatContextPanelStory />);

  await expect(cell(component, "This chat")).toBeVisible();
  // The Members tab EXISTS (it is the room's roster — one character is seated), but the whole PEOPLE half is
  // absent on a single-user install: no People section, and therefore no invite door anywhere.
  await cell(component, "Members").click();
  const panel = page.getByTestId("members-panel");
  await expect(panel.locator('[data-slot="members-characters"]')).toBeVisible();
  await expect(panel.locator('[data-slot="members-people"]')).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Invite people" })).toHaveCount(0);
});

// ── #1627 — THE FIRST-PAINT ARM OF THE PEOPLE GATE ─────────────────────────────────────────────────────
// `useChatContextState` read `useAuthConfig().data?.multiHumanCapable` RAW, so this section rendered the
// SINGLE-HUMAN arm for the whole flight of `/api/auth/config` (fetched at app-root mount) and then appeared —
// the same defect #476 measured on the notifications bell (0.00015 layout shift, under the `[cls]` flagger's
// own reporting floor, so nothing named it). It now reads `useMultiHumanCapable`, the ONE hint-backed read;
// the bell handed the hint over when its own gate was retired (its inbox has single-human sources).
//
// The hint is a RENDER hint only: `chat.participants`, the invite verbs and their server belts are untouched,
// which is why a stale hint can only cost a section that empties itself milliseconds later.

/** The deployment-boot hint's key (`createPersistedStore("deployment-boot")`), seeded BEFORE the page's
 *  modules run — a persisted store rehydrates at MODULE INIT, so writing after mount proves nothing. */
const DEPLOYMENT_HINT_KEY = "orb:deployment-boot";

async function seedCapabilityHint(page: Page, multiHumanCapable: boolean): Promise<void> {
  const blob = JSON.stringify({ state: { multiHumanCapable }, version: 1 });
  await page.addInitScript({
    content: `try { localStorage.setItem(${JSON.stringify(DEPLOYMENT_HINT_KEY)}, ${JSON.stringify(blob)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

/** Hold `/api/auth/config` in flight; the returned fn lands the deployment's answer when the test wants it.
 *  The window under test is the one where it has NOT landed. */
async function holdAuthConfig(page: Page): Promise<(capable: boolean) => void> {
  let land: ((capable: boolean) => void) | undefined;
  const answered = new Promise<boolean>((resolve) => {
    land = resolve;
  });
  await page.route("**/api/auth/config", async (route) => {
    const multiHumanCapable = await answered;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "single",
        requiresLogin: false,
        localEnabled: false,
        oidcEnabled: false,
        discreetLogin: false,
        defaultHandle: null,
        multiHumanCapable,
      }),
    });
  });
  return (capable: boolean): void => land?.(capable);
}

test("a device that REMEMBERS a multi-human deployment paints People before the config lands (#1627)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(true, [humanSeat("nate", "Nate", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "invites.listInvites": () => [],
  });
  const land = await holdAuthConfig(page);
  await seedCapabilityHint(page, true);

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Members").click();

  // The config is STILL in flight — under the raw read this half of the tab was simply absent here.
  const panel = page.getByTestId("members-panel");
  await expect(panel.locator('[data-slot="members-people"]')).toBeVisible();
  land(true);
  // …and the server agreeing changes nothing the user can see.
  await expect(panel.locator('[data-slot="members-people"]')).toBeVisible();
});

test("a device told NOTHING renders the single-human arm until the config lands — the honest floor", async ({ mount, page }) => {
  // A FENCE, not a defect proof: this is also the pre-#1627 behavior on every device. It pins the
  // first-EVER-visit arm, so a future "just default the hint to true" cannot reserve an invite surface a
  // single-user deployment never renders.
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(true, [humanSeat("nate", "Nate", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "invites.listInvites": () => [],
  });
  const land = await holdAuthConfig(page);

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Members").click();

  const panel = page.getByTestId("members-panel");
  await expect(panel.locator('[data-slot="members-people"]')).toHaveCount(0);
  // The server's yes is what puts it there — and what this device remembers for its next boot.
  land(true);
  await expect(panel.locator('[data-slot="members-people"]')).toBeVisible();
});

test("capable HOST: Members lists the humans (host chip) and the invite dialog mints by handle", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(true, [humanSeat("nate", "Nate", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "invites.listInvites": () => [],
    "invites.createInvite": () => CREATED_INVITE,
  });
  await stubMultiHumanCapable(page, true);

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Members").click();

  // The People section — humans differentiated from the seated characters, host crowned; the server
  // `viewerIsHost:true` also means the viewer's own seat carries the "you" marker on Nate's row.
  const panel = page.getByTestId("members-panel");
  await expect(panel.getByRole("button", { name: NATE_HOST_RE })).toBeVisible();
  await expect(panel.getByRole("button", { name: BUDDY_MEMBER_RE })).toBeVisible();

  // The host's invite affordance: the People-header action → the §8.2 mint dialog.
  await panel.getByRole("button", { name: "Invite people" }).click();
  const dialog = page.getByTestId("invite-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Invite by handle" }).click();
  await dialog.getByLabel("Handle").fill("frodo");
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect.poll(() => trpc.count("invites.createInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("invites.createInvite") as {
      chatId?: unknown;
      input?: { invitedHandle?: unknown };
    };
  const input = trpc.lastInput("invites.createInvite") as {
    chatId?: unknown;
    input?: { invitedHandle?: unknown };
  };
  await expect.poll(async () => (await readInputAtAssertion()).chatId).toBe("chat_ct_keystone");
  await expect.poll(async () => (await readInputAtAssertion()).input?.invitedHandle).toBe("frodo");
});

test("capable MEMBER: Members shows who's here but NO invite/kick controls (host-only mirror)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(false, [humanSeat("nate", "Nate", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
  });
  await stubMultiHumanCapable(page, true);

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Members").click();

  const panel = page.getByTestId("members-panel");
  await expect(panel.getByRole("button", { name: NATE_HOST_RE })).toBeVisible();
  // No invite header action; no kick menu on another human's row (zero actions ⇒ no menu opens).
  await expect(panel.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await panel.getByRole("button", { name: NATE_HOST_RE }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("member loses the Preview tab and the overrides are read-only", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("member", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(cell(component, "This chat")).toBeVisible();
  // Injections is now a SECTION inside "This chat", not its own tab.
  await expect(cell(component, "Injections")).toHaveCount(0);
  await expect(component.getByRole("heading", { name: "Injections", level: 3 })).toBeVisible();
  // Preview is host-only (previewAssembly is a host debug surface) — hidden for a member.
  await expect(cell(component, "Preview")).toHaveCount(0);
  // A non-host member sees NO "Group behavior" section (the §8.1 host-only omit, moved to section level).
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // The Field-overrides main-prompt field seeded from the server value, but disabled (a member cannot edit)
  // — the override control is still reachable inside "This chat" (expand the collapse-until-needed row).
  await component.getByRole("button", { name: "Main prompt" }).click();
  const mainPrompt = component.getByLabel("Main prompt", { exact: true });
  await expect(mainPrompt).toHaveValue("Be terse.");
  await expect(mainPrompt).toBeDisabled();
});

test("migrated tabs obey the server host field, NOT the first-seat proxy (member behind a host seat sees no host UI)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    // The FIRST human seat is a host, so the old `resolveViewerIsHost` first-seat proxy would return
    // TRUE and mis-grant host UI. The server-resolved `viewerIsHost:false` says THIS viewer is a
    // member — the migrated Settings/Preview/Injections tabs must obey the server field, not the seat.
    "chat.getChat": () => ({
      participants: [human("host"), human("member")],
      roomOverrides: { mainPrompt: "Be terse." },
      viewerIsHost: false,
    }),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);

  // Preview is host-only → hidden despite the host-first roster that would trip the proxy.
  await expect(cell(component, "This chat")).toBeVisible();
  await expect(cell(component, "Preview")).toHaveCount(0);
  // The Group-behavior SECTION obeys the server host field too — a member behind a host seat sees none.
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // Overrides seed from the server value but stay read-only — the member cannot edit even though a
  // host holds the first human seat (expand the collapse-until-needed row to reach the editor).
  await component.getByRole("button", { name: "Main prompt" }).click();
  const mainPrompt = component.getByLabel("Main prompt", { exact: true });
  await expect(mainPrompt).toHaveValue("Be terse.");
  await expect(mainPrompt).toBeDisabled();
});

test("the Preview tab renders the assembled prompt + trace", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    // The restored ShapeTrace half fires a PARALLEL suspense read (#12) — a valid content-free trace
    // shape, else the unlisted-proc `data:null` default suspends the whole panel forever.
    "chat.getShapeTrace": () => ({
      multiCharacter: false,
      stageCounts: { withTail: 3, injected: 3, squashed: 3, named: 3 },
      squashMerges: 0,
    }),
  });

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Preview").click();

  // The budget instrument renders (the D-4 rebuild): the used/ceiling line + the System source row.
  await expect(component.getByText("120 / 8,192 tok")).toBeVisible();
  await expect(component.getByText("System", { exact: true })).toBeVisible();
  // …and the assembled text is reachable by drilling into the source that owns it.
  await component.getByRole("button", { name: RE_SYSTEM_ROW }).click();
  await expect(component.getByText("SYSTEM: be a helpful guide")).toBeVisible();
});

test("host adds an injection (setChatInjection fires with no id ⇒ create)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.setChatInjection": () => ({
      id: "chat_injection_new",
      position: "in_chat",
      depth: 0,
      role: "system",
      content: "",
    }),
  });

  const component = await mount(<ChatContextPanelStory />);
  // Injections is a section inside "This chat" (the default tab for this solo host chat).
  await cell(component, "This chat").click();
  // …behind its own disclosure since #830 (a closed panel is removed from the DOM).
  await openContextSections(component, "Injections");
  await expect(component.getByText("No injections yet.")).toBeVisible();

  await component.getByRole("button", { name: "Add injection" }).click();

  await expect.poll(() => trpc.count("chat.setChatInjection"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.setChatInjection") as { id?: unknown; position?: unknown };
  const input = trpc.lastInput("chat.setChatInjection") as { id?: unknown; position?: unknown };
  // A create carries NO id (the server mints it) and the default position.
  await expect.poll(async () => (await readInputAtAssertion()).id).toBeUndefined();
  await expect.poll(async () => (await readInputAtAssertion()).position).toBe("in_chat");
});

test("host removes an injection (deleteChatInjection fires with the row id)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [
      {
        id: "chat_injection_a",
        position: "in_chat",
        depth: 2,
        role: "system",
        content: "It is raining.",
      },
    ],
    "chat.deleteChatInjection": () => null,
  });

  const component = await mount(<ChatContextPanelStory />);
  // Injections is a section inside "This chat" (the default tab for this solo host chat).
  await cell(component, "This chat").click();
  // …behind its own disclosure since #830 (a closed panel is removed from the DOM).
  await openContextSections(component, "Injections");
  await expect(component.getByText("It is raining.")).toBeVisible();

  // Remove lives INSIDE the row's own editor panel (#821 put an irreversible action behind the disclosure,
  // never one click off a collapsed scan-list), so the row is opened before it is reachable at all.
  await component.getByRole("button", { name: /^Injection 1\b/u }).click();
  await component.getByRole("button", { name: "Remove injection" }).click();

  await expect.poll(() => trpc.count("chat.deleteChatInjection"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("chat.deleteChatInjection") as { injectionId?: unknown };
  const input = trpc.lastInput("chat.deleteChatInjection") as { injectionId?: unknown };
  await expect.poll(async () => (await readInputAtAssertion()).injectionId).toBe("chat_injection_a");
});

test("host editing an override autosaves (setRoomOverrides fires, empty ⇒ omitted)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({ scenario: "A rainy dock." }),
  });

  const component = await mount(<ChatContextPanelStory />);
  // Members leads the strip and is the default tab for a host (#162), so name the tab under test.
  await cell(component, "This chat").click();
  // Field overrides are collapse-until-needed rows — expand Scenario, then edit it.
  await component.getByRole("button", { name: "Scenario" }).click();
  await component.getByLabel("Scenario", { exact: true }).fill("A rainy dock.");

  await expect.poll(() => trpc.count("chat.setRoomOverrides"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("chat.setRoomOverrides") as {
      overrides?: { scenario?: string; mainPrompt?: string };
    };
  const input = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { scenario?: string; mainPrompt?: string };
  };
  await expect.poll(async () => (await readInputAtAssertion()).overrides?.scenario).toBe("A rainy dock.");
  // Empty fields are omitted (inherit), not sent as "".
  await expect.poll(async () => (await readInputAtAssertion()).overrides).not.toHaveProperty("mainPrompt");
});

// RETIRED (owner ruling 2026-08-01): the author's-note override was a SECOND home for what the Injections
// section beside it already owns — both landed as the same at-depth splice. The field is GONE from the
// Field-overrides section; a per-chat note is authored as an injection (system @ depth 4).
test("the Field-overrides section has NO author's-note field — only the three text overrides", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({}),
  });

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "This chat").click();
  // The three surviving collapse rows are reachable…
  await expect(component.getByRole("button", { name: "Main prompt" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Post-history" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Scenario" })).toBeVisible();
  // …and the retired one is not, with no orphan depth/role controls left behind by its expanded editor.
  await expect(component.getByRole("button", { name: "Author's note" })).toHaveCount(0);
  await expect(component.getByLabel("Author's note", { exact: true })).toHaveCount(0);
  await expect(component.getByLabel("Depth", { exact: true })).toHaveCount(0);
});

// ── The chat-context CONTRIBUTOR seam (client-architecture-lockdown.md §6c/M8) ──────────────────────
// The seam itself was built at M3 (`defineContextTabs`'s `contributors` arm), but no CT had ever mounted
// a LIVE contributor through it — every prior test drove the panel's OWN tabs. This proves a fake
// `ContextTabDef<ChatContextState>`, registered at a door-mirroring `CtChatContributorSectionRegistry` in
// place of main.tsx's empty registry, renders as a real tab AND `when`-gates, through the REAL
// section → factory → mint → resolve path (not a bespoke test double of the seam).

test("a fake context-tab contributor renders as a tab, in the real tab strip", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextTabContributorStory visible={true} />);

  await expect(cell(component, "Fake Tab")).toBeVisible();
  await cell(component, "Fake Tab").click();
  await expect(component.getByTestId("ct-fake-context-tab-body")).toBeVisible();
});

test("a fake context-tab contributor's `when:false` hides it from the real tab strip", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextTabContributorStory visible={false} />);

  await expect(cell(component, "This chat")).toBeVisible();
  await expect(cell(component, "Fake Tab")).toHaveCount(0);
});

// ── THE ROOM DIED UNDER YOU (R3 — the fresh-context verifier's R1-3) ───────────────────────────────
//
// `chat-lifecycle.ts` and design §4.5 BOTH justify the husk-reap's `chatDeleted` emit with "a husk CAN be the
// open room on the creating device — without the event that device sits pointed at a chat that no longer
// exists instead of taking the landing seam". The event was emitted; nothing consumed it. `chatDeleted`
// routed to `invalidate` alone, so the tab kept rendering its cached transcript for a row that was gone —
// reachable in the wild through the TTL sweep firing against a tab left open on an unclaimed room, and
// (pre-existing) through a host delete arriving from another device.
//
// The pin is the TRANSITION, driven through the real reducer + the real feature wiring, not the store action
// in isolation: `chatDeletedFromList` already had its own unit-level coverage and still nothing connected it
// to the bus.
test("a chatDeleted for the OPEN room takes the reader to landing, not a room whose row is gone", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": { title: "The Ashfall Road", participants: [], identities: [], group: DEFAULT_GROUP_CONFIG },
    "chat.listMessages": { messages: [], identities: [] },
    "chat.previewContextFit": {
      boundaryMessageId: null,
      usedTokens: 0,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    },
  });

  const component = await mount(<ChatDeletedWhileOpenStory />);

  // The room is open — its composer is mounted.
  await expect(component.getByTestId(testId("composer"))).toBeVisible();

  await component.getByTestId("drive-chat-deleted").click();

  // …and the reader is on the landing surface, with no composer for a chat that no longer exists.
  await expect(component.getByTestId(testId("composer"))).toHaveCount(0);
  await expect(component.getByText("No chat selected")).toBeVisible();
});

// ── B11: the room ACTIVITY tab ──────────────────────────────────
// A host-only CONTEXT-strip sibling grafted through the SAME contributor seam as the fake tab above, but
// with the REAL `automationActivityTab` def: it renders `RoomActivityLog` over `automation.listChatActivity`
// — this room's fire log across all its rules (fires · notices · plugin-tool runs · confirmed cards), each a
// row here (the ONE-HOME `automation_fires` store). Proven through the real section → factory → mint path.

// One fire-log row as the wire ships it (the FireView JSON crosses routeTrpc as a plain object).
type ActivityFire = TrpcWireOutput<"automation.listChatActivity">[number];

function activityFire(over: Partial<ActivityFire>): ActivityFire {
  return {
    id: "automation_fire_ct",
    ruleId: "automation_rule_ct",
    chatId: "chat_ct_keystone",
    triggerType: "messageCommitted",
    outcome: "fired",
    detail: null,
    firedAt: 1_700_000_000_000,
    ...over,
  };
}

test("B11: a HOST sees the Activity tab and it lists this room's fires (with the confirmer stamp)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "automation.listChatActivity": () => [
      // A human-confirmed suggestion card — its `confirmedByUserId` is what the row marks "Confirmed".
      activityFire({ id: "automation_fire_ct_a", outcome: "fired", detail: { confirmedByUserId: "user_ct" }, firedAt: 1_700_000_002_000 }),
      // An arm that failed — the error terminal a host must notice, with its reason from `detail`.
      activityFire({ id: "automation_fire_ct_b", outcome: "action_error", detail: { error: "the tool timed out" }, firedAt: 1_700_000_001_000 }),
    ],
  });

  const component = await mount(<RoomActivityTabStory />);

  await cell(component, "Activity").click();
  // The fired row: its outcome badge + the trigger phrase + the confirmer marker.
  await expect(component.getByText("Fired", { exact: true })).toBeVisible();
  await expect(component.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(component.getByText("after every message").first()).toBeVisible();
  // The error row: the badge + the detail sentence the fire recorded.
  await expect(component.getByText("Action errored", { exact: true })).toBeVisible();
  await expect(component.getByText("the tool timed out", { exact: false })).toBeVisible();
});

test("B11: a MEMBER does NOT see the Activity tab (host-only, the fire log is the host's hand)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("member"),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<RoomActivityTabStory />);

  await expect(cell(component, "This chat")).toBeVisible();
  await expect(cell(component, "Activity")).toHaveCount(0);
});

test("B11: a HOST with no out-of-band activity sees the load-bearing empty state", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "automation.listChatActivity": () => [],
  });

  const component = await mount(<RoomActivityTabStory />);

  await cell(component, "Activity").click();
  await expect(component.getByText("Nothing yet", { exact: false })).toBeVisible();
});
