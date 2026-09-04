import type {
  BrowserNetworkResponse,
  BrowserNetworkSecurityDetails,
  BrowserNetworkSecurityDetailsInput,
  BrowserNetworkTimingInput,
} from "./browser-contract.ts";
import { normalizeBrowserNetworkHeaders } from "./browser-contract.ts";

export function normalizeBrowserNetworkResponse(response: {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly mimeType: string;
  readonly protocol?: string;
  readonly timing?: BrowserNetworkTimingInput;
  readonly fromDiskCache?: boolean;
  readonly fromServiceWorker?: boolean;
  readonly fromPrefetchCache?: boolean;
  readonly connectionId: number;
  readonly remoteIPAddress?: string;
  readonly remotePort?: number;
  readonly securityState: string;
  readonly securityDetails?: BrowserNetworkSecurityDetailsInput;
}): BrowserNetworkResponse {
  const details = response.securityDetails;
  const securityDetails: BrowserNetworkSecurityDetails | null =
    details === undefined
      ? null
      : {
          protocol: details.protocol,
          keyExchange: details.keyExchange,
          keyExchangeGroup: details.keyExchangeGroup ?? null,
          cipher: details.cipher,
          mac: details.mac ?? null,
          certificateId: details.certificateId,
          subjectName: details.subjectName,
          sanList: details.sanList,
          issuer: details.issuer,
          validFrom: details.validFrom,
          validTo: details.validTo,
          signedCertificateTimestampList: details.signedCertificateTimestampList,
          certificateTransparencyCompliance: details.certificateTransparencyCompliance,
          serverSignatureAlgorithm: details.serverSignatureAlgorithm ?? null,
          encryptedClientHello: details.encryptedClientHello,
        };
  const timing = response.timing;
  return {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeBrowserNetworkHeaders(response.headers),
    mimeType: response.mimeType,
    protocol: response.protocol ?? "unknown",
    timing:
      timing === undefined
        ? null
        : {
            proxyStart: timing.proxyStart,
            proxyEnd: timing.proxyEnd,
            dnsStart: timing.dnsStart,
            dnsEnd: timing.dnsEnd,
            connectStart: timing.connectStart,
            connectEnd: timing.connectEnd,
            sslStart: timing.sslStart,
            sslEnd: timing.sslEnd,
            sendStart: timing.sendStart,
            sendEnd: timing.sendEnd,
            receiveHeadersStart: timing.receiveHeadersStart,
            receiveHeadersEnd: timing.receiveHeadersEnd,
          },
    fromDiskCache: response.fromDiskCache === true,
    fromServiceWorker: response.fromServiceWorker === true,
    fromPrefetchCache: response.fromPrefetchCache === true,
    connectionId: response.connectionId,
    remoteIPAddress: response.remoteIPAddress ?? "",
    remotePort: response.remotePort ?? -1,
    securityState: response.securityState,
    securityDetails,
  };
}
