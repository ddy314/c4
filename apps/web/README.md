# C4 web experience

An English, static React website with an interactive simulation of C4 decisions. No agent commands, network sends, or paid model calls execute in the browser.

## Development

From the repository root, with Node.js 20.19+ (Vite's minimum) or a current supported Node release:

```sh
npm ci
npm run web:dev
# Choose a port:
npm run web:dev -- --port 4173
```

## Published website

The public experience is at **https://ddy314.github.io/c4/**. `.github/workflows/pages.yml` builds and deploys the static output on pushes to `main` or manual dispatch. The build needs no API keys. GitHub Pages uses the Actions publishing source.

The generated logo is stored in `assets/brand/c4-logo.png` with an identical browser copy in `public/brand/c4-logo.png`. Brand provenance and the generation prompt are kept in `assets/brand/README.md`.

## Production

```sh
npm run web:build
npm run web:preview -- --port 4173
```

Deploy `apps/web/dist` to any static host. The Vite base is relative, so root and subdirectory deployments both work. There are no backend routes or deployment secrets. Production builds include locally hosted fonts. Set the static host's install command to `npm ci`, build command to `npm run web:build`, and output directory to `apps/web/dist`. Do not deploy the repository root.

Share a scenario using `?scenario=crossing&mode=c4#demo`. Scenarios are `crossing`, `egress`, `projection`, and `ordinary`. Valid modes appear in the UI; invalid modes fall back to that scenario's default. Sharing preserves scenario and mode, not decisions made during the current session.

## Evidence and simulation

`scripts/export-data.mjs` runs before development, builds, and tests. It extracts only selected fixtures and public benchmark fields into the ignored `src/generated/evidence.json`. Sources are the committed Flow fixtures and all 42 Flow regression sequences, the 54 Pi projection episodes, 72 isolated tool-world episodes, all 15 methods in `benchmarks/metrics.json`, and the projection extractor. The terminal also links to the controlled loopback effect test. The export records the source commit for source links. No `.runs`, credentials, raw private agent traces, or environment values enter the frontend bundle.

The terminal is a deterministic scripted state machine. Review pauses playback, rejection ends the scenario, and each approval applies to one action. Reconstructed intermediate events use `demo-` references, never claimed audit hashes. Recorded episode metrics are independent of playback speed. Fact Projection's a02 outcome was chosen because the recorded projection arm actually quarantined and projected that result.

`src/demo/engine.ts` owns transitions. `src/demo/scenarios.ts` owns narratives and modes. Components use these states for terminal events, evidence inspection, and review controls. The command input supports `help`, `run`, `next`, `reset`, and `inspect <step>`.

## Interactive evidence

`BenchmarkExplorer` switches between cost/accuracy and latency/accuracy scatterplots, attack-detection bars, and a six-category matrix. Every method can be inspected; cohort filters retain C4. Local rules have no API latency and are omitted only from the scatterplots. Costs use a labeled log axis. Hard-benign false alarms keep their own valid denominator and are excluded from balanced accuracy. The measured C4 candidate policy is explicitly distinguished from the shipped balanced default.

`StudyExplorer` switches among the real Pi host, synthetic Flow regression, and isolated tool-world snapshots. Case selection exposes paired outcomes and reported measurements without running an evaluation. `BoundaryStack` provides four sticky, shrinking layers; its controls change illustrative gate states. `CharacterStream` follows terminal decisions and decorates each boundary, stopping offscreen and under reduced motion. These characters do not represent measured throughput.

The embedded terminal workspace is 690px on desktop (740px on large displays), with a separate fullscreen flex layout. Narrow screens retain internal panel scrolling. Short viewports and reduced-motion preferences use normal-flow mechanism cards to keep content accessible.

## Validation

```sh
npm run web:test
npm run web:build
```

Manually check at 1440px, 1024px, and 390px: read approval followed by upload denial; denied first read; hard block with no approval path; mode changes during playback; full-screen open/close with preserved state and restored focus; all episode groups; eligible/ineligible projection; all integration tabs; keyboard and reduced-motion behavior. Canvas stops when hidden or offscreen, caps device pixel ratio, and uses a static frame for reduced motion.

Technology: React, TypeScript, Vite, Tailwind CSS, Motion, Radix primitives, Canvas 2D, SVG. Instrument Serif, Inter, and IBM Plex Mono are supplied locally by Fontsource with their licenses included in `public/licenses` and the production output. Existing backend scripts and integration bundles are independent of this app.
