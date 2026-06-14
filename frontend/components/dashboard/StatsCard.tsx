import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  } | null;
  color: "blue" | "green" | "purple" | "orange";
}

const iconPills: Record<StatsCardProps["color"], string> = {
  blue: "bg-sky-500/15 text-sky-200 border border-sky-400/30",
  green: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30",
  purple: "bg-violet-500/15 text-violet-200 border border-violet-400/30",
  orange: "bg-amber-500/15 text-amber-100 border border-amber-400/30",
};

export default function StatsCard({ title, value, icon: Icon, trend, color }: StatsCardProps) {
  return (
    <div className="rounded-[28px] border border-white/5 bg-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">{title}</p>
          <p className="mt-3 text-3xl font-light text-white">{value}</p>
          {trend && (
            <p
              className={cn(
                "text-xs font-medium mt-1",
                trend.isPositive ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {trend.value}
            </p>
          )}
        </div>
        <span className={cn("rounded-2xl p-3", iconPills[color])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}
