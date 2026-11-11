// What the character import dialog says when none of the dropped files could be imported. A zero-import leaf, so a spec's node
// side reads the sentences without loading the component graph.
//
// The import route answers each failed card with the server's sentence and nothing a client can key on (`FailedCard` is a
// filename and a message), so these two are the general case: every refusal of a card gets the one move that works.

/** One file was refused: what a card is, so a plain picture knows why it did not take. */
export const CARD_IMPORT_REFUSED_ONE =
  "That file isn't a character card Orbweaver can read. A card is a SillyTavern PNG with the card data inside it, or a JSON file. A plain picture won't import.";

/** Several files were refused, and none of them imported. */
export const CARD_IMPORT_REFUSED_MANY =
  "None of those files is a character card Orbweaver can read. A card is a SillyTavern PNG with the card data inside it, or a JSON file. A plain picture won't import.";

/** The line the dropzone shows when a batch landed no card; `failed` is how many files the server refused. */
export function cardImportRefusalLine(failed: number): string {
  return failed === 1 ? CARD_IMPORT_REFUSED_ONE : CARD_IMPORT_REFUSED_MANY;
}
