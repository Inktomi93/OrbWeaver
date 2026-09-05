// ONE OPEN IN-PLACE EDIT, and what its commit does — the client's single home for the two-writer decision
// every editable-in-place surface makes (#1485 · #1502 · #1561).
//
// THE DEFECT CLASS THIS EXISTS AGAINST. An in-place editor seeds its draft ONCE, when it opens, and never
// reseeds it — deliberately, because reseeding destroys keystrokes the user can still see. The natural
// commit guard is then `if (draft !== source) send(draft)`, whose PURPOSE is to suppress a pointless write.
// But `source` is live: when a second writer (a model turn, another seat) moves it while the editor is
// open, that comparison passes for a reason that has nothing to do with the user, and the guard PERFORMS a
// write — sending the value the editor opened with back over the one that arrived. The comparison meant to
// suppress a write is exactly what performs a destructive one, and it does so only under concurrency,
// which is why it reads as correct in every isolated test.
//
// THE JUDGE IS THE VALUE AT OPEN TIME, so an open edit remembers what it was seeded FROM and the three
// cases stay distinct:
//   • the draft still equals what it opened with → the user changed nothing, so NOTHING is sent, however
//     far the world has moved underneath;
//   • the user edited and the value did not move → an ordinary commit;
//   • the user edited AND the value moved → a real CONFLICT between two writers, which is SURFACED and
//     held rather than silently resolved. Committing again overwrites deliberately; cancelling takes the
//     value that arrived. Reseeding the draft is the refused arm (see above).
//
// IT IS A PURE DECISION, IN ONE PLACE, ON PURPOSE. Two homes for this had already produced two spellings
// of the same three cases (the tracker cell and the chronicle beat editor, found in one lane) and the
// second one shipped only two of them. A shared function is also what makes the class mechanically
// findable: a once-seeded draft whose commit does NOT come through here is the shape to look at.

/** One OPEN edit — the three facts that only mean anything together (see the header). */
export interface EditSession {
  /** What the field currently holds. Seeded from the value at open; only the user's typing moves it. */
  readonly draft: string;
  /** The value the draft was seeded FROM. The commit is judged against THIS, never against the live one. */
  readonly openedFrom: string;
  /** The value that arrived underneath this edit, once a commit has found one. `null` = uncontested. */
  readonly conflict: string | null;
}

/** What a commit does, as a pure decision so the three cases read as three cases.
 *  `send: null` means nothing goes to the write callback; `next: null` means the editor closes. */
export function resolveCommit(session: EditSession, source: string): { readonly send: string | null; readonly next: EditSession | null } {
  if (session.draft === session.openedFrom) {
    return { send: null, next: null }; // nothing typed — never write, however far the value has moved
  }
  if (source !== session.openedFrom && session.conflict === null) {
    return { send: null, next: { ...session, conflict: source } }; // two writers — surface it, hold the edit
  }
  return { send: session.draft, next: null }; // an ordinary commit, or a deliberate overwrite of a conflict
}
