// domain/regex/contract/views — re-exports the cross-boundary view shapes owned by `@orb/contracts/regex`;
// type-only (`noBarrelFile` bans a runtime barrel here). The library row IS the view: `RegexScriptRow` is
// what every reader (the chat legs, the client library surface, the pickers) consumes, and it is the shape
// `@orb/kit/regex`'s executor takes.

export type { CreateRegexScriptInput, PortableRegexScript, RegexScriptRow, UpdateRegexScriptInput } from "@orb/contracts/regex";
