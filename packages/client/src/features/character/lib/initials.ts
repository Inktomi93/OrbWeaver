// lib/initials — a display name → 1-2 letter avatar-fallback. The chat feature owns an identical-shaped
// `initialsForAttribution` (features/chat/lib/attribution.ts), but cross-feature import is banned
// (UI-Architecture-and-Layout.md §2.1 — features read each other only via `trpc.*`), so this stays a tiny
// local duplicate rather than a sideways import. Promote to `@orb/kit` only on a THIRD consumer
// (UI-Primitives-and-Reuse.md §13.0's "repeated 3+ times AND changing together" bar) — two near-identical
// one-liners isn't there yet.

const MAX_INITIALS = 2;
const WHITESPACE_RE = /\s+/u;

/** `"Nate Silver"` → `"NS"`; a single word → its first letter; empty/whitespace-only → `"?"`. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(WHITESPACE_RE).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return parts
    .slice(0, MAX_INITIALS)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
