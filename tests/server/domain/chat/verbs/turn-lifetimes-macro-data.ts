import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso/preset-config.ts";

export const MOOD_CONFIG = makePromptConfig({
  userMacros: [
    {
      name: "mood",
      description: "The scene tone",
      args: [],
      body: "{{tone}}",
      strict: false,
      inputs: [
        {
          kind: "random-pick",
          name: "tone",
          label: "Tone",
          options: [
            { label: "Grim", value: "grim" },
            { label: "Warm", value: "warm" },
            { label: "Tense", value: "tense" },
            { label: "Wry", value: "wry" },
          ],
          separator: ", ",
          onValue: "",
          offValue: "",
          defaultValue: "",
        },
      ],
    },
  ],
  sections: [
    { type: "literal", id: "mood-line", name: "Mood", role: "system", content: "Scene tone: {{mood}}.", enabled: true },
    ...DEFAULT_PROMPT_CONFIG.sections,
  ],
});
