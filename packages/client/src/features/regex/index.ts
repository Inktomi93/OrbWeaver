// features/regex — front door (UI-Arch §2.1). The regex slice owns the owner-global find/replace script
// LIBRARY and, since the config rail's R1, contributes it to the Configuration workspace as a
// `CollectionContribution` (its settings pane retired: a script library is workspace anatomy, not a knob
// stack). The scripts PERSIST as `regex_scripts` rows and RUN through the @orb/kit/regex engine in the chat
// pipeline — neither settings nor chat makes them its reader.

export { regexCollection } from "./lib/regex-collection";
