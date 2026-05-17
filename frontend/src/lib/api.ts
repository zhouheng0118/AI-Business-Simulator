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

async function patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
    const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
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
    industry?: string; // Added industry field
}

export interface ApiPlaybookRole {
    name: string;
    title: string;
    role_type?: string;
    persona?: string;
    focus_area: string;
    allowed_info?: string[];
    locked_info?: string[];
    opening_statement?: string;
    opening_role_description?: string;
    opening_topics?: string[];
    opening_suggested_question?: string;
}

export interface ApiInfoAtom {
    fact: string;
    owner_roles: string[];
    access: "allowed" | "locked";
    unlock_condition: string;
    level: 0 | 1 | 2 | 3;
    category: string;
    objective_index: number;
}

export interface ApiChecklistItem {
    objective_index: number;
    task: string;
    completion_condition: string;
}

export interface ApiPlaybook {
    id: string;
    case_id: string;
    version: number;
    roles: ApiPlaybookRole[];
    questions: ApiQuestion[];
    info_atoms: ApiInfoAtom[];
    checklist_items: ApiChecklistItem[];
    review_status: string;
}

export interface ApiCaseDetail {
    case: ApiCase;
    playbook: ApiPlaybook | null;
}

export interface MissionState {
    current_mission: number;
    phase: "briefing" | "investigating" | "evaluating" | "complete";
    active_agents: string[];
    missions_completed: number[];
    mission_reports: Record<string, string>;
}

export const DEFAULT_MISSION_STATE: MissionState = {
    current_mission: 0,
    phase: "briefing",
    active_agents: ["CEO"],
    missions_completed: [],
    mission_reports: {},
};

export interface ApiSession {
    id: string;
    case_id: string;
    status: "in_progress" | "answering" | "submitted" | "scored";
    interviewed_roles: string[];
    started_at: string;
    submitted_at: string | null;
    mission_state?: MissionState;
}

export interface ApiMessage {
    id: string;
    session_id: string;
    role: "student" | "agent" | "assistant";
    agent_name: string | null;
    content: string;
    created_at: string;
}

export interface ApiEvidence {
    source: string;
    key_info: string;
    data: string;
    risk: string;
    visible?: boolean;
}

export interface ApiSendMessageResponse {
    reply: string;
    new_evidence: ApiEvidence[];
    agent_name: string;
    info_sufficient: boolean;
    roles_visited: string[];
    newly_unlocked: boolean;
    newly_checked_items: number[];
    checklist_completed: number[];
    mission_state?: MissionState;
}

export interface ApiAssignment {
    case_id: string;
    due_at: string | null;
}

export interface ApiQuestion {
    id: string;
    type: "decision" | "analysis" | "reflection";
    text: string;
    rubric_dimensions: { name: string; weight: number }[];
}

export interface ApiSubmitAnswer {
    question_id: string;
    answer: string;
    cited_evidence?: ApiEvidence[];
}

export interface ApiDimensionScore {
    name: string;
    score: number;
    max_score: number;
    comment: string;
}

export interface ApiQuestionScore {
    question_id: string;
    question_type: string;
    dimension_scores: ApiDimensionScore[];
    question_total: number;
    question_max: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
}

export interface ApiReport {
    id: string;
    session_id: string;
    scores: ApiQuestionScore[];
    total_score: number;
    total_max: number;
    interview_path: {
        roles_visited: string[];
        roles_missed: string[];
        key_info_captured: string[];
        key_info_missed: string[];
    };
    blind_spots: { type: string; description: string }[];
    overall_comment: string;
    generated_at: string;
}

export interface ApiCaseStats {
    sessions_total: number;
    sessions_submitted: number;
    avg_score: number | null;
}

export interface ApiCreateCasePayload {
    title: string;
    description: string;
    raw_content: string;
    case_type: "decision" | "analysis" | "reflection";
    difficulty: "easy" | "medium" | "hard";
    teaching_goals: string[];
}

export interface ApiCreateCaseResponse {
    case: ApiCase;
    playbook: ApiPlaybook;
}

export interface ApiApproveResponse {
    status: string;
    case_status: string;
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
        update: (caseId: string, payload: Partial<ApiCreateCasePayload>) =>
            patch<ApiCase>(`/cases/${caseId}`, payload),
        delete: (caseId: string) =>
            del(`/cases/${caseId}`),
    },
    sessions: {
        byStudent: (studentId: string) =>
            get<ApiSession[]>(`/sessions/by-student/${studentId}`),
        create: (caseId: string, studentId: string) =>
            post<ApiSession>("/sessions", { case_id: caseId, student_id: studentId }),
        get: (sessionId: string) =>
            get<ApiSession>(`/sessions/${sessionId}`),
        getMessages: (sessionId: string) =>
            get<ApiMessage[]>(`/sessions/${sessionId}/messages`),
        getEvidence: (sessionId: string) =>
            get<{ evidence_board: ApiEvidence[]; checklist_items: ApiChecklistItem[]; checklist_completed: number[] }>(`/sessions/${sessionId}/evidence`),
        sendMessage: (sessionId: string, roleName: string, message: string) =>
            post<ApiSendMessageResponse>(`/sessions/${sessionId}/messages`, { role_name: roleName, message }),
        proceed: (sessionId: string) =>
            post<{ status: string }>(`/sessions/${sessionId}/proceed`, {}),
        submit: (sessionId: string, answers: ApiSubmitAnswer[]) =>
            post<ApiReport>(`/sessions/${sessionId}/submit`, { answers }),
        getReport: (sessionId: string) =>
            get<ApiReport>(`/sessions/${sessionId}/report`),
    },
    assignments: {
        byStudent: (studentId: string) =>
            get<ApiAssignment[]>(`/assignments/by-student/${studentId}`),
    },
    professor: {
        parseFile: async (file: File): Promise<{ text: string; file_type: string }> => {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${BASE}/cases/parse-file`, { method: "POST", body: form });
            if (!res.ok) throw new Error(`API ${res.status}: /cases/parse-file`);
            return res.json();
        },
        parseExcel: async (file: File): Promise<{ text: string; sheets: string[] }> => {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`${BASE}/cases/parse-excel`, { method: "POST", body: form });
            if (!res.ok) throw new Error(`API ${res.status}: /cases/parse-excel`);
            return res.json();
        },
        createCase: (payload: ApiCreateCasePayload) =>
            post<ApiCreateCaseResponse>("/cases", payload),
        getPendingPlaybook: (caseId: string) =>
            get<ApiCreateCaseResponse>(`/cases/${caseId}/playbook/pending`),
        approvePlaybook: (caseId: string, playbookId: string) =>
            post<ApiApproveResponse>(`/cases/${caseId}/playbook/${playbookId}/approve`, { publish: true }),
        rejectPlaybook: (caseId: string, playbookId: string, notes: string) =>
            post<{ status: string }>(`/cases/${caseId}/playbook/${playbookId}/reject`, { notes }),
        updateInfoAtoms: (caseId: string, playbookId: string, infoAtoms: ApiInfoAtom[]) =>
            patch<{ status: string; count: number }>(
                `/cases/${caseId}/playbook/${playbookId}/info-atoms`,
                { info_atoms: infoAtoms },
            ),
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
