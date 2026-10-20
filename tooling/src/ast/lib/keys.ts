// The declaration-identity key every AST lens shares: the origin declaration's file and start offset, never a name.
import { inventoryDeclarationKey } from "../../floor/code-facts/semantic-inventory-reader.ts";

/** `<declFile>` + `<declStart>` — the identity a candidate export and every consumer of it agree on. */
export const declKey = inventoryDeclarationKey;
