"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiStudentAnalytics, ApiStudentAnalyticsRow } from "@/lib/api";
import DashboardLayout, { NavItem, NavSection } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, EmptyState, ErrorState, IconGrid, IconLogout, IconSettings, IconUser, IconUsers,
    LoadingState, StatCard,
} from "@/components/dashboard/shared";

function pct(value: number | null): string {
    return value === null ? "-" : `${Math.round(value)}%`;
}

function dateLabel(value: string | null): string {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusLabel(status: string): string {
    return status.replace("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ProfessorAnalyticsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [cases, setCases] = useState<ApiCase[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState<string>("");
    const [data, setData] = useState<ApiStudentAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "professor") { router.push("/dashboard/student"); return; }
        setUser(u);
        const params = new URLSearchParams(window.location.search);
        setSelectedCaseId(params.get("caseId") ?? "");
    }, [router]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        setError(null);
        Promise.all([
            api.cases.list(false),
            api.professor.studentAnalytics(selectedCaseId || undefined),
        ])
            .then(([caseRows, analytics]) => {
                setCases(caseRows);
                setData(analytics);
            })
            .catch(() => setError("Could not load student analytics. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [user, selectedCaseId]);

    const sortedRows = useMemo(
        () => [...(data?.rows ?? [])].sort((a, b) => (b.score_percent ?? -1) - (a.score_percent ?? -1)),
        [data],
    );

    if (!user) return null;

    function handleLogout() {
        logout();
        router.push("/login");
    }

    const navSections: NavSection[] = [
        {
            label: "Simulations",
            accentColor: "#b91c1c",
            items: [
                { icon: <IconGrid />, label: "My Simulations", onClick: () => router.push("/dashboard/professor") },
                { icon: <IconUsers />, label: "Student Analytics", active: true },
            ],
        },
    ];
    const accountItems: NavItem[] = [
        { icon: <IconUser />, label: "Profile" },
        { icon: <IconSettings />, label: "Settings" },
        { icon: <IconLogout />, label: "Sign Out", onClick: handleLogout, danger: true },
    ];

    const headerLeft = (
        <div>
            <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.3px", margin: 0 }}>Student Analytics</h1>
            <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Track progress, evidence quality, and report scores across simulations.</p>
        </div>
    );
    const headerRight = (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                style={{ minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d6d6", background: "#fff", fontSize: 13, color: "#1d1d1f", fontFamily: "SF Pro Text, system-ui" }}
            >
                <option value="">All simulations</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
            <Avatar name={user.fullName} color="#b91c1c" />
        </div>
    );

    const overview = data?.overview;
    const statsRow = overview ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 12, width: "100%" }}>
            <StatCard label="Sessions" value={overview.total_sessions} />
            <StatCard label="Submitted" value={overview.submitted_sessions} color="#15803d" />
            <StatCard label="In progress" value={overview.in_progress_sessions} color="#1d4ed8" />
            <StatCard label="Avg score" value={pct(overview.avg_score_percent)} color="#b91c1c" />
            <StatCard label="Avg evidence" value={overview.avg_evidence_count} color="#7c3aed" />
            <StatCard label="Avg roles" value={overview.avg_roles_count} color="#0f766e" />
        </div>
    ) : undefined;

    return (
        <DashboardLayout
            portalName="Professor Portal"
            navSections={navSections}
            accountItems={accountItems}
            headerLeft={headerLeft}
            headerRight={headerRight}
            statsRow={statsRow}
        >
            {loading && <LoadingState count={4} />}
            {error && <ErrorState message={error} />}
            {!loading && !error && sortedRows.length === 0 && <EmptyState message="No student sessions found for this selection." />}
            {!loading && !error && sortedRows.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr", gap: 12, padding: "11px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <span>Student</span><span>Simulation</span><span>Status</span><span>Score</span><span>Evidence</span><span>Roles</span><span>Submitted</span>
                    </div>
                    {sortedRows.map((row) => <AnalyticsRow key={row.session_id} row={row} />)}
                </div>
            )}
        </DashboardLayout>
    );
}

function AnalyticsRow({ row }: { row: ApiStudentAnalyticsRow }) {
    const scoreColor = row.score_percent === null ? "#94a3b8" : row.score_percent >= 80 ? "#15803d" : row.score_percent >= 65 ? "#d97706" : "#b91c1c";
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr", gap: 12, padding: "13px 14px", borderBottom: "1px solid #f1f5f9", alignItems: "center", fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.student_name || row.student_id}</span>
            <span style={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.case_title}</span>
            <span style={{ color: row.status === "scored" ? "#15803d" : "#475569", fontWeight: 600 }}>{statusLabel(row.status)}</span>
            <span style={{ color: scoreColor, fontWeight: 800 }}>{pct(row.score_percent)}</span>
            <span style={{ color: "#475569" }}>{row.evidence_count} items</span>
            <span style={{ color: "#475569" }}>{row.roles_count}</span>
            <span style={{ color: "#64748b" }}>{dateLabel(row.submitted_at ?? row.generated_at)}</span>
        </div>
    );
}
