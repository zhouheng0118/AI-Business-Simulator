"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api, ApiCase, ApiPlaybook, ApiPlaybookRole, ApiQuestion } from "@/lib/api";

const ROLE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    "CEO":                     { bg: "#eef4ff", border: "#bdd3ff", dot: "#0066cc" },
    "CFO":                     { bg: "#edfaf3", border: "#b9efd4", dot: "#1d8a4f" },
    "Operations Director":     { bg: "#fff7ed", border: "#fcd9a8", dot: "#c05c00" },
    "Customer Representative": { bg: "#f5f0ff", border: "#d6c4ff", dot: "#6b21a8" },
    "Local Expert":            { bg: "#edfafa", border: "#b2e8e8", dot: "#0e7490" },
};

function rc(name: string) {
    return ROLE_COLORS[name] ?? { bg: "#f5f5f7", border: "#e0e0e0", dot: "#7a7a7a" };
}

type Tab = "overview" | "roles" | "questions";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
    const tabs: { key: Tab; label: string }[] = [
        { key: "overview",  label: "Overview" },
        { key: "roles",     label: "Stakeholder Roles" },
        { key: "questions", label: "Discussion Questions" },
    ];
    return (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e0e0e0", marginBottom: 20 }}>
            {tabs.map((t) => (
                <button
                    key={t.key}
                    onClick={() => onChange(t.key)}
                    style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: active === t.key ? "2px solid #0066cc" : "2px solid transparent", color: active === t.key ? "#0066cc" : "#7a7a7a", fontSize: 13, fontWeight: active === t.key ? 600 : 400, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", marginBottom: -1, transition: "color 0.12s" }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function RoleCard({ role }: { role: ApiPlaybookRole }) {
    const c = rc(role.name);
    return (
        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f" }}>{role.name}</span>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>{role.title}</span>
            </div>
            {role.persona && (
                <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 10px", lineHeight: 1.5, fontStyle: "italic" }}>
                    "{role.persona}"
                </p>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Focus Area</div>
            <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 12px", lineHeight: 1.4 }}>{role.focus_area}</p>
            {role.allowed_info && role.allowed_info.length > 0 && (
                <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        Information this agent can share ({role.allowed_info.length} facts)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {role.allowed_info.map((fact, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <span style={{ color: c.dot, fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                                <span style={{ fontSize: 12, color: "#3d3d3f", lineHeight: 1.4 }}>{fact}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function QuestionCard({ question, index }: { question: ApiQuestion; index: number }) {
    const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
        decision:   { bg: "#fff3e0", color: "#b75000" },
        analysis:   { bg: "#eef4ff", color: "#0044a8" },
        reflection: { bg: "#f0fdf4", color: "#166534" },
    };
    const tc = TYPE_COLOR[question.type] ?? { bg: "#f5f5f7", color: "#7a7a7a" };
    const totalMax = question.rubric_dimensions.reduce((s, d) => s + d.weight, 0);

    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0066cc", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {index + 1}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tc.bg, color: tc.color, letterSpacing: "0.02em" }}>
                    {question.type.charAt(0).toUpperCase() + question.type.slice(1)}
                </span>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>{totalMax} points total</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: "0 0 14px", lineHeight: 1.5 }}>
                {question.text}
            </p>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>Rubric</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {question.rubric_dimensions.map((d) => (
                    <div key={d.name} style={{ background: "#f5f5f7", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#1d1d1f" }}>{d.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#0066cc" }}>{d.weight} pts</span>
                    </div>
                ))}
            </div>
        </div>
    );
}


export default function PlaybookReviewPage() {
    const router = useRouter();
    const params = useParams();
    const caseId = params.id as string;

    const [caseData, setCaseData]   = useState<ApiCase | null>(null);
    const [playbook, setPlaybook]   = useState<ApiPlaybook | null>(null);
    const [tab, setTab]             = useState<Tab>("overview");
    const [loading, setLoading]     = useState(true);
    const [approving, setApproving] = useState(false);
    const [error, setError]         = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "professor") { router.push("/dashboard/student"); return; }

        api.professor.getPendingPlaybook(caseId)
            .then(({ case: c, playbook: pb }) => {
                setCaseData(c);
                setPlaybook(pb);
            })
            .catch(() => setError("Could not load playbook. The case may not exist."))
            .finally(() => setLoading(false));
    }, [caseId, router]);

    async function handleApprove() {
        if (!playbook || approving) return;
        setApproving(true);
        try {
            await api.professor.approvePlaybook(caseId, playbook.id);
            router.push("/dashboard/professor");
        } catch {
            setError("Failed to approve. Please try again.");
            setApproving(false);
        }
    }

    async function handleReject() {
        if (!playbook) return;
        try {
            await api.professor.rejectPlaybook(caseId, playbook.id, "");
            router.push("/dashboard/professor");
        } catch {
            setError("Failed to reject. Please try again.");
        }
    }

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #e0e0e0", borderTopColor: "#0066cc", animation: "spin 0.9s linear infinite" }} />
                <span style={{ fontSize: 13, color: "#7a7a7a" }}>Loading playbook…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (error || !caseData || !playbook) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "20px 28px", fontSize: 13, color: "#991b1b", maxWidth: 400, textAlign: "center" }}>
                    {error ?? "Playbook not found."}
                    <div style={{ marginTop: 12 }}>
                        <button onClick={() => router.push("/dashboard/professor")} style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const roles = playbook.roles ?? [];
    const questions = playbook.questions ?? [];

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 10, height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", padding: "0 28px", gap: 16 }}>
                <button
                    onClick={() => router.push("/dashboard/professor")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#1d1d1f", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Dashboard
                </button>
                <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Review Playbook — {caseData.title}
                </span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                        onClick={handleReject}
                        style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#991b1b", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                    >
                        Reject
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 8, border: "none", background: approving ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: approving ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui" }}
                    >
                        {approving ? "Publishing…" : "Approve & Publish"}
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 60px" }}>

                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p style={{ fontSize: 12, color: "#78350f", margin: 0, lineHeight: 1.5 }}>
                        Review the AI-generated playbook below. Check that the stakeholder personas and allowed facts are accurate, then <strong>Approve & Publish</strong> to make this simulation available to students.
                    </p>
                </div>

                <TabBar active={tab} onChange={setTab} />

                {tab === "overview" && (
                    <>
                        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Case Metadata</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                                {[
                                    { label: "Type", value: caseData.case_type },
                                    { label: "Difficulty", value: caseData.difficulty },
                                    { label: "Status", value: playbook.review_status },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <div style={{ fontSize: 10, color: "#7a7a7a", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                                        <div style={{ fontSize: 13, color: "#1d1d1f", fontWeight: 500 }}>{value}</div>
                                    </div>
                                ))}
                            </div>
                            {caseData.description && (
                                <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.6 }}>{caseData.description}</p>
                            )}
                            {caseData.teaching_goals.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                                    {caseData.teaching_goals.map((g) => (
                                        <span key={g} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#eef4ff", color: "#0044a8", border: "1px solid #bdd3ff" }}>{g}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Generation Summary</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0066cc" }}>{roles.length}</div>
                                    <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>Stakeholder Roles</div>
                                </div>
                                <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0066cc" }}>{questions.length}</div>
                                    <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>Discussion Questions</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {tab === "roles" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Each role is an AI agent students can interview. Review the persona and the facts each agent is allowed to share.
                        </p>
                        {roles.map((role) => <RoleCard key={role.name} role={role} />)}
                    </>
                )}

                {tab === "questions" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Students answer these questions after completing their interviews. The rubric dimensions determine how each answer is scored.
                        </p>
                        {questions.map((q, i) => <QuestionCard key={q.id} question={q} index={i} />)}
                    </>
                )}
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
                    <button
                        onClick={handleReject}
                        style={{ padding: "10px 22px", borderRadius: 9, border: "1px solid #e0e0e0", background: "#fff", color: "#991b1b", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                    >
                        Reject Playbook
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: approving ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 13, fontWeight: 600, cursor: approving ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.1px" }}
                    >
                        {approving ? "Publishing…" : "Approve & Publish"}
                    </button>
                </div>
            </div>
        </div>
    );
}
