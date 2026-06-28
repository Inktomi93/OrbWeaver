// domain/persona/verbs/connection — barrel for the character⇄persona junction trio (connect + disconnect
// are the write pair; listConnected is the matching read). The composition root (`service.ts`) imports the
// three verb factories from here.

export { createConnect } from "./connect";
export { createDisconnect } from "./disconnect";
export { createListConnected } from "./list-connected";
