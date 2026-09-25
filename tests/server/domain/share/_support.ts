// Shared substrate for the share domain tests (imported, never run). The service is built over the real owner guard
// and a recording relay controller, so a test reads what reached the relay and the audit log, and in what order.

import type { AuthMode, Principal, RelayStatus, UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireOwner } from "@orb/server/domain/admin";
import type { ShareService } from "@orb/server/domain/share";
import { createShareService } from "@orb/server/domain/share";
import type { AuditEntry } from "@orb/server/foundation/observability";

export const LOCAL_SETUP_URL = "http://localhost:8788";
/** The sockets of every account but the owner's: what the card shows the owner. */
export const LIVE_SOCKETS = 3;
// The owner's own tabs, which the box-wide count includes and the card must not.
const OWNER_SOCKETS = 2;
const AT = 1_750_000_000_000;

export function caller(role: UserRole): Principal {
  const userId = castId<UserId>(`user_${role}`);
  return { userId, role, handle: castId<Handle>(`${role}`), externalId: null, via: "cookie" };
}

function liveSocketCount(userId?: UserId): number {
  if (userId === undefined) {
    return LIVE_SOCKETS + OWNER_SOCKETS;
  }
  return userId === caller("owner").userId ? OWNER_SOCKETS : 0;
}

export interface ShareHarness {
  readonly share: ShareService;
  readonly calls: string[];
  readonly audits: AuditEntry[];
  /** Flip the owner row's password state, as the first-run claim does. */
  readonly claimOwner: () => void;
}

export function shareHarness(options: {
  readonly authMode: AuthMode;
  readonly inContainer?: boolean;
  readonly ownerNeedsPassword?: boolean;
  readonly startError?: Error;
  readonly publicAddresses?: readonly string[];
}): ShareHarness {
  const calls: string[] = [];
  const audits: AuditEntry[] = [];
  let ownerNeedsPassword = options.ownerNeedsPassword ?? false;
  let status: RelayStatus = { state: "off" };
  const share = createShareService({
    relay: {
      start: (): Promise<RelayStatus> => {
        calls.push("relay.start");
        if (options.startError !== undefined) {
          return Promise.reject(options.startError);
        }
        status = { state: "starting", relay: "quick", restartAfter: null };
        return Promise.resolve(status);
      },
      stop: (): void => {
        calls.push("relay.stop");
        status = { state: "off" };
      },
      status: (): RelayStatus => status,
    },
    requireOwner,
    authMode: options.authMode,
    inContainer: options.inContainer ?? false,
    ownerNeedsPassword: (): Promise<boolean> => {
      calls.push("ownerNeedsPassword");
      return Promise.resolve(ownerNeedsPassword);
    },
    localSetupUrl: () => LOCAL_SETUP_URL,
    publicAddresses: options.publicAddresses ?? [],
    liveSocketCount,
    audit: (entry): Promise<void> => {
      audits.push(entry);
      return Promise.resolve();
    },
    now: () => AT,
  });
  return {
    share,
    calls,
    audits,
    claimOwner: (): void => {
      ownerNeedsPassword = false;
    },
  };
}
