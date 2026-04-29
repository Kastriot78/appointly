import {
  HiOutlineSearch,
  HiOutlineScissors,
  HiOutlineLightningBolt,
  HiOutlineTruck,
  HiOutlineSparkles,
  HiOutlineAcademicCap,
} from "react-icons/hi";
import { TbDental } from "react-icons/tb";

export const CATEGORY_ICONS = {
  all: HiOutlineSearch,
  barber: HiOutlineScissors,
  dental: TbDental,
  fitness: HiOutlineLightningBolt,
  auto: HiOutlineTruck,
  spa: HiOutlineSparkles,
  tutoring: HiOutlineAcademicCap,
  other: HiOutlineSearch,
};

/** Labels for admin icon picker (matches backend ICON_KEYS). */
/** Optional emoji for selects / legacy UI (maps iconKey). */
export const ICON_KEY_EMOJI = {
  barber: "💇",
  dental: "🦷",
  fitness: "💪",
  auto: "🚗",
  spa: "💆",
  tutoring: "📚",
  other: "🏢",
};

export const ICON_KEY_OPTIONS = [
  { value: "barber", label: "Hair / barber" },
  { value: "dental", label: "Dental" },
  { value: "fitness", label: "Fitness / gym" },
  { value: "auto", label: "Auto / vehicle" },
  { value: "spa", label: "Spa / wellness" },
  { value: "tutoring", label: "Tutoring / education" },
  { value: "other", label: "Other" },
];

export function CategoryGlyph({
  iconKey,
  id,
  size = 18,
  className = "",
}) {
  const key = iconKey || id || "all";
  const Cmp = CATEGORY_ICONS[key] ?? HiOutlineSearch;
  return (
    <Cmp size={size} strokeWidth={1.5} className={className} aria-hidden />
  );
}
