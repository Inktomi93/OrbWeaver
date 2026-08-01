// features/regex — front door (UI-Arch §2.1). The regex slice owns the owner-global find/replace script
// library and its settings pane (D114 / SET-SEAMS §6.1 stage 5: settings owns the SHELL, not foreign
// domains). The scripts PERSIST through the `regex` UserSettings section and RUN through the @orb/kit/regex
// engine in the chat pipeline — neither makes settings or chat their reader, so the library homes here.

export { regexPane } from "./lib/regex-pane";
