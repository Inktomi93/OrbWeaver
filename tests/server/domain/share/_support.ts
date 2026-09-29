// Shared substrate for the share domain tests (imported, never run). The service is built over the real owner guard
// and a recording relay controller, so a test reads what reached the relay and the audit log, and in what order.

import type { AuthMode, IpCertificateSetting, IpCertificateStatus, Principal, RelayStatus, UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireOwner } from "@orb/server/domain/admin";
import type { ShareService } from "@orb/server/domain/share";
import { createShareService } from "@orb/server/domain/share";
import type { AuditEntry } from "@orb/server/foundation/observability";

export const LOCAL_SETUP_URL = "http://localhost:8788";
/** The app listener's port the harness reports. */
export const APP_PORT = 8788;
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
  /** Every IP certificate setting the service persisted, in order, with the principal it wrote as. */
  readonly savedSettings: { readonly by: Principal; readonly setting: IpCertificateSetting | null }[];
}

export function shareHarness(options: {
  readonly authMode: AuthMode;
  readonly ownerNeedsPassword?: boolean;
  readonly startError?: Error;
  readonly publicAddresses?: readonly string[];
  readonly certificateSetting?: IpCertificateSetting;
  readonly publicBind?: boolean;
}): ShareHarness {
  const calls: string[] = [];
  const audits: AuditEntry[] = [];
  const savedSettings: { by: Principal; setting: IpCertificateSetting | null }[] = [];
  let ownerNeedsPassword = options.ownerNeedsPassword ?? false;
  let status: RelayStatus = { state: "off" };
  let certificate: IpCertificateStatus = { state: "off" };
  let storedSetting: IpCertificateSetting | null = options.certificateSetting ?? null;
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
    certificate: {
      enable: (setting): Promise<IpCertificateStatus> => {
        calls.push(`certificate.enable ${setting.address}`);
        certificate = { state: "obtaining", setting };
        return Promise.resolve(certificate);
      },
      disable: (): Promise<void> => {
        calls.push("certificate.disable");
        certificate = { state: "off" };
        return Promise.resolve();
      },
      stop: (): Promise<void> => {
        calls.push("certificate.stop");
        certificate = { state: "off" };
        return Promise.resolve();
      },
      status: (): IpCertificateStatus => certificate,
    },
    certificateSetting: () => storedSetting,
    saveCertificateSetting: (by, setting): Promise<void> => {
      calls.push(setting === null ? "saveCertificateSetting null" : `saveCertificateSetting ${setting.address}`);
      savedSettings.push({ by, setting });
      storedSetting = setting;
      return Promise.resolve();
    },
    publicBind: options.publicBind ?? true,
    appPort: () => APP_PORT,
    enableSeating: (): Promise<() => Promise<void>> => {
      calls.push("enableSeating");
      return Promise.resolve((): Promise<void> => {
        calls.push("restoreSeating");
        return Promise.resolve();
      });
    },
    requireOwner,
    authMode: options.authMode,
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
    savedSettings,
  };
}
