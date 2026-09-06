// verb: resetUserConfig — replace this user's WHOLE settings blob with the contract defaults at the current
// schema version. Scoped to `params.principal.userId` (a user resets ONLY their own row; no id is accepted).
//
// WHY IT EXISTS (#1771, from #1716): before it, an unreadable `user_settings.config` had NO way out. The
// #471/#1026 guard refuses every write that DESCENDS FROM A READ of the row, and on this table that was
// every write there was — the section autosave (`updateUserSettingsSection`), the per-leaf "Reset to its
// default" (which writes through that same verb), and even the backup restore (`import-user-settings.ts`
// read-merges the file onto the current blob). The refusal is correct; the missing door was the defect.
//
// IT SATISFIES THE GUARD LAW BY PROVENANCE, NOT BY EXEMPTION-SHOPPING: the value written is
// `DEFAULT_USER_SETTINGS`, a contract constant, so there is no degraded read in it to persist. That is the
// same class as `preset.resetToDefault` one table over, and it is why the persistence seam it calls
// (`replaceUserConfig`) is deliberately unguarded and carries a two-sided `GUARD_EXEMPT` row in the
// `json-column-write-parity` gate.
//
// DESTRUCTIVE BY CONSTRUCTION, so the CALLER owns the confirm: this discards every setting the user had,
// including any that were still readable. The client offers it as the repair door on the unreadable state
// (and, for a `version-from-future` blob, only as the explicit second arm behind backing the row up — an
// older build resetting a newer build's settings destroys data it merely cannot read).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readUserSettings, replaceUserConfig } from "../persistence/queries.ts";

export function createResetUserConfig(ctx: SettingsContext): SettingsService["resetUserConfig"] {
  return (params) => {
    const ownerId = params.principal.userId;
    return ctx.serializeUserWrite(ownerId, async () => {
      const at = ctx.now();
      await replaceUserConfig(ctx.db, ownerId, DEFAULT_USER_SETTINGS, at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "settings.resetUserConfig",
          entityType: "settings",
          entityId: ownerId,
          // No metadata: the interesting fact IS the act, and the discarded blob is exactly what this
          // domain's audit posture never records (the settings audit names sections and keys, never values).
          metadata: {},
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      // Read back rather than synthesizing the view: the caller reseeds its autosave sessions off this row,
      // and `updatedAt`/`schemaVersion` must be the row's own. It also proves the repair to the caller —
      // `configUnreadable` comes back `null` iff the blob is now readable.
      return await readUserSettings(ctx.db, ownerId);
    });
  };
}
