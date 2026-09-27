// The IP certificate's preconditions as one ordered decision (D269): the local sign-in mode, a claimed owner, a public
// address, a listener the router can reach and the https hop can reach over loopback, and three distinct ports.
// SECURITY: the https listener delivers every visitor from a loopback peer, so under forward-header a visitor's forged
// identity header would be believed. The mode check runs on every start, the boot start included, because the stored
// setting outlives the mode it was chosen under.

import type { AuthMode, IpCertificateRefusal, IpCertificateSetting } from "@orb/contracts/identity";
import { parseIp } from "@orb/kit/ip";
import { isPublicUnicast } from "#infra/network";
import type { CertificateCheckResult, CertificateFacts, IpCertificateRefusalNotice, ShareFacts } from "../contract/service.ts";

const IPV4_BITS = 32;

const MODE_SENTENCE: Record<Exclude<AuthMode, "local">, string> = {
  "single-user": "Single-user mode has no sign-in, so this server would refuse every visitor who comes over https. Switch to the local sign-in mode first.",
  "forward-header":
    "The https listener hands every visitor to this server from this machine, and forward-header mode trusts this machine to name the user, so a visitor could claim any account. Friends reach this server through your proxy instead.",
  oidc: "Your identity provider returns people only to the addresses registered with it. Friends sign in at the address in OIDC_REDIRECT_URIS.",
};

/** The address in the one spelling a certificate and an ACME identifier use: a dotted quad, or RFC 5952 IPv6 text.
 *  Null for anything that is not an IP literal, and for an IPv4-mapped IPv6 address, which names no public host. */
export function canonicalAddress(raw: string): string | null {
  const trimmed = raw.trim();
  const parsed = parseIp(trimmed);
  if (parsed === null) {
    return null;
  }
  if (!trimmed.includes(":")) {
    return trimmed;
  }
  if (parsed.bits === IPV4_BITS) {
    return null;
  }
  return new URL(`http://[${trimmed}]`).hostname.slice(1, -1);
}

function notice(code: IpCertificateRefusal, message: string): { readonly refusal: IpCertificateRefusalNotice } {
  return { refusal: { code, message } };
}

/** The first unmet precondition, else the setting with its address canonical. */
export async function certificateRefusal(facts: ShareFacts & CertificateFacts, setting: IpCertificateSetting): Promise<CertificateCheckResult> {
  if (facts.authMode !== "local") {
    return notice("ip_certificate_mode", MODE_SENTENCE[facts.authMode]);
  }
  if (await facts.ownerNeedsPassword()) {
    return notice(
      "ip_certificate_owner_unclaimed",
      `The owner has no password yet, so https would lead a stranger to an unclaimed box. Open ${facts.localSetupUrl()} on this machine and finish setup first.`,
    );
  }
  const address = canonicalAddress(setting.address);
  if (address === null || !isPublicUnicast(address)) {
    return notice(
      "ip_certificate_not_public",
      `${setting.address.trim()} is not a public internet address. A home network, CGNAT, loopback or reserved address cannot get a public certificate; enter the public (WAN) address your router shows, or share through the tunnel.`,
    );
  }
  if (!facts.publicBind) {
    return notice(
      "ip_certificate_loopback_bind",
      "This server listens on this machine only, so your router cannot forward to it. Remove BIND_HOST=127.0.0.1 from the server's environment and restart it first.",
    );
  }
  if (!facts.loopbackUpstream) {
    return notice(
      "ip_certificate_bind_address",
      "This server listens on one network address only (BIND_HOST), so the https listener cannot hand visitors to it from this machine, and it would treat every visitor as one plain-http client. Unset BIND_HOST, or set it to 0.0.0.0, and restart it first.",
    );
  }
  const ports = [setting.httpsPort, setting.challengePort, facts.appPort()];
  if (new Set(ports).size !== ports.length) {
    return notice(
      "ip_certificate_ports",
      `The https port, the challenge port and this server's own port (${String(facts.appPort())}) must be three different ports.`,
    );
  }
  return { refusal: null, setting: { ...setting, address } };
}
