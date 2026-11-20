import type { ChatId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import type { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A corpus room the owner hosts and `accepts` admits, read through the owner's own root. */
export async function findHostedRoom(host: Caller, accepts: (chatId: ChatId) => Promise<boolean> = () => Promise.resolve(true)): Promise<ChatId> {
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost && (await accepts(room.id))) {
      return room.id;
    }
  }
  throw new Error("The corpus has no room the owner hosts that the case accepts");
}

/** A corpus room the owner hosts, with `procedures` answered by that owner's own root. */
export async function hostedRoom(
  root: Harness,
  page: Page,
  procedures: Parameters<typeof serveCorpusProcedures>[1],
): Promise<{ readonly chatId: ChatId; readonly host: Caller }> {
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(host, procedures));
  return { chatId, host };
}
