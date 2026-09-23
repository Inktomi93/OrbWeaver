// domain/plugin/substrate/consent-prompt — the ONE producer of the `plugins-awaiting-consent` inbox ask
// (#1041, the second half of #924). Every plugin verb that can change how many of an owner's plugins stand
// on their consent ends by calling {@link refreshConsentPrompt}; nothing else writes that notification.
//
// WHY IT EXISTS. A fresh boot lands NINE example plugins installed, disabled, with an empty grant and
// `pending_reconsent` raised (`entry/boot/seed-example-plugins.ts` — consent is deliberately not seeded),
// and until this file nothing ever asked. The only path to answering was to guess that Settings → Plugins
// held the grant rows. A capability grant the user never saw is not consent.
//
// THE RECIPIENT IS DERIVED, NEVER ASSUMED (orchestrator ruling 2026-09-05): plugins are user-scoped (D147),
// so the aggregate is addressed to the OWNER OF THE ROWS THAT ARE PENDING — `caller.userId` at a self-serve
// verb, the RECIPIENT's own principal on the distribution path (`substrate/distribution.ts` drives the real
// `setGrant` under the receiving user, so an admin's install-for-all raises each recipient's own ask, not
// nine of the admin's). There is no "the owner principal" singleton anywhere in this file.
//
// THE COUNT IS RE-DERIVED FROM THE TABLE, never incremented: every call re-counts (`countPendingConsent`),
// so a missed emission, a crash between the write and the notify, or an uninstall that removed a pending
// row all self-heal on the next consent-shaped act rather than leaving the ask carrying a number no row
// supports.
//
// THE PER-RECIPIENT SERIAL CHAIN is what makes that count correct under the seed. The seeder installs all
// nine slugs CONCURRENTLY (`Promise.all`), so nine `setGrant`s each finish and then ask "how many are
// pending now?" — unserialized, the last emission to land is whichever raced last, and the fresh-boot ask
// could read "7 waiting" while nine wait, on the exact scenario this feature exists for. Chaining the
// count+emit per recipient makes the LAST emission the one that counts after every write has committed.
// `ASSUMES(single-replica)` — the same bound the resident registry and the notify floor already carry, and
// the honest one for a self-healing display number.
//
// IT NEVER THROWS INTO ITS CALLER. The consent WRITE is the user's act and must stand whatever the inbox
// does; a failed notify is logged and dropped.
//
// WHERE IT IS VISIBLE, STATED (#1627). The row is recorded durably on every deployment AND readable on
// every deployment. The inbox's multi-human belt came off with #1627: `notifications.list`/`markAllRead`/
// `dismiss` are `authedProcedure`,
// the socket's `notifications` room accepts any authed attach, and the bell's chrome entry carries no
// capability gate — so a `single-user` box (or `local` with `localMultiUser` off) surfaces this ask exactly
// as a multi-human one does. The belt survives only where it is genuinely about OTHER humans
// (`notifications.presence`, the invites router). This ask was one of the three single-human sources that
// refuted the belt's premise, beside `plugin-disabled` (`activation/crash-policy.ts`, to the installing
// owner) and the owner-global `automation-notice` (`domain/automation/engine/dispatch.ts`, `chatId: null`).
// What scopes the ask is the RECIPIENT PREDICATE, never a deployment mode: every inbox read and write pins
// `recipient_user_id` (`domain/notifications/persistence/queries.ts`), probed at the wire in the
// cross-tenant sweep.

import type { NotificationEvent } from "@orb/contracts/notifications";
import { errorMessage } from "@orb/kit/error-message";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { PluginContext } from "../contract/service.ts";
import { countPendingConsent } from "../persistence/plugins.ts";

/** The inbox member this file owns, spelled ONCE (the `NotificationEvent` union is the axis; this is the
 *  arm's name as a value, for the retract call that has no event to carry it). */
const CONSENT_PROMPT_TYPE = "plugins-awaiting-consent" satisfies NotificationEvent["type"];

/** In-flight tail per recipient — see the header's serial-chain paragraph. Cleared when the tail settles,
 *  so the map holds at most one entry per user with a consent act in flight. */
const chains = new Map<UserId, Promise<void>>();

/** Count the recipient's standing asks and move their ONE aggregate row to agree with it. `raised` is what
 *  the calling verb observed about ITS OWN row — `true` when this act put a plugin into the pending state,
 *  which is the only case that deserves a fresh row and a fresh badge (see `contract/ops.ts` for the trio). */
async function publish(ctx: PluginContext, recipientUserId: UserId, raised: boolean): Promise<void> {
  const pendingCount = await countPendingConsent(ctx.db, recipientUserId);
  if (pendingCount === 0) {
    await ctx.ops.notifications.retractStanding({ recipientUserId, type: CONSENT_PROMPT_TYPE });
    return;
  }
  const event: NotificationEvent = { type: CONSENT_PROMPT_TYPE, recipientUserId, pendingCount };
  if (raised) {
    await ctx.ops.notifications.emitStanding(event);
    return;
  }
  await ctx.ops.notifications.refreshStanding(event);
}

/**
 * Bring `recipientUserId`'s consent ask in line with the table. Call at the END of any verb that can change
 * the recipient's pending-consent count, AFTER its own write has committed.
 *
 * Never rejects (see the header): the caller's verb result is the user's act, and this is the follow-up.
 */
export function refreshConsentPrompt(ctx: PluginContext, recipientUserId: UserId, raised: boolean): Promise<void> {
  const tail = chains.get(recipientUserId) ?? Promise.resolve();
  // NO REJECTION ARM, and that is a property rather than an omission: every link in this chain is the
  // function below, which owns its own failure by logging it, so `tail` is a promise that cannot reject and
  // a second absorber here would be swallowing a rejection that does not exist.
  const next: Promise<void> = tail
    .then(async (): Promise<void> => {
      try {
        await publish(ctx, recipientUserId, raised);
      } catch (err: unknown) {
        getLog().error({ userId: recipientUserId, err: errorMessage(err) }, "plugin: could not refresh the pending-consent notification");
      }
    })
    // Drop the entry only when THIS link is still the tail — a refresh queued behind it owns the slot now,
    // so the map holds at most one entry per user with a consent act in flight, and never a stale one.
    .finally((): void => {
      if (chains.get(recipientUserId) === next) {
        chains.delete(recipientUserId);
      }
    });
  chains.set(recipientUserId, next);
  return next;
}
