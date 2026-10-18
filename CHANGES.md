# ATLAS landing redesign: changes

## Changed files
- src/app/globals.css: added the landing layer at the end of the file (grid and aurora background, orbit rings, gradient text, animated composer border, scroll-reveal, card styles). Every animation is turned off under prefers-reduced-motion.
- src/components/layout/site-header.tsx: glass sticky header, wider container, nav links (Pipeline, Agents, Privacy, Evaluation) and a "Start research" CTA. Adds an optional `showNav` prop (default true).
- src/components/research/research-composer.tsx: changed only two classNames (glass card with a focus glow, and a hover transition on the file label). Props, state and handlers are unchanged.
- src/components/ui/button.tsx: the primary variant gets a hover glow. The API is unchanged.
- src/features/research/research-app.tsx: JSX layout only. The composing state now renders LandingHero (the composer, notice, RuntimeStatus and PrivacyNote are passed in with the same props and handlers) followed by LandingSections. The other states (preparing, researching, ready, error) render the same components in the original max-w-3xl container. The navigation is hidden outside the composing state. Hooks and session logic are untouched.

## Added files
- src/components/landing/landing-hero.tsx: the hero section. Headline is "Private research, powered locally." (the logo's own tagline), with highlight pills and the animated ATLAS logo (existing asset) in orbit rings.
- src/components/landing/landing-sections.tsx: Pipeline (6 stages), the five-agent orchestrator, Privacy, Under-the-hood specs, Evaluation (fixture results labelled as such), a CTA and a footer. Spec numbers are imported from src/config, so they stay correct if the config changes.
- src/components/landing/reveal.tsx: a small IntersectionObserver fade-in. Content stays visible without JavaScript and under reduced motion.

## Deleted files
None.

## Dependencies
No changes. No framer-motion and no 3D libraries; all motion is CSS.
