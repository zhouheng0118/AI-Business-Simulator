"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentUser, User } from "@/lib/auth";
import {
    api,
    ApiCaseDetail,
    ApiCitedEvidence,
    ApiEvidence,
    ApiPlaybookQuestion,
    ApiSession,
    ApiSubmission,
} from "@/lib/api";

type AnswerDraft = {
    answer: string;
    citedEvidence: number[];
};

const TYPE_STYLE: Record<string, { label: string; bg: string; color: string }> = {
    decision:   { label: "Decision", bg: "#fff3e0", color: "#b75000" },
    analysis:   { label: "Analysis", bg: "#eef4ff", color: "#0044a8" },
    reflection: { label: "Reflection", bg: "#f0fdf4", color: "#166534" },
};

const shell: CSSProperties = {
    minHeight: "100vh",
    background: "#f5f5f7",
    color: "#1d1d1f",
    fontFamily: "SF Pro Text, system-ui",
};

function typeStyle(type: string) {
    return TYPE_STYLE[type] ?? { label: type, bg: "#f5f5f7", color: "#7a7a7a" };
}

function citedEvidencePayload(evidence: ApiEvidence[], indexes: number[]): ApiCitedEvidence[] {
    return indexes
        .map((index) => {
            const item = evidence[index];
            return item ? { ...item, evidence_index: index } : null;
        })
        .filter((item): item is ApiCitedEvidence => item !== null);
}

function initialDrafts(
    questions: ApiPlaybookQuestion[],
    submissions: ApiSubmission[],
): Record<string, AnswerDraft> {
    const byQuestion = new Map(submissions.map((submission) => [submission.question_id, submission]));
    return Object.fromEntries(
        questions.map((question) => {
            const existing = byQuestion.get(question.id);
            return [
                question.id,
                {
                    answer: existing?.answer ?? "",
                    citedEvidence: (existing?.cited_evidence ?? []).map((item) => item.evidence_index),
                },
            ];
        }),
    );
}

function TopBar({ user, caseTitle, onBack, onInterview }: {
    user: User;
    caseTitle: string;
    onBack: () => void;
    onInterview: () => void;
}) {
    return (
        <div style={{ height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "0 24px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 10 }}>
            <button onClick={onBack} style={navButtonStyle}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Case
            </button>
            <button onClick={onInterview} style={navButtonStyle}>
                Interview
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseTitle}</div>
                <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 1 }}>Answer submission</div>
            </div>
            <span style={{ fontSize: 12, color: "#7a7a7a" }}>{user.fullName}</span>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0066cc", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {user.fullName.charAt(0).toUpperCase()}
            </div>
        </div>
    );
}

const navButtonStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 7,
    border: "1px solid #e0e0e0",
    background: "#ffffff",
    color: "#1d1d1f",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "SF Pro Text, system-ui",
};

function EvidenceCard({ item, index, selected, onToggle }: {
    item: ApiEvidence;
    index: number;
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            onClick={onToggle}
            style={{
                width: "100%",
                textAlign: "left",
                border: selected ? "1.5px solid #0066cc" : "1px solid #e0e0e0",
                background: selected ? "#eef4ff" : "#ffffff",
                borderRadius: 8,
                padding: "10px 11px",
                cursor: "pointer",
                fontFamily: "SF Pro Text, system-ui",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#7a7a7a", fontWeight: 600 }}>{index + 1}. {item.source}</span>
                <span style={{ fontSize: 10, color: selected ? "#0066cc" : "#b0b0b0", fontWeight: 700 }}>{selected ? "Cited" : "Cite"}</span>
            </div>
            <div style={{ fontSize: 12, color: "#1d1d1f", lineHeight: 1.45 }}>{item.key_info}</div>
            {item.data && <div style={{ fontSize: 11, color: "#5f6368", marginTop: 4 }}>Data: {item.data}</div>}
            {item.risk && <div style={{ fontSize: 11, color: "#9a3412", marginTop: 2 }}>Risk: {item.risk}</div>}
        </button>
    );
}

function QuestionEditor({ question, draft, evidence, disabled, onAnswer, onToggleEvidence }: {
    question: ApiPlaybookQuestion;
    draft: AnswerDraft;
    evidence: ApiEvidence[];
    disabled: boolean;
    onAnswer: (value: string) => void;
    onToggleEvidence: (index: number) => void;
}) {
    const cfg = typeStyle(question.type);
    const words = draft.answer.trim().split(/\s+/).filter(Boolean).length;

    return (
        <section style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>{words} words</span>
            </div>
            <h2 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 17, lineHeight: 1.35, margin: "0 0 12px", letterSpacing: "-0.2px" }}>
                {question.text}
            </h2>
            <textarea
                value={draft.answer}
                onChange={(event) => onAnswer(event.target.value)}
                disabled={disabled}
                rows={7}
                placeholder="Write a clear recommendation, explain the reasoning, and connect it to the evidence you gathered."
                style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #d8d8dc",
                    borderRadius: 8,
                    padding: "11px 12px",
                    resize: "vertical",
                    fontFamily: "SF Pro Text, system-ui",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#1d1d1f",
                    outline: "none",
                    background: disabled ? "#f9f9fb" : "#ffffff",
                }}
            />
            <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                    Cite Evidence
                </div>
                {evidence.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#b0b0b0", border: "1px dashed #d0d0d0", borderRadius: 8, padding: 12 }}>
                        No evidence has been collected yet.
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {evidence.map((item, index) => (
                            <EvidenceCard
                                key={`${item.source}-${item.key_info}-${index}`}
                                item={item}
                                index={index}
                                selected={draft.citedEvidence.includes(index)}
                                onToggle={() => onToggleEvidence(index)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function SubmissionSummary({ questions, drafts }: {
    questions: ApiPlaybookQuestion[];
    drafts: Record<string, AnswerDraft>;
}) {
    const answered = questions.filter((question) => drafts[question.id]?.answer.trim()).length;
    const cited = questions.filter((question) => (drafts[question.id]?.citedEvidence.length ?? 0) > 0).length;

    return (
        <aside style={{ position: "sticky", top: 76, alignSelf: "flex-start", background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                Submission Check
            </div>
            <Metric label="Answers" value={`${answered}/${questions.length}`} good={answered === questions.length} />
            <Metric label="Citations" value={`${cited}/${questions.length}`} good={cited === questions.length} />
            <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.55, color: "#5f6368" }}>
                Every answer should cite at least one evidence item. This is the product contract for process-based grading.
            </div>
        </aside>
    );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f0f0", padding: "8px 0" }}>
            <span style={{ fontSize: 12, color: "#7a7a7a" }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: good ? "#166534" : "#b75000" }}>{value}</span>
        </div>
    );
}

export default function AnswerPage() {
    const router = useRouter();
    const params = useParams();
    const sessionId = params.id as string;

    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<ApiSession | null>(null);
    const [detail, setDetail] = useState<ApiCaseDetail | null>(null);
    const [evidence, setEvidence] = useState<ApiEvidence[]>([]);
    const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const currentUser = getCurrentUser();
        if (!currentUser) { router.push("/login"); return; }
        if (currentUser.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(currentUser);

        Promise.all([
            api.sessions.get(sessionId),
            api.sessions.getEvidence(sessionId),
            api.sessions.getSubmissions(sessionId),
        ])
            .then(async ([sessionData, evidenceData, submissionData]) => {
                setSession(sessionData);
                setEvidence(evidenceData.evidence_board);
                const caseDetail = await api.cases.get(sessionData.case_id);
                setDetail(caseDetail);
                const questions = caseDetail.playbook?.questions ?? [];
                setDrafts(initialDrafts(questions, submissionData.submissions));
            })
            .catch(() => setError("Could not load answer workspace. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [router, sessionId]);

    const questions = useMemo(
        () => detail?.playbook?.questions ?? [],
        [detail],
    );
    const submitted = session?.status === "submitted" || session?.status === "scored";
    const readyToSubmit = questions.length > 0 && questions.every((question) => {
        const draft = drafts[question.id];
        return draft?.answer.trim() && draft.citedEvidence.length > 0;
    });

    function updateAnswer(questionId: string, value: string) {
        setDrafts((prev) => ({
            ...prev,
            [questionId]: {
                answer: value,
                citedEvidence: prev[questionId]?.citedEvidence ?? [],
            },
        }));
    }

    function toggleEvidence(questionId: string, index: number) {
        setDrafts((prev) => {
            const draft = prev[questionId] ?? { answer: "", citedEvidence: [] };
            const selected = draft.citedEvidence.includes(index);
            return {
                ...prev,
                [questionId]: {
                    ...draft,
                    citedEvidence: selected
                        ? draft.citedEvidence.filter((item) => item !== index)
                        : [...draft.citedEvidence, index].sort((a, b) => a - b),
                },
            };
        });
    }

    async function handleSubmit() {
        if (!readyToSubmit || submitted) return;
        setSubmitting(true);
        setError(null);

        const answers: ApiSubmission[] = questions.map((question) => {
            const draft = drafts[question.id];
            return {
                question_id: question.id,
                question_type: question.type,
                answer: draft.answer.trim(),
                cited_evidence: citedEvidencePayload(evidence, draft.citedEvidence),
            };
        });

        try {
            await api.sessions.submitAnswers(sessionId, answers);
            const updatedSession = await api.sessions.get(sessionId);
            setSession(updatedSession);
        } catch {
            setError("Could not submit answers. Check that every question has an answer and citations.");
        } finally {
            setSubmitting(false);
        }
    }

    if (!user) return null;

    const caseTitle = detail?.case.title ?? "Loading...";
    const caseId = session?.case_id ?? detail?.case.id ?? "";

    return (
        <div style={shell}>
            <TopBar
                user={user}
                caseTitle={caseTitle}
                onBack={() => router.push(caseId ? `/student/case/${caseId}` : "/dashboard/student")}
                onInterview={() => router.push(`/student/session/${sessionId}`)}
            />

            <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 24px 48px" }}>
                {error && (
                    <div style={{ background: "#fff5f5", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "10px 13px", fontSize: 13, marginBottom: 14 }}>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "#7a7a7a", fontSize: 13 }}>
                        Loading answer workspace...
                    </div>
                ) : (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
                            <div>
                                <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 24, margin: "0 0 5px", letterSpacing: "-0.3px" }}>
                                    Final Recommendation
                                </h1>
                                <p style={{ fontSize: 13, lineHeight: 1.55, color: "#5f6368", margin: 0, maxWidth: 720 }}>
                                    Answer each playbook question and cite the evidence that supports your reasoning.
                                </p>
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={!readyToSubmit || submitting || submitted}
                                style={{
                                    padding: "10px 18px",
                                    border: "none",
                                    borderRadius: 8,
                                    background: submitted ? "#34c759" : readyToSubmit && !submitting ? "#0066cc" : "#d0d0d0",
                                    color: "#ffffff",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: readyToSubmit && !submitting && !submitted ? "pointer" : "not-allowed",
                                    fontFamily: "SF Pro Text, system-ui",
                                    flexShrink: 0,
                                }}
                            >
                                {submitted ? "Submitted" : submitting ? "Submitting..." : "Submit Answers"}
                            </button>
                        </div>

                        {submitted && (
                            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: 8, padding: "10px 13px", fontSize: 13, marginBottom: 14 }}>
                                Your answers have been submitted. Scoring and debrief reports will be added in the next product step.
                            </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 16 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {questions.map((question) => (
                                    <QuestionEditor
                                        key={question.id}
                                        question={question}
                                        draft={drafts[question.id] ?? { answer: "", citedEvidence: [] }}
                                        evidence={evidence}
                                        disabled={submitted}
                                        onAnswer={(value) => updateAnswer(question.id, value)}
                                        onToggleEvidence={(index) => toggleEvidence(question.id, index)}
                                    />
                                ))}
                            </div>
                            <SubmissionSummary questions={questions} drafts={drafts} />
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
