import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AddressCandidate } from "@orb/kit/speaker-address";
import { addressedGroups, nameMentionsOf } from "@orb/kit/speaker-address";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const minted = new Map<string, ReturnType<typeof mintTypeId<typeof ID_PREFIX.character>>>();

function id(key: string): ReturnType<typeof mintTypeId<typeof ID_PREFIX.character>> {
  const existing = minted.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const fresh = mintTypeId(ID_PREFIX.character, ids.next);
  minted.set(key, fresh);
  return fresh;
}

function seat(key: string, name: string, eligible = true): AddressCandidate {
  return { id: id(key), name, eligible };
}

const CAST = [seat("hale", "Captain Hale"), seat("rook", "Captain Rook"), seat("will", "Will"), seat("aria", "Aria")];

function line(text: string, characterId: ReturnType<typeof id> | null = null): { text: string; characterId: ReturnType<typeof id> | null } {
  return { text, characterId };
}

function groupsOf(
  text: string,
  candidates: readonly AddressCandidate[] = CAST,
  humans: readonly string[] = ["Sam"],
  by = null as ReturnType<typeof id> | null,
): string[][] {
  return addressedGroups(line(text, by), candidates, humans).groups.map((group) =>
    group.map((member) => [...minted].find(([, value]) => value === member)?.[0] ?? "?"),
  );
}

test("a name written as a name addresses one character on its own", () => {
  expect(groupsOf("Will, come here.")).toEqual([["will"]]);
  expect(groupsOf("Captain Hale, what now?")).toEqual([["hale"]]);
});

test("a title two characters share is one ambiguous group, not a first match", () => {
  expect(groupsOf("Captain, what do we do now?")).toEqual([["hale", "rook"]]);
});

test("a name that is also an ordinary lowercase word does not address", () => {
  expect(groupsOf("we will find it together")).toEqual([]);
});

test("a lowercase word does not break a tie between characters addressed by another word", () => {
  const crew = [seat("hook", "Captain Hook"), seat("nemo", "Captain Nemo"), seat("smee", "Smee")];
  expect(groupsOf("Captain, grab the hook.", crew)).toEqual([["hook", "nemo"]]);
});

test("several names in one line are separate groups in the order they are named", () => {
  const trio = [seat("aria", "Aria"), seat("bran", "Bran"), seat("cara", "Cara")];
  expect(groupsOf("Cara and Bran, report.", trio)).toEqual([["cara"], ["bran"]]);
});

test("overlapping names compete: the most fully named character wins the group", () => {
  const knights = [seat("aria", "The Knight"), seat("bran", "The Black Knight"), seat("cara", "Cara")];
  expect(groupsOf("The Black Knight, hold the gate!", knights)).toEqual([["bran"]]);
  expect(groupsOf("Knight, hold the gate!", knights)).toEqual([["aria", "bran"]]);
});

test("a speaker naming itself is no address", () => {
  const trio = [seat("aria", "Aria"), seat("bran", "Bran"), seat("cara", "Cara")];
  expect(groupsOf("I am Aria, and I am tired.", trio, ["Sam"], id("aria"))).toEqual([]);
  expect(groupsOf("I am Aria, and I am tired.", trio)).toEqual([["aria"]]);
});

test("an ineligible character is dropped, and naming only ineligible characters addresses nobody", () => {
  const roster = [seat("aria", "Aria"), seat("bran", "Bran"), seat("cara", "Cara", false)];
  expect(groupsOf("Cara and Aria, look!", roster)).toEqual([["aria"]]);
  expect(groupsOf("Cara, look!", roster)).toEqual([]);
});

test("a name a human player shares addresses the human, while the character's whole name still addresses it", () => {
  const rooms = [seat("aria", "Rook the Bard"), seat("bran", "Bran"), seat("cara", "Cara")];
  expect(addressedGroups(line("Rook, your move."), rooms, ["Rook"])).toEqual({ groups: [], humanAmbiguous: false });
  expect(groupsOf("Rook the Bard, your move.", rooms, ["Rook"])).toEqual([["aria"]]);
});

test("a player's name written as an ordinary word is no address, and written as a name it is ambiguous", () => {
  const grace = [seat("aria", "Mara"), seat("bran", "Grace"), seat("cara", "Cara")];
  expect(addressedGroups(line("Mara, move with grace."), grace, ["Sam", "Grace"])).toEqual({ groups: [[id("aria")]], humanAmbiguous: false });
  expect(addressedGroups(line("Mara, Grace, go."), grace, ["Sam", "Grace"]).humanAmbiguous).toBe(true);
});

test("a name made only of stopwords is named by its whole phrase", () => {
  const roster = [seat("they", "The It"), seat("aria", "Aria")];
  expect(nameMentionsOf("Tell The It to wait.", roster).map((mention) => [mention.id, mention.strong])).toEqual([[id("they"), true]]);
  expect(nameMentionsOf("Tell it to wait for the end.", roster)).toEqual([]);
});

test("name mentions are ordered by where each is first named, one-letter words never name", () => {
  const roster = [seat("tpol", "T'Pol"), seat("aria", "Aria Stormborn"), seat("bran", "Bran")];
  expect(nameMentionsOf("Stormborn and Bran, I don't know.", roster).map((mention) => mention.id)).toEqual([id("aria"), id("bran")]);
});
