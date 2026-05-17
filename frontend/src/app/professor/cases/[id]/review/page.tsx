"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api, ApiCase, ApiPlaybook, ApiPlaybookRole, ApiQuestion, ApiInfoAtom, difficultyLabel } from "@/lib/api";
import InfoLayersTab from "@/components/InfoLayersTab";

const WINE = {
    primary: "#b91c1c",
    deep: "#7f1d1d",
    softBg: "#fef2f2",
    softBorder: "#fecaca",
    softText: "#991b1b",
};

const ROLE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    "CEO":                     { bg: "#dbeafe", border: "#93c5fd", dot: "#0057b8" },
    "CFO":                     { bg: "#dcfce7", border: "#86efac", dot: "#157f47" },
    "Operations Director":     { bg: "#ffedd5", border: "#fdba74", dot: "#a84e00" },
    "Customer Representative": { bg: "#ede9fe", border: "#c4b5fd", dot: "#5b1e9a" },
    "Local Expert":            { bg: "#cffafe", border: "#67e8f9", dot: "#0b6b84" },
};

function rc(name: string) {
    return ROLE_COLORS[name] ?? { bg: "#f5f5f7", border: "#e0e0e0", dot: "#7a7a7a" };
}

type Tab = "overview" | "roles" | "questions" | "layers";

const TAB_ITEMS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "roles", label: "Stakeholder Roles" },
    { key: "questions", label: "Discussion Questions" },
    { key: "layers", label: "Information Layers" },
];

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
                    {role.persona}
                </p>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Focus Area</div>
            <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 12px", lineHeight: 1.4 }}>{role.focus_area}</p>
            {role.allowed_info && role.allowed_info.length > 0 && (
                <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 7 }}>
                        Shareable Facts ({role.allowed_info.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {role.allowed_info.map((fact, i) => (
                            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#ffffffaa", border: `1px solid ${c.border}`, borderRadius: 8, padding: "6px 9px" }}>
                                <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: `${c.dot}22`, color: c.dot, fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center", flexShrink: 0, marginTop: 1 }}>
                                    {i + 1}
                                </span>
                                <span style={{ fontSize: 12, color: "#334155", lineHeight: 1.45 }}>{fact}</span>
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
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: WINE.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                        <span style={{ fontSize: 11, fontWeight: 700, color: WINE.softText, background: WINE.softBg, border: `1px solid ${WINE.softBorder}`, borderRadius: 999, padding: "3px 8px", lineHeight: 1 }}>
                            {d.weight} pts
                        </span>
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
    const [visitedTabs, setVisitedTabs] = useState<Record<Tab, boolean>>({
        overview: true,
        roles: false,
        questions: false,
        layers: false,
    });
    const [loading, setLoading]     = useState(true);
    const [approving, setApproving] = useState(false);
    const [atomsSaving, setAtomsSaving] = useState(false);
    const [atomsError, setAtomsError]   = useState<string | null>(null);
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

    async function handleSaveAtoms(atoms: ApiInfoAtom[]) {
        if (!playbook || atomsSaving) return;
        setAtomsSaving(true);
        setAtomsError(null);
        try {
            await api.professor.updateInfoAtoms(caseId, playbook.id, atoms);
            setPlaybook({ ...playbook, info_atoms: atoms });
        } catch {
            setAtomsError("Failed to save. Please try again.");
            throw new Error("save failed");
        } finally {
            setAtomsSaving(false);
        }
    }

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #e0e0e0", borderTopColor: WINE.primary, animation: "spin 0.9s linear infinite" }} />
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
    const reviewedCount = TAB_ITEMS.filter((t) => visitedTabs[t.key]).length;
    const remainingCount = TAB_ITEMS.length - reviewedCount;
    const contentMaxWidth = tab === "layers" ? 1180 : 860;
    const actionBarMaxWidth = tab === "layers" ? 1180 : 860;
    const diffLabel = difficultyLabel(caseData.difficulty);
    const diffBadge: Record<string, { bg: string; color: string; border: string }> = {
        Beginner: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
        Intermediate: { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
        Advanced: { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
    };

    function handleTabChange(nextTab: Tab) {
        setTab(nextTab);
        setVisitedTabs((prev) => ({ ...prev, [nextTab]: true }));
    }


    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", position: "relative" }}>
            {/* Sticky top bar with slim info */}
            <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #e0e0e0" }}>
                <div style={{ display: "flex", alignItems: "center", height: 40, padding: "0 28px", gap: 16 }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "0 12px", height: 28 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 0 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span style={{ fontSize: 12, color: "#78350f" }}>Review the AI-generated playbook and approve to publish.</span>
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: contentMaxWidth, margin: "0 auto", padding: "24px 24px 100px", transition: "max-width 0.22s ease" }}>

                {/* Pill-style tab bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
                    <div style={{ display: "flex", gap: 8, background: "#f5f5f7", padding: 4, borderRadius: 9999, width: "fit-content" }}>
                        {TAB_ITEMS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => handleTabChange(t.key)}
                            style={{
                                padding: "8px 22px",
                                border: "none",
                                borderRadius: 9999,
                                background: tab === t.key ? WINE.softBg : "transparent",
                                color: tab === t.key ? WINE.softText : "#64748b",
                                fontWeight: tab === t.key ? 700 : 500,
                                fontSize: 13,
                                cursor: "pointer",
                                fontFamily: "SF Pro Text, system-ui",
                                boxShadow: tab === t.key ? "0 1px 4px #fecaca88" : undefined,
                                transition: "background 0.13s, color 0.13s"
                            }}
                        >
                            <span>{t.label}</span>
                            {visitedTabs[t.key] && (
                                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: WINE.primary }}>✓</span>
                            )}
                        </button>
                    ))}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>
                        Reviewed {reviewedCount}/{TAB_ITEMS.length} · {remainingCount} remaining
                    </div>
                </div>

                {tab === "overview" && (
                    <>
                        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Case Metadata</div>
                            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: WINE.softBg, color: WINE.softText, border: `1px solid ${WINE.softBorder}`, fontWeight: 600 }}>{caseData.case_type}</span>
                                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: (diffBadge[diffLabel] ?? { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" }).bg, color: (diffBadge[diffLabel] ?? { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" }).color, border: `1px solid ${(diffBadge[diffLabel] ?? { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" }).border}`, fontWeight: 600 }}>{diffLabel}</span>
                                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: playbook.review_status === "published" ? "#fee2e2" : "#f5f5f7", color: playbook.review_status === "published" ? "#b91c1c" : "#64748b", border: "1px solid #e0e0e0", fontWeight: 600 }}>{playbook.review_status}</span>
                            </div>
                            {caseData.description && (
                                <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.6 }}>{caseData.description}</p>
                            )}
                            {caseData.teaching_goals.length > 0 && (
                                <blockquote style={{ margin: "14px 0 0 0", padding: "10px 16px", background: "#fff1f2", borderLeft: `4px solid ${WINE.primary}`, borderRadius: 7, color: "#4c0519", fontSize: 13, fontStyle: "italic", fontWeight: 500 }}>
                                    {caseData.teaching_goals.map((g, i) => (
                                        <div key={g} style={{ marginBottom: i < caseData.teaching_goals.length - 1 ? 6 : 0 }}>{g}</div>
                                    ))}
                                </blockquote>
                            )}
                        </div>

                        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Generation Summary</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={WINE.primary} strokeWidth="2" strokeLinecap="round" style={{ marginBottom: 2 }}><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: WINE.primary }}>{roles.length}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Stakeholder Roles<br /><span style={{ fontWeight: 400, fontSize: 11 }}>AI agents students can interview</span></div>
                                </div>
                                <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={WINE.primary} strokeWidth="2" strokeLinecap="round" style={{ marginBottom: 2 }}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 15h8M8 12h8" /></svg>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: WINE.primary }}>{questions.length}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Discussion Questions<br /><span style={{ fontWeight: 400, fontSize: 11 }}>Students answer after interviews</span></div>
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

                {tab === "layers" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Review and edit how case facts are distributed between the basic layer (visible to students upfront) and the hidden layer (unlocked through conversation).
                        </p>
                        {atomsError && (
                            <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#991b1b" }}>
                                {atomsError}
                            </div>
                        )}
                        <InfoLayersTab
                            key={playbook.id}
                            atoms={playbook.info_atoms ?? []}
                            roles={roles}
                            saving={atomsSaving}
                            onSave={handleSaveAtoms}
                        />
                    </>
                )}

                {/* Sticky bottom action bar */}
                <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "#fff", borderTop: "1px solid #e0e0e0", boxShadow: "0 -2px 12px #0001", padding: "14px 0" }}>
                    <div style={{ maxWidth: actionBarMaxWidth, margin: "0 auto", display: "flex", justifyContent: "flex-end", gap: 6, padding: "0 24px", transition: "max-width 0.22s ease" }}>
                        <button
                            onClick={handleReject}
                            style={{ minWidth: 132, padding: "10px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#991b1b", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Reject Playbook
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={approving}
                            style={{ minWidth: 208, padding: "10px 24px", borderRadius: 9, border: "none", background: approving ? "#fca5a5" : "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 55%, #dc2626 100%)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: approving ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.1px" }}
                        >
                            {approving ? "Publishing…" : "Approve & Publish"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
