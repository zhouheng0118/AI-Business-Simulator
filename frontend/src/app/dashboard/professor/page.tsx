"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiCaseStats, difficultyLabel } from "@/lib/api";
import DashboardLayout, { NavSection, NavItem } from "@/components/dashboard/DashboardLayout";
import {
    Avatar, Badge,
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
                { icon: <IconUsers />, label: "Student Analytics", onClick: () => router.push("/dashboard/professor/analytics") },
            ],
            accentColor: "#b91c1c", // Wine-red accent for sidebar
        },
    ];

    const accountItems: NavItem[] = [
        { icon: <IconUser />,     label: "Profile" },
        { icon: <IconSettings />, label: "Settings" },
        { icon: <IconLogout />,   label: "Sign Out", onClick: handleLogout, danger: true },
    ];

    const headerLeft = (
        <div>
            <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 600, color: "#b91c1c", letterSpacing: "-0.3px", margin: 0 }}>My Simulations</h1>
            <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Manage and publish AI business cases for your students</p>
        </div>
    );

    const headerRight = (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
                onClick={() => router.push("/professor/cases/new")}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 18px",
                    background: "linear-gradient(120deg, #b91c1c 0%, #dc2626 45%, #2563eb 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9999,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "SF Pro Text, system-ui",
                    letterSpacing: "-0.14px",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                    transition: "box-shadow 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 6px 14px rgba(59, 63, 167, 0.28)";
                    e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
                    e.currentTarget.style.transform = "scale(1)";
                }}
            >
                <IconPlus /> Create New Simulation
            </button>
            <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
            <Avatar name={user.fullName} color="#2563eb" />
        </div>
    );

    const statsRow = !loading && !error ? (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 32px",
            background: "#f8fafc",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}>
            <span style={{ fontSize: 16, fontWeight: 500, color: "#b91c1c" }}>
                {published}/6 published · <span style={{ color: "#2563eb" }}>{totalStudents} students started</span> · Avg score: <span style={{ color: "#2563eb" }}>{avgScore !== null ? avgScore : "—"}</span>
            </span>
            <div style={{ flex: 1, height: 6, background: "#e0e7ef", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(published / 6) * 100}%`, height: "100%", background: "linear-gradient(90deg, #2563eb, #1e40af)" }} />
            </div>
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
            style={{ background: "#fdf8f8" }} // Update main content background
        >
            {loading && <LoadingState count={3} />}
            {error   && <ErrorState message={error} />}
            {!loading && !error && rows.length === 0 && <EmptyState message="No simulations yet. Create your first one above." />}
            {!loading && !error && rows.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {['published', 'draft'].map((status) => {
                        const filteredRows = rows.filter((r) => r.case.status === status);
                        return (
                            <div key={status}>
                                <h2 style={{ fontSize: 16, fontWeight: 600, color: "#b91c1c", marginBottom: 12 }}>
                                    {status.toUpperCase()} · {filteredRows.length}
                                </h2>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: status === 'published' ? "repeat(3, 1fr)" : "repeat(auto-fill, minmax(300px, 1fr))",
                                        gap: 16,
                                    }}
                                >
                                    {filteredRows.map((r) => (
                                        <SimCard
                                            key={r.case.id}
                                            data={r.case}
                                            stats={r.stats}
                                            onDeleted={(id) => setRows((prev) => prev.filter((x) => x.case.id !== id))}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
}

function SimCard({ data, stats, onDeleted }: { data: ApiCase; stats: ApiCaseStats; onDeleted: (id: string) => void }) {
    const router = useRouter();
    const [hovered, setHovered] = useState(false);
    const [confirmDelete, setConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDelete() {
        if (deleting) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await api.cases.delete(data.id);
            onDeleted(data.id);
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Delete failed");
            setDeleting(false);
        }
    }

    const submissionPct = stats.sessions_total > 0
        ? Math.round((stats.sessions_submitted / stats.sessions_total) * 100)
        : 0;
    const diffLabel = difficultyLabel(data.difficulty);
    const diffBadge: Record<string, { bg: string; color: string }> = {
        Beginner: { bg: "#dcfce7", color: "#166534" },
        Intermediate: { bg: "#dbeafe", color: "#1d4ed8" },
        Advanced: { bg: "#fee2e2", color: "#b91c1c" },
    };


    // SVG path for logo based on case title (student dashboard logic)
    function caseThemeIconPath(title: string): string {
        const t = (title || "").toLowerCase();
        if (t.includes("rail") || t.includes("train") || t.includes("amtrak"))
            return "M4 15V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M2 15h20M7 15v3M17 15v3M8 9h3M13 9h3M6 5v2M18 5v2";
        if (t.includes("marriott") || t.includes("hotel") || t.includes("lodg") || t.includes("resort"))
            return "M3 21h18M3 9l9-6 9 6M4 21V9M20 21V9M9 21v-6h6v6M9 13h2M13 13h2M9 16h2M13 16h2";
        if (t.includes("arundel") || t.includes("film") || t.includes("cinema") || t.includes("movie") || t.includes("studio"))
            return "M2 5h20v14H2zM7 5v14M17 5v14M2 9h5M17 9h5M2 15h5M17 15h5M9 8h6v8H9z";
        if (t.includes("spotify") || t.includes("music") || t.includes("audio") || t.includes("sound") || t.includes("stream"))
            return "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z";
        // Default: business chart
        return "M3 21V9l9-6 9 6v12M9 21v-7h6v7M3 13h4M17 13h4M12 3v3";
    }

    const statusCfg = data.status === "published"
        ? { label: "Published", bg: "#fca5a5", color: "#b91c1c" }
        : { label: "Draft", bg: "#e5e5e5", color: "#7a7a7a" };

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: "#ffffff",
                border: hovered ? "1px solid #fca5a5" : "1px solid #e0e0e0",
                borderRadius: 12,
                boxShadow: hovered ? "0 4px 16px rgba(252, 165, 165, 0.3)" : "0 1px 3px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.18s, border 0.18s",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minHeight: 320,
            }}
        >
            <div style={{
                height: 120,
                background: "linear-gradient(120deg, #7f1d1d 0%, #b91c1c 60%, #1e3a8a 100%)",
                position: "relative",
            }}>
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        position: "absolute",
                        top: "50%",
                        right: 16,
                        transform: "translateY(-50%)",
                        width: 64,
                        height: 64,
                        opacity: 0.18,
                        zIndex: 1,
                    }}
                >
                    <path d={caseThemeIconPath(data.title ?? "")} />
                </svg>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "18px 22px", gap: 12 }}>
                <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <Badge label={statusCfg.label} bg={statusCfg.bg} color={statusCfg.color} />
                        <Badge label={diffLabel} {...(diffBadge[diffLabel] ?? { bg: "#f1f5f9", color: "#64748b" })} />
                    </div>

                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", marginBottom: 4 }}>
                        {data.title}
                    </div>

                </div>
                {/* Action buttons row */}
                <div style={{ display: "flex", gap: 8, margin: "8px 0 0" }}>
                    <button
                        style={{
                            flex: 1,
                            padding: "7px 0",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            background: "linear-gradient(90deg, #2563eb, #1e40af)",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "SF Pro Text, system-ui",
                            transition: "background 0.12s"
                        }}
                        onClick={() => router.push(`/dashboard/professor/analytics?caseId=${data.id}`)}
                    >Analytics</button>
                    <button
                        style={{
                            flex: 1,
                            padding: "7px 0",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            background: "#fff",
                            color: "#2563eb",
                            border: "1.5px solid #2563eb",
                            cursor: "pointer",
                            fontFamily: "SF Pro Text, system-ui",
                            transition: "background 0.12s"
                        }}
                        onClick={() => router.push(`/professor/cases/${data.id}/edit`)}
                    >Edit</button>
                    <button
                        style={{
                            flex: 1,
                            padding: "7px 0",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            background: "#fff",
                            color: "#b91c1c",
                            border: "1.5px solid #b91c1c",
                            cursor: "pointer",
                            fontFamily: "SF Pro Text, system-ui",
                            transition: "background 0.12s"
                        }}
                        onClick={() => setConfirm(true)}
                    >Delete</button>
                </div>

                {confirmDelete && (
                    <div style={{ background: "#fff7f7", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "14px 16px", marginTop: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c", marginBottom: 10 }}>
                            Delete &ldquo;{data.title}&rdquo;? This cannot be undone.
                        </div>
                        {deleteError && (
                            <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{deleteError}</div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                disabled={deleting}
                                onClick={handleDelete}
                                style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 13, fontWeight: 700, background: "#b91c1c", color: "#fff", border: "none", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}
                            >
                                {deleting ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button
                                disabled={deleting}
                                onClick={() => { setConfirm(false); setDeleteError(null); }}
                                style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 13, fontWeight: 600, background: "#fff", color: "#374151", border: "1.5px solid #d1d5db", cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: "#2563eb" }}>
                            {stats.sessions_submitted}/{stats.sessions_total} students submitted
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 600, color: "#2563eb" }}>{submissionPct}%</span>
                    </div>
                    <div style={{ height: 6, background: "#e0e7ef", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${submissionPct}%`, background: "linear-gradient(90deg, #2563eb, #1e40af)" }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
