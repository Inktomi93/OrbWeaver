// domain/share/contract/params — the verbs' params. Every transport verb takes only its caller: the owner gate is the
// whole authorization, and no verb reads or writes a row.

import type { IpCertificateSetting, Principal } from "@orb/contracts/identity";

export interface ShareParams {
  readonly principal: Principal;
}

/** The owner's IP certificate choice as the Share card sends it; the verb canonicalizes the address. */
export interface EnableIpCertificateParams extends ShareParams {
  readonly setting: IpCertificateSetting;
}
