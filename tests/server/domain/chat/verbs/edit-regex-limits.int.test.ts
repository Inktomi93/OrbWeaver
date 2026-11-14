// @subject packages/kit/src/regex/index.ts
// @subject packages/contracts/src/regex/schemas.ts
// @subject packages/server/src/primitives/regex/index.ts
// The regex script length caps fit a HUD preset's panels, and the cost guards still hold at the new find cap: a
// script just past the old caps stores and runs on the host's edit re-apply, a script past a new cap is refused at
// the storage door, and a catastrophic pattern at the full find cap is stopped instead of hanging the turn.
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { createRegexScriptSchema, MAX_REPLACE_LENGTH } from "@orb/contracts/regex";
import { deriveRegexTierFlags, MAX_FIND_REGEX_LENGTH } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, readRoomCanon, seedCharacter, seedGlobalRegexScript, seedRegexScript, seedTranscript } from "@orb/testkit/node/composed";
import { vi } from "vitest";

// The caps these limits replaced, so the first case proves a script past them is now storable.
const PRIOR_FIND_CAP = 2048;
const PRIOR_REPLACE_CAP = 10_000;
const PLACEMENT = ["AI_OUTPUT"] as const;
// Empty groups of two and three characters: they match the empty string anywhere and add no quantifier, so any
// padding length of two or more can be built from them.
const EMPTY_PAIR = "()";
const EMPTY_ALTERNATION = "(|)";

/** A find pattern of exactly `length` characters that matches `head`, padded in front with empty groups. */
function paddedPattern(head: string, length: number): string {
  const room = length - head.length;
  const odd = room % EMPTY_PAIR.length === 1;
  const pairs = (room - (odd ? EMPTY_ALTERNATION.length : 0)) / EMPTY_PAIR.length;
  return `${odd ? EMPTY_ALTERNATION : ""}${EMPTY_PAIR.repeat(pairs)}${head}`;
}

async function editedWith(
  root: ServerTestHarness,
  host: Principal,
  script: { readonly findRegex: string; readonly replaceString: string },
  content: string,
): Promise<string> {
  const row = await seedRegexScript(root, {
    principal: host,
    input: createRegexScriptSchema.parse({ name: "limits", ...script, placement: PLACEMENT, runOnEdit: true, ...deriveRegexTierFlags(PLACEMENT) }),
  });
  await seedGlobalRegexScript(root, { principal: host, scriptId: row.id });
  const speaker = await seedCharacter(root, { principal: host, input: createCharacterSchema.parse({ handle: "narrator", name: "Narrator", description: "" }) });
  const { chatId } = await seedTranscript(root, {
    ownerId: host.userId,
    characterHandles: [speaker.view.handle],
    lines: [{ role: "assistant", content: "seed" }],
  });
  const [slot] = await readRoomCanon(root, host, chatId);
  if (slot === undefined) {
    throw new Error("the transcript import wrote no assistant slot");
  }
  return (await root.services.chat.editMessage({ principal: host, chatId, messageId: slot.id, content })).content;
}

test("a script one character past each prior cap stores and runs on the host's edit re-apply", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const replaceString = "L".repeat(PRIOR_REPLACE_CAP + 1);

  const edited = await editedWith(root, host, { findRegex: paddedPattern("lamp", PRIOR_FIND_CAP + 1), replaceString }, "The lamp is lit.");

  expect(edited).toBe(`The ${replaceString} is lit.`);
});

test("a script at each new cap stores, and one past either cap is refused at the storage door", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const at = { findRegex: paddedPattern("lamp", MAX_FIND_REGEX_LENGTH), replaceString: "L".repeat(MAX_REPLACE_LENGTH) };
  const base = { name: "limits", placement: [...PLACEMENT], ...deriveRegexTierFlags(PLACEMENT) };

  await expect(caller.regex.createScript({ input: { ...base, ...at } })).resolves.toMatchObject({ findRegex: at.findRegex });
  await expect(caller.regex.createScript({ input: { ...base, ...at, findRegex: paddedPattern("lamp", MAX_FIND_REGEX_LENGTH + 1) } })).rejects.toThrow();
  await expect(caller.regex.createScript({ input: { ...base, ...at, replaceString: "L".repeat(MAX_REPLACE_LENGTH + 1) } })).rejects.toThrow();
});

test("a catastrophic find pattern at the full find cap is stopped on the edit re-apply and leaves the text as written", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  // One stacked quantifier passes the pre-compile count, so the server's per-call timeout is the guard that fires.
  const runaway = paddedPattern("(a+)+$", MAX_FIND_REGEX_LENGTH);
  const text = `${"a".repeat(40)}!`;
  const warnSpy = vi.spyOn(root.logger, "warn").mockImplementation(() => undefined);

  try {
    const edited = await editedWith(root, host, { findRegex: runaway, replaceString: "X" }, text);

    expect(runaway).toHaveLength(MAX_FIND_REGEX_LENGTH);
    expect(edited).toBe(text);
    const [payload] = warnSpy.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ placement: "AI_OUTPUT", findRegex: runaway, err: expect.objectContaining({ code: "ERR_SCRIPT_EXECUTION_TIMEOUT" }) });
  } finally {
    warnSpy.mockRestore();
  }
});
