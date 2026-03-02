import React, { useState, useCallback } from "react";

export function ExportFooter({ getCode }: { getCode: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(getCode()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getCode]);

  return (
    <div style={{ position: "fixed", bottom: 12, right: 12, width: 280, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "rgba(30, 30, 30, 0.98)", backdropFilter: "blur(12px)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>Export Code</span>
        <button onClick={handleCopy} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: copied ? "#4ade80" : "rgba(255,255,255,0.45)", border: `1px solid ${copied ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)"}`, borderRadius: 5, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a href="https://www.linkedin.com/in/jashsak/" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textDecoration: "none", letterSpacing: "0.03em", transition: "color 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; (e.currentTarget.querySelector("span") as HTMLElement).style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; (e.currentTarget.querySelector("span") as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}>
        Built by <span style={{ transition: "color 0.2s" }}>Jo Ash Sakula</span>
      </a>
    </div>
  );
}
