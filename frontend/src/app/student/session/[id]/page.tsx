"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser, User } from "@/lib/auth";
import {
    api, ApiCaseDetail, ApiPlaybookRole, ApiMessage, ApiEvidence,
} from "@/lib/api";


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
    "Operations Director":     { bg: "#fff7ed", border: "#fcd9a8", dot: "#c05c00", accent: "#c05c00" },
    "Customer Representative": { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8", accent: "#6b21a8" },
    "Local Expert":            { bg: "#edfafa", border: "#b2e8e8", dot: "#0e7490", accent: "#0e7490" },
};

function rc(name: string) {
    return ROLE_COLORS[name] ?? { bg: "#f5f5f7", border: "#e0e0e0", dot: "#7a7a7a", accent: "#7a7a7a" };
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

// Chat window

function ChatWindow({ messages, selectedRole, sending }: {
    messages: ApiMessage[];
    selectedRole: string | null;
    sending: boolean;
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
            {filtered.length === 0 && !sending && (
                <div style={{ textAlign: "center", color: "#b0b0b0", fontSize: 12, marginTop: 24 }}>
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
                {msg.content}
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

// Summary panel (right sidebar)

const EVIDENCE_CATEGORY: Record<string, { label: string; bg: string; color: string }> = {
    "CEO":                     { label: "Strategic",   bg: "#f5f0ff", color: "#6b21a8" },
    "CFO":                     { label: "Financial",   bg: "#fff7ed", color: "#c05c00" },
    "Operations Director":     { label: "Operational", bg: "#edfaf3", color: "#1d8a4f" },
    "Customer Representative": { label: "Market",      bg: "#eef4ff", color: "#0044a8" },
    "Local Expert":            { label: "Market",      bg: "#eef4ff", color: "#0044a8" },
};

const ROLE_DATA_HINTS: Record<string, string> = {
    "CEO":                     "strategic direction data missing",
    "CFO":                     "financial risk data missing",
    "Operations Director":     "execution cost data missing",
    "Customer Representative": "demand validation missing",
    "Local Expert":            "rental cost data missing",
};

function evidenceCategory(source: string) {
    return EVIDENCE_CATEGORY[source] ?? { label: "General", bg: "#f5f5f7", color: "#7a7a7a" };
}

function SummaryPanel({ evidence, roles, rolesVisited }: {
    evidence: ApiEvidence[];
    roles: ApiPlaybookRole[];
    rolesVisited: string[];
}) {
    const unvisited = roles.filter((r) => !rolesVisited.includes(r.name));
    const progressPct = roles.length > 0 ? (rolesVisited.length / roles.length) * 100 : 0;

    return (
        <div style={{ width: 260, flexShrink: 0, borderLeft: "1px solid #e0e0e0", background: "#fafafa", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px 14px" }}>

                {/* Evidence section */}
                <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                    Evidence Board
                </div>

                {evidence.length === 0 && unvisited.length === roles.length && (
                    <div style={{ fontSize: 12, color: "#b0b0b0", textAlign: "center", padding: "16px 0" }}>
                        Interview stakeholders to collect evidence
                    </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {evidence.map((item, i) => {
                        const cat = evidenceCategory(item.source);
                        return (
                            <div key={i} style={{ background: "#ffffff", border: "1px solid #e8e8ed", borderRadius: 9, padding: "9px 11px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: cat.bg, color: cat.color }}>{cat.label}</span>
                                    <span style={{ fontSize: 10, color: "#b0b0b0" }}>{item.source}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "#1d1d1f", lineHeight: 1.5 }}>{item.key_info}</div>
                                {item.data && <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 4 }}>Data: {item.data}</div>}
                                {item.risk && <div style={{ fontSize: 11, color: "#b75000", marginTop: 2 }}>Risk: {item.risk}</div>}
                            </div>
                        );
                    })}

                    {unvisited.map((role) => (
                        <div key={role.name} style={{ border: "1px dashed #d0d0d0", borderRadius: 9, padding: "9px 11px" }}>
                            <div style={{ fontSize: 12, color: "#b0b0b0", lineHeight: 1.45 }}>
                                <span style={{ fontWeight: 600 }}>{role.name}</span> not interviewed — {ROLE_DATA_HINTS[role.name] ?? "data missing"}
                            </div>
                        </div>
                    ))}
                </div>

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
        setInputText("");
        setSending(true);

        const tempId = `temp-${Date.now()}`;
        setMessages((prev) => [...prev, {
            id: tempId, session_id: sessionId, role: "student",
            agent_name: selectedRole, content: text, created_at: new Date().toISOString(),
        }]);

        try {
            const res = await api.sessions.sendMessage(sessionId, selectedRole, text);
            setMessages((prev) => [...prev, {
                id: `agent-${Date.now()}`, session_id: sessionId, role: "agent",
                agent_name: res.agent_name, content: res.reply, created_at: new Date().toISOString(),
            }]);
            if (res.new_evidence.length > 0) {
                setEvidence((prev) => {
                    const seen = new Set(prev.map((e) => `${e.source}::${e.key_info}`));
                    return [...prev, ...res.new_evidence.filter((e) => !seen.has(`${e.source}::${e.key_info}`))];
                });
            }
            setRolesVisited(res.roles_visited);
            setInfoSufficient(res.info_sufficient);
        } catch {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setError("Failed to send. Please try again.");
        } finally {
            setSending(false);
        }
    }, [selectedRole, inputText, sending, sessionId]);

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
                        evidence={evidence}
                        roles={roles}
                        rolesVisited={rolesVisited}
                    />
                </div>
            )}
        </div>
    );
}
