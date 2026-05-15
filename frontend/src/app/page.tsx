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
    Avatar, Badge, Tag, StatCard,
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

interface DisplayCase {
    id: string;
    title: string;
    descriptionPreview: string;
    difficulty: string;
    teaching_goals: string[];
    status: CaseStatus;
    progress: number;
    dueDate: string;
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
            teaching_goals: c.teaching_goals,
            status,
            progress,
            dueDate: formatDue(assignment?.due_at ?? null),
        };
    });
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
                { icon: <IconChart />,  label: "My Progress" },
                { icon: <IconReport />, label: "Debrief Reports" },
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
        <>
            <StatCard label="Total Cases" value={cases.length} />
            <StatCard label="In Progress" value={inProgress} color="#ff9500" />
            <StatCard label="Completed"   value={completed}  color="#34c759" />
            <StatCard label="Not Started" value={cases.length - inProgress - completed} />
        </>
    ) : undefined;

    return (
        <DashboardLayout
            portalName="Student Portal"
            navSections={navSections}
            accountItems={accountItems}
            headerLeft={headerLeft}
            headerRight={headerRight}
            statsRow={statsRow}
        >
            {loading && <LoadingState count={4} />}
            {error   && <ErrorState message={error} />}
            {!loading && !error && cases.length === 0 && <EmptyState message="No cases have been assigned to you yet." />}
            {!loading && !error && cases.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {cases.map((c) => <CaseCard key={c.id} data={c} />)}
                </div>
            )}
        </DashboardLayout>
    );
}

function CaseCard({ data }: { data: DisplayCase }) {
    const router = useRouter();
    const [hovered, setHovered] = useState(false);

    const statusCfg: Record<CaseStatus, { label: string; bg: string; color: string }> = {
        in_progress: { label: "In Progress", bg: "#fff3e0", color: "#e65100" },
        completed:   { label: "Completed",   bg: "#e8f5e9", color: "#2e7d32" },
        not_started: { label: "Not Started", bg: "#f5f5f7", color: "#7a7a7a" },
    };
    const diffColor: Record<string, string> = {
        Beginner: "#0066cc", Intermediate: "#7a3f00", Advanced: "#a30000",
    };
    const barColor: Record<CaseStatus, string> = {
        completed: "#34c759", in_progress: "#0066cc", not_started: "#e0e0e0",
    };
    const cfg = statusCfg[data.status];

    return (
        <div
            onClick={() => router.push(`/student/case/${data.id}`)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: 20, cursor: "pointer", boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow 0.18s, transform 0.18s" }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <Badge label={cfg.label} bg={cfg.bg} color={cfg.color} />
                <Badge label={data.difficulty} bg="#f5f5f7" color={diffColor[data.difficulty] ?? "#7a7a7a"} />
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: data.descriptionPreview ? 6 : 12, lineHeight: 1.35, letterSpacing: "-0.1px" }}>
                {data.title}
            </div>

            {data.descriptionPreview ? (
                <div
                    style={{
                        fontSize: 12,
                        color: "#7a7a7a",
                        lineHeight: 1.45,
                        marginBottom: 12,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                    }}
                >
                    {data.descriptionPreview}
                </div>
            ) : null}

            <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${data.progress}%`, background: barColor[data.status], transition: "width 0.3s" }} />
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Tag>Due {data.dueDate}</Tag>
                {data.teaching_goals.slice(0, 2).map((g) => <Tag key={g}>{g}</Tag>)}
            </div>
        </div>
    );
}
