"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, User } from "@/lib/auth";
import {
    api,
    ApiCase,
    ApiSession,
    ApiAssignment,
    sessionProgress,
    difficultyLabel,
    formatDue,
} from "@/lib/api";

type CaseStatus = "not_started" | "in_progress" | "completed";

interface DisplayCase {
    id: string;
    title: string;
    description: string;
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
    const sessionByCase = new Map(sessions.map((s) => [s.case_id, s]));
    const assignmentByCase = new Map(assignments.map((a) => [a.case_id, a]));

    return cases.map((c) => {
        const session = sessionByCase.get(c.id);
        const assignment = assignmentByCase.get(c.id);

        let status: CaseStatus = "not_started";
        let progress = 0;
        if (session) {
            if (session.status === "submitted" || session.status === "scored") {
                status = "completed";
            } else {
                status = "in_progress";
            }
            progress = sessionProgress(session);
        }

        return {
            id: c.id,
            title: c.title,
            description: c.description ?? "",
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
    const [user, setUser] = useState<User | null>(null);
    const [cases, setCases] = useState<DisplayCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    function handleLogout() {
        logout();
        router.push("/login");
    }

    if (!user) return null;

    const inProgress = cases.filter((c) => c.status === "in_progress").length;
    const completed  = cases.filter((c) => c.status === "completed").length;

    return (
        <div style={{ display: "flex", height: "100vh", background: "#f5f5f7", overflow: "hidden" }}>
            <aside style={{ width: 220, flexShrink: 0, background: "#ffffff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e0e0e0" }}>
                    <div style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px" }}>
                        AI Business Simulator
                    </div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 3 }}>Student Portal</div>
                </div>
                <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel>Learning</SbLabel>
                    <SbItem icon={<IconGrid />} label="Case Library" active />
                    <SbItem icon={<IconChart />} label="My Progress" />
                    <SbItem icon={<IconReport />} label="Debrief Reports" />
                </nav>
                <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel>Account</SbLabel>
                    <SbItem icon={<IconUser />} label="Profile" />
                    <SbItem icon={<IconSettings />} label="Settings" />
                    <SbItem icon={<IconLogout />} label="Sign Out" onClick={handleLogout} danger />
                </div>
            </aside>

            {/* ── Main ── */}
            <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <h1 style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 22, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.3px", margin: 0 }}>Case Library</h1>
                        <p style={{ fontSize: 13, color: "#7a7a7a", margin: "2px 0 0" }}>Your assigned business simulations</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, color: "#7a7a7a" }}>{user.fullName}</span>
                        <Avatar name={user.fullName} />
                    </div>
                </div>

                {/* Stats row */}
                {!loading && !error && (
                    <div style={{ padding: "20px 32px 0", display: "flex", gap: 12 }}>
                        <StatPill label="Total Cases"  value={cases.length} />
                        <StatPill label="In Progress"  value={inProgress}   color="#ff9500" />
                        <StatPill label="Completed"    value={completed}    color="#34c759" />
                        <StatPill label="Not Started"  value={cases.length - inProgress - completed} />
                    </div>
                )}

                {/* Content */}
                <div style={{ padding: "20px 32px 32px", flex: 1 }}>
                    {loading && <LoadingState />}
                    {error   && <ErrorState message={error} />}
                    {!loading && !error && cases.length === 0 && <EmptyState />}
                    {!loading && !error && cases.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            {cases.map((c) => <CaseCard key={c.id} data={c} />)}
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
            {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ height: 160, borderRadius: 12, background: "#f0f0f0", animation: "pulse 1.5s ease-in-out infinite" }} />
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
            No cases have been assigned to you yet.
        </div>
    );
}


function CaseCard({ data }: { data: DisplayCase }) {
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
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: 20, cursor: "pointer", boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow 0.18s, transform 0.18s" }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <Badge label={cfg.label} bg={cfg.bg} color={cfg.color} />
                <Badge label={data.difficulty} bg="#f5f5f7" color={diffColor[data.difficulty] ?? "#7a7a7a"} />
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", marginBottom: 6, lineHeight: 1.35, letterSpacing: "-0.1px" }}>
                {data.title}
            </div>

            <div style={{ fontSize: 12, color: "#7a7a7a", lineHeight: 1.5, marginBottom: 12 }}>
                {data.description || "No description provided."}
            </div>

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

function StatPill({ label, value, color = "#1d1d1f" }: { label: string; value: number; color?: string }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 11, color: "#7a7a7a" }}>{label}</span>
        </div>
    );
}

function Avatar({ name }: { name: string }) {
    return (
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0066cc", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
    return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: bg, color, letterSpacing: "0.02em" }}>{label}</span>;
}

function Tag({ children }: { children: React.ReactNode }) {
    return <span style={{ fontSize: 11, color: "#7a7a7a", border: "0.5px solid #e0e0e0", borderRadius: 20, padding: "2px 8px" }}>{children}</span>;
}

function IconGrid()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function IconChart()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }
function IconReport()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
function IconUser()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function IconSettings(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
function IconLogout()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
