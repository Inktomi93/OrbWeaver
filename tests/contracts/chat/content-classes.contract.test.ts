// The parity-plus §3.1 visibility registry — pins the shipped two-plane cells AND the registry's totality
// over the kit span-kind axis (a new content class must declare its row; the Record compile-forces it, this
// pins it at runtime too so a `satisfies`-dodge can't half-register).

import { CONTENT_CLASS_POLICY } from "@orb/contracts/chat";
import { CONTENT_SPAN_KINDS } from "@orb/kit/content";
import { expect, test } from "../../support/fixtures";

test("CONTENT_CLASS_POLICY covers EVERY ContentSpanKind (registry totality — a new kind is a row, not a build)", () => {
  for (const kind of CONTENT_SPAN_KINDS) {
    const policy = CONTENT_CLASS_POLICY[kind];
    expect(policy, `missing policy row for span kind "${kind}"`).toBeDefined();
    expect(["show", "hide"]).toContain(policy.reading);
    expect(["full", "stub", "drop"]).toContain(policy.wire);
  }
  // No orphan rows either — the registry and the axis are the same set.
  expect(Object.keys(CONTENT_CLASS_POLICY).sort()).toEqual([...CONTENT_SPAN_KINDS].sort());
});

test("the shipped cells match the ratified §3.1 table", () => {
  expect(CONTENT_CLASS_POLICY).toEqual({
    text: { reading: "show", wire: "full" },
    image: { reading: "show", wire: "drop" },
    // <lie>/<ofilter>: the reader never sees it; the model MUST remember its own lie / the true event.
    hidden: { reading: "hide", wire: "full" },
    // html-card: the reader keeps the rich card forever; the model gets the deterministic stub.
    card: { reading: "show", wire: "stub" },
    // CYOA: buttons for the reader; the model's own one-line options ride the wire.
    choices: { reading: "show", wire: "full" },
    // §3.2.1 allowlist-strip: a hallucinated command tag/fence never renders; the wire stays honest.
    "unknown-directive": { reading: "hide", wire: "full" },
  });
});
