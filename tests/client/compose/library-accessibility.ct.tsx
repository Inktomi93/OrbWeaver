import { timeLib } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness, seedCorpusConnections } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CAPTION = "Wayfinding witness";
const ROW_MODES = ["pointer", "keyboard"] as const;
const CAPTION_CASES = [
  { captioned: true, key: "Enter" },
  { captioned: false, key: "Space" },
] as const;

type Root = Awaited<ReturnType<typeof createFirstBootHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type Character = Awaited<ReturnType<Caller["character"]["create"]>>;
type ChatRow = Awaited<ReturnType<Caller["chat"]["listChats"]>>["items"][number];

interface LibrarySubjects {
  readonly caller: Caller;
  readonly captioned: Character;
  readonly plain: Character;
  readonly starred: Character;
  readonly caption: string;
  readonly captionedRoom: ChatId;
  readonly plainRoom: ChatId;
  readonly row: {
    readonly title: NonNullable<ChatRow["title"]>;
    readonly preview: NonNullable<ChatRow["lastMessagePreview"]>;
    readonly at: NonNullable<ChatRow["lastMessageAt"]>;
  };
}

async function librarySubjects(root: Root): Promise<LibrarySubjects> {
  const caller = await root.internalCallerFor(root.ownerId);
  await seedCorpusConnections(root, await root.principalFor(root.ownerId));
  const captioned = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "native-captioned", name: "Captioned navigator", description: "A navigator with a visible card tag." }),
  });
  const plain = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "native-plain", name: "Quiet navigator", description: "A navigator without a pitch or card tags." }),
  });
  const starred = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "native-starred",
      name: "Starred navigator",
      description: "A starred card with a room that must not replace its editor door.",
    }),
  });
  await caller.character.bulkAddCardTag({ tagName: CAPTION, characterIds: [captioned.id] });
  await caller.character.update({ characterId: starred.id, input: { starred: true } });

  async function roomFor(characterId: CharacterId, title: string, content: string): Promise<ChatId> {
    const { chat } = await caller.chat.startChat({ characterIds: [characterId], opening: "none" });
    await caller.chat.updateTitle({ chatId: chat.id, title });
    await caller.chat.commitMessage({ chatId: chat.id, content, timeZone: UTC_TIME_ZONE });
    return chat.id;
  }

  const captionedRoom = await roomFor(captioned.id, "Captioned navigation room", "The northern beacon remains visible.");
  const plainRoom = await roomFor(plain.id, "Quiet navigation room", "The southern beacon remains visible.");
  await roomFor(starred.id, "Starred navigation room", "The western beacon remains visible.");
  const chats = (await caller.chat.listChats({ limit: 100 })).items;
  const row = chats.find((chat) => chat.id === captionedRoom);
  if (row === undefined || row.title === null || row.lastMessagePreview === null || row.lastMessageAt === null) {
    throw new Error("The production chat list omitted the persisted named room or message preview");
  }
  const characters = (await caller.character.list({ limit: 100, archived: false })).items;
  const tagged = characters.find((character) => character.id === captioned.id);
  const tag = tagged?.tags.find((entry) => entry.name === CAPTION);
  if (tag === undefined) {
    throw new Error("The production character list omitted the persisted card tag");
  }
  return {
    caller,
    captioned,
    plain,
    starred,
    caption: tag.name,
    captionedRoom,
    plainRoom,
    row: { title: row.title, preview: row.lastMessagePreview, at: row.lastMessageAt },
  };
}

async function routeLibrary(page: Page, subjects: Awaited<ReturnType<typeof librarySubjects>>): Promise<void> {
  await routeTrpc(
    page,
    serveCorpusProcedures(subjects.caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "tag.listTagFilterVocabulary",
      "persona.list",
      "rosterPreset.count",
      "databank.bankHealth",
      "notifications.list",
      "plugin.listCommands",
      "automation.listRulePresets",
      "chat.reapTemporaryChats",
    ]),
  );
}

async function expectRoom(page: Page, title: string): Promise<void> {
  await expect(page.getByRole("group", { name: "Message composer", exact: true })).toBeVisible();
  await expect(page.locator(".shell-topbar-subtitle")).toHaveText(title);
}

test.use({ viewport: { width: 1440, height: 1000 } });

for (const mode of ROW_MODES) {
  test(`native library ListRow keeps its preview and timestamp as a description and opens its room by ${mode}`, async ({ page, corpus, mount }) => {
    await using root = await createFirstBootHarness();
    const subjects = await librarySubjects(root);
    await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
    await routeLibrary(page, subjects);
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    const row = page.getByRole("list", { name: "Chats list", exact: true }).getByRole("button", { name: subjects.row.title, exact: true });
    const subtitle = row.locator('[data-slot="list-row-subtitle"]');
    const stamp = timeLib.formatRelativeCompact(subjects.row.at);
    await expect(subtitle).toHaveText(subjects.row.preview);
    await expect(row.locator('[data-slot="list-row-meta"]')).toBeVisible();
    await expect(row.locator('[data-slot="list-row-meta"]')).toHaveText(stamp);
    await expect(row).toHaveAccessibleDescription(`${subjects.row.preview} ${stamp}`);
    if (mode === "pointer") {
      const box = await subtitle.boundingBox();
      if (box === null) {
        throw new Error("The visible preview has no pointer target");
      }
      await subtitle.click({ position: { x: box.width / 4, y: box.height / 2 } });
    } else {
      await row.focus();
      await page.keyboard.press("Enter");
    }
    await expectRoom(page, subjects.row.title);
  });
}

for (const scenario of CAPTION_CASES) {
  test(`native library shelf ${scenario.captioned ? "caption" : "no-caption"} keeps its description and resumes its room by ${scenario.key}`, async ({
    page,
    corpus,
    mount,
  }) => {
    await using root = await createFirstBootHarness();
    const subjects = await librarySubjects(root);
    const character = scenario.captioned ? subjects.captioned : subjects.plain;
    const chatId = scenario.captioned ? subjects.captionedRoom : subjects.plainRoom;
    const room = await subjects.caller.chat.getChat({ chatId });
    await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
    await routeLibrary(page, subjects);
    await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    const face = page
      .getByRole("list", { name: "Recently chatted", exact: true })
      .getByRole("button", { name: new RegExp(RegExp.escape(character.name), "u") });
    const stamp = await face.locator('[data-voice="datumMono"]').textContent();
    await expect(face).toHaveAccessibleName(`Resume the chat with ${character.name}, ${stamp}`);
    await expect(face).toHaveAccessibleDescription(scenario.captioned ? subjects.caption : "");
    await expect(face.getByText(subjects.caption, { exact: true })).toBeVisible({ visible: scenario.captioned });
    await face.focus();
    await page.keyboard.press(scenario.key);
    await expectRoom(page, room.title ?? "");
  });
}

test("native library starred shelf opens the character editor by keyboard even when the character has a room", async ({ page, corpus, mount }) => {
  await using root = await createFirstBootHarness();
  const subjects = await librarySubjects(root);
  const count = await subjects.caller.character.count({ starred: true, archived: false });
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeLibrary(page, subjects);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const face = page
    .getByRole("list", { name: `Starred · ${count}`, exact: true })
    .getByRole("button", { name: `${subjects.starred.name}, starred`, exact: true });
  await expect(face).toHaveAccessibleDescription("");
  await face.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: "Edit character", exact: true }).getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
    subjects.starred.name,
  );
});
