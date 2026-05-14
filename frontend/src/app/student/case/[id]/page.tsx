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
const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
    decision:   { bg: "#fff3e0", color: "#b75000" },
    analysis:   { bg: "#eef4ff", color: "#0044a8" },
    reflection: { bg: "#f0fdf4", color: "#166534" },
};
const DIFF_COLOR: Record<string, { bg: string; color: string }> = {
    easy:   { bg: "#f0fdf4", color: "#166534" },
    medium: { bg: "#fff7ed", color: "#9a3412" },
    hard:   { bg: "#fef2f2", color: "#991b1b" },
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
                    AI Business Simulator
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>{title}</div>
            {children}
        </div>
    );
}

function RoleCard({ role }: { role: ApiPlaybookRole }) {
    const c = roleColor(role.name);
    return (
        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>{role.name}</span>
            </div>
            <div style={{ fontSize: 11, color: "#7a7a7a" }}>{role.title}</div>
            <div style={{ fontSize: 12, color: "#3d3d3f", lineHeight: 1.4, marginTop: 2 }}>{role.focus_area}</div>
        </div>
    );
}

function StartButton({ session, loading, onClick }: {
    session: ApiSession | null;
    loading: boolean;
    onClick: () => void;
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
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: loading ? "#b0c8f0" : hovered ? "#0071e3" : "#0066cc", color: "#ffffff", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.15s", letterSpacing: "-0.1px" }}
        >
            {loading ? "Starting…" : label}
            {!loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            )}
        </button>
    );
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
            const newSession = await api.sessions.create(caseId, user.id);
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

    const typeStyle  = c ? (TYPE_COLOR[c.case_type]  ?? { bg: "#f5f5f7", color: "#7a7a7a" }) : null;
    const diffStyle  = c ? (DIFF_COLOR[c.difficulty] ?? { bg: "#f5f5f7", color: "#7a7a7a" }) : null;

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
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                {typeStyle && (
                                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: typeStyle.bg, color: typeStyle.color, letterSpacing: "0.02em" }}>
                                        {TYPE_LABEL[c.case_type] ?? c.case_type}
                                    </span>
                                )}
                                {diffStyle && (
                                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: diffStyle.bg, color: diffStyle.color, letterSpacing: "0.02em" }}>
                                        {difficultyLabel(c.difficulty)}
                                    </span>
                                )}
                                {assignment?.due_at && (
                                    <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "3px 10px" }}>
                                        Due {formatDue(assignment.due_at)}
                                    </span>
                                )}
                            </div>
                            <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 26, fontWeight: 700, color: "#1d1d1f", margin: "0 0 4px", letterSpacing: "-0.5px", lineHeight: 1.25 }}>
                                {c.title}
                            </h1>
                        </div>

                        <SectionCard title="Case Background">
                            <p style={{ fontSize: 14, color: "#3d3d3f", lineHeight: 1.65, margin: 0 }}>
                                {c.description ?? "No description available for this case."}
                            </p>
                        </SectionCard>

                        {detail?.playbook?.questions?.[0]?.text && (
                            <div style={{ background: "#fffbea", border: "1px solid #f0d060", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b75000" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#7a4f00", letterSpacing: "0.06em", textTransform: "uppercase" }}>Your Objective</span>
                                </div>
                                <p style={{ fontSize: 14, fontWeight: 500, color: "#3d2000", lineHeight: 1.65, margin: "0 0 12px" }}>
                                    {detail.playbook.questions[0].text}
                                </p>
                                {c.teaching_goals.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {c.teaching_goals.map((goal) => (
                                            <span key={goal} style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#fff3cd", color: "#7a4f00", border: "1px solid #f0d060" }}>
                                                {goal}
                                            </span>
                                        ))}
                                    </div>
                                )}
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
                                ].map(({ step, text }) => (
                                    <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#0066cc", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{step}</div>
                                        <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.5 }}>{text}</p>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>

                        {/* CTA */}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <StartButton session={session} loading={starting} onClick={handleStart} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
