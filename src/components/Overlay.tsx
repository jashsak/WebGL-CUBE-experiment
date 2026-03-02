import React from "react";

interface OverlayProps {
  hasStarted: boolean;
  loadingText: string;
  onStart: () => void;
}

export function Overlay({ hasStarted, loadingText, onStart }: OverlayProps) {
  if (hasStarted) return null;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(10, 10, 10, 0.85)", backdropFilter: "blur(10px)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", zIndex: 50 }}>
      <h1 style={{ fontSize: "4rem", fontWeight: 300, letterSpacing: "0.2em", marginBottom: "1rem", color: "#fff", margin: 0 }}>V O I D</h1>
      <p style={{ color: "#aaa", marginBottom: "3rem", letterSpacing: "0.05em", marginTop: "1rem" }}>Interaction Lab Preview</p>
      {!loadingText ? (
        <button 
          onClick={onStart} 
          style={{ padding: "12px 32px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "99px", background: "transparent", color: "#fff", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.85rem", transition: "all 0.3s" }} 
          onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#000"; }} 
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#fff"; }}
        >
          Enter Experience
        </button>
      ) : (
        <p style={{ color: "#888", fontSize: "0.9rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{loadingText}</p>
      )}
    </div>
  );
}
