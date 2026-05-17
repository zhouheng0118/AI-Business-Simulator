"use client";

import { useState, type CSSProperties } from "react";


export function SbLabel({ children, hidden }: { children: React.ReactNode; hidden?: boolean }) {
    if (hidden) return null;
    return (
        <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 10px 4px" }}>
            {children}
        </div>
    );
}

export function SbItem({ icon, label, active, onClick, danger, compact }: {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    danger?: boolean;
    /** Icon-only row (narrow sidebar); label shown in tooltip. */
    compact?: boolean;
}) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            type="button"
            title={compact ? label : undefined}
            aria-label={label}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: compact ? "center" : "flex-start",
                gap: compact ? 0 : 8,
                width: "100%",
                padding: compact ? "8px 0" : "7px 10px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                background: active ? "#f0f0f5" : hovered ? "#f5f5f7" : "transparent",
                color: danger ? "#ff3b30" : active ? "#0066cc" : "#1d1d1f",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                textAlign: "left",
                fontFamily: "SF Pro Text, system-ui",
                borderLeft: active ? "2px solid #0066cc" : "2px solid transparent",
                transition: "background 0.12s",
            }}
        >
            <span style={{ width: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
            {!compact ? <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{label}</span> : null}
        </button>
    );
}

// ── Display atoms ─────────────────────────────────────────────────────────────

export function Avatar({ name, color = "#0066cc" }: { name: string; color?: string }) {
    return (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

export function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
    return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: bg, color, letterSpacing: "0.02em" }}>{label}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
    return <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 8px" }}>{children}</span>;
}

export function StatCard({
    label,
    value,
    color = "#1d1d1f",
    gradient = "none",
    fontSize = 24,
    fontWeight = 600,
}: {
    label: string;
    value: number | string;
    color?: string;
    /** Pastel gradient shell (student dashboard). Omit on other pages for white cards. */
    gradient?: "none" | "blue" | "orange" | "green" | "slate";
    fontSize?: number; // Custom font size
    fontWeight?: number | string; // Custom font weight
}) {
    const shell: Record<typeof gradient, CSSProperties> = {
        none: { background: "#ffffff", border: "1px solid #e0e0e0" },
        blue: {
            background: "linear-gradient(145deg, #e0f2fe 0%, #dbeafe 42%, #f8fafc 100%)",
            border: "1px solid rgba(14, 165, 233, 0.14)",
        },
        orange: {
            background: "linear-gradient(145deg, #ffedd5 0%, #fed7aa 40%, #fffbeb 100%)",
            border: "1px solid rgba(234, 88, 12, 0.14)",
        },
        green: {
            background: "linear-gradient(145deg, #dcfce7 0%, #bbf7d0 38%, #f0fdf4 100%)",
            border: "1px solid rgba(22, 163, 74, 0.14)",
        },
        slate: {
            background: "linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 45%, #f8fafc 100%)",
            border: "1px solid rgba(100, 116, 139, 0.16)",
        },
    };

    return (
        <div
            style={{
                borderRadius: 10,
                padding: "14px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                flex: 1,
                ...shell[gradient],
            }}
        >
            <span style={{ fontSize, fontWeight, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 11, color: gradient === "none" ? "#7a7a7a" : "#64748b", fontWeight: 500 }}>{label}</span>
        </div>
    );
}

export function ActionBtn({ label, primary, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "SF Pro Text, system-ui", cursor: "pointer", border: primary ? "none" : "1px solid #e0e0e0", background: primary ? (hovered ? "#0071e3" : "#0066cc") : (hovered ? "#f5f5f7" : "#ffffff"), color: primary ? "#ffffff" : "#1d1d1f", transition: "background 0.12s", whiteSpace: "nowrap" }}
        >
            {label}
        </button>
    );
}


export function LoadingState({ count = 3 }: { count?: number }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{ height: 140, borderRadius: 12, background: "#f0f0f0", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
    );
}

export function ErrorState({ message }: { message: string }) {
    return (
        <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#991b1b" }}>
            {message}
        </div>
    );
}

export function EmptyState({ message }: { message: string }) {
    return (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#7a7a7a", fontSize: 14 }}>
            {message}
        </div>
    );
}


export function IconGrid()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
export function IconUsers()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>; }
export function IconChart()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
export function IconReport()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
export function IconUser()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
export function IconSettings() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
export function IconLogout()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
export function IconPlus()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
