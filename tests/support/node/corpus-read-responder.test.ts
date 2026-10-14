import { createCorpusReadResponder } from "@orb/testkit/browser/corpus-read-responder.ts";
import "@orb/testkit/node/composed-real.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

test("an actual inputless settings capture succeeds, but malformed raw null cannot receive its successful response", async () => {
  await using root = await createServerHarness();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const output = await ownerCaller.settings.getUserSettings();
  const respond = createCorpusReadResponder("settings.getUserSettings", [{ input: undefined, output }]);
  expect(respond(undefined)).toEqual(output);
  // A decoded malformed wire value bypasses the typed input; it must not select the absent-input capture.
  expect(() => Reflect.apply(respond, undefined, [null])).toThrow("Uncaptured corpus read for settings.getUserSettings");
});

test("conflicting results for the same captured input refuse instead of selecting a successful result", async () => {
  await using root = await createServerHarness();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const initial = await ownerCaller.settings.getUserSettings();
  const changed = await ownerCaller.settings.updateUserSettingsSection({ section: "chat", patch: { offerChoices: !initial.config.chat.offerChoices } });
  expect(changed.config.chat.offerChoices).not.toBe(initial.config.chat.offerChoices);
  expect(() =>
    createCorpusReadResponder("settings.getUserSettings", [
      { input: undefined, output: initial },
      { input: undefined, output: changed },
    ]),
  ).toThrow("Conflicting corpus captures for settings.getUserSettings");
});
