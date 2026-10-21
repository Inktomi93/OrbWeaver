import type { UserMacroSpec } from "@orb/contracts/preset";

export const GAME_MOOD = {
  name: "mood",
  description: "the game's scene tone",
  args: [],
  body: "{{tone}}",
  strict: false,
  inputs: [
    {
      kind: "single-select",
      name: "tone",
      label: "Tone",
      options: [
        { label: "Doomed", value: "doomed" },
        { label: "Hopeful", value: "hopeful" },
      ],
      separator: ", ",
      onValue: "",
      offValue: "",
      defaultValue: "doomed",
    },
  ],
} satisfies UserMacroSpec;
