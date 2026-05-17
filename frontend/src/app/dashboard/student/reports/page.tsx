"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiReport, ApiSession } from "@/lib/api";
import DashboardLayout, { NavItem, NavSection } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, EmptyState, ErrorState, IconChart, IconGrid, IconLogout, IconReport,
    IconSettings, IconUser, LoadingState, StatCard,
} from "@/components/dashboard/shared";

interface ReportRow {
    session: ApiSession;
    caseData: ApiCase;
    report: ApiReport | null;
}

function scorePct(report: ApiReport | null): number | null {
    if (!report || !report.total_max) return null;
    return Math.round((report.total_score / report.total_max) * 100);
}

export default function StudentReportsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(u);

        Promise.all([api.cases.list(true), api.sessions.byStudent(u.id)])
            .then(async ([cases, sessions]) => {
                const caseById = new Map(cases.map((c) => [c.id, c]));
                const completed = sessions.filter((s) => s.status === "submitted" || s.status === "scored");
                const reportRows = await Promise.all(completed.map(async (session) => {
                    const report = await api.sessions.getReport(session.id).catch(() => null);
                    return {
                        session,
                        caseData: caseById.get(session.case_id) ?? {
                            id: session.case_id,
                            title: "Archived simulation",
                            description: null,
                            case_type: "decision",
                            difficulty: "medium",
                            status: "published",
                            teaching_goals: [],
                            created_at: session.started_at,
                        },
                        report,
                    };
                }));
                setRows(reportRows);
            })
            .catch(() => setError("Could not load debrief reports. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [router]);

    if (!user) return null;
    function handleLogout() { logout(); router.push("/login"); }
    const scored = rows.filter((r) => r.report).length;
    const avg = scored
        ? Math.round(rows.reduce((sum, row) => sum + (scorePct(row.report) ?? 0), 0) / scored)
        : null;

    const navSections: NavSection[] = [{
        label: "Learning",
        items: [
            { icon: <IconGrid />, label: "Case Library", onClick: () => router.push("/dashboard/student") },
            { icon: <IconChart />, label: "My Progress", onClick: () => router.push("/dashboard/student/progress") },
            { icon: <IconReport />, label: "Debrief Reports", active: true },
        ],
    }];
    const accountItems: NavItem[] = [
        { icon: <IconUser />, label: "Profile" },
        { icon: <IconSettings />, label: "Settings" },
        { icon: <IconLogout />, label: "Sign Out", onClick: handleLogout, danger: true },
    ];

    return (
        <DashboardLayout
            portalName="Student Portal"
            navSections={navSections}
            accountItems={accountItems}
            headerLeft={<div><h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 700, margin: 0 }}>Debrief Reports</h1><p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Review submitted simulations and scoring feedback.</p></div>}
            headerRight={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span><Avatar name={user.fullName} /></div>}
            statsRow={!loading && !error ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(150px, 1fr))", gap: 12, width: "100%" }}>
                    <StatCard label="Submitted reports" value={rows.length} gradient="blue" />
                    <StatCard label="Scored reports" value={scored} gradient="green" />
                    <StatCard label="Average score" value={avg === null ? "-" : `${avg}%`} gradient="slate" />
                </div>
            ) : undefined}
        >
            {loading && <LoadingState count={3} />}
            {error && <ErrorState message={error} />}
            {!loading && !error && rows.length === 0 && <EmptyState message="No debrief reports yet. Submit a simulation to see feedback here." />}
            {!loading && !error && rows.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                    {rows.map((row) => {
                        const pct = scorePct(row.report);
                        return (
                            <button
                                key={row.session.id}
                                onClick={() => router.push(`/student/session/${row.session.id}/report`)}
                                style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "18px", textAlign: "left", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                            >
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#1d1d1f", marginBottom: 6 }}>{row.caseData.title}</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
                                    Submitted {row.session.submitted_at ? new Date(row.session.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
                                </div>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 12, color: "#64748b" }}>{row.report ? "Score" : "Report pending"}</span>
                                    <span style={{ fontSize: 24, fontWeight: 800, color: pct === null ? "#94a3b8" : pct >= 80 ? "#15803d" : pct >= 65 ? "#d97706" : "#b91c1c" }}>{pct === null ? "-" : `${pct}%`}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
}
