// String primitives shared across layers. The canonical home for `escapeRegExp` — neo triplicated it
// (`shared/_kit/speaker-label.ts`, `shared/world-info/wi-keyword-match.ts`,
// `server/domain/chat/engine/select-speakers.ts`), all byte-identical; this is the ONE copy the others
// import from.

/** Escape a string for literal use inside a RegExp (a character name may carry regex metachars). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── byte sizes ───────────────────────────────────────────────────────────────────────────────────────
// The ONE human byte-size formatter. It had two byte-identical spellings (`@orb/ui/file-dropzone`'s cap
// hint and `features/databank`'s row subtitle) before the per-chat document rack needed a third; a pure,
// zero-I/O, zero-domain function with three consumers is a kit primitive by the placement rule, and one
// home is what keeps "24.5 KB" from becoming "24.5 KB" in one pane and "25.1 KB" in the next.

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;
const ONE_DECIMAL = 10;

/** Human byte size (binary-scale steps, one decimal, locale-agnostic): 0 B · 512 B · 24.5 KB · 3.1 MB.
 *  Sub-KB sizes stay whole (a "0.5 KB" reads worse than "512 B"); GB is the ceiling — nothing this app
 *  stores is measured in TB. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_UNIT) {
    return `${bytes} B`;
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const rounded = Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;
  return `${rounded} ${SIZE_UNITS[unitIndex] ?? "GB"}`;
}
