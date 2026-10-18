import type { RuntimeState } from "@/types/runtime";

export function RuntimeStatus({ state }: { state: RuntimeState }) {
  if (state.status !== "unsupported") return null;

  return (
    <p className="max-w-xl text-sm leading-6 text-foreground" role="status" aria-live="polite">
      Atlas could not initialize local AI on this browser. Try a browser or device with WebGPU support.
    </p>
  );
}
