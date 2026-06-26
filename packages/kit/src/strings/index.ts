// String primitives shared across layers. The canonical home for `escapeRegExp` — neo triplicated it
// (`shared/_kit/speaker-label.ts`, `shared/world-info/wi-keyword-match.ts`,
// `server/domain/chat/engine/select-speakers.ts`), all byte-identical; this is the ONE copy the others
// import from.

/** Escape a string for literal use inside a RegExp (a character name may carry regex metachars). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
