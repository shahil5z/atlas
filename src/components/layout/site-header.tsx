import { AtlasSymbol } from "@/components/brand/logo";

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="site-header sticky top-0 z-30 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#research" className="inline-flex items-center gap-2.5 text-foreground" aria-label="Atlas">
          <AtlasSymbol className="h-8 w-auto mix-blend-screen" />
          <span className="text-[15px] font-medium tracking-tight">Atlas</span>
        </a>
        {showNav ? (
          <a
            href="#composer"
            className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-medium text-accent-foreground transition hover:bg-white"
          >
            Start research
          </a>
        ) : null}
      </div>
    </header>
  );
}
