// plugin-icon-glyphs — the ONE map from the `icon` node's curated name tuple (#799,
// `PLUGIN_ICON_NAMES` in `@orb/contracts/plugin/ui`) to the sealed `@orb/ui` glyph it renders.
//
// IT IS THE COMPILE-TIER WALL FOR THIS AXIS. `satisfies Record<PluginIconName, LucideIcon>` makes the map
// TOTAL: a name added to the contracts tuple fails `tsc` HERE until someone picks its glyph, which is the
// same discipline `PLUGIN_ANCHOR_TIERS` and `PLUGIN_FOOTER_NODE_KIND_ALLOWED` carry one package down. The
// reverse direction is closed by the tuple itself — the zod `z.enum` refuses an off-tuple name at
// registration, so the map can never be reached with a key it has no component for.
//
// WHY THE MAP LIVES CLIENT-SIDE: `@orb/contracts` sits BELOW `@orb/ui` in the cake and cannot import a
// component, so the vocabulary (the names) and its rendering (the glyphs) are homed on the two sides of
// that line — the same split every node kind already has between its schema and its renderer.
//
// THE EXCLUSIONS ARE THE POINT, and they are argued at the tuple, not here: no chrome-identity glyph (the
// `Blocks` attribution mark, the orb-web brand), no consent/trust glyph (lock/key/shield/ban), no identity
// or host-anatomy glyph. Read that JSDoc before adding a name.

import type { PluginIconName } from "@orb/contracts/plugin";
import type { LucideIcon } from "@orb/ui/icons";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Bookmark,
  BookOpen,
  ChartColumn,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Compass,
  Crown,
  Download,
  Drama,
  ExternalLink,
  Eye,
  FileText,
  Flame,
  Gem,
  Globe,
  Hash,
  Heart,
  Images,
  Info,
  Leaf,
  Library,
  MapIcon,
  Scroll,
  Search,
  Sparkles,
  Star,
  Swords,
  Tag,
  Users,
  X,
} from "@orb/ui/icons";

/** Every `icon` node name → its sealed glyph. TOTAL by `satisfies` — a new tuple member reds `tsc` here. */
export const PLUGIN_ICON_GLYPHS = {
  star: Star,
  heart: Heart,
  flame: Flame,
  sparkles: Sparkles,
  award: Award,
  crown: Crown,
  gem: Gem,
  bookmark: Bookmark,
  download: Download,
  eye: Eye,
  clock: Clock,
  hash: Hash,
  tag: Tag,
  users: Users,
  chartColumn: ChartColumn,
  images: Images,
  fileText: FileText,
  bookOpen: BookOpen,
  scroll: Scroll,
  library: Library,
  drama: Drama,
  swords: Swords,
  leaf: Leaf,
  globe: Globe,
  compass: Compass,
  map: MapIcon,
  check: Check,
  info: Info,
  circleAlert: CircleAlert,
  alertTriangle: AlertTriangle,
  search: Search,
  externalLink: ExternalLink,
  chevronRight: ChevronRight,
  arrowLeft: ArrowLeft,
  x: X,
} as const satisfies Record<PluginIconName, LucideIcon>;
