import type { ReactNode } from "react";
import { AtlasLogo } from "@/components/brand/logo";

const pills = ["Runs in your browser", "No account", "No API key"];

export function LandingHero({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="hero-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:pb-24 lg:pt-24">
        <div className="atlas-enter min-w-0">
          <h1 id="hero-title" className="text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.4rem]">
            <span className="sr-only">Atlas. </span>
            Private research,
            <br />
            <span className="text-gradient">powered locally.</span>
          </h1>

          <p className="mt-6 max-w-lg text-pretty text-lg leading-8 text-muted-foreground">
            Ask a question, attach a PDF, get an answer with page citations.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Highlights">
            {pills.map((pill) => (
              <li key={pill} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-foreground/80">
                {pill}
              </li>
            ))}
          </ul>

          <div id="composer" className="composer-shell mt-9 scroll-mt-24">
            {children}
          </div>
          {below}
        </div>

        <div aria-hidden="true" className="relative mx-auto hidden w-full max-w-md lg:block">
          <div className="orbit-stage relative aspect-square">
            <div className="orbit-ring orbit-ring-1" />
            <div className="orbit-ring orbit-ring-2" />
            <div className="orbit-ring orbit-ring-3" />
            <div className="hero-glow absolute inset-[18%] rounded-full" />
            <AtlasLogo priority className="logo-float absolute inset-[6%] h-auto w-[88%] mix-blend-screen" />
          </div>
        </div>
      </div>
    </section>
  );
}
