import assert from "node:assert/strict";
import test from "node:test";

const originals = new Map();

function setGlobal(name, value) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function restoreGlobals() {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  originals.clear();
}

test("expanded palette exposes error, page, loading, and ready", async () => {
  const { sounds } = await import("../dist/index.js");
  assert.deepEqual(sounds.slice(-4), ["error", "page", "loading", "ready"]);
});

test("play waits for user activation before creating AudioContext", async (context) => {
  context.after(restoreGlobals);
  let constructions = 0;
  const userActivation = { hasBeenActive: false };

  class ThrowingContext {
    constructor() {
      constructions++;
      throw new Error("blocked");
    }
  }

  setGlobal("navigator", { userActivation });
  setGlobal("window", { AudioContext: ThrowingContext });
  const { play } = await import(`../dist/audio/engine.js?activation=${Date.now()}`);

  play("chime");
  assert.equal(constructions, 0);

  userActivation.hasBeenActive = true;
  play("chime");
  assert.equal(constructions, 1);
});

test("invalid names and AudioContext failures are silent", async (context) => {
  context.after(restoreGlobals);
  let constructions = 0;

  class ThrowingContext {
    constructor() {
      constructions++;
      throw new Error("blocked");
    }
  }

  setGlobal("window", { AudioContext: ThrowingContext });
  const { play, setEnabled } = await import(`../dist/audio/engine.js?failures=${Date.now()}`);

  assert.doesNotThrow(() => play("toString"));
  assert.equal(constructions, 0);
  setEnabled(false);
  assert.doesNotThrow(() => play("chime"));
  assert.equal(constructions, 0);
  setEnabled(true);
  assert.doesNotThrow(() => play("chime"));
  assert.equal(constructions, 1);

  let renders = 0;
  class RejectedContext {
    state = "suspended";
    resume() {
      return Promise.reject(new Error("blocked"));
    }
    createGain() {
      renders++;
    }
  }

  setGlobal("window", { AudioContext: RejectedContext });
  const rejected = await import(`../dist/audio/engine.js?rejected=${Date.now()}`);
  assert.doesNotThrow(() => rejected.play("chime"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders, 0);

  let finishResume = () => {};
  class DeferredContext {
    state = "suspended";
    destination = {};
    resume() {
      return new Promise((resolve) => {
        finishResume = () => {
          this.state = "running";
          resolve();
        };
      });
    }
    createGain() {
      renders++;
      throw new Error("rendered while disabled");
    }
  }

  setGlobal("window", { AudioContext: DeferredContext });
  const deferred = await import(`../dist/audio/engine.js?deferred=${Date.now()}`);
  deferred.play("chime");
  deferred.setEnabled(false);
  finishResume();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders, 0);

});

test("play transposes pitched layers in semitones", async (context) => {
  context.after(restoreGlobals);
  const detunes = [];

  class AudioNodeStub {
    connect(destination) {
      return destination;
    }
    disconnect() {}
  }

  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });

  class TransposeContext {
    state = "running";
    currentTime = 0;
    sampleRate = 1;
    destination = new AudioNodeStub();
    createGain() {
      return Object.assign(new AudioNodeStub(), { gain: parameter() });
    }
    createOscillator() {
      const detune = parameter();
      detunes.push(detune);
      return Object.assign(new AudioNodeStub(), {
        frequency: parameter(),
        detune,
        start() {},
        stop() {},
      });
    }
    createBiquadFilter() {
      return Object.assign(new AudioNodeStub(), { frequency: parameter(), Q: parameter() });
    }
    createDelay() {
      return Object.assign(new AudioNodeStub(), { delayTime: parameter() });
    }
  }

  setGlobal("setTimeout", () => 0);
  setGlobal("window", { AudioContext: TransposeContext });

  const { play } = await import(`../dist/audio/engine.js?transpose=${Date.now()}`);
  play("chime", { transpose: -12 });
  play("bloom", { transpose: 1 });
  play("chime", { transpose: Number.NaN });

  assert.deepEqual(
    detunes.map(({ value }) => value),
    [-1200, -1200, 100, 112, 0, 0],
  );
});

test("binding is delegated, dynamic, idempotent, and globally throttled", async (context) => {
  context.after(restoreGlobals);
  const counts = { buffers: 0, oscillators: 0 };

  class AudioNodeStub {
    connect(destination) {
      return destination;
    }
    disconnect() {}
  }

  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });

  class WorkingContext {
    state = "running";
    currentTime = 0;
    sampleRate = 1;
    destination = new AudioNodeStub();
    createGain() {
      return Object.assign(new AudioNodeStub(), { gain: parameter() });
    }
    createOscillator() {
      return Object.assign(new AudioNodeStub(), {
        frequency: parameter(),
        detune: parameter(),
        start() {
          counts.oscillators++;
        },
        stop() {},
      });
    }
    createBuffer() {
      counts.buffers++;
      return { getChannelData: () => new Float32Array(1) };
    }
    createBufferSource() {
      return Object.assign(new AudioNodeStub(), { buffer: null, start() {}, stop() {} });
    }
    createBiquadFilter() {
      return Object.assign(new AudioNodeStub(), { frequency: parameter(), Q: parameter() });
    }
    createDelay() {
      return Object.assign(new AudioNodeStub(), { delayTime: parameter() });
    }
  }

  class FakeElement {
    constructor(parent = null) {
      this.parent = parent;
      this.attributes = new Map();
      this.listeners = new Map();
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, target = this, options = {}) {
      const event = { target, relatedTarget: null, pointerType: "mouse", ...options };
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    setAttribute(name, value = "") {
      this.attributes.set(name, value);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    closest(selector) {
      const attribute = selector.slice(1, -1);
      for (let element = this; element; element = element.parent) {
        if (element.hasAttribute(attribute)) return element;
      }
      return null;
    }
    contains(candidate) {
      for (let element = candidate; element; element = element.parent) {
        if (element === this) return true;
      }
      return false;
    }
  }

  let now = 1_000;
  setGlobal("Element", FakeElement);
  setGlobal("Node", FakeElement);
  setGlobal("document", {});
  setGlobal("performance", { now: () => now });
  setGlobal("setTimeout", () => 0);
  setGlobal("window", {
    AudioContext: WorkingContext,
    matchMedia: () => ({ matches: true }),
  });

  const root = new FakeElement();
  const { bind } = await import(`../dist/interactions/bind.js?binding=${Date.now()}`);
  bind(root);
  bind(root);
  assert.equal(root.listeners.get("pointerenter").length, 1);
  assert.equal(root.listeners.get("pointerdown").length, 1);
  assert.equal(root.listeners.get("pointerup").length, 1);
  assert.equal(root.listeners.get("click").length, 1);

  const first = new FakeElement(root);
  first.setAttribute("data-cuelume-hover", "whisper");
  root.emit("pointerenter", first);
  assert.equal(counts.buffers, 1);

  const later = new FakeElement(root);
  later.setAttribute("data-cuelume-hover", "whisper");
  now += 100;
  root.emit("pointerenter", later);
  assert.equal(counts.buffers, 1);

  now += 51;
  root.emit("pointerenter", later);
  assert.equal(counts.buffers, 2);

  later.setAttribute("data-cuelume-toggle", "whisper");
  root.emit("click", later, { pointerType: undefined });
  assert.equal(counts.buffers, 3);
  later.removeAttribute("data-cuelume-toggle");
  root.emit("click", later, { pointerType: undefined });
  assert.equal(counts.buffers, 3);

  const touchTarget = new FakeElement(root);
  touchTarget.setAttribute("data-cuelume-press", "whisper");
  touchTarget.setAttribute("data-cuelume-release", "whisper");
  root.emit("pointerdown", touchTarget, { pointerType: "touch" });
  root.emit("pointerup", touchTarget, { pointerType: "touch" });
  assert.equal(counts.buffers, 5);

  const invalid = new FakeElement(root);
  invalid.setAttribute("data-cuelume-hover", "toString");
  now += 151;
  root.emit("pointerenter", invalid);
  assert.equal(counts.oscillators, 2);

  const child = new FakeElement(later);
  now += 151;
  root.emit("pointerenter", child, { relatedTarget: later });
  assert.equal(counts.buffers, 5);

});

test("finished shimmer graphs disconnect after their audible tail", async (context) => {
  context.after(restoreGlobals);
  const timers = [];
  const disconnected = [];

  class AudioNodeStub {
    constructor(name) {
      this.name = name;
    }
    connect(destination) {
      return destination;
    }
    disconnect() {
      disconnected.push(this.name);
    }
  }

  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });

  let gainCount = 0;
  class CleanupContext {
    state = "running";
    currentTime = 0;
    sampleRate = 1;
    destination = new AudioNodeStub("destination");
    createGain() {
      const names = ["master", "feedback-gain", "wet-gain", "tone-gain", "tone-gain"];
      return Object.assign(new AudioNodeStub(names[gainCount++] ?? "gain"), { gain: parameter() });
    }
    createDelay() {
      return Object.assign(new AudioNodeStub("delay"), { delayTime: parameter() });
    }
    createBiquadFilter() {
      return Object.assign(new AudioNodeStub("feedback-filter"), { frequency: parameter(), Q: parameter() });
    }
    createOscillator() {
      return Object.assign(new AudioNodeStub("oscillator"), {
        frequency: parameter(),
        detune: parameter(),
        start() {},
        stop() {},
      });
    }
  }

  setGlobal("setTimeout", (callback, delay) => {
    timers.push({ callback, delay });
    return 0;
  });
  setGlobal("window", { AudioContext: CleanupContext });

  const { play } = await import(`../dist/audio/engine.js?cleanup=${Date.now()}`);
  play("chime");

  assert.equal(timers.length, 1);
  assert.equal(Math.round(timers[0].delay), 1176);
  timers[0].callback();
  assert.deepEqual(disconnected, ["master", "delay", "feedback-filter", "feedback-gain", "wet-gain"]);

  play("chime");
  assert.equal(timers.length, 2);
});
