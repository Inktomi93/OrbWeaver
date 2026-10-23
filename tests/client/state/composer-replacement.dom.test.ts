import { readComposerDraft, readComposerDraftSnapshot, replaceComposerDraft, setComposerDraft } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("replacement and Undo require the captured edit revision and preserve exact unsent text", ({ ids }) => {
  const first = mintTypeId(ID_PREFIX.chat, ids.next);
  const second = mintTypeId(ID_PREFIX.chat, ids.next);
  const original = "  Original\n";
  setComposerDraft(first, original);
  const before = readComposerDraftSnapshot(first);
  expect(before.text).toBe(original);
  expect(readComposerDraft(second)).toBe("");

  const after = replaceComposerDraft(first, before, "Replacement");
  expect(after?.text).toBe("Replacement");
  expect(readComposerDraft(first)).toBe("Replacement");
  expect(replaceComposerDraft(first, before, "Stale")).toBeNull();
  expect(readComposerDraft(first)).toBe("Replacement");
  expect(replaceComposerDraft(second, before, "Wrong room")).toBeNull();
  expect(readComposerDraft(second)).toBe("");
  if (after === null) {
    throw new Error("A valid replacement did not return an Undo revision");
  }
  expect(replaceComposerDraft(first, after, original)?.text).toBe(original);
  const undo = readComposerDraftSnapshot(first);
  setComposerDraft(first, "Later edit");
  setComposerDraft(first, original);
  expect(replaceComposerDraft(first, undo, "Late Undo")).toBeNull();
  expect(readComposerDraft(first)).toBe(original);
});
