/**
 * `@orb/ui/icons` — the ONE icon home (gate icons-lucide-only; UI-Arch §2). A curated lucide-react
 * re-export for the shell + primitives, plus the `<Icon>` sizing wrapper. Grow the set per
 * consumer chunk — never import `lucide-react` outside this dir (dep-cruiser ui-satellite-seals).
 */

export type { LucideIcon } from "lucide-react";
export {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Square,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
export type { IconProps } from "./icon";
export { ICON_LG, ICON_MD, ICON_SM, Icon } from "./icon";
