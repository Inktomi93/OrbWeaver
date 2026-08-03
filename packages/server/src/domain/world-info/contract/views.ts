// domain/world-info/contract/views — re-exports the cross-boundary view shapes owned by
// `@orb/contracts/world-info`; type-only (`noBarrelFile` bans a runtime barrel here).

export type {
  BookAttachmentView,
  BookUsage,
  BookView,
  BookWithUsage,
  EntryView,
  WorldBookRole,
} from "@orb/contracts/world-info";
