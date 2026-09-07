// Cross-feature client CT fixtures — the AMBIENT reads that a mounted feature tree fires no matter which
// feature it belongs to (#649 batch 2). Per-feature literals stay in that feature's own `fixtures.ts`
// (`chat/`, `character/`, `databank/`, `refinery/`); this module holds ONLY the reads that are nobody's
// subject in any feature.
//
// WHY THIS EXISTS. `routeTrpc` answers an unlisted procedure `null` by design, and `null` is not a view —
// the reader behind it short-circuits to its no-data arm and the whole pipeline runs INERT, so a regression
// inside it is invisible to that file (`tests/support/node/route-trpc.ts` header, #629). The viewer identity
// and viewer-settings reads were unfed in ten `features/**` CT files across seven features; the census
// (`pnpm debt`, ct-unfed-reads) named each one.
//
// THEY ARE DEFAULTS, NOT A CEILING. A file whose subject IS one of these overrides it by listing the same
// key AFTER the spread — exactly the posture `features/chat/fixtures.ts` documents for CHAT_AMBIENT_ROUTES.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

const FROZEN_AT = 1_750_000_000_000;

/** The viewer this module's ambient reads describe — a plain `user`-role account, the un-privileged arm
 *  every non-permission CT assumes. Module-local on purpose: the two routes below are the surface, and an
 *  exported id nobody imports is a knip orphan. A file that needs the owner/admin arm overrides
 *  `sessions.me` after the spread rather than reaching for this. */
const CT_VIEWER_USER_ID = castId<UserId>("user_ct_viewer");

/**
 * THE AMBIENT VIEWER READS of any mounted feature tree — spread into every `routeTrpc` call so the
 * pipelines behind them actually RUN.
 *
 * Both are pure identity/config ambience: a character-editor CT is about the editor, not about who the
 * viewer is or which appearance tier they picked. Left unfed, `sessions.me` resolved `null` (every viewer
 * reader falls to its no-identity arm) and `settings.getUserSettings` resolved `null` (every appearance /
 * tier / preference reader falls to its default branch) — so neither pipeline executed at all.
 */
export const VIEWER_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // `ViewerView` — a pure projection of the request Principal (transport/trpc/routers/sessions.ts:25).
  // A real triple, so an identity-keyed reader gets an identity instead of stepping aside on null.
  "sessions.me": { userId: CT_VIEWER_USER_ID, handle: "ct_viewer", globalRole: "user" },
  // The viewer's settings row at the PRODUCTION defaults (`userSettingsSchema.parse({})`) — the same shape
  // `features/chat/fixtures.ts` and the workloads/admin CTs feed. Real config, so a reader that keys off a
  // tier gets a tier and the settings-driven presentation path runs for real.
  "settings.getUserSettings": { userId: CT_VIEWER_USER_ID, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: FROZEN_AT },
};
