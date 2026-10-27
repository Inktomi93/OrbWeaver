import { createCharacterSchema } from "@orb/contracts/character";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { CorpusPlayback } from "../iso/corpus.ts";
import { encodeCorpusWire, hydrateCorpusWire } from "../iso/corpus.ts";
import { createCorpusReadResponder, createCorpusViewerReadResponder } from "../iso/corpus-read-responder.ts";
import { loadCorpusFixture } from "./corpus.ts";
import { captureCorpusRead } from "./corpus-capture.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

function selectedOwner(wire: CorpusPlayback): UserId {
  return brandedId("UserId").parse(wire.reads["sessions.me"][0]?.output.userId);
}

test("an actual inputless settings capture succeeds, but malformed raw null cannot receive its successful response", async () => {
  await using root = await createServerHarness();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const capture = await captureCorpusRead(root, root.ownerId, "settings.getUserSettings", undefined);
  const output = await ownerCaller.settings.getUserSettings();
  const respond = createCorpusReadResponder("settings.getUserSettings", root.ownerId, [capture]);
  expect(respond(undefined)).toEqual(output);
  // A decoded malformed wire value bypasses the typed input; it must not select the absent-input capture.
  expect(() => Reflect.apply(respond, undefined, [null])).toThrow("Uncaptured corpus read for settings.getUserSettings");
});

test("conflicting results for the same captured input refuse instead of selecting a successful result", async () => {
  await using root = await createServerHarness();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const initial = await captureCorpusRead(root, root.ownerId, "settings.getUserSettings", undefined);
  const changed = await ownerCaller.settings.updateUserSettingsSection({ section: "chat", patch: { offerChoices: !initial.output.config.chat.offerChoices } });
  expect(changed.config.chat.offerChoices).not.toBe(initial.output.config.chat.offerChoices);
  const updated = await captureCorpusRead(root, root.ownerId, "settings.getUserSettings", undefined);
  expect(() => createCorpusReadResponder("settings.getUserSettings", root.ownerId, [initial, updated])).toThrow(
    "Conflicting corpus captures for settings.getUserSettings",
  );
});

test("spread, output replacement, raw copying and cast clones cannot restamp loaded playback", () => {
  const wire = loadCorpusFixture().wire;
  const capture = wire.shellAmbient?.reads.quickPicks;
  if (capture === undefined) {
    throw new Error("The corpus has no shell quick-pick capture");
  }
  const respond = createCorpusReadResponder("character.list", selectedOwner(wire), [capture]);
  expect(respond(capture.input)).toEqual(capture.output);
  expect(capture.output.items.length).toBeGreaterThan(1);
  const forgeries = [
    { ...capture, input: { ...capture.input, starred: true, limit: 1 } },
    { ...capture, output: { ...capture.output, items: [] } },
    { input: capture.input, output: capture.output },
    // Deliberately dishonest typing exercises runtime admission rather than relying on a nominal type.
    { ...capture } as typeof capture,
  ];
  for (const forged of forgeries) {
    expect(() => Reflect.apply(createCorpusReadResponder, undefined, ["character.list", selectedOwner(wire), [forged]])).toThrow("Unadmitted corpus capture");
  }
});

test("an admitted input and nested output cannot be changed after responder construction", () => {
  const wire = loadCorpusFixture().wire;
  const capture = wire.shellAmbient?.reads.quickPicks;
  const effective = wire.libraryRelations?.reads.presetEffective;
  const first = capture?.output.items[0];
  if (capture === undefined || capture.input === undefined || effective === undefined || first === undefined || effective.input.target === undefined) {
    throw new Error("The corpus lacks the nested input/output witnesses");
  }
  const originalName = first.name;
  const respond = createCorpusReadResponder("character.list", selectedOwner(wire), [capture]);
  expect(respond(capture.input).items[0]?.name).toBe(originalName);
  expect(Reflect.set(capture.input, "limit", 1)).toBe(false);
  expect(Reflect.set(effective.input.target, "connectionId", "not-the-captured-connection")).toBe(false);
  expect(Reflect.set(first, "name", "Restamped name")).toBe(false);
  expect(respond(capture.input).items[0]?.name).toBe(originalName);
});

test("capture custody includes its path even where another procedure has the same raw shape", () => {
  const wire = loadCorpusFixture().wire;
  const capture = wire.reads["regex.countScripts"][0];
  if (capture === undefined) {
    throw new Error("The corpus has no regex count capture");
  }
  expect(createCorpusReadResponder("regex.countScripts", selectedOwner(wire), [capture])(undefined)).toBe(capture.output);
  expect(() => createCorpusReadResponder("rosterPreset.count", selectedOwner(wire), [capture])).toThrow("Corpus capture path does not match");
});

test("restamping a snapshot viewer cannot reassign a genuine read to another viewer", () => {
  const inbox = loadCorpusFixture().wire.notificationInbox;
  if (inbox === undefined) {
    throw new Error("The corpus has no inbox cohort");
  }
  const capture = inbox.readerRaised;
  const foreign = inbox.foreignBefore.viewerUserId;
  expect(foreign).not.toBe(capture.viewerUserId);
  expect(createCorpusViewerReadResponder("notifications.list", capture.viewerUserId, capture)({})).toEqual(capture.read.output);
  expect(() => createCorpusViewerReadResponder("notifications.list", foreign, { ...capture, viewerUserId: foreign })).toThrow(
    "Corpus snapshot viewer does not match",
  );
});

test("both responder routes require the selected viewer even when the records agree with each other", () => {
  const inbox = loadCorpusFixture().wire.notificationInbox;
  if (inbox === undefined) {
    throw new Error("The corpus has no inbox cohort");
  }
  const snapshot = inbox.readerRaised;
  const foreign = inbox.foreignBefore.viewerUserId;
  expect(createCorpusReadResponder("notifications.list", snapshot.viewerUserId, [snapshot.read])({})).toEqual(snapshot.read.output);
  expect(() => createCorpusReadResponder("notifications.list", foreign, [snapshot.read])).toThrow("Corpus snapshot viewer does not match");
  expect(() => createCorpusViewerReadResponder("notifications.list", foreign, snapshot)).toThrow("Corpus snapshot viewer does not match");
});

test("a genuine new filtered request runs the root operation and locks its input before awaiting", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const suffix of ["one", "two"]) {
    await caller.character.create({
      input: createCharacterSchema.parse({ handle: `custody-${suffix}`, name: `Custody ${suffix}`, description: "An unstarred witness.", starred: false }),
    });
  }
  const original = await captureCorpusRead(root, root.ownerId, "character.list", { search: "Custody", limit: 100 });
  expect(original.output.items).toHaveLength(2);
  const input = { search: "Custody", starred: true, limit: 1 };
  const pending = captureCorpusRead(root, root.ownerId, "character.list", input);
  expect(Reflect.set(input, "limit", 100)).toBe(false);
  const filtered = await pending;
  expect(filtered.input).toEqual({ search: "Custody", starred: true, limit: 1 });
  expect(filtered.output.items).toEqual([]);
  const respond = createCorpusReadResponder("character.list", root.ownerId, [original, filtered, filtered]);
  expect(respond(filtered.input)).toEqual(await caller.character.list(input));
  expect(respond(original.input)).toEqual(original.output);
  const forged = { ...original, input: filtered.input };
  expect(() => Reflect.apply(createCorpusReadResponder, undefined, ["character.list", root.ownerId, [forged]])).toThrow("Unadmitted corpus capture");
  const fakeRoot = { internalCallerFor: () => caller };
  await expect(Reflect.apply(captureCorpusRead, undefined, [fakeRoot, root.ownerId, "character.list", input])).rejects.toThrow(
    "Corpus capture requires a real server root",
  );
});

test("the loader readmits published bytes while raw graph copies preserve encoding without playback custody", () => {
  const loaded = loadCorpusFixture();
  const reloaded = loadCorpusFixture(loaded.layout.root);
  const capture = loaded.wire.shellAmbient?.reads.quickPicks;
  const fresh = reloaded.wire.shellAmbient?.reads.quickPicks;
  if (capture === undefined || fresh === undefined) {
    throw new Error("The corpus has no shell quick-pick capture");
  }
  const viewer = selectedOwner(loaded.wire);
  expect(fresh).not.toBe(capture);
  const serialized = encodeCorpusWire(loaded.wire);
  const raw = hydrateCorpusWire(structuredClone(loaded.wire));
  expect(encodeCorpusWire(reloaded.wire)).toBe(serialized);
  expect(encodeCorpusWire(raw)).toBe(serialized);
  expect(() => Reflect.apply(createCorpusReadResponder, undefined, ["character.list", viewer, raw.reads["character.list"]])).toThrow(
    "Unadmitted corpus capture",
  );
  expect(createCorpusReadResponder("character.list", viewer, [fresh])(fresh.input)).toEqual(capture.output);
  // JSON retains the public wire inspection fields, not private playback custody.
  const copied = JSON.parse(JSON.stringify(capture)) as typeof capture;
  expect(JSON.stringify(copied)).toBe(JSON.stringify(capture));
  expect(() => Reflect.apply(createCorpusReadResponder, undefined, ["character.list", viewer, [copied]])).toThrow("Unadmitted corpus capture");
});
