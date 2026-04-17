"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { DialRoot, useDialKit, DialStore } from "dialkit";
import { motion, AnimatePresence } from "motion/react";
import * as THREE from "three";
import "dialkit/styles.css";
import { WebGLApp } from "./webgl/WebGLApp";
import { PARTICLE_COUNT } from "./config";
import { loadGLBShape } from "./webgl/loadGLBShape";
import { OrbitingEggs } from "./webgl/OrbitingEggs";

type AudioMode = 'track' | 'live';

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface PresetValues {
  structure: number;
  flowSpeed: number;
  twistAmount: number;
  audioBassScale: number;
  audioTrebleScatter: number;
  audioMidGlow: number;
  particleSize: number;
  audioSmoothing: number;
  bassSizeBump: number;
  speakerConeRadius: number;
  mouseRadius: number;
  mouseForce: number;
  mouseSwirl: number;
  mouseDisruption: number;
  orbitSpeed: number;
  eggCount: number;
  orbitRadius: number;
  orbitTilt: number;
  eggScale: number;
}

interface Preset {
  name: string;
  values: PresetValues;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    name: "Preset 1",
    values: {
      structure: 1.0, flowSpeed: 0.3, twistAmount: 0.0,
      audioBassScale: 0.12, audioTrebleScatter: 0.0, audioMidGlow: 0.09,
      particleSize: 1.2, audioSmoothing: 0.06, bassSizeBump: 0.41, speakerConeRadius: 3.4,
      mouseRadius: 0.1, mouseForce: -5.0, mouseSwirl: -10.0, mouseDisruption: 0.0,
      orbitSpeed: -0.1, eggCount: 6, orbitRadius: 3.1, orbitTilt: 19, eggScale: 0.9,
    },
  },
  {
    name: "Preset 2",
    values: {
      structure: 1.0, flowSpeed: -0.3, twistAmount: 0.0,
      audioBassScale: 0.06, audioTrebleScatter: 0.04, audioMidGlow: 0.09,
      particleSize: 1.2, audioSmoothing: 0.06, bassSizeBump: 0.41, speakerConeRadius: 3.4,
      mouseRadius: 0.1, mouseForce: -5.0, mouseSwirl: -10.0, mouseDisruption: 0.0,
      orbitSpeed: -0.2, eggCount: 6, orbitRadius: 3.1, orbitTilt: 19, eggScale: 0.9,
    },
  },
];

const PRESETS_LS_KEY = "bunny-presets-v1";

const EGG_PALETTE: { name: string; color: THREE.Color }[] = [
  { name: "White",  color: new THREE.Color(1.0, 1.0, 1.0) },
  { name: "Pink",   color: new THREE.Color(1.0, 0.35, 0.75) },
  { name: "Cyan",   color: new THREE.Color(0.35, 0.9, 1.0) },
  { name: "Green",  color: new THREE.Color(0.5, 1.0, 0.5) },
  { name: "Orange", color: new THREE.Color(1.0, 0.6, 0.2) },
  { name: "Purple", color: new THREE.Color(0.75, 0.4, 1.0) },
];

function loadPresetsFromStorage(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_LS_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw) as Preset[];
    if (!Array.isArray(parsed) || parsed.length !== 2) return DEFAULT_PRESETS;
    return parsed;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export default function BunnyPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglAppRef = useRef<WebGLApp | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const values = useDialKit("Bunny Page Controls", {
    shape: { type: 'segmented', options: ['CUBE', 'SPHERE', 'PYRAMID', 'STAR', 'BUNNY'], default: 'BUNNY' },
    structure: [1.0, 0.0, 1.0, 0.01],
    flowSpeed: [0.0, -3.0, 3.0, 0.1],
    twistAmount: [0.0, -2.0, 2.0, 0.1],

    audioBassScale: [0.06, 0.0, 2.0, 0.01],
    audioTrebleScatter: [0.04, 0.0, 1.0, 0.01],
    audioMidGlow: [0.09, 0.0, 2.0, 0.01],
    particleSize: [1.2, 1.0, 10.0, 0.1],

    audioSmoothing: [0.06, 0.0, 0.99, 0.01],
    bassSizeBump: [0.41, 0.0, 2.0, 0.01],
    speakerConeRadius: [3.4, 0.1, 10.0, 0.1],

    mouseRadius: [3.0, 0.1, 5.0, 0.1],
    mouseForce: [-0.2, -5.0, 5.0, 0.1],
    mouseSwirl: [0.0, -10.0, 10.0, 0.1],
    mouseDisruption: [0.0, 0.0, 10.0, 0.1],

    orbitSpeed: [0.2, -3.0, 3.0, 0.1],
    eggCount: [6, 2, 20, 2],
    orbitRadius: [3.1, 1.0, 8.0, 0.1],
    orbitTilt: [19, -90, 90, 1],
    eggScale: [0.9, 0.1, 2.0, 0.05],

    audioProgress: [32, 0, 100, 0.1],
    reset: { type: 'action', label: '↺ Reset' }
  }, {
    onAction: (action) => {
      if (action === 'reset') {
        window.location.reload();
      }
    }
  });

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const trackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const orbitingEggsRef = useRef<OrbitingEggs | null>(null);
  const orbitRafRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>('track');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const audioModeRef = useRef<AudioMode>('track');
  const isLiveActiveRef = useRef(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [gainValue, setGainValue] = useState(1.0);

  const [uiHidden, setUiHidden] = useState(false);
  const [eggColorIndex, setEggColorIndex] = useState(0);
  const eggColorIndexRef = useRef(0);
  eggColorIndexRef.current = eggColorIndex;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const presetsRef = useRef<Preset[]>(
    typeof window !== 'undefined' ? loadPresetsFromStorage() : DEFAULT_PRESETS
  );
  const orbitingEggsReadyRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  const applyPreset = useCallback((index: number) => {
    const panels = DialStore.getPanels();
    const panel = panels.find(p => p.name === "Bunny Page Controls");
    if (!panel) return;
    const preset = presetsRef.current[index];
    if (!preset) return;
    for (const [key, value] of Object.entries(preset.values)) {
      DialStore.updateValue(panel.id, key, value);
    }
    showToast(`${preset.name} applied`);
  }, [showToast]);

  const savePreset = useCallback((index: number) => {
    const v = valuesRef.current;
    const snapshot: PresetValues = {
      structure: v.structure, flowSpeed: v.flowSpeed, twistAmount: v.twistAmount,
      audioBassScale: v.audioBassScale, audioTrebleScatter: v.audioTrebleScatter, audioMidGlow: v.audioMidGlow,
      particleSize: v.particleSize, audioSmoothing: v.audioSmoothing, bassSizeBump: v.bassSizeBump,
      speakerConeRadius: v.speakerConeRadius,
      mouseRadius: v.mouseRadius, mouseForce: v.mouseForce, mouseSwirl: v.mouseSwirl, mouseDisruption: v.mouseDisruption,
      orbitSpeed: v.orbitSpeed, eggCount: v.eggCount, orbitRadius: v.orbitRadius, orbitTilt: v.orbitTilt, eggScale: v.eggScale,
    };
    const next = [...presetsRef.current];
    next[index] = { name: `Preset ${index + 1}`, values: snapshot };
    presetsRef.current = next;
    try { localStorage.setItem(PRESETS_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    showToast(`Preset ${index + 1} saved`);
  }, [showToast]);

  const resetPresets = useCallback(() => {
    presetsRef.current = DEFAULT_PRESETS;
    try { localStorage.removeItem(PRESETS_LS_KEY); } catch { /* ignore */ }
    showToast("Presets reset to defaults");
  }, [showToast]);

  const bumpDial = useCallback((key: 'eggCount' | 'eggScale' | 'orbitTilt', direction: number) => {
    const panels = DialStore.getPanels();
    const panel = panels.find(p => p.name === "Bunny Page Controls");
    if (!panel) return;
    const bounds = {
      eggCount:  { min: 2,    max: 20,  step: 2 },
      eggScale:  { min: 0.1,  max: 2.0, step: 0.05 },
      orbitTilt: { min: -90,  max: 90,  step: 1 },
    }[key];
    const current = valuesRef.current[key] as number;
    const raw = current + direction * bounds.step;
    // Snap to step grid and clamp
    const snapped = Math.round(raw / bounds.step) * bounds.step;
    const clamped = Math.min(bounds.max, Math.max(bounds.min, snapped));
    const rounded = Math.round(clamped * 1000) / 1000;
    DialStore.updateValue(panel.id, key, rounded);
    const labelMap: Record<string, string> = {
      eggCount: 'Egg Count',
      eggScale: 'Egg Scale',
      orbitTilt: 'Orbit Tilt',
    };
    const display = key === 'eggCount' ? String(rounded) : rounded.toFixed(key === 'eggScale' ? 2 : 0);
    showToast(`${labelMap[key]}: ${display}`);
  }, [showToast]);

  // Track play/pause state for the audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    if (typeof (window as any).DeviceOrientationEvent !== 'undefined' && typeof (window as any).DeviceOrientationEvent.requestPermission === 'function') {
      (window as any).DeviceOrientationEvent.requestPermission().catch(console.error);
    }

    if (audioMode === 'live') return; // Live mode has its own toggle

    if (audioRef.current) {
      document.dispatchEvent(new CustomEvent('init-bunny-audio'));

      if (audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioMode]);

  const lastProgrammaticUpdate = useRef(0);

  const updateScrubber = useCallback(() => {
    if (audioRef.current && audioRef.current.duration) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      lastProgrammaticUpdate.current = pct;
      const panels = DialStore.getPanels();
      const panel = panels.find(p => p.name === "Bunny Page Controls");
      if (panel) {
        DialStore.updateValue(panel.id, "audioProgress", pct);
      }
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener('timeupdate', updateScrubber);
      return () => audio.removeEventListener('timeupdate', updateScrubber);
    }
  }, [updateScrubber]);

  useEffect(() => {
    if (audioMode !== 'track') return;
    if (Math.abs(values.audioProgress - lastProgrammaticUpdate.current) > 0.5) {
      if (audioRef.current && audioRef.current.duration) {
        audioRef.current.currentTime = (values.audioProgress / 100) * audioRef.current.duration;
        lastProgrammaticUpdate.current = values.audioProgress;
      }
    }
  }, [values.audioProgress, audioMode]);

  // Ensure AudioContext + AnalyserNode exist (shared by both modes)
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.gain.value = gainValue;
      // Chain: source -> gain -> analyser (no destination for live to avoid feedback)
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [gainValue]);

  // Init track mode audio (media element source)
  const initTrackAudio = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!trackSourceRef.current && audioRef.current) {
      trackSourceRef.current = ctx.createMediaElementSource(audioRef.current);
      trackSourceRef.current.connect(gainNodeRef.current!);
      gainNodeRef.current!.connect(analyserRef.current!);
      analyserRef.current!.connect(ctx.destination);
    }
  }, [ensureAudioContext]);

  // Enumerate audio input devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Input ${i + 1}`,
        }));
      setAudioDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(inputs[0].deviceId);
      }
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }, [selectedDeviceId]);

  // Start live audio input
  const startLiveAudio = useCallback(async (deviceId?: string) => {
    try {
      const ctx = ensureAudioContext();

      // Stop track playback
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }

      // Disconnect previous live source if any
      if (liveSourceRef.current) {
        liveSourceRef.current.disconnect();
        liveSourceRef.current = null;
      }
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach(t => t.stop());
        liveStreamRef.current = null;
      }

      // Disconnect analyser from destination (no speaker output in live mode)
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(ctx.destination); } catch { /* not connected */ }
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      liveStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      liveSourceRef.current = source;

      // Chain: live source -> gain -> analyser (NOT connected to destination = no feedback)
      source.connect(gainNodeRef.current!);
      gainNodeRef.current!.connect(analyserRef.current!);

      setIsLiveActive(true);
      isLiveActiveRef.current = true;
      setShowDevicePicker(false);

      // Refresh device labels (they become available after permission grant)
      await refreshDevices();
    } catch (err) {
      console.error('Failed to start live audio:', err);
      setIsLiveActive(false);
      isLiveActiveRef.current = false;
    }
  }, [ensureAudioContext, refreshDevices]);

  // Stop live audio input
  const stopLiveAudio = useCallback(() => {
    if (liveSourceRef.current) {
      liveSourceRef.current.disconnect();
      liveSourceRef.current = null;
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach(t => t.stop());
      liveStreamRef.current = null;
    }
    setIsLiveActive(false);
    isLiveActiveRef.current = false;
  }, []);

  // Switch audio mode
  const switchMode = useCallback(async (mode: AudioMode) => {
    if (mode === audioMode) return;

    if (mode === 'live') {
      // Request permission first to get device labels
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
      } catch {
        return; // User denied permission
      }
      await refreshDevices();
      setAudioMode('live');
      audioModeRef.current = 'live';
      setShowDevicePicker(true);
    } else {
      stopLiveAudio();
      setAudioMode('track');
      audioModeRef.current = 'track';
      setShowDevicePicker(false);

      // Reconnect analyser to destination for track playback
      const ctx = audioCtxRef.current;
      if (ctx && analyserRef.current) {
        try { analyserRef.current.connect(ctx.destination); } catch { /* already connected */ }
      }
    }
  }, [audioMode, refreshDevices, stopLiveAudio]);

  // Update gain when slider changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gainValue;
    }
  }, [gainValue]);

  // getFrequencies reads from the analyser — works for both track and live
  // Stable ref: no state deps so WebGL effects don't re-mount on mode switches
  const getFrequencies = useCallback(() => {
    let bassAvg = 0, midAvg = 0, trebleAvg = 0;

    const isActive = audioModeRef.current === 'live'
      ? isLiveActiveRef.current
      : (audioRef.current && !audioRef.current.paused);

    if (analyserRef.current && dataArrayRef.current && isActive) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
      let bassSum = 0, midSum = 0, trebleSum = 0;
      for (let i = 0; i < 10; i++) bassSum += dataArrayRef.current[i];
      for (let i = 10; i < 100; i++) midSum += dataArrayRef.current[i];
      for (let i = 100; i < 256; i++) trebleSum += dataArrayRef.current[i];
      bassAvg = (bassSum / 10) / 255;
      midAvg = (midSum / 90) / 255;
      trebleAvg = (trebleSum / 156) / 255;
    }
    return { bassAvg, midAvg, trebleAvg };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    webglAppRef.current = new WebGLApp(
      containerRef.current,
      valuesRef,
      getFrequencies,
      () => {}
    );

    loadGLBShape(import.meta.env.BASE_URL + 'assets/renders/neon-bunny.glb', PARTICLE_COUNT)
      .then((texture) => {
        if (webglAppRef.current) {
          webglAppRef.current.setBunnyTexture(texture);
        }
      })
      .catch((err) => {
        console.error("Failed to load bunny GLB shape:", err);
      });

    return () => {
      webglAppRef.current?.destroy();
      webglAppRef.current = null;
    };
  }, [getFrequencies]);

  // Orbiting eggs: load models, run animation loop
  useEffect(() => {
    if (!webglAppRef.current) return;

    const eggs = new OrbitingEggs(webglAppRef.current.scene);
    orbitingEggsRef.current = eggs;

    eggs.loadModels(
      import.meta.env.BASE_URL + 'assets/renders/egg-a.glb',
      import.meta.env.BASE_URL + 'assets/renders/egg-b.glb'
    ).then(() => {
      // Trigger initial build once models are loaded
      eggs.update(0, {
        speed: valuesRef.current.orbitSpeed,
        count: valuesRef.current.eggCount,
        radius: valuesRef.current.orbitRadius,
        tilt: valuesRef.current.orbitTilt,
        eggScale: valuesRef.current.eggScale,
        bass: 0, mid: 0, treble: 0,
      });
      // Apply current color (in case user already cycled before load finished)
      eggs.setColor(EGG_PALETTE[eggColorIndexRef.current].color);
      orbitingEggsReadyRef.current = true;
    }).catch((err) => {
      console.error("Failed to load egg models:", err);
    });

    let lastTime = performance.now();
    const animate = () => {
      orbitRafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const v = valuesRef.current;
      const freq = getFrequencies();
      eggs.update(dt, {
        speed: v.orbitSpeed,
        count: v.eggCount,
        radius: v.orbitRadius,
        tilt: v.orbitTilt,
        eggScale: v.eggScale,
        bass: freq.bassAvg,
        mid: freq.midAvg,
        treble: freq.trebleAvg,
      });
    };
    orbitRafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(orbitRafRef.current);
      eggs.destroy();
      orbitingEggsRef.current = null;
    };
  }, [getFrequencies]); // same dep as WebGLApp effect so they stay in sync

  useEffect(() => {
    const handleInitAudio = () => {
      if (audioModeRef.current === 'track') initTrackAudio();
    };
    document.addEventListener('init-bunny-audio', handleInitAudio);
    return () => document.removeEventListener('init-bunny-audio', handleInitAudio);
  }, [initTrackAudio]);

  const handleInteraction = () => {
    if (typeof (window as any).DeviceOrientationEvent !== 'undefined' && typeof (window as any).DeviceOrientationEvent.requestPermission === 'function') {
      (window as any).DeviceOrientationEvent.requestPermission().catch(console.error);
    }

    if (audioModeRef.current === 'track') {
      initTrackAudio();
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  // Cleanup live stream on unmount
  useEffect(() => {
    return () => {
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Apply egg color whenever index changes
  useEffect(() => {
    if (orbitingEggsRef.current) {
      orbitingEggsRef.current.setColor(EGG_PALETTE[eggColorIndex].color);
    }
  }, [eggColorIndex]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      // Shift combos: save / reset presets
      if (e.shiftKey) {
        if (e.code === 'Digit1') { savePreset(0); e.preventDefault(); return; }
        if (e.code === 'Digit2') { savePreset(1); e.preventDefault(); return; }
        if (e.code === 'Digit0') { resetPresets(); e.preventDefault(); return; }
      }

      switch (e.key) {
        case '1': applyPreset(0); break;
        case '2': applyPreset(1); break;
        case '[': bumpDial('eggCount', -1); break;
        case ']': bumpDial('eggCount', +1); break;
        case '-':
        case '_': bumpDial('eggScale', -1); break;
        case '=':
        case '+': bumpDial('eggScale', +1); break;
        case ',':
        case '<': bumpDial('orbitTilt', -1); break;
        case '.':
        case '>': bumpDial('orbitTilt', +1); break;
        case 'c':
        case 'C': {
          setEggColorIndex(i => {
            const next = (i + 1) % EGG_PALETTE.length;
            showToast(`Color: ${EGG_PALETTE[next].name}`);
            return next;
          });
          break;
        }
        case 'h':
        case 'H': {
          setUiHidden(v => {
            showToast(v ? "UI shown" : "UI hidden");
            return !v;
          });
          break;
        }
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyPreset, savePreset, resetPresets, bumpDial, showToast]);

  const pillStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: '20px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '0.5px',
  };

  const activePill: React.CSSProperties = {
    ...pillStyle,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    color: '#fff',
  };

  const inactivePill: React.CSSProperties = {
    ...pillStyle,
    backgroundColor: 'transparent',
    color: 'rgba(255, 255, 255, 0.4)',
  };

  return (
    <div
      style={{ backgroundColor: "#0a0a0a", color: "#fff", width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0, overflow: "hidden", fontFamily: "system-ui, sans-serif" }}
    >
      <audio
        id="bunny-audio"
        ref={audioRef}
        src={import.meta.env.BASE_URL + "assets/tracks/valentino-khan.mp3"}
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = (32 / 100) * e.currentTarget.duration;
        }}
        onEnded={(e) => {
          e.currentTarget.currentTime = (32 / 100) * e.currentTarget.duration;
          e.currentTarget.play().catch(console.error);
        }}
      />
      <div
        ref={containerRef}
        onClick={handleInteraction}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />

      {/* Mode toggle + controls — top center */}
      <div style={{
        position: 'absolute',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: uiHidden ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        zIndex: 50,
      }}>
        {/* Track / Live toggle */}
        <div style={{
          display: 'flex',
          gap: '4px',
          backgroundColor: 'rgba(20, 20, 20, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '24px',
          padding: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}>
          <button
            onClick={() => switchMode('track')}
            style={audioMode === 'track' ? activePill : inactivePill}
          >
            TRACK
          </button>
          <button
            onClick={() => {
              if (audioMode === 'live') {
                setShowDevicePicker(v => !v);
              } else {
                switchMode('live');
              }
            }}
            style={audioMode === 'live' ? activePill : inactivePill}
          >
            LIVE
          </button>
        </div>

        {/* Live mode controls */}
        <AnimatePresence>
          {audioMode === 'live' && showDevicePicker && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                backgroundColor: 'rgba(20, 20, 20, 0.9)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '16px',
                padding: '16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                minWidth: '240px',
              }}
            >
              {/* Device selector */}
              <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                Input Device
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  if (isLiveActive) {
                    startLiveAudio(e.target.value);
                  }
                }}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} style={{ backgroundColor: '#1a1a1a' }}>
                    {d.label}
                  </option>
                ))}
              </select>

              {/* Gain slider */}
              <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                Gain: {gainValue.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={gainValue}
                onChange={(e) => setGainValue(parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#fff',
                  cursor: 'pointer',
                }}
              />

              {/* Start / Stop button */}
              <button
                onClick={() => {
                  if (isLiveActive) {
                    stopLiveAudio();
                  } else {
                    startLiveAudio(selectedDeviceId);
                  }
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: isLiveActive ? 'rgba(255, 60, 60, 0.8)' : 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  transition: 'all 0.2s',
                }}
              >
                {isLiveActive ? 'Stop' : 'Start Listening'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Play/pause button — only shown in track mode */}
      {audioMode === 'track' && !uiHidden && (
        <button
          onClick={togglePlayPause}
          style={{
            position: 'absolute',
            bottom: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(40, 40, 40, 0.9)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(20, 20, 20, 0.85)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'translateX(-50%) scale(0.92)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'translateX(-50%) scale(1)'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: isPlaying ? '0' : '2px', transition: 'margin 0.2s ease' }}>
            <motion.path
              initial={false}
              animate={{ d: isPlaying ? "M 8 6 L 11 6 L 11 18 L 8 18 Z" : "M 8 6 L 13 9 L 13 15 L 8 18 Z" }}
              transition={{ type: "spring", visualDuration: 0.2, bounce: 0.1 }}
            />
            <motion.path
              initial={false}
              animate={{ d: isPlaying ? "M 14 6 L 17 6 L 17 18 L 14 18 Z" : "M 13 9 L 18 12 L 18 12 L 13 15 Z" }}
              transition={{ type: "spring", visualDuration: 0.2, bounce: 0.1 }}
            />
          </svg>
        </button>
      )}

      {/* Live active indicator */}
      {audioMode === 'live' && isLiveActive && !uiHidden && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            bottom: '64px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '24px',
            padding: '10px 18px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            zIndex: 50,
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ff3c3c',
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px', color: 'rgba(255,255,255,0.7)' }}>
            LIVE
          </span>
        </motion.div>
      )}

      <div style={{ display: uiHidden ? 'none' : 'block' }}>
        <DialRoot defaultOpen={false} />
      </div>

      {/* Hotkey legend — bottom-left, subtle */}
      {!uiHidden && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            fontSize: '10px',
            lineHeight: 1.6,
            letterSpacing: '0.3px',
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 40,
          }}
        >
          <div>1 / 2 &nbsp;apply preset &nbsp;·&nbsp; ⇧1 / ⇧2 save &nbsp;·&nbsp; ⇧0 reset</div>
          <div>[ ] count &nbsp;·&nbsp; - = scale &nbsp;·&nbsp; , . tilt &nbsp;·&nbsp; C color &nbsp;·&nbsp; H hide</div>
        </div>
      )}

      {/* Toast feedback for hotkey actions */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '10px 18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(20, 20, 20, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              pointerEvents: 'none',
              zIndex: 200,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
