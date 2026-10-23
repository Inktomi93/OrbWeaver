// @subject packages/server/src/infra/plugin-host/module.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { pluginCardStateKey } from "@orb/contracts/plugin";
import { characters } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCharacter } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { createPluginProcessEdge, installGuest } from "./process-runtime.fixtures.ts";

const GROWTH_MEBIBYTES = 24;
const MEBIBYTE = 1_048_576;
const CARD = { nested: { list: [1, 2, 3], text: "after growth" }, flag: true };
const SLUG = "grown-guest";

test("native object and string calls survive real guest heap growth, disposal and a fresh Worker", { timeout: 30_000 }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const principal = await root.principalFor(root.ownerId);
  const character = await seedCharacter(root, {
    principal,
    input: createCharacterSchema.parse({ handle: "grown-card", name: "Grown card", description: "Native marshalling witness" }),
  });
  const guest = await installGuest(
    root,
    SLUG,
    `const h=orb.host(1);
    h.ui.registerCommand({name:"grow",describe:"Grow before host calls",onRun:async()=>{
      const held=[];
      for(let i=0;i<${GROWTH_MEBIBYTES};i++){const block=new Uint8Array(${MEBIBYTE});block.fill(i);held.push(block);}
      globalThis.held=held;
      await h.character.setCardData(${JSON.stringify(character.view.id)},${JSON.stringify(CARD)});
      const card=await h.character.getCardData(${JSON.stringify(character.view.id)});
      await h.storage.set("roundtrip",JSON.stringify(card));
      const read=await h.storage.get("roundtrip");
      const liveBytes=held.reduce((sum,block)=>sum+block.byteLength,0);
      const checksum=held.reduce((sum,block)=>sum+block[0]+block[block.length-1],0);
      await h.storage.set("result",JSON.stringify({card,read,liveBytes,checksum}));
    }});`,
    ["ui.surface", "storage.kv", "character.card_state"],
  );
  const expected = {
    card: CARD,
    read: JSON.stringify(CARD),
    liveBytes: GROWTH_MEBIBYTES * MEBIBYTE,
    checksum: GROWTH_MEBIBYTES * (GROWTH_MEBIBYTES - 1),
  };
  for (const _ of ["initial", "replacement"]) {
    expect((await guest.enable()).status).toBe("enabled");
    await expect(guest.invoke("grow")).resolves.toEqual({ toasts: [] });
    expect(await guest.read("result")).toBe(JSON.stringify(expected));
    const stored = await root.db
      .select({ extensions: characters.extensions })
      .from(characters)
      .where(and(eq(characters.id, character.view.id), eq(characters.ownerId, principal.userId)))
      .get();
    expect(stored?.extensions).toMatchObject({ [pluginCardStateKey(SLUG)]: CARD });
    await guest.disable();
  }
  expect(edge.children).toHaveLength(1);
});
