// The probe's scene: ten player beats where state moves naturally, each with the game master reply that goes
// into history for later turns. Shared by the hand-built probe and the app-request capture, so both walk the
// same conversation.

export interface Beat {
  readonly player: string;
  /** The game master's reply that goes into history for later turns, the same in every cell. */
  readonly gm: string;
  /** Where the scene is after this beat, written by the capture's scripted reply so the app's state moves. */
  readonly location: string;
}

export const BEATS: readonly Beat[] = [
  {
    player: "I push open the door of the Drowned Lantern and shake the rain off my cloak. I look for the fence called Marro.",
    gm: "The taproom smells of wet wool and tallow. In the back booth a thin man with ink-stained fingers lifts two fingers in greeting. That's Marro, and he's already counting what you owe him.",
    location: "the Drowned Lantern",
  },
  {
    player: "I slide into the booth and put the sealed courier satchel on the table. 'Forty gold, like we agreed.'",
    gm: "Marro weighs the satchel with one hand, then pushes a small purse across the boards. 'Forty. And a job, if you want one: the harbormaster's ledger, stolen last night. Bring it back by dawn.'",
    location: "the Drowned Lantern",
  },
  {
    player: "I take the purse and the job. 'Where was it last seen?'",
    gm: "'Rat Alley, behind the chandlery,' Marro says. 'A one-eyed thug named Gessa. She hits hard.' He slides you a crude map scratched on bark.",
    location: "the Drowned Lantern",
  },
  {
    player: "I head out into the rain and make my way to Rat Alley, keeping to the shadows.",
    gm: "Rat Alley is a black gut between leaning warehouses. Water sheets off the eaves. Somewhere ahead a lantern swings, and a broad figure leans against the chandlery wall.",
    location: "Rat Alley",
  },
  {
    player: "Gessa sees me and draws a cudgel. She swings before I can talk; the blow catches my ribs and I stagger, but I draw my shortsword.",
    gm: "Pain flares white along your side. Gessa grins with half her teeth and circles to your left, cudgel raised for another swing.",
    location: "Rat Alley",
  },
  {
    player: "I feint high and slash low, opening a cut across her thigh. She drops the cudgel and a leather-bound ledger falls out of her coat.",
    gm: "Gessa howls and limps back into the dark, leaving a trail of blood in the puddles. The ledger lies in the mud at your feet, its brass clasp still shut.",
    location: "Rat Alley",
  },
  {
    player: "I grab the ledger, tuck it into my pack, and bind my ribs with a strip of linen before I move on.",
    gm: "The binding is tight and ugly but it holds. Every breath still bites. Somewhere behind you a whistle shrills: the watch is coming.",
    location: "Rat Alley",
  },
  {
    player: "I run for the harbor, cutting through the fish market as the bells start ringing midnight.",
    gm: "Stalls blur past, slick with scales. The bells boom twelve times over the water. The harbormaster's tower shows a single lit window.",
    location: "the fish market",
  },
  {
    player: "I climb the tower stairs, knock, and hand the ledger to the harbormaster.",
    gm: "Harbormaster Ilse flips the ledger open, checks a page, and lets out a long breath. 'You've saved my neck.' She presses a heavy silver signet ring into your palm.",
    location: "the harbormaster's tower",
  },
  {
    player: "I thank her, step back out into the rain, and head back toward the Drowned Lantern to collect from Marro.",
    gm: "The rain is thinning. Behind you the harbor bells fall silent, and the lantern over the tavern door glows like a promise.",
    location: "the harbor road",
  },
];

export const PERSONA =
  "You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person for the player " +
  "character, Rook, a courier in the port city of Saltmere. Voice any present cast in dialogue. Keep replies to 2-3 short paragraphs.";
