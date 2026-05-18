"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser, User } from "@/lib/auth";
import {
    api, ApiCaseDetail, ApiPlaybookRole, ApiSession,
    difficultyLabel, formatDue,
} from "@/lib/api";


const DEFAULT_ROLES: ApiPlaybookRole[] = [
    { name: "CEO",                   title: "Chief Executive Officer",  focus_area: "Strategic vision & growth pressure" },
    { name: "CFO",                   title: "Chief Financial Officer",   focus_area: "Cash flow & financial risk" },
    { name: "Operations Director",   title: "Operations Lead",           focus_area: "Supply chain & execution challenges" },
    { name: "Customer Representative", title: "Target Market Customer",  focus_area: "Consumer preferences & price sensitivity" },
    { name: "Local Expert",          title: "Market Consultant",         focus_area: "Rental costs & market nuances" },
];

const ROLE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    "CEO":                     { bg: "#eef4ff", border: "#bdd3ff", dot: "#0066cc" },
    "CFO":                     { bg: "#edfaf3", border: "#b9efd4", dot: "#1d8a4f" },
    "Operations Director":     { bg: "#fff7ed", border: "#fcd9a8", dot: "#c05c00" },
    "Customer Representative": { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8" },
    "Local Expert":            { bg: "#edfafa", border: "#b2e8e8", dot: "#0e7490" },
};

function roleColor(name: string) {
    return ROLE_COLORS[name] ?? { bg: "#f5f5f7", border: "#e0e0e0", dot: "#7a7a7a" };
}


const TYPE_LABEL: Record<string, string> = {
    decision: "Decision", analysis: "Analysis", reflection: "Reflection",
};
const HERO_GRADIENT: Record<string, string> = {
    easy: "linear-gradient(152deg, #14532d 0%, #166534 28%, #22c55e 62%, #86efac 100%)",
    medium: "linear-gradient(152deg, #172554 0%, #1e40af 30%, #3b82f6 65%, #93c5fd 100%)",
    hard: "linear-gradient(152deg, #450a0a 0%, #991b1b 32%, #ef4444 68%, #fca5a5 100%)",
};



function TopBar({ user, onBack }: { user: User; onBack: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <button
                    onClick={onBack}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 7, border: "1px solid #e0e0e0", background: hovered ? "#f5f5f7" : "#ffffff", color: "#1d1d1f", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s" }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    Back to Dashboard
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", fontFamily: "SF Pro Display, system-ui" }}>
                    AI Business Decision Simulation
                </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#7a7a7a" }}>{user.fullName}</span>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0066cc", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                    {user.fullName.charAt(0).toUpperCase()}
                </div>
            </div>
        </div>
    );
}

function SectionCard({
    title,
    children,
    accentColor,
}: {
    title: string;
    children: React.ReactNode;
    accentColor?: string;
}) {
    const isAccent = Boolean(accentColor);
    return (
        <div
            style={{
                background: "#ffffff",
                border: "1px solid #e0e0e0",
                borderRadius: 12,
                padding: "20px 24px",
                marginBottom: 16,
                borderLeft: isAccent ? `4px solid ${accentColor}` : "1px solid #e0e0e0",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                }}
            >
                {isAccent && (
                    <span
                        aria-hidden
                        style={{
                            width: 3,
                            height: 16,
                            borderRadius: 999,
                            background: accentColor,
                            flexShrink: 0,
                        }}
                    />
                )}
                <div
                    style={{
                        fontSize: isAccent ? 13 : 11,
                        fontWeight: 700,
                        color: isAccent ? "#1d4ed8" : "#7a7a7a",
                        letterSpacing: isAccent ? "0.01em" : "0.06em",
                        textTransform: isAccent ? "none" : "uppercase",
                    }}
                >
                    {title}
                </div>
            </div>
            {children}
        </div>
    );
}

const AGENT_ICONS: Record<string, string> = {
    "CEO":                     "/agent-icons/CEO.jpg",
    "CFO":                     "/agent-icons/CFO.jpg",
    "Operations Director":     "/agent-icons/Operation_director.jpg",
    "Head of Operations":      "/agent-icons/Operation_director.jpg",
    "Customer Representative": "/agent-icons/Customer_representative.jpg",
    "Customer Rep":            "/agent-icons/Customer_representative.jpg",
    "Local Expert":            "/agent-icons/Local_expert.jpg",
};

function RoleCard({ role }: { role: ApiPlaybookRole }) {
    const c = roleColor(role.name);
    const [hovered, setHovered] = useState(false);
    const initial = role.name.trim().charAt(0).toUpperCase();
    const iconSrc = AGENT_ICONS[role.name];
    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: c.bg,
                border: `1px solid ${hovered ? c.dot : c.border}`,
                borderRadius: 10,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                transform: hovered ? "translateY(-2px)" : "translateY(0)",
                boxShadow: hovered ? `0 8px 20px -12px ${c.dot}66` : "0 1px 2px rgba(15,23,42,0.06)",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                    aria-hidden
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: c.dot,
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        overflow: "hidden",
                    }}
                >
                    {iconSrc
                        ? <img src={iconSrc} alt={role.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : initial}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{role.name}</span>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{role.title}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#334155", lineHeight: 1.45, marginTop: 2 }}>{role.focus_area}</div>
        </div>
    );
}

function StartButton({ session, loading, onClick, wide = false }: {
    session: ApiSession | null;
    loading: boolean;
    onClick: () => void;
    wide?: boolean;
}) {
    const [hovered, setHovered] = useState(false);

    let label = "Start Interview";
    if (session?.status === "submitted" || session?.status === "scored") label = "View Report";
    else if (session) label = "Continue Interview";

    return (
        <button
            onClick={onClick}
            disabled={loading}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: wide ? "13px 26px" : "11px 24px",
                minWidth: wide ? 300 : undefined,
                width: wide ? "min(100%, 420px)" : undefined,
                borderRadius: 12,
                border: "none",
                background: loading
                    ? "#b0c8f0"
                    : "linear-gradient(132deg, #172554 0%, #1e40af 34%, #2563eb 70%, #4f46e5 100%)",
                color: "#ffffff",
                fontSize: wide ? 15 : 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "SF Pro Text, system-ui",
                transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
                letterSpacing: "-0.1px",
                transform: hovered && !loading ? "translateY(-1px)" : "translateY(0)",
                filter: hovered && !loading ? "brightness(1.06)" : "none",
                boxShadow: hovered && !loading
                    ? "0 10px 26px -12px rgba(37,99,235,0.65)"
                    : "0 4px 14px -8px rgba(30,64,175,0.55)",
            }}
        >
            {loading ? "Starting…" : label}
            {!loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            )}
        </button>
    );
}

const OBJECTIVE_HIGHLIGHT_RE = /(\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:m|million|b|billion|k|thousand))?|\d+\s?(?:million|billion|thousand|m|b|k)|recommend|decide|choose|prioritize|invest|approve|reject|defer|adopt|pivot)/gi;

function emphasizeObjectiveText(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    for (const match of text.matchAll(OBJECTIVE_HIGHLIGHT_RE)) {
        if (match.index === undefined) continue;
        if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
        nodes.push(
            <strong key={`objective-highlight-${match.index}`} style={{ fontWeight: 700, color: "#1e3a8a" }}>
                {match[0]}
            </strong>
        );
        cursor = match.index + match[0].length;
    }

    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}


export default function CaseDetailPage() {
    const router = useRouter();
    const params = useParams();
    const caseId = params.id as string;

    const [user, setUser]           = useState<User | null>(null);
    const [detail, setDetail]       = useState<ApiCaseDetail | null>(null);
    const [session, setSession]     = useState<ApiSession | null>(null);
    const [assignment, setAssignment] = useState<{ due_at: string | null } | null>(null);
    const [loading, setLoading]     = useState(true);
    const [starting, setStarting]   = useState(false);
    const [error, setError]         = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(u);

        Promise.all([
            api.cases.get(caseId),
            api.sessions.byStudent(u.id),
            api.assignments.byStudent(u.id),
        ])
            .then(([caseDetail, sessions, assignments]) => {
                setDetail(caseDetail);
                const existing = sessions.find((s) => s.case_id === caseId) ?? null;
                setSession(existing);
                const asgn = assignments.find((a) => a.case_id === caseId) ?? null;
                setAssignment(asgn);
            })
            .catch(() => setError("Could not load case. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [caseId, router]);

    async function handleStart() {
        if (!user || !detail) return;

        if (session?.status === "submitted" || session?.status === "scored") {
            router.push(`/student/session/${session.id}/report`);
            return;
        }
        if (session) {
            router.push(`/student/session/${session.id}`);
            return;
        }

        setStarting(true);
        try {
            const newSession = await api.sessions.create(caseId, user.id, user.fullName);
            router.push(`/student/session/${newSession.id}`);
        } catch {
            setError("Failed to start session. Please try again.");
            setStarting(false);
        }
    }

    if (!user) return null;

    const c = detail?.case;
    const roles: ApiPlaybookRole[] =
        detail?.playbook?.roles?.length ? detail.playbook.roles : DEFAULT_ROLES;

    const heroGradient = c ? (HERO_GRADIENT[c.difficulty] ?? HERO_GRADIENT.medium) : HERO_GRADIENT.medium;
    const descriptionText = c?.description?.trim() || "No description available for this case.";
    const descriptionParagraphs = descriptionText
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui" }}>
            {user && <TopBar user={user} onBack={() => router.push("/dashboard/student")} />}

            <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 48px" }}>

                {/* Loading skeleton */}
                {loading && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {[200, 120, 180].map((h, i) => (
                            <div key={i} style={{ height: h, borderRadius: 12, background: "#e8e8ed", animation: "pulse 1.5s ease-in-out infinite" }} />
                        ))}
                        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
                    </div>
                )}

                {error && (
                    <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#991b1b" }}>
                        {error}
                    </div>
                )}

                {!loading && !error && c && (
                    <>
                        <div
                            style={{
                                marginBottom: 20,
                                borderRadius: 16,
                                overflow: "hidden",
                                position: "relative",
                                background: heroGradient,
                                padding: "24px 24px 20px",
                            }}
                        >
                            <div
                                aria-hidden
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    background: "linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.24) 100%)",
                                }}
                            />
                            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        background: "rgba(255,255,255,0.08)",
                                        border: "1px solid rgba(255,255,255,0.42)",
                                        color: "rgba(255,255,255,0.96)",
                                        letterSpacing: "0.03em",
                                    }}
                                >
                                    {TYPE_LABEL[c.case_type] ?? c.case_type}
                                </span>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        background: "rgba(255,255,255,0.08)",
                                        border: "1px solid rgba(255,255,255,0.42)",
                                        color: "rgba(255,255,255,0.96)",
                                        letterSpacing: "0.03em",
                                    }}
                                >
                                    {difficultyLabel(c.difficulty)}
                                </span>
                                {assignment?.due_at && (
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: "rgba(255,255,255,0.86)",
                                            border: "1px solid rgba(255,255,255,0.28)",
                                            borderRadius: 999,
                                            padding: "4px 10px",
                                        }}
                                    >
                                        Due {formatDue(assignment.due_at)}
                                    </span>
                                )}
                            </div>
                            <h1
                                style={{
                                    position: "relative",
                                    zIndex: 1,
                                    fontFamily: "SF Pro Display, system-ui",
                                    fontSize: "clamp(30px, 4vw, 36px)",
                                    fontWeight: 800,
                                    color: "#f8fbff",
                                    margin: 0,
                                    letterSpacing: "-0.7px",
                                    lineHeight: 1.15,
                                    textShadow: "0 2px 16px rgba(15,23,42,0.24)",
                                }}
                            >
                                {c.title}
                            </h1>
                        </div>

                        <SectionCard title="Case Background" accentColor="#3b82f6">
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {descriptionParagraphs.map((paragraph, index) => (
                                    <p
                                        key={`case-background-p-${index}`}
                                        style={{
                                            fontSize: 15,
                                            color: "#334155",
                                            lineHeight: 1.8,
                                            margin: 0,
                                        }}
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                        </SectionCard>

                        {c.teaching_goals.length > 0 && (
                            <SectionCard title="Learning objectives">
                                <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                                    {c.teaching_goals.map((goal, idx) => (
                                        <li
                                            key={idx}
                                            style={{ fontSize: 14, color: "#3d3d3f", lineHeight: 1.65, paddingLeft: 4 }}
                                        >
                                            {goal}
                                        </li>
                                    ))}
                                </ol>
                            </SectionCard>
                        )}

                        {detail?.playbook?.questions?.[0]?.text && (
                            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a", letterSpacing: "0.08em", textTransform: "uppercase" }}>Your Objective</span>
                                </div>
                                <p style={{ fontSize: 15, fontWeight: 500, color: "#1e3a8a", lineHeight: 1.75, margin: 0 }}>
                                    {emphasizeObjectiveText(detail.playbook.questions[0].text)}
                                </p>
                            </div>
                        )}

                        <SectionCard title="Available Interviewees">
                            <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                                You can interview the following stakeholders to gather information before submitting your analysis.
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                                {roles.map((role) => (
                                    <RoleCard key={role.name} role={role} />
                                ))}
                            </div>
                        </SectionCard>

                        {/* What to do */}
                        <SectionCard title="How It Works">
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {[
                                    { step: "1", text: "Interview stakeholders to collect information and build your evidence board." },
                                    { step: "2", text: "Once you have gathered enough evidence, proceed to the answer submission." },
                                    { step: "3", text: "Submit your analysis and receive a detailed debrief report with scoring." },
                                ].map(({ step, text }, idx, arr) => (
                                    <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                        <div style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", position: "relative" }}>
                                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, zIndex: 1 }}>{step}</div>
                                            {idx < arr.length - 1 && (
                                                <span
                                                    aria-hidden
                                                    style={{
                                                        position: "absolute",
                                                        top: 24,
                                                        bottom: -12,
                                                        borderLeft: "1px dashed #93c5fd",
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.5 }}>{text}</p>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <StartButton session={session} loading={starting} onClick={handleStart} wide />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
