import type { AutomationActionInput, AutomationActionType } from "@orb/contracts/automation";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "../ids.ts";

const ids = createSeededIds();
const bookId = typeIdSchema(ID_PREFIX.worldBook).parse(ids.next(ID_PREFIX.worldBook));
const characterId = typeIdSchema(ID_PREFIX.character).parse(ids.next(ID_PREFIX.character));
export const ruleActionExamples = {
  ["set_variable"]: { type: "set_variable", scope: "global", key: "score", op: "delete", value: "" },
  ["transform_draft"]: { type: "transform_draft", target: "assembled_dynamic", template: "{{draft}}\nA condition" },
  ["insert_world_info_entry"]: {
    type: "insert_world_info_entry",
    bookId,
    entryKey: "",
    keys: [" leading", "", "a\nb", "duplicate", "duplicate"],
    contentTemplate: "",
    position: "before",
    confirmFirst: false,
  },
  ["surface_quick_reply"]: {
    type: "surface_quick_reply",
    choices: [
      { label: "Wait", sendTemplate: "Wait", mode: "compose" },
      { label: "Go", sendTemplate: "Go", mode: "send" },
    ],
  },
  ["post_notification"]: { type: "post_notification", recipient: "all_members_except_actor", messageTemplate: "A notice" },
  ["trigger_turn"]: { type: "trigger_turn", speakerCharacterId: characterId, guidedTemplate: "", confirmFirst: true },
  ["generate_image"]: {
    type: "generate_image",
    mode: "face_multimodal",
    prompt: "",
    negative: "",
    n: 2,
    size: "portrait",
    subjectCharacterId: characterId,
    useAvatarReference: true,
    reuse: "never",
    quiet: true,
    confirmFirst: false,
  },
  ["set_chat_background"]: { type: "set_chat_background", instruction: "", confirmFirst: false },
  ["run_analysis"]: {
    type: "run_analysis",
    brief: "Notice changes",
    steer: "",
    routes: { steer: { apply: "direct" }, lore: { apply: "confirm", bookId }, vars: { key: "tension" } },
  },
  ["run_tool"]: { type: "run_tool", name: "plugin.unavailable", argsTemplate: '{"value":"{{getvar::score}}"}', resultVar: "result", resultScope: "global" },
} satisfies Record<AutomationActionType, AutomationActionInput>;
