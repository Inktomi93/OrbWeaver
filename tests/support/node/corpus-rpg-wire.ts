// A finite physical RPG script; production alone parses these payloads and applies their consequences.
import type { RpgToolName } from "@orb/contracts/rpg";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import type { CorpusProviderCompletion } from "./corpus-provider.ts";

export const CORPUS_RPG_CARD_NAME = "Corpus provider traveller";
export const CORPUS_RPG_ITEM_NAME = "Loom shuttle";
export const CORPUS_RPG_FOLDED_INPUT = "Fit the loom shuttle after crossing the gantry.";
export const CORPUS_RPG_REBUILT_BEAT = "The traveller reached the orbital loom.";
export const CORPUS_RPG_SCENE_TOOL = "update_scene" satisfies RpgToolName;
export const CORPUS_RPG_INVENTORY_TOOL = "update_inventory" satisfies RpgToolName;
export const CORPUS_RPG_JOURNAL_TOOL = "add_journal_entry" satisfies RpgToolName;
const EXTRACTION_REQUEST_NAME = '"name":"rpg_state_extraction"';

interface PhysicalStep {
  readonly matches: (body: string) => boolean;
  readonly reply: CorpusProviderCompletion;
}

function populateRequest(body: string): boolean {
  return body.includes(EXTRACTION_REQUEST_NAME) && body.includes('"sheet":');
}
function extractionRequest(body: string): boolean {
  return body.includes(EXTRACTION_REQUEST_NAME) && !body.includes('"sheet":');
}
function forcedRequest(body: string): boolean {
  return body.includes('"tool_choice":"required"');
}

interface CorpusRpgWire {
  readonly completion: (requestBody: string) => CorpusProviderCompletion | undefined;
  readonly requests: readonly string[];
  readonly remaining: () => number;
}

/** Refuse a missing or reordered RPG request; unrelated corpus model traffic retains its own script. */
export function createCorpusRpgWire(): CorpusRpgWire {
  const steps: readonly PhysicalStep[] = [
    {
      matches: populateRequest,
      reply: {
        text: JSON.stringify({
          sheet: { title: "Artificer", level: 2 },
          inventory: [
            { targetRef: CORPUS_RPG_CARD_NAME, add: [{ name: CORPUS_RPG_ITEM_NAME, location: "belt" }], walletDeltas: [{ name: "credits", delta: 7 }] },
            { targetRef: CORPUS_RPG_CARD_NAME, add: [{ name: "Malformed spare", quantity: 0 }] },
          ],
          quests: [{ name: "Repair the orbital loom", action: "create", objectives: ["Find the thread"] }],
          scene: { location: "This card read must not write the scene" },
          journal: [{ type: "event", title: "Unplayed event", content: "A card is not a played beat." }],
        }),
        toolCalls: [],
      },
    },
    { matches: populateRequest, reply: { text: JSON.stringify({ sheet: { title: "Artificer", level: 2 } }), toolCalls: [] } },
    ...Array.from(
      { length: 2 },
      (): PhysicalStep => ({
        matches: extractionRequest,
        reply: {
          text: JSON.stringify({
            scene: { location: "Model rebuilt loom", weather: { type: "clear" }, recentEvent: CORPUS_RPG_REBUILT_BEAT },
            journal: [{ type: "event", title: "Rebuilt archive", content: "A resync must not append archive entries." }],
          }),
          toolCalls: [],
        },
      }),
    ),
    {
      matches: forcedRequest,
      reply: {
        text: "",
        toolCalls: [
          { name: CORPUS_RPG_SCENE_TOOL, argumentsJson: JSON.stringify({ location: "Tool rebuilt loom", recentEvent: CORPUS_RPG_REBUILT_BEAT }) },
          {
            name: CORPUS_RPG_INVENTORY_TOOL,
            argumentsJson: JSON.stringify({ targetRef: CORPUS_RPG_CARD_NAME, update: [{ name: CORPUS_RPG_ITEM_NAME, location: "necklace" }] }),
          },
        ],
      },
    },
    { matches: forcedRequest, reply: { text: "", toolCalls: [{ name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" }] } },
    {
      matches: (body): boolean => body.includes(CORPUS_RPG_FOLDED_INPUT) && body.includes('"tool_choice":"auto"'),
      reply: {
        text: "The traveller crosses the gantry and fits the loom shuttle.",
        toolCalls: [
          {
            name: CORPUS_RPG_SCENE_TOOL,
            argumentsJson: JSON.stringify({ location: "Outer loom", weather: { type: "clear" }, recentEvent: "The traveller crossed the gantry." }),
          },
          {
            name: CORPUS_RPG_SCENE_TOOL,
            argumentsJson: JSON.stringify({ location: "Inner loom", weather: "malformed sky", recentEvent: "The shuttle was fitted." }),
          },
          {
            name: CORPUS_RPG_INVENTORY_TOOL,
            argumentsJson: JSON.stringify({ targetRef: CORPUS_RPG_CARD_NAME, update: [{ name: CORPUS_RPG_ITEM_NAME, location: "wrist", quantity: 2 }] }),
          },
          {
            name: CORPUS_RPG_JOURNAL_TOOL,
            argumentsJson: JSON.stringify({ type: "custom", label: "Expedition", title: "Loom repaired", content: "The traveller fitted the shuttle." }),
          },
          {
            name: CORPUS_RPG_JOURNAL_TOOL,
            argumentsJson: JSON.stringify({
              type: "event",
              label: "Ignored builtin gloss",
              title: "Thread counted",
              content: "The traveller counted the thread.",
            }),
          },
        ],
      },
    },
  ];
  const requests: string[] = [];
  let cursor = 0;
  return {
    requests,
    remaining: (): number => steps.length - cursor,
    completion: (body): CorpusProviderCompletion | undefined => {
      const rpgRequest = body.includes('"name":"rpg_state_') || body.includes(`"name":${JSON.stringify(CORPUS_RPG_SCENE_TOOL)}`);
      if (!(rpgRequest && body.includes(CORPUS_RPG_CARD_NAME))) {
        return undefined;
      }
      const step = steps[cursor];
      if (step === undefined || !step.matches(body)) {
        throw new Error(`unscripted RPG corpus request at physical step ${cursor}`);
      }
      cursor += 1;
      requests.push(body);
      return step.reply;
    },
  };
}
