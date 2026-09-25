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
export const LIVE_SOCKETS = 3;
const AT = 1_750_000_000_000;

export function caller(role: UserRole): Principal {
  const userId = castId<UserId>(`user_${role}`);
  return { userId, role, handle: castId<Handle>(`${role}`), externalId: null, via: "cookie" };
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
        status = { state: "starting", relay: "quick" };
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
    liveSocketCount: () => LIVE_SOCKETS,
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
