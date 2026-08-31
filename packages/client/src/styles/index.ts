// The production CSS front door. Import order is load-bearing: shell structure first, then the client
// sheet whose first CSS import expands @orb/ui's Tailwind/theme/tiers stack before client-wide rules.
// Both the production boot and Playwright CT import this module, so the topology cannot drift by roster.
import "../features/app-shell/surfaces/shell.css";
import "./globals.css";
