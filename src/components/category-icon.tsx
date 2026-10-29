import { BookOpen, Building2, Landmark, TrainFront } from "lucide-react";
import type { Category } from "@/lib/types";

export function CategoryIcon({ category, size = 16 }: { category: Category; size?: number }) {
  const Icon = category.icon === "building" ? Building2
    : category.icon === "train" ? TrainFront
    : category.icon === "book" ? BookOpen : Landmark;
  return <Icon size={size} />;
}
