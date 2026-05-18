"use client";

import { useEffect, useState, useCallback } from "react";
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

// ── Shared edit button ────────────────────────────────────────────────────────

function EditBtn({ editing, onEdit, onSave, onCancel, saving }: {
    editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void; saving?: boolean;
}) {
    if (!editing) {
        return (
            <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "1px solid #e0e0e0", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Edit
            </button>
        );
    }
    return (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={onCancel} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e0e0e0", background: "#fff", color: "#64748b", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}>
                Cancel
            </button>
            <button onClick={onSave} disabled={saving} style={{ padding: "5px 14px", borderRadius: 7, border: "none", background: saving ? "#fca5a5" : WINE.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui" }}>
                {saving ? "Saving…" : "Save"}
            </button>
        </div>
    );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ caseData, playbook, onSaved }: {
    caseData: ApiCase; playbook: ApiPlaybook; onSaved: (desc: string, goals: string[]) => void;
}) {
    const diffLabel = difficultyLabel(caseData.difficulty);
    const diffBadge: Record<string, { bg: string; color: string; border: string }> = {
        Beginner:     { bg: "#dcfce7", color: "#166534", border: "#86efac" },
        Intermediate: { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
        Advanced:     { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
    };
    const db = diffBadge[diffLabel] ?? { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" };

    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);
    const [desc, setDesc]       = useState(caseData.description ?? "");
    const [goals, setGoals]     = useState<string[]>(caseData.teaching_goals ?? []);
    const [goalDraft, setGoalDraft] = useState(caseData.teaching_goals?.join("\n") ?? "");
    const [error, setError]     = useState<string | null>(null);

    function handleEdit() { setEditing(true); setGoalDraft(goals.join("\n")); setError(null); }
    function handleCancel() { setDesc(caseData.description ?? ""); setGoals(caseData.teaching_goals ?? []); setGoalDraft((caseData.teaching_goals ?? []).join("\n")); setEditing(false); setError(null); }

    async function handleSave() {
        setSaving(true); setError(null);
        const newGoals = goalDraft.split("\n").map(s => s.trim()).filter(Boolean);
        try {
            await api.professor.updatePlaybookContent(caseData.id, playbook.id, {
                description: desc,
                teaching_goals: newGoals,
            });
            setGoals(newGoals);
            setEditing(false);
            onSaved(desc, newGoals);
        } catch { setError("Failed to save. Please try again."); }
        finally { setSaving(false); }
    }

    return (
        <>
            <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase" }}>Case Metadata</div>
                    <EditBtn editing={editing} onEdit={handleEdit} onSave={handleSave} onCancel={handleCancel} saving={saving} />
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: WINE.softBg, color: WINE.softText, border: `1px solid ${WINE.softBorder}`, fontWeight: 600 }}>{caseData.case_type}</span>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: db.bg, color: db.color, border: `1px solid ${db.border}`, fontWeight: 600 }}>{diffLabel}</span>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: playbook.review_status === "published" ? "#fee2e2" : "#f5f5f7", color: playbook.review_status === "published" ? "#b91c1c" : "#64748b", border: "1px solid #e0e0e0", fontWeight: 600 }}>{playbook.review_status}</span>
                </div>

                {editing ? (
                    <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5 }}>Description</div>
                        <textarea
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                            rows={4}
                            style={{ width: "100%", fontSize: 13, lineHeight: 1.6, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginTop: 12, marginBottom: 5 }}>Teaching Goals <span style={{ fontWeight: 400 }}>(one per line)</span></div>
                        <textarea
                            value={goalDraft}
                            onChange={e => setGoalDraft(e.target.value)}
                            rows={4}
                            style={{ width: "100%", fontSize: 13, lineHeight: 1.6, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                        {error && <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{error}</div>}
                    </>
                ) : (
                    <>
                        {desc && <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.6 }}>{desc}</p>}
                        {goals.length > 0 && (
                            <blockquote style={{ margin: "14px 0 0 0", padding: "10px 16px", background: "#fff1f2", borderLeft: `4px solid ${WINE.primary}`, borderRadius: 7, color: "#4c0519", fontSize: 13, fontStyle: "italic", fontWeight: 500 }}>
                                {goals.map((g, i) => <div key={g} style={{ marginBottom: i < goals.length - 1 ? 6 : 0 }}>{g}</div>)}
                            </blockquote>
                        )}
                    </>
                )}
            </div>

            <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Generation Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={WINE.primary} strokeWidth="2" strokeLinecap="round" style={{ marginBottom: 2 }}><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                        <div style={{ fontSize: 28, fontWeight: 700, color: WINE.primary }}>{playbook.roles?.length ?? 0}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Stakeholder Roles<br /><span style={{ fontWeight: 400, fontSize: 11 }}>AI agents students can interview</span></div>
                    </div>
                    <div style={{ background: "#f5f5f7", borderRadius: 8, padding: "14px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={WINE.primary} strokeWidth="2" strokeLinecap="round" style={{ marginBottom: 2 }}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 15h8M8 12h8" /></svg>
                        <div style={{ fontSize: 28, fontWeight: 700, color: WINE.primary }}>{playbook.questions?.length ?? 0}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Discussion Questions<br /><span style={{ fontWeight: 400, fontSize: 11 }}>Students answer after interviews</span></div>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Roles tab ─────────────────────────────────────────────────────────────────

function RoleCard({ role, onSave }: { role: ApiPlaybookRole; onSave: (updated: ApiPlaybookRole) => Promise<void> }) {
    const c = rc(role.name);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const [draft, setDraft]     = useState<ApiPlaybookRole>(role);
    const [factsDraft, setFactsDraft] = useState((role.allowed_info ?? []).join("\n"));

    function handleEdit() { setDraft(role); setFactsDraft((role.allowed_info ?? []).join("\n")); setEditing(true); setError(null); }
    function handleCancel() { setDraft(role); setFactsDraft((role.allowed_info ?? []).join("\n")); setEditing(false); setError(null); }

    async function handleSave() {
        setSaving(true); setError(null);
        const newFacts = factsDraft.split("\n").map(s => s.trim()).filter(Boolean);
        const updated = { ...draft, allowed_info: newFacts };
        try {
            await onSave(updated);
            setEditing(false);
        } catch { setError("Failed to save. Please try again."); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f" }}>{role.name}</span>
                    <span style={{ fontSize: 11, color: "#7a7a7a" }}>{role.title}</span>
                </div>
                <EditBtn editing={editing} onEdit={handleEdit} onSave={handleSave} onCancel={handleCancel} saving={saving} />
            </div>

            {editing ? (
                <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Persona</div>
                    <textarea
                        value={draft.persona ?? ""}
                        onChange={e => setDraft(d => ({ ...d, persona: e.target.value }))}
                        rows={3}
                        style={{ width: "100%", fontSize: 12, lineHeight: 1.5, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", marginBottom: 10, boxSizing: "border-box", fontStyle: "italic" }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Focus Area</div>
                    <textarea
                        value={draft.focus_area ?? ""}
                        onChange={e => setDraft(d => ({ ...d, focus_area: e.target.value }))}
                        rows={2}
                        style={{ width: "100%", fontSize: 12, lineHeight: 1.5, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", marginBottom: 10, boxSizing: "border-box" }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Shareable Facts <span style={{ fontWeight: 400 }}>(one per line)</span></div>
                    <textarea
                        value={factsDraft}
                        onChange={e => setFactsDraft(e.target.value)}
                        rows={Math.max(4, (role.allowed_info?.length ?? 0) + 1)}
                        style={{ width: "100%", fontSize: 12, lineHeight: 1.5, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                    />
                    {error && <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{error}</div>}
                </>
            ) : (
                <>
                    {role.persona && (
                        <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 10px", lineHeight: 1.5, fontStyle: "italic" }}>"{role.persona}"</p>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>Focus Area</div>
                    <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 12px", lineHeight: 1.4 }}>{role.focus_area}</p>
                    {role.allowed_info && role.allowed_info.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 7 }}>Shareable Facts ({role.allowed_info.length})</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {role.allowed_info.map((fact, i) => (
                                    <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#ffffffaa", border: `1px solid ${c.border}`, borderRadius: 8, padding: "6px 9px" }}>
                                        <span style={{ minWidth: 18, height: 18, borderRadius: "50%", background: `${c.dot}22`, color: c.dot, fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                                        <span style={{ fontSize: 12, color: "#334155", lineHeight: 1.45 }}>{fact}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── Questions tab ─────────────────────────────────────────────────────────────

function QuestionCard({ question, index, onSave }: {
    question: ApiQuestion; index: number; onSave: (updated: ApiQuestion) => Promise<void>;
}) {
    const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
        decision:   { bg: "#fff3e0", color: "#b75000" },
        analysis:   { bg: "#eef4ff", color: "#0044a8" },
        reflection: { bg: "#f0fdf4", color: "#166534" },
    };
    const tc = TYPE_COLOR[question.type] ?? { bg: "#f5f5f7", color: "#7a7a7a" };
    const totalMax = question.rubric_dimensions.reduce((s, d) => s + d.weight, 0);

    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const [draft, setDraft]     = useState<ApiQuestion>(question);

    function handleEdit() { setDraft(question); setEditing(true); setError(null); }
    function handleCancel() { setDraft(question); setEditing(false); setError(null); }

    async function handleSave() {
        setSaving(true); setError(null);
        try { await onSave(draft); setEditing(false); }
        catch { setError("Failed to save. Please try again."); }
        finally { setSaving(false); }
    }

    function updateDimension(i: number, field: "name" | "weight", value: string | number) {
        setDraft(d => {
            const dims = d.rubric_dimensions.map((dim, idx) =>
                idx === i ? { ...dim, [field]: field === "weight" ? Number(value) : value } : dim
            );
            return { ...d, rubric_dimensions: dims };
        });
    }

    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: WINE.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tc.bg, color: tc.color, letterSpacing: "0.02em" }}>
                        {question.type.charAt(0).toUpperCase() + question.type.slice(1)}
                    </span>
                    <span style={{ fontSize: 11, color: "#7a7a7a" }}>{totalMax} points total</span>
                </div>
                <EditBtn editing={editing} onEdit={handleEdit} onSave={handleSave} onCancel={handleCancel} saving={saving} />
            </div>

            {editing ? (
                <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5 }}>Question Text</div>
                    <textarea
                        value={draft.text}
                        onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                        rows={3}
                        style={{ width: "100%", fontSize: 13, lineHeight: 1.5, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", fontFamily: "SF Pro Text, system-ui", fontWeight: 600, resize: "vertical", outline: "none", marginBottom: 14, boxSizing: "border-box" }}
                    />
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>Rubric Dimensions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {draft.rubric_dimensions.map((d, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                    value={d.name}
                                    onChange={e => updateDimension(i, "name", e.target.value)}
                                    style={{ flex: 1, fontSize: 12, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 7, padding: "7px 10px", fontFamily: "SF Pro Text, system-ui", outline: "none" }}
                                    placeholder="Dimension name"
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={d.weight}
                                        onChange={e => updateDimension(i, "weight", e.target.value)}
                                        style={{ width: 60, fontSize: 12, color: "#1d1d1f", border: "1px solid #cbd5e1", borderRadius: 7, padding: "7px 10px", fontFamily: "SF Pro Text, system-ui", outline: "none", textAlign: "center" }}
                                    />
                                    <span style={{ fontSize: 11, color: "#64748b" }}>pts</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {error && <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{error}</div>}
                </>
            ) : (
                <>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: "0 0 14px", lineHeight: 1.5 }}>{question.text}</p>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>Rubric</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {question.rubric_dimensions.map((d) => (
                            <div key={d.name} style={{ background: "#f5f5f7", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "#1d1d1f" }}>{d.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: WINE.softText, background: WINE.softBg, border: `1px solid ${WINE.softBorder}`, borderRadius: 999, padding: "3px 8px", lineHeight: 1 }}>{d.weight} pts</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlaybookReviewPage() {
    const router = useRouter();
    const params = useParams();
    const caseId = params.id as string;

    const [caseData, setCaseData]   = useState<ApiCase | null>(null);
    const [playbook, setPlaybook]   = useState<ApiPlaybook | null>(null);
    const [tab, setTab]             = useState<Tab>("overview");
    const [visitedTabs, setVisitedTabs] = useState<Record<Tab, boolean>>({
        overview: true, roles: false, questions: false, layers: false,
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
            .then(({ case: c, playbook: pb }) => { setCaseData(c); setPlaybook(pb); })
            .catch(() => setError("Could not load playbook. The case may not exist."))
            .finally(() => setLoading(false));
    }, [caseId, router]);

    async function handleApprove() {
        if (!playbook || approving) return;
        setApproving(true);
        try { await api.professor.approvePlaybook(caseId, playbook.id); router.push("/dashboard/professor"); }
        catch { setError("Failed to approve. Please try again."); setApproving(false); }
    }

    async function handleReject() {
        if (!playbook) return;
        try { await api.professor.rejectPlaybook(caseId, playbook.id, ""); router.push("/dashboard/professor"); }
        catch { setError("Failed to reject. Please try again."); }
    }

    async function handleSaveAtoms(atoms: ApiInfoAtom[]) {
        if (!playbook || atomsSaving) return;
        setAtomsSaving(true); setAtomsError(null);
        try {
            await api.professor.updateInfoAtoms(caseId, playbook.id, atoms);
            setPlaybook({ ...playbook, info_atoms: atoms });
        } catch { setAtomsError("Failed to save. Please try again."); throw new Error("save failed"); }
        finally { setAtomsSaving(false); }
    }

    const handleSaveRole = useCallback(async (updated: ApiPlaybookRole) => {
        if (!playbook) return;
        const newRoles = playbook.roles.map(r => r.name === updated.name ? updated : r);
        await api.professor.updatePlaybookContent(caseId, playbook.id, { roles: newRoles });
        setPlaybook({ ...playbook, roles: newRoles });
    }, [playbook, caseId]);

    const handleSaveQuestion = useCallback(async (updated: ApiQuestion) => {
        if (!playbook) return;
        const newQs = playbook.questions.map(q => q.id === updated.id ? updated : q);
        await api.professor.updatePlaybookContent(caseId, playbook.id, { questions: newQs });
        setPlaybook({ ...playbook, questions: newQs });
    }, [playbook, caseId]);

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
    const contentMaxWidth = 1180;
    const actionBarMaxWidth = 1180;

    function handleTabChange(nextTab: Tab) {
        setTab(nextTab);
        setVisitedTabs((prev) => ({ ...prev, [nextTab]: true }));
    }

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", position: "relative" }}>
            {/* Sticky top bar */}
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span style={{ fontSize: 12, color: "#78350f" }}>Review the AI-generated playbook and approve to publish.</span>
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: contentMaxWidth, margin: "0 auto", padding: "24px 24px 100px", transition: "max-width 0.22s ease" }}>

                {/* Tab bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
                    <div style={{ display: "flex", gap: 8, background: "#f5f5f7", padding: 4, borderRadius: 9999, width: "fit-content" }}>
                        {TAB_ITEMS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => handleTabChange(t.key)}
                                style={{ padding: "8px 22px", border: "none", borderRadius: 9999, background: tab === t.key ? WINE.softBg : "transparent", color: tab === t.key ? WINE.softText : "#64748b", fontWeight: tab === t.key ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", boxShadow: tab === t.key ? "0 1px 4px #fecaca88" : undefined, transition: "background 0.13s, color 0.13s" }}
                            >
                                <span>{t.label}</span>
                                {visitedTabs[t.key] && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: WINE.primary }}>✓</span>}
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" }}>
                        Reviewed {reviewedCount}/{TAB_ITEMS.length} · {remainingCount} remaining
                    </div>
                </div>

                {tab === "overview" && (
                    <OverviewTab
                        caseData={caseData}
                        playbook={playbook}
                        onSaved={(desc, goals) => setCaseData(cd => cd ? { ...cd, description: desc, teaching_goals: goals } : cd)}
                    />
                )}

                {tab === "roles" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Each role is an AI agent students can interview. Review the persona and the facts each agent is allowed to share.
                        </p>
                        {roles.map((role) => (
                            <RoleCard key={role.name} role={role} onSave={handleSaveRole} />
                        ))}
                    </>
                )}

                {tab === "questions" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Students answer these questions after completing their interviews. The rubric dimensions determine how each answer is scored.
                        </p>
                        {questions.map((q, i) => (
                            <QuestionCard key={q.id} question={q} index={i} onSave={handleSaveQuestion} />
                        ))}
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
