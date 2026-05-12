"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api, ApiReport, ApiDimensionScore } from "@/lib/api";

const ROLE_DOT: Record<string, string> = {
    CEO:                     "#0066cc",
    CFO:                     "#1d8a4f",
    "Operations Director":   "#c05c00",
    "Customer Representative": "#6b21a8",
    "Local Expert":          "#0e7490",
};

function scoreColor(pct: number): string {
    if (pct >= 0.8) return "#34c759";
    if (pct >= 0.6) return "#ff9500";
    return "#ff3b30";
}

function ScoreRing({ score, max }: { score: number; max: number }) {
    const pct = max > 0 ? score / max : 0;
    const radius = 52;
    const circ = 2 * Math.PI * radius;
    const dashOffset = circ * (1 - pct);
    const color = scoreColor(pct);

    return (
        <div style={{ position: "relative", width: 140, height: 140 }}>
            <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={70} cy={70} r={radius} fill="none" stroke="#f0f0f0" strokeWidth={12} />
                <circle
                    cx={70} cy={70} r={radius} fill="none"
                    stroke={color} strokeWidth={12}
                    strokeDasharray={circ} strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 32, fontWeight: 700, color, fontFamily: "SF Pro Display, system-ui", letterSpacing: "-1px", lineHeight: 1 }}>
                    {Math.round(score)}
                </span>
                <span style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>/ {Math.round(max)}</span>
            </div>
        </div>
    );
}

function DimensionBar({ dim }: { dim: ApiDimensionScore }) {
    const pct = dim.max_score > 0 ? dim.score / dim.max_score : 0;
    const color = scoreColor(pct);

    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: "#1d1d1f", fontWeight: 500 }}>{dim.name}</span>
                <span style={{ fontSize: 13, color, fontWeight: 600 }}>{dim.score} / {dim.max_score}</span>
            </div>
            <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
            {dim.comment && (
                <p style={{ fontSize: 11, color: "#7a7a7a", margin: "4px 0 0", lineHeight: 1.4 }}>{dim.comment}</p>
            )}
        </div>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
                {title}
            </div>
            {children}
        </div>
    );
}


export default function ReportPage() {
    const router = useRouter();
    const params = useParams();
    const sessionId = params.id as string;

    const [report, setReport] = useState<ApiReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }

        api.sessions.getReport(sessionId)
            .then(setReport)
            .catch(() => setError("Could not load report. The session may not be scored yet."))
            .finally(() => setLoading(false));
    }, [sessionId, router]);

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid #e0e0e0", borderTopColor: "#0066cc", animation: "spin 0.9s linear infinite" }} />
                <span style={{ fontSize: 13, color: "#7a7a7a" }}>Loading your report…</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "20px 28px", fontSize: 13, color: "#991b1b", maxWidth: 400, textAlign: "center" }}>
                    {error ?? "Report not found."}
                    <div style={{ marginTop: 14 }}>
                        <button
                            onClick={() => router.push("/dashboard/student")}
                            style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", fontSize: 12, color: "#1d1d1f", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const rolesVisited = report.interview_path?.roles_visited ?? [];
    const rolesMissed  = report.interview_path?.roles_missed  ?? [];
    const allRoles = [...rolesVisited, ...rolesMissed];
    const pct = report.total_max > 0 ? report.total_score / report.total_max : 0;

    const gradeLabel = pct >= 0.9 ? "Excellent" : pct >= 0.8 ? "Strong" : pct >= 0.7 ? "Good" : pct >= 0.6 ? "Satisfactory" : "Needs Improvement";
    const gradeColor = scoreColor(pct);

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui" }}>
            {/* TopBar */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", padding: "0 24px", gap: 16 }}>
                <button
                    onClick={() => router.push("/dashboard/student")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#1d1d1f", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Dashboard
                </button>
                <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", flex: 1 }}>
                    Debrief Report
                </span>
                <span style={{ fontSize: 11, color: "#7a7a7a" }}>
                    {new Date(report.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
            </div>

            <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 24px 60px" }}>

                {/* Score Hero */}
                <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 16, padding: "28px 32px", marginBottom: 16, display: "flex", alignItems: "center", gap: 32 }}>
                    <ScoreRing score={report.total_score} max={report.total_max} />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 22, fontWeight: 700, color: gradeColor, fontFamily: "SF Pro Display, system-ui", letterSpacing: "-0.3px" }}>
                                {gradeLabel}
                            </span>
                            <span style={{ fontSize: 13, color: "#7a7a7a" }}>
                                {Math.round(report.total_score)} / {Math.round(report.total_max)} points
                            </span>
                        </div>
                        <p style={{ fontSize: 13, color: "#3d3d3f", margin: "0 0 14px", lineHeight: 1.6 }}>
                            {report.overall_comment || "Your analysis has been scored across multiple dimensions."}
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 10px" }}>
                                {rolesVisited.length} / {allRoles.length} stakeholders interviewed
                            </span>
                            <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 10px" }}>
                                {report.interview_path?.key_info_captured?.length ?? 0} evidence items collected
                            </span>
                        </div>
                    </div>
                </div>

                {/* Per-question scores */}
                {report.scores.map((qs, qi) => (
                    <SectionCard key={qs.question_id} title={`Question ${qi + 1} — ${qs.question_type.charAt(0).toUpperCase() + qs.question_type.slice(1)}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <span style={{ fontSize: 13, color: "#3d3d3f" }}>Score</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(qs.question_max > 0 ? qs.question_total / qs.question_max : 0), fontFamily: "SF Pro Display, system-ui" }}>
                                {Math.round(qs.question_total)} / {Math.round(qs.question_max)}
                            </span>
                        </div>

                        {qs.dimension_scores.map((d) => (
                            <DimensionBar key={d.name} dim={d} />
                        ))}

                        {qs.feedback && (
                            <div style={{ marginTop: 14, padding: "12px 14px", background: "#f5f5f7", borderRadius: 8, borderLeft: "3px solid #0066cc" }}>
                                <p style={{ fontSize: 13, color: "#3d3d3f", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>
                                    "{qs.feedback}"
                                </p>
                            </div>
                        )}

                        {(qs.strengths?.length > 0 || qs.improvements?.length > 0) && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                                {qs.strengths?.length > 0 && (
                                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 14px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: "#166534", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>Strengths</div>
                                        {qs.strengths.map((s, i) => (
                                            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                                                <span style={{ color: "#34c759", fontSize: 12, flexShrink: 0, marginTop: 1 }}>✓</span>
                                                <span style={{ fontSize: 12, color: "#1d1d1f", lineHeight: 1.4 }}>{s}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {qs.improvements?.length > 0 && (
                                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "12px 14px" }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: "#9a3412", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>Areas to Improve</div>
                                        {qs.improvements.map((s, i) => (
                                            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                                                <span style={{ color: "#ff9500", fontSize: 12, flexShrink: 0, marginTop: 1 }}>→</span>
                                                <span style={{ fontSize: 12, color: "#1d1d1f", lineHeight: 1.4 }}>{s}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </SectionCard>
                ))}

                {/* Interview Path */}
                <SectionCard title="Interview Path">
                    <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 14px" }}>
                        Stakeholders you interviewed and those you missed.
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {rolesVisited.map((r) => (
                            <div key={r} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_DOT[r] ?? "#34c759" }} />
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#1d1d1f" }}>{r}</span>
                                <span style={{ fontSize: 10, color: "#34c759" }}>✓ Interviewed</span>
                            </div>
                        ))}
                        {rolesMissed.map((r) => (
                            <div key={r} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, background: "#f5f5f7", border: "1px solid #e0e0e0" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c0c0c8" }} />
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#7a7a7a" }}>{r}</span>
                                <span style={{ fontSize: 10, color: "#a0a0a8" }}>Skipped</span>
                            </div>
                        ))}
                    </div>
                </SectionCard>

                {/* Blind Spots */}
                {report.blind_spots?.length > 0 && (
                    <SectionCard title="Blind Spots">
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {report.blind_spots.map((bs, i) => (
                                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <p style={{ fontSize: 13, color: "#78350f", margin: 0, lineHeight: 1.5 }}>{bs.description}</p>
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                )}

                {/* CTA */}
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 24 }}>
                    <button
                        onClick={() => router.push("/dashboard/student")}
                        style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: "#0066cc", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.1px" }}
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
