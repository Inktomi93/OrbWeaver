// `net.Server#address()` is `AddressInfo | string | null`; a listening TCP server is the `AddressInfo` arm.
import type { AddressInfo } from "node:net";

/** The TCP address a listening server bound. A pipe, or a server not yet listening, is a fixture break. */
export function listeningAddress(server: { address: () => AddressInfo | string | null }): AddressInfo {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(`The server is not listening on a TCP port: ${String(address)}`);
  }
  return address;
}
