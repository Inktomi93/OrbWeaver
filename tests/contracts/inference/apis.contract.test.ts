// contracts/inference/apis — the chat PROTOCOL axis. The tuple is persisted (`user_connections.api` carries
// a member or `auto`) and it is the coherence vocabulary every provider row narrows, so the two properties
// that matter are: the schema stays CLOSED (a widening to `z.string()` would let an unservable api reach a
// stored row), and the tuple has no ORPHANS — every member is spoken by at least one wire, and no wire
// claims an api the tuple does not carry. An orphan member is a protocol the picker can offer and nothing
// can serve.

import { CHAT_APIS, chatApiSchema, WIRE_DEFS, WIRES } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every member parses to itself and anything else is REFUSED (the enum stays closed)", () => {
  for (const api of CHAT_APIS) {
    expect(chatApiSchema.parse(api)).toBe(api);
  }
  // `responses` is a RETIRED member (owner ruling 2026-09-20 — the OpenRouter Responses runner was
  // demolished with `@openrouter/sdk` and never replaced); a stored row still naming it must not parse.
  for (const notAnApi of ["", "chat-completion", "openai", "responses", "responses "]) {
    expect(chatApiSchema.safeParse(notAnApi).success, `"${notAnApi}" must not parse as a chat api`).toBe(false);
  }
});

test("no wire claims an api the tuple does not carry", () => {
  const known: ReadonlySet<string> = new Set<string>(CHAT_APIS);
  for (const wire of WIRES) {
    for (const api of WIRE_DEFS[wire].apis) {
      expect(known.has(api), `the "${wire}" wire claims "${api}", which is not a CHAT_APIS member`).toBe(true);
    }
  }
});

test("no member is an ORPHAN — each api is spoken by at least one wire", () => {
  const spoken = new Set(WIRES.flatMap((wire) => WIRE_DEFS[wire].apis));
  for (const api of CHAT_APIS) {
    expect(spoken.has(api), `"${api}" is in the picker's vocabulary but no wire speaks it`).toBe(true);
  }
});
