// domain/regex/contract/rows — the DB row alias the persistence + substrate layers pass around. Homed in
// `contract/` because `no-inline-types` is right: an exported shape belongs at a type home, not on a
// queries file. It is a `$inferSelect` alias (the db package owns the real shape) rather than a re-spelling
// — a column change is a compile error at every reader, which is the point.

import type { regexScripts } from "@orb/db";

/** One `regex_scripts` row as the DB returns it: promoted columns + the raw (unparsed) behavior blob.
 *  `persistence/queries` `toRow` is the ONLY sanctioned way to turn one into a `RegexScriptRow` — it parses
 *  the blob at the read seam, which is what keeps a corrupt body from reaching the executor. */
export type ScriptRecord = typeof regexScripts.$inferSelect;
