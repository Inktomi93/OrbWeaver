// IMP-1 probe — the 12 BLEED-TEMPTING conversation fixtures.
//
// Every fixture is a chat mid-scene where the model is asked (via the production impersonateNudge) to write
// the USER's next line. Each one applies a DIFFERENT temptation to write as the character instead:
// a labelled transcript, a first-person card, a card that demands a name prefix, a multi-character scene,
// a user who has never spoken, a card/preset that mandates third-person narration, and so on.
//
// The shapes here are the production ones (`AssembleCharacter` / `AssemblePersona` / `PromptConfig`); the
// canon rows are the SHAPE-stage `CanonRow` inputs (role + content + authorName + characterId), which is
// what `toShapeCanon` produces from a `MessageView[]` for a macro-free body.

import type { AssembleCharacter, AssemblePersona } from "@orb/contracts/chat";
import type { NamesBehavior, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export interface CanonFixtureRow {
  readonly role: "user" | "assistant";
  readonly content: string;
  /** The stored authoring name (persona on user rows, character on assistant rows). */
  readonly authorName: string;
  /** Present on assistant rows — drives the multi-character name-stamp gate. */
  readonly characterId?: CharacterId;
}

export interface ImpersonateFixture {
  readonly id: string;
  /** The temptation this fixture applies — the reason it exists. */
  readonly tempts: string;
  readonly character: AssembleCharacter;
  /** The full cast (primary first). Solo fixtures carry just the primary. */
  readonly cast: readonly AssembleCharacter[];
  readonly castCharacterIds: readonly CharacterId[];
  readonly persona: AssemblePersona;
  readonly namesBehavior: NamesBehavior;
  /** Replaces the DEFAULT_PROMPT_CONFIG `main_prompt` template when set. */
  readonly mainPrompt?: string;
  readonly canon: readonly CanonFixtureRow[];
}

const SEREN_ID = castId<CharacterId>("chr_seren");
const HOLT_ID = castId<CharacterId>("chr_holt");
const MARA_ID = castId<CharacterId>("chr_mara");
const KESTREL_LOOKALIKE_ID = castId<CharacterId>("chr_kestrelin");

const KESTREL: AssemblePersona = {
  name: "Kestrel",
  description: "A courier with a sharp tongue and a debt she is trying to outrun. Speaks plainly, rarely explains herself.",
};

const SEREN: AssembleCharacter = {
  name: "Seren",
  description: "The keeper of the ford-road waystation. Grey-eyed, patient, keeps a ledger of everyone who passes.",
  personality: "Watchful, dry-humoured, slow to trust.",
  scenario: "A rain-soaked night at the waystation on the ford road.",
};

const HOLT: AssembleCharacter = {
  name: "Holt",
  description: "A road-warden with a bad knee and a worse temper. Carries the ford-road writ.",
  personality: "Blunt, suspicious, loyal to the letter of the law.",
};

const MARA: AssembleCharacter = {
  name: "Mara",
  description: "A tinker camped in the waystation yard, mending a wheel that will not hold.",
  personality: "Chatty, distractible, secretly frightened.",
};

/** The `main_prompt` template used when a fixture doesn't override it (the shipped default's own text). */
export const DEFAULT_MAIN_PROMPT = "You are {{char}} in an immersive, ongoing roleplay with {{user}}. Stay in character; write {{char}}'s perspective only.";

/** DEFAULT_PROMPT_CONFIG with the fixture's names behavior + optional main-prompt override + optional
 *  extra sections. The section ORDER and every other marker stay exactly as shipped. */
export function configFor(fx: ImpersonateFixture): typeof DEFAULT_PROMPT_CONFIG {
  const sections: PromptSection[] = DEFAULT_PROMPT_CONFIG.sections.map((s) =>
    s.type === "marker" && s.marker === "main_prompt" ? { ...s, template: fx.mainPrompt ?? DEFAULT_MAIN_PROMPT } : s,
  );
  return { ...DEFAULT_PROMPT_CONFIG, sections, namesBehavior: fx.namesBehavior };
}

const soloSeren = {
  character: SEREN,
  cast: [SEREN],
  castCharacterIds: [SEREN_ID],
  persona: KESTREL,
} as const;

export const FIXTURES: readonly ImpersonateFixture[] = [
  {
    ...soloSeren,
    id: "mid-dialogue",
    tempts: "The character just spoke and left a question hanging — the natural continuation is HER next line.",
    namesBehavior: "default",
    canon: [
      {
        role: "assistant",
        content: 'The waystation door bangs shut behind you. Seren looks up from her ledger, pen still moving. "Late for the ford. You crossing tonight?"',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: 'I shake the rain off my coat and drop my satchel by the fire. "If the water\'s down. Is it?"', authorName: "Kestrel" },
      {
        role: "assistant",
        content:
          '"It\'s not." She turns a page without looking at it. "Two hands over the stones since dusk. You\'d be swimming, and you can\'t swim with that satchel." A pause. "What\'s in it that\'s worth the ford at night?"',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "labelled-transcript",
    tempts: "namesBehavior:content stamps every row `Name:` — the transcript itself teaches the label habit.",
    namesBehavior: "content",
    canon: [
      { role: "assistant", content: '"Sit. You\'re dripping on my floor."', authorName: "Seren", characterId: SEREN_ID },
      { role: "user", content: "\"I'll dry. I'm not staying.\"", authorName: "Kestrel" },
      {
        role: "assistant",
        content: '"Everyone says that. The ledger says otherwise." She taps the open page. "Nine names this month, all of them not staying."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    id: "multi-char-scene",
    tempts: "Three characters in the room, each with a stamped label — maximum pull toward voicing SOMEONE else.",
    character: SEREN,
    cast: [SEREN, HOLT, MARA],
    castCharacterIds: [SEREN_ID, HOLT_ID, MARA_ID],
    persona: KESTREL,
    namesBehavior: "default",
    canon: [
      {
        role: "assistant",
        content: 'Seren sets a third cup on the table without being asked. "Warden\'s already here. Try not to make it interesting."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      {
        role: "assistant",
        content: 'Holt shifts his bad leg under the bench and looks you over. "Courier. Papers."',
        authorName: "Holt",
        characterId: HOLT_ID,
      },
      { role: "user", content: "I put the writ on the table, face down, and slide it across.", authorName: "Kestrel" },
      {
        role: "assistant",
        content: "Mara leans in from the yard door, wheel spoke in hand. \"Oh, that's a ford writ. Those are — those are the ones with the wax, aren't they?\"",
        authorName: "Mara",
        characterId: MARA_ID,
      },
      {
        role: "assistant",
        content: '"Quiet, tinker." Holt turns the writ over with one finger. "Where\'d you get this seal?"',
        authorName: "Holt",
        characterId: HOLT_ID,
      },
    ],
  },
  {
    id: "first-person-card",
    tempts: "The card is written in FIRST PERSON — the description itself is a voice sample the model can slip into.",
    character: {
      name: "Seren",
      description:
        "I keep the waystation at the ford road. I write down every name that passes; I have never missed one. I do not raise my voice, and I do not repeat myself.",
      personality: "I am patient. I am not kind. I notice everything, and I say about a third of it.",
      scenario: "I am at my ledger. It is raining. Someone has just come in out of it.",
    },
    cast: [SEREN],
    castCharacterIds: [SEREN_ID],
    persona: KESTREL,
    namesBehavior: "default",
    canon: [
      {
        role: "assistant",
        content: 'I mark the time in the ledger before I look up. "Name and destination. You know how this goes."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: '"You know my name, Seren."', authorName: "Kestrel" },
      { role: "assistant", content: 'I write it anyway. "The ledger doesn\'t know you. Destination."', authorName: "Seren", characterId: SEREN_ID },
    ],
  },
  {
    ...soloSeren,
    id: "card-demands-label",
    tempts: "The card's system prompt orders a `Name:` prefix on every reply — an ST-imported habit fighting the nudge.",
    character: { ...SEREN, systemPrompt: "You are Seren. ALWAYS begin every single reply with `Seren:` followed by her words. Never omit the prefix." },
    namesBehavior: "default",
    canon: [
      { role: "assistant", content: 'Seren: "Boots off by the door or not at all."', authorName: "Seren", characterId: SEREN_ID },
      { role: "user", content: "I toe them off and leave them steaming by the grate.", authorName: "Kestrel" },
      {
        role: "assistant",
        content: "Seren: \"Better. Now — the ford's up, so you're either paying for a bed or arguing with me about it.\"",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "labelled-examples",
    tempts: "The card's dialogue examples are a `{{char}}:`/`{{user}}:` labelled script — the model is shown BOTH voices being written by it.",
    character: {
      ...SEREN,
      exampleMessages:
        '<START>\n{{user}}: "How much for the room?"\n{{char}}: "Six, or four and you split the wood."\n{{user}}: "I\'ll split the wood."\n{{char}}: "They always do."',
    },
    namesBehavior: "default",
    canon: [
      { role: "assistant", content: "\"Room's four if you split the wood. Six if you'd rather not be useful.\"", authorName: "Seren", characterId: SEREN_ID },
      { role: "user", content: "I look at the woodpile. It is enormous.", authorName: "Kestrel" },
      {
        role: "assistant",
        content: "\"It's smaller than it looks. That's what I tell everyone, and it's never been true.\"",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "long-scene",
    tempts: "Ten turns of established rhythm — the nudge at the tail competes with a long habit of the model writing Seren.",
    namesBehavior: "default",
    canon: [
      { role: "assistant", content: '"You\'re the third tonight. The other two turned back."', authorName: "Seren", characterId: SEREN_ID },
      { role: "user", content: '"I\'m not the other two."', authorName: "Kestrel" },
      { role: "assistant", content: '"No. They paid." She wipes the pen and sets it down. "Sit, courier."', authorName: "Seren", characterId: SEREN_ID },
      { role: "user", content: "I sit. The bench is warm from someone else.", authorName: "Kestrel" },
      {
        role: "assistant",
        content: '"Warden\'s bench. He\'ll want it back." She pours without asking. "Drink that before you argue with me about the ford."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: "I drink. It is worse than the rain.", authorName: "Kestrel" },
      {
        role: "assistant",
        content:
          '"It\'s supposed to be. Keeps people honest about how cold they are." She watches you over the ledger. "You\'ve got a delivery date, haven\'t you."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: '"Tomorrow, first bell. On the other side."', authorName: "Kestrel" },
      {
        role: "assistant",
        content: '"Then you\'ve got a problem, and it isn\'t the water." She closes the ledger. "Somebody set your date knowing the ford was up. Who?"',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "direct-question",
    tempts: "A pointed direct question to the user — an answer is owed, and the model may answer it in HER voice by reflex.",
    namesBehavior: "default",
    canon: [
      {
        role: "assistant",
        content: "She turns the lamp up. \"I'll ask once and then I'll stop caring. Who are you running from?\"",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "narration-heavy",
    tempts: "The history is pure third-person prose with almost no dialogue — the scene-writing voice is the dominant register.",
    namesBehavior: "default",
    mainPrompt: "You are the narrator of an immersive, ongoing story featuring {{char}} and {{user}}. Write vivid third-person prose.",
    canon: [
      {
        role: "assistant",
        content:
          "The rain had settled into the kind of steady work that would go on all night. Inside the waystation the fire had been banked low, and Seren moved between the tables with the unhurried economy of someone who had done it ten thousand times. She did not look at the door when it opened. She had already heard the horse.",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: "Kestrel stood in the doorway a moment longer than she needed to, letting the water run off her.", authorName: "Kestrel" },
      {
        role: "assistant",
        content:
          "The ledger lay open on the counter, its newest line still wet. Outside, the ford roared in the dark, and every person in the room pretended not to hear it.",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    id: "lookalike-name",
    tempts: "A cast member whose name shares the persona's prefix (Kestrelin vs Kestrel) — the label-scrub's worst case.",
    character: {
      name: "Kestrelin",
      description: "A hedge-scribe who took the courier's name as a professional flourish and refuses to admit it.",
      personality: "Preening, evasive, quick with a quill.",
    },
    cast: [{ name: "Kestrelin", description: "A hedge-scribe.", personality: "Preening." }],
    castCharacterIds: [KESTREL_LOOKALIKE_ID],
    persona: KESTREL,
    namesBehavior: "content",
    canon: [
      {
        role: "assistant",
        content: "\"Kestrelin. With the -in. It's a different name entirely, and I'd thank you to say it properly.\"",
        authorName: "Kestrelin",
        characterId: KESTREL_LOOKALIKE_ID,
      },
      { role: "user", content: '"You took my name and put a hat on it."', authorName: "Kestrel" },
      {
        role: "assistant",
        content: '"I took A name. Names are not property." The quill does not stop moving. "Now. Did you want the seal copied or not?"',
        authorName: "Kestrelin",
        characterId: KESTREL_LOOKALIKE_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "third-person-mandate",
    tempts: "The preset mandates third-person past-tense narration — directly against the nudge's first-person AS-{{user}} instruction.",
    namesBehavior: "default",
    mainPrompt:
      "You are writing an immersive story about {{char}} and {{user}}. ALWAYS write in third person, past tense, referring to every participant by name. Never write in the first person under any circumstance.",
    canon: [
      {
        role: "assistant",
        content:
          'Seren had already poured the second cup before Kestrel reached the table. "Sit," she said. "The ford\'s not going anywhere and neither are you."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
      { role: "user", content: "Kestrel sat, but she did not take the cup.", authorName: "Kestrel" },
      {
        role: "assistant",
        content:
          'Seren watched the untouched cup for a while, then pushed the ledger across the table instead. "Read the ninth line," she said, "and then tell me you\'re crossing tonight."',
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
  {
    ...soloSeren,
    id: "no-user-voice",
    tempts: "The user has NEVER spoken — there is no sample of their voice to imitate, only the character's.",
    namesBehavior: "default",
    canon: [
      {
        role: "assistant",
        content:
          "The waystation smells of wet wool and lamp oil. Seren does not look up from the ledger as you shake off the rain, but the second cup is already on the table, and it is already full.\n\n\"You're early,\" she says, to the page. \"That's usually somebody else's problem, so I'd like to know whose.\"",
        authorName: "Seren",
        characterId: SEREN_ID,
      },
    ],
  },
];
