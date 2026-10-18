"use client";

import { useEffect, useState } from "react";
import { detectRuntimeCapabilities, runtimeStatusFromCapabilities } from "@/lib/runtime/capabilities";
import type { RuntimeState } from "@/types/runtime";

const detecting: RuntimeState = { status: "detecting" };

export function useRuntimeCapabilities(): RuntimeState {
  const [state, setState] = useState<RuntimeState>(detecting);

  useEffect(() => {
    let cancelled = false;

    detectRuntimeCapabilities()
      .then((capabilities) => {
        if (cancelled) return;
        setState({ status: runtimeStatusFromCapabilities(capabilities), capabilities });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          status: "unsupported",
          capabilities: {
            webgpu: false,
            wasm: false,
            workers: false,
            recommendedRuntime: "unsupported",
            hardwareConcurrency: null,
            deviceMemoryGb: null,
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
