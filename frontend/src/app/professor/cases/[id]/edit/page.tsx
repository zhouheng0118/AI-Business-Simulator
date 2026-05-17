"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api } from "@/lib/api";

type CaseType = "decision" | "analysis" | "reflection";
type Difficulty = "easy" | "medium" | "hard";

const WINE = {
    border: "#fca5a5",
    bg: "#fef2f2",
    text: "#991b1b",
    strip: "#b91c1c",
    soft: "#fee2e2",
    deep: "#7f1d1d",
};

const TYPE_OPTIONS: { value: CaseType; label: string; desc: string }[] = [
    { value: "decision",   label: "Decision",   desc: "Students recommend a course of action" },
    { value: "analysis",   label: "Analysis",   desc: "Students analyze a business situation" },
    { value: "reflection", label: "Reflection", desc: "Students reflect on lessons learned" },
];

const DIFF_OPTIONS: { value: Difficulty; label: string; desc: string; tone: "wine" | "green" | "blue" | "red" }[] = [
    { value: "easy",   label: "Beginner",     desc: "Clear problem, limited ambiguity", tone: "wine" },
    { value: "medium", label: "Intermediate", desc: "Multiple perspectives, some uncertainty", tone: "wine" },
    { value: "hard",   label: "Advanced",     desc: "High ambiguity, competing trade-offs", tone: "wine" },
];

function OptionPill<T extends string>({
    value, label, desc, selected, onSelect, tone = "wine",
}: { value: T; label: string; desc: string; selected: boolean; onSelect: (v: T) => void; tone?: "wine" | "green" | "blue" | "red" }) {
    const toneStyles = {
        wine: { border: WINE.border, bg: WINE.bg, text: WINE.text, strip: WINE.strip },
        blue: { border: "#93c5fd", bg: "#eff6ff", text: "#1d4ed8", strip: "#2563eb" },
        green: { border: "#86efac", bg: "#f0fdf4", text: "#15803d", strip: "#16a34a" },
        red: { border: "#fca5a5", bg: "#fef2f2", text: "#b91c1c", strip: "#dc2626" },
    }[tone];

    return (
        <button
            type="button"
            onClick={() => onSelect(value)}
            style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 9,
                border: `1.5px solid ${selected ? toneStyles.border : "#e0e0e0"}`,
                background: selected ? toneStyles.bg : "#ffffff",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "SF Pro Text, system-ui",
                transition: "all 0.12s",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {selected && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: toneStyles.strip }} />}
            <div style={{ fontSize: 12, fontWeight: 600, color: selected ? toneStyles.text : "#1d1d1f" }}>{label}</div>
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
            <div style={{ position: "sticky", top: 0, zIndex: 40, height: 60, background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 65%, #991b1b 100%)", borderBottom: "1px solid #7f1d1d", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <button
                        onClick={() => router.push("/dashboard/professor")}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#fecaca", fontFamily: "SF Pro Text, system-ui", padding: 0 }}
                    >
                        ← Back to Dashboard
                    </button>
                    <span style={{ color: "#fca5a5" }}>|</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Edit Simulation</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard/professor")}
                        style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #fca5a5", background: "transparent", fontSize: 12, fontWeight: 600, color: "#fee2e2", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !title.trim()}
                        style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: saving || !title.trim() ? "#7f1d1d" : "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 55%, #dc2626 100%)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: saving || !title.trim() ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", boxShadow: "0 4px 12px #00000033" }}
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: 980, margin: "24px auto", padding: "0 24px" }}>
                <main>
                    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e0e0e0", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", margin: "0 0 4px", letterSpacing: "-0.3px" }}>Edit Case Metadata</h1>
                            <p style={{ fontSize: 13, color: "#7a7a7a", margin: 0 }}>
                                Changes here update what students see before the simulation starts. Playbook generation logic remains unchanged.
                            </p>
                        </div>

                        <section id="section-basic" style={{ scrollMarginTop: 76 }}>
                            <div style={{ borderLeft: `3px solid ${WINE.strip}`, paddingLeft: 10, marginBottom: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>Basic Information</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Core student-facing context for this case.</div>
                            </div>

                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 6 }}>Title *</label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Netflix Strategic Expansion 2024"
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 6 }}>Background / Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDesc(e.target.value)}
                                    placeholder="Brief background students see before starting the simulation…"
                                    rows={8}
                                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, minHeight: 180 }}
                                />
                                <div style={{ marginTop: 5, fontSize: 11, color: "#64748b", textAlign: "right" }}>{description.trim().length} characters</div>
                            </div>
                        </section>

                        <section id="section-case" style={{ scrollMarginTop: 76 }}>
                            <div style={{ borderLeft: `3px solid ${WINE.strip}`, paddingLeft: 10, marginBottom: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>Case Settings</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Define analytical framing and challenge level.</div>
                            </div>

                            <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 8 }}>Case Type</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {TYPE_OPTIONS.map((o) => (
                                        <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={caseType === o.value} onSelect={setCaseType} tone="wine" />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 8 }}>Difficulty</label>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {DIFF_OPTIONS.map((o) => (
                                        <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={difficulty === o.value} onSelect={setDiff} tone={o.tone} />
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="section-teaching" style={{ scrollMarginTop: 76 }}>
                            <div style={{ borderLeft: `3px solid ${WINE.strip}`, paddingLeft: 10, marginBottom: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>Teaching Configuration</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Specify intended learning outcomes.</div>
                            </div>

                            <label style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", display: "block", marginBottom: 4 }}>Teaching Goals</label>
                            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 600 }}>Hint: Press Enter or comma to add each goal</div>
                            <div style={{ border: "1.5px solid #e0e0e0", borderRadius: 9, padding: "8px 10px", background: "#fff", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                {goals.map((g) => (
                                    <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: WINE.bg, color: WINE.text, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20 }}>
                                        {g}
                                        <button
                                            type="button"
                                            onClick={() => setGoals((prev) => prev.filter((x) => x !== g))}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: WINE.text, fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}
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
                        </section>

                        {error && (
                            <div style={{ background: "#fff0f0", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#9e2a2b" }}>
                                {error}
                            </div>
                        )}

                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12, fontSize: 11, color: "#64748b" }}>* Required fields</div>
                    </div>
                </main>
            </div>
        </div>
    );
}
