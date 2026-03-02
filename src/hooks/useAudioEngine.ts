import { useRef, useState, useCallback } from "react";
import { TRACKS, TRACK_MAP } from "../config";

export function useAudioEngine(valuesRef: React.MutableRefObject<any>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [hasStarted, setHasStarted] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const startAudio = useCallback(async () => {
    try {
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

      const url = TRACKS[TRACK_MAP[valuesRef.current.track] ?? 0];
      
      if (!audioRef.current?.src || !audioRef.current.src.includes('blob')) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            if (audioRef.current) audioRef.current.src = URL.createObjectURL(blob);
          } else {
            if (audioRef.current) audioRef.current.src = url;
          }
        } catch (err) {
          if (audioRef.current) audioRef.current.src = url;
        }
        audioRef.current?.load();
      }
      
    } catch (err) {
      console.warn("Audio Context init bypassed.");
    }
  }, [valuesRef]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && audioRef.current) {
      
      // Initialize AudioContext if not already created (critical for file uploads)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      const url = URL.createObjectURL(file);
      const wasPlaying = !audioRef.current.paused;
      audioRef.current.src = url;
      audioRef.current.load();
      
      // Auto-play the uploaded file
      audioRef.current.oncanplay = () => {
        audioRef.current?.play().catch(() => {});
        audioRef.current!.oncanplay = null;
      };
    }
  }, []);

  const getFrequencies = useCallback(() => {
    let bassAvg = 0, midAvg = 0, trebleAvg = 0;
    if (analyserRef.current && dataArrayRef.current && audioRef.current && !audioRef.current.paused) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
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

  return {
    audioRef,
    fileInputRef,
    hasStarted,
    loadingText,
    startAudio,
    handleFileUpload,
    getFrequencies
  };
}
