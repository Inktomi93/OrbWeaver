// Nine scripted group scenes for the live Smart-picker matrix. Each is one round: the trailing canon window, who is
// seated, which humans play, and a hand judgment (`accept`) of the cast keys that may plausibly answer next.

const SCENE_KINDS = [
  "open-floor",
  "role-addressed",
  "clear-name",
  "clear-names",
  "player-shares-name",
  "duplicate-names",
  "narrator",
  "off-roster",
  "self-response",
] as const;
type SceneKind = (typeof SCENE_KINDS)[number];

interface CastMember {
  readonly key: string;
  readonly name: string;
  readonly persona: string;
}

interface Line {
  /** A cast key for a character line; anything else is a human player's name. */
  readonly who: string;
  readonly text: string;
}

export interface Scene {
  readonly id: string;
  readonly kind: SceneKind;
  /** The room's persona names: the human players. */
  readonly humans: readonly string[];
  readonly cast: readonly CastMember[];
  readonly lines: readonly Line[];
  readonly banLast: boolean;
  /** Whether the round reaches the model: false when the last line names its responders unambiguously. */
  readonly expectCall: boolean;
  /** The cast keys that may plausibly answer; null on an open floor nobody can judge. */
  readonly accept: readonly string[] | null;
}

const CARAVAN: readonly CastMember[] = [
  { key: "brannoc", name: "Brannoc", persona: "A gruff dwarf blacksmith who mends wagons and weapons. Practical, impatient, swears by oak and iron." },
  { key: "liesel", name: "Liesel", persona: "A gentle field healer who fusses over every wound. Worried, stubborn about rest and bandages." },
  { key: "quill", name: "Quill", persona: "A bookish scholar of dead languages who reads ruins and runes. Curious, long-winded, easily distracted." },
];

const HARBOR: readonly CastMember[] = [
  { key: "ash", name: "Ash", persona: "A soot-stained blacksmith's apprentice who tends the town forge. Eager, clumsy, proud of the fire." },
  { key: "mara", name: "Mara", persona: "The innkeeper of the Gull, who hears every rumour on the waterfront. Warm, nosy, keeps a ledger of debts." },
  { key: "vex", name: "Vex", persona: "A dockside rogue who smuggles for whoever pays. Sly, quick, never answers a question straight." },
];

const CARAVAN_OPENING: readonly Line[] = [
  { who: "Rowan", text: "The wheel's cracked through. We're stuck on this ridge until morning." },
  { who: "brannoc", text: "Cracked? It's split like kindling. I told you that axle was rotten two towns back." },
  { who: "liesel", text: "Everyone sit down before someone twists an ankle in the dark. Rowan, you're limping." },
];

export const SCENES: readonly Scene[] = [
  {
    id: "open-floor",
    kind: "open-floor",
    humans: ["Rowan"],
    cast: CARAVAN,
    lines: [...CARAVAN_OPENING, { who: "Rowan", text: "Well, we can't stay out here all night with wolves about. Ideas, anyone?" }],
    banLast: true,
    expectCall: true,
    accept: null,
  },
  {
    id: "role-addressed",
    kind: "role-addressed",
    humans: ["Rowan"],
    cast: CARAVAN,
    lines: [...CARAVAN_OPENING, { who: "Rowan", text: "That wolf bite on my arm has opened up again. Can whoever knows wounds take a look?" }],
    banLast: true,
    expectCall: true,
    accept: ["liesel"],
  },
  {
    id: "clear-name",
    kind: "clear-name",
    humans: ["Rowan"],
    cast: CARAVAN,
    lines: [...CARAVAN_OPENING, { who: "Rowan", text: "Brannoc, can you get that axle fixed before dawn?" }],
    banLast: true,
    expectCall: false,
    accept: ["brannoc"],
  },
  {
    id: "clear-names",
    kind: "clear-names",
    humans: ["Rowan"],
    cast: CARAVAN,
    lines: [...CARAVAN_OPENING, { who: "Rowan", text: "Liesel and Quill, I need both of you to help me unload the books before the rain." }],
    banLast: true,
    expectCall: false,
    accept: ["liesel", "quill"],
  },
  {
    id: "player-shares-name",
    kind: "player-shares-name",
    humans: ["Ash"],
    cast: HARBOR,
    lines: [
      { who: "mara", text: "Smoke's rolling up the lane again. Somebody left the forge roaring." },
      { who: "Ash", text: "I set my pack down by the hearth and warm my hands." },
      { who: "vex", text: "Ash, that's your forge out there with the bellows still going. Go bank the coals before the whole street burns." },
    ],
    banLast: true,
    expectCall: true,
    accept: ["ash"],
  },
  {
    id: "duplicate-names",
    kind: "duplicate-names",
    humans: ["Dana"],
    cast: [
      { key: "rook-guard", name: "Rook", persona: "A stern city watch sergeant in a dented helm. Lawful, tired, writes every fine in a little book." },
      { key: "rook-thief", name: "Rook", persona: "A grinning pickpocket with quick fingers and a dozen stolen purses. Cheeky, unrepentant, always running." },
      { key: "sela", name: "Sela", persona: "A spice merchant guarding her stall. Shrewd, sharp-tongued, counts every coin twice." },
    ],
    lines: [
      { who: "sela", text: "My purse! It was on the counter a moment ago." },
      { who: "Dana", text: "I saw a hand dart past the cinnamon sacks. Rook, put that purse back where you found it, you little sneak." },
    ],
    banLast: true,
    expectCall: true,
    accept: ["rook-thief"],
  },
  {
    id: "narrator",
    kind: "narrator",
    humans: ["Kit"],
    cast: [
      {
        key: "narrator",
        name: "Narrator",
        persona: "The voice of the world: describes places, weather, creatures and the consequences of what the players do. Never a person in the story.",
      },
      { key: "elara", name: "Elara", persona: "A wary elven ranger who tracks by moonlight. Terse, watchful, hates crypts." },
      { key: "tobin", name: "Tobin", persona: "A cheerful halfling bard who hums when nervous. Talkative, superstitious, brave only on paper." },
    ],
    lines: [
      { who: "elara", text: "Tracks end at the crypt steps. Whatever came this way went inside." },
      { who: "tobin", text: "Inside? Into the crypt? I'll just hum something brave out here, then." },
      { who: "Kit", text: "I push open the crypt door and step into the dark, lantern raised." },
    ],
    banLast: true,
    expectCall: true,
    accept: ["narrator"],
  },
  {
    id: "off-roster",
    kind: "off-roster",
    humans: ["Rowan"],
    cast: HARBOR,
    lines: [
      { who: "mara", text: "Sit, sit. You look like you've walked the whole coast road." },
      { who: "Rowan", text: "Has anyone seen Tobias since the fire at the docks? He owes me a boat." },
    ],
    banLast: true,
    expectCall: true,
    accept: ["mara", "vex"],
  },
  {
    id: "self-response",
    kind: "self-response",
    humans: ["Rowan"],
    cast: CARAVAN,
    lines: [
      ...CARAVAN_OPENING,
      { who: "Rowan", text: "Look at this stone the wheel struck. There are marks carved into it." },
      { who: "quill", text: "These runes are older than the empire. I wonder what someone who has worked dwarven iron makes of these hammer marks." },
    ],
    banLast: true,
    expectCall: true,
    accept: ["brannoc"],
  },
];
