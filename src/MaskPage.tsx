"use client";

import { useRef, useEffect, useCallback } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";
import { WebGLApp } from "./webgl/WebGLApp";
import { PARTICLE_COUNT } from "./config";
import { loadGLBShape } from "./webgl/loadGLBShape";

// MaskPage uses DialKit controls directly

export default function MaskPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglAppRef = useRef<WebGLApp | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const values = useDialKit("Mask Page Controls", {
    shape: { type: 'segmented', options: ['CUBE', 'SPHERE', 'PYRAMID', 'STAR', 'MASK'], default: 'MASK' },
    structure: [1.0, 0.0, 1.0, 0.01],
    flowSpeed: [0.0, -3.0, 3.0, 0.1],
    twistAmount: [0.0, -2.0, 2.0, 0.1],
    
    audioBassScale: [0.06, 0.0, 2.0, 0.01],
    audioTrebleScatter: [0.0, 0.0, 1.0, 0.01],
    audioMidGlow: [0.08, 0.0, 2.0, 0.01],
    particleSize: [1.0, 1.0, 10.0, 0.1],
    
    audioSmoothing: [0.52, 0.0, 0.99, 0.01],
    bassSizeBump: [0.41, 0.0, 2.0, 0.01],
    speakerConeRadius: [3.4, 0.1, 10.0, 0.1],
    
    mouseRadius: [3.0, 0.1, 5.0, 0.1],
    mouseForce: [-0.2, -5.0, 5.0, 0.1],
    mouseSwirl: [0.0, -10.0, 10.0, 0.1],
    mouseDisruption: [0.0, 0.0, 10.0, 0.1],
    
    playPause: { type: 'action', label: '▶ Play / Pause' },
    reset: { type: 'action', label: '↺ Reset' }
  }, {
    onAction: (action) => {
      if (action === 'playPause') {
        const audio = document.getElementById('mask-audio') as HTMLAudioElement;
        if (audio) {
          // Trigger the local event to initialize AudioContext
          document.dispatchEvent(new CustomEvent('init-mask-audio'));
          if (audio.paused) {
            audio.play().catch((err) => console.error("Play failed:", err));
          } else {
            audio.pause();
          }
        }
      }
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

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current && audioRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const getFrequencies = useCallback(() => {
    let bassAvg = 0, midAvg = 0, trebleAvg = 0;
    if (analyserRef.current && dataArrayRef.current && audioRef.current && !audioRef.current.paused) {
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
    
    // Instantiate core wrapper
    webglAppRef.current = new WebGLApp(
      containerRef.current,
      valuesRef,
      getFrequencies,
      () => {} // No track changes on this page
    );

    // Load the GLB shape
    loadGLBShape('/assets/renders/Ethereal Mask.glb', PARTICLE_COUNT)
      .then((texture) => {
        if (webglAppRef.current) {
          webglAppRef.current.setMaskTexture(texture);
        }
      })
      .catch((err) => {
        console.error("Failed to load GLB shape:", err);
      });

    return () => {
      webglAppRef.current?.destroy();
      webglAppRef.current = null;
    };
  }, [getFrequencies]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (audioRef.current) {
        initAudio();
        audioRef.current.play().catch((err) => {
          console.warn("Autoplay prevented. User interaction required.", err);
        });
      }
    }, 7000);

    return () => clearTimeout(timer);
  }, [initAudio]);

  useEffect(() => {
    const handleInitAudio = () => {
      initAudio();
    };
    document.addEventListener('init-mask-audio', handleInitAudio);
    return () => document.removeEventListener('init-mask-audio', handleInitAudio);
  }, [initAudio]);

  // Fallback for autoplay block
  const handleInteraction = () => {
    initAudio();
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    }
  };

  return (
    <div 
      style={{ backgroundColor: "#0a0a0a", color: "#fff", width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0, overflow: "hidden", fontFamily: "system-ui, sans-serif" }}
    >
      <audio 
        id="mask-audio"
        ref={audioRef} 
        src="/assets/tracks/Valentino Khan - Deep Down Low (Official Music Video).mp3" 
        crossOrigin="anonymous" 
        loop 
      />
      <div 
        ref={containerRef} 
        onClick={handleInteraction}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} 
      />
      <DialRoot />
    </div>
  );
}
