// Reserve an OS-assigned loopback port and hand it back free. Snap needs the number BEFORE the process
// that will bind it exists (`--remote-debugging-port=<n>` is a launch argument), which is the one case
// `--port 0` cannot serve — Chrome publishes its OS-assigned port only into a persistent profile's
// `DevToolsActivePort` file, and the Lighthouse arm deliberately launches an ORDINARY ephemeral context
// (_shared/devtools-runtime.ts owns the persistent-profile variant, for the cascade SDK).
//
// The race — someone else binding the port between the probe and the launch — is real and bounded: the
// kernel hands out the highest-numbered free ephemeral port, and the caller REFUSES loudly when the
// endpoint never answers (ops/lighthouse.ts), so the failure mode is a named refusal, never a silent
// attach to somebody else's browser.
import { createServer } from "node:net";

export async function reserveLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("INSTRUMENT ERROR: the loopback port probe bound no inet address (tooling/src/snap/lib/loopback-port.ts)")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
