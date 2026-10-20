// Shared substrate for the share domain tests (imported, never run). The service is built over the real owner guard
// and a recording relay controller, so a test reads what reached the relay and the audit log, and in what order.

import type {
  AuthMode,
  AuthModeSource,
  InstallKind,
  IpCertificateSetting,
  IpCertificateStatus,
  Principal,
  RelayStatus,
  UserRole,
} from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { requireAdmin, requireOwner } from "#server/domain/admin/index.ts";
import type { ShareService } from "#server/domain/share/index.ts";
import { createShareService } from "#server/domain/share/index.ts";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";

export const LOCAL_SETUP_URL = "http://localhost:8788";
/** The app listener's port the harness reports. */
export const APP_PORT = 8788;
/** The sockets of every account but the owner's: what the card shows the owner. */
export const LIVE_SOCKETS = 3;
// The owner's own tabs, which the box-wide count includes and the card must not.
const OWNER_SOCKETS = 2;

function callerId(role: UserRole): UserId {
  return castId<UserId>(`user_${role}`);
}

/** The Principal of the account holding `role`; the role is written onto its row before it resolves. */
export async function caller(db: Db, role: UserRole): Promise<Principal> {
  return await makePrincipal({ db }, callerId(role), { role });
}

function liveSocketCount(userId?: UserId): number {
  if (userId === undefined) {
    return LIVE_SOCKETS + OWNER_SOCKETS;
  }
  return userId === callerId("owner") ? OWNER_SOCKETS : 0;
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
  readonly authModeSource?: AuthModeSource;
  readonly install?: InstallKind;
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
    requireAdmin,
    authMode: options.authMode,
    authModeSource: options.authModeSource ?? "env-file",
    install: options.install ?? "bare-metal",
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
    now: () => FROZEN_AT_MS,
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
