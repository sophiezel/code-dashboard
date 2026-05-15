"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  Activity,
  Bell,
  Heart,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/reports", label: "报告列表", icon: FileText },
  { href: "/macro", label: "宏观评分", icon: TrendingUp },
  { href: "/sentiment", label: "市场情绪", icon: Activity },
  { href: "/signals", label: "交易信号", icon: Zap },
  { href: "/health", label: "系统健康", icon: Heart },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-900/50 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800">
        <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
          <Bell className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Hermes</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          运行中
        </div>
      </div>
    </aside>
  );
}
