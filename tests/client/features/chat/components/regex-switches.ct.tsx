// @subject packages/client/src/features/chat/components/regex-section.tsx
// @subject packages/client/src/features/chat/components/regex-tier-row.tsx
// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// The room's regex switches keep one stable name per item, `<setting>: <item>`; `aria-checked` alone carries the state.
import type { RegexTierKey } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  REGEX_ON_SCREEN_LIST,
  regexScriptEverywhereSwitchName,
  regexTierAllowedSwitchName,
  regexTierKicker,
  regexTierLever,
} from "#client/features/chat/lib/regex-section-model.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "regex.updateScript",
  "chat.listEffectiveRegex",
  "chat.setRegexAllow",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

async function hostRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      return { chatId: room.id, host };
    }
  }
  throw new Error("The corpus has no room the owner hosts");
}

type Placement = "AI_OUTPUT" | "DISPLAY";

function script(name: string, placement: Placement | readonly Placement[], enabled: boolean): ReturnType<typeof createRegexScriptSchema.parse> {
  return createRegexScriptSchema.parse({ name, findRegex: "x", replaceString: "y", placement: [placement].flat(), enabled });
}

test("script rows, the on-screen roster and the tier levers are found by their stable names, and a flip writes to its own item", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const roomOn = await host.regex.createScript({ input: script("Fix quotes", "AI_OUTPUT", true) });
  const roomOff = await host.regex.createScript({ input: script("Soften asides", "AI_OUTPUT", false) });
  const everywhere = await host.regex.createScript({ input: script("Trim stage notes", "AI_OUTPUT", true) });
  const shown = await host.regex.createScript({ input: script("Tint narration", "DISPLAY", true) });
  const dimmed = await host.regex.createScript({ input: script("Dim asides", "DISPLAY", false) });
  await host.regex.attachToChat({ chatId, scriptId: roomOn.id });
  await host.regex.attachToChat({ chatId, scriptId: roomOff.id });
  await host.regex.attachGlobal({ scriptId: everywhere.id });
  await host.chat.setRegexAllow({ chatId, lever: { kind: "tier", tier: "global", enabled: false } });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  const trpc = await routeTrpc(page, serveCorpusProcedures(host, TAB_PROCEDURES));
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  await page.getByRole("button", { name: /^Regex/u }).click();

  const labels = new Map<RegexTierKey, string>();
  const tierOn = page.getByRole("switch", { name: regexTierAllowedSwitchName(regexTierLever("chat", labels)), exact: true });
  const tierOff = page.getByRole("switch", { name: regexTierAllowedSwitchName(regexTierLever("global", labels)), exact: true });
  await expect(tierOn).toHaveAttribute("aria-checked", "true");
  await expect(tierOff).toHaveAttribute("aria-checked", "false");

  const rowOn = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(roomOn.name, regexTierKicker("chat", labels)), exact: true });
  const rowOff = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(roomOff.name, regexTierKicker("chat", labels)), exact: true });
  await expect(rowOn).toHaveAttribute("aria-checked", "true");
  await expect(rowOff).toHaveAttribute("aria-checked", "false");

  const displayOn = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(shown.name, REGEX_ON_SCREEN_LIST), exact: true });
  const displayOff = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(dimmed.name, REGEX_ON_SCREEN_LIST), exact: true });
  await expect(displayOn).toHaveAttribute("aria-checked", "true");
  await expect(displayOff).toHaveAttribute("aria-checked", "false");

  // These flips repaint from the bus, which a component mount does not carry, so the name is proved to bind its own item
  // by the write each click sends.
  await rowOff.click();
  await expect.poll(() => trpc.lastInput("regex.updateScript")).toMatchObject({ scriptId: roomOff.id, input: { enabled: true } });
  await displayOff.click();
  await expect.poll(() => trpc.lastInput("regex.updateScript")).toMatchObject({ scriptId: dimmed.id, input: { enabled: true } });
  await tierOff.click();
  await expect.poll(() => trpc.lastInput("chat.setRegexAllow")).toMatchObject({ chatId, lever: { kind: "tier", tier: "global", enabled: true } });
});

test("a script drawn in two lists, and two scripts that share a title in two tiers, each have a switch name of their own", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const both = await host.regex.createScript({ input: script("Tint and trim", ["AI_OUTPUT", "DISPLAY"], true) });
  const roomTwin = await host.regex.createScript({ input: script("Twin", "AI_OUTPUT", true) });
  const globalTwin = await host.regex.createScript({ input: script("Twin", "AI_OUTPUT", false) });
  await host.regex.attachToChat({ chatId, scriptId: both.id });
  await host.regex.attachToChat({ chatId, scriptId: roomTwin.id });
  await host.regex.attachGlobal({ scriptId: globalTwin.id });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  const trpc = await routeTrpc(page, serveCorpusProcedures(host, TAB_PROCEDURES));
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  await page.getByRole("button", { name: /^Regex/u }).click();

  const labels = new Map<RegexTierKey, string>();
  const roomList = regexTierKicker("chat", labels);
  const inRoom = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(both.name, roomList), exact: true });
  const onScreen = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(both.name, REGEX_ON_SCREEN_LIST), exact: true });
  await expect(inRoom).toHaveAttribute("aria-checked", "true");
  await expect(onScreen).toHaveAttribute("aria-checked", "true");

  const roomTwinSwitch = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(roomTwin.name, roomList), exact: true });
  const globalTwinSwitch = page.getByRole("switch", { name: regexScriptEverywhereSwitchName(globalTwin.name, regexTierKicker("global", labels)), exact: true });
  await expect(roomTwinSwitch).toHaveAttribute("aria-checked", "true");
  await expect(globalTwinSwitch).toHaveAttribute("aria-checked", "false");
  await globalTwinSwitch.click();
  await expect.poll(() => trpc.lastInput("regex.updateScript")).toMatchObject({ scriptId: globalTwin.id, input: { enabled: true } });
  await roomTwinSwitch.click();
  await expect.poll(() => trpc.lastInput("regex.updateScript")).toMatchObject({ scriptId: roomTwin.id, input: { enabled: false } });
});
