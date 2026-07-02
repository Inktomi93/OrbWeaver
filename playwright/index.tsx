// Playwright CT bootstrap — loaded into the in-browser test page before every component mount.
// The ONE stylesheet import: @orb/ui's globals (tailwind + the generated @theme) so token
// utilities resolve inside component tests exactly as they will in the client.
import "./index.css";
