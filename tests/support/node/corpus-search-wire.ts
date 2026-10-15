// Search replay retains only private physical exchanges, never synthesized domain results or portable credentials.
interface SearchExchange {
  readonly method: string;
  readonly url: string;
  readonly body: string;
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly response: string;
}

interface SearchWireCapture<T> {
  readonly value: T;
  readonly exchanges: readonly SearchExchange[];
}

interface SearchWire {
  readonly execute: typeof fetch;
  readonly capture: <T>(operation: () => Promise<T>) => Promise<SearchWireCapture<T>>;
}

/** Observe the source's real raw provider exchanges during one final-read window. */
export function createCorpusSearchWire(execute: typeof fetch): SearchWire {
  let active: SearchExchange[] | undefined;
  return {
    execute: async (input, init): Promise<Response> => {
      const recording = active;
      if (recording === undefined) {
        return await execute(input, init);
      }
      const request = new Request(input, init);
      const body = await request.clone().text();
      const response = await execute(request);
      recording.push({
        method: request.method,
        url: request.url,
        body,
        status: response.status,
        headers: [...response.headers.entries()],
        response: await response.clone().text(),
      });
      return response;
    },
    capture: async <T>(operation: () => Promise<T>): Promise<SearchWireCapture<T>> => {
      if (active !== undefined) {
        throw new Error("Native search wire capture is already active");
      }
      const exchanges: SearchExchange[] = [];
      active = exchanges;
      try {
        return { value: await operation(), exchanges };
      } finally {
        active = undefined;
      }
    },
  };
}

/** Replay only captured raw requests; a changed or exhausted exchange refuses at the physical edge. */
export function replayCorpusSearchWire(exchanges: readonly SearchExchange[]): { readonly execute: typeof fetch; readonly remaining: () => number } {
  const pending = [...exchanges];
  return {
    execute: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      const body = await request.text();
      const index = pending.findIndex((candidate) => candidate.method === request.method && candidate.url === request.url && candidate.body === body);
      if (index === -1) {
        throw new Error("Uncaptured or exhausted native search provider request");
      }
      const [exchange] = pending.splice(index, 1);
      if (exchange === undefined) {
        throw new Error("Native search provider replay lost its selected exchange");
      }
      return new Response(exchange.response, { status: exchange.status, headers: exchange.headers.map(([key, value]) => [key, value]) });
    },
    remaining: (): number => pending.length,
  };
}
