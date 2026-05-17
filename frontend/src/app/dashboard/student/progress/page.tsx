"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiSession, difficultyLabel, sessionProgress } from "@/lib/api";
import DashboardLayout, { NavItem, NavSection } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, EmptyState, ErrorState, IconChart, IconGrid, IconLogout, IconReport,
    IconSettings, IconUser, LoadingState, StatCard,
} from "@/components/dashboard/shared";

interface ProgressRow {
    caseData: ApiCase;
    session: ApiSession | null;
    progress: number;
    status: "not_started" | "in_progress" | "answering" | "completed";
}

function statusLabel(status: ProgressRow["status"]): string {
    return status === "not_started" ? "Not Started" : status === "in_progress" ? "Interviewing" : status === "answering" ? "Answering" : "Completed";
}

export default function StudentProgressPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [rows, setRows] = useState<ProgressRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "student") { router.push("/dashboard/professor"); return; }
        setUser(u);
        Promise.all([api.cases.list(true), api.sessions.byStudent(u.id)])
            .then(([cases, sessions]) => {
                const byCase = new Map(sessions.map((s) => [s.case_id, s]));
                setRows(cases.map((caseData) => {
                    const session = byCase.get(caseData.id) ?? null;
                    const status: ProgressRow["status"] = !session
                        ? "not_started"
                        : session.status === "submitted" || session.status === "scored"
                            ? "completed"
                            : session.status === "answering"
                                ? "answering"
                                : "in_progress";
                    return {
                        caseData,
                        session,
                        status,
                        progress: session ? sessionProgress(session) : 0,
                    };
                }));
            })
            .catch(() => setError("Could not load your progress. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [router]);

    const complete = rows.filter((r) => r.status === "completed").length;
    const active = rows.filter((r) => r.status === "in_progress" || r.status === "answering").length;
    const avgProgress = useMemo(
        () => rows.length ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length) : 0,
        [rows],
    );

    if (!user) return null;
    function handleLogout() { logout(); router.push("/login"); }

    const navSections: NavSection[] = [{
        label: "Learning",
        items: [
            { icon: <IconGrid />, label: "Case Library", onClick: () => router.push("/dashboard/student") },
            { icon: <IconChart />, label: "My Progress", active: true },
            { icon: <IconReport />, label: "Debrief Reports", onClick: () => router.push("/dashboard/student/reports") },
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
            headerLeft={<div><h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 700, margin: 0 }}>My Progress</h1><p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Your current progress across assigned simulations.</p></div>}
            headerRight={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span><Avatar name={user.fullName} /></div>}
            statsRow={!loading && !error ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(130px, 1fr))", gap: 12, width: "100%" }}>
                    <StatCard label="Assigned cases" value={rows.length} gradient="blue" />
                    <StatCard label="Active" value={active} gradient="orange" />
                    <StatCard label="Completed" value={complete} gradient="green" />
                    <StatCard label="Average progress" value={`${avgProgress}%`} gradient="slate" />
                </div>
            ) : undefined}
        >
            {loading && <LoadingState count={4} />}
            {error && <ErrorState message={error} />}
            {!loading && !error && rows.length === 0 && <EmptyState message="No assigned simulations yet." />}
            {!loading && !error && rows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {rows.map((row) => (
                        <button
                            key={row.caseData.id}
                            onClick={() => router.push(`/student/case/${row.caseData.id}`)}
                            style={{ textAlign: "left", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "16px 18px", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 10 }}>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1d1d1f" }}>{row.caseData.title}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{difficultyLabel(row.caseData.difficulty)} · {statusLabel(row.status)}</div>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: row.status === "completed" ? "#15803d" : "#0066cc" }}>{row.progress}%</div>
                            </div>
                            <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${row.progress}%`, borderRadius: 999, background: row.status === "completed" ? "linear-gradient(90deg,#15803d,#22c55e)" : "linear-gradient(90deg,#0066cc,#60a5fa)" }} />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </DashboardLayout>
    );
}
