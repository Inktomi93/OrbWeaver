import { CONTENT_CLASS_POLICY, contentSpansToBlocks } from "@orb/contracts/chat";
import { tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../scenario-physical.ts";

const VISIBLE = "The witness speaks.";
const HIDDEN = '<lie character="Witness" truth="the key is missing"/>';
const UNKNOWN = '<teleport destination="tower"/>';
const DICE = "[dice: Perception 1d20+2 → 17]";
const CHOICES = ":::choices\n1. Ask about the key\n2. Leave\n:::";
const BODY = `${VISIBLE}${HIDDEN}${UNKNOWN}${DICE}\n![portrait](https://example.test/portrait.png)\n${CHOICES}`;

test("a real turn keeps hidden and directive bytes model-readable while the reading projection conceals them", async () => {
  await using h = await textRoom(["The witness answers."]);
  const params = { principal: h.owner, chatId: h.chatId };
  const committed = await h.root.services.chat.commitMessage({ ...params, content: BODY });
  expect(committed.aborted).toBe(false);
  const stored = committed.messages[0];
  if (stored === undefined) {
    throw new Error("the public content commit returned no stored row");
  }
  expect(stored.content).toBe(BODY);
  const blocks = contentSpansToBlocks(tokenizeContent(stored.content));
  expect(blocks).toContainEqual({ kind: "markdown", md: `${VISIBLE}${DICE}\n` });
  expect(blocks).toContainEqual({ kind: "choices", options: ["Ask about the key", "Leave"] });
  expect(JSON.stringify(blocks)).not.toContain("the key is missing");
  expect(JSON.stringify(blocks)).not.toContain("teleport");

  expect((await h.root.services.chat.generate(params)).aborted).toBe(false);
  await h.root.settleBackground();
  const requests = h.requests.filter((candidate) => new URL(candidate.url).pathname.endsWith("/chat/completions"));
  expect(requests).toHaveLength(1);
  const request = requests[0];
  if (request === undefined) {
    throw new Error("the real turn did not reach its physical provider");
  }
  const wire = await request.clone().text();
  expect(wire.includes(VISIBLE)).toBe(CONTENT_CLASS_POLICY.text.wire === "full");
  expect(wire.includes(JSON.stringify(HIDDEN).slice(1, -1))).toBe(CONTENT_CLASS_POLICY.hidden.wire === "full");
  expect(wire.includes(JSON.stringify(UNKNOWN).slice(1, -1))).toBe(CONTENT_CLASS_POLICY["unknown-directive"].wire === "full");
  expect(wire.includes(DICE)).toBe(CONTENT_CLASS_POLICY.dice.wire === "full");
  expect(wire).toContain("[image: portrait]");
  expect(wire).not.toContain("https://example.test/portrait.png");
  expect(wire.includes("Ask about the key")).toBe(CONTENT_CLASS_POLICY.choices.wire !== "drop");
  expect(wire).not.toContain(":::choices");
});
