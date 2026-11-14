// The wire client's batching split, driven through the production client and the room roster's own options. Only the
// HTTP response is controlled: it answers a request the way the server mount does, one response written after every call
// in the request has settled.

import { roomRosterOptions } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createClientRuntime } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { afterEach, vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const CHAT_ID = mintTypeId(ID_PREFIX.chat, ids.next);
const CLIENT_URL = "http://127.0.0.1:1/api/trpc";
const MOUNT_PREFIX = `${new URL(CLIENT_URL).pathname}/`;
const BATCH_PARAM = "batch";

interface Arrival {
  readonly paths: readonly string[];
  readonly method: string;
  readonly csrf: string | null;
  readonly batched: boolean;
}

interface HeldServer {
  readonly arrivals: readonly Arrival[];
  readonly release: () => void;
  /** Settles once every named procedure has reached the server, in however many requests. */
  readonly reached: (...paths: readonly string[]) => Promise<void>;
}

interface Scene {
  readonly runtime: ReturnType<typeof createClientRuntime>;
  readonly rosterPath: string;
  readonly transcriptPath: string;
  readonly roster: unknown;
  readonly transcript: unknown;
  readonly server: HeldServer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A server whose slow procedure is held until `release`: a request answers only once every call in it has settled. */
function serveWithHeldProcedure(held: string, answers: ReadonlyMap<string, unknown>): HeldServer {
  const release = Promise.withResolvers<void>();
  const arrivals: Arrival[] = [];
  const arrived = new Set<string>();
  let wake: () => void = () => undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const paths = decodeURIComponent(url.pathname.slice(MOUNT_PREFIX.length)).split(",");
    const batched = url.searchParams.has(BATCH_PARAM);
    arrivals.push({ paths, method: request.method, csrf: request.headers.get(CSRF_HEADER), batched });
    for (const path of paths) {
      arrived.add(path);
    }
    wake();
    if (paths.includes(held)) {
      await release.promise;
    }
    const envelopes = paths.map((path) => ({ result: { data: answers.get(path) } }));
    return Response.json(batched ? envelopes : envelopes[0], { headers: { "content-type": "application/json" } });
  });
  return {
    arrivals,
    release: release.resolve,
    reached: (...paths): Promise<void> =>
      new Promise((resolve) => {
        wake = (): void => {
          if (paths.every((path) => arrived.has(path))) {
            resolve();
          }
        };
        wake();
      }),
  };
}

function scene(): Scene {
  const runtime = createClientRuntime(CLIENT_URL);
  const proxy = runtime.trpcProxy;
  const rosterPath = proxy.chat.getChat.queryKey({ chatId: CHAT_ID })[0].join(".");
  const transcriptPath = proxy.chat.listMessages.queryKey({ chatId: CHAT_ID })[0].join(".");
  const roster = { room: "roster" };
  const transcript = { room: "transcript" };
  const answers = new Map<string, unknown>([
    [rosterPath, roster],
    [transcriptPath, transcript],
  ]);
  return { runtime, rosterPath, transcriptPath, roster, transcript, server: serveWithHeldProcedure(transcriptPath, answers) };
}

test("a read that rides alone settles while a slow read in the same tick is still held", async () => {
  const { runtime, rosterPath, transcriptPath, roster, transcript, server } = scene();
  const proxy = runtime.trpcProxy;
  try {
    let transcriptSettled = false;
    const slow = runtime.queryClient.query(proxy.chat.listMessages.queryOptions({ chatId: CHAT_ID })).then((page) => {
      transcriptSettled = true;
      return page;
    });
    const fast = runtime.queryClient.query(roomRosterOptions(proxy, { chatId: CHAT_ID }));
    await server.reached(rosterPath, transcriptPath);
    expect(server.arrivals).toHaveLength(2);
    const alone = server.arrivals.find((arrival) => arrival.paths.includes(rosterPath));
    expect(alone).toEqual({ paths: [rosterPath], method: "POST", csrf: "1", batched: false });
    expect(await fast).toEqual(roster);
    expect(transcriptSettled).toBe(false);
    server.release();
    expect(await slow).toEqual(transcript);
  } finally {
    server.release();
    runtime.queryClient.clear();
  }
});

test("control: the same read left to the batch is held until the slow read answers", async () => {
  const { runtime, rosterPath, transcriptPath, roster, transcript, server } = scene();
  const proxy = runtime.trpcProxy;
  try {
    let rosterSettled = false;
    const fast = runtime.queryClient.query(proxy.chat.getChat.queryOptions({ chatId: CHAT_ID })).then((chat) => {
      rosterSettled = true;
      return chat;
    });
    const slow = runtime.queryClient.query(proxy.chat.listMessages.queryOptions({ chatId: CHAT_ID }));
    await server.reached(rosterPath, transcriptPath);
    expect(server.arrivals.map((arrival) => arrival.paths)).toEqual([[rosterPath, transcriptPath]]);
    expect(rosterSettled).toBe(false);
    server.release();
    expect(await fast).toEqual(roster);
    expect(await slow).toEqual(transcript);
  } finally {
    server.release();
    runtime.queryClient.clear();
  }
});
