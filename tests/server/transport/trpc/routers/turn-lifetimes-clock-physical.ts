import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createFrozenClock, makePromptConfig } from "@orb/testkit/iso";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";

export const NOW = Date.UTC(2026, 0, 15, 20, 0);
export const KATHMANDU = "Asia/Kathmandu";
export const KATHMANDU_CLOCK = "2026-01-16 01:45:00 Friday";
export const CLOCK_PREFIX = "CLOCK ";
export const UTC_CLOCK = "2026-01-15 20:00:00 Thursday";
export const CLOCK_CONFIG = makePromptConfig({
  sections: [
    { type: "literal", id: "clock", name: "Clock", role: "system", content: `${CLOCK_PREFIX}{{date}} {{time}} {{weekday}}`, enabled: true },
    ...DEFAULT_PROMPT_CONFIG.sections,
  ],
});

/** Give each real root its own clock while preserving the same rendered prompt fixture. */
export function clockOptions(): Omit<ChatRootOptions, "providerFetch"> {
  return { server: { clock: createFrozenClock(NOW) }, group: { output: "per-speaker", policy: "list", allowSelfResponses: true }, promptConfig: CLOCK_CONFIG };
}

/** Read the clock from actual vendor bytes; an absent clock is not an empty successful observation. */
export async function nativeClocks(h: ChatRoot): Promise<string[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => {
        const clock = /CLOCK (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \w+)/u.exec(await request.clone().text())?.[1];
        if (clock === undefined) {
          throw new Error("the actual native request contains no rendered clock");
        }
        return clock;
      }),
  );
}
