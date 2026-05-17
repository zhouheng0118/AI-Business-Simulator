"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser, User } from "@/lib/auth";
import {
    api, ApiCaseDetail, ApiPlaybookRole, ApiMessage, ApiEvidence, ApiChecklistItem,
    MissionState, DEFAULT_MISSION_STATE,
} from "@/lib/api";

const MISSION_TITLES = [
    "Diagnose operational bottlenecks",
    "Understand customer impact",
    "Quantify the financial case",
    "Examine implementation costs",
    "Evaluate risks and assumptions",
];

const MISSION_FOCUS_AREAS = [
    ["Fragmented info systems", "Inventory visibility", "SKU complexity", "Distribution flow"],
    ["Product availability", "Delivery lead time", "Contractor requirements", "Switching risk"],
    ["CapEx & license costs", "Benefits & savings", "Margin improvement", "Discount rate"],
    ["Employees & consultants", "Task force size", "System maintenance", "Wave phasing"],
    ["Off-the-shelf ERP fit", "Employee resistance", "Implementation risk", "NPV sensitivity"],
];

const MISSION_AGENTS = [
    ["Operations Director"],
    ["Customer Representative"],
    ["CFO"],
    ["CFO", "Operations Director"],
    ["Local Expert", "CFO", "Operations Director"],
];


const DEFAULT_ROLES: ApiPlaybookRole[] = [
    { name: "CEO",                     title: "Chief Executive Officer", focus_area: "Strategic vision & growth pressure" },
    { name: "CFO",                     title: "Chief Financial Officer",  focus_area: "Cash flow & financial risk" },
    { name: "Operations Director",     title: "Operations Lead",          focus_area: "Supply chain & execution challenges" },
    { name: "Customer Representative", title: "Target Market Customer",   focus_area: "Consumer preferences & price sensitivity" },
    { name: "Local Expert",            title: "Market Consultant",        focus_area: "Rental costs & market nuances" },
];

const ROLE_COLORS: Record<string, { bg: string; border: string; dot: string; accent: string }> = {
    "CEO":                     { bg: "#eef4ff", border: "#bdd3ff", dot: "#0066cc", accent: "#0066cc" },
    "CFO":                     { bg: "#edfaf3", border: "#b9efd4", dot: "#1d8a4f", accent: "#1d8a4f" },
    "Head of Operations":      { bg: "#fff7ed", border: "#fcd9a8", dot: "#c05c00", accent: "#c05c00" },
    "Operations Director":     { bg: "#fff7ed", border: "#fcd9a8", dot: "#c05c00", accent: "#c05c00" },
    "City Official":           { bg: "#edfafa", border: "#b2e8e8", dot: "#0e7490", accent: "#0e7490" },
    "Customer Representative": { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8", accent: "#6b21a8" },
    "Customer Rep":            { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8", accent: "#6b21a8" },
    "Local Expert":            { bg: "#edfafa", border: "#b2e8e8", dot: "#0e7490", accent: "#0e7490" },
};

function rc(name: string) {
    return ROLE_COLORS[name] ?? { bg: "#f5f5f7", border: "#e0e0e0", dot: "#7a7a7a", accent: "#7a7a7a" };
}

function roleRequestValue(role: ApiPlaybookRole | undefined): string {
    return role?.role_type || role?.name || "";
}

function hasSufficientEvidence(rolesVisited: string[], evidence: ApiEvidence[]): boolean {
    return rolesVisited.length >= 3 && evidence.length >= 3;
}


function TopBar({ caseName, rolesVisited, total, missionPhase, sessionStatus, onProceed, onBack }: {
    caseName: string;
    rolesVisited: number;
    total: number;
    missionPhase: string;
    sessionStatus: string;
    onProceed: () => void;
    onBack: () => void;
}) {
    const [backHov, setBackHov] = useState(false);
    const [proceedHov, setProceedHov] = useState(false);
    const canProceed = missionPhase === "complete" && sessionStatus === "in_progress";
    const progressPct = total > 0 ? (rolesVisited / total) * 100 : 0;

    return (
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", gap: 16, flexShrink: 0, zIndex: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <button
                        onClick={onBack}
                        onMouseEnter={() => setBackHov(true)}
                        onMouseLeave={() => setBackHov(false)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid #dbe1ea", background: backHov ? "#eef4ff" : "#fff", color: "#1d1d1f", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s", flexShrink: 0 }}
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                        Case Library
                    </button>
                    <span style={{ color: "#c0c4cc", fontSize: 13, flexShrink: 0 }}>/</span>
                    <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {caseName}
                    </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <div style={{ flex: 1, minWidth: 120, maxWidth: 360, height: 7, borderRadius: 9999, background: "#e5e7eb", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #0066cc, #2f80ff)", borderRadius: 9999, transition: "width 0.35s ease" }} />
                    </div>
                    <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {rolesVisited}/{total} interviewed
                    </span>
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {missionPhase === "complete" && sessionStatus === "in_progress" && (
                    <span style={{ fontSize: 11, color: "#1d8a4f", background: "#edfaf3", border: "1px solid #b9efd4", borderRadius: 20, padding: "4px 10px", flexShrink: 0 }}>
                        All missions complete
                    </span>
                )}

                {canProceed && (
                    <button
                        onClick={onProceed}
                        onMouseEnter={() => setProceedHov(true)}
                        onMouseLeave={() => setProceedHov(false)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: proceedHov ? "#0071e3" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s", flexShrink: 0 }}
                    >
                        Proceed to Answer
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                )}
            </div>
        </div>
    );
}


function isAgentLocked(roleName: string, missionState: MissionState): boolean {
    const lowerName = roleName.toLowerCase();
    return !missionState.active_agents.some((a) => a.toLowerCase() === lowerName);
}

function RolePanel({ roles, selectedRole, rolesVisited, missionState, onSelect }: {
    roles: ApiPlaybookRole[];
    selectedRole: string | null;
    rolesVisited: string[];
    missionState: MissionState;
    onSelect: (name: string) => void;
}) {
    return (
        <div style={{ width: 174, flexShrink: 0, background: "#f8f9fc", borderRight: "1px solid #e8eaf0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px 6px", fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Stakeholders
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
                {roles.map((role) => (
                    <RoleItem
                        key={role.name}
                        role={role}
                        active={selectedRole === role.name}
                        visited={rolesVisited.includes(role.name)}
                        locked={isAgentLocked(role.name, missionState)}
                        onSelect={() => onSelect(role.name)}
                    />
                ))}
            </div>
        </div>
    );
}

function RoleItem({ role, active, visited, locked, onSelect }: {
    role: ApiPlaybookRole;
    active: boolean;
    visited: boolean;
    locked: boolean;
    onSelect: () => void;
}) {
    const [hov, setHov] = useState(false);
    const c = rc(role.name);
    const isCeo = /ceo/i.test(role.name) || role.role_type === "strategy";
    const rowBg = locked ? "transparent" : active ? "#eef4ff" : hov ? "#f0f0f5" : "transparent";

    return (
        <button
            onClick={locked ? undefined : onSelect}
            onMouseEnter={() => !locked && setHov(true)}
            onMouseLeave={() => setHov(false)}
            disabled={locked}
            title={locked ? `${role.name} — locked until assigned by CEO` : `${role.name} — ${role.title}`}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid transparent", borderLeft: `3px solid ${active && !locked ? "#0066cc" : "transparent"}`, background: rowBg, cursor: locked ? "default" : "pointer", textAlign: "left", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s", marginBottom: 2, opacity: locked ? 0.45 : 1 }}
        >
            <div style={{ width: 30, height: 30, position: "relative", flexShrink: 0 }}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: locked ? "#b0b0b0" : c.accent, opacity: active && !locked ? 1 : 0.7, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.12s" }}>
                    {locked ? "🔒" : role.name.charAt(0)}
                </div>
                {!locked && (
                    <div
                        style={{
                            position: "absolute",
                            right: -1,
                            bottom: -1,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: visited ? "#34c759" : "#d1d5db",
                            border: "1.5px solid #f8f9fc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        aria-label={visited ? "Interviewed" : "Not interviewed"}
                    >
                        {visited ? (
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        ) : null}
                    </div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: active && !locked ? 600 : 500, color: locked ? "#9a9a9a" : active ? c.accent : "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {role.name}
                </div>
                {isCeo && !locked ? (
                    <div style={{ fontSize: 9, color: "#0066cc", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 1 }}>
                        Orchestrator
                    </div>
                ) : (
                    <div style={{ fontSize: 10, color: locked ? "#b0b0b0" : "#7a7a7a", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {locked ? "Locked" : role.title}
                    </div>
                )}
            </div>
        </button>
    );
}

// Opening card shown at the top of each stakeholder's chat thread

// OpeningCard 视觉层次重构
const CEO_FIXED_STARTING_QUESTION = "I'm ready to start the investigation. What's my first mission?";

function OpeningCard({ role, onSuggestedQuestion, onClose, onTopicClick, onStart, hideStartActions, isCeo }: {
    role: ApiPlaybookRole;
    onSuggestedQuestion?: (q: string, send?: boolean) => void;
    onClose?: () => void;
    onTopicClick?: (topic: string) => void;
    onStart?: () => void;
    hideStartActions?: boolean;
    isCeo?: boolean;
}) {
    const [hoveredQ, setHoveredQ] = useState<number | null>(null);
    const [hoveredTopic, setHoveredTopic] = useState<number | null>(null);
    const c = rc(role.name);
    const roleDesc = role.opening_role_description || role.focus_area || "";
    const topics   = (role.opening_topics && role.opening_topics.length > 0) ? role.opening_topics : [];
    // Only CEO gets a starting question (fixed format). Other sub-agents show none.
    const suggestedQuestions: string[] = isCeo ? [CEO_FIXED_STARTING_QUESTION] : [];

    // Hero区
    return (
        <div style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 2px 16px rgba(0,102,204,0.06)",
            border: `1.5px solid #e0e8f0`,
            padding: 0,
            marginBottom: 18,
            overflow: "hidden",
        }}>
            {/* 左侧色条 */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: c.accent, borderRadius: "16px 0 0 16px" }} />
            {/* 关闭按钮 */}
            {onClose && (
                <button onClick={onClose} style={{ position: "absolute", top: 14, right: 18, background: "none", border: "none", fontSize: 22, color: "#b0b0b0", cursor: "pointer", zIndex: 2, lineHeight: 1 }} aria-label="Close preview">×</button>
            )}
            {/* Hero区内容 */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "28px 32px 10px 28px" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,102,204,0.10)" }}>{role.name.charAt(0)}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: c.accent, fontFamily: "SF Pro Display, system-ui", letterSpacing: "-0.5px" }}>{role.name} Agent</div>
                    <div style={{ fontSize: 15, color: "#64748b", fontWeight: 600, marginTop: 2 }}>{role.title}</div>
                    {roleDesc && (
                        <div style={{ fontSize: 13, color: "#8b98a9", marginTop: 7, maxWidth: 340, lineHeight: 1.5 }}>{roleDesc}</div>
                    )}
                </div>
            </div>
            {/* 可问话题 chips */}
            {topics.length > 0 && (
                <div style={{ padding: "0 32px 0 28px", marginTop: 18 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: c.accent, marginBottom: 10, letterSpacing: "-0.1px" }}>You can ask about</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {topics.map((topic, i) => (
                            <button
                                key={i}
                                onClick={() => onTopicClick?.(topic)}
                                onMouseEnter={() => setHoveredTopic(i)}
                                onMouseLeave={() => setHoveredTopic(null)}
                                style={{
                                    border: "none",
                                    outline: "none",
                                    background: hoveredTopic === i ? "#e6f0ff" : "#f3f7fd",
                                    color: hoveredTopic === i ? c.accent : "#1d1d1f",
                                    fontWeight: 600,
                                    fontSize: 14,
                                    borderRadius: 999,
                                    padding: "7px 18px",
                                    cursor: "pointer",
                                    boxShadow: hoveredTopic === i ? "0 2px 8px rgba(0,102,204,0.08)" : undefined,
                                    transition: "background 0.13s, color 0.13s",
                                }}
                                aria-label={`Ask about ${topic}`}
                            >
                                {topic}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {/* 推荐问题卡片 */}
            {suggestedQuestions.length > 0 && !hideStartActions && (
                <div style={{ padding: "0 32px 0 28px", marginTop: 22 }}>
                    <div style={{ background: "linear-gradient(90deg,#e0edff,#e6f0ff)", borderRadius: 13, padding: "18px 22px 16px 18px", display: "flex", flexDirection: "column", alignItems: "flex-start", boxShadow: "0 2px 8px rgba(0,102,204,0.06)" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c.accent, marginBottom: 8 }}>Good starting question</div>
                        <div style={{ fontSize: 16, color: "#1d1d1f", fontWeight: 500, marginBottom: 14, lineHeight: 1.6 }}>{suggestedQuestions[0]}</div>
                        <button
                            onClick={() => onSuggestedQuestion?.(suggestedQuestions[0], true)}
                            style={{ background: "#0066cc", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,102,204,0.10)", display: "flex", alignItems: "center", gap: 7 }}
                        >
                            ▶ Start with this question
                        </button>
                    </div>
                </div>
            )}
            {/* 主操作按钮 */}
            {onStart && !hideStartActions && (
                <div style={{ padding: "0 32px 24px 28px", marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        onClick={onStart}
                        style={{ background: "linear-gradient(90deg,#0066cc,#2f80ff)", color: "#fff", border: "none", borderRadius: 999, padding: "12px 32px", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 12px rgba(0,102,204,0.10)", letterSpacing: "0.01em" }}
                    >
                        Start Interview →
                    </button>
                </div>
            )}
        </div>
    );
}

// Chat window

function ChatWindow({ messages, selectedRole, sending, role, roles, onSelectRole, onSuggestedQuestion, onClosePreview, onOpenPreview, onTopicClick, onStartInterview, setInputText, sendSuggested, showPreview }: {
    messages: ApiMessage[];
    selectedRole: string | null;
    sending: boolean;
    role?: ApiPlaybookRole;
    roles: ApiPlaybookRole[];
    onSelectRole: (name: string) => void;
    onSuggestedQuestion?: (q: string, send?: boolean) => void;
    onClosePreview?: () => void;
    onOpenPreview?: () => void;
    onTopicClick?: (topic: string) => void;
    onStartInterview?: () => void;
    setInputText?: (v: string) => void;
    sendSuggested?: (q: string) => void;
    showPreview?: boolean;
}) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const starterRole = roles.find((r) => /ceo/i.test(r.name)) ?? roles[0];

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, sending]);

    if (!selectedRole) {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
                <div style={{ width: "100%", maxWidth: 520, background: "linear-gradient(180deg, #f9fbff 0%, #ffffff 100%)", border: "1px solid #dbe8ff", borderRadius: 14, padding: "22px 24px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: "#e8f1ff", color: "#0066cc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f", marginBottom: 6, fontFamily: "SF Pro Display, system-ui" }}>
                                Choose a stakeholder to begin
                            </div>
                            <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
                                Start with the CEO to understand the strategic context, then ask finance and operations for supporting details.
                            </div>
                            {starterRole && (
                                <button
                                    onClick={() => onSelectRole(starterRole.name)}
                                    style={{ marginTop: 14, border: "none", borderRadius: 9, background: "#0066cc", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                                >
                                    Start with {starterRole.name}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const filtered = messages.filter((m) => m.agent_name === selectedRole);
    const hasAskedFirstQuestion = filtered.some((m) => m.role === "student");

    // OpeningCard 交互适配
    const handleSuggested = (q: string, send?: boolean) => {
        if (send && sendSuggested) sendSuggested(q);
        else if (setInputText) setInputText(q);
        onSuggestedQuestion?.(q, send);
    };
    const handleTopicClick = (topic: string) => {
        if (setInputText) setInputText(topic);
        onTopicClick?.(topic);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div
                style={{
                    flex: hasAskedFirstQuestion ? "0 0 50%" : "1 1 auto",
                    minHeight: hasAskedFirstQuestion ? 180 : 0,
                    overflowY: "auto",
                    padding: "12px 20px 8px",
                    borderBottom: hasAskedFirstQuestion ? "1px solid #edf1f7" : "none",
                    background: "#fff",
                    transition: "flex-basis 0.25s ease",
                }}
            >
                {role && showPreview === false && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${rc(role.name).border}`, background: "#f8fbff", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: rc(role.name).accent, display: "inline-block" }} />
                            {role.name} guide is hidden
                        </div>
                        <button
                            onClick={onOpenPreview}
                            style={{ border: "none", borderRadius: 8, background: "#0066cc", color: "#fff", padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                            Show role guide
                        </button>
                    </div>
                )}
                {role && showPreview !== false && (
                    <OpeningCard
                        role={role}
                        onSuggestedQuestion={handleSuggested}
                        onClose={onClosePreview}
                        onTopicClick={handleTopicClick}
                        onStart={onStartInterview}
                        hideStartActions={hasAskedFirstQuestion}
                        isCeo={/ceo/i.test(role.name)}
                    />
                )}
            </div>

            <div
                style={{
                    flex: hasAskedFirstQuestion ? "1 1 50%" : "0 0 0",
                    minHeight: hasAskedFirstQuestion ? 0 : 0,
                    overflowY: hasAskedFirstQuestion ? "auto" : "hidden",
                    padding: hasAskedFirstQuestion ? "10px 20px 16px" : "0 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    transition: "flex-basis 0.25s ease",
                }}
            >
                {filtered.length === 0 && !sending && (
                    <div style={{ textAlign: "center", color: "#b0b0b0", fontSize: 12, marginTop: 8 }}>
                        Start your conversation with {selectedRole}
                    </div>
                )}
                {filtered.map((msg) => (
                    <ChatBubble key={msg.id} msg={msg} roleName={selectedRole} />
                ))}
                {sending && <TypingIndicator roleName={selectedRole} />}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

function ChatBubble({ msg, roleName }: { msg: ApiMessage; roleName: string }) {
    const isStudent = msg.role === "student";
    const c = rc(roleName);

    if (isStudent) {
        return (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "74%", background: "linear-gradient(180deg, #0a73de, #0066cc)", color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "10px 13px", fontSize: 13, lineHeight: 1.55, wordBreak: "break-word", boxShadow: "0 4px 14px rgba(0,102,204,0.18)" }}>
                    {msg.content}
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: c.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {roleName.charAt(0)}
            </div>
            <div style={{ maxWidth: "76%", background: "#ffffff", border: `1px solid ${c.border}`, borderRadius: "12px 12px 12px 4px", padding: "9px 12px", boxShadow: "0 2px 10px rgba(15,23,42,0.06)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: c.accent, marginBottom: 5, letterSpacing: "0.01em" }}>
                    {roleName}
                </div>
                <div style={{ color: "#1d1d1f", fontSize: 13, lineHeight: 1.55, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {msg.content}
                </div>
            </div>
        </div>
    );
}

function TypingIndicator({ roleName }: { roleName: string }) {
    const c = rc(roleName);
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {roleName.charAt(0)}
            </div>
            <div style={{ background: "#f0f0f5", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#b0b0b0", animation: `typingBounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                ))}
                <style>{`@keyframes typingBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
            </div>
        </div>
    );
}

// Summary panel (right sidebar) — Investigation Checklist

function CheckIcon({ done, isNew }: { done: boolean; isNew: boolean }) {
    if (done) {
        return (
            <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid #22c55e",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                animation: isNew ? "checkPop 0.35s ease-out" : undefined,
                transition: "transform 0.2s",
            }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
        );
    }
    return (
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #cbd5e1", background: "#fff", flexShrink: 0 }} />
    );
}

function SummaryPanel({ checklistItems, checklistCompleted, newlyCheckedItems, teachingGoals, roles, rolesVisited }: {
    checklistItems: ApiChecklistItem[];
    checklistCompleted: number[];
    newlyCheckedItems: Set<number>;
    teachingGoals: string[];
    roles: ApiPlaybookRole[];
    rolesVisited: string[];
}) {
    const completedSet = new Set(checklistCompleted);
    const progressPct = roles.length > 0 ? (rolesVisited.length / roles.length) * 100 : 0;
    const unvisited = roles.filter((r) => !rolesVisited.includes(r.name));

    // Group checklist items by objective_index
    const byObjective: Map<number, { item: ApiChecklistItem; globalIndex: number }[]> = new Map();
    checklistItems.forEach((item, idx) => {
        const oi = item.objective_index;
        if (!byObjective.has(oi)) byObjective.set(oi, []);
        byObjective.get(oi)!.push({ item, globalIndex: idx });
    });

    const numObjectives = teachingGoals.length || (byObjective.size > 0 ? Math.max(...Array.from(byObjective.keys())) + 1 : 0);
    const objectiveIndices = Array.from({ length: numObjectives }, (_, i) => i);

    const totalItems = checklistItems.length;
    const completedCount = checklistCompleted.length;

    return (
        <div style={{ width: 244, flexShrink: 0, borderLeft: "1px solid #e8eaf0", background: "#f8f9fc", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

                <style>{`
                  @keyframes checkPop {
                    0%   { transform: scale(0.7); opacity: 0; }
                    60%  { transform: scale(1.15); }
                    100% { transform: scale(1);    opacity: 1; }
                  }
                  @keyframes rowSlide {
                    0%   { background: #edfaf3; }
                    100% { background: transparent; }
                  }
                `}</style>

                <div style={{ border: "1px solid #e2e8f0", borderRadius: 11, background: "#fff", padding: "11px 10px", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Investigation Checklist
                        </div>
                        {totalItems > 0 && (
                            <span style={{ fontSize: 10, color: completedCount === totalItems ? "#1d8a4f" : "#7a7a7a", fontWeight: 700 }}>
                                {completedCount}/{totalItems}
                            </span>
                        )}
                    </div>

                    {checklistItems.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "14px 2px", lineHeight: 1.6 }}>
                            Start interviewing stakeholders to unlock your checklist tasks.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {objectiveIndices.map((oi) => {
                                const goal = teachingGoals[oi] ?? `Objective ${oi + 1}`;
                                const items = byObjective.get(oi) ?? [];
                                const doneCount = items.filter(({ globalIndex }) => completedSet.has(globalIndex)).length;
                                const allDone = items.length > 0 && doneCount === items.length;

                                return (
                                    <div key={oi}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 7 }}>
                                            <div style={{ width: 18, height: 18, borderRadius: 5, background: allDone ? "#edfaf3" : "#f0f0f5", border: `1px solid ${allDone ? "#b9efd4" : "#e0e0e0"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                                <span style={{ fontSize: 9, fontWeight: 700, color: allDone ? "#1d8a4f" : "#7a7a7a" }}>{oi + 1}</span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: allDone ? "#1d8a4f" : "#1d1d1f", lineHeight: 1.4 }}>
                                                    {goal}
                                                </div>
                                                <div style={{ fontSize: 10, color: "#b0b0b0", marginTop: 2 }}>
                                                    {doneCount}/{items.length} completed
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 25 }}>
                                            {items.map(({ item, globalIndex }) => {
                                                const done = completedSet.has(globalIndex);
                                                const isNew = newlyCheckedItems.has(globalIndex);
                                                return (
                                                    <div key={globalIndex} style={{
                                                        display: "flex", alignItems: "flex-start", gap: 8,
                                                        padding: "8px 9px",
                                                        borderRadius: 8,
                                                        background: isNew ? "#edfaf3" : done ? "#f0fdf4" : "#ffffff",
                                                        border: `1px solid ${isNew ? "#86efac" : done ? "#bbf7d0" : "#e8e8ed"}`,
                                                        animation: isNew ? "rowSlide 1.5s ease-out forwards" : undefined,
                                                    }}>
                                                        <div style={{ marginTop: 0 }}>
                                                            <CheckIcon done={done} isNew={isNew} />
                                                        </div>
                                                        <span style={{ fontSize: 12, color: done ? "#4b5563" : "#1d1d1f", lineHeight: 1.45, textDecoration: done ? "line-through" : "none", flex: 1 }}>
                                                            {item.task}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 12, border: "1px solid #dbe8ff", borderRadius: 11, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", padding: "11px 10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                        Interview Progress
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, background: "linear-gradient(90deg,#0066cc,#2f80ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>
                            {rolesVisited.length}/{roles.length}
                        </span>
                        <span style={{ fontSize: 11, color: "#5b6b81", fontWeight: 600 }}>
                            agents interviewed
                        </span>
                    </div>
                    <div style={{ height: 8, background: "#dbeafe", borderRadius: 9999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #0066cc, #2f80ff)", borderRadius: 9999, transition: "width 0.4s ease" }} />
                    </div>
                </div>

                {unvisited.length > 0 && (
                    <div style={{ marginTop: 12, background: "#eef5ff", border: "1px solid #cfe0ff", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, lineHeight: 1.55, color: "#1e3a8a" }}>
                            <span style={{ fontWeight: 700 }}>Tip: </span>
                            You haven&apos;t interviewed the {unvisited.map((r) => r.name).join(" or ")}. Their data may change your recommendation.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Mission panel (replaces right-side checklist)

function MissionPanel({ missionState }: { missionState: MissionState }) {
    const idx = missionState.current_mission;
    const phase = missionState.phase;
    const completed = new Set(missionState.missions_completed);

    return (
        <div style={{ width: 244, flexShrink: 0, borderLeft: "1px solid #e8eaf0", background: "#f8f9fc", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

                {/* Mission roadmap */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 11, background: "#fff", padding: "11px 10px", boxShadow: "0 1px 8px rgba(15,23,42,0.04)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                        Investigation Roadmap
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {MISSION_TITLES.map((title, i) => {
                            const isDone = completed.has(i);
                            const isActive = i === idx && phase !== "complete";
                            const icon = isDone ? "✓" : isActive ? "▶" : "○";
                            const color = isDone ? "#1d8a4f" : isActive ? "#0066cc" : "#b0b0b0";
                            const bgColor = isDone ? "#edfaf3" : isActive ? "#eef4ff" : "transparent";
                            return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 7, background: bgColor }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, width: 12, textAlign: "center" }}>{icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11, color: isDone ? "#4b5563" : isActive ? "#0066cc" : "#9a9a9a", fontWeight: isActive ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            M{i + 1} {title}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {phase === "complete" && (
                        <div style={{ marginTop: 10, fontSize: 11, color: "#1d8a4f", fontWeight: 600, textAlign: "center", padding: "6px 0", background: "#edfaf3", borderRadius: 7 }}>
                            All missions complete ✓
                        </div>
                    )}
                </div>

                {/* Current mission detail */}
                {phase !== "complete" && (
                    <div style={{ marginTop: 12, border: "1px solid #dbe8ff", borderRadius: 11, background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)", padding: "11px 10px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                            Current Mission
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0066cc", marginBottom: 6, lineHeight: 1.4 }}>
                            M{idx + 1}: {MISSION_TITLES[idx]}
                        </div>
                        <div style={{ fontSize: 11, color: "#5b6b81", fontWeight: 600, marginBottom: 6 }}>
                            {MISSION_AGENTS[idx].join(", ")}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", marginBottom: 4 }}>Focus:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {MISSION_FOCUS_AREAS[idx].map((area, i) => (
                                <div key={i} style={{ fontSize: 11, color: "#475569", display: "flex", gap: 5 }}>
                                    <span style={{ color: "#0066cc", flexShrink: 0 }}>•</span>
                                    {area}
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: phase === "briefing" ? "#c05c00" : "#1d8a4f", fontWeight: 600 }}>
                            {phase === "briefing" ? "→ Get briefing from CEO" : "→ Report back to CEO when done"}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Input area

function InputArea({ value, onChange, onSend, sending, disabled, missionPhase, selectedRole, onReportToCeo }: {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    sending: boolean;
    disabled: boolean;
    missionPhase?: string;
    selectedRole?: string | null;
    onReportToCeo?: () => void;
}) {
    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }

    const canSend = !disabled && !sending && value.trim().length > 0;

    const isCeoSelected = selectedRole && /ceo/i.test(selectedRole);
    const showReportCta = missionPhase === "investigating" && !isCeoSelected && !disabled;

    return (
        <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 14px", background: "#ffffff", flexShrink: 0 }}>
            {showReportCta && (
                <div style={{ marginBottom: 8, border: "1px solid #cfe0ff", background: "#eef5ff", borderRadius: 9, padding: "7px 10px", fontSize: 12, lineHeight: 1.45, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ color: "#1e3a8a" }}>Mission in progress — report your findings to CEO when ready.</span>
                    <button
                        onClick={onReportToCeo}
                        style={{ border: "none", borderRadius: 7, background: "#0066cc", color: "#fff", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                    >
                        → Report to CEO
                    </button>
                </div>
            )}
            {disabled && (
                <div style={{ marginBottom: 8, border: "1px solid #cfe0ff", background: "#eef5ff", color: "#1e3a8a", borderRadius: 9, padding: "7px 10px", fontSize: 12, lineHeight: 1.45, display: "flex", alignItems: "center", gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Select a stakeholder first. Start with CEO for strategy context.
                </div>
            )}
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={disabled || sending}
                    placeholder={disabled ? "Choose a stakeholder from the left to unlock chat input…" : "Ask a question… (Enter to send, Shift+Enter for new line)"}
                    rows={2}
                    style={{ flex: 1, padding: "8px 12px", border: `1px solid ${disabled ? "#dbe1ea" : "#e0e0e0"}`, borderRadius: 10, fontSize: 13, fontFamily: "SF Pro Text, system-ui", color: "#1d1d1f", resize: "none", outline: "none", lineHeight: 1.5, background: disabled ? "#f5f7fb" : "#fff", transition: "border-color 0.12s" }}
                    onFocus={(e) => { e.target.style.borderColor = "#0066cc"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#e0e0e0"; }}
                />
                <button
                    onClick={onSend}
                    disabled={!canSend}
                    style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: canSend ? "#0066cc" : "#e0e0e0", color: "#fff", cursor: canSend ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}

// Main page

export default function SessionPage() {
    const router  = useRouter();
    const params  = useParams();
    const sessionId = params.id as string;

    const [, setUser]          = useState<User | null>(null);
    const [caseDetail, setCaseDetail]   = useState<ApiCaseDetail | null>(null);
    const [caseId, setCaseId]           = useState<string>("");
    const [sessionStatus, setStatus]    = useState<string>("in_progress");
    const [messages, setMessages]       = useState<ApiMessage[]>([]);
    const [evidence, setEvidence]       = useState<ApiEvidence[]>([]);
    const [checklistItems, setChecklistItems]           = useState<ApiChecklistItem[]>([]);
    const [checklistCompleted, setChecklistCompleted]   = useState<number[]>([]);
    const [newlyCheckedItems, setNewlyCheckedItems]     = useState<Set<number>>(new Set());
    const [rolesVisited, setRolesVisited] = useState<string[]>([]);
    const [missionState, setMissionState] = useState<MissionState>(DEFAULT_MISSION_STATE);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [showPreview, setShowPreview]   = useState(true);
    const [inputText, setInputText]       = useState("");
    const [sending, setSending]           = useState(false);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState<string | null>(null);
    const infoSufficient = missionState.phase === "complete";

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(u);

        Promise.all([
            api.sessions.get(sessionId),
            api.sessions.getMessages(sessionId),
            api.sessions.getEvidence(sessionId),
        ])
            .then(async ([session, msgs, ev]) => {
                setStatus(session.status);
                setRolesVisited(session.interviewed_roles);
                setMessages(msgs);
                setEvidence(ev.evidence_board);
                setChecklistItems(ev.checklist_items ?? []);
                setChecklistCompleted(ev.checklist_completed ?? []);
                if (session.mission_state) {
                    setMissionState(session.mission_state);
                }
                setCaseId(session.case_id);
                const detail = await api.cases.get(session.case_id);
                setCaseDetail(detail);
            })
            .catch(() => setError("Could not load session. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [sessionId, router]);

    const handleSend = useCallback(async () => {
        if (!selectedRole || !inputText.trim() || sending) return;
        const text = inputText.trim();
        const activeRole = caseDetail?.playbook?.roles?.find((role) => role.name === selectedRole);
        const roleName = roleRequestValue(activeRole) || selectedRole;
        setInputText("");
        setSending(true);

        const tempId = `temp-${Date.now()}`;
        setMessages((prev) => [...prev, {
            id: tempId, session_id: sessionId, role: "student",
            agent_name: selectedRole, content: text, created_at: new Date().toISOString(),
        }]);

        try {
            const res = await api.sessions.sendMessage(sessionId, roleName, text);
            const evidenceResult = await api.sessions.getEvidence(sessionId);
            setMessages((prev) => [...prev, {
                id: `agent-${Date.now()}`, session_id: sessionId, role: "agent",
                agent_name: res.agent_name, content: res.reply, created_at: new Date().toISOString(),
            }]);
            const allEvidence = evidenceResult.evidence_board;
            setEvidence(allEvidence);
            setChecklistCompleted(res.checklist_completed ?? evidenceResult.checklist_completed ?? []);
            if ((res.newly_checked_items ?? []).length > 0) {
                setNewlyCheckedItems(new Set(res.newly_checked_items));
                setTimeout(() => setNewlyCheckedItems(new Set()), 3000);
            }
            setRolesVisited(res.roles_visited);
            if (res.mission_state) {
                setMissionState(res.mission_state);
            }
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setError("Failed to send. Please try again.");
        } finally {
            setSending(false);
        }
    }, [selectedRole, inputText, sending, sessionId, caseDetail]);

    // 一键发送推荐问题
    const sendSuggested = async (q: string) => {
        setInputText(q);
        setTimeout(() => handleSend(), 0);
    };

    async function handleProceed() {
        try {
            await api.sessions.proceed(sessionId);
            router.push(`/student/session/${sessionId}/answer`);
        } catch {
            setError("Could not proceed. Please try again.");
        }
    }

    const roles: ApiPlaybookRole[] =
        caseDetail?.playbook?.roles?.length ? caseDetail.playbook.roles : DEFAULT_ROLES;
    const caseName = caseDetail?.case?.title ?? "Loading…";

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "SF Pro Text, system-ui", overflow: "hidden", background: "#f8f9fc" }}>
            <TopBar
                caseName={caseName}
                rolesVisited={rolesVisited.length}
                total={roles.length}
                missionPhase={missionState.phase}
                sessionStatus={sessionStatus}
                onProceed={handleProceed}
                onBack={() => router.push(`/student/case/${caseId}`)}
            />

            {error && (
                <div style={{ margin: "12px 20px 0", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                    {error}
                    <button onClick={() => setError(null)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 600, padding: 0 }}>Dismiss</button>
                </div>
            )}

            {loading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#7a7a7a", fontSize: 13 }}>
                    Loading session…
                </div>
            ) : (
                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                    <RolePanel
                        roles={roles}
                        selectedRole={selectedRole}
                        rolesVisited={rolesVisited}
                        missionState={missionState}
                        onSelect={(name) => { setSelectedRole(name); setShowPreview(true); }}
                    />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#ffffff", boxShadow: "0 0 0 1px #e8eaf0, 0 4px 24px -8px rgba(15,23,42,0.08)" }}>
                        <ChatWindow
                            messages={messages}
                            selectedRole={selectedRole}
                            sending={sending}
                            role={roles.find((r) => r.name === selectedRole)}
                            roles={roles}
                            onSelectRole={setSelectedRole}
                            showPreview={showPreview}
                            onOpenPreview={() => setShowPreview(true)}
                            onSuggestedQuestion={(q, send) => {
                                if (send) sendSuggested(q);
                                else setInputText(q);
                            }}
                            onClosePreview={() => setShowPreview(false)}
                            onTopicClick={(topic) => setInputText(topic)}
                            onStartInterview={() => setShowPreview(false)}
                            setInputText={setInputText}
                            sendSuggested={sendSuggested}
                        />
                        <InputArea
                            value={inputText}
                            onChange={setInputText}
                            onSend={handleSend}
                            sending={sending}
                            disabled={!selectedRole || sessionStatus !== "in_progress"}
                            missionPhase={missionState.phase}
                            selectedRole={selectedRole}
                            onReportToCeo={() => {
                                const ceoRole = roles.find((r) => /ceo/i.test(r.name) || r.role_type === "strategy");
                                if (ceoRole) { setSelectedRole(ceoRole.name); setShowPreview(true); }
                            }}
                        />
                    </div>
                    <MissionPanel missionState={missionState} />
                </div>
            )}
        </div>
    );
}
