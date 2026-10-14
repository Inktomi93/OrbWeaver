// Hold only the physical request; native turn admission, abort, accounting and persistence remain real.
import { readSeedAvatar } from "@orb/default-content";
import { WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import sharp from "sharp";
import type { CorpusProviderCompletion } from "./corpus-provider.ts";

export const CORPUS_CHAT_MODEL = "corpus-lifecycle-text-v1";
export const CORPUS_CHAT_IMPORT_CUE = "Record the imported ledger scene.";
export const CORPUS_CHAT_EMPTY_CUE = "Record the refused lifecycle witness.";
export const CORPUS_CHAT_HELD_CUE = "Record the held lifecycle witness.";
export const CORPUS_CHAT_ABORT_CUE = "Record the aborted lifecycle witness.";
export const CORPUS_CHAT_DEFERRED_CUE = "Record the absent host lifecycle witness.";
export const CORPUS_CHAT_REPLY = "The lifecycle witness preserves the orbital ledger.";

interface PhysicalGate {
  signal: AbortSignal | undefined;
  readonly deferAbortUntilRelease: boolean;
  readonly cue: string;
  readonly entered: PromiseWithResolvers<void>;
  readonly released: PromiseWithResolvers<void>;
  readonly aborted: PromiseWithResolvers<void>;
}
interface CorpusChatRequestHold {
  readonly requestSignal: () => AbortSignal | undefined;
  readonly entered: Promise<void>;
  readonly aborted: Promise<void>;
  readonly release: () => void;
}
interface CorpusChatWire {
  readonly requests: readonly string[];
  readonly remaining: () => number;
  readonly completion: (body: string) => CorpusProviderCompletion | undefined;
  readonly hold: (cue: string, options?: { readonly deferAbortUntilRelease: boolean }) => CorpusChatRequestHold;
  readonly wrap: (execute: typeof fetch) => typeof fetch;
}

/** Finite raw replies are independent of the real lifecycle that spends them. */
export function createCorpusChatWire(): CorpusChatWire {
  const cues = [CORPUS_CHAT_IMPORT_CUE, "Conversation to summarize:", CORPUS_CHAT_EMPTY_CUE, CORPUS_CHAT_HELD_CUE, CORPUS_CHAT_DEFERRED_CUE] as const;
  const requests: string[] = [];
  let cursor = 0;
  let active: PhysicalGate | undefined;
  return {
    requests,
    remaining: (): number => cues.length - cursor,
    completion: (body: string): CorpusProviderCompletion | undefined => {
      if (!body.includes(`"model":${JSON.stringify(CORPUS_CHAT_MODEL)}`)) {
        return undefined;
      }
      const cue = cues[cursor];
      if (cue === undefined || !body.includes(cue)) {
        throw new Error(`unscripted lifecycle corpus reply at physical step ${cursor}`);
      }
      cursor += 1;
      requests.push(body);
      return {
        text: cue === CORPUS_CHAT_EMPTY_CUE ? "" : CORPUS_CHAT_REPLY,
        toolCalls: [],
        usage: { promptTokens: 40, completionTokens: cue === CORPUS_CHAT_EMPTY_CUE ? 0 : 15 },
      };
    },
    hold: (cue: string, options): CorpusChatRequestHold => {
      if (active !== undefined) {
        throw new Error("a lifecycle physical request is already held");
      }
      const gate: PhysicalGate = {
        signal: undefined,
        deferAbortUntilRelease: options?.deferAbortUntilRelease ?? false,
        cue,
        entered: Promise.withResolvers<void>(),
        released: Promise.withResolvers<void>(),
        aborted: Promise.withResolvers<void>(),
      };
      active = gate;
      return {
        requestSignal: (): AbortSignal | undefined => gate.signal,
        entered: gate.entered.promise,
        aborted: gate.aborted.promise,
        release: (): void => {
          active = undefined;
          gate.released.resolve();
        },
      };
    },
    wrap:
      (execute: typeof fetch): typeof fetch =>
      async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        const gate = active;
        if (
          gate === undefined ||
          request.method !== "POST" ||
          !new URL(request.url).pathname.endsWith("/chat/completions") ||
          !(await request.clone().text()).includes(gate.cue)
        ) {
          return await execute(request);
        }
        const interrupted = Promise.withResolvers<void>();
        gate.signal = request.signal;
        const onAbort = (): void => {
          gate.aborted.resolve();
          if (!gate.deferAbortUntilRelease) {
            interrupted.reject(new DOMException("Aborted", "AbortError"));
          }
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
        try {
          request.signal.throwIfAborted();
          gate.entered.resolve();
          await Promise.race([gate.released.promise, interrupted.promise]);
          request.signal.throwIfAborted();
          return await execute(request);
        } finally {
          request.signal.removeEventListener("abort", onAbort);
        }
      },
  };
}

/** Valid pixels enter vendor image replies, never pre-parsed generation or geometry rows. */
export async function corpusImageryPhysicalBytes(): Promise<Uint8Array[]> {
  const avatar = await readSeedAvatar(WELCOME_ASSISTANT_HANDLE);
  if (avatar === null) {
    throw new Error("bundled imagery corpus pixels are missing");
  }
  return await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      sharp(Buffer.from(avatar.bytes))
        .resize({ width: 32 + index, height: 48 + index })
        .png()
        .toBuffer(),
    ),
  );
}
