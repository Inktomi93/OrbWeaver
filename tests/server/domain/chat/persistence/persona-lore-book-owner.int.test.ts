// @subject packages/server/src/domain/chat/assembly/world-info/pool.ts
// Storage case: the attach verb refuses a junction row naming another owner's book, so only a direct row can
// prove the pool's owner match. A pinned persona reaches the pool past the consent set; the match still binds it.
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { personaBooks } from "@orb/db";
import type { PersonaId, WorldBookId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { attachPersonaLore, invitePerson, seatPersona } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const REPLIES = ["ok"];
const FOREIGN_ENTRY = "FOREIGN-BOOK-ENTRY";

async function foreignBook(h: ChatRoot, principal: ChatRoot["owner"]): Promise<WorldBookId> {
  const book = await h.root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Foreign book" }) });
  await h.root.services.worldInfo.createEntry({ principal, bookId: book.id, input: createEntrySchema.parse({ title: "Foreign", content: FOREIGN_ENTRY }) });
  return book.id;
}

async function previewStatic(h: ChatRoot): Promise<string> {
  return (await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId })).prompt.static;
}

async function junction(h: ChatRoot, personaId: PersonaId, worldBookId: WorldBookId): Promise<void> {
  await h.root.db.insert(personaBooks).values({ personaId, worldBookId });
}

test("a junction row naming another owner's book stays out of a held pin's pool", async () => {
  await using h = await textRoom(REPLIES);
  const bob = await invitePerson(h);
  const carol = await invitePerson(h);
  const pinned = await seatPersona(h, bob, "Ledgerkeeper", "The pinned persona.");
  await attachPersonaLore(h, bob, pinned.id, "OWN-PIN-ENTRY");
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: pinned.id });
  await h.root.services.chat.selfLeave({ principal: bob, chatId: h.chatId });

  await junction(h, pinned.id, await foreignBook(h, carol));

  const prompt = await previewStatic(h);
  expect(prompt).toContain("OWN-PIN-ENTRY");
  expect(prompt).not.toContain(FOREIGN_ENTRY);
});

test("two seats cannot share an entry: a second seat's row on the first owner's book is refused by the owner match", async () => {
  await using h = await textRoom(REPLIES);
  const bob = await invitePerson(h);
  const carol = await invitePerson(h);
  const owning = await seatPersona(h, bob, "Owning", "Holds the book.");
  const other = await seatPersona(h, carol, "Other", "Holds a foreign row.");
  const bookId = await foreignBook(h, bob);
  await h.root.services.worldInfo.attachToPersona({ principal: bob, personaId: owning.id, bookId });
  await junction(h, other.id, bookId);

  const { trace } = await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId });
  expect(trace.worldInfoActivated.map(({ title }) => title)).toEqual(["Foreign"]);
  const books = await h.root.services.worldInfo.listForChat({ principal: h.owner, chatId: h.chatId, includeInherited: true });
  expect(books.flatMap((book) => (book.inherited?.source === "persona" ? [book.inherited.name] : []))).toEqual(["Owning"]);
});
