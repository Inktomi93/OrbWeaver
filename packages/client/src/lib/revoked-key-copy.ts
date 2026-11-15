// What every surface says about a revoked key, one row per stored revocation reason (`CRED_REVOKED_REASONS`), so the
// Saved keys row, the connection badge, the Model roles readout and the host's composer line never disagree. A
// zero-import leaf, so a test reads the words the product prints.
//
// Each line names only the action Saved keys offers for that reason. An endpoint that stopped responding judged
// nothing about the key, so its lines never send the reader to replace it: the fix is Clear revoked once the server
// answers.

/** The copy per reason, keyed by the reason's own spelling. */
export const REVOKED_KEY_COPY = {
  ["auth_failed"]: {
    savedKey: "Revoked: the provider rejected this key",
    badge: "Key rejected by the provider: replace it in Saved keys",
    roleClause: "the provider rejected its key; replace the key in Saved keys, or pick another connection",
    composer: "The provider rejected your connection's key. Replace it in Settings → Connections → Saved keys, or pick another connection.",
  },
  unreachable: {
    savedKey: "Revoked: the endpoint stopped responding",
    badge: "Key paused: the server stopped responding",
    roleClause: "its key was paused when the server stopped responding; once it answers, clear revoked in Saved keys",
    composer:
      "Your connection's key was paused when its server stopped responding. Once it answers, press Clear revoked in Settings → Connections → Saved keys.",
  },
  user: {
    savedKey: "Revoked by you",
    badge: "Key revoked by you: clear revoked or replace it in Saved keys",
    roleClause: "you revoked its key; clear revoked or replace it in Saved keys, or pick another connection",
    composer: "You revoked your connection's key. Clear revoked or replace it in Settings → Connections → Saved keys, or pick another connection.",
  },
} as const;
