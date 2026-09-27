// This host's first IPv4 address on an interface that is not loopback, for a suite that pins BIND_HOST to one named
// interface. A host with none fails the suite loudly rather than skipping it.

import { networkInterfaces } from "node:os";

export function lanAddress(): string {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  throw new Error("this suite pins BIND_HOST to a non-loopback IPv4 interface, and this host has none");
}
