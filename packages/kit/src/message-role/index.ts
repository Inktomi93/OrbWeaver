// The conversation ROLE axis — `system | user | assistant` — and the SillyTavern numeric bimap.
//
// This is THE single home for the most-respelled union in the codebase (neo's "messageRole disease":
// 132 touches, 3+ competing const-arrays — `messageRole`, `ENTRY_INJECTION_ROLES`,
// `GUIDED_INJECTION_ROLES`, `PRESET_GUIDED_INJECTION_ROLES`, all the same 3 members). The role a chat
// MESSAGE takes and the role an INJECTED block takes (world-info at-depth, author's note, the card's
// depth-prompt, persona description, summary/memory, guided generations) are the SAME axis — so every
// one of those systems imports `MessageRole` from here. No consumer owns it (ledger D32).
//
// The const TUPLE lives in kit (resolvers + the ST serde bimap need it, and kit can't import contracts);
// the `z.enum(MESSAGE_ROLES)` WIRE schema (`messageRoleSchema`) lives in `@orb/contracts/chat` and imports
// this tuple DOWN — the kit↔contracts tuple rule (shared-dissolution §5). Pure / isomorphic.

export const MESSAGE_ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// ── ST numeric role ↔ MessageRole (the ONE bimap) ──────────────────────────
// SillyTavern encodes the role as a number in `extensions.role`: 0 system / 1 user / 2 assistant. Every
// ST↔orb serde site (card lorebook in/out, persona descriptor in, depth-prompt in, author's note) needs
// this conversion; this is the single canonical source so the hand-copied tables can't drift. The writer
// is total over the union; the reverse map is DERIVED from it so the two directions can never disagree.
const ST_NUM_BY_ROLE: Record<MessageRole, number> = {
  system: 0,
  user: 1,
  assistant: 2,
};
const ROLE_BY_ST_NUM: ReadonlyMap<number, MessageRole> = new Map(MESSAGE_ROLES.map((role): [number, MessageRole] => [ST_NUM_BY_ROLE[role], role]));

/** ST role → `MessageRole`. Accepts the numeric encoding (0/1/2) AND a literal role string
 *  ("system"/"user"/"assistant", as modern cards emit). Returns null for anything else, letting the
 *  caller fall back to its own default. */
export function messageRoleFromSt(raw: unknown): MessageRole | null {
  if (typeof raw === "number") {
    return ROLE_BY_ST_NUM.get(raw) ?? null;
  }
  // A literal role string passes through; `.find` returns undefined for any non-matching value
  // (including non-strings), collapsing to null — no `as` launder needed.
  return MESSAGE_ROLES.find((role) => role === raw) ?? null;
}

/** `MessageRole` → ST's numeric `extensions.role` encoding (0/1/2). Total over the union. */
export function messageRoleToSt(role: MessageRole): number {
  return ST_NUM_BY_ROLE[role];
}
