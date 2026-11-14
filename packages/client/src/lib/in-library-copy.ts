// What an import says about a file the library already holds: the import found the row by its content, reused it and
// added nothing (D290). One home, so the chat, card and book doors and the restore summary cannot drift apart. A leaf
// with no imports, so a spec's node side reads the sentences without loading the component graph.

const NOTHING_ADDED = "Nothing was added.";

/** The book import's notice when the book is already in the library. */
export const WORLD_INFO_DUPLICATE_BOOK_NOTICE = `That book is already in your library. ${NOTHING_ADDED}`;

/** The chat import's notice when one dropped file is a room the library already holds, named by its file. */
export function chatInLibraryNotice(filename: string): string {
  return `${filename} is already in your library. ${NOTHING_ADDED}`;
}

/** The chat import's notice when every dropped file is a room the library already holds. */
export function chatsInLibraryNotice(count: number): string {
  return `${String(count)} chats are already in your library. ${NOTHING_ADDED}`;
}

/** The card import's notice when one dropped file is a card the library already holds, named by its file when it has one. */
export function cardInLibraryNotice(filename: string | null): string {
  return `${filename ?? "That card"} is already in your library. ${NOTHING_ADDED}`;
}

/** The card import's notice when every dropped file is a card the library already holds. */
export function cardsInLibraryNotice(count: number): string {
  return `${String(count)} cards are already in your library. ${NOTHING_ADDED}`;
}

/** A count of files the library already held, as a clause of a summary line. */
export function inLibraryClause(count: number): string {
  return `${String(count)} already in your library`;
}

/** The report's detail beside a file the library already held. */
export const IN_LIBRARY_DETAIL = "Already in your library";
