# Cuelume

Fourteen carefully designed interaction sounds for the web. Synthesized live with Web Audio, with no audio files and zero runtime dependencies.

Cuelume is a curated sound palette, not an audio engine. It gives buttons, links, toggles, and completed actions clear feedback without asking developers to design sounds themselves. Add an attribute, call `bind()`, done.

## Install

```sh
npm install cuelume
```

## Requirements

Cuelume is ESM-only. Use it through native `import` or an ESM-compatible bundler; CommonJS `require()` is not supported.

It targets modern browsers with ES modules and the Web Audio API. Server-side imports are safe, but sound playback only runs in the browser.

## Quick start

Add data attributes to your markup:

```html
<button data-cuelume-press data-cuelume-release>Save</button>
<a data-cuelume-hover="tick">Docs</a>
<button data-cuelume-toggle>Dark mode</button>
```

Then wire everything up once:

```ts
import { bind } from "cuelume";

bind();
```

| Attribute              | Fires on       | Default sound |
| ---------------------- | -------------- | ------------- |
| `data-cuelume-hover`   | `pointerenter` | `chime`       |
| `data-cuelume-press`   | `pointerdown`  | `press`       |
| `data-cuelume-release` | `pointerup`    | `release`     |
| `data-cuelume-toggle`  | `click`        | `toggle`      |

Leave the attribute value empty to use the default, or set it to any sound name.

Prefer code? Play sounds imperatively:

```ts
import { play } from "cuelume";

await navigator.clipboard.writeText(text);
play("success");
```

Need a sound preference? Your app owns the setting; Cuelume only applies it:

```ts
import { setEnabled } from "cuelume";

setEnabled(false); // future play attempts become no-ops
setEnabled(true);  // enable playback again
```

Cuelume starts enabled and does not read or write storage.

## Sounds

| Name      | Character                    | Suggested use                    |
| --------- | ---------------------------- | -------------------------------- |
| `chime`   | Soft two-note ascending bell | Default hover                    |
| `sparkle` | Quick four-note twinkle      | Playful accents                  |
| `droplet` | Single note gliding down     | Dismiss, collapse                |
| `bloom`   | Warm slow swell              | Reveal, expand                   |
| `whisper` | Breathy quiet swell          | Dense lists                      |
| `tick`    | Crisp instant tick           | Nav and menu hover               |
| `press`   | Dull muted knock             | Pointer down                     |
| `release` | Brighter springy tick        | Pointer up                       |
| `toggle`  | Mechanical click-clack       | Switches, tabs                   |
| `success` | Warm three-note confirmation | After an action succeeds (e.g. copy to clipboard) |
| `error`   | Soft knock and descending refusal | Recoverable errors          |
| `page`    | Papery flick with a glass tick | Pages, galleries, carousels    |
| `loading` | Brief unresolved rising shimmer | User-initiated work starting  |
| `ready`   | Focus tick with a harmonic bloom | Image or content loaded       |

## API

```ts
import { play, bind, setEnabled, sounds, type SoundName } from "cuelume";
```

- **`play(name?: SoundName)`** — play a sound immediately. Defaults to `"chime"`.
- **`bind(root?: ParentNode)`** — delegate all `data-cuelume-*` interactions under `root` (defaults to the whole document). Idempotent and handles elements added later.
- **`setEnabled(enabled: boolean)`** — enable or disable future playback. Does not persist the preference or stop sounds already playing.
- **`sounds`** — the list of all sound names.
- **`SoundName`** — union type of the fourteen sound names.

## Defaults that behave

- **Pointer-aware.** Hover, press, and release require a fine mouse pointer. Toggle follows native click activation, including keyboard and touch.
- **Hover repeat guard.** Hover sounds are globally throttled to one every 150ms, so sweeping across a menu stays quiet.
- **No phantom hovers.** After a mouse press or a scroll, hover stays disarmed until the pointer genuinely moves — SPA navigations and scrolling that swap the DOM under a stationary cursor don't chirp.
- **One lazy `AudioContext`.** Shared across all sounds, created on first use.
- **Autoplay-friendly.** Attempts to resume suspended audio without surfacing errors when a browser blocks it.
- **SSR-safe.** Importing on the server is a no-op.
- **Safe fallback.** Invalid runtime names and unavailable or blocked Web Audio make `play()` a silent no-op.
- **Dynamic, idempotent binding.** `bind()` never double-attaches listeners, and later DOM additions, removals, and clones work automatically.

## Frameworks

Cuelume works anywhere HTML does — plain pages, Astro, React, Vue. Call `bind()` once after the DOM is ready. Delegated listeners keep working when components or routes replace descendants.

React:

```tsx
useEffect(() => {
  bind();
}, []);
```

Astro (with view transitions):

```js
import { bind } from "cuelume";

bind();
```

## License

MIT
