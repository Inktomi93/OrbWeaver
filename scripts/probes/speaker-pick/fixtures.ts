// Five synthetic four-character rooms, each one continuous scene with six decision points. Every cut is a round
// the smart arbiter would face; `accept` is the author's hand judgment of who may plausibly speak next.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";

export interface RoomCharacter {
  readonly id: CharacterId;
  readonly name: string;
  /** The short persona summary the reranker scores against and the reference reads. */
  readonly persona: string;
}

interface Line {
  readonly speaker: string;
  readonly text: string;
}

export interface Cut {
  /** The decision is made before `lines[at]`: the window is the ten lines ending at `at - 1`. */
  readonly at: number;
  /** Hand judgment: the names that may plausibly speak next, or null for an open floor nobody can judge. */
  readonly accept: readonly string[] | null;
  /** What the cut tests. */
  readonly kind: CutKind;
}

const CUT_KINDS = ["named-by-user", "named-by-character", "role-addressed", "reply-to-last", "open-floor"] as const;
export type CutKind = (typeof CUT_KINDS)[number];

export interface Room {
  readonly id: string;
  readonly user: string;
  readonly characters: readonly RoomCharacter[];
  readonly lines: readonly Line[];
  readonly cuts: readonly Cut[];
}

function cast(...rows: readonly (readonly [string, string])[]): RoomCharacter[] {
  return rows.map(([name, persona]) => ({ id: mintTypeId(ID_PREFIX.character), name, persona }));
}

function say(speaker: string, text: string): Line {
  return { speaker, text };
}

export const ROOMS: readonly Room[] = [
  {
    id: "caravan",
    user: "Rowan",
    characters: cast(
      ["Brannoc", "A gruff dwarf blacksmith who mends wagons and weapons. Practical, impatient, swears by oak and iron."],
      ["Liesel", "A gentle field healer who fusses over every wound. Worried, stubborn about rest and bandages."],
      ["Quill", "A halfling thief and lockpick who jokes to hide his nerves. Sharp eyes, quick hands, always planning an escape."],
      ["Maelis", "An elf scout who reads maps, tracks and weather. Terse, precise, knows the wild roads."],
    ),
    lines: [
      say("Rowan", "The axle snapped right as we cleared the ridge. We're stuck until it's fixed."),
      say("Brannoc", "Snapped clean through. Cheap pine. I told the wagoner oak, and he told me to mind my own forge."),
      say("Quill", "To be fair, you tell everyone oak. You told the innkeeper his stools should be oak."),
      say("Brannoc", "And they should. Hand me the iron bands from the back, lad, and stop talking."),
      say("Rowan", "While he works, how far are we from the river crossing? I don't want to be out here after dark."),
      say("Maelis", "Four hours at a fair pace. Three if we leave the wagon. The tracks on the east trail are fresh. Wolves, a big pack."),
      say("Liesel", "Wolves? Rowan, your arm is still bleeding through the bandage. Blood will carry on the wind."),
      say("Rowan", "It's just a scratch. Mostly."),
      say("Liesel", "Mostly is not a word healers like. Sit. I need to clean it before we move."),
      say("Quill", "I'll keep watch. Not because I'm brave. Because I want first pick of the escape routes."),
      say("Maelis", "Quill. Climb the pine and tell me if you see eyes in the treeline. Your eyes are better than your manners."),
      say("Quill", "Flattery and a chore. Fine. I see two. No, five. Moving along the creek, toward us."),
      say("Rowan", "Brannoc, how long on that axle?"),
      say("Brannoc", "Ten minutes if nobody else asks me how long."),
      say("Liesel", "The arm is done. Rowan, don't lift anything heavy with it, I mean it."),
      say("Rowan", "Can anyone tell me if those wolves will cross running water?"),
      say("Maelis", "They will not. Reach the ford and we are safe until morning."),
      say("Quill", "Then let's be very fast. I've decided I like this caravan with all its limbs attached."),
    ],
    cuts: [
      { at: 5, accept: ["Maelis"], kind: "role-addressed" },
      { at: 8, accept: ["Liesel"], kind: "reply-to-last" },
      { at: 11, accept: ["Quill"], kind: "named-by-character" },
      { at: 13, accept: ["Brannoc"], kind: "named-by-user" },
      { at: 16, accept: ["Maelis"], kind: "role-addressed" },
      { at: 18, accept: null, kind: "open-floor" },
    ],
  },
  {
    id: "starship",
    user: "Mara",
    characters: cast(
      ["Okafor", "The ship's captain. Calm, decisive, gives orders and makes the hard calls."],
      ["Reyes", "The chief engineer. Blunt, protective of the reactor and couplings, fixes anything mechanical."],
      ["Varga", "The science officer. Precise and analytical; decodes signals and reads sensor data."],
      ["Jett", "The pilot. Cocky, fast, loves tight flying and bad odds."],
    ),
    lines: [
      say("Okafor", "All stations, we are entering the debris field. Mara, you're on sensors for this one."),
      say("Mara", "Understood, Captain. I'm reading a lot of metal out there, some of it still warm."),
      say("Jett", "Warm metal means somebody blew up recently. Love that for us."),
      say("Varga", "The thermal decay suggests the explosion occurred less than six hours ago. The fragments carry a military alloy signature."),
      say("Mara", "There's a vibration in the deck plates. It's getting stronger."),
      say("Reyes", "That's the port coupling. It's been whining since Kessel. I can patch it, but not while we're dodging rocks."),
      say("Okafor", "Jett, find us a clear lane. Reyes, give me twenty percent more to the forward shields."),
      say("Jett", "Lane found. It's a tight one. Everyone hold onto something you like."),
      say("Reyes", "Shields are up twenty. The coupling won't love it."),
      say("Mara", "Captain, I'm picking up a distress beacon. Old encoding, very faint."),
      say("Okafor", "Varga, can you decode it?"),
      say("Varga", "It is a pre-war naval cipher. The message repeats: survivors aboard, life support failing."),
      say("Jett", "So we're doing the heroic thing. I'll get us close."),
      say("Mara", "Reyes, will the coupling hold if we dock with a wreck?"),
      say("Reyes", "It'll hold. Probably. Ask me again after we've docked."),
      say("Okafor", "Then we dock. Mara, you're with me on the boarding party."),
    ],
    cuts: [
      { at: 5, accept: ["Reyes"], kind: "role-addressed" },
      { at: 7, accept: ["Jett", "Reyes"], kind: "named-by-character" },
      { at: 10, accept: ["Okafor"], kind: "role-addressed" },
      { at: 11, accept: ["Varga"], kind: "named-by-character" },
      { at: 14, accept: ["Reyes"], kind: "named-by-user" },
      { at: 16, accept: null, kind: "open-floor" },
    ],
  },
  {
    id: "precinct",
    user: "Sam",
    characters: cast(
      ["Hollis", "A tired, sardonic homicide detective who runs the case and hates reporters."],
      ["Priya", "An eager forensic technician; fingerprints, inks, lab results."],
      ["Gus", "A nervous street informant who knows every pawn shop and fence in the city."],
      ["Celeste", "A pushy crime journalist who invites herself in and always wants a quote."],
    ),
    lines: [
      say("Hollis", "Body was found behind the laundromat at six. Sam, you were first on scene. Talk."),
      say("Sam", "The victim had ink on his fingers and a pawn ticket in his coat. No wallet."),
      say("Priya", "The ink's interesting. It's not pen ink, it's printing ink. Offset press, I'd bet."),
      say("Celeste", "A printer. Detective, is this connected to the counterfeit bills turning up on Fifth?"),
      say("Hollis", "Who let the reporter in?"),
      say("Celeste", "I let myself in. Your door was open, and so is this case."),
      say("Sam", "Gus, you know the pawn shops. Which one uses green tickets like this?"),
      say("Gus", "Green? That's Morty's on Delancey. Morty don't ask questions, if you know what I mean. I didn't tell you that."),
      say("Hollis", "Of course you didn't."),
      say("Sam", "Can someone run the fingerprints on the ticket before we go to Morty's?"),
      say("Priya", "Already dusting. I'll have a partial in twenty minutes, maybe less if the lab printer cooperates."),
      say("Celeste", "Morty's. I'll meet you there."),
      say("Hollis", "You'll stay here, or you'll be writing your next story from a holding cell."),
      say("Celeste", "Charming. Fine. But I want the first quote when you crack it."),
      say("Gus", "Detective, if you're going to Morty's, don't tell him I sent you. I mean it. He's got cousins."),
      say("Sam", "What do we know about Morty's cousins?"),
      say("Gus", "Big ones. The kind that lift engines for fun."),
      say("Hollis", "Then we bring backup. Priya, call me the second that print comes back."),
    ],
    cuts: [
      { at: 5, accept: null, kind: "open-floor" },
      { at: 7, accept: ["Gus"], kind: "named-by-user" },
      { at: 10, accept: ["Priya"], kind: "role-addressed" },
      { at: 13, accept: ["Celeste"], kind: "reply-to-last" },
      { at: 16, accept: ["Gus", "Hollis"], kind: "role-addressed" },
      { at: 18, accept: ["Priya"], kind: "named-by-character" },
    ],
  },
  {
    id: "cafe",
    user: "Jun",
    characters: cast(
      ["Hana", "The warm, motherly cafe owner who greets every regular by name."],
      ["Theo", "A sarcastic barista and coffee snob; beans, roasts and brewing."],
      ["Albright", "An elderly regular who knows all the neighborhood gossip."],
      ["Dmitri", "A shy pastry chef who bakes everything on the menu and speaks very little."],
    ),
    lines: [
      say("Hana", "Jun! You're early today. The usual?"),
      say("Jun", "Yes please. And I heard there's a new pastry on the menu?"),
      say("Hana", "Dmitri made cardamom buns this morning. Dmitri, come say what's in them!"),
      say("Dmitri", "Um. Cardamom, orange zest. A little brown butter. They're still warm."),
      say("Albright", "Brown butter! My late husband would have married that bun instead of me."),
      say("Theo", "One oat flat white for Jun. Pulled it a little ristretto, because you deserve better than the house blend."),
      say("Jun", "Theo, why does the coffee taste different today?"),
      say("Theo", "New beans. Ethiopian, washed process. Notes of bergamot, if your palate is awake."),
      say("Albright", "Speaking of new things, did anyone hear the bakery across the street is closing?"),
      say("Hana", "Closing? Oh no, Mrs. Patel has run that place for twenty years."),
      say("Albright", "Rent went up. Her nephew told my bridge club."),
      say("Jun", "Do you think she'd want to sell her ovens? Dmitri has been wanting a second oven."),
      say("Dmitri", "A deck oven? I... yes. That would be very good."),
      say("Theo", "Great, more buns, more line, more people asking me for caramel syrup."),
      say("Jun", "Can someone help me carry these boxes in from my car? They're heavy."),
      say("Theo", "Fine, but you owe me. And not in buns."),
      say("Albright", "In my day, young men carried boxes without negotiating."),
    ],
    cuts: [
      { at: 2, accept: ["Dmitri", "Hana"], kind: "role-addressed" },
      { at: 3, accept: ["Dmitri"], kind: "named-by-character" },
      { at: 7, accept: ["Theo"], kind: "named-by-user" },
      { at: 12, accept: ["Dmitri", "Hana"], kind: "named-by-user" },
      { at: 15, accept: ["Theo", "Dmitri", "Hana"], kind: "role-addressed" },
      { at: 17, accept: null, kind: "open-floor" },
    ],
  },
  {
    id: "expedition",
    user: "Wren",
    characters: cast(
      ["Eldridge", "An obsessive old professor of dead languages who will risk anything for a rubbing of the carvings."],
      ["Nayeli", "The local guide; cautious, knows the land, the paths and the old warnings."],
      ["Corin", "A nervous photographer who jokes when scared and carries the camera and flash."],
      ["Ada", "The expedition medic; calm, practical, watches everyone's health."],
    ),
    lines: [
      say("Eldridge", "There. Beneath the moss. The carvings match the rubbings from the Hargrave journal."),
      say("Nayeli", "My grandmother told us never to come to this hollow after the fog rises. The fog is rising."),
      say("Corin", "Great. Love that. I'm getting a photo of the carvings and then I'm getting very far away."),
      say("Wren", "Corin, does your flash still work? It's getting dark fast."),
      say("Corin", "Flash works. Hands, less so. Why is it so cold all of a sudden?"),
      say("Wren", "Professor, what do the carvings actually say?"),
      say("Eldridge", "It is a warning, or an invitation. The old dialect does not distinguish the two."),
      say("Ada", "Wren, you're shivering. Your lips are blue. Put on the thermal layer, now."),
      say("Wren", "I'm fine, Ada. Really."),
      say("Ada", "You're not. Shivering this hard means hypothermia is starting. Corin, give her your scarf."),
      say("Corin", "Here. It smells like coffee and fear, sorry."),
      say("Nayeli", "Listen. Do you hear that? Something is walking on the ridge above us, keeping pace."),
      say("Wren", "Which way back to the truck is fastest?"),
      say("Nayeli", "Down the stream bed. Stay in the water. Whatever is up there will lose our scent."),
      say("Eldridge", "We cannot leave now. One more rubbing, one more, and the journal will be complete."),
      say("Ada", "Professor, nobody's life is worth a rubbing. We go now."),
    ],
    cuts: [
      { at: 4, accept: ["Corin"], kind: "named-by-user" },
      { at: 6, accept: ["Eldridge"], kind: "role-addressed" },
      { at: 9, accept: ["Ada"], kind: "reply-to-last" },
      { at: 10, accept: ["Corin"], kind: "named-by-character" },
      { at: 13, accept: ["Nayeli"], kind: "role-addressed" },
      { at: 15, accept: ["Nayeli", "Ada", "Corin"], kind: "reply-to-last" },
    ],
  },
];
