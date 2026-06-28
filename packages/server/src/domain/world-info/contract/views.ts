// domain/world-info/contract/views — the client read-model. The view SHAPES (`BookView` · `EntryView` ·
// `BookAttachmentView`) and the role TYPE (`WorldBookRole`) have their ONE canonical home in
// `@orb/contracts/world-info` (they cross the server↔client boundary — the client deep-imports the view
// type via tRPC inference; the role is the zod-gated axis). This file is the domain's 8-slot `views` slot:
// it RE-EXPORTS those cross-boundary type shapes so the verbs reference one name without the client having
// to reach into `@orb/server` (world-info.md Movement → these all live in contracts; `views.ts` shadows
// them). Type-only re-exports (the `noBarrelFile` rule bans a runtime barrel here — the `WORLD_BOOK_ROLES`
// const value is re-exported from the exempt front door `index.ts`, and verbs that need the value import it
// from `@orb/contracts/world-info` directly).
//
// `EntryView.metadata` is TYPED (`EntryMetadata | null`, hardened from neo's raw `unknown` — world-info.md
// invariant #5): `persistence/queries.ts` `toEntryView` parses the stored blob through `entryMetadataSchema`
// at the DB read seam (`.catch(null)` degrades a corrupt blob), so downstream consumers (the kit
// `resolveEntry*` readers, the future client preview) get the typed shape, never `unknown`.

export type {
  BookAttachmentView,
  BookView,
  EntryView,
  WorldBookRole,
} from "@orb/contracts/world-info";
