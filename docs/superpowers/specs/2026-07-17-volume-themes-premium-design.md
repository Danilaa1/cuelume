# Cuelume: Volume, Themes, and Premium Kits — Design

**Date:** 2026-07-17 · **Status:** Draft for review · **Target:** cuelume v0.2 → v0.4

## North star

Cuelume is a curated sound palette, not an audio engine. Every decision below
obeys one policy line:

> Users choose **what** plays, **how loud**, and **in which material** —
> Cuelume alone decides how it sounds.

Requests that cross that line (envelopes, frequencies, custom synthesis
parameters) are out of scope permanently, not just for now.

## Goals

1. Let apps control loudness (global + per-call) without breaking curation.
2. Answer "more sounds / variations" with a **theme axis**: the same 14
   semantic cues rendered in different materials, at Apple-grade quality.
3. Open a path to revenue via **custom brand kits** without paywalling the
   core library.

## Non-goals

- No per-sound persistent gain settings (that's a mixer).
- No public synthesis parameters of any kind.
- No growth of the flat sound list beyond the 14 semantics. New moments that
  genuinely aren't covered (rare) get a semantic name and must exist in
  *every* theme.
- No paid tier of the core library. MIT core stays complete and free.

---

## Phase 1 — Volume (v0.2.0, non-breaking)

### API

```ts
setVolume(0.7);                    // global multiplier, clamped to [0, 1]
play("success", { volume: 0.4 });  // one-off multiplier for this play only
```

- `setVolume(v: number)` — sibling of `setEnabled`. Non-finite input ignored,
  out-of-range clamped. Default `1`. Not persisted (app owns the setting,
  same policy as `setEnabled`).
- `play(name?: SoundName, options?: { volume?: number })` — options object so
  the signature never breaks again. Per-call volume is also a `[0, 1]`
  multiplier.

### Implementation shape

One change in the engine: `renderRecipe` sets
`master.gain.value = recipe.masterGain * globalVolume * (options.volume ?? 1)`.
Relative loudness between the 14 sounds is calibrated in the recipes and is
**never** exposed — global and per-call volume scale the whole palette
proportionally, so the curation survives at any level.

Declarative usage inherits the global volume automatically since `bind()`
routes through `play()`. No `data-cuelume-volume` attribute in v0.2 —
add only if real demand appears.

### Tests

- Clamping and ignore-garbage behavior of `setVolume`.
- `play` options object accepted and defaulted; old call sites unchanged.

---

## Phase 2 — Themes (v0.3.0, non-breaking)

### Concept

A **theme** is a complete alternative rendering of the same 14 semantic cues:
`Record<SoundName, SoundRecipe>`. Semantic names stay stable — `success`
always means "action succeeded" — the *material* changes. This gives users
"14 × N sounds" while the API surface stays 14 words.

Since recipes are plain data (~0.5–1 kB each set, gzipped), themes are nearly
free in bundle size. This is the moat: file-based sound packs can't ship
materials for free.

### API

```ts
setTheme("glass");                    // built-in theme, by name
play("toggle", { theme: "mech" });    // one-off override
setTheme(myBrandKit);                 // any Record<SoundName, SoundRecipe> — see Phase 3
setTheme("default");                  // back to the shipped palette
```

- Built-in themes are string-named and bundled (keeps the one-liner brand).
- `setTheme` also accepts a full theme object — this is deliberately the same
  mechanism custom kits use.
- Unknown theme names are a silent no-op (consistent with `play`'s fallback
  philosophy).
- New exports: `themes` (list of built-in names), `type ThemeName`,
  `type Theme` (the record type). `SoundRecipe` becomes a public type but its
  *fields* stay undocumented-as-API: the type exists so kits can be typed,
  not to invite tuning.

### Launch themes

Ship exactly **two** new themes, immaculately, rather than five roughly:

| Theme     | Material story                                                  |
| --------- | --------------------------------------------------------------- |
| `default` | The current palette — warm, glassy-organic (unchanged).         |
| `glass`   | Crystalline: shorter attacks, brighter partials, tighter shimmer. Apple-adjacent. |
| `mech`    | Mechanical-tactile: filtered noise knocks, key-switch character, near-zero shimmer. |

### The Apple-grade quality bar

A theme ships only when it passes all of these, checked per sound and as a set:

1. **Complete** — all 14 semantics present; press/release and loading/ready
   remain audibly paired.
2. **Level-matched** — perceived loudness consistent within the theme *and*
   with `default`, so `setTheme` never changes how loud an app feels.
3. **Cadence-proof** — hover sounds pleasant at the 150 ms throttle rate;
   toggles pleasant when spammed.
4. **Hardware-proof** — auditioned on laptop speakers, iPhone speaker, and
   earbuds; no harsh transients, no inaudible-on-phone sounds.
5. **Distinct at low volume** — every cue identifiable at `setVolume(0.3)`.
6. **In character** — a blind A/B against `default` should read as a material
   change, not a different product.

The checklist lives in the repo (`docs/theme-quality-bar.md`) and every new
theme PR links a filled copy.

### Site updates (cuelume-site)

- Theme switcher pill row above the sound palette — the launch showpiece:
  hear the same UI flip materials with one click.
- The scope readout gains the theme name.
- `agents.md` and README document `setVolume`/`setTheme` when each ships.

---

## Phase 3 — Premium custom kits (business, after v0.3 proves demand)

Not a code phase — Phase 2 already built the mechanism (`setTheme(object)`).
This phase is productizing it:

- **Offering:** a signature sound kit designed for a client's brand —
  their 14 semantics in their material. Delivered as a small private package
  or a single typed `Theme` object they own outright.
- **Why it works:** sonic branding is bought by exactly the audience the free
  library attracts, and delivery is zero-marginal-cost data.
- **Pricing/positioning:** decided later, once inbound interest exists.
  Candidate anchors: fixed-price kit + optional retainer for revisions.
- **Explicitly rejected:** paid npm packages / license keys for themes.
  High friction, kills adoption momentum, invites piracy-policing work.

The only Phase-3 artifact in the repo is a one-paragraph "Custom kits" note in
the README and site footer once Phase 2 ships, pointing at an email/form.

---

## Rollout

| Step | Ships                                    | Version |
| ---- | ---------------------------------------- | ------- |
| 1    | `setVolume` + `play(name, { volume })`   | 0.2.0   |
| 2    | Theme engine + `glass` + `mech` + site switcher | 0.3.0   |
| 3    | Launch push (demo video, posts) around the theme story | —  |
| 4    | Custom kits note + inbound funnel        | —       |

Each step is independently shippable; nothing in 1 depends on 2.

## Risks

- **Theme quality is the whole bet.** A mediocre `glass` theme damages the
  brand more than no theme. Mitigation: the quality bar above, and shipping
  two themes instead of five.
- **Scope creep toward an engine.** Mitigation: the policy line, and
  `SoundRecipe` internals staying documented as "not API".
- **`setTheme(object)` invites recipe fiddling.** Accepted: those users are
  future custom-kit customers, not a support burden — the docs frame the type
  as "for kits", nothing more.
