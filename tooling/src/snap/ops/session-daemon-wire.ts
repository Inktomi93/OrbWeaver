import type { Server, Socket } from "node:net";
import { errorMessage } from "@orb/kit/error-message";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget } from "../../_shared/load-budget.ts";
import { warn } from "../../_shared/log.ts";
import type { SessionRequest } from "../contract/session.ts";
import { readSessionRequest } from "../lib/session-wire.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

const REQUEST_LINE_BASE_MS = 30_000;
const REQUEST_LINE_TIMEOUT_MS = budget(REQUEST_LINE_BASE_MS);

export function readSessionRequestLine(socket: Socket): Promise<SessionRequest | null> {
  return new Promise<SessionRequest | null>((resolve) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(REQUEST_LINE_TIMEOUT_MS, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline !== -1) {
        socket.setTimeout(0);
        resolve(readSessionRequest(buffer.slice(0, newline)));
      }
    });
    socket.on("error", (error) => {
      warn(`session      ${errorMessage(error)} on a client connection`);
      resolve(null);
    });
  });
}

export function listenSessionServer(server: Server, socketPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
