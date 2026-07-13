// domain/import/require-profile — assert the profile-wave deps (`ImportContext.profile`, RULING A) are wired.
// The card-only slice omits them (the built `importCharacter` reads zero db); a chats/personas verb reaching
// this on a card-only context is a COMPOSITION bug (the root failed to wire `profile`), never a user error —
// throw loud rather than degrade. A domain-root helper (NOT under verbs/) so both chat/persona verbs share it
// without a verb-to-verb import (domain-no-cross-verb).

import type { ImportContext } from "./context";
import type { ImportProfileDeps } from "./contract/service";

export function requireProfile(ctx: ImportContext): ImportProfileDeps {
  if (ctx.profile === undefined) {
    throw new Error(
      "import: ctx.profile not wired — the chats/personas verbs require the profile-wave deps (the injected bulkImportChats/bulkImportPersonas ops + now + personaByUserName + the PD-78 ops); Option B",
    );
  }
  return ctx.profile;
}
