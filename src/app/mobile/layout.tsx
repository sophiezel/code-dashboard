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
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-tight">Hermes</span>
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
