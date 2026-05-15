"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  Activity,
  Zap,
} from "lucide-react";

const tabs = [
  {
    href: "/mobile",
    label: "概览",
    icon: LayoutDashboard,
    activeIcon: LayoutDashboard,
  },
  {
    href: "/mobile/reports",
    label: "报告",
    icon: FileText,
    activeIcon: FileText,
  },
  {
    href: "/mobile/macro",
    label: "宏观",
    icon: TrendingUp,
    activeIcon: TrendingUp,
  },
  {
    href: "/mobile/sentiment",
    label: "情绪",
    icon: Activity,
    activeIcon: Activity,
  },
  {
    href: "/mobile/signals",
    label: "信号",
    icon: Zap,
    activeIcon: Zap,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/80 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/mobile"
              ? pathname === "/mobile"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 transition-all duration-200",
                isActive ? "-translate-y-0.5" : "translate-y-0"
              )}
            >
              {/* Icon container */}
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-emerald-500/10 scale-110"
                    : "scale-100"
                )}
              >
                <Icon
                  className={cn(
                    "w-[22px] h-[22px] transition-all duration-200",
                    isActive
                      ? "text-emerald-400"
                      : "text-zinc-500"
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  fill={isActive ? "currentColor" : "none"}
                  fillOpacity={isActive ? 0.15 : 0}
                />
              </div>

              {/* Label */}
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-200",
                  isActive ? "text-emerald-400" : "text-zinc-500"
                )}
              >
                {tab.label}
              </span>

              {/* Active dot indicator */}
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
