// domain/persona/verbs/connection — barrel for the character⇄persona junction verbs (connect + disconnect
// are the write pair; the two list verbs are the matching reads, one per junction side). The composition
// root (`service.ts`) imports the verb factories from here.

export { createConnect } from "./connect.ts";
export { createDisconnect } from "./disconnect.ts";
export { createListConnected } from "./list-connected.ts";
export { createListConnectedCharacters } from "./list-connected-characters.ts";
