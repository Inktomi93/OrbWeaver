// CT: the chats section's COMMITTED context (chats-section.tsx's `defineContextTabs` over the committed
// arm of ChatContextState, rendered through the real SectionContextHost — members · overrides · group ·
// preview · injections). Drives the production path over the stubbed network (routeTrpc):
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
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatContextPanelStory, ChatContextTabContributorStory } from "../_ct-stories";

const NATE_HOST_RE = /Alex — host/u;
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
function human(role: "host" | "member"): Record<string, unknown> {
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
function chatDetail(role: "host" | "member", roomOverrides: Record<string, string> = {}, characters: readonly Record<string, unknown>[] = []): unknown {
  return {
    participants: [human(role), ...characters],
    roomOverrides,
    viewerIsHost: role === "host",
  };
}

// A minimal AssemblyPreview ({ prompt, trace }) — proves the Preview tab renders the assembled halves +
// the trace without asserting the assembler's own logic (that is the server's read.int.test's lane).
const PREVIEW = {
  prompt: {
    static: "SYSTEM: be a helpful guide",
    dynamic: "",
    afterHistory: [],
    sendHistory: true,
    trace: emptyTrace(),
  },
  trace: emptyTrace(),
};

function emptyTrace(): Record<string, unknown> {
  return {
    staticSections: ["main_prompt"],
    dynamicSections: [],
    worldInfoIncluded: 0,
    worldInfoDropped: [],
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
// `leftSeq: null` is load-bearing — `resolveHumanParticipants` keeps only present seats.
function humanSeat(id: string, displayName: string, role: "host" | "member"): Record<string, unknown> {
  return {
    id: `participant_${id}`,
    kind: "human",
    role,
    userId: `user_${id}`,
    characterId: null,
    displayName,
    handle: displayName.toLowerCase(),
    avatarHash: null,
    leftSeq: null,
  };
}

// A `ChatDetail` stub for the People-tab cases — carries the server-resolved `viewerIsHost` (the
// invite-controls gate; NOT the first-seat proxy the older tabs still use).
function multiHumanChat(viewerIsHost: boolean, humans: readonly Record<string, unknown>[]): unknown {
  return {
    participants: [...humans, character("aria")],
    roomOverrides: {},
    viewerIsHost,
  };
}

test("host sees all three tabs (Settings · Preview · Injections)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  // Overrides + Group consolidated into ONE "Settings" tab (CP-1): the strip is now Settings · Preview ·
  // Injections (Members gated out in this solo chat) — never the pre-CP-1 5-tab clip.
  await expect(component.getByRole("tab", { name: "Settings" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Overrides" })).toHaveCount(0);
  await expect(component.getByRole("tab", { name: "Group" })).toHaveCount(0);
  await expect(component.getByRole("tab", { name: "Preview" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Injections" })).toBeVisible();
  // The Appearance overrides + (host+group) Group behavior are SECTIONS inside the tab, with real h3s.
  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
});

test("host in a SOLO (1-character) chat sees no Members tab (D16 size-gate)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", {}, [character("aria")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  // Preview stays (host-only, not group-gated); Members is hidden — the Cast section needs ≥2
  // characters and the People section needs a multi-human install with >1 human (§7).
  await expect(component.getByRole("tab", { name: "Preview" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Members" })).toHaveCount(0);
});

test("host in a GROUP (2-character) chat sees the Members tab AND it is the default tab (§7)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextPanelStory />);

  const members = component.getByRole("tab", { name: "Members" });
  await expect(members).toBeVisible();
  // The §7 ONE rule: with no tab requested, a group composition opens to Members.
  await expect(members).toHaveAttribute("aria-selected", "true");
  // The Cast rows render with the row contract's accessible names.
  await expect(component.getByRole("button", { name: "Aria — character" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Bryn — character" })).toBeVisible();
});

// ── CP-1 group-level omit matrix: the merged Settings tab's "Group behavior" section is host+group-only ──
// The gate that used to hide the WHOLE Group tab (chats-section.tsx `when: isHost && isGroupChat`) now
// gates the SECTION inside Settings. HOST of a group chat sees it; a MEMBER of the same group does not.

test("CP-1: HOST of a group chat sees the Group behavior section inside Settings", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    // The group section suspends on its own read (getGroupConfig) — the Group tab body's query, unchanged.
    "chat.getGroupConfig": () => ({ ...DEFAULT_GROUP_CONFIG }),
  });

  const component = await mount(<ChatContextPanelStory />);
  // Members is the default in a group; open Settings to reach the sections.
  await component.getByRole("tab", { name: "Settings" }).click();

  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toBeVisible();
});

test("CP-1: MEMBER of a group chat sees Settings but NOT the Group behavior section (§8.1 host-only omit)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("member", {}, [character("aria"), character("bryn")]),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByRole("tab", { name: "Settings" }).click();

  // Appearance overrides is present (read-only for a member); Group behavior is omitted for a non-host.
  await expect(component.getByRole("heading", { name: "Appearance overrides", level: 3 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
});

test("NOT multi-human capable → no People section anywhere (single-user renders no invite surface)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => multiHumanChat(true, [humanSeat("alex", "Alex", "host")]),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  // The default story mounts WITHOUT the capability prop — the single-user composition.
  const component = await mount(<ChatContextPanelStory />);

  await expect(component.getByRole("tab", { name: "Settings" })).toBeVisible();
  // One character + one human, no capability ⇒ no Members tab at all (both sections empty).
  await expect(component.getByRole("tab", { name: "Members" })).toHaveCount(0);
});

test("capable HOST: Members lists the humans (host chip) and the invite dialog mints by handle", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => multiHumanChat(true, [humanSeat("alex", "Alex", "host"), humanSeat("buddy", "Buddy", "member")]),
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
  await component.getByRole("tab", { name: "Members" }).click();

  // The People section — humans differentiated from the seated cast, host crowned; the server
  // `viewerIsHost:true` also means the viewer's own seat carries the "you" marker on the owner's row.
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
  const input = trpc.lastInput("invites.createInvite") as {
    chatId?: unknown;
    input?: { invitedHandle?: unknown };
  };
  expect(input.chatId).toBe("chat_ct_keystone");
  expect(input.input?.invitedHandle).toBe("frodo");
});

test("capable MEMBER: Members shows who's here but NO invite/kick controls (host-only mirror)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => multiHumanChat(false, [humanSeat("alex", "Alex", "host"), humanSeat("buddy", "Buddy", "member")]),
    "chat.listChatInjections": () => [],
  });
  await stubMultiHumanCapable(page, true);

  const component = await mount(<ChatContextPanelStory />);
  await component.getByRole("tab", { name: "Members" }).click();

  const panel = page.getByTestId("members-panel");
  await expect(panel.getByRole("button", { name: NATE_HOST_RE })).toBeVisible();
  // No invite header action; no kick menu on another human's row (zero actions ⇒ no menu opens).
  await expect(panel.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await panel.getByRole("button", { name: NATE_HOST_RE }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("member loses the Preview tab and the overrides are read-only", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("member", { mainPrompt: "Be terse." }),
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<ChatContextPanelStory />);

  await expect(component.getByRole("tab", { name: "Settings" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Injections" })).toBeVisible();
  // Preview is host-only (previewAssembly is a host debug surface) — hidden for a member.
  await expect(component.getByRole("tab", { name: "Preview" })).toHaveCount(0);
  // A non-host member sees NO "Group behavior" section (the §8.1 host-only omit, moved to section level).
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // The Appearance-overrides main-prompt field seeded from the server value, but disabled (a member
  // cannot edit) — the override control is still reachable inside the merged Settings tab.
  const mainPrompt = component.getByLabel("Main prompt", { exact: true });
  await expect(mainPrompt).toHaveValue("Be terse.");
  await expect(mainPrompt).toBeDisabled();
});

test("migrated tabs obey the server host field, NOT the first-seat proxy (member behind a host seat sees no host UI)", async ({ mount, page }) => {
  await routeTrpc(page, {
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
  await expect(component.getByRole("tab", { name: "Settings" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Preview" })).toHaveCount(0);
  // The Group-behavior SECTION obeys the server host field too — a member behind a host seat sees none.
  await expect(component.getByRole("heading", { name: "Group behavior", level: 3 })).toHaveCount(0);
  // Overrides seed from the server value but stay read-only — the member cannot edit even though a
  // host holds the first human seat.
  const mainPrompt = component.getByLabel("Main prompt", { exact: true });
  await expect(mainPrompt).toHaveValue("Be terse.");
  await expect(mainPrompt).toBeDisabled();
});

test("the Preview tab renders the assembled prompt + trace", async ({ mount, page }) => {
  await routeTrpc(page, {
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
  await component.getByRole("tab", { name: "Preview" }).click();

  // The static prompt text and the trace section both render (read-only).
  await expect(component.getByText("SYSTEM: be a helpful guide")).toBeVisible();
  await expect(component.getByText("Trace")).toBeVisible();
  // The override-source attribution line (orbweaver's richer-than-neo trace).
  await expect(component.getByText("room override")).toBeVisible();
});

test("host adds an injection (setChatInjection fires with no id ⇒ create)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
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
  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("No injections yet.")).toBeVisible();

  await component.getByRole("button", { name: "Add injection" }).click();

  await expect.poll(() => trpc.count("chat.setChatInjection"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.setChatInjection") as { id?: unknown; position?: unknown };
  // A create carries NO id (the server mints it) and the default position.
  expect(input.id).toBeUndefined();
  expect(input.position).toBe("in_chat");
});

test("host removes an injection (deleteChatInjection fires with the row id)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
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
  await component.getByRole("tab", { name: "Injections" }).click();
  await expect(component.getByText("It is raining.")).toBeVisible();

  await component.getByRole("button", { name: "Remove injection" }).click();

  await expect.poll(() => trpc.count("chat.deleteChatInjection"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.deleteChatInjection") as { injectionId?: unknown };
  expect(input.injectionId).toBe("chat_injection_a");
});

test("host editing an override autosaves (setRoomOverrides fires, empty ⇒ omitted)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({ scenario: "A rainy dock." }),
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByLabel("Scenario", { exact: true }).fill("A rainy dock.");

  await expect.poll(() => trpc.count("chat.setRoomOverrides"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const input = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { scenario?: string; mainPrompt?: string };
  };
  expect(input.overrides?.scenario).toBe("A rainy dock.");
  // Empty fields are omitted (inherit), not sent as "".
  expect(input.overrides).not.toHaveProperty("mainPrompt");
});

test("host sets the author's-note depth — the injection directive is saved (task #22)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({ authorsNote: { prompt: "Keep it tense.", depth: 2 } }),
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByLabel("Author's note", { exact: true }).fill("Keep it tense.");
  // The NumberField seeds the house default depth; clear before typing so the value replaces, not appends.
  await component.getByLabel("Depth", { exact: true }).clear();
  await component.getByLabel("Depth", { exact: true }).fill("2");

  await expect
    .poll(() => {
      const last = trpc.lastInput("chat.setRoomOverrides") as {
        overrides?: { authorsNote?: { prompt?: string; depth?: number; role?: string } };
      } | null;
      return last?.overrides?.authorsNote?.depth ?? null;
    })
    .toBe(2);
  const input = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { authorsNote?: { prompt?: string; depth?: number; role?: string } };
  };
  // The note is the shared directive: prompt + host-set depth + the default role (system).
  expect(input.overrides?.authorsNote).toEqual({
    prompt: "Keep it tense.",
    depth: 2,
    role: "system",
  });
});

test("assistant role at depth 0 surfaces the author's-note prefill warning", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({}),
  });

  const component = await mount(<ChatContextPanelStory />);
  await component.getByLabel("Author's note", { exact: true }).fill("Whisper it.");
  await component.getByLabel("Depth", { exact: true }).clear();
  await component.getByLabel("Depth", { exact: true }).fill("0");
  await component.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Assistant" }).click();

  await expect(component.getByText("response prefill", { exact: false })).toBeVisible();
});

test("an invalid author's-note combo does NOT hostage a sibling edit; fixing it resumes note saves", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
    "chat.setRoomOverrides": () => ({}),
  });

  const component = await mount(<ChatContextPanelStory />);
  // Put the note into the invalid assistant@depth-0 prefill combo.
  await component.getByLabel("Author's note", { exact: true }).fill("Whisper it.");
  await component.getByLabel("Depth", { exact: true }).clear();
  await component.getByLabel("Depth", { exact: true }).fill("0");
  await component.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Assistant" }).click();
  await expect(component.getByText("response prefill", { exact: false })).toBeVisible();

  // A sibling edit STILL persists — the whole-blob write carries scenario with the invalid note WITHHELD.
  await component.getByLabel("Scenario", { exact: true }).fill("A rainy dock.");
  await expect
    .poll(() => {
      const last = trpc.lastInput("chat.setRoomOverrides") as {
        overrides?: { scenario?: string; authorsNote?: unknown };
      } | null;
      return last?.overrides?.scenario ?? null;
    })
    .toBe("A rainy dock.");
  const invalidTurn = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { scenario?: string; authorsNote?: unknown };
  };
  expect(invalidTurn.overrides?.scenario).toBe("A rainy dock.");
  // The invalid note is not on the wire (siblings are never hostage to a field the user was warned about).
  expect(invalidTurn.overrides).not.toHaveProperty("authorsNote");

  // Fixing the combo (depth ≥ 1) resumes note saves — the directive now lands with its host-set depth/role.
  await component.getByLabel("Depth", { exact: true }).clear();
  await component.getByLabel("Depth", { exact: true }).fill("1");
  await expect
    .poll(() => {
      const last = trpc.lastInput("chat.setRoomOverrides") as {
        overrides?: { authorsNote?: { prompt?: string; depth?: number; role?: string } };
      } | null;
      return last?.overrides?.authorsNote?.depth ?? null;
    })
    .toBe(1);
  const fixedTurn = trpc.lastInput("chat.setRoomOverrides") as {
    overrides?: { authorsNote?: { prompt?: string; depth?: number; role?: string } };
  };
  expect(fixedTurn.overrides?.authorsNote).toEqual({
    prompt: "Whisper it.",
    depth: 1,
    role: "assistant",
  });
});

// ── The chat-context CONTRIBUTOR seam (client-architecture-lockdown.md §6c/M8) ──────────────────────
// The seam itself was built at M3 (`defineContextTabs`'s `contributors` arm), but no CT had ever mounted
// a LIVE contributor through it — every prior test drove the panel's OWN 5 tabs. This proves a fake
// `ContextTabDef<ChatContextState>`, registered at a door-mirroring `CtChatContributorSectionRegistry` in
// place of main.tsx's empty registry, renders as a real tab AND `when`-gates, through the REAL
// section → factory → mint → resolve path (not a bespoke test double of the seam).

test("a fake context-tab contributor renders as a tab, in the real tab strip", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextTabContributorStory visible={true} />);

  await expect(component.getByRole("tab", { name: "Fake Tab" })).toBeVisible();
  await component.getByRole("tab", { name: "Fake Tab" }).click();
  await expect(component.getByTestId("ct-fake-context-tab-body")).toBeVisible();
});

test("a fake context-tab contributor's `when:false` hides it from the real tab strip", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => chatDetail("host"),
    "chat.listChatInjections": () => [],
    "chat.previewAssembly": () => PREVIEW,
  });

  const component = await mount(<ChatContextTabContributorStory visible={false} />);

  await expect(component.getByRole("tab", { name: "Settings" })).toBeVisible();
  await expect(component.getByRole("tab", { name: "Fake Tab" })).toHaveCount(0);
});
