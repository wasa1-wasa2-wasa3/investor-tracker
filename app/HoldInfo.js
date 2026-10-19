"use client";
import { useState } from "react";
import { hasYutai as isYutai } from "../lib/fit";

// 各行の「長く持てるか」：配当利回り・優待
export default function HoldInfo({ quote, yutai }) {
  const [open, setOpen] = useState(false);
  const y = quote?.yieldPct;
  const yieldText = quote == null ? "…" : y == null ? "—" : y === 0 ? "無配" : `${y.toFixed(2)}%`;
  const high = y != null && y >= 3;
  const hasYutai = isYutai(yutai);

  return (
    <div className="hold">
      <span className={`hold-yield ${high ? "high" : ""}`}>利回り {yieldText}</span>
      {hasYutai ? (
        <button type="button" className="yutai yes" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          優待あり {open ? "▲" : "▼"}
        </button>
      ) : (
        <span className={`yutai ${yutai?.status === "no" ? "no" : "unknown"}`}>
          {yutai?.status === "no" ? "優待なし" : "優待 未確認"}
        </span>
      )}
      {quote?.pbr != null && <span className="hold-sub">PBR {quote.pbr.toFixed(2)}</span>}
      {hasYutai && open && <p className="yutai-text">{yutai.text}</p>}
    </div>
  );
}
