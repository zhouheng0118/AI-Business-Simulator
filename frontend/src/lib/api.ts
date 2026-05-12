const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

// Shapes returned by the backend

export interface ApiCase {
    id: string;
    title: string;
    description: string | null;
    case_type: "decision" | "analysis" | "reflection";
    difficulty: "easy" | "medium" | "hard";
    status: "draft" | "published";
    teaching_goals: string[];
    created_at: string;
}

export interface ApiPlaybookRole {
    name: string;
    title: string;
    persona?: string;
    focus_area: string;
    allowed_info?: string[];
    locked_info?: string[];
}

export interface ApiPlaybook {
    id: string;
    case_id: string;
    version: number;
    roles: ApiPlaybookRole[];
    questions: unknown[];
    review_status: string;
}

export interface ApiCaseDetail {
    case: ApiCase;
    playbook: ApiPlaybook | null;
}

export interface ApiSession {
    id: string;
    case_id: string;
    status: "in_progress" | "answering" | "submitted" | "scored";
    interviewed_roles: string[];
    started_at: string;
    submitted_at: string | null;
}

export interface ApiAssignment {
    case_id: string;
    due_at: string | null;
}

export interface ApiCaseStats {
    sessions_total: number;
    sessions_submitted: number;
    avg_score: number | null;
}

// API calls

export const api = {
    cases: {
        list: (publishedOnly = true) =>
            get<ApiCase[]>(`/cases?published_only=${publishedOnly}`),
        get: (caseId: string) =>
            get<ApiCaseDetail>(`/cases/${caseId}`),
        stats: (caseId: string) =>
            get<ApiCaseStats>(`/cases/${caseId}/stats`),
    },
    sessions: {
        byStudent: (studentId: string) =>
            get<ApiSession[]>(`/sessions/by-student/${studentId}`),
        create: (caseId: string, studentId: string) =>
            post<ApiSession>("/sessions", { case_id: caseId, student_id: studentId }),
    },
    assignments: {
        byStudent: (studentId: string) =>
            get<ApiAssignment[]>(`/assignments/by-student/${studentId}`),
    },
};

// Helper: derive student progress from a session

export function sessionProgress(session: ApiSession): number {
    switch (session.status) {
        case "in_progress": return Math.min(20 + session.interviewed_roles.length * 12, 65);
        case "answering":   return 75;
        case "submitted":
        case "scored":      return 100;
    }
}

export function difficultyLabel(d: ApiCase["difficulty"]): string {
    return d === "easy" ? "Beginner" : d === "medium" ? "Intermediate" : "Advanced";
}

export function formatDue(isoDate: string | null): string {
    if (!isoDate) return "—";
    return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
