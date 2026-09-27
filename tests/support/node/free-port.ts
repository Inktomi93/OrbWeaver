// A loopback TCP port that was free a moment ago, for a subject that takes a fixed port rather than binding 0.

import { createServer } from "node:net";

export async function freeLoopbackPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  await new Promise<void>((resolve) => {
    probe.close(() => {
      resolve();
    });
  });
  if (address === null || typeof address === "string") {
    throw new Error("the probe did not bind a TCP port");
  }
  return address.port;
}
