"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { DialRoot, useDialKit, DialStore } from "dialkit";
import { motion } from "motion/react";
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
    audioTrebleScatter: [0.04, 0.0, 1.0, 0.01],
    audioMidGlow: [0.09, 0.0, 2.0, 0.01],
    particleSize: [1.0, 1.0, 10.0, 0.1],
    
    audioSmoothing: [0.06, 0.0, 0.99, 0.01],
    bassSizeBump: [0.41, 0.0, 2.0, 0.01],
    speakerConeRadius: [3.4, 0.1, 10.0, 0.1],
    
    mouseRadius: [3.0, 0.1, 5.0, 0.1],
    mouseForce: [-0.2, -5.0, 5.0, 0.1],
    mouseSwirl: [0.0, -10.0, 10.0, 0.1],
    mouseDisruption: [0.0, 0.0, 10.0, 0.1],
    
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

  const [isPlaying, setIsPlaying] = useState(false);

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
    if (audioRef.current) {
      // Trigger AudioContext initialization just in case
      document.dispatchEvent(new CustomEvent('init-mask-audio'));
      
      if (audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, []);

  const lastProgrammaticUpdate = useRef(0);

  const updateScrubber = useCallback(() => {
    if (audioRef.current && audioRef.current.duration) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      lastProgrammaticUpdate.current = pct;
      const panels = DialStore.getPanels();
      const panel = panels.find(p => p.name === "Mask Page Controls");
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

  // Handle user scrubbing
  useEffect(() => {
    if (Math.abs(values.audioProgress - lastProgrammaticUpdate.current) > 0.5) {
      if (audioRef.current && audioRef.current.duration) {
        audioRef.current.currentTime = (values.audioProgress / 100) * audioRef.current.duration;
        lastProgrammaticUpdate.current = values.audioProgress;
      }
    }
  }, [values.audioProgress]);

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
    loadGLBShape(import.meta.env.BASE_URL + 'assets/renders/ethereal-mask.glb', PARTICLE_COUNT)
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

      <DialRoot defaultOpen={false} />
    </div>
  );
}
