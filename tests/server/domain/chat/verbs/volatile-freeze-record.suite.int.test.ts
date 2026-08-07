// The VOLATILE-FREEZE PROVENANCE suite (D129-F / stickler 2026-08-08 §3+§13, finding F-C). The freeze is
// byte-DESTRUCTIVE by design — `{{roll}}`/`{{random}}`/`{{pick}}`/the clock family resolve ONCE at commit and
// bake into the canon row (D51: one post-transform text everywhere). Until this wave it left NO record and NO
// pre-freeze raw, so a swipe could not replay the roll and the documented greeting-swipe gap was structurally
// unfixable. This suite pins the RECORD end-to-end through the real turn verbs + real db:
//
//   • the SEND freeze hop (`assembly/context.ts` → `persistUserMessage`) and the GREETING freeze hop
//     (`freezeGreetingVolatiles`, verbs/turn.ts) each store `message_variants.raw_content` (the pre-freeze
//     authored text) + `macro_freezes` (the ordered occurrences they baked);
//   • the NULL convention — `raw_content` is NULL ⇔ byte-identical to `content`, `macro_freezes` NULL ⇔
//     nothing froze — so the overwhelming common case (a draft with no volatiles) costs zero bytes;
//   • REPRODUCIBILITY — replaying the stored record over the stored raw reproduces `content` byte-exactly,
//     which is the substrate a swipe/reattribution re-resolution stands on;
//   • the freeze AXIS boundary — the rpg data macros are volatile for CACHE purposes but are deliberately
//     absent from the freeze registry, so they are neither baked nor recorded.
//
// Columns are read straight off `message_variants` (the host-plane storage): `rawContent`/`macroFreezes` are
// HOST-PLANE by D129-F and never appear on `MessageView`, so there is no member-visible read to assert through.

import type { MacroFreezeRecord } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { MessageVariantId } from "@orb/kit/ids";
import { createVolatileOnlyRegistry, processMacros } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { scenario, tape } from "../../../../support/chat/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../_support.ts";

/** The persisted provenance triple for one variant, read from the host-plane columns. */
async function readProvenance(
  db: Db,
  variantId: MessageVariantId,
): Promise<{ content: string; rawContent: string | null; macroFreezes: MacroFreezeRecord | null }> {
  const [row] = await db
    .select({ content: messageVariants.content, rawContent: messageVariants.rawContent, macroFreezes: messageVariants.macroFreezes })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId));
  if (row === undefined) {
    throw new Error(`no variant ${variantId}`);
  }
  return row;
}

// ── the SEND hop ─────────────────────────────────────────────────────────────────────────────────────

test("a send whose draft froze a volatile macro stores the PRE-freeze draft + the ordered freeze record", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  await scn.send("I roll {{roll::1d1}} then pick {{pick::north}}");

  const userRow = (await scn.loadCanon()).find((m) => m.role === "user");
  const stored = await readProvenance(scn.db, userRow?.selectedVariantId ?? ("x" as MessageVariantId));
  expect(stored.content).toBe("I roll 1 then pick north");
  // The composer draft exactly as authored — pre-freeze, pre-regex.
  expect(stored.rawContent).toBe("I roll {{roll::1d1}} then pick {{pick::north}}");
  // Occurrence-ordered, `args` carrying the raw argument text of each call.
  expect(stored.macroFreezes).toEqual([
    { name: "roll", args: "1d1", value: "1" },
    { name: "pick", args: "north", value: "north" },
  ]);
});

test("a send with NO volatile macro writes NULL raw + NULL record — the byte-identical common case costs nothing", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  await scn.send("plain words, no macros here");

  const userRow = (await scn.loadCanon()).find((m) => m.role === "user");
  const stored = await readProvenance(scn.db, userRow?.selectedVariantId ?? ("x" as MessageVariantId));
  expect(stored.content).toBe("plain words, no macros here");
  // NULL ⇔ raw is byte-identical to content. A copy here would double every message body in the DB.
  expect(stored.rawContent).toBeNull();
  expect(stored.macroFreezes).toBeNull();
});

test("an IDENTITY macro is not a freeze — it stays raw in canon and contributes no record", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  await scn.send("hello {{char}}");

  const userRow = (await scn.loadCanon()).find((m) => m.role === "user");
  const stored = await readProvenance(scn.db, userRow?.selectedVariantId ?? ("x" as MessageVariantId));
  // Identity macros resolve per-VIEW (renderHistoryMacros), so the freeze pass re-emits them verbatim.
  expect(stored.content).toBe("hello {{char}}");
  expect(stored.rawContent).toBeNull();
  expect(stored.macroFreezes).toBeNull();
});

test("the rpg data macros are volatile for CACHE purposes but never freeze — no bake, no record", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  await scn.send("scene: {{rpgSceneState}}");

  const userRow = (await scn.loadCanon()).find((m) => m.role === "user");
  const stored = await readProvenance(scn.db, userRow?.selectedVariantId ?? ("x" as MessageVariantId));
  // The freeze registry deliberately does NOT register the rpg read-mirror macros (registry.ts), so the
  // token survives into canon and the record stays empty — the freeze axis is narrower than `volatile`.
  expect(stored.content).toBe("scene: {{rpgSceneState}}");
  expect(stored.macroFreezes).toBeNull();
});

// ── the GREETING hop ─────────────────────────────────────────────────────────────────────────────────

test("the greeting first-turn freeze records its pre-freeze text + the occurrence it baked", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "You rolled {{roll::1d1}} and I greet {{user}}",
  });

  await scn.send("hello");

  const stored = await readProvenance(scn.db, greeting.variantId);
  expect(stored.content).toBe("You rolled 1 and I greet {{user}}");
  // The seeded greeting body as authored — the thing the destructive bake used to discard.
  expect(stored.rawContent).toBe("You rolled {{roll::1d1}} and I greet {{user}}");
  expect(stored.macroFreezes).toEqual([{ name: "roll", args: "1d1", value: "1" }]);
});

test("a greeting with no volatiles is not rewritten and gains no provenance", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });
  const greeting = await seedMessage(scn.db, scn.chatId, 1, {
    role: "assistant",
    characterId: scn.chars[0] ?? null,
    content: "I greet {{user}}",
  });

  await scn.send("hello");

  const stored = await readProvenance(scn.db, greeting.variantId);
  expect(stored.content).toBe("I greet {{user}}");
  expect(stored.rawContent).toBeNull();
  expect(stored.macroFreezes).toBeNull();
});

// ── REPRODUCIBILITY — what the record is FOR ─────────────────────────────────────────────────────────

test("replaying the stored record over the stored raw reproduces the frozen content BYTE-EXACTLY", async () => {
  const scn = await scenario.chat(tape().reply("ok"), { characters: ["aria"] });

  // `{{random}}` is a genuine draw — its value cannot be recomputed from anything but the record, which is
  // precisely why a swipe could never reproduce a frozen row before this column existed.
  await scn.send("the die says {{random::1::1000000}}");

  const userRow = (await scn.loadCanon()).find((m) => m.role === "user");
  const stored = await readProvenance(scn.db, userRow?.selectedVariantId ?? ("x" as MessageVariantId));
  expect(stored.rawContent).toBe("the die says {{random::1::1000000}}");

  const replayed = processMacros(
    stored.rawContent ?? "",
    { char: "Aria", user: "User", persona: "", scenario: "", env: {}, frozenMacros: stored.macroFreezes ?? undefined },
    createVolatileOnlyRegistry(),
  );
  // A fresh draw would (all but certainly) differ; the replay is byte-identical because the record IS the draw.
  expect(replayed).toBe(stored.content);
});
