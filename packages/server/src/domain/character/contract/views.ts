// domain/character/contract/views — the client read-models. Both derive from CharacterCard (the one
// canonical card shape) rather than re-spelling fields. CharacterDetail is the owner read; CharacterSummary
// is the light library-list row. avatarHash is the CAS key joined from assets, null when no avatar attached.

export type { CharacterDetail, CharacterSummary, CharacterTagGroupCensus } from "@orb/contracts/character";
