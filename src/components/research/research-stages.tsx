import { ActivityMeter, StepRow } from "@/components/research/activity";
import { Button } from "@/components/ui/button";

export const RESEARCH_STEPS = [
  { id: "understand", label: "Understanding the question" },
  { id: "evidence", label: "Selecting relevant evidence" },
  { id: "check", label: "Setting aside what does not answer it" },
  { id: "write", label: "Writing a direct answer" },
] as const;

export function ResearchStatus({
  title,
  description,
  context,
  steps,
  currentIndex,
  progress,
  onStop,
}: {
  title: string;
  description: string;
  context: string | null;
  steps: readonly { id: string; label: string }[];
  currentIndex: number;
  progress: number | null;
  onStop: () => void;
}) {
  return (
    <section className="atlas-enter mx-auto w-full max-w-xl" aria-labelledby="researching-heading" aria-busy="true">
      <p className="text-sm text-muted-foreground">Research</p>
      <h1 id="researching-heading" className="mt-2 font-serif text-4xl tracking-tight">
        {title}
      </h1>
      <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">{description}</p>
      {context ? <p className="mt-4 truncate text-sm text-foreground">{context}</p> : null}
      {progress !== null || title === "Preparing local AI" ? <ActivityMeter progress={progress} /> : null}
      <ol className="mt-8 space-y-3" role="status" aria-live="polite">
        {steps.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          return <StepRow key={step.id} label={step.label} state={state} />;
        })}
      </ol>
      <Button type="button" variant="secondary" className="mt-8" onClick={onStop}>
        Stop
      </Button>
    </section>
  );
}
