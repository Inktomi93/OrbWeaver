// @subject packages/client/src/lib/connection-roles.ts
// A connection's label wraps at a phone's width and 200% text without a line that opens on the separator's dot, and a
// model id that has to split falls at a slash. Each role's picker and its open list read the one label.
import { ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { CONNECTION_LABEL_SEPARATOR } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const STORY = "tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory";
const PROVIDER = "custom-openai";
const TEXT_200 = 2;
// Letters and digits only, so the only break a browser can take inside it is one at a slash; each segment fits a line.
const SLASHED_MODEL = "vendorlab/familytuned/instruct2025";
// Prefixes of one phrase, a character longer each. The dot lands at the head of a line only when the words before it
// fill the line to within the width of " ·", so a run of lengths reaches that window at any width the list has.
const PHRASE = "lorem ipsum dolor sit amet consectetur adipiscing elit";
const FIRST_PREFIX = 8;
const LAST_PREFIX = 30;
const SEPARATOR_DOT = CONNECTION_LABEL_SEPARATOR.trim();

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

interface AddedConnection {
  readonly id: UserConnectionId;
  readonly label: string;
}

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function addConnection(caller: Caller, model: string, label?: string): Promise<AddedConnection> {
  const created = await caller.connection.create({
    providerId: PROVIDER,
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model,
    allowBackground: true,
    ...(label === undefined ? {} : { label }),
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, output: {}, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
      features: { detectServer: false },
    },
  });
  return { id: created.id, label: created.label };
}

async function serveRoles(page: Page, corpus: CorpusPlayback, root: ServerTestHarness, caller: Caller): Promise<void> {
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "preset.list",
    ]),
  });
}

/** What each matched element's text painted, one string per line, by the block position of every character. A zero-width
 *  break opportunity and collapsed whitespace paint no width, so they are in no line. */
async function paintedLines(targets: Locator): Promise<string[][]> {
  return await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const range = document.createRange();
      const painted: { readonly character: string; readonly top: number }[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const content = node.textContent ?? "";
        for (let at = 0; at < content.length; at += 1) {
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          const rect = range.getClientRects().item(0);
          if (rect !== null && rect.width > 0) {
            painted.push({ character: content.charAt(at), top: Math.round(rect.top) });
          }
        }
      }
      return [...new Set(painted.map((entry) => entry.top))].map((top) =>
        painted
          .filter((entry) => entry.top === top)
          .map((entry) => entry.character)
          .join(""),
      );
    }),
  );
}

const startsOnSeparator = (line: string): boolean => line.trimStart().startsWith(SEPARATOR_DOT);

/** The character each line break inside `id` follows. */
function breaksInside(lines: readonly string[], id: string): string[] {
  const text = lines.join("");
  const start = text.indexOf(id);
  expect(start).toBeGreaterThanOrEqual(0);
  const follows: string[] = [];
  let end = 0;
  for (const line of lines.slice(0, -1)) {
    end += line.length;
    if (end > start && end < start + id.length) {
      follows.push(text.charAt(end - 1));
    }
  }
  return follows;
}

function chatRole(): (typeof ROLE_ROWS_ORDERED)[number] {
  const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === "chat");
  if (row === undefined) {
    throw new Error("Model roles carries no Chat row");
  }
  return row;
}

test("a model id in a connection's label splits at a slash in the picker and its list", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const slashed = await addConnection(caller, SLASHED_MODEL);
  await caller.connection.setBinding({ task: "chat", connectionId: slashed.id });
  await serveRoles(page, corpus, root, caller);
  await mount<typeof ModelRolesStory>(STORY, {});
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const role = chatRole();
  const group = page.getByRole("group", { name: role.heading, exact: true });
  const picker = group.getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true });
  await expect(picker).toBeVisible();
  const picked = await paintedLines(picker.locator('[data-slot="select-value"]'));

  await picker.click();
  // The option's accessible name is the stored label, whole.
  const option = page.getByRole("option", { name: slashed.label, exact: true });
  await expect(option).toBeVisible();
  const listed = await paintedLines(option.locator('[data-slot="select-item-label"]'));

  for (const surface of [picked, listed]) {
    const [lines] = surface;
    if (lines === undefined) {
      throw new Error("A surface painted no text");
    }
    const follows = breaksInside(lines, SLASHED_MODEL);
    // The control: the id is wider than the line, so every surface splits it somewhere.
    expect(follows.length).toBeGreaterThan(0);
    expect(follows.filter((character) => character !== "/")).toEqual([]);
    expect(lines.filter(startsOnSeparator)).toEqual([]);
  }
});

test("a wrapped connection label never starts a line on its separator", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const labels = new Set<string>();
  for (let length = FIRST_PREFIX; length <= LAST_PREFIX; length += 1) {
    labels.add(PHRASE.slice(0, length).trim());
  }
  const added: AddedConnection[] = [];
  for (const label of labels) {
    added.push(await addConnection(caller, CORPUS_TEXT_MODEL, label));
  }
  await serveRoles(page, corpus, root, caller);
  await mount<typeof ModelRolesStory>(STORY, {});
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const role = chatRole();
  const picker = page
    .getByRole("group", { name: role.heading, exact: true })
    .getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true });
  await expect(picker).toBeVisible();
  await picker.click();
  for (const connection of added) {
    await expect(page.getByRole("option", { name: `${connection.label}${CONNECTION_LABEL_SEPARATOR}${CORPUS_TEXT_MODEL}`, exact: true })).toHaveCount(1);
  }
  const listed = await paintedLines(page.locator('[data-slot="select-item-label"]'));
  // The control: the list wraps labels, so the check below judges real line heads.
  expect(listed.filter((lines) => lines.length > 1).length).toBeGreaterThan(0);
  expect(listed.flat().filter(startsOnSeparator)).toEqual([]);
});
