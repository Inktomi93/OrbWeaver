// An export a case expects to carry every row as stored reports nothing; a note there fails the case loudly instead of
// vanishing into a sink the case never reads.

import type { PortableExportNotes } from "@orb/contracts/portability";

/** The export note sink for a case that expects no note: the first note throws, naming the row. */
export const failOnExportNote: PortableExportNotes = (note) => {
  throw new Error(`unexpected export note: the ${note.kind} "${note.item}" was ${note.carried} (${note.failure})`);
};
