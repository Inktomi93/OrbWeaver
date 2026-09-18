// entry/boot — THE VIRGIN-BOOT PROOF for the shipped EXAMPLE pack, over the REAL composition root and the
// REAL shipped fixture bytes (`@orb/default-content`'s `demo-chats/*.jsonl`), on a fresh db.
//
// The owner's requirement this exists for, verbatim: "the transcripts and game and etc should all be seeded so
// we don't have to redo this every time." The pack is generated ONCE against live models and then ships as
// fixtures; every install after that must reproduce the whole experience — six conversations, the host seat
// playing as the user's own persona, the curated room backgrounds, and the flagship's fully-populated rpg
// board — from BYTES ALONE. So this test runs the seeder with the composed graph's vLLM disabled and no
// credential anywhere: a single model call would fail the whole run, which is exactly the point.
//
// It also pins the two per-install re-binds that a shipped fixture can get catastrophically wrong: the
// transcripts must name the receiving user (the "You" defect that forced the v3 re-generation — a persona-less
// generating stack froze its own display fallback into the prose AND the ST name fields), and the flagship's
// player actor must be the RECEIVING user's seat, never the generating account's.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messages as messagesTable } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DEMO_CHAT_NARRATOR_NAME, DEMO_CHAT_PACK_VERSION, DEMO_CHATS } from "@orb/server/domain/chat";
import { seedDefaultCharacters, seedDefaultPersona } from "@orb/server/entry/boot";
import { describe } from "vitest";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

const USER_ID = castId<UserId>("user_virgin_boot");
const HANDLE = castId<Handle>("newcomer");
const PRINCIPAL: Principal = { userId: USER_ID, role: "owner", handle: HANDLE, externalId: null, via: "header" };

/** A brand-new install's first authed request, in the order boot does it: cards → persona → examples. */
async function virginBoot(db: Db, app: { characterSeeder: unknown; personaSeeder: unknown; demoChatSeeder: unknown }): Promise<void> {
  await seedUser(db, { id: USER_ID, handle: HANDLE, role: "owner" });
  const typed = app as {
    characterSeeder: Parameters<typeof seedDefaultCharacters>[0]["seeder"];
    personaSeeder: Parameters<typeof seedDefaultPersona>[0]["seeder"];
    demoChatSeeder: { ensureSeeded: (p: Principal) => Promise<void> };
  };
  await seedDefaultCharacters({ seeder: typed.characterSeeder, owner: PRINCIPAL });
  await seedDefaultPersona({ seeder: typed.personaSeeder, owner: PRINCIPAL });
  await typed.demoChatSeeder.ensureSeeded(PRINCIPAL);
}

describe("the EXAMPLE pack reseeds whole, from bytes, with no model", () => {
  test("a virgin boot lands all six examples with the shipped titles + the pack stamp", async ({ db, app, services }) => {
    await virginBoot(db, app);

    // Read through the door a NEW USER reads through — chats carry no ownerId by law (D18; membership is the
    // scope), so "what this user got" is exactly `listChats`, not a table scan.
    const rows = (await services.chat.listChats({ principal: PRINCIPAL })).items;
    expect(rows).toHaveLength(DEMO_CHATS.length);
    expect(rows.map((r) => r.title).sort((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(
      DEMO_CHATS.map((d) => d.title).toSorted((a, b) => a.localeCompare(b)),
    );
    expect(rows.every((r) => r.title?.startsWith("Example — ") === true)).toBe(true);

    const onboarding = (await services.settings.getUserSettings({ principal: PRINCIPAL })).config.onboarding;
    expect(onboarding.demoChatsSeeded).toBe(true);
    expect(onboarding.demoChatsPackVersion).toBe(DEMO_CHAT_PACK_VERSION);
  });

  test("every example opens PLAYING AS the receiving user's OWN persona — whatever they named it", async ({ db, app, services }) => {
    await seedUser(db, { id: USER_ID, handle: HANDLE, role: "owner" });
    // A real first sign-in NAMES its own `{{user}}` (the auto-seed arm is automation-only, by owner ruling), so
    // the receiving user here is deliberately NOT called Traveler: if the seat re-bind were fake — a shipped
    // constant, or the transcript's own frozen identity — this would read "Traveler" or "newcomer" instead.
    const persona = await services.persona.create({
      principal: PRINCIPAL,
      input: { name: "Wren", description: "A cartographer with bad knees.", starred: true },
    });
    await services.settings.updateUserSettingsSection({
      principal: PRINCIPAL,
      input: { section: "seeds", patch: { defaultPersonaId: persona.id, currentPersonaId: persona.id } },
    });

    await seedDefaultCharacters({ seeder: app.characterSeeder, owner: PRINCIPAL });
    await app.demoChatSeeder.ensureSeeded(PRINCIPAL);

    const rooms = (await services.chat.listChats({ principal: PRINCIPAL })).items;
    const seats = await Promise.all(
      rooms.map(async (row) => {
        const detail = await services.chat.getChat({ principal: PRINCIPAL, chatId: row.id });
        return { title: row.title, anchor: detail.anchorPersonaId, seat: detail.participants.find((p) => p.kind === "human")?.displayName };
      }),
    );
    expect(seats.map((s) => s.anchor)).toEqual(seats.map(() => persona.id));
    expect(
      seats.map((s) => `${s.title ?? ""}: ${s.seat ?? "NO SEAT"}`),
      "the host seat must read as the receiving user's persona, never a frozen name or the bare account handle",
    ).toEqual(seats.map((s) => `${s.title ?? ""}: Wren`));
  });

  test("the SHIPPED transcript bytes carry the persona'd identity — no fixture may say 'You' again", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../../../../packages/default-content/demo-chats/", import.meta.url));

    const identities = await Promise.all(
      DEMO_CHATS.map(async (demo) => {
        const rows = (await readFile(`${dir}${demo.slug}.jsonl`, "utf8"))
          .split("\n")
          .filter((l) => l.trim() !== "")
          .map((l) => JSON.parse(l) as Record<string, unknown>);
        const [header, ...messages] = rows;
        // ST's wire vocabulary is snake_case, so these read through the index signature by construction.
        return {
          slug: demo.slug,
          header: header?.["user_name"],
          rows: [...new Set(messages.filter((m) => m["is_user"] === true).map((m) => m["name"]))],
        };
      }),
    );
    // The generating stack's persona is frozen into these bytes forever (that is the whole reason v3 exists):
    // a regeneration on a persona-less stack would put "You" back here, in the header AND on every user row.
    expect(identities.map((i) => `${i.slug}:${String(i.header)}`)).toEqual(DEMO_CHATS.map((d) => `${d.slug}:Traveler`));
    expect(identities.map((i) => `${i.slug}:${i.rows.join("|")}`)).toEqual(DEMO_CHATS.map((d) => `${d.slug}:Traveler`));
  });

  // ── The shipped NARRATOR transcript actually attributes its speakers (§12.4) ──────────────────────
  // Second Opinion is the pack's `output:"narrator"` example, and it was generated BEFORE the narrator
  // turn ever asked for `<speaker>` markers — so its bytes carry the plain `JFC:` / `Charlotte:` labels a
  // model emits unprompted, and zero markers. That is precisely why the display grammar tolerates the plain
  // form: without it these shipped rows render as one flat uncolored block forever (no prompt change can
  // reach bytes that already exist). This runs the REAL renderer parse over the REAL fixture.
  test("the shipped NARRATOR example resolves per-speaker spans from its own bytes", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { parseSpeakerSpans } = await import("@orb/kit/speaker-label");
    const dir = fileURLToPath(new URL("../../../../packages/default-content/demo-chats/", import.meta.url));

    const rows = (await readFile(`${dir}second-opinion.jsonl`, "utf8"))
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    // The room's cast = every non-user, non-narrator author in the transcript (the same names the client's
    // roster-derived cast-name set carries).
    const cast = [...new Set(rows.filter((m) => m["is_user"] === false && m["name"] !== DEMO_CHAT_NARRATOR_NAME).map((m) => String(m["name"] ?? "")))].filter(
      (n) => n.length > 0,
    );
    expect(cast).toEqual(["Charlotte", "JFC"]);

    const narratorBodies = rows.filter((m) => m["name"] === DEMO_CHAT_NARRATOR_NAME).map((m) => String(m["mes"] ?? ""));
    expect(narratorBodies.length).toBeGreaterThan(0);
    // No markers anywhere — the produce half did not exist when these were generated.
    expect(narratorBodies.some((b) => b.includes("<speaker"))).toBe(false);

    const attributed = narratorBodies.flatMap((body) =>
      parseSpeakerSpans(body, cast)
        .filter((span) => span.speaker !== null)
        .map((span) => span.speaker),
    );
    // Both experts are attributed somewhere in the shipped narration — so both get their own tint.
    expect([...new Set(attributed)].sort()).toEqual(["Charlotte", "JFC"]);
    // And the SAME bytes with no cast names stay one flat span (the grammar is roster-anchored, not greedy).
    expect(narratorBodies.every((body) => parseSpeakerSpans(body).length === 1)).toBe(true);
  });

  // D129: the pack DECLARES which rows are narrator (`extra.type`, ST's own marker) instead of the seeder
  // recognising the synthetic card's display NAME. This drives the whole serde→import→canon chain: parse →
  // `BulkImportMessageInput.kind` → the `messages.kind` stamp + the synthetic-identity attribution routing.
  test("the shipped pack DECLARES its narrator rows, and they land as narrator CANON", async ({ db, app }) => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../../../../packages/default-content/demo-chats/", import.meta.url));
    const rows = (await readFile(`${dir}second-opinion.jsonl`, "utf8"))
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    // The declaration and the exported NAME agree on the shipped bytes — which is what makes the switch to
    // reading the declaration a no-op for this pack, and what a regenerated pack must keep true.
    const declared = rows.filter((m) => (m["extra"] as Record<string, unknown> | undefined)?.["type"] === "narrator");
    const namedGroup = rows.filter((m) => m["name"] === DEMO_CHAT_NARRATOR_NAME);
    expect(declared.length).toBe(namedGroup.length);
    expect(declared.length).toBeGreaterThan(0);

    await virginBoot(db, app);
    const canon = await db.select({ kind: messagesTable.kind, characterId: messagesTable.characterId, role: messagesTable.role }).from(messagesTable);
    const narratorRows = canon.filter((m) => m.kind === "narrator");
    // Every declared row became a narrator-KIND canon row (the pack seeds one room per slug, and only the
    // narrator example carries them), authored by a real synthetic identity, at assistant role (the CHECK).
    expect(narratorRows.length).toBeGreaterThanOrEqual(declared.length);
    expect(narratorRows.every((m) => m.role === "assistant" && m.characterId !== null)).toBe(true);
  });

  // D129 mirror for the FLAGSHIP: the rpg example ships 26 declared-narrator rows too, but where Second
  // Opinion's narrator rows are SPOKEN narration that must land as narrator canon, Ashen Spire's are the
  // rpg STATE-ANCHOR exports — `extra.type:"narrator"` rows with a blank `mes` (a content-less slot is a
  // snapshot FK, not a lost completion — the state-anchor law). Their contract is the OPPOSITE of Second
  // Opinion's: the real serde must STRIP every one at parse (a row with no rendered text and no media is
  // unrepresentable at the write boundary), so the flagship's game/narrator state rides the manifest replay
  // (`demo.game`) and NONE of these 26 anchors reaches canon. The blank-row int test below EXEMPTS the
  // flagship's trailing blanks (the replay legitimately mints its own), and the D129 test above reads only
  // Second Opinion — so nothing else pins that these 26 declared-narrator rows are stripped rather than seeded.
  // This runs the REAL parse over the REAL shipped bytes, the same way the two byte-reading tests above do.
  test("the flagship's 26 declared-narrator STATE-ANCHOR rows are all blank and all stripped by the real parse", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { parseChatJsonl } = await import("@orb/server/kit/serde/chat");
    const dir = fileURLToPath(new URL("../../../../packages/default-content/demo-chats/", import.meta.url));
    const text = await readFile(`${dir}ashen-spire.jsonl`, "utf8");
    const rows = text
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const [, ...messages] = rows;

    // The shipped bytes: exactly 26 rows DECLARE narrator (ST's `extra.type` marker), and every one is a
    // content-less state-anchor slot. Both halves matter — a declared-narrator row that carried real text
    // would be spoken narration (the Second Opinion case) and SHOULD survive.
    const declaredNarrator = messages.filter((m) => (m["extra"] as Record<string, unknown> | undefined)?.["type"] === "narrator");
    expect(declaredNarrator.length).toBe(26);
    expect(declaredNarrator.every((m) => String(m["mes"] ?? "") === "")).toBe(true);

    // The real serde strips every one: no narrator-kind message survives, and the surviving count is exactly
    // the non-anchor rows. A regression in the blank-row strip would surface all 26 here as narrator rows —
    // the exact leak the flagship-exempt blank-row test cannot catch.
    const parsed = parseChatJsonl(text, { fileName: "ashen-spire.jsonl", charDirName: "ashen-spire" });
    if (parsed === null) {
      throw new Error("the shipped flagship transcript did not parse");
    }
    expect(parsed.messages.filter((m) => m.kind === "narrator")).toHaveLength(0);
    expect(parsed.messages).toHaveLength(messages.length - declaredNarrator.length);
  });

  test("no BLANK row lands inside a seeded conversation (the transcript's exported state-anchor slots)", async ({ db, app, services }) => {
    await virginBoot(db, app);

    const rooms = (await services.chat.listChats({ principal: PRINCIPAL })).items;
    const shapes = await Promise.all(
      rooms.map(async (row) => {
        const page = await services.chat.listMessages({ principal: PRINCIPAL, chatId: row.id, limit: 200 });
        const lastSpoken = page.messages.findLastIndex((m) => m.content.trim() !== "");
        return {
          title: row.title ?? "",
          hasGame: DEMO_CHATS.some((d) => d.title === row.title && d.game !== undefined),
          total: page.messages.length,
          // Blanks BEFORE the last spoken row. The five game-less examples must have none at all; the
          // flagship's game REPLAY legitimately mints anchor rows of its own AFTER the conversation (each
          // carries the snapshot its hand write produced, and renders as that write's delta line). What must
          // never happen is a content-less row landing BETWEEN the spoken ones — which is exactly what seeding
          // the transcript's own exported anchor slots would do.
          interleaved: page.messages.filter((m, i) => m.content.trim() === "" && i < lastSpoken).length,
          trailing: page.messages.filter((m, i) => m.content.trim() === "" && i > lastSpoken).length,
        };
      }),
    );
    expect(
      shapes.every((s) => s.total > 0),
      "every example seeded messages",
    ).toBe(true);
    expect(shapes.map((s) => `${s.title}:${s.interleaved}`)).toEqual(shapes.map((s) => `${s.title}:0`));
    expect(
      shapes.filter((s) => !s.hasGame).map((s) => `${s.title}:${s.trailing}`),
      "a game-less example has nothing to anchor, so it must carry no content-less row at all",
    ).toEqual(shapes.filter((s) => !s.hasGame).map((s) => `${s.title}:0`));
  });

  test("THE FLAGSHIP'S PANELS ARE POPULATED — sheets, meters, inventory, quests, journal, scene — with zero model calls", async ({ db, app, services }) => {
    await virginBoot(db, app);

    const chatId = (await services.chat.listChats({ principal: PRINCIPAL })).items.find((c) => c.title === "Example — The Ashen Spire")?.id;
    if (chatId === undefined) {
      throw new Error("the rpg flagship example did not seed");
    }
    const view = await services.rpg.getTrackerView({ principal: PRINCIPAL, chatId });

    // The scene, the act rail and the game-wide gauges.
    expect(view.ambient?.location).toContain("throne hall");
    expect(view.plot?.act).toBe(3);
    expect(view.plot?.acts).toHaveLength(3);
    expect(view.gameTrackers.map((t) => t.def.key).sort((a, b) => a.localeCompare(b))).toEqual(["supplies", "wardsong"]);
    expect(view.recentBeats.length).toBeGreaterThanOrEqual(3);

    // EVERY seat is set up — the party, the Dark Lady, the sword, and the NPC the session minted.
    expect(view.actors).toHaveLength(5);
    // Every seat carries a volatile row + a status line — an actor with `volatile: null` renders as an empty
    // panel row, which is the "showcase of a system with nothing in it" this pack version exists to end.
    expect(view.actors.map((a) => `${a.name}:${a.volatile === null ? "EMPTY" : "filled"}`)).toEqual(view.actors.map((a) => `${a.name}:filled`));
    expect(view.actors.map((a) => `${a.name}:${(a.volatile?.status ?? "") === "" ? "NO STATUS" : "status"}`)).toEqual(
      view.actors.map((a) => `${a.name}:status`),
    );
    // A ROSTER seat carries a filled sheet; a scene-minted cast NPC carries an identity instead (its class is
    // the story's business, not a sheet's) — both halves of the actor plane, each populated in its own way.
    const roster = view.actors.filter((a) => a.identity === null);
    const cast = view.actors.filter((a) => a.identity !== null);
    expect(roster.map((a) => `${a.sheet.className}:${Object.keys(a.sheet.attributes).length}`).sort((a, b) => a.localeCompare(b))).toEqual([
      "Doomblade of the Ninth Epoch:6",
      "Envoy:6",
      "Sellsword-Captain:6",
      "The Undying Dark:6",
    ]);
    expect(cast.map((a) => a.identity?.name)).toEqual(["Corvain"]);
    // The tracked-field applicability model, shown rather than described: a talking SWORD has no health.
    const sword = view.actors.find((a) => a.name.startsWith("Calamity"));
    expect(sword?.sheet.trackerRevokes).toEqual(["hp", "stamina"]);
    // The player's own meters carry the session's damage, not a born-full default.
    const player = view.actors.find((a) => a.actorRef.kind === "user");
    expect(player?.actorRef, "the player seat re-binds to the RECEIVING user, never the generating account").toEqual({ kind: "user", userId: USER_ID });
    expect(player?.volatile?.trackerValues["hp"]?.value).toBeLessThan(20);
    expect(player?.volatile?.inventory.length ?? 0).toBeGreaterThan(0);
    expect(player?.volatile?.conditions.length ?? 0).toBeGreaterThan(0);

    // Quests + journal — a mix of progressed and completed, which is what makes the panel read as PLAYED.
    expect(view.quests.length).toBeGreaterThanOrEqual(3);
    expect(view.quests.some((q) => q.status === "completed")).toBe(true);
    expect(view.quests.some((q) => q.objectives.some((o) => o.completed) && q.objectives.some((o) => !o.completed))).toBe(true);
    const journal = await services.rpg.listJournal({ principal: PRINCIPAL, chatId, limit: 50 });
    expect(journal.length).toBeGreaterThanOrEqual(3);
  });

  test("the seeded board is PLAYABLE: the replay leaves no lock for the story to fight", async ({ db, app, services }) => {
    await virginBoot(db, app);

    const chatId = (await services.chat.listChats({ principal: PRINCIPAL })).items.find((c) => c.title === "Example — The Ashen Spire")?.id;
    if (chatId === undefined) {
      throw new Error("the rpg flagship example did not seed");
    }
    const view = await services.rpg.getTrackerView({ principal: PRINCIPAL, chatId });
    expect(view.lockedPaths, "a lock on an authored datum means the user's own continuation can never move it").toEqual([]);
  });
});
