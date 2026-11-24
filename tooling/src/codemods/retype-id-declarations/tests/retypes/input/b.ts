// A file with no import keeps its header comment on top.

/** The doc comment stays with its declaration. */
export function keyOf(userId: string | null): string {
  return userId ?? "";
}
