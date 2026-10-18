"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm text-muted-foreground">Atlas</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Atlas couldn&apos;t continue</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        The page hit an unexpected error. Research in this tab was cleared. You can try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 w-fit rounded-lg bg-accent px-4 py-2 text-sm text-accent-foreground"
      >
        Try again
      </button>
    </main>
  );
}
