type StepState = "complete" | "current" | "upcoming";

export function ActivityMeter({
  progress,
}: {
  progress: number | null;
}) {
  const known = typeof progress === "number";
  const value = known ? Math.min(100, Math.max(0, progress)) : undefined;

  return (
    <div
      className="mt-6 h-1 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={known ? `Download ${value}%` : "Working"}
    >
      <div
        className={
          known
            ? "h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            : "atlas-slide h-full w-1/3 rounded-full bg-accent"
        }
        style={known ? { width: `${value}%` } : undefined}
      />
    </div>
  );
}

export function StepRow({
  label,
  state,
}: {
  label: string;
  state: StepState;
}) {
  const mark = state === "complete" ? "✓" : state === "current" ? "●" : "○";
  return (
    <li className="flex items-center gap-3 text-sm" aria-current={state === "current" ? "step" : undefined}>
      <span
        className={
          state === "complete"
            ? "w-4 shrink-0 text-ok"
            : state === "current"
              ? "atlas-pulse w-4 shrink-0 text-accent"
              : "w-4 shrink-0 text-muted-foreground"
        }
        aria-hidden="true"
      >
        {mark}
      </span>
      <span className={state === "upcoming" ? "text-muted-foreground" : "text-foreground"}>
        {label}
        <span className="sr-only">
          {state === "complete" ? ", complete" : state === "current" ? ", in progress" : ", waiting"}
        </span>
      </span>
    </li>
  );
}
