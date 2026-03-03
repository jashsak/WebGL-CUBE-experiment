"use client";

import { useRef, useEffect, useCallback } from "react";
import { DialRoot, useDialKit, DialStore } from "dialkit";
import "dialkit/styles.css";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { WebGLApp } from "./webgl/WebGLApp";
import { ExportFooter } from "./components/ExportFooter";
import { TRACK_MAP, TRACKS } from "./config";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglAppRef = useRef<WebGLApp | null>(null);

  // 1. DialKit Tunable Parameters
  const values = useDialKit("V O I D Controls", {
    shape: { type: 'segmented', options: ['CUBE', 'SPHERE', 'PYRAMID', 'STAR'], default: 'CUBE' },
    structure: [1.0, 0.0, 1.0, 0.01],
    flowSpeed: [0.5, -3.0, 3.0, 0.1],
    twistAmount: [0.0, -2.0, 2.0, 0.1],

    track: { type: 'segmented', options: ['Cinematic', 'Synthwave', 'Deep House', 'Deep Down Low'], default: 'Synthwave' },
    uploadMp3: { type: 'action', label: 'Upload Local MP3' },
    audioProgress: [0, 0, 100, 0.1],
    playPause: { type: 'action', label: '▶ Play / Pause' },
    audioSmoothing: [0.52, 0.0, 0.99, 0.01],
    audioBassScale: [0.06, 0.0, 2.0, 0.01],
    audioTrebleScatter: [0.0, 0.0, 1.0, 0.01],
    audioMidGlow: [0.08, 0.0, 2.0, 0.01],
    particleSize: [1.0, 1.0, 10.0, 0.1],

    bassSizeBump: [0.41, 0.0, 2.0, 0.01],
    speakerConeRadius: [3.4, 0.1, 10.0, 0.1],

    mouseRadius: [3.0, 0.1, 5.0, 0.1],
    mouseForce: [-0.2, -5.0, 5.0, 0.1],
    mouseSwirl: [0.0, -10.0, 10.0, 0.1],
    mouseDisruption: [0.0, 0.0, 10.0, 0.1],

    // Actions
    reset: { type: 'action', label: '↺ Reset' }
  }, {
    onAction: (action) => {
      if (action === 'playPause') {
        const audio = document.querySelector('audio');
        if (audio) {
          const startEvent = new CustomEvent('init-audio');
          document.dispatchEvent(startEvent);
          if (audio.paused) {
            audio.play();
          } else {
            audio.pause();
          }
        }
      }
      if (action === 'uploadMp3') {
        document.querySelector<HTMLInputElement>('input[type="file"]')?.dispatchEvent(new MouseEvent('click'));
      }
      if (action === 'reset') {
        window.location.reload();
      }
    }
  });

  const valuesRef = useRef(values);
  valuesRef.current = values;

  // 2. Audio Engine
  const {
    audioRef,
    fileInputRef,
    handleFileUpload,
    getFrequencies,
    startAudio
  } = useAudioEngine(valuesRef);

  const lastProgrammaticUpdate = useRef(0);

  const updateScrubber = useCallback(() => {
    if (audioRef.current && audioRef.current.duration) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      lastProgrammaticUpdate.current = pct;
      const panels = DialStore.getPanels();
      const panel = panels.find(p => p.name === "V O I D Controls");
      if (panel) {
        DialStore.updateValue(panel.id, "audioProgress", pct);
      }
    }
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener('timeupdate', updateScrubber);
      return () => audio.removeEventListener('timeupdate', updateScrubber);
    }
  }, [updateScrubber, audioRef]);

  // Handle user scrubbing
  useEffect(() => {
    if (Math.abs(values.audioProgress - lastProgrammaticUpdate.current) > 0.5) {
      if (audioRef.current && audioRef.current.duration) {
        audioRef.current.currentTime = (values.audioProgress / 100) * audioRef.current.duration;
        lastProgrammaticUpdate.current = values.audioProgress;
      }
    }
  }, [values.audioProgress, audioRef]);

  useEffect(() => {
    const handleInitAudio = () => {
      startAudio();
    };
    document.addEventListener('init-audio', handleInitAudio);
    return () => document.removeEventListener('init-audio', handleInitAudio);
  }, [startAudio]);

  // 3. WebGL Engine Mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Instantiate core wrapper, keeping it out of React state.
    webglAppRef.current = new WebGLApp(
      containerRef.current,
      valuesRef,
      getFrequencies,
      (trackName) => {
        // Track change callback
        if (webglAppRef.current) {
          const currentIdx = webglAppRef.current.currentTrackIdx ?? 0;
          const targetTrack = TRACK_MAP[trackName] ?? 0;
          if (targetTrack !== currentIdx && audioRef.current) {
            webglAppRef.current.currentTrackIdx = targetTrack;
            const wasPlaying = !audioRef.current.paused;
            audioRef.current.src = TRACKS[targetTrack];

            // Dispatch event to ensure AudioContext is connected
            document.dispatchEvent(new CustomEvent('init-audio'));

            if (wasPlaying) audioRef.current.play().catch(() => { });
          }
        }
      }
    );

    return () => {
      webglAppRef.current?.destroy();
      webglAppRef.current = null;
    };
  }, [valuesRef, getFrequencies, audioRef]);

  const getCode = useCallback(() => {
    const v = valuesRef.current;
    return `Build a WebGL Audio Particle Visualizer component (React/Next.js) using FBO/GPGPU Physics.

ARCHITECTURE:
Modularly separated into App.tsx, WebGLApp class, GPGPUManager class, AudioEngine hook, and UI components. Uses GPUComputationRenderer to simulate velocity, momentum, and friction for 150,000 points dynamically mapped to geometry textures.

TUNED PARAMETERS:
- shape: ${v.shape}
- structure: ${v.structure}
- flowSpeed: ${v.flowSpeed}
- twistAmount: ${v.twistAmount}`;
  }, []);

  return (
    <div style={{ backgroundColor: "#0a0a0a", color: "#fff", width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0, overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      <audio ref={audioRef} crossOrigin="anonymous" loop />
      <input type="file" ref={fileInputRef} accept="audio/*" style={{ display: 'none' }} onChange={handleFileUpload} />

      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      <DialRoot />
      <ExportFooter getCode={getCode} />
    </div>
  );
}
