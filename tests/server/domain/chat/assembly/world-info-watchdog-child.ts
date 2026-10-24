import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { createCharacterSchema } from "@orb/contracts/character";
import { createEntrySchema } from "@orb/contracts/world-info";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { logRing } from "@orb/server/foundation/observability";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

const mode = z.enum(["normal", "full", "latest"]).parse(process.argv[2]);
const catastrophic = "(a+)+$";
const latestOnly = `dragon|${catastrophic}`;
const warningSchema = z.object({ key: z.string(), reason: z.string() });
await test("actual composed world-info matcher", async () => {
  {
    await using root = await createServerHarness({
      logLevel: "warn",
      temporaryParentDir: z.string().parse(process.argv[3]),
      providerFetch: (input, init): Promise<Response> => {
        const url = input instanceof Request ? new URL(input.url) : new URL(input);
        assert.equal(url.pathname, "/v1/models");
        assert.equal(init?.method ?? "GET", "GET");
        return Promise.resolve(Response.json({ data: [{ id: "watchdog-model" }] }));
      },
    });
    const caller = await root.internalCallerFor(root.ownerId);
    const connection = await caller.connection.create({
      providerId: "custom-openai",
      model: "watchdog-model",
      credentialId: null,
      baseUrl: "http://127.0.0.1:9999/v1",
      declared: { kind: "generation", generation: { context: { window: 32_000 } }, features: { detectServer: false } },
    });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    const card = await caller.character.create({
      input: createCharacterSchema.parse({
        handle: "watchdog-witness",
        name: "Watchdog witness",
        description: "A witness to bounded world-info matching.",
        greetings: [{ text: "A dragon guards the library." }],
      }),
    });
    const started = await caller.chat.startChat({ characterIds: [card.id], opening: "first-message" });
    assert.equal(started.opening?.messages.length, 1);
    await caller.chat.commitMessage({ chatId: started.chat.id, content: `${"a".repeat(40)}! [ comet a+b`, timeZone: UTC_TIME_ZONE });
    const book = await caller.worldInfo.createBook({ input: { name: "Watchdog controls" } });
    const entry = async (title: string, keys: string[], keyMode: "literal" | "regex", inject = false): ReturnType<typeof caller.worldInfo.createEntry> =>
      await caller.worldInfo.createEntry({
        bookId: book.id,
        input: createEntrySchema.parse({
          title,
          content: `${title} payload`,
          keys,
          metadata: { keyMode, scopeMode: "keyword", ...(inject ? { inject: { depth: 0, role: "system" } } : {}) },
        }),
      });
    const benign = await entry("Benign regex", ["com.t"], "regex");
    const literal = await entry("Literal metacharacters", ["a+b"], "literal");
    const absent = await entry("Absent regex", ["kraken"], "regex");
    const invalid = await entry("Invalid literal fallback", ["["], "regex");
    const unsafe = mode === "normal" ? undefined : await entry("Pathological key", [mode === "full" ? catastrophic : latestOnly], "regex", mode === "latest");
    await caller.worldInfo.attachToChat({ chatId: started.chat.id, bookId: book.id });

    // The supervisor requires this native IPC stage before an externally killed intervention counts.
    process.send?.({ stage: "executing", mode });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const preview = await caller.chat.previewAssembly({ chatId: started.chat.id, timeZone: UTC_TIME_ZONE });
      const activated = new Set(preview.trace.worldInfoActivated.map((item) => item.id));
      const delivered = [preview.prompt.static, preview.prompt.dynamic, ...preview.prompt.afterHistory.map((injection) => injection.content)].join("\n");
      for (const expected of [benign, literal, invalid]) {
        assert.ok(activated.has(expected.id), `missing admitted world-info entry: ${expected.title}`);
        assert.ok(delivered.includes(`${expected.title} payload`));
      }
      assert.ok(!activated.has(absent.id));
      assert.ok(preview.trace.matchedKeys.some((hit) => hit.key === "com.t" && hit.matchedLatestUserMessage));
      assert.equal(unsafe !== undefined && activated.has(unsafe.id), mode === "latest");
      assert.deepEqual(
        preview.trace.matchedKeys.filter((hit) => hit.key === latestOnly),
        mode === "latest" ? [{ key: latestOnly, matchedLatestUserMessage: false }] : [],
      );
      assert.ok(!preview.trace.matchedKeys.some((hit) => hit.key === catastrophic));
      assert.ok(!delivered.includes("Pathological key payload"));
      assert.equal(
        preview.budget.sources.some(
          (source) =>
            source.source === "world-info" && source.parts.some((part) => part.label === "at depth" && part.text.includes("Pathological key payload")),
        ),
        mode === "latest",
      );
    }
    const warnings = logRing.recent().flatMap((line) => {
      const parsed = warningSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    });
    assert.ok(warnings.filter((warning) => warning.key === "[" && warning.reason.length > 0).length >= 2, JSON.stringify(warnings));
    const key = mode === "full" ? catastrophic : latestOnly;
    assert.equal(warnings.filter((warning) => warning.key === key && /timed out/iu.test(warning.reason)).length >= 2, mode !== "normal");
  }
  process.send?.({ stage: "complete", mode, maxRssKiB: process.resourceUsage().maxRSS });
});
