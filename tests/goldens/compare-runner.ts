import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ST_OUTPUT_DIR = path.join(process.cwd(), "tests/goldens/output");
const ORB_OUTPUT_DIR = path.join(process.cwd(), "tests/goldens/orbweaver-output");

function getStruct(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(getStruct);
  }
  if (obj !== null && typeof obj === "object") {
    const res: any = {};
    for (const k of Object.keys(obj).sort()) {
      if (k === "content") {
        res[k] = "<TEXT>";
      } else {
        res[k] = getStruct(obj[k]);
      }
    }
    return res;
  }
  return obj;
}

function runCompare() {
  const stFiles = fs.readdirSync(ST_OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  let mismatches = 0;

  for (const stFile of stFiles) {
    const stPath = path.join(ST_OUTPUT_DIR, stFile);
    const stData = JSON.parse(fs.readFileSync(stPath, "utf-8"));
    const fixtureId = stFile.replace(".json", "");

    // Orbweaver outputs have model names prefixed, e.g., claude-sonnet-5_fixture.json
    // Or we can just find any matching orbweaver file for this fixture
    const orbFiles = fs.readdirSync(ORB_OUTPUT_DIR).filter((f) => f.endsWith(`_${stFile}`));

    if (orbFiles.length === 0) {
      console.log(`[Missing] No Orbweaver output for ${stFile}`);
      continue;
    }

    // Just compare against the first one for structure
    const orbPath = path.join(ORB_OUTPUT_DIR, orbFiles[0]);
    const orbData = JSON.parse(fs.readFileSync(orbPath, "utf-8"));

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
      const normalizedStTools = stTools.map((t: any) => ({
        function: {
          description: t.description,
          name: t.name,
          parameters: t.input_schema,
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
    const normalizedStMessages = [...stMessages];
    if (normalizedStMessages.length > 0 && normalizedStMessages[0].role === "user" && orbMessages.length > 0 && orbMessages[0].role === "system") {
      normalizedStMessages[0] = { ...normalizedStMessages[0], role: "system" };
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
