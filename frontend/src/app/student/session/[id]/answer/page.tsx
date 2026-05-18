"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
    api, ApiCaseDetail, ApiEvidence, ApiQuestion, ApiSession,
} from "@/lib/api";

const DEFAULT_QUESTIONS: Record<string, ApiQuestion> = {
    decision: {
        id: "q_default",
        type: "decision",
        text: "Based on your stakeholder interviews, what is your recommendation? Justify it with specific evidence and address the key risks.",
        rubric_dimensions: [
            { name: "Evidence Use", weight: 25 },
            { name: "Analytical Depth", weight: 25 },
            { name: "Recommendation Quality", weight: 25 },
            { name: "Risk Awareness", weight: 25 },
        ],
    },
    analysis: {
        id: "q_default",
        type: "analysis",
        text: "Analyze the key factors influencing this business situation. What are the most critical insights from your stakeholder interviews?",
        rubric_dimensions: [
            { name: "Evidence Use", weight: 25 },
            { name: "Analytical Depth", weight: 25 },
            { name: "Recommendation Quality", weight: 25 },
            { name: "Risk Awareness", weight: 25 },
        ],
    },
    reflection: {
        id: "q_default",
        type: "reflection",
        text: "Reflect on the case. What were the most important insights from your interviews, and what would you advise the decision-maker to do?",
        rubric_dimensions: [
            { name: "Evidence Use", weight: 25 },
            { name: "Analytical Depth", weight: 25 },
            { name: "Recommendation Quality", weight: 25 },
            { name: "Risk Awareness", weight: 25 },
        ],
    },
};

const CATEGORY_MAP: Record<string, { label: string; bg: string; color: string }> = {
    CEO:                     { label: "Strategic", bg: "#eef4ff", color: "#0044a8" },
    CFO:                     { label: "Financial", bg: "#edfaf3", color: "#166534" },
    "Operations Director":   { label: "Operational", bg: "#fff7ed", color: "#9a3412" },
    "Customer Representative": { label: "Market", bg: "#f5f0ff", color: "#6b21a8" },
    "Local Expert":          { label: "Regulatory", bg: "#edfafa", color: "#0e7490" },
};

function evidenceCategory(source: string) {
    return CATEGORY_MAP[source] ?? { label: source, bg: "#f5f5f7", color: "#7a7a7a" };
}

function wordCount(text: string) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}


function TopBar({
    caseName, submitting, canSubmit, onBack, onSubmit,
}: {
    caseName: string;
    submitting: boolean;
    canSubmit: boolean;
    onBack: () => void;
    onSubmit: () => void;
}) {
    const [backHov, setBackHov] = useState(false);
    const [submitHov, setSubmitHov] = useState(false);

    return (
        <div style={{ height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flexShrink: 0, zIndex: 10 }}>
            <button
                onClick={onBack}
                onMouseEnter={() => setBackHov(true)}
                onMouseLeave={() => setBackHov(false)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, border: "1px solid #e0e0e0", background: backHov ? "#f5f5f7" : "#fff", color: "#1d1d1f", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s", flexShrink: 0 }}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                Interview
            </button>

            <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {caseName}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#7a7a7a" }}>Step 2 of 2 — Submit Your Analysis</span>
                <button
                    onClick={onSubmit}
                    disabled={submitting || !canSubmit}
                    onMouseEnter={() => setSubmitHov(true)}
                    onMouseLeave={() => setSubmitHov(false)}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: submitting || !canSubmit ? "#b0c8f0" : submitHov ? "#0071e3" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: submitting || !canSubmit ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s", display: "flex", alignItems: "center", gap: 6 }}
                >
                    {submitting ? (
                        <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" /><path d="M21 12a9 9 0 00-9-9" /></svg>
                            Scoring…
                        </>
                    ) : "Submit Answer"}
                </button>
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function EvidenceCard({ item, selected, onToggle }: { item: ApiEvidence; selected?: boolean; onToggle?: () => void }) {
    const cat = evidenceCategory(item.source);
    return (
        <button
            type="button"
            onClick={onToggle}
            style={{ width: "100%", textAlign: "left", background: selected ? "#eef6ff" : "#ffffff", border: selected ? "1.5px solid #0066cc" : "1px solid #e8e8ed", borderRadius: 8, padding: "10px 12px", marginBottom: 8, cursor: onToggle ? "pointer" : "default", fontFamily: "SF Pro Text, system-ui" }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: cat.bg, color: cat.color, letterSpacing: "0.02em" }}>{cat.label}</span>
                <span style={{ fontSize: 10, color: "#7a7a7a" }}>{item.source}</span>
                {selected && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0066cc" }}>Cited</span>}
            </div>
            <p style={{ fontSize: 12, color: "#1d1d1f", margin: "0 0 4px", lineHeight: 1.4, fontWeight: 500 }}>{item.key_info}</p>
            {item.data && <p style={{ fontSize: 11, color: "#5a5a5f", margin: 0, lineHeight: 1.3 }}>{item.data}</p>}
        </button>
    );
}

function QuestionCard({
    question, index, value, citedCount, active, onChange, onFocus,
}: {
    question: ApiQuestion;
    index: number;
    value: string;
    citedCount: number;
    active: boolean;
    onChange: (v: string) => void;
    onFocus: () => void;
}) {
    const wc = wordCount(value);
    const minWords = 80;
    const tooShort = wc < minWords;

    const TYPE_LABEL: Record<string, string> = { decision: "Decision", analysis: "Analysis", reflection: "Reflection" };
    const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
        decision:   { bg: "#fff3e0", color: "#b75000" },
        analysis:   { bg: "#eef4ff", color: "#0044a8" },
        reflection: { bg: "#f0fdf4", color: "#166534" },
    };
    const tc = TYPE_COLOR[question.type] ?? { bg: "#f5f5f7", color: "#7a7a7a" };

    return (
        <div style={{ background: "#ffffff", border: active ? "1.5px solid #0066cc" : "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0066cc", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {index + 1}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: tc.bg, color: tc.color, letterSpacing: "0.02em" }}>
                    {TYPE_LABEL[question.type] ?? question.type}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: citedCount > 0 ? "#0066cc" : "#94a3b8", fontWeight: 700 }}>
                    {citedCount} cited evidence
                </span>
            </div>

            <p style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: "0 0 16px", lineHeight: 1.5, letterSpacing: "-0.1px" }}>
                {question.text}
            </p>

            <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    {question.rubric_dimensions.map((d) => (
                        <span key={d.name} style={{ fontSize: 10, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 8px" }}>
                            {d.name} ({d.weight} pts)
                        </span>
                    ))}
                </div>
            </div>

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Type your answer here. Reference specific evidence from your interviews and address the key risks…"
                rows={12}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0d0d8", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#1d1d1f", lineHeight: 1.6, fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none", background: "#fafafa", transition: "border-color 0.15s" }}
                onFocus={(e) => { onFocus(); e.target.style.borderColor = "#0066cc"; e.target.style.background = "#ffffff"; }}
                onBlur={(e) => { e.target.style.borderColor = "#d0d0d8"; e.target.style.background = "#fafafa"; }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: tooShort ? "#9a3412" : "#34c759" }}>
                    {wc} words {tooShort ? `(aim for ${minWords}+)` : "✓"}
                </span>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>
                    Tip: cite specific data points such as $2.5M cost or 3-month runway.
                </span>
            </div>
        </div>
    );
}


export default function AnswerPage() {
    const router = useRouter();
    const params = useParams();
    const sessionId = params.id as string;

    const [session, setSession]   = useState<ApiSession | null>(null);
    const [detail, setDetail]     = useState<ApiCaseDetail | null>(null);
    const [evidence, setEvidence] = useState<ApiEvidence[]>([]);
    const [answers, setAnswers]   = useState<Record<string, string>>({});
    const [activeQuestionId, setActiveQuestionId] = useState<string>("");
    const [citedByQuestion, setCitedByQuestion] = useState<Record<string, number[]>>({});
    const [loading, setLoading]   = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]       = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }

        api.sessions.get(sessionId)
            .then((sess) => {
                if (sess.status === "scored" || sess.status === "submitted") {
                    router.replace(`/student/session/${sessionId}/report`);
                    return null;
                }
                if (sess.status === "in_progress") {
                    router.replace(`/student/session/${sessionId}`);
                    return null;
                }
                setSession(sess);
                return Promise.all([
                    api.cases.get(sess.case_id),
                    api.sessions.getEvidence(sessionId),
                ]);
            })
            .then((results) => {
                if (!results) return;
                const [caseDetail, evidData] = results;
                setDetail(caseDetail);
                setEvidence(evidData.evidence_board);

                const qs = getQuestions(caseDetail);
                const init: Record<string, string> = {};
                const citedInit: Record<string, number[]> = {};
                qs.forEach((q) => {
                    init[q.id] = "";
                    citedInit[q.id] = [];
                });
                setAnswers(init);
                setCitedByQuestion(citedInit);
                setActiveQuestionId(qs[0]?.id ?? "");
            })
            .catch(() => setError("Could not load case. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [sessionId, router]);

    function getQuestions(d: ApiCaseDetail): ApiQuestion[] {
        const qs = d.playbook?.questions;
        if (qs && qs.length > 0) return qs;
        const caseType = d.case?.case_type ?? "decision";
        return [DEFAULT_QUESTIONS[caseType] ?? DEFAULT_QUESTIONS.decision];
    }

    const questions = useMemo(() => detail ? getQuestions(detail) : [], [detail]);

    const canSubmit = questions.length > 0 && questions.every((q) => wordCount(answers[q.id] ?? "") >= 30);

    function toggleEvidence(index: number) {
        const qid = activeQuestionId || questions[0]?.id;
        if (!qid) return;
        setCitedByQuestion((prev) => {
            const current = prev[qid] ?? [];
            return {
                ...prev,
                [qid]: current.includes(index)
                    ? current.filter((i) => i !== index)
                    : [...current, index],
            };
        });
    }

    const handleSubmit = useCallback(async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        try {
            await api.sessions.submit(
                sessionId,
                questions.map((q) => ({
                    question_id: q.id,
                    answer: answers[q.id] ?? "",
                    cited_evidence: (citedByQuestion[q.id] ?? [])
                        .map((index) => evidence[index])
                        .filter(Boolean),
                })),
            );
            router.push(`/student/session/${sessionId}/report`);
        } catch {
            setError("Submission failed. Please try again.");
            setSubmitting(false);
        }
    }, [canSubmit, submitting, sessionId, questions, answers, citedByQuestion, evidence, router]);

    const caseName = detail?.case?.title ?? "Business Case";

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 480 }}>
                    {[80, 200, 200].map((h, i) => (
                        <div key={i} style={{ height: h, borderRadius: 10, background: "#e0e0e0", animation: "pulse 1.5s ease-in-out infinite" }} />
                    ))}
                    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", overflow: "hidden" }}>
            <TopBar
                caseName={caseName}
                submitting={submitting}
                canSubmit={canSubmit}
                onBack={() => router.push(`/student/session/${sessionId}`)}
                onSubmit={handleSubmit}
            />

            {error && (
                <div style={{ background: "#fff5f5", border: "1px solid #fecaca", padding: "10px 20px", fontSize: 13, color: "#991b1b", flexShrink: 0 }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Questions area */}
                <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 24px 24px" }}>
                    <div style={{ maxWidth: 700, margin: "0 auto" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h2 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 18, fontWeight: 700, color: "#1d1d1f", margin: "0 0 4px", letterSpacing: "-0.3px" }}>
                                Submit Your Analysis
                            </h2>
                            <p style={{ fontSize: 12, color: "#7a7a7a", margin: 0 }}>
                                Use the evidence you collected from your interviews to write a well-supported answer.
                            </p>
                        </div>

                        {questions.map((q, i) => (
                            <QuestionCard
                                key={q.id}
                                question={q}
                                index={i}
                                value={answers[q.id] ?? ""}
                                active={activeQuestionId === q.id}
                                citedCount={(citedByQuestion[q.id] ?? []).length}
                                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                                onFocus={() => setActiveQuestionId(q.id)}
                            />
                        ))}

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !canSubmit}
                                style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: submitting || !canSubmit ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 14, fontWeight: 600, cursor: submitting || !canSubmit ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.1px" }}
                            >
                                {submitting ? "Scoring your answer…" : "Submit & See Report"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Evidence reference panel */}
                <div style={{ width: 272, borderLeft: "1px solid #e0e0e0", background: "#fafafa", overflowY: "auto", padding: 16, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                        Your Evidence ({evidence.length})
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "9px 10px", marginBottom: 12, fontSize: 11, color: "#1e3a8a", lineHeight: 1.45 }}>
                        Select an answer, then click evidence cards to cite them.
                    </div>

                    {evidence.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#a0a0a8", textAlign: "center", paddingTop: 24 }}>
                            No evidence collected.
                        </div>
                    ) : (
                        evidence.map((item, i) => (
                            <EvidenceCard
                                key={i}
                                item={item}
                                selected={(citedByQuestion[activeQuestionId || questions[0]?.id] ?? []).includes(i)}
                                onToggle={() => toggleEvidence(i)}
                            />
                        ))
                    )}

                    <div style={{ marginTop: 16, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
                        <p style={{ fontSize: 11, color: "#92400e", margin: 0, lineHeight: 1.5 }}>
                            Reference the specific data, quotes, and risks above in your answer to score higher on Evidence Use.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
