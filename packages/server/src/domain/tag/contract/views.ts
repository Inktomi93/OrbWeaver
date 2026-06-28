// domain/tag/contract/views — the read-models the tag verbs return. These cross the server↔client boundary
// (the library / tag-management screen / attachment UI deep-import them), so their ONE home is
// `@orb/contracts/tag` (tag.md invariant #6). This slot RE-EXPORTS — it never re-declares (a re-declaration
// would be a second home the client could disagree with; the resolve enforces single-home: `@orb/client`
// imports the view from contracts, not from server).

export type { TagUsage, TagView, TagWithUsage } from "@orb/contracts/tag";
