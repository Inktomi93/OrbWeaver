import fs from "node:fs";
import path from "node:path";

// Rig-relative, never cwd-relative (same anchor as generate-goldens.ts / capture-orbweaver.ts).
const RIG_DIR = path.resolve(import.meta.dirname);
const ST_OUTPUT_DIR = path.join(RIG_DIR, "output");
const ORB_OUTPUT_DIR = path.join(RIG_DIR, "orbweaver-output");

/** An ST wire message/tool as generate-goldens.ts captured it — the SHAPE is what we diff, so every
 *  field beyond the two we normalize stays opaque. */
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [k: string]: JsonValue };
type WireObject = { readonly [k: string]: JsonValue };

/** `generate-goldens.ts`'s output envelope (ST arm) — the captured body sits under `payload`. */
type StCapture = { readonly payload?: { readonly messages?: readonly WireObject[]; readonly tools?: readonly WireObject[] } };
/** `capture-orbweaver.ts`'s output — the raw outbound body, no envelope. */
type OrbCapture = { readonly messages?: readonly WireObject[]; readonly tools?: readonly WireObject[] };

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

/** Key-sorted STRUCTURE with prose blanked: parity is about message/tool SHAPE + ordering, never the
 *  sampled text (which differs by construction — ST's mock reply vs ours). */
function getStruct(obj: JsonValue): JsonValue {
  if (Array.isArray(obj)) {
    // `Array.isArray` narrows to `unknown[]` under this repo's reset.d.ts, not to the union's array arm.
    return (obj as readonly JsonValue[]).map(getStruct);
  }
  if (obj !== null && typeof obj === "object") {
    const src = obj as { readonly [k: string]: JsonValue };
    const res: Record<string, JsonValue> = {};
    for (const k of Object.keys(src).sort()) {
      res[k] = k === "content" ? "<TEXT>" : getStruct(src[k] as JsonValue);
    }
    return res;
  }
  return obj;
}

function runCompare() {
  const stFiles = fs.readdirSync(ST_OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  let mismatches = 0;

  for (const stFile of stFiles) {
    const stData = readJson<StCapture>(path.join(ST_OUTPUT_DIR, stFile));
    const fixtureId = stFile.replace(".json", "");

    // Orbweaver outputs have model names prefixed, e.g., claude-sonnet-5_fixture.json
    // Or we can just find any matching orbweaver file for this fixture
    const orbFiles = fs.readdirSync(ORB_OUTPUT_DIR).filter((f) => f.endsWith(`_${stFile}`));

    if (orbFiles.length === 0) {
      console.log(`[Missing] No Orbweaver output for ${stFile}`);
      continue;
    }

    // Just compare against the first one for structure
    const orbData = readJson<OrbCapture>(path.join(ORB_OUTPUT_DIR, orbFiles[0] as string));

    const stMessages = stData.payload?.messages || [];
    const orbMessages = orbData.messages || [];

    const stTools = stData.payload?.tools || [];
    const orbTools = orbData.tools || [];

    let hasDiff = false;

    if (stTools.length !== orbTools.length) {
      hasDiff = true;
      console.log(`[Diff] ${fixtureId} - Tool count mismatch: ST=${stTools.length}, Orb=${orbTools.length}`);
    } else if (stTools.length > 0) {
      // structural check
      // Normalize ST tools (Anthropic format -> OpenAI format)
      const normalizedStTools = stTools.map((t) => ({
        function: {
          description: t["description"],
          name: t["name"],
          parameters: t["input_schema"],
        },
        type: "function",
      }));

      const stToolsStr = JSON.stringify(normalizedStTools);
      const orbToolsStr = JSON.stringify(orbTools);
      if (stToolsStr !== orbToolsStr) {
        hasDiff = true;
        console.log(`[Diff] ${fixtureId} - Tool structure mismatch!`);
        console.log(`  ST: ${stToolsStr}`);
        console.log(`  Orb: ${orbToolsStr}`);
      }
    }

    // Normalize ST messages (Anthropic format -> OpenAI format, and map ST's fake user message to system)
    const normalizedStMessages: WireObject[] = [...stMessages];
    const stFirst = normalizedStMessages[0];
    if (stFirst?.["role"] === "user" && orbMessages[0]?.["role"] === "system") {
      normalizedStMessages[0] = { ...stFirst, role: "system" };
    }

    if (stMessages.length !== orbMessages.length) {
      hasDiff = true;
      console.log(`[Diff] ${fixtureId} - Message count mismatch: ST=${stMessages.length}, Orb=${orbMessages.length}`);
    } else {
      const stStruct = JSON.stringify(getStruct(normalizedStMessages));
      const orbStruct = JSON.stringify(getStruct(orbMessages));
      if (stStruct !== orbStruct) {
        hasDiff = true;
        console.log(`[Diff] ${fixtureId} - Message structure mismatch!`);
        console.log(`  ST: ${stStruct}`);
        console.log(`  Orb: ${orbStruct}`);
      }
    }

    if (!hasDiff) {
      console.log(`[Match] ${fixtureId}`);
    } else {
      mismatches++;
    }
  }

  console.log(`\nComparison complete. ${mismatches} mismatches found.`);
}

runCompare();
