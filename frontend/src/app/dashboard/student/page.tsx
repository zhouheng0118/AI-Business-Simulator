"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import {
    api, ApiCase, ApiSession, ApiAssignment,
    sessionProgress, difficultyLabel, formatDue,
} from "@/lib/api";
import DashboardLayout, { NavSection, NavItem } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, Badge, Tag,
    LoadingState, ErrorState, EmptyState,
    IconGrid, IconChart, IconReport, IconUser, IconSettings, IconLogout,
} from "@/components/dashboard/shared";

type CaseStatus = "not_started" | "in_progress" | "completed";

/** Up to two sentences for list cards; caps length for dense case write-ups. */
function briefCaseBlurb(text: string | null | undefined, maxSentences = 2, maxChars = 220): string {
    const t = (text ?? "").trim().replace(/\s+/g, " ");
    if (!t) return "";

    const isSentenceEnd = (idx: number): boolean => {
        const ch = t[idx];
        if (!ch) return false;
        if (".!?".includes(ch)) {
            const after = t[idx + 1];
            return after === undefined || /\s/.test(after) || after === '"' || after === "'";
        }
        if ("。！？".includes(ch)) return true;
        return false;
    };

    const boundaries: number[] = [];
    for (let i = 0; i < t.length; i++) {
        if (isSentenceEnd(i)) boundaries.push(i + 1);
    }

    let out: string;
    if (boundaries.length >= maxSentences) {
        out = t.slice(0, boundaries[maxSentences - 1]).trim();
    } else if (boundaries.length === 1) {
        out = t.slice(0, boundaries[0]).trim();
    } else {
        out = t;
    }

    if (out.length > maxChars) {
        let cut = out.slice(0, maxChars - 1);
        const sp = cut.lastIndexOf(" ");
        if (sp > Math.min(48, cut.length * 0.45)) cut = cut.slice(0, sp);
        out = cut.trimEnd() + "…";
    }
    return out;
}

/** Short label for a teaching-goal chip on list cards (avoids multi-line pills). */
function goalSnippetForTag(goal: string, max = 40): string {
    let t = goal.trim().replace(/\s+/g, " ");
    const endPhrase = t.search(/[.!?]\s/);
    if (endPhrase > 0 && endPhrase <= max + 12) t = t.slice(0, endPhrase);
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > 16 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

interface DisplayCase {
    id: string;
    title: string;
    descriptionPreview: string;
    difficulty: string;
    status: CaseStatus;
    progress: number;
    dueAt: string | null;
    tagLabels: string[];
}

function buildDisplayCases(
    cases: ApiCase[],
    sessions: ApiSession[],
    assignments: ApiAssignment[]
): DisplayCase[] {
    const sessionByCase    = new Map(sessions.map((s) => [s.case_id, s]));
    const assignmentByCase = new Map(assignments.map((a) => [a.case_id, a]));

    return cases.map((c) => {
        const session    = sessionByCase.get(c.id);
        const assignment = assignmentByCase.get(c.id);

        let status: CaseStatus = "not_started";
        let progress = 0;
        if (session) {
            status = (session.status === "submitted" || session.status === "scored") ? "completed" : "in_progress";
            progress = sessionProgress(session);
        }

        return {
            id: c.id,
            title: c.title,
            descriptionPreview: briefCaseBlurb(c.description),
            difficulty: difficultyLabel(c.difficulty),
            status,
            progress,
            dueAt: assignment?.due_at ?? null,
            tagLabels: (c.teaching_goals ?? []).slice(0, 3).map(goalSnippetForTag),
        };
    });
}

function CaseProgressSummary({
    total,
    inProgress,
    completed,
}: {
    total: number;
    inProgress: number;
    completed: number;
}) {
    const notStarted = Math.max(0, total - inProgress - completed);

    if (total === 0) {
        return (
            <div style={{ width: "100%", flex: "1 1 100%", fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
                No cases assigned yet.
            </div>
        );
    }

    return (
        <div style={{ width: "100%", flex: "1 1 100%", minWidth: 0 }}>
            <div
                role="img"
                aria-label={`${completed} completed, ${inProgress} in progress, ${notStarted} not started out of ${total} cases`}
                style={{
                    display: "flex",
                    height: 6,
                    borderRadius: 9999,
                    overflow: "hidden",
                    background: "#f1f5f9",
                    marginBottom: 8,
                }}
            >
                <div
                    style={{
                        flex: completed,
                        background: "linear-gradient(90deg, #15803d, #22c55e)",
                        minWidth: completed > 0 ? 4 : 0,
                    }}
                />
                <div
                    style={{
                        flex: inProgress,
                        background: "linear-gradient(90deg, #1d4ed8, #3b82f6)",
                        minWidth: inProgress > 0 ? 4 : 0,
                    }}
                />
                <div
                    style={{
                        flex: notStarted,
                        background: "#e2e8f0",
                        minWidth: notStarted > 0 ? 4 : 0,
                    }}
                />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600, color: "#1d1d1f" }}>{inProgress}</span>
                <span style={{ color: "#94a3b8" }}>/{total}</span> cases in progress
                <span style={{ color: "#cbd5e1", margin: "0 0.4em" }}>·</span>
                <span style={{ fontWeight: 600, color: "#1d1d1f" }}>{completed}</span> completed
                {notStarted > 0 ? (
                    <>
                        <span style={{ color: "#cbd5e1", margin: "0 0.4em" }}>·</span>
                        <span style={{ fontWeight: 600, color: "#1d1d1f" }}>{notStarted}</span> not started
                    </>
                ) : null}
            </p>
        </div>
    );
}

export default function StudentDashboard() {
    const router = useRouter();
    const [user, setUser]     = useState<User | null>(null);
    const [cases, setCases]   = useState<DisplayCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(u);

        Promise.all([
            api.cases.list(true),
            api.sessions.byStudent(u.id),
            api.assignments.byStudent(u.id),
        ])
            .then(([casesData, sessionsData, assignmentsData]) => {
                setCases(buildDisplayCases(casesData, sessionsData, assignmentsData));
            })
            .catch(() => setError("Could not load cases. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [router]);

    if (!user) return null;

    const inProgress = cases.filter((c) => c.status === "in_progress").length;
    const completed  = cases.filter((c) => c.status === "completed").length;

    function handleLogout() {
        logout();
        router.push("/login");
    }

    const navSections: NavSection[] = [
        {
            label: "Learning",
            items: [
                { icon: <IconGrid />,   label: "Case Library",    active: true },
                { icon: <IconChart />,  label: "My Progress", onClick: () => router.push("/dashboard/student/progress") },
                { icon: <IconReport />, label: "Debrief Reports", onClick: () => router.push("/dashboard/student/reports") },
            ],
        },
    ];

    const accountItems: NavItem[] = [
        { icon: <IconUser />,     label: "Profile" },
        { icon: <IconSettings />, label: "Settings" },
        { icon: <IconLogout />,   label: "Sign Out", onClick: handleLogout, danger: true },
    ];

    const headerLeft = (
        <div>
            <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.3px", margin: 0 }}>Case Library</h1>
            <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Your assigned business simulations</p>
        </div>
    );

    const headerRight = (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
            <Avatar name={user.fullName} />
        </div>
    );

    const statsRow = !loading && !error ? (
        <CaseProgressSummary total={cases.length} inProgress={inProgress} completed={completed} />
    ) : undefined;

    const inProgressCases = cases.filter((c) => c.status === "in_progress");
    const notStartedCases = cases.filter((c) => c.status === "not_started");
    const completedCases  = cases.filter((c) => c.status === "completed");

    return (
        <DashboardLayout
            portalName="Student Portal"
            navSections={navSections}
            accountItems={accountItems}
            headerLeft={headerLeft}
            headerRight={headerRight}
            statsRow={statsRow}
        >
            <div style={{ background: "#f8f9fc", borderRadius: 14, padding: 14, minHeight: "100%" }}>
                {loading && <LoadingState count={4} />}
                {error   && <ErrorState message={error} />}
                {!loading && !error && cases.length === 0 && <EmptyState message="No cases have been assigned to you yet." />}
                {!loading && !error && cases.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                        {/* ── In Progress: full-width, one card per row ─────────── */}
                        {inProgressCases.length > 0 && (
                            <section>
                                <p style={{
                                    margin: "0 0 10px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: "0.09em",
                                    textTransform: "uppercase",
                                    color: "#0066cc",
                                }}>
                                    In Progress &nbsp;·&nbsp; {inProgressCases.length}
                                </p>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                                    {inProgressCases.map((c) => <CaseCard key={c.id} data={c} />)}
                                </div>
                            </section>
                        )}

                        {/* ── Not Started: 2-col, visually de-emphasised ────────── */}
                        {notStartedCases.length > 0 && (
                            <section>
                                <p style={{
                                    margin: "0 0 10px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: "0.09em",
                                    textTransform: "uppercase",
                                    color: "#94a3b8",
                                }}>
                                    Not Started &nbsp;·&nbsp; {notStartedCases.length}
                                </p>
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                                    gap: 14,
                                    alignItems: "stretch",
                                }}>
                                    {notStartedCases.map((c) => <CaseCard key={c.id} data={c} />)}
                                </div>
                            </section>
                        )}

                        {/* ── Completed: 2-col, normal ──────────────────────────── */}
                        {completedCases.length > 0 && (
                            <section>
                                <p style={{
                                    margin: "0 0 10px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: "0.09em",
                                    textTransform: "uppercase",
                                    color: "#15803d",
                                }}>
                                    Completed &nbsp;·&nbsp; {completedCases.length}
                                </p>
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                                    gap: 14,
                                    alignItems: "stretch",
                                }}>
                                    {completedCases.map((c) => <CaseCard key={c.id} data={c} />)}
                                </div>
                            </section>
                        )}

                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

/** Return SVG path data for a decorative icon matched to the case title. */
function caseThemeIconPath(title: string): string {
    const t = title.toLowerCase();
    if (t.includes("rail") || t.includes("train"))
        // Train
        return "M4 15V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M2 15h20M7 15v3M17 15v3M8 9h3M13 9h3M6 5v2M18 5v2";
    if (t.includes("marriott") || t.includes("hotel") || t.includes("lodg") || t.includes("resort"))
        // Building / hotel
        return "M3 21h18M3 9l9-6 9 6M4 21V9M20 21V9M9 21v-6h6v6M9 13h2M13 13h2M9 16h2M13 16h2";
    if (t.includes("arundel") || t.includes("film") || t.includes("cinema") || t.includes("movie") || t.includes("studio"))
        // Film strip
        return "M2 5h20v14H2zM7 5v14M17 5v14M2 9h5M17 9h5M2 15h5M17 15h5M9 8h6v8H9z";
    if (t.includes("spotify") || t.includes("music") || t.includes("audio") || t.includes("sound") || t.includes("stream"))
        // Music note (beamed)
        return "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
    // Generic chart / business default
    return "M3 21V9l9-6 9 6v12M9 21v-7h6v7M3 13h4M17 13h4M12 3v3";
}

function CaseCard({ data }: { data: DisplayCase }) {
    const router = useRouter();
    const [hovered, setHovered] = useState(false);

    const statusCfg: Record<CaseStatus, { label: string; bg: string; color: string }> = {
        in_progress: { label: "In Progress", bg: "#ffedd5", color: "#c2410c" },
        completed:   { label: "Completed",   bg: "#dcfce7", color: "#15803d" },
        not_started: { label: "Not Started", bg: "#f1f5f9", color: "#475569" },
    };
    const diffStyle: Record<string, { bg: string; color: string }> = {
        Beginner:     { bg: "#dcfce7", color: "#166534" },
        Intermediate: { bg: "#dbeafe", color: "#1d4ed8" },
        Advanced:     { bg: "#fee2e2", color: "#b91c1c" },
    };
    const heroGrad: Record<string, string> = {
        Beginner:
            "linear-gradient(152deg, #14532d 0%, #166534 28%, #22c55e 62%, #86efac 100%)",
        Intermediate:
            "linear-gradient(152deg, #172554 0%, #1e40af 30%, #3b82f6 65%, #93c5fd 100%)",
        Advanced:
            "linear-gradient(152deg, #450a0a 0%, #991b1b 32%, #ef4444 68%, #fca5a5 100%)",
    };
    const hoverLeftAccent: Record<string, string> = {
        Beginner:     "#22c55e",
        Intermediate: "#3b82f6",
        Advanced:     "#ef4444",
    };
    const defaultAccent = "#64748b";
    const barColor: Record<CaseStatus, string> = {
        completed: "#34c759", in_progress: "#0066cc", not_started: "#e0e0e0",
    };
    const cfg = statusCfg[data.status];
    const accentKey = data.difficulty in heroGrad ? data.difficulty : "";
    const topGrad = heroGrad[accentKey] ?? `linear-gradient(90deg, ${defaultAccent} 0%, #94a3b8 100%)`;
    const leftStripe = hoverLeftAccent[accentKey] ?? defaultAccent;
    const iconPath = caseThemeIconPath(data.title);

    return (
        <div
            onClick={() => router.push(`/student/case/${data.id}`)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                height: "100%",
                boxSizing: "border-box",
                position: "relative",
                overflow: "hidden",
                background: "#ffffff",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: 12,
                cursor: "pointer",
                transform: hovered ? "translateY(-2px)" : "translateY(0)",
                boxShadow: hovered
                    ? `inset 3px 0 0 0 ${leftStripe}, 0 10px 28px -6px rgba(15, 23, 42, 0.12)`
                    : "inset 3px 0 0 0 transparent, 0 1px 2px rgba(15, 23, 42, 0.05)",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div
                aria-hidden
                style={{
                    flexShrink: 0,
                    minHeight: 72,
                    maxHeight: 72,
                    height: 72,
                    width: "100%",
                    background: topGrad,
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "14px 18px 12px",
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.12) 100%)",
                        pointerEvents: "none",
                    }}
                />
                <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        position: "absolute",
                        right: -10,
                        bottom: -14,
                        width: 118,
                        height: 118,
                        pointerEvents: "none",
                        zIndex: 0,
                    }}
                >
                    <path d={iconPath} />
                </svg>
            </div>
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    padding: "16px 20px 18px",
                    background: "#ffffff",
                }}
            >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    minWidth: 0,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ flexShrink: 0 }}>
                        <Badge label={cfg.label} bg={cfg.bg} color={cfg.color} />
                    </span>
                    <div
                        role="progressbar"
                        aria-valuenow={Math.round(data.progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progress ${Math.round(data.progress)} percent`}
                        style={{
                            width: 64,
                            height: 3,
                            flexShrink: 0,
                            background: "#f0f0f0",
                            borderRadius: 2,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                height: "100%",
                                borderRadius: 2,
                                width: `${data.progress}%`,
                                background: barColor[data.status],
                                transition: "width 0.3s",
                            }}
                        />
                    </div>
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: cfg.color,
                            fontVariantNumeric: "tabular-nums",
                            flexShrink: 0,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {Math.round(data.progress)}%
                    </span>
                </div>
                <span style={{ flexShrink: 0 }}>
                    <Badge
                        label={data.difficulty}
                        {...(diffStyle[data.difficulty] ?? { bg: "#f1f5f9", color: "#64748b" })}
                    />
                </span>
            </div>

            <div style={{ fontSize: "clamp(20px, 2.1vw, 22px)", fontWeight: 800, color: "#111827", marginBottom: data.descriptionPreview ? 8 : 12, lineHeight: 1.18, letterSpacing: "-0.35px", overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, lineClamp: 2, minHeight: "calc(1.18em * 2)" }}>
                {data.title}
            </div>

            {data.descriptionPreview ? (
                <div
                    style={{
                        fontSize: 13,
                        color: "#6b7280",
                        lineHeight: 1.42,
                        marginBottom: 10,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical" as const,
                        WebkitLineClamp: 2,
                        lineClamp: 2,
                    }}
                >
                    {data.descriptionPreview}
                </div>
            ) : null}

            <div style={{ marginTop: "auto" }}>
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: data.dueAt ? "#86868b" : "#c7c7cc",
                        lineHeight: 1.35,
                    }}
                >
                    {data.dueAt ? `Due ${formatDue(data.dueAt)}` : "No due date"}
                </div>
            </div>
            </div>

            {/* ── In Progress: big % label + 8px gradient bar ──────── */}
            {data.status === "in_progress" && (
                <>
                    <div style={{
                        flexShrink: 0,
                        padding: "8px 20px 10px",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                    }}>
                        <span style={{
                            fontSize: "clamp(40px, 6vw, 48px)",
                            fontWeight: 900,
                            color: "#0066cc",
                            letterSpacing: "-1.2px",
                            lineHeight: 0.9,
                            fontVariantNumeric: "tabular-nums",
                            textShadow: "0 2px 14px rgba(29,78,216,0.18)",
                        }}>
                            {Math.round(data.progress)}%
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b", letterSpacing: "0.01em" }}>complete</span>
                    </div>
                    <div
                        role="progressbar"
                        aria-valuenow={Math.round(data.progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${Math.round(data.progress)}% complete`}
                        style={{ flexShrink: 0, height: 8, width: "100%", background: "#dbeafe" }}
                    >
                        <div style={{
                            height: "100%",
                            width: `${data.progress}%`,
                            background: "linear-gradient(90deg, #1d4ed8 0%, #38bdf8 100%)",
                            transition: "width 0.4s ease",
                        }} />
                    </div>
                </>
            )}

            {/* ── Completed: green checkmark seal ──────────────────── */}
            {data.status === "completed" && (
                <div style={{
                    flexShrink: 0,
                    padding: "10px 20px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderTop: "1px solid #dcfce7",
                    background: "#f0fdf4",
                }}>
                    <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 1px 6px rgba(22,163,74,0.35)",
                    }}>
                        <svg viewBox="0 0 12 12" fill="none" width={13} height={13}>
                            <path d="M2 6l2.8 2.8L10 3" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d", letterSpacing: "0.01em" }}>Case Completed</span>
                </div>
            )}

        </div>
    );
}
