import { BottomNav } from "@/components/mobile/bottom-nav";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Status bar spacer + header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="flex items-center justify-between h-12 px-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
          </div>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "short" })}
          </span>
        </div>
      </header>

      {/* Content area */}
      <main className="pb-20 px-4 pt-3 max-w-lg mx-auto min-h-screen">
        {children}
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </>
  );
}
