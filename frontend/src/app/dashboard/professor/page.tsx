"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import { api, ApiCase, ApiCaseStats, difficultyLabel, formatDue } from "@/lib/api";

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

    function handleLogout() {
        logout();
        router.push("/login");
    }

    if (!user) return null;

    const published     = rows.filter((r) => r.case.status === "published").length;
    const totalStudents = rows.reduce((acc, r) => acc + r.stats.sessions_total, 0);
    const scoredRows    = rows.filter((r) => r.stats.avg_score !== null);
    const avgScore = scoredRows.length
        ? Math.round(scoredRows.reduce((acc, r) => acc + (r.stats.avg_score ?? 0), 0) / scoredRows.length)
        : null;

    return (
        <div style={{ display: "flex", height: "100vh", background: "#f5f5f7", overflow: "hidden" }}>
            <aside style={{ width: 220, flexShrink: 0, background: "#ffffff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e0e0e0" }}>
                    <div style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px" }}>AI Business Simulator</div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 3 }}>Professor Portal</div>
                </div>
                <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel>Simulations</SbLabel>
                    <SbItem icon={<IconGrid />}  label="My Simulations" active />
                    <SbItem icon={<IconUsers />} label="Student Analytics" />
                </nav>
                <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel>Account</SbLabel>
                    <SbItem icon={<IconUser />}     label="Profile" />
                    <SbItem icon={<IconSettings />} label="Settings" />
                    <SbItem icon={<IconLogout />}   label="Sign Out" onClick={handleLogout} danger />
                </div>
            </aside>

            <main style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.3px", margin: 0 }}>My Simulations</h1>
                        <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Manage and publish AI business cases for your students</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button
                            onClick={() => alert("Upload & Setup coming soon.")}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#0066cc", color: "#fff", border: "none", borderRadius: 9999, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.14px" }}
                        >
                            <IconPlus /> Create New Simulation
                        </button>
                        <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
                        <Avatar name={user.fullName} />
                    </div>
                </div>

                {!loading && !error && (
                    <div style={{ padding: "20px 32px 0", display: "flex", gap: 12 }}>
                        <StatCard label="Total Cases"       value={rows.length} />
                        <StatCard label="Published"         value={published}    color="#34c759" />
                        <StatCard label="Students Started"  value={totalStudents} color="#0066cc" />
                        <StatCard label="Avg Class Score"   value={avgScore !== null ? `${avgScore}` : "—"} color="#ff9500" />
                    </div>
                )}

                <div style={{ padding: "20px 32px 32px" }}>
                    {loading && <LoadingState />}
                    {error   && <ErrorState message={error} />}
                    {!loading && !error && rows.length === 0 && <EmptyState />}
                    {!loading && !error && rows.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {rows.map((r) => <SimCard key={r.case.id} data={r.case} stats={r.stats} />)}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}


function LoadingState() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: 130, borderRadius: 12, background: "#f0f0f0", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#991b1b" }}>
            {message}
        </div>
    );
}

function EmptyState() {
    return (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#7a7a7a", fontSize: 14 }}>
            No simulations yet. Create your first one above.
        </div>
    );
}

function SimCard({ data, stats }: { data: ApiCase; stats: ApiCaseStats }) {
    const [hovered, setHovered] = useState(false);
    const submissionPct = stats.sessions_total > 0
        ? Math.round((stats.sessions_submitted / stats.sessions_total) * 100)
        : 0;

    const statusCfg = data.status === "published"
        ? { label: "Published", bg: "#e8f5e9", color: "#2e7d32" }
        : { label: "Draft",     bg: "#f5f5f7", color: "#7a7a7a" };
    const diffColor: Record<string, string> = {
        Beginner: "#0066cc", Intermediate: "#7a3f00", Advanced: "#a30000",
    };

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

                <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                    {data.status === "published" && (
                        <ActionBtn label="View Analytics" primary onClick={() => alert(`Analytics for "${data.title}" coming soon.`)} />
                    )}
                    <ActionBtn label={data.status === "draft" ? "Continue Editing" : "Edit"} onClick={() => alert(`Edit "${data.title}" coming soon.`)} />
                    {data.status === "draft" && (
                        <ActionBtn label="Publish" primary onClick={() => alert(`"${data.title}" would be published.`)} />
                    )}
                </div>
            </div>
        </div>
    );
}


function SbLabel({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", padding: "8px 10px 4px" }}>{children}</div>;
}

function SbItem({ icon, label, active, onClick, danger }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; danger?: boolean }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", cursor: "pointer", background: active ? "#f0f0f5" : hovered ? "#f5f5f7" : "transparent", color: danger ? "#ff3b30" : active ? "#0066cc" : "#1d1d1f", fontSize: 13, fontWeight: active ? 600 : 400, textAlign: "left", fontFamily: "SF Pro Text, system-ui", borderLeft: active ? "2px solid #0066cc" : "2px solid transparent", transition: "background 0.12s" }}>
            <span style={{ width: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
            {label}
        </button>
    );
}

function StatCard({ label, value, color = "#1d1d1f" }: { label: string; value: number | string; color?: string }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
            <span style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 11, color: "#7a7a7a" }}>{label}</span>
        </div>
    );
}

function Avatar({ name }: { name: string }) {
    return (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#5856d6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

function ActionBtn({ label, primary, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: "SF Pro Text, system-ui", cursor: "pointer", border: primary ? "none" : "1px solid #e0e0e0", background: primary ? (hovered ? "#0071e3" : "#0066cc") : (hovered ? "#f5f5f7" : "#ffffff"), color: primary ? "#ffffff" : "#1d1d1f", transition: "background 0.12s", whiteSpace: "nowrap" }}>
            {label}
        </button>
    );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
    return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: bg, color, letterSpacing: "0.02em" }}>{label}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
    return <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 8px" }}>{children}</span>;
}

function IconGrid()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function IconUsers()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>; }
function IconUser()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IconSettings(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
function IconLogout()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function IconPlus()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
