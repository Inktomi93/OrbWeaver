// CT: Settings → Connections → Model roles, the LIVE-vs-DRAFT contract (the 2026-08-01 owner incident).
// The pane is autosaved, so what it renders is FORM state: for two hours it showed a full
// "OpenRouter · Claude Sonnet 5 · Protocol Auto" row under a "Saved" chip while `roleDefaults` was NULL in
// the DB and every turn resolved the owner fallback. A row must therefore disclose, per row, whether it is
// showing the persisted connection or an unsaved draft — and name what a turn resolves meanwhile.
//
// Drives the PRODUCTION path: the real surface over the real data layer, with the reads + the
// `settings.updateUserSettingsSection` write stubbed at the network (routeTrpc). The write is GATED (held
// open) so the drafting states are observable rather than inferred. The bus is absent in CT, so the
// story's "refetch settings" button stands in for the `settingsChanged` refetch that `busDriven: true`
// mutations rely on.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import { ConnectionsSettingsHostedStory, ConnectionsSettingsStory } from "../_ct-stories.tsx";

const SYNC_CHIP = '[data-slot="role-row-sync"]';
const APP_DEFAULT = '[data-slot="role-app-default"]';
const AUTOSAVE_STATUS = '[data-slot="autosave-status"]';
const COMMAND_ITEM = '[data-slot="command-item"]';
/** The held write's route matcher (top-level per biome's useTopLevelRegex). */
const SAVE_ROUTE = /updateUserSettingsSection/;

const LIVE_MODEL = "anthropic/claude-sonnet-5";
const DRAFT_MODEL = "openai/gpt-5";
/** What a SECOND device persists under a live pane — never this session's own pick. */
const FOREIGN_MODEL = "anthropic/claude-opus-5";

/** The per-source facade the model cell + status dot read (connection.getModelsForSource). */
const OR_MODELS = {
  state: "ok",
  models: [
    { id: LIVE_MODEL, label: "Claude Sonnet 5", origin: "catalog" },
    { id: DRAFT_MODEL, label: "GPT-5", origin: "catalog" },
  ],
  fetchedAt: 1_700_000_000_000,
  defaultModelId: LIVE_MODEL,
  allowsFreeText: false,
};

/** The vLLM facade: the engine serves exactly the model it was LAUNCHED with, so the arm carries ONE
 *  config-origin entry and that id is the row's `defaultModelId` (get-models-for-source's vllm arm). */
const VLLM_MODEL = "Qwen/Qwen3-VL-8B-Instruct";
const VLLM_MODELS = {
  state: "ok",
  models: [{ id: VLLM_MODEL, label: VLLM_MODEL, origin: "config" }],
  fetchedAt: null,
  defaultModelId: VLLM_MODEL,
  allowsFreeText: false,
};

/** The settings stub's handle: the recorder plus a FOREIGN-write hook (another device/tab moving the stored
 *  row under a live pane — the case that decides whether the disclosure names the CURRENT persisted pair). */
interface SettingsStub {
  readonly recorder: TrpcRecorder;
  readonly setStored: (next: Record<string, unknown>) => void;
}

/** A stateful stub of the user-settings tier: the write stores the patch, the read serves it back — so the
 *  "did the pane go back to LIVE after the save landed?" arm runs against a real echo, not a scripted one. */
/** The owner's unconfigured chat default as the SERVER resolves it (resolve-role.ts: agent-sdk × the sub) —
 *  what the never-saved chat row names. `resolveFails` scripts the no-chat-connection rejection. */
const RESOLVED_CHAT = makeResolvedChatCapability({ api: "agent-sdk", source: "max-pro-sub", model: castId<ModelId>("claude-opus-5") });

async function stubSettings(page: Page, roleDefaults: Record<string, unknown>, opts: { readonly resolveFails?: boolean } = {}): Promise<SettingsStub> {
  let stored = roleDefaults;
  const view = (): unknown => ({
    userId: "user_ct_connections",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, routing: { roleDefaults: stored } },
    updatedAt: 0,
  });
  const recorder = await routeTrpc(page, {
    "settings.getUserSettings": () => view(),
    "sessions.me": () => ({ userId: "user_ct_connections", handle: "owner", globalRole: "owner" }),
    "credentials.list": () => [],
    // Per-SOURCE, like the real verb — a vllm row must not be handed the OpenRouter catalog's default.
    "connection.getModelsForSource": (input: unknown): unknown => ((input as { readonly source: string }).source === "vllm" ? VLLM_MODELS : OR_MODELS),
    "connection.resolveChatCapability": () => (opts.resolveFails === true ? trpcError({ message: "no chat connection configured" }) : RESOLVED_CHAT),
    "settings.updateUserSettingsSection": (input: unknown): unknown => {
      stored = (input as { readonly patch: { readonly roleDefaults: Record<string, unknown> } }).patch.roleDefaults;
      return view();
    },
  });
  return {
    recorder,
    setStored: (next: Record<string, unknown>): void => {
      stored = next;
    },
  };
}

/** Hold `updateUserSettingsSection` open; the returned fn lets it through. Registered AFTER routeTrpc so it
 *  wins the route, then `fallback()`s into the stub once released. */
async function gateTheSave(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(SAVE_ROUTE, async (route) => {
    await held;
    await route.fallback();
  });
  return release;
}

test("a drafted row says so and names what a turn still resolves; it reads LIVE again only once the save lands", async ({ mount, page }) => {
  const { recorder } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  const release = await gateTheSave(page);
  await mount(<ConnectionsSettingsStory />);

  // The persisted pane: every row IS the live connection, so nothing is disclosed and the status is honest.
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("Claude Sonnet 5");
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");

  // Pick a different model — an edit, not a save.
  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();

  // THE PIN: the row immediately admits it is a draft AND names the connection turns still use. The pane
  // header may not read "Saved" while a draft is on screen (the phantom the owner debugged from).
  await expect(page.locator(SYNC_CHIP)).toHaveCount(1);
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");
  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${LIVE_MODEL}`);
  await expect(page.locator(AUTOSAVE_STATUS).first()).not.toHaveText("Saved");

  // The debounce fires into the HELD mutation: the row escalates to its saving state — still not "Saved".
  await expect(page.locator(SYNC_CHIP)).toContainText("Saving…");
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saving…");

  // Let the write through, then replay the bus-driven settings refetch.
  release();
  await expect.poll(() => recorder.count("settings.updateUserSettingsSection")).toBe(1);
  // ONESHOT-OK: the poll above settled the recorder at exactly one recorded call — this reads THAT input.
  expect(recorder.lastInput("settings.updateUserSettingsSection")).toMatchObject({
    section: "routing",
    patch: { roleDefaults: { chat: { source: "openrouter", model: DRAFT_MODEL, api: "chat-completions" } } },
  });
  await page.getByRole("button", { name: "refetch settings" }).click();

  // Persisted at last: the disclosure retires itself and the pane reads Saved — the row IS the truth again.
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");
});

// THE 2026-08-02 STUCK-CHIP REGRESSION. The pane's whole honesty is computed against `settings.
// getUserSettings`, and the write that invalidates it is `busDriven: true` — so before this pin the
// disclosure could only retire when a `settingsChanged` bus tick came back and refetched the read. With the
// user-bus stream dropped/late (a reconnect gap, a coalesced invalidate), the owner's five 200-OK saves left
// the row stuck on "Not applied yet — a turn still uses OpenRouter · anthropic/claude-sonnet-…" over a
// selection the DB already held, and the pane's status stuck on "Saving…". A confirmed write is strictly
// newer than the snapshot it was computed from: the pane must trust its own landed save. NO refetch is
// replayed here — that is the point of the test.
test("a landed save retires the disclosure with NO refetch — a persisted selection is never called 'not applied'", async ({ mount, page }) => {
  const { recorder } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");

  await expect.poll(() => recorder.count("settings.updateUserSettingsSection")).toBe(1);

  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.locator(AUTOSAVE_STATUS).first()).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("GPT-5");
});

// The disclosure's OTHER failure direction: naming a stale pair. "A turn still uses X" is a claim about the
// SERVER's row right now, so it must track the live read — never the snapshot the editing session mounted
// on. A second device moving the stored row under a dirty pane must re-aim the sentence at the new pair.
test("a drafted row names the CURRENT persisted pair, not the baseline its session mounted on", async ({ mount, page }) => {
  const { setStored } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  const release = await gateTheSave(page);
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${LIVE_MODEL}`);

  // Another device rewrites the row; the pane's read refetches while this session's edit is still in flight.
  setStored({ chat: { source: "openrouter", model: FOREIGN_MODEL, api: "chat-completions" } });
  await page.getByRole("button", { name: "refetch settings" }).click();

  await expect(page.locator(SYNC_CHIP)).toContainText(`a turn still uses OpenRouter · ${FOREIGN_MODEL}`);
  // Still a draft (the held save never landed) — the disclosure re-aimed, it did not retire.
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("GPT-5");
  release();
});

// The other half of the incident — the owner picked a model and hit REFRESH — is NOT closed by a flush: a
// reload never unmounts React, and a `pagehide` handler was measured to dispatch nothing before teardown
// (create-autosave-entity-form.tsx documents the rejection). What IS closed is the honesty: a reload mid-edit
// re-seeds from the server, and the pane shows the PERSISTED row, never the lost draft dressed as saved.
test("a reload mid-edit shows the persisted connection again — the lost draft is not re-rendered as live", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  await page.getByRole("button", { name: "Chat model" }).click();
  await page.locator(COMMAND_ITEM).filter({ hasText: "GPT-5" }).click();
  await expect(page.locator(SYNC_CHIP)).toContainText("Unsaved");

  await page.reload();
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("Claude Sonnet 5");
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
});

// THE PROTOCOL-PAIR TURN-BREAKER. `(api, source)` is ONE selection server-side: `assertCoherent`
// (resolve-role.ts) THROWS on an incoherent pair at turn time. Switching the source used to clear only the
// MODEL, so OpenRouter × agent-sdk → vLLM persisted `{api:"agent-sdk", source:"vllm"}` — a chat that could
// not take a turn — while the picker healed the display to "Auto" and showed nothing wrong.
test("switching the source re-derives the protocol in the SAME patch — no incoherent pair is ever persisted", async ({ mount, page }) => {
  const { recorder } = await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "agent-sdk" } });
  await mount(<ConnectionsSettingsStory />);
  await expect(page.getByRole("combobox", { name: "Chat protocol" })).toContainText("Agent SDK");

  await page.getByRole("combobox", { name: "Chat provider" }).click();
  await page.getByRole("option", { name: "Local vLLM (GPU)" }).click();

  // The display and the store agree: vLLM cannot take agent-sdk, so the protocol is genuinely cleared.
  await expect(page.getByRole("combobox", { name: "Chat protocol" })).toContainText("Auto");
  await expect.poll(() => recorder.count("settings.updateUserSettingsSection")).toBe(1);
  // ONESHOT-OK: the poll settled the recorder at exactly one recorded call — this reads THAT input.
  expect(recorder.lastInput("settings.updateUserSettingsSection")).toMatchObject({
    section: "routing",
    patch: { roleDefaults: { chat: { source: "vllm", model: null, api: null } } },
  });
});

// The display half of the same pin: the picker renders the STORED protocol, never a healed stand-in. The old
// `value={legal ? stored : ""}` fallback is exactly why the incoherent pair survived unnoticed — the pane
// read "Auto" over a store that held agent-sdk. Data written before the fix must SHOW its illegal pair.
test("an incoherent stored pair is displayed, not healed away — the picker never shows a value the store lacks", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "vllm", model: "", api: "agent-sdk" } });
  await mount(<ConnectionsSettingsStory />);

  const protocol = page.getByRole("combobox", { name: "Chat protocol" });
  await expect(protocol).toContainText("Agent SDK");
  await expect(protocol).toContainText("not supported by this provider");
  // No draft chip: nothing was edited — the pane is faithfully showing what the server holds.
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
});

// THE MODEL-PAIR TURN-BREAKER (the owner's live row, 2026-07-31). `{source:"vllm",
// model:"anthropic/claude-sonnet-5"}` 404s every local turn — and the pane showed nothing wrong: the static
// vllm cell rendered the STORED id under a "server config" chip, so a foreign pin read as the engine's own
// configuration. The cell now renders what a turn actually SENDS (the configured model, which is what the
// resolver heals to) and calls the ignored pin out by name, so the store is on screen either way.
test("a stored model a server-configured source cannot serve is NOT rendered as the server config", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "vllm", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  const chatRow = page.locator('[data-slot="role-slot-row"]').first();
  // What a turn sends — the engine's launch model, never the pin.
  await expect(chatRow).toContainText(VLLM_MODEL);
  // The pin is disclosed, not silently displayed-as-truth.
  const pinAlert = chatRow.locator('[data-slot="ignored-model-pin"]');
  await expect(pinAlert).toBeVisible();
  await expect(pinAlert).toContainText(LIVE_MODEL);
  await expect(pinAlert).toContainText("only serves its configured model");
});

test("a config-derived row with NO stored pin shows the configured model plainly — no false alarm", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "vllm", model: "", api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  const chatRow = page.locator('[data-slot="role-slot-row"]').first();
  await expect(chatRow).toContainText(VLLM_MODEL);
  await expect(chatRow.locator('[data-slot="ignored-model-pin"]')).toHaveCount(0);
});

test("a NEVER-SAVED pane does not read as configured — the rows name the app default, not a selection", async ({ mount, page }) => {
  // roleDefaults NULL in the DB: exactly the owner's 08:43–10:27 state.
  await stubSettings(page, {});
  await mount(<ConnectionsSettingsStory />);

  await expect(page.getByText("Uses the app default").first()).toBeVisible();
  // Nothing is drafted, so nothing is disclosed — and no row claims a provider/model it never had.
  await expect(page.locator(SYNC_CHIP)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chat model" })).toHaveCount(0);
});

// "Uses the app default" named NOTHING: the pane that configures the connection could not tell the owner
// which connection a turn would actually take. The chat row now names the RESOLVER's answer
// (`connection.resolveChatCapability` — the caller's own resolution, identity included).
test("the never-saved CHAT row NAMES the resolved fallback a turn would use", async ({ mount, page }) => {
  await stubSettings(page, {});
  await mount(<ConnectionsSettingsStory />);

  // api × source × model, exactly as the server resolved it (the story's stub: the owner's sub default).
  await expect(page.locator(APP_DEFAULT).first()).toHaveText(
    "Uses the app default: Claude subscription (host) · claude-opus-5 · Agent SDK (Claude subscription)",
  );
  // The roles with no such one-hop read stay honest rather than guess — they name nothing.
  await expect(page.locator(APP_DEFAULT).last()).toHaveText("Uses the app default");
});

test("an unresolvable chat connection degrades to the bare line — never a fabricated name", async ({ mount, page }) => {
  await stubSettings(page, {}, { resolveFails: true });
  await mount(<ConnectionsSettingsStory />);

  await expect(page.locator(APP_DEFAULT).first()).toHaveText("Uses the app default");
});

// ── side-eye 2026-08-06 ────────────────────────────────────────────────────────────────────────────
// P3: the resolved chat default is the ONE informative hint on this pane, and it was `truncate`d — in the
// real settings modal it read "…Claude subscription (host) · cl…", eating the model name, which is the whole
// reason the row resolves anything. The text is in the DOM either way (`truncate` clips by overflow), so the
// assertion above cannot see it; this reads the RESOLVED property that decides whether it can clip at all.
test("the resolved app-default hint WRAPS — it is the one line on this pane that must be readable in full", async ({ mount, page }) => {
  await stubSettings(page, {});
  await mount(<ConnectionsSettingsStory />);

  const hint = page.locator(APP_DEFAULT).first();
  await expect(hint).toBeVisible();
  await expect(hint).not.toHaveCSS("white-space", "nowrap");
  await expect(hint).not.toHaveCSS("text-overflow", "ellipsis");
});

// P3: the chat row's Protocol sub-select sat ~40px right of the six source selects it belongs under — the
// one control on the pane that did not line up, because the sub-row inset by the label column and THEN spent
// the word "Protocol" out of the source column's width.
test("the chat row's Protocol select shares the SOURCE column's left edge", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsStory />);

  const source = page.getByRole("combobox", { name: "Chat provider" });
  const protocol = page.getByRole("combobox", { name: "Chat protocol" });
  await expect(source).toBeVisible();
  await expect(protocol).toBeVisible();
  const [sourceBox, protocolBox] = await Promise.all([source.boundingBox(), protocol.boundingBox()]);
  expect(sourceBox).not.toBeNull();
  expect(protocolBox).not.toBeNull();
  expect(sourceBox === null || protocolBox === null ? 999 : Math.abs(sourceBox.x - protocolBox.x)).toBeLessThan(1.5);
});

// P2: under an aggregate save-status HOST (how the settings shell mounts every pane) this one used to add a
// SECOND home and a second wording for "Saved" — a bare chip top-right against the shell's one bottom-left
// "Saved · Synced across your devices." It now REPORTS through the §3 seam: nothing inline at rest, and the
// aggregate carries the state. The unhosted arm (every test above) is unchanged — a section with no host
// still renders its own status, which is what the seam's degrade arm is for.
test("hosted: Model roles reports into the aggregate instead of painting its own 'Saved'", async ({ mount, page }) => {
  await stubSettings(page, { chat: { source: "openrouter", model: LIVE_MODEL, api: "chat-completions" } });
  await mount(<ConnectionsSettingsHostedStory />);

  // Barrier on a SETTLED rendered arm of the pane before reading the status seam.
  await expect(page.getByRole("button", { name: "Chat model" })).toContainText("Claude Sonnet 5");
  await expect(page.getByTestId("aggregate")).toHaveText("saved");
  await expect(page.locator(AUTOSAVE_STATUS)).toHaveCount(0);
});

// P2: two "Add key" primaries in one viewport — the section header's and the empty state's — 60px apart,
// neither obviously the next click. The empty state owns the verb while there is nothing to list.
test("with no keys saved there is exactly ONE 'Add key' — the empty state's", async ({ mount, page }) => {
  await stubSettings(page, {});
  await mount(<ConnectionsSettingsStory />);

  // EmptyState's title is a `<p>`, not a heading — barrier on the settled empty arm before the count.
  await expect(page.getByText("No keys yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add key" })).toHaveCount(1);
});
