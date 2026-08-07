import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CHARACTER_CARDS } from "../../packages/server/src/domain/character/seeder/cards.ts";

const stCharsDir = path.resolve(import.meta.dirname, "sillytavern-runtime/data/default-user/characters");
const stChatsDir = path.resolve(import.meta.dirname, "sillytavern-runtime/data/default-user/chats");
const demoChatsDir = path.resolve(import.meta.dirname, "../../packages/server/src/entry/boot/seed-assets/demo-chats");
const avatarsDir = path.resolve(import.meta.dirname, "../../packages/server/src/entry/boot/seed-assets/avatars");

fs.mkdirSync(stCharsDir, { recursive: true });
fs.mkdirSync(stChatsDir, { recursive: true });

// Load the CJS module once before the loop
// @ts-expect-error: CJS module without types
const { writeV2Png } = await import("./write-v2-png.cjs");

for (const card of DEFAULT_CHARACTER_CARDS) {
  const c = card.input;
  const name = c.name;

  // Create ST V2 Character PNG
  const stCard = {
    name,
    description: c.description || "",
    personality: c.personality || "",
    scenario: c.scenario || "",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    first_mes: c.greetings?.[0]?.text || "",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    mes_example: c.exampleMessages || "",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    creator_notes: c.creatorNotes || "",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    system_prompt: c.postHistoryInstructions || "",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    post_history_instructions: c.postHistoryInstructions || "",
    creator: "Orbweaver",
  };

  const avatarMap: Record<string, string> = {
    "Sabine Veyra": "sabine.png",
    "Birdie Mae Holloway": "birdie.png",
    "Elias Thorn": "elias.png",
    "Hana Mizushima": "hana.png",
    // biome-ignore lint/style/useNamingConvention: Exact character name required as key
    Niko: "niko.png",
    // biome-ignore lint/style/useNamingConvention: Exact character name required as key
    Charlotte: "assistant.png",
    // biome-ignore lint/style/useNamingConvention: Exact character name required as key
    JFC: "jfc-coder.png",
    // biome-ignore lint/style/useNamingConvention: Exact character name required as key
    Kohaku: "kohaku.png",
    "Morgatha, the Undying Dark": "morgatha.png",
    "Calamity, Doomblade of the Ninth Epoch": "calamity.png",
  };

  const avatarSrc = path.join(avatarsDir, avatarMap[name] || `${name}.png`);
  if (fs.existsSync(avatarSrc)) {
    writeV2Png(avatarSrc, path.join(stCharsDir, `${name}.png`), stCard);
    console.log(`Created V2 PNG for ${name}`);
  } else {
    // Fallback to JSON if no avatar exists
    fs.writeFileSync(path.join(stCharsDir, `${name}.json`), JSON.stringify(stCard, null, 2));
    console.log(`Created JSON fallback for ${name} (no avatar found)`);
  }
}

// Copy demo chats
const demoChats = fs.readdirSync(demoChatsDir).filter((f) => f.endsWith(".jsonl"));
for (const file of demoChats) {
  const content = fs.readFileSync(path.join(demoChatsDir, file), "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const firstLine = lines[0];

  if (!firstLine) {
    continue;
  }
  // biome-ignore lint/style/useNamingConvention: Exact character name required as key
  const header = JSON.parse(firstLine) as { character_name: string };
  const charName = header.character_name;

  const charChatsDir = path.join(stChatsDir, charName);
  fs.mkdirSync(charChatsDir, { recursive: true });

  fs.writeFileSync(path.join(charChatsDir, file), content);
  console.log(`Imported ${file} for ${charName}`);
}
console.log("Done building fixtures!");
