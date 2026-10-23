// @subject packages/server/src/domain/chat/verbs/edit.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { deriveRegexTierFlags } from "@orb/kit/regex";
import { getLog } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCharacter, seedGlobalRegexScript, seedRegexScript, seedTranscript } from "@orb/testkit/node/composed";
import { vi } from "vitest";

// A catastrophic-backtracking pattern: the host's node:vm watchdog (or the kit's complexity guard) refuses it.
const RUNAWAY_PATTERN = "(a+)+$";
const RUNAWAY_TEXT = `${"a".repeat(40)}!`;

test("a runOnEdit script that fails on an edit leaves the content unchanged and tells the operator", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const placement = ["AI_OUTPUT"] as const;
  const script = await seedRegexScript(root, {
    principal: host,
    input: createRegexScriptSchema.parse({
      name: "runaway",
      findRegex: RUNAWAY_PATTERN,
      replaceString: "X",
      placement,
      runOnEdit: true,
      ...deriveRegexTierFlags(placement),
    }),
  });
  await seedGlobalRegexScript(root, { principal: host, scriptId: script.id });
  const speaker = await seedCharacter(root, { principal: host, input: createCharacterSchema.parse({ handle: "narrator", name: "Narrator", description: "" }) });
  const transcript = await seedTranscript(root, {
    ownerId: host.userId,
    characterHandles: [speaker.row.handle],
    lines: [{ role: "assistant", content: "seed" }],
  });
  const chatId = transcript.row.id;
  const slot = transcript.messages[0]?.slot;
  if (slot === undefined) {
    throw new Error("the transcript import wrote no assistant slot");
  }
  const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);

  try {
    const edited = await root.services.chat.editMessage({ principal: host, chatId, messageId: slot.id, content: RUNAWAY_TEXT });

    expect(edited.content).toBe(RUNAWAY_TEXT);
    expect(warnSpy).toHaveBeenCalled();
    const [payload] = warnSpy.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ placement: "AI_OUTPUT", findRegex: RUNAWAY_PATTERN });
  } finally {
    warnSpy.mockRestore();
  }
});
