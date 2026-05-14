"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api, ApiCase } from "@/lib/api";

type CaseType = "decision" | "analysis" | "reflection";
type Difficulty = "easy" | "medium" | "hard";

const TYPE_OPTIONS: { value: CaseType; label: string; desc: string }[] = [
    { value: "decision",   label: "Decision",   desc: "Students recommend a course of action" },
    { value: "analysis",   label: "Analysis",   desc: "Students analyze a business situation" },
    { value: "reflection", label: "Reflection", desc: "Students reflect on lessons learned" },
];

const DIFF_OPTIONS: { value: Difficulty; label: string; desc: string }[] = [
    { value: "easy",   label: "Beginner",     desc: "Clear problem, limited ambiguity" },
    { value: "medium", label: "Intermediate", desc: "Multiple perspectives, some uncertainty" },
    { value: "hard",   label: "Advanced",     desc: "High ambiguity, competing trade-offs" },
];

function OptionPill<T extends string>({
    value, label, desc, selected, onSelect,
}: { value: T; label: string; desc: string; selected: boolean; onSelect: (v: T) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${selected ? "#0066cc" : "#e0e0e0"}`, background: selected ? "#eef4ff" : "#ffffff", cursor: "pointer", textAlign: "left", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s" }}
        >
            <div style={{ fontSize: 12, fontWeight: 600, color: selected ? "#0066cc" : "#1d1d1f" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>{desc}</div>
        </button>
    );
}

export default function EditCasePage() {
    const router = useRouter();
    const params = useParams();
    const caseId = params.id as string;

    const [title, setTitle]         = useState("");
    const [description, setDesc]    = useState("");
    const [caseType, setCaseType]   = useState<CaseType>("decision");
    const [difficulty, setDiff]     = useState<Difficulty>("medium");
    const [goals, setGoals]         = useState<string[]>([]);
    const [goalInput, setGoalInput] = useState("");

    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [error, setError]         = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u || u.role !== "professor") { router.push("/login"); return; }

        api.cases.get(caseId)
            .then(({ case: c }) => {
                setTitle(c.title);
                setDesc(c.description ?? "");
                setCaseType(c.case_type as CaseType);
                setDiff(c.difficulty as Difficulty);
                setGoals(c.teaching_goals ?? []);
            })
            .catch(() => setError("Could not load case."))
            .finally(() => setLoading(false));
    }, [caseId, router]);

    function addGoal() {
        const trimmed = goalInput.trim();
        if (trimmed && !goals.includes(trimmed)) {
            setGoals((prev) => [...prev, trimmed]);
        }
        setGoalInput("");
    }

    function handleGoalKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGoal(); }
        if (e.key === "Backspace" && goalInput === "" && goals.length > 0) {
            setGoals((prev) => prev.slice(0, -1));
        }
    }

    async function handleSave() {
        if (!title.trim()) { setError("Title is required."); return; }
        setSaving(true);
        setError(null);
        try {
            await api.cases.update(caseId, {
                title: title.trim(),
                description: description.trim(),
                case_type: caseType,
                difficulty,
                teaching_goals: goals,
            });
            router.push("/dashboard/professor");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSaving(false);
        }
    }

    const inputStyle = {
        width: "100%", padding: "10px 13px", border: "1.5px solid #e0e0e0", borderRadius: 9,
        fontSize: 14, fontFamily: "SF Pro Text, system-ui", color: "#1d1d1f",
        background: "#fff", outline: "none", boxSizing: "border-box" as const,
    };

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f7" }}>
                <span style={{ fontSize: 14, color: "#7a7a7a", fontFamily: "SF Pro Text, system-ui" }}>Loading case…</span>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui" }}>
            {/* Top bar */}
            <div style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 32px", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
                <button
                    onClick={() => router.push("/dashboard/professor")}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#0066cc", fontFamily: "SF Pro Text, system-ui", padding: 0 }}
                >
                    ← Back to Dashboard
                </button>
                <span style={{ color: "#e0e0e0" }}>|</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f" }}>Edit Simulation</span>
            </div>

            {/* Form */}
            <div style={{ maxWidth: 680, margin: "40px auto", padding: "0 24px" }}>
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e0e0e0", padding: "32px 36px", display: "flex", flexDirection: "column", gap: 24 }}>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: "0 0 4px", letterSpacing: "-0.3px" }}>Edit Case Metadata</h1>
                        <p style={{ fontSize: 13, color: "#7a7a7a", margin: 0 }}>
                            Changes here update the case info students see. The playbook (AI roles &amp; questions) is not regenerated.
                        </p>
                    </div>

                    {/* Title */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 6 }}>Title *</label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Netflix Strategic Expansion 2024"
                            style={inputStyle}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 6 }}>Background / Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDesc(e.target.value)}
                            placeholder="Brief background students see before starting the simulation…"
                            rows={5}
                            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }}
                        />
                    </div>

                    {/* Case type */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 8 }}>Case Type</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            {TYPE_OPTIONS.map((o) => (
                                <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={caseType === o.value} onSelect={setCaseType} />
                            ))}
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 8 }}>Difficulty</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            {DIFF_OPTIONS.map((o) => (
                                <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={difficulty === o.value} onSelect={setDiff} />
                            ))}
                        </div>
                    </div>

                    {/* Teaching goals */}
                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 6 }}>Teaching Goals</label>
                        <div style={{ border: "1.5px solid #e0e0e0", borderRadius: 9, padding: "8px 10px", background: "#fff", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            {goals.map((g) => (
                                <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eef4ff", color: "#0066cc", fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20 }}>
                                    {g}
                                    <button
                                        type="button"
                                        onClick={() => setGoals((prev) => prev.filter((x) => x !== g))}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "#0066cc", fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                            <input
                                value={goalInput}
                                onChange={(e) => setGoalInput(e.target.value)}
                                onKeyDown={handleGoalKey}
                                onBlur={addGoal}
                                placeholder={goals.length === 0 ? "Type a goal and press Enter…" : "Add another…"}
                                style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "SF Pro Text, system-ui", color: "#1d1d1f", flex: 1, minWidth: 140, background: "transparent" }}
                            />
                        </div>
                        <p style={{ fontSize: 11, color: "#a0a0a0", margin: "4px 0 0" }}>Press Enter or comma to add each goal</p>
                    </div>

                    {error && (
                        <div style={{ background: "#fff0f0", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#9e2a2b" }}>
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
                        <button
                            type="button"
                            onClick={() => router.push("/dashboard/professor")}
                            style={{ padding: "9px 20px", borderRadius: 9999, border: "1px solid #e0e0e0", background: "#fff", fontSize: 14, fontWeight: 500, color: "#1d1d1f", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || !title.trim()}
                            style={{ padding: "9px 24px", borderRadius: 9999, border: "none", background: saving || !title.trim() ? "#b0c4de" : "#0066cc", fontSize: 14, fontWeight: 500, color: "#fff", cursor: saving || !title.trim() ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
