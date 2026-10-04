// The reranker-live corpus: one caravan campaign seen by every rerank consumer. Each long item opens with a few hundred
// tokens of the campaign's ordinary texture (shared across items, so it cannot tell them apart) and only then states
// the one fact a query asks about, so a reranker that reads only its first 512 tokens never sees what decides the pick.

/** Recap sentences any arc of this campaign could contain. Arcs take them in different orders. */
const RECAP_POOL = [
  "The caravan broke camp before dawn, the wagons creaking under salt, cloth and lamp oil bound for the northern markets.",
  "Brannoc spent the first hours of the march grumbling about the wheel hubs and checking every pin with his thumb.",
  "Liesel walked beside the lead wagon, counting bandages and asking each driver whether they had slept at all.",
  "Quill rode on the tailboard of the last wagon, juggling three walnuts and inventing names for the oxen.",
  "Maelis scouted ahead on foot, returning at noon with news of the road and very little else to say.",
  "Rowan kept the ledger, and every evening the party argued over whether the numbers still added up.",
  "The weather turned cold and grey, and a thin drizzle soaked through every cloak by the second watch.",
  "They ate barley stew three nights running, and Quill composed a mournful song about it that nobody asked for.",
  "Niko practised his sword forms at every halt, and Mira mocked his footwork until he laughed despite himself.",
  "A trader heading south warned them that the hill roads were washed out and the inns along them half empty.",
  "The oxen grew lame on the stony stretch, and the march slowed to a crawl while Brannoc reshod the worst of them.",
  "At night the party sat close around a small fire, trading stories of home and pretending not to be homesick.",
  "Rowan and Maelis disagreed about the route again; the scout won the argument by simply walking off the way she chose.",
  "Liesel treated a carter's blistered hands and lectured the whole camp about gloves for most of an evening.",
  "Mira took the dawn watch and swore she heard wolves, though nobody else heard anything at all.",
  "The party paid a farmer in cloth for fresh bread and eggs, the first decent breakfast in a week.",
  "Quill lost two coins at knucklebones to a drover and spent the rest of the day plotting to win them back.",
  "Brannoc refused to sleep under canvas when it rained and complained loudly about it while sleeping under canvas.",
  "Niko wrote a letter to his sister every few days and never once found a courier to carry one.",
  "The wagons were repacked twice to balance the load after a crate of lamp oil split and soaked the floorboards.",
  "Maelis marked the road with chalk at every fork, in a scout's code she refused to teach the others.",
  "Mira and Quill raced each other up a hillside for a wager, and both claimed victory for the rest of the week.",
  "Rowan wrote in the journal that morale was fair, supplies were adequate and the timetable was already hopeless.",
  "The party passed burned fields and empty farmsteads, and talk around the fire turned quiet and uneasy.",
  "Liesel insisted on boiling every drop of drinking water, which slowed the evening meal and annoyed everyone.",
  "Brannoc carved a small oak horse for a farm child they met on the road and pretended it was nothing.",
  "A night of high wind tore loose two canvas covers, and the whole party chased them across a muddy pasture.",
  "Niko and Maelis kept the second watch together and talked for hours about nothing anybody else could follow.",
  "Rowan haggled for an hour with a toll keeper over a broken scale and won back exactly one copper.",
  "Quill taught two drovers a card game and then lost to them both, loudly, for three evenings straight.",
  "The party camped in a ruined chapel one night, and nobody slept well under its broken roof.",
  "Brannoc and Maelis argued about whether elves or dwarves made better boots until the fire burned down.",
  "Liesel ran short of clean linen and tore up one of Quill's spare shirts without asking him.",
  "A pedlar travelled with the caravan for two days, selling buttons and gossip in equal measure.",
  "Niko caught a fever after a cold night on watch and spent a day wrapped in blankets in the second wagon.",
  "The drivers sang old harvest songs on the long flat stretches, and even Maelis was seen humming along.",
  "Mira mended the torn canvas with a sailmaker's needle and refused all offers of help.",
  "Rowan sent a letter ahead to the guild house to warn them the caravan would be late again.",
  "The party traded salt for a sack of apples at a roadside orchard, and Quill ate far too many.",
  "A thunderstorm kept them pinned under a stand of beech trees for most of an afternoon.",
] as const;

const RECAP_RUN = 36;
/** How far apart in the pool two neighbouring arcs start their texture. */
const RECAP_STRIDE = 5;

/** `count` pool sentences starting at `offset`, wrapping, so two arcs share texture but never its order. */
function texture(pool: readonly string[], offset: number, count: number): string {
  return Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length]).join(" ");
}

/** A long corpus item in two shapes. `text` names its subject in a lead sentence near the top, as a real summary,
 *  card or document section does. `needle` drops that lead, so only the closing, hundreds of tokens in, can tell it
 *  apart from the others. `closing` is that late passage. */
export interface LongItem {
  readonly key: string;
  readonly text: string;
  readonly needle: string;
  readonly closing: string;
}

/** The parts every long item is built from: a neutral opening, the subject lead, and the late closing. */
interface ItemParts {
  readonly key: string;
  readonly opening: string;
  readonly lead: string;
  readonly closing: string;
}

function longItem(parts: ItemParts, body: string): LongItem {
  return {
    key: parts.key,
    text: `${parts.opening} ${parts.lead} ${body} ${parts.closing}`,
    needle: `${parts.opening} ${body} ${parts.closing}`,
    closing: parts.closing,
  };
}

const ARCS: readonly ItemParts[] = [
  {
    key: "crossing",
    opening: "[Days 40 to 44] The caravan followed the valley road north through farm country.",
    lead: "This was the stretch where a river spirit stopped the caravan at the Ashford, and Mira paid for the crossing.",
    closing:
      "When they reached the Ashford at last, the water rose against the wagons and a pale river spirit barred the crossing. " +
      "Mira gave the spirit her grandfather's silver compass, the one thing she had sworn never to sell, and the water fell away so the wagons could cross. " +
      "She did not speak for the rest of the evening.",
  },
  {
    key: "marsh",
    opening: "[Days 45 to 49] The road dropped into lowland and the air turned damp and close.",
    lead: "In the marshes Niko was bitten by a viper and Liesel had to treat him on the road.",
    closing:
      "On the marsh causeway a viper bit Niko on the ankle. Liesel cut the wound and drew out the venom, and he limped for four days, " +
      "insisting the whole time that it did not hurt.",
  },
  {
    key: "ambush",
    opening: "[Days 50 to 53] The caravan climbed toward the ridge country under a hard grey sky.",
    lead: "These were the days of the bandit ambush at Gallow's Bend.",
    closing:
      "At Gallow's Bend the Red Lantern bandits ambushed the column from both banks of the cutting. Brannoc's hammer broke on a raider's shield, " +
      "and he finished the fight with a wagon tongue. Two drovers were wounded and one wagon was burned.",
  },
  {
    key: "wedding",
    opening: "[Days 54 to 57] The road wound up into gentle hill country.",
    lead: "The caravan reached the hill village of Brightwater on the morning of the miller's daughter's wedding, and the whole party was invited to the feast.",
    closing: "They left Brightwater with their water barrels full and a borrowed spare axle lashed under the second wagon.",
  },
  {
    key: "pass",
    opening: "[Days 58 to 62] The road climbed into the mountains and snow began to fall in earnest.",
    lead: "This was the crossing of Hollow Pass, where the caravan lost a wagon.",
    closing:
      "At Hollow Pass the ice bridge gave way beneath the fourth wagon. The driver jumped clear, but the wagon and its whole load of salt fell into the gorge, " +
      "and the party spent a bitter night deciding whether to turn back.",
  },
  {
    key: "watchtower",
    opening: "[Days 63 to 66] The far side of the pass opened onto a wide and empty plateau.",
    lead: "On the plateau the party found a burned watchtower and a dead courier.",
    closing:
      "Maelis found the burned watchtower on the plateau with a dead courier inside it, still clutching a sealed letter addressed to the Duke. " +
      "Rowan kept the letter unopened and locked it in the strongbox.",
  },
];

/** The arc texts in the campaign's order: digest arcs for recall, the same scenes as verbatim segments for search. */
export const ARC_TEXTS: readonly LongItem[] = ARCS.map((arc, i) => longItem(arc, texture(RECAP_POOL, i * RECAP_STRIDE, RECAP_RUN)));

/** The character an arc's scene is credited to, for `discover` (one cast member per arc, in arc order). */
export const ARC_CREDITS = ["Mira", "Niko", "Brannoc", "Quill", "Rowan", "Maelis"] as const;

// ---- personas for the Smart speaker pick and the character search ----

/** Persona sentences that fit any member of this company. `{n}` is the character's name. */
const PERSONA_POOL = [
  "{n} joined the company three winters ago after a season of odd jobs along the coast road.",
  "{n} keeps a small pack, mends their own clothes and has strong opinions about how a camp should be laid out.",
  "On the road {n} is steady and dependable, though quick to complain about the food, the weather and the pace.",
  "{n} grew up in a crowded house in a market town and still flinches at silence on long empty nights.",
  "{n} trusts the others with their life and with almost nothing else, least of all the purse.",
  "When a quarrel starts, {n} usually tries to end it with a joke, and it works about half the time.",
  "{n} drinks little, sleeps lightly and wakes at the smallest sound from the picket line.",
  "{n} owes a debt to a moneylender in the capital and sends what coin they can spare whenever the caravan passes a courier post.",
  "In a fight {n} prefers to stay close to the wagons and protect the drivers rather than chase anyone.",
  "{n} is fond of the oxen and has given each of them a name that the drivers refuse to use.",
  "{n} likes to sing on the march, badly and loudly, and does not care who hears.",
  "{n} has a habit of collecting small stones from every road the caravan travels and keeping them in a pouch.",
  "Asked about the past, {n} changes the subject and offers to fetch more firewood.",
  "{n} gets along best with Rowan, who never asks too many questions and always pays on time.",
  "{n} believes that every journey goes wrong on the third day and says so on the third day of every journey.",
  "{n} keeps a lucky ribbon tied around one wrist and has not taken it off in years.",
  "{n} is patient with children, impatient with merchants and openly rude to tax collectors.",
  "{n} can mend a harness, cook a passable stew and tie a dozen kinds of knot without looking.",
  "{n} dislikes cities, crowds and anyone who talks too much before breakfast.",
  "{n} has never once been on time for the morning muster and has an excuse ready every day.",
  "{n} once spent a winter snowed into a mountain inn and still tells the story to anyone who will listen.",
  "{n} prefers to walk rather than ride, saying the wagons make them seasick.",
  "{n} keeps the company's spare lantern trimmed and filled, and takes it personally when someone borrows it.",
  "{n} would rather sleep on the ground under the stars than in the best bed of any inn.",
  "{n} keeps careful accounts of every coin borrowed from the others and repays each debt to the copper.",
  "{n} distrusts priests, fortune tellers and anyone who claims to know what tomorrow will bring.",
  "{n} is the first to volunteer for the night watch and the last to admit to being tired.",
  "{n} once worked a season on a river barge and still ties every knot the bargemen's way.",
  "{n} has an old scar across one hand and tells a different story about it every time someone asks.",
  "{n} saves the best bite of every meal for last and sulks if anyone steals it.",
  "{n} writes nothing down and remembers every promise anyone in the company has ever broken.",
  "{n} likes rain on canvas, hates rain on skin and complains equally about both.",
  "{n} keeps a battered tin cup that nobody else is allowed to drink from.",
  "{n} haggles badly and knows it, so leaves the buying to Rowan whenever possible.",
  "{n} would follow the company into any danger but grumbles every step of the way.",
  "{n} is slow to anger and slower to forgive, though it rarely comes to that.",
] as const;

const PERSONA_RUN = 34;
const PERSONA_STRIDE = 4;

const PERSONAS: readonly ItemParts[] = [
  {
    key: "Brannoc",
    opening: "Brannoc is the company's blacksmith, a gruff dwarf who mends wagons and weapons.",
    lead: "He is also the company's reader of old scripts, ciphers and inscriptions.",
    closing:
      "What almost nobody knows is that Brannoc's grandmother taught him the old Vashti cipher, and he is the only one in the company who can read Vashti carvings and inscriptions.",
  },
  {
    key: "Liesel",
    opening: "Liesel is the company's field healer, who treats every wound, fever and burn the road throws at the party.",
    lead: "She is also the one the animals trust.",
    closing: "Liesel has a gift with horses: a frightened or wounded animal goes calm under her hand within moments.",
  },
  {
    key: "Quill",
    opening: "Quill is the company's lockpick and thief, a halfling with quick hands and a quicker tongue.",
    lead: "He is quietly afraid of rivers and lakes.",
    closing: "Quill is terrified of deep water and cannot swim a single stroke, which he hides with a great deal of bluster.",
  },
  {
    key: "Maelis",
    opening: "Maelis is the company's scout, an elf who reads maps, tracks and weather on the wild roads.",
    lead: "She also keeps the old funeral music of the hill clans.",
    closing: "Maelis plays the bone flute at every funeral the company attends and knows every old dirge of the hill clans by heart.",
  },
];

/** Each persona: the role line, the shared texture under the character's name, then the trait only it holds. */
export const PERSONA_TEXTS: readonly LongItem[] = PERSONAS.map((p, i) =>
  longItem(p, texture(PERSONA_POOL, i * PERSONA_STRIDE, PERSONA_RUN).replaceAll("{n}", p.key)),
);

// ---- the databank: one reference document in chunks ----

const GAZETTEER_POOL = [
  "The Ashford valley runs north and south between two ranges of low, wooded hills.",
  "Most of the valley's folk farm barley and oats, with sheep on the higher pastures.",
  "Winters are long and wet, and the valley roads turn to mud from the first autumn storms until late spring.",
  "Market towns lie roughly a day's ride apart along the old valley road.",
  "The Duke's reeves collect the hearth tax at midsummer and the grain tax after harvest.",
  "Travellers are advised to carry their own bedding, as the roadside inns are small and often full.",
  "The local dialect drops the ends of words, and strangers are teased for speaking like clerks.",
  "Wool, cheese and barley beer are the valley's chief exports to the coastal cities.",
  "Most villages keep a common oven and a common well, and quarrels over both are frequent.",
  "The valley's lords have feuded for generations over grazing rights on the eastern ridges.",
  "Bandits are rare in the lower valley but are reported each year on the ridge roads.",
  "The old valley road was paved in the time of the first Dukes and is still sound in most places.",
  "Fairs are held at the turn of each season, with livestock auctions and wrestling matches.",
  "The people of the valley are wary of outsiders but generous to anyone who shares a meal.",
  "Mills stand on most of the larger streams, and millers are among the wealthiest folk in the valley.",
  "A traveller's best guide is a drover, since drovers know every short cut and every honest inn.",
  "The valley's shrines are small stone niches, kept with flowers and the occasional copper coin.",
  "Fog settles in the valley floor most autumn mornings and lifts only near noon.",
  "Children in the valley learn to ride before they learn to read, if they learn to read at all.",
  "Each village elects a headman at midwinter, usually whoever owns the most sheep.",
  "Wolves are seldom seen below the tree line, though shepherds still light watch fires on the high pastures.",
  "The valley's songs are slow and mournful, and most of them are about lost sheep or lost lovers.",
  "The roads are marked with tall stones every mile, carved with the distance to the Duke's seat.",
  "Coin is scarce in the hill villages, and most trade there is done in kind.",
  "The valley's main road follows the eastern bank of the water for most of its length.",
  "Inns along the road display a painted sign of a sheaf of barley to show they serve travellers.",
  "Pilgrims pass through the valley in spring on their way to the northern abbeys.",
  "The valley's cheeses are aged in caves along the western ridge and sold at the autumn fairs.",
  "Most bridges in the valley are wooden and are rebuilt every few years after the spring floods.",
  "The Duke keeps a hunting lodge in the upper valley and visits it for a month each autumn.",
  "Blacksmiths in the valley are few, and travellers with damaged wagons often wait days for repairs.",
  "The valley's horses are small and sturdy, bred for the mud rather than for speed.",
  "Shepherds drive their flocks to the high pastures in early summer and back again before the first snow.",
  "The local reckoning of distance is by the hour's walk rather than by the mile.",
  "Each market town keeps a watchman, though most of them are old men who sleep at their posts.",
  "Salt comes up the valley from the coast and is one of the costliest goods in the hill villages.",
  "Weddings in the valley last three days, and the whole village is expected to attend.",
  "The valley's maps are poor, and the best of them are kept by the Duke's surveyors.",
] as const;

const GAZETTEER_RUN = 36;
const GAZETTEER_STRIDE = 4;

const CHUNKS: readonly ItemParts[] = [
  {
    key: "ferry",
    opening: "Section four: crossings and fords of the lower valley.",
    lead: "This section covers the Ashford ferry and what it costs to cross.",
    closing: "The Ashford ferry charges a toll of two copper pieces per wheel and one per pack animal, payable to the ferryman in advance.",
  },
  {
    key: "granary",
    opening: "Section five: the towns of the middle valley.",
    lead: "This section covers Millbrook and its great granary.",
    closing: "The great granary at Millbrook burned in the year of the long frost and was rebuilt in stone by order of the Duke.",
  },
  {
    key: "market",
    opening: "Section six: trade and commerce.",
    lead: "The valley towns hold their weekly markets on the third day of each week, from first light until the noon bell.",
    closing: "Weights and measures at every market are checked by the Duke's reeve against the iron standards kept at the castle.",
  },
  {
    key: "shrine",
    opening: "Section seven: the eastern ridges.",
    lead: "This section covers the shrine of the road spirits.",
    closing: "The shrine of the road spirits lies a day's walk east of Millbrook, on a bare hilltop marked by a ring of seven stones.",
  },
  {
    key: "census",
    opening: "Section eight: the Duke's survey.",
    lead: "This section gives the valley's census figures.",
    closing: "The Duke's last census counted four hundred and twelve households in the valley and some nine thousand sheep.",
  },
];

/** The gazetteer's chunks in reading order. */
export const GAZETTEER_CHUNKS: readonly LongItem[] = CHUNKS.map((c, i) => longItem(c, texture(GAZETTEER_POOL, i * GAZETTEER_STRIDE, GAZETTEER_RUN)));

/** Portrait captions for the images lens: short by nature, so this lens only checks a sensible order. */
export const CAPTIONS = [
  { key: "brannoc", text: "A stocky dwarf with a braided red beard, hammering a glowing horseshoe at an anvil in a smoky forge." },
  { key: "liesel", text: "A young woman in a grey apron binding a soldier's arm by lantern light in a field tent." },
  { key: "quill", text: "A grinning halfling crouched by a locked door, a set of picks fanned out in one hand." },
  { key: "maelis", text: "A tall elf in a green cloak studying a map on a windswept hilltop at dusk." },
] as const;

/** The queries and the item a human would pick for each. Every deciding detail sits in the item's late closing. */
export const QUERIES = {
  recall: { text: "Do you still remember what Mira gave the river spirit so it would let us cross?", want: "crossing" },
  pick: { text: "These carvings on the vault door are in the old Vashti cipher. Can anyone here read them?", want: "Brannoc" },
  doc: { text: "How much is the toll for taking a wagon across on the Ashford ferry?", want: "ferry" },
  character: { text: "someone who can read old Vashti inscriptions", want: "Brannoc" },
  image: { text: "a dwarf blacksmith working at his forge", want: "brannoc" },
} as const;

/** The reach sweep's step, in texture sentences (about 50 tokens), from no prefix to the arc's whole texture. */
const REACH_STEP = 2;
const REACH_PREFIXES = Array.from({ length: RECAP_RUN / REACH_STEP + 1 }, (_, i) => i * REACH_STEP);

/** The reach sweep: the recall query against the crossing arc's closing placed after `n` texture sentences, beside the
 *  same prefix without the closing and the closing moved to the front. Where `with` stops beating `without`, the model
 *  has stopped using what it reads. */
export function reachSweep(): readonly { readonly n: number; readonly with: string; readonly without: string; readonly first: string }[] {
  const arc = ARC_TEXTS[0];
  if (arc === undefined) {
    return [];
  }
  const sentences = arc.needle
    .slice(0, arc.needle.indexOf(arc.closing))
    .trim()
    .split(/(?<=\.) /u);
  return REACH_PREFIXES.map((n) => {
    const prefix = sentences.slice(0, n).join(" ");
    return { n, with: `${prefix} ${arc.closing}`.trim(), without: n === 0 ? "The caravan rested." : prefix, first: `${arc.closing} ${prefix}`.trim() };
  });
}
