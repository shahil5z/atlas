"use client";

import { useEffect, useRef, useState } from "react";

const links = [
  { href: "#research", label: "Home" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#agents", label: "Agents" },
  { href: "#benchmark", label: "Benchmark" },
  { href: "#specs", label: "Specs" },
];

/**
 * Top-left navigation under the logo. Opens on hover, keyboard focus, or a tap
 * on the handle. It stays open while the pointer is over the handle or the
 * menu, with a short grace delay before closing. Escape closes it.
 */
export function SideNav() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const reveal = () => {
    cancelClose();
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 250);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Hover or focus opens the panel just before a click lands, so ignore that click.
  const toggle = () => {
    if (open && Date.now() - openedAt.current < 600) return;
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="side-nav" data-open={open ? "true" : undefined} onMouseEnter={reveal} onMouseLeave={scheduleClose}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="side-nav-handle"
        aria-expanded={open}
        aria-controls="side-nav-panel"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={toggle}
        onMouseEnter={reveal}
        onFocus={reveal}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      <nav id="side-nav-panel" aria-label="Sections" className="side-nav-panel" onFocus={reveal}>
        <div className="side-nav-card">
        <ul className="space-y-1">
          {links.map((link, index) => (
            <li key={link.href} style={{ transitionDelay: `${80 + index * 40}ms` }} className="side-nav-item">
              <a
                href={link.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <span className="font-mono text-[10px] text-[#7eb0ff]">0{index + 1}</span>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        </div>
      </nav>
    </div>
  );
}
