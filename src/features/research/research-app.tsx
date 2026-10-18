"use client";

import { ResearchError } from "@/components/research/research-error";
import { ResearchProgress } from "@/components/research/research-progress";
import { ProcessingPanel } from "@/components/research/processing-panel";
import { ResearchComposer } from "@/components/research/research-composer";
import { ResearchWorkspace } from "@/components/research/research-workspace";
import { SiteHeader } from "@/components/layout/site-header";
import { RuntimeStatus } from "@/components/runtime/runtime-status";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingSections } from "@/components/landing/landing-sections";
import { SideNav } from "@/components/landing/side-nav";
import { useResearchSession } from "@/features/research/use-research-session";
import { useRuntimeCapabilities } from "@/features/runtime/use-runtime-capabilities";

export function ResearchApp() {
  const runtime = useRuntimeCapabilities();
  const research = useResearchSession();
  const { state } = research;

  return (
    <>
      <a href="#research" className="skip-link">
        Skip to research
      </a>
      <SiteHeader showNav={state.status === "composing"} />
      <main id="research" className="flex w-full flex-1 flex-col">
        {state.status === "composing" ? (
          <>
            <SideNav />
            <LandingHero
              below={
                <>
                  {state.notice ? (
                    <p className="mt-4 w-full max-w-xl text-sm text-muted-foreground" role="status">
                      {state.notice}
                    </p>
                  ) : null}
                  <div className="mt-4 w-full max-w-xl">
                    <RuntimeStatus state={runtime} />
                  </div>
                </>
              }
            >
              <ResearchComposer
                query={state.query}
                attachment={state.attachment}
                fieldError={state.fieldError}
                onQueryChange={research.setQuery}
                onFile={(file) => {
                  void research.attachFile(file);
                }}
                onClearFile={research.clearAttachment}
                onStart={() => {
                  void research.start();
                }}
              />
            </LandingHero>
            <LandingSections />
          </>
        ) : (
          <div className="atlas-enter mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-16">
        {state.status === "preparing" ? (
          <ProcessingPanel phase={state.phase} attachment={state.attachment} detail={state.detail} onStop={research.stop} />
        ) : null}

        {state.status === "researching" ? (
          <ResearchProgress
            stage={state.stage}
            modelProgress={state.modelProgress}
            document={state.document}
            attachment={state.attachment}
            onStop={research.stop}
          />
        ) : null}

        {state.status === "ready" ? <ResearchWorkspace session={state.session} onReset={research.reset} /> : null}

        {state.status === "error" ? (
          <ResearchError
            query={state.query}
            error={state.error}
            document={state.document}
            extraction={state.extraction}
            onEdit={research.edit}
            onReset={research.reset}
          />
        ) : null}
          </div>
        )}
      </main>
    </>
  );
}
