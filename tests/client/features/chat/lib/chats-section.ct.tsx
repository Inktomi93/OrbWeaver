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

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatContextPanelStory, ChatContextTabContributorStory, ChatDeletedWhileOpenStory, RoomActivityTabStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES } from "../fixtures.ts";

// #629 — the "This chat" tab's OWN section reads, which this file never stubbed. An unlisted proc answers
// `null`, which is NOT a view: MacroPicksSection (two suspending reads, `useSuspenseQueries`) and the
// Documents rack both threw on it, so those sections sat in their QueryBoundary ERROR arms in every case
// that opens the tab — invisible, because the section headings are Section kickers rendered OUTSIDE the
// boundary and the headings are all this file asserts. Found by the CT reporter's unfed-read census, whose
// per-file line for this test named all three. Empty declarations = each section's teaching empty state,
// the arm with the smallest blast radius on the heading/count assertions around them.
const THIS_CHAT_TAB_READS = {
  "chat.getUserMacroPicks": (): unknown => ({ macros: [], values: {} }),
  "chat.getVariablePicks": (): unknown => ({ variables: [], values: {} }),
  "databank.listActiveForChat": (): unknown => [],
  // #637 — the Books section (chat-books-section.tsx, landed in #630) joined this tab with a SUSPENDING
  // `worldInfo.listForChat`, so an unfed read threw into its QueryBoundary and the "no read-error surface"
  // assertion below reddened. Exactly the "including one added tomorrow" case that assertion was written
  // for, and the unfed-read ratchet named the procedure in the same run. Empty = the section's empty state.
  "worldInfo.listForChat": (): unknown => [],
};

/** One CELL of the pane's FOOT rail (the context bracket, #860): a BUTTON inside the toolbar named "Chat"
 *  (the section's `railLabel`), carrying `aria-current` while it holds the view — never a `tab` (#112, the
 *  rail model is universal now). `exact`, because the head band's roster chip is named "Members — N" and a
 *  loose match would seat the chip where the cell was meant. */
function cell(component: Locator, name: string): Locator {
  return component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name, exact: true });
}

const NATE_HOST_RE = /Nate — host/u;
const ARIA_CAST_RE = /Aria — character/u;
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
function human(role: ParticipantRole): Record<string, unknown> {
  return { kind: "human", role, userId: "user_ct", characterId: null };
}

// A character seat — the fields `resolveIsGroupChat` AND the Members Cast rows read (the §7.1 merge
// projects displayName/disabled/talkativeness/avatarHash into `MemberCastRow`s).
function character(key: string): Record<string, unknown> {
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
function chatDetail(role: ParticipantRole, roomOverrides: Record<string, string> = {}, characters: readonly Record<string, unknown>[] = []): unknown {
  return {
    participants: [human(role), ...characters],
    // `ChatDetail.cast` is server-populated on every getChat; a tab that resolves a seat's persona through it
    // (the Members tab) reads an empty producer as "this seat plays nobody", never as a crash.
    cast: [],
    roomOverrides,
    viewerIsHost: role === "host",
  };
}

// A minimal AssemblyPreview ({ prompt, trace }) — proves the Preview tab renders the assembled halves +
// the trace without asserting the assembler's own logic (that is the server's read.int.test's lane).
/** The Preview tab's System source-row drill-in trigger. */
const RE_SYSTEM_ROW = /System/;

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
  },
};

function emptyTrace(): Record<string, unknown> {
  return {
    staticSections: ["main_prompt"],
    dynamicSections: [],
    worldInfoIncluded: 0,
    worldInfoDropped: [],
    worldInfoActivated: [],
    matchedKeys: [],
    compactSummaryIncluded: false,
    memoryIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
    overrideSources: { mainPrompt: "room override" },
  };
}

// A PRESENT human seat with the fields the People tab renders (multi-human invites lane):
// `leftSeq: null` is load-bearing — the projection keeps only present seats. `activePersonaId` is equally
// load-bearing now: a human row renders the PERSONA it is playing, resolved against the room's cast producer
// (#162). The `handle` stays on the WIRE stub, spelled as an EMAIL exactly as an OIDC install ships it,
// because the point of the change is that no row can render it as a second identity beside the name.
function humanSeat(id: string, displayName: string, role: ParticipantRole): Record<string, unknown> {
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

/** The persona CAST entry a {@link humanSeat} is playing — what turns its `activePersonaId` into a name. */
function personaEntry(id: string, name: string): Record<string, unknown> {
  return { kind: "persona", id: `persona_${id}`, name, description: "", avatarHash: null };
}

// A `ChatDetail` stub for the People-tab cases — carries the server-resolved `viewerIsHost` (the
// invite-controls gate; NOT the first-seat proxy the older tabs still use) and the room's cast producer.
function multiHumanChat(viewerIsHost: boolean, humans: readonly Record<string, unknown>[]): unknown {
  return {
    participants: [...humans, character("aria")],
    cast: humans.map((h) => personaEntry(String(h["userId"]).replace("user_", ""), String(h["displayName"]))),
    roomOverrides: {},
    viewerIsHost,
  };
}

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
      ...(multiHumanChat(true, [humanSeat("ct", "Nate", "host")]) as object),
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
      updatedAt: 0,
    }),
  });
  const component = await mount(<ChatContextPanelStory />);

  const band = component.locator('[data-slot="context-bracket-band"]');
  const title = band.locator('[data-slot="chat-context-band-title"]');
  await expect(title).toHaveText("Example — The Ashen Spire");
  // WHOLE — a 2-line clamp is allowed, an ellipsis is not: the rendered box holds the whole run.
  await expect.poll(() => title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The chips: the roster chip (the ONE roster doorway, with its word), the standing memory control, the
  // viewer's active preset by NAME (a chat carries no preset binding — this is the viewer's, D58).
  await expect(band.getByRole("button", { name: "Members — 3" })).toBeVisible();
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

// RULING CHANGED (#162, owner 2026-08-17). This case used to assert the OPPOSITE — "host in a SOLO
// (1-character) chat sees no Members tab (D16 size-gate)" — because the Cast section demanded >=2
// characters. That floor is what produced the owner's live complaint: the Members tab is the room's ROSTER
// surface, and in a 1:1 room it rendered nothing but their own People row ("now it just shows my email").
// A room with a cast has a roster; the tab shows it. (There is no "size-gate" clause in the D-ledger — the
// old rule lived only in this title and a one-line roster.ts comment.)
test("host in a SOLO (1-character) chat GETS the Members tab — its cast is its roster (#162)", async ({ mount, page }) => {
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
  await expect(page.getByTestId("members-panel").getByRole("button", { name: ARIA_CAST_RE })).toBeVisible();
});

// The floor is ZERO for a HOST (owner ruling 2026-08-18): the Members tab is the room's one roster home in
// every state, so a cast-less room gets the tab with a load-bearing empty state instead of a hidden tab.
test("a HOST with NO cast still gets the Members tab — the empty state IS the add door", async ({ mount, page }) => {
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

test("a MEMBER with no cast and no People arm still has no Members tab (nothing to show, nothing to do)", async ({ mount, page }) => {
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
  // The Cast rows render with the row contract's accessible names.
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
  await expect(panel.locator('[data-slot="members-cast"]')).toBeVisible();
  await expect(panel.locator('[data-slot="members-people"]')).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Invite people" })).toHaveCount(0);
});

test("capable HOST: Members lists the humans (host chip) and the invite dialog mints by handle", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...THIS_CHAT_TAB_READS,
    "chat.getChat": () => multiHumanChat(true, [humanSeat("nate", "Nate", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "invites.listInvites": () => [],
    "invites.createInvite": () => ({
      invite: { id: "chatinvite_ct_new", status: "pending" },
      token: "tok_ct_minted",
    }),
  });
  await stubMultiHumanCapable(page, true);

  const component = await mount(<ChatContextPanelStory />);
  await cell(component, "Members").click();

  // The People section — humans differentiated from the seated cast, host crowned; the server
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
  await expect(component.getByText("It is raining.")).toBeVisible();

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
    "chat.getChat": { title: "The Ashfall Road", participants: [], cast: [], group: DEFAULT_GROUP_CONFIG },
    "chat.listMessages": { messages: [], cast: [] },
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

// ── B11: the room ACTIVITY tab (interaction-direction-spec §7 B11) ──────────────────────────────────
// A host-only CONTEXT-strip sibling grafted through the SAME contributor seam as the fake tab above, but
// with the REAL `automationActivityTab` def: it renders `RoomActivityLog` over `automation.listChatActivity`
// — this room's fire log across all its rules (fires · notices · plugin-tool runs · confirmed cards), each a
// row here (the ONE-HOME `automation_fires` store). Proven through the real section → factory → mint path.

// One fire-log row as the wire ships it (the FireView JSON crosses routeTrpc as a plain object).
function activityFire(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "automation_fire_ct",
    ruleId: "automation_rule_ct",
    chatId: "chat_ct_keystone",
    triggerType: "messageCommitted",
    outcome: "fired",
    detail: null,
    automationDepth: 0,
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
