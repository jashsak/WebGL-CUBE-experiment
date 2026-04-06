"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { DialRoot, useDialKit, DialStore } from "dialkit";
import { motion, AnimatePresence } from "motion/react";
import "dialkit/styles.css";
import { WebGLApp } from "./webgl/WebGLApp";
import { PARTICLE_COUNT } from "./config";
import { loadGLBShape } from "./webgl/loadGLBShape";

type AudioMode = 'track' | 'live';

interface AudioDevice {
  deviceId: string;
  label: string;
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
  const gainNodeRef = useRef<GainNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const trackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>('track');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [gainValue, setGainValue] = useState(1.0);

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

      // Refresh device labels (they become available after permission grant)
      await refreshDevices();
    } catch (err) {
      console.error('Failed to start live audio:', err);
      setIsLiveActive(false);
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
      setShowDevicePicker(true);
    } else {
      stopLiveAudio();
      setAudioMode('track');
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
  const getFrequencies = useCallback(() => {
    let bassAvg = 0, midAvg = 0, trebleAvg = 0;

    const isActive = audioMode === 'live'
      ? isLiveActive
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
  }, [audioMode, isLiveActive]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (audioRef.current && audioMode === 'track') {
        initTrackAudio();
        audioRef.current.play().catch((err) => {
          console.warn("Autoplay prevented. User interaction required.", err);
        });
      }
    }, 7000);

    return () => clearTimeout(timer);
  }, [initTrackAudio, audioMode]);

  useEffect(() => {
    const handleInitAudio = () => {
      if (audioMode === 'track') initTrackAudio();
    };
    document.addEventListener('init-bunny-audio', handleInitAudio);
    return () => document.removeEventListener('init-bunny-audio', handleInitAudio);
  }, [initTrackAudio, audioMode]);

  const handleInteraction = () => {
    if (typeof (window as any).DeviceOrientationEvent !== 'undefined' && typeof (window as any).DeviceOrientationEvent.requestPermission === 'function') {
      (window as any).DeviceOrientationEvent.requestPermission().catch(console.error);
    }

    if (audioMode === 'track') {
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
        display: 'flex',
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
            onClick={() => switchMode('live')}
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
      {audioMode === 'track' && (
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
      {audioMode === 'live' && isLiveActive && (
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

      <DialRoot defaultOpen={false} />
    </div>
  );
}
