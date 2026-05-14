"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiCaseStats, difficultyLabel, formatDue } from "@/lib/api";
import DashboardLayout, { NavSection, NavItem } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, Badge, Tag, StatCard, ActionBtn,
    LoadingState, ErrorState, EmptyState,
    IconGrid, IconUsers, IconUser, IconSettings, IconLogout, IconPlus,
} from "@/components/dashboard/shared";

interface CaseWithStats {
    case: ApiCase;
    stats: ApiCaseStats;
}

export default function ProfessorDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [rows, setRows] = useState<CaseWithStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.push("/login"); return; }
        if (u.role !== "professor") { router.push("/dashboard/student"); return; }
        setUser(u);

        api.cases.list(false)
            .then(async (cases) => {
                const combined = await Promise.all(
                    cases.map(async (c) => {
                        try {
                            const stats = await api.cases.stats(c.id);
                            return { case: c, stats };
                        } catch {
                            return { case: c, stats: { sessions_total: 0, sessions_submitted: 0, avg_score: null } };
                        }
                    })
                );
                setRows(combined);
            })
            .catch(() => setError("Could not load simulations. Make sure the backend is running."))
            .finally(() => setLoading(false));
    }, [router]);

    if (!user) return null;

    const published     = rows.filter((r) => r.case.status === "published").length;
    const totalStudents = rows.reduce((acc, r) => acc + r.stats.sessions_total, 0);
    const scoredRows    = rows.filter((r) => r.stats.avg_score !== null);
    const avgScore = scoredRows.length
        ? Math.round(scoredRows.reduce((acc, r) => acc + (r.stats.avg_score ?? 0), 0) / scoredRows.length)
        : null;

    function handleLogout() {
        logout();
        router.push("/login");
    }

    const navSections: NavSection[] = [
        {
            label: "Simulations",
            items: [
                { icon: <IconGrid />,  label: "My Simulations", active: true },
                { icon: <IconUsers />, label: "Student Analytics" },
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
            <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.3px", margin: 0 }}>My Simulations</h1>
            <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Manage and publish AI business cases for your students</p>
        </div>
    );

    const headerRight = (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
                onClick={() => router.push("/professor/cases/new")}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 9999, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.14px" }}
            >
                <IconPlus /> Create New Simulation
            </button>
            <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
            <Avatar name={user.fullName} color="#5856d6" />
        </div>
    );

    const statsRow = !loading && !error ? (
        <>
            <StatCard label="Total Cases"      value={rows.length} />
            <StatCard label="Published"        value={published}    color="#34c759" />
            <StatCard label="Students Started" value={totalStudents} color="#0066cc" />
            <StatCard label="Avg Class Score"  value={avgScore !== null ? `${avgScore}` : "—"} color="#ff9500" />
        </>
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
            {loading && <LoadingState count={3} />}
            {error   && <ErrorState message={error} />}
            {!loading && !error && rows.length === 0 && <EmptyState message="No simulations yet. Create your first one above." />}
            {!loading && !error && rows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {rows.map((r) => (
                        <SimCard
                            key={r.case.id}
                            data={r.case}
                            stats={r.stats}
                            onDeleted={(id) => setRows((prev) => prev.filter((x) => x.case.id !== id))}
                        />
                    ))}
                </div>
            )}
        </DashboardLayout>
    );
}

function SimCard({ data, stats, onDeleted }: { data: ApiCase; stats: ApiCaseStats; onDeleted: (id: string) => void }) {
    const router = useRouter();
    const [hovered, setHovered]       = useState(false);
    const [confirmDelete, setConfirm] = useState(false);
    const [deleting, setDeleting]     = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const submissionPct = stats.sessions_total > 0
        ? Math.round((stats.sessions_submitted / stats.sessions_total) * 100)
        : 0;

    const statusCfg = data.status === "published"
        ? { label: "Published", bg: "#e8f5e9", color: "#2e7d32" }
        : { label: "Draft",     bg: "#f5f5f7", color: "#7a7a7a" };
    const diffColor: Record<string, string> = {
        Beginner: "#0066cc", Intermediate: "#7a3f00", Advanced: "#a30000",
    };

    async function handleDelete() {
        setDeleting(true);
        setDeleteError(null);
        try {
            await api.cases.delete(data.id);
            onDeleted(data.id);
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : "Delete failed");
            setDeleting(false);
            setConfirm(false);
        }
    }

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "18px 22px", boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.07)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "box-shadow 0.18s" }}
        >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <Badge label={statusCfg.label} bg={statusCfg.bg} color={statusCfg.color} />
                        <Badge label={difficultyLabel(data.difficulty)} bg="#f5f5f7" color={diffColor[difficultyLabel(data.difficulty)] ?? "#7a7a7a"} />
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.15px", marginBottom: 4 }}>
                        {data.title}
                    </div>

                    {data.teaching_goals.length > 0 && (
                        <div style={{ fontSize: 12, color: "#7a7a7a", marginBottom: 10 }}>
                            {data.teaching_goals.join(" · ")}
                        </div>
                    )}

                    {data.status === "published" && (
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: "#7a7a7a" }}>
                                    {stats.sessions_submitted}/{stats.sessions_total} students submitted
                                </span>
                                <span style={{ fontSize: 11, color: "#7a7a7a" }}>{submissionPct}%</span>
                            </div>
                            <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${submissionPct}%`, background: "#0066cc", borderRadius: 2 }} />
                            </div>
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Tag>Created {formatDue(data.created_at)}</Tag>
                        <Tag>{data.case_type}</Tag>
                        {stats.avg_score !== null && <Tag>Avg Score: {stats.avg_score}/100</Tag>}
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, alignItems: "flex-end" }}>
                    {data.status === "published" && (
                        <ActionBtn label="View Analytics" primary onClick={() => alert(`Analytics for "${data.title}" coming soon.`)} />
                    )}
                    <ActionBtn
                        label={data.status === "draft" ? "Review Playbook" : "Edit"}
                        onClick={() => router.push(
                            data.status === "draft"
                                ? `/professor/cases/${data.id}/review`
                                : `/professor/cases/${data.id}/edit`
                        )}
                    />

                    {/* Delete button / inline confirm */}
                    {!confirmDelete ? (
                        <button
                            onClick={() => setConfirm(true)}
                            style={{ fontSize: 11, color: "#9e2a2b", background: "none", border: "1px solid #fecaca", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontFamily: "SF Pro Text, system-ui", fontWeight: 500 }}
                        >
                            Delete
                        </button>
                    ) : (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#9e2a2b", fontWeight: 500 }}>Delete?</span>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                style={{ fontSize: 11, color: "#fff", background: "#dc2626", border: "none", borderRadius: 6, padding: "4px 10px", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", fontWeight: 600 }}
                            >
                                {deleting ? "…" : "Yes"}
                            </button>
                            <button
                                onClick={() => setConfirm(false)}
                                style={{ fontSize: 11, color: "#7a7a7a", background: "#f5f5f7", border: "1px solid #e0e0e0", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                    {deleteError && (
                        <span style={{ fontSize: 11, color: "#9e2a2b", maxWidth: 180, textAlign: "right" }}>{deleteError}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
