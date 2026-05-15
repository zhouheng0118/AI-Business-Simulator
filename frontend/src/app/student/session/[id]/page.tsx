"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser, User } from "@/lib/auth";
import {
    api, ApiCaseDetail, ApiPlaybookRole, ApiMessage, ApiEvidence, ApiChecklistItem,
} from "@/lib/api";
import ReactMarkdown from "react-markdown";


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
    "Rider":                   { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8", accent: "#6b21a8" },
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


function TopBar({ caseName, rolesVisited, total, infoSufficient, sessionStatus, onProceed, onBack }: {
    caseName: string;
    rolesVisited: number;
    total: number;
    infoSufficient: boolean;
    sessionStatus: string;
    onProceed: () => void;
    onBack: () => void;
}) {
    const [backHov, setBackHov] = useState(false);
    const [proceedHov, setProceedHov] = useState(false);
    const canProceed = infoSufficient && sessionStatus === "in_progress";

    return (
        <div style={{ height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flexShrink: 0, zIndex: 10 }}>
            <button
                onClick={onBack}
                onMouseEnter={() => setBackHov(true)}
                onMouseLeave={() => setBackHov(false)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, border: "1px solid #e0e0e0", background: backHov ? "#f5f5f7" : "#fff", color: "#1d1d1f", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s", flexShrink: 0 }}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Case
            </button>

            <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {caseName}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4 }}>
                    {Array.from({ length: total }).map((_, i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < rolesVisited ? "#0066cc" : "#e0e0e0", transition: "background 0.25s" }} />
                    ))}
                </div>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>{rolesVisited}/{total} interviewed</span>
            </div>

            {infoSufficient && sessionStatus === "in_progress" && (
                <span style={{ fontSize: 11, color: "#1d8a4f", background: "#edfaf3", border: "1px solid #b9efd4", borderRadius: 20, padding: "3px 10px", flexShrink: 0 }}>
                    Ready to answer
                </span>
            )}

            {canProceed && (
                <button
                    onClick={onProceed}
                    onMouseEnter={() => setProceedHov(true)}
                    onMouseLeave={() => setProceedHov(false)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: proceedHov ? "#0071e3" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s", flexShrink: 0 }}
                >
                    Proceed to Answer
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
            )}
        </div>
    );
}


function RolePanel({ roles, selectedRole, rolesVisited, onSelect }: {
    roles: ApiPlaybookRole[];
    selectedRole: string | null;
    rolesVisited: string[];
    onSelect: (name: string) => void;
}) {
    return (
        <div style={{ width: 196, flexShrink: 0, background: "#fafafa", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                        onSelect={() => onSelect(role.name)}
                    />
                ))}
            </div>
        </div>
    );
}

function RoleItem({ role, active, visited, onSelect }: {
    role: ApiPlaybookRole;
    active: boolean;
    visited: boolean;
    onSelect: () => void;
}) {
    const [hov, setHov] = useState(false);
    const c = rc(role.name);

    return (
        <button
            onClick={onSelect}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${active ? c.border : "transparent"}`, background: active ? c.bg : hov ? "#f0f0f5" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s", marginBottom: 2 }}
        >
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: active ? c.accent : "#e0e0e0", color: active ? "#fff" : "#7a7a7a", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.12s" }}>
                {role.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? c.accent : "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {role.name}
                </div>
                <div style={{ fontSize: 10, color: "#7a7a7a", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {role.title}
                </div>
            </div>
            {visited && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            )}
        </button>
    );
}

// Opening card shown at the top of each stakeholder's chat thread

function OpeningCard({ role, onSuggestedQuestion }: {
    role: ApiPlaybookRole;
    onSuggestedQuestion?: (q: string) => void;
}) {
    const [hoveredQ, setHoveredQ] = useState<number | null>(null);

    const roleDesc = role.opening_role_description || role.focus_area || "";
    const topics   = (role.opening_topics && role.opening_topics.length > 0) ? role.opening_topics : [];
    const suggestedQuestions: string[] = role.opening_suggested_question
        ? [role.opening_suggested_question]
        : [];

    // Legacy chat-bubble style (opening_statement only, no structured fields)
    if (role.opening_statement && !roleDesc && topics.length === 0 && suggestedQuestions.length === 0) {
        const c = rc(role.name);
        return (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexShrink: 0 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    {role.name.charAt(0)}
                </div>
                <div style={{ maxWidth: "80%", background: "#f0f0f5", color: "#1d1d1f", borderRadius: "14px 14px 14px 4px", padding: "9px 13px", fontSize: 13, lineHeight: 1.55 }}>
                    {role.opening_statement}
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: "#ffffff",
            border: "1px solid #e8e8ed",
            borderRadius: 14,
            padding: "22px 24px 20px",
            flexShrink: 0,
            fontFamily: "SF Pro Text, system-ui",
        }}>
            {/* ── 1. Role name ── */}
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1d1d1f", marginBottom: 14, fontFamily: "SF Pro Display, system-ui", letterSpacing: "-0.2px" }}>
                {role.name} Agent
            </div>

            {/* ── 2. Role description ── */}
            {roleDesc && (
                <div style={{ fontSize: 14, color: "#1d1d1f", marginBottom: 18, lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 700 }}>Role: </span>
                    {roleDesc}
                </div>
            )}

            {/* ── 3. Topics ── */}
            {topics.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", marginBottom: 10 }}>
                        You can ask about:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                        {topics.map((topic, i) => (
                            <li key={i} style={{ fontSize: 14, color: "#1d1d1f", lineHeight: 1.55 }}>
                                {topic}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── 4. Suggested starting questions ── */}
            {suggestedQuestions.length > 0 && (
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", marginBottom: 10 }}>
                        Good starting question{suggestedQuestions.length > 1 ? "s" : ""}:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {suggestedQuestions.map((q, i) => (
                            <div
                                key={i}
                                onClick={() => onSuggestedQuestion?.(q)}
                                onMouseEnter={() => setHoveredQ(i)}
                                onMouseLeave={() => setHoveredQ(null)}
                                style={{
                                    borderLeft: `3px solid ${hoveredQ === i && onSuggestedQuestion ? "#0066cc" : "#c8c8cc"}`,
                                    paddingLeft: 14,
                                    paddingTop: 3,
                                    paddingBottom: 3,
                                    fontSize: 14,
                                    color: hoveredQ === i && onSuggestedQuestion ? "#0066cc" : "#1d1d1f",
                                    lineHeight: 1.6,
                                    cursor: onSuggestedQuestion ? "pointer" : "default",
                                    transition: "color 0.12s, border-color 0.12s",
                                }}
                                title={onSuggestedQuestion ? "Click to use this question" : undefined}
                            >
                                {q}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Chat window

function ChatWindow({ messages, selectedRole, sending, role, onSuggestedQuestion }: {
    messages: ApiMessage[];
    selectedRole: string | null;
    sending: boolean;
    role?: ApiPlaybookRole;
    onSuggestedQuestion?: (q: string) => void;
}) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, sending]);

    if (!selectedRole) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#b0b0b0" }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <span style={{ fontSize: 13 }}>Select a stakeholder to begin your interview</span>
            </div>
        );
    }

    const filtered = messages.filter((m) => m.agent_name === selectedRole);

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {role && <OpeningCard role={role} onSuggestedQuestion={onSuggestedQuestion} />}
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
    );
}

function ChatBubble({ msg, roleName }: { msg: ApiMessage; roleName: string }) {
    const isStudent = msg.role === "student";
    const c = rc(roleName);

    return (
        <div style={{ display: "flex", flexDirection: isStudent ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
            {!isStudent && (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.accent, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {roleName.charAt(0)}
                </div>
            )}
            <div style={{ maxWidth: "72%", background: isStudent ? "#0066cc" : "#f0f0f5", color: isStudent ? "#fff" : "#1d1d1f", borderRadius: isStudent ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "9px 13px", fontSize: 13, lineHeight: 1.55, wordBreak: "break-word" }}>
                <ReactMarkdown components={{
                    p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                }}>{msg.content}</ReactMarkdown>
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
                width: 18, height: 18, borderRadius: "50%",
                background: isNew ? "#34c759" : "#e0f5e9",
                border: `1.5px solid ${isNew ? "#34c759" : "#b9efd4"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                animation: isNew ? "checkPop 0.35s ease-out" : undefined,
                transition: "background 0.3s",
            }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isNew ? "#fff" : "#1d8a4f"} strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
        );
    }
    return (
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #d0d0d0", background: "#fff", flexShrink: 0 }} />
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
        <div style={{ width: 272, flexShrink: 0, borderLeft: "1px solid #e0e0e0", background: "#fafafa", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px 14px" }}>

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

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Investigation Checklist
                    </div>
                    {totalItems > 0 && (
                        <span style={{ fontSize: 10, color: completedCount === totalItems ? "#1d8a4f" : "#7a7a7a", fontWeight: 600 }}>
                            {completedCount}/{totalItems}
                        </span>
                    )}
                </div>

                {checklistItems.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#b0b0b0", textAlign: "center", padding: "16px 0", lineHeight: 1.6 }}>
                        Start interviewing stakeholders to see your investigation tasks
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
                                    {/* Objective header */}
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

                                    {/* Checklist items */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 25 }}>
                                        {items.map(({ item, globalIndex }) => {
                                            const done = completedSet.has(globalIndex);
                                            const isNew = newlyCheckedItems.has(globalIndex);
                                            return (
                                                <div key={globalIndex} style={{
                                                    display: "flex", alignItems: "flex-start", gap: 8,
                                                    padding: "7px 9px",
                                                    borderRadius: 8,
                                                    background: isNew ? "#edfaf3" : done ? "#f8fffe" : "#ffffff",
                                                    border: `1px solid ${isNew ? "#b9efd4" : done ? "#d4edd8" : "#e8e8ed"}`,
                                                    animation: isNew ? "rowSlide 1.5s ease-out forwards" : undefined,
                                                }}>
                                                    <div style={{ marginTop: 1 }}>
                                                        <CheckIcon done={done} isNew={isNew} />
                                                    </div>
                                                    <span style={{ fontSize: 12, color: done ? "#5a5a5a" : "#1d1d1f", lineHeight: 1.45, textDecoration: done ? "line-through" : "none", flex: 1 }}>
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

                {/* Interview Progress */}
                <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                        Interview Progress
                    </div>
                    <div style={{ fontSize: 13, color: "#1d1d1f", marginBottom: 8 }}>
                        {rolesVisited.length} of {roles.length} agents interviewed
                    </div>
                    <div style={{ height: 5, background: "#e0e0e0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progressPct}%`, background: "#0066cc", borderRadius: 3, transition: "width 0.4s ease" }} />
                    </div>
                </div>

                {/* Tip */}
                {unvisited.length > 0 && (
                    <div style={{ marginTop: 14, background: "#fffbea", border: "1px solid #f0d060", borderRadius: 9, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, lineHeight: 1.55, color: "#7a4f00" }}>
                            <span style={{ fontWeight: 700 }}>Tip: </span>
                            You haven&apos;t interviewed the {unvisited.map((r) => r.name).join(" or ")}. Their data may change your recommendation.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Input area

function InputArea({ value, onChange, onSend, sending, disabled }: {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    sending: boolean;
    disabled: boolean;
}) {
    function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }

    const canSend = !disabled && !sending && value.trim().length > 0;

    return (
        <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 14px", background: "#ffffff", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={disabled || sending}
                    placeholder={disabled ? "Select a stakeholder to start interviewing…" : "Ask a question… (Enter to send, Shift+Enter for new line)"}
                    rows={2}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: 13, fontFamily: "SF Pro Text, system-ui", color: "#1d1d1f", resize: "none", outline: "none", lineHeight: 1.5, background: disabled ? "#f9f9fb" : "#fff", transition: "border-color 0.12s" }}
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
    const [infoSufficient, setInfoSufficient] = useState(false);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [inputText, setInputText]     = useState("");
    const [sending, setSending]         = useState(false);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);

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
                const visibleOnLoad = ev.evidence_board.filter((e) => e.visible !== false);
                setInfoSufficient(hasSufficientEvidence(session.interviewed_roles, visibleOnLoad));
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
            setMessages((prev) => [...prev, {
                id: `agent-${Date.now()}`, session_id: sessionId, role: "agent",
                agent_name: res.agent_name, content: res.reply, created_at: new Date().toISOString(),
            }]);
            setRolesVisited(res.roles_visited);
            setInfoSufficient(res.info_sufficient);

            // Evidence and checklist are processed in the background on the server.
            // Poll after a short delay to pick up the results.
            setTimeout(async () => {
                try {
                    const evidenceResult = await api.sessions.getEvidence(sessionId);
                    const allEvidence = evidenceResult.evidence_board;
                    setEvidence(allEvidence);
                    const completed = evidenceResult.checklist_completed ?? [];
                    setChecklistCompleted((prev) => {
                        const newItems = completed.filter((i: number) => !prev.includes(i));
                        if (newItems.length > 0) {
                            setNewlyCheckedItems(new Set(newItems));
                            setTimeout(() => setNewlyCheckedItems(new Set()), 3000);
                        }
                        return completed;
                    });
                    const visibleEvidence = allEvidence.filter((e: {visible?: boolean}) => e.visible !== false);
                    setInfoSufficient((prev) => prev || hasSufficientEvidence(res.roles_visited, visibleEvidence));
                } catch {
                    // Non-critical: evidence board will refresh on next interaction
                }
            }, 4000);
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setError("Failed to send. Please try again.");
        } finally {
            setSending(false);
        }
    }, [selectedRole, inputText, sending, sessionId, caseDetail]);

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
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "SF Pro Text, system-ui", overflow: "hidden", background: "#f5f5f7" }}>
            <TopBar
                caseName={caseName}
                rolesVisited={rolesVisited.length}
                total={roles.length}
                infoSufficient={infoSufficient}
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
                        onSelect={setSelectedRole}
                    />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#ffffff" }}>
                        <ChatWindow
                            messages={messages}
                            selectedRole={selectedRole}
                            sending={sending}
                            role={roles.find((r) => r.name === selectedRole)}
                            onSuggestedQuestion={(q) => setInputText(q)}
                        />
                        <InputArea
                            value={inputText}
                            onChange={setInputText}
                            onSend={handleSend}
                            sending={sending}
                            disabled={!selectedRole || sessionStatus !== "in_progress"}
                        />
                    </div>
                    <SummaryPanel
                        checklistItems={checklistItems}
                        checklistCompleted={checklistCompleted}
                        newlyCheckedItems={newlyCheckedItems}
                        teachingGoals={caseDetail?.case?.teaching_goals ?? []}
                        roles={roles}
                        rolesVisited={rolesVisited}
                    />
                </div>
            )}
        </div>
    );
}
