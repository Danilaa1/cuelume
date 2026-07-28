/**
 * The audio engine — synthesizes each sound live via the Web Audio API
 * on one shared, lazily created `AudioContext`. No audio files, no
 * dependencies. Every sound carries a gentle envelope (and often a soft
 * shimmer tail) instead of a hard transient, so nothing feels harsh.
 */

import {
  RECIPES,
  isSoundName,
  type NoiseLayer,
  type Shimmer,
  type SoundName,
  type SoundRecipe,
  type ToneLayer,
} from "../sounds/recipes.js";

const SOURCE_STOP_PADDING = 0.05;
const CLEANUP_MARGIN = 0.05;
const INAUDIBLE_GAIN = 0.001;
const OUTPUT_GAIN = 4;

function renderTone(
  context: AudioContext,
  destination: AudioNode,
  layer: ToneLayer,
  startTime: number,
): void {
  const oscillator = context.createOscillator();
  oscillator.type = layer.waveform;
  oscillator.frequency.setValueAtTime(layer.frequency, startTime);
  if (layer.detune) oscillator.detune.value = layer.detune;

  if (layer.glideTo !== undefined) {
    const glideTime = layer.glideTime ?? layer.attack + layer.decay;
    oscillator.frequency.exponentialRampToValueAtTime(layer.glideTo, startTime + glideTime);
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(layer.peak, startTime + layer.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + layer.attack + layer.decay);

  oscillator.connect(gain).connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + layer.attack + layer.decay + SOURCE_STOP_PADDING);
}

function renderNoise(
  context: AudioContext,
  destination: AudioNode,
  layer: NoiseLayer,
  startTime: number,
): void {
  const duration = layer.attack + layer.decay + SOURCE_STOP_PADDING;
  const length = Math.max(1, Math.floor(duration * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = 2 * Math.random() - 1;

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = layer.filterType;
  filter.frequency.value = layer.filterFrequency;
  if (layer.filterQ !== undefined) filter.Q.value = layer.filterQ;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(layer.peak, startTime + layer.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + layer.attack + layer.decay);

  source.connect(filter).connect(gain).connect(destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

/** Wires a soft echo/shimmer send off `source`, feeding back into `destination`. */
function attachShimmer(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  shimmer: Shimmer,
): AudioNode[] {
  const delay = context.createDelay(1);
  delay.delayTime.value = shimmer.delay;

  const feedbackFilter = context.createBiquadFilter();
  feedbackFilter.type = "lowpass";
  feedbackFilter.frequency.value = shimmer.lowpass;

  const feedbackGain = context.createGain();
  feedbackGain.gain.value = shimmer.feedback;

  const wetGain = context.createGain();
  wetGain.gain.value = shimmer.wet;

  source.connect(delay);
  delay.connect(feedbackFilter);
  feedbackFilter.connect(feedbackGain);
  feedbackGain.connect(delay);
  feedbackFilter.connect(wetGain);
  wetGain.connect(destination);

  return [delay, feedbackFilter, feedbackGain, wetGain];
}

function sourceEnd(recipe: SoundRecipe): number {
  return Math.max(
    ...recipe.layers.map(
      (layer) => (layer.offset ?? 0) + layer.attack + layer.decay + SOURCE_STOP_PADDING,
    ),
  );
}

function shimmerTail(shimmer?: Shimmer): number {
  if (!shimmer || shimmer.feedback <= 0) return 0;
  if (shimmer.feedback >= 1) return shimmer.delay;

  return shimmer.delay * (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(shimmer.feedback)));
}

let sharedOutput: GainNode | null = null;

function getOutput(context: AudioContext): GainNode {
  if (sharedOutput) return sharedOutput;

  const output = context.createGain();
  output.gain.value = OUTPUT_GAIN;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;

  output.connect(limiter).connect(context.destination);
  sharedOutput = output;
  return output;
}

function renderRecipe(context: AudioContext, recipe: SoundRecipe, volume: number): void {
  const now = context.currentTime;
  const output = getOutput(context);
  const master = context.createGain();
  master.gain.value = recipe.masterGain * volume;
  master.connect(output);

  const shimmerNodes = recipe.shimmer
    ? attachShimmer(context, master, output, recipe.shimmer)
    : [];

  for (const layer of recipe.layers) {
    const startTime = now + (layer.offset ?? 0);
    if (layer.kind === "tone") renderTone(context, master, layer, startTime);
    else renderNoise(context, master, layer, startTime);
  }

  const cleanupAfterMs = (sourceEnd(recipe) + shimmerTail(recipe.shimmer) + CLEANUP_MARGIN) * 1000;
  setTimeout(() => {
    master.disconnect();
    for (const node of shimmerNodes) node.disconnect();
  }, cleanupAfterMs);
}

let sharedContext: AudioContext | null = null;
let enabled = true;
let globalVolume = 1;

function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

/** Enables or disables future playback. Preference storage stays with the app. */
export function setEnabled(value: boolean): void {
  if (typeof value === "boolean") enabled = value;
}

/** Sets the volume multiplier for future playback. Preference storage stays with the app. */
export function setVolume(value: number): void {
  globalVolume = normalizeVolume(value, globalVolume);
}

function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    return null;
  }
  return sharedContext;
}

/**
 * Plays a sound immediately. Safe to call from anywhere — lazily creates
 * the shared `AudioContext` on first use, resumes it if the browser
 * started it suspended (e.g. before any user gesture), and is a no-op
 * when Web Audio is unavailable (SSR, old browsers).
 */
export function play(sound: SoundName = "chime", options?: { volume?: number }): void {
  if (!enabled || !isSoundName(sound)) return;
  if (typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === false) return;

  const playVolume = globalVolume * normalizeVolume(options?.volume, 1);
  if (playVolume === 0) return;

  const context = getAudioContext();
  if (!context) return;

  const recipe = RECIPES[sound];
  if (context.state === "running") {
    renderRecipe(context, recipe, playVolume);
  } else {
    try {
      void context.resume().then(
        () => {
          if (enabled && context.state === "running") renderRecipe(context, recipe, playVolume);
        },
        () => {},
      );
    } catch {
      // Some browsers throw synchronously when audio is blocked.
    }
  }
}
