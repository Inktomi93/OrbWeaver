// verb: reportUiCrash — the CLIENT half of the 3-strike crash policy. A Tier-C
// guest that blows its wall-clock deadline, fails to boot, or publishes a tree the client schema refuses is
// terminated in the browser and its surface collapses to null; the browser then tells the server, and that fact
// lands in the SAME `consecutive_crashes` counter a throwing server handler drives. So a plugin whose UI half
// dies every mount auto-disables exactly like one whose server half throws — which is the point: from a user's
// side "this plugin is broken" is one fact, and it should not need two different remedies depending on which
// half broke.
//
// THE COUNTER IS ADVANCED BY A CLIENT REPORT, so the honest question is what a hostile client can do with it.
// The answer is bounded and, importantly, bounded to THEMSELVES: the report is owner-scoped (a foreign pluginId
// is a leak-free NOT_FOUND, so nobody can advance anyone else's counter), and the worst a caller can do to their
// OWN row is disable their own plugin — which they can already do, deliberately and in one click, with
// `setEnabled`. That is the capability-first line exactly: the wall protects other users and the system, and the
// installing user is left able to break their own thing. What the report is NOT allowed to be is a lever on
// somebody else's row, and the owner scope is what makes that unspellable rather than merely unlikely.
//
// A CLEAN MOUNT DOES NOT RESET THE COUNTER FROM HERE. `recordCleanRun` is driven by the resident invoke loop
// (activation), which observes a real guest invocation settling successfully; the browser cannot observe that
// and must not be allowed to assert it. A UI crash therefore contributes to the counter and only a genuine
// server-side clean run clears it. That asymmetry is deliberate and conservative: it can auto-disable a plugin
// whose UI is flapping while its server half is idle, which is the correct outcome (a plugin that cannot draw
// is broken), and it can never let a browser paper over a crashing server half.

import { PluginNotFoundError } from "../contract/errors.ts";
import type { ReportUiCrashParams } from "../contract/params.ts";
import type { CrashPolicy, PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

/** How much of the client-supplied reason is retained on the row's `lastError`. The reason is UNTRUSTED text
 *  from a realm that runs plugin code, and it lands in an operator-facing column — so it is bounded here (the
 *  transport bounds it too; this is the belt under that, for the same reason every other double-bounded
 *  untrusted string in this domain has one). */
const CRASH_REASON_MAX = 200;

export function createReportUiCrash(ctx: PluginContext, crashPolicy: CrashPolicy): PluginService["reportUiCrash"] {
  return async ({ caller, pluginId, surfaceId, reason }: ReportUiCrashParams) => {
    // OWNER SCOPE — a foreign pluginId reads absent → leak-free NOT_FOUND. This is the whole cross-tenant story:
    // without it, a stranger holding a real pluginId could three-strike another tenant's plugin off the air.
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // The recipient of the auto-disable notice is the OWNER of the row, read off the row rather than taken from
    // the caller — they are the same principal today (viewer == installer), and writing it this way means the
    // notice still goes to the right person if that ever stops being true.
    await crashPolicy.recordCrash({
      pluginId,
      recipientUserId: existing.ownerId,
      error: `plugin UI surface '${surfaceId}' failed: ${reason.slice(0, CRASH_REASON_MAX)}`,
    });
  };
}
