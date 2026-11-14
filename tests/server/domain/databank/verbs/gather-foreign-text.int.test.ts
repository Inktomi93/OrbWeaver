// @subject packages/server/src/domain/databank/verbs/gather-retrieval.ts

// D352: a document whose owner is not the host the turn runs under reaches the {{databank}} slot as literal text,
// name and chunks alike, while the host's own document keeps its macros. A member's global documents credit the
// room (membership widening), so both owners' chunks sit in one embedding space through their own sweeps.

import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedCorpusConnections } from "@orb/testkit/node/composed";
import { attachRoomDocument, documentRoom, embedDocuments, ingest, sendTurn } from "../../chat/handoff-attachments-physical.ts";
import { invitePerson } from "../../chat/persona-cache-physical.ts";

// The host's `{{setvar}}` is the write control: it shows the slot evaluates write macros in the host's own text.
const HOST_DOCUMENT = { name: "Host shelf {{char}}", text: "Host note: the keeper is {{char}}.{{setvar::control::1}}" } as const;
const MEMBER_MACRO = { name: "Member {{char}} shelf", text: "Member note: the keeper is {{char}}." } as const;
const MEMBER_NESTED = { name: "Member nested shelf", text: "Member nested note {{databank}} ends here." } as const;
const MEMBER_RUN = { name: "Member {{{char}}} run shelf", text: "Member run note {{{setvar::seized::1}}} keeper {{{char}}} and {{{{{user}}}}} end." } as const;
const MESSAGE = "Tell me about the shelf.";

/** The host attaches their own macro document; a seated member credits `memberDocuments` as globals. */
async function bankedRoom(h: ChatRoot, memberDocuments: readonly { readonly name: string; readonly text: string }[]): Promise<void> {
  await attachRoomDocument(h, h.owner, HOST_DOCUMENT);
  const member = await invitePerson(h);
  await seedCorpusConnections(h.root, member);
  for (const document of memberDocuments) {
    const created = await h.root.services.databank.createFromText({ principal: member, name: document.name, text: document.text });
    await h.root.services.databank.attachGlobal({ principal: member, documentId: created.document.id });
    await ingest(h, created.document.id);
  }
  await embedDocuments(h, h.owner, [h.owner, member]);
}

/** The text's words, with braces and invisible separators folded to single spaces: an evaluated macro loses its name. */
function words(text: string): string {
  return text.replace(/[^\p{L}\p{N}:]+/gu, " ").trim();
}

function hostEvaluated(h: ChatRoot): readonly string[] {
  const keeper = present(h.characters[0]).name;
  return [words(`# Host shelf ${keeper}`), words(`Host note: the keeper is ${keeper}.`)];
}

async function roomVariables(h: ChatRoot): Promise<Record<string, string>> {
  return await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId });
}

test("a member's macro document and a macro in its name reach the host's turn and its preview as literal text, while the host's own document evaluates", async () => {
  await using h = await documentRoom(["Only reply."]);
  await bankedRoom(h, [MEMBER_MACRO]);
  const keeper = present(h.characters[0]).name;
  const literal = [...hostEvaluated(h), words(`# ${MEMBER_MACRO.name}`), words(MEMBER_MACRO.text)];
  const evaluatedForeign = [words(`Member ${keeper} shelf`), words(`Member note: the keeper is ${keeper}.`)];

  const { wire } = await sendTurn(h, h.owner, MESSAGE);
  const { prompt } = await h.root.services.chat.previewAssembly({ signal: new AbortController().signal, principal: h.owner, chatId: h.chatId });
  const previewed = [prompt.static, prompt.dynamic, ...prompt.afterHistory.map((injection) => injection.content)].join("\n");
  for (const text of [words(wire), words(previewed)]) {
    for (const each of literal) {
      expect(text).toContain(each);
    }
    for (const each of evaluatedForeign) {
      expect(text).not.toContain(each);
    }
  }
});

test("a member's document naming the {{databank}} slot reaches the host's turn as literal text and leaves the host's slot whole", async () => {
  await using h = await documentRoom(["Only reply."]);
  await bankedRoom(h, [MEMBER_NESTED]);
  const wire = words((await sendTurn(h, h.owner, MESSAGE)).wire);
  for (const each of [...hostEvaluated(h), words(MEMBER_NESTED.text)]) {
    expect(wire).toContain(each);
  }
});

test("a member's document with brace runs in its name and text reads nothing and writes no room variable on the host's turn", async () => {
  await using h = await documentRoom(["Only reply."]);
  await bankedRoom(h, [MEMBER_RUN]);
  const keeper = present(h.characters[0]).name;

  const wire = words((await sendTurn(h, h.owner, MESSAGE)).wire);

  for (const each of [...hostEvaluated(h), words(`# ${MEMBER_RUN.name}`), words(MEMBER_RUN.text)]) {
    expect(wire).toContain(each);
  }
  expect(wire).not.toContain(`keeper ${keeper}`);
  expect(await roomVariables(h)).toEqual({ control: "1" });
});
