"use client";

import { useEffect, useRef, useState, KeyboardEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api } from "@/lib/api";

type CaseType = "decision" | "analysis" | "reflection";
type Difficulty = "easy" | "medium" | "hard";

type UploadMode = "file" | "paste";

interface UploadedFile {
    name: string;
    size: number;
    text: string;
    required: boolean;
}

const TYPE_OPTIONS: { value: CaseType; label: string; desc: string }[] = [
    { value: "decision", label: "Decision", desc: "Students recommend a course of action" },
    { value: "analysis", label: "Analysis", desc: "Students analyze a business situation" },
    { value: "reflection", label: "Reflection", desc: "Students reflect on lessons learned" },
];

const DIFF_OPTIONS: { value: Difficulty; label: string; desc: string }[] = [
    { value: "easy", label: "Beginner", desc: "Clear problem, limited ambiguity" },
    { value: "medium", label: "Intermediate", desc: "Multiple perspectives, some uncertainty" },
    { value: "hard", label: "Advanced", desc: "High ambiguity, competing trade-offs" },
];

const GOAL_SUGGESTIONS = ["Market Entry", "Valuation", "Capital Structure"];

function fmt(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a7a7a" strokeWidth="1.8" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    );
}

function OptionPill<T extends string>({
    value,
    label,
    desc,
    selected,
    onSelect,
}: {
    value: T;
    label: string;
    desc: string;
    selected: boolean;
    onSelect: (v: T) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onSelect(value)}
            style={{
                flex: 1,
                padding: "10px 14px 10px 16px",
                borderRadius: 10,
                border: `1.5px solid ${selected ? "#b91c1c" : "#e0e0e0"}`,
                background: selected ? "#fff5f5" : "#ffffff",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "SF Pro Text, system-ui",
                transition: "all 0.12s",
                position: "relative",
                overflow: "hidden",
                minHeight: 68,
            }}
        >
            {selected && (
                <span
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: "#b91c1c",
                    }}
                />
            )}
            <div style={{ fontSize: 12, fontWeight: 700, color: selected ? "#991b1b" : "#1d1d1f" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 3 }}>{desc}</div>
        </button>
    );
}

export default function NewCasePage() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [description, setDesc] = useState("");
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [pasteText, setPasteText] = useState("");
    const [caseType, setCaseType] = useState<CaseType>("decision");
    const [difficulty, setDiff] = useState<Difficulty>("medium");
    const [goals, setGoals] = useState<string[]>([]);
    const [goalInput, setGoalInput] = useState("");
    const [uploadMode, setUploadMode] = useState<UploadMode>("file");

    const [excelContent, setExcelContent] = useState("");
    const [excelSheets, setExcelSheets] = useState<string[]>([]);
    const [excelFileName, setExcelFileName] = useState("");
    const [parsingExcel, setParsingExcel] = useState(false);

    const [generating, setGenerating] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [dropHover, setDropHover] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);

    const user = getCurrentUser();
    if (user && user.role !== "professor") {
        router.push("/dashboard/student");
    }

    useEffect(() => {
        if (!descRef.current) return;
        descRef.current.style.height = "auto";
        descRef.current.style.height = `${Math.max(120, descRef.current.scrollHeight)}px`;
    }, [description]);

    const rawContent = [
        ...uploadedFiles.map((f) =>
            `=== ${f.required ? "Case Study" : `Supplementary Material: ${f.name}`} ===\n${f.text}`
        ),
        ...(pasteText.trim() ? [`=== Additional Notes ===\n${pasteText.trim()}`] : []),
        ...(excelContent.trim() ? [`=== Financial Data (Excel: ${excelFileName}) ===\n${excelContent.trim()}`] : []),
    ].join("\n\n");

    async function handleExcelFile(file: File) {
        if (!file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
            setError("Excel upload only supports .xlsx or .xls files.");
            return;
        }
        setParsingExcel(true);
        setError(null);
        try {
            const result = await api.professor.parseExcel(file);
            setExcelContent(result.text);
            setExcelSheets(result.sheets);
            setExcelFileName(file.name);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`Could not read Excel file: ${msg}. Make sure the backend is running and openpyxl is installed.`);
        } finally {
            setParsingExcel(false);
        }
    }

    async function handleFiles(files: FileList | File[]) {
        const arr = Array.from(files);
        const valid = arr.filter((f) => /\.(txt|md|pdf)$/i.test(f.name));
        const invalid = arr.filter((f) => !/\.(txt|md|pdf)$/i.test(f.name));
        if (invalid.length) {
            setError(`Unsupported file type: ${invalid.map((f) => f.name).join(", ")}. Use .txt, .md, or .pdf.`);
        }
        if (!valid.length) return;

        setParsing(true);
        setError(null);
        try {
            const parsed = await Promise.all(
                valid.map(async (f) => {
                    const { text } = await api.professor.parseFile(f);
                    return { name: f.name, size: f.size, text };
                })
            );
            setUploadedFiles((prev) => {
                const existing = new Set(prev.map((f) => f.name));
                const newFiles = parsed
                    .filter((f) => !existing.has(f.name))
                    .map((f, i) => ({ ...f, required: prev.length === 0 && i === 0 }));
                return [...prev, ...newFiles];
            });
            setUploadMode("file");
            if (!title && parsed[0]) {
                setTitle(parsed[0].name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
            }
        } catch {
            setError("Could not read one or more files. For PDFs, make sure they contain selectable text.");
        } finally {
            setParsing(false);
        }
    }

    function removeFile(name: string) {
        setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
    }

    function toggleRequired(name: string) {
        setUploadedFiles((prev) => prev.map((f) => (f.name === name ? { ...f, required: !f.required } : f)));
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragOver(false);
        setDropHover(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    }

    function addGoal() {
        const trimmed = goalInput.trim();
        if (trimmed && !goals.includes(trimmed)) setGoals((p) => [...p, trimmed]);
        setGoalInput("");
    }

    function addSuggestedGoal(goal: string) {
        if (!goals.includes(goal)) setGoals((p) => [...p, goal]);
    }

    function handleGoalKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addGoal();
        }
        if (e.key === "Backspace" && !goalInput && goals.length > 0) {
            setGoals((p) => p.slice(0, -1));
        }
    }

    const contentReady = uploadedFiles.length > 0 || pasteText.trim().length >= 50;
    const canGenerate = title.trim().length >= 3 && contentReady;

    const missing: string[] = [];
    if (title.trim().length < 3) missing.push("Title (min 3 chars)");
    if (!contentReady) missing.push("Upload course material or add paste text (min 50 chars)");
    const tooltipText = missing.length ? `Missing: ${missing.join("; ")}` : "Ready to generate";

    async function handleGenerate() {
        if (!canGenerate || generating) return;
        setGenerating(true);
        setError(null);
        try {
            const result = await api.professor.createCase({
                title: title.trim(),
                description: description.trim(),
                raw_content: rawContent.trim(),
                case_type: caseType,
                difficulty,
                teaching_goals: goals,
            });
            router.push(`/professor/cases/${result.case.id}/review`);
        } catch {
            setError("Failed to generate playbook. Make sure the backend is running and the LLM is configured.");
            setGenerating(false);
        }
    }

    return (
        <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "SF Pro Text, system-ui" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 40,
                    height: 62,
                    background: "linear-gradient(120deg, #2f0a0a 0%, #7f1d1d 45%, #b91c1c 75%, #dc2626 100%)",
                    borderBottom: "1px solid #7f1d1d",
                    boxShadow: "0 8px 20px #7f1d1d33",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 28px",
                    gap: 16,
                }}
            >
                <button
                    onClick={() => router.push("/dashboard/professor")}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: "1px solid #fca5a5",
                        background: "transparent",
                        color: "#fee2e2",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "SF Pro Text, system-ui",
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back to Dashboard
                </button>
                <span
                    style={{
                        fontFamily: "SF Pro Display, system-ui",
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#f8fafc",
                        letterSpacing: "-0.14px",
                        flex: 1,
                    }}
                >
                    Create New Simulation
                </span>
            </div>

            <div
                style={{
                    maxWidth: 1360,
                    margin: "0 auto",
                    padding: "24px 24px 72px",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 60%) minmax(360px, 40%)",
                    gap: 22,
                    alignItems: "start",
                }}
            >
                <section>
                    {error && (
                        <div
                            style={{
                                background: "#fff5f5",
                                border: "1px solid #fecaca",
                                borderRadius: 10,
                                padding: "12px 16px",
                                fontSize: 13,
                                color: "#991b1b",
                                marginBottom: 16,
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {generating && (
                        <div
                            style={{
                                background: "#fff1f2",
                                border: "1px solid #fecdd3",
                                borderRadius: 10,
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#9f1239",
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
                                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" />
                                <path d="M21 12a9 9 0 00-9-9" />
                            </svg>
                            AI is reading the case and generating 5 stakeholder agents + questions. This takes 15–30 seconds…
                        </div>
                    )}

                    <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 999, padding: "3px 9px" }}>1 Case Details</span>
                            <span style={{ color: "#b0b0b0", fontSize: 11 }}>→</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 999, padding: "3px 9px" }}>2 Classification</span>
                            <span style={{ color: "#b0b0b0", fontSize: 11 }}>→</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 999, padding: "3px 9px" }}>3 Goals</span>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 6 }}>Title</div>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Lime Scooters: Entering the Singapore Market"
                                style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    border: "1px solid #d0d0d8",
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 13,
                                    color: "#1d1d1f",
                                    fontFamily: "SF Pro Text, system-ui",
                                    outline: "none",
                                }}
                                onFocus={(e) => (e.target.style.borderColor = "#b91c1c")}
                                onBlur={(e) => (e.target.style.borderColor = "#d0d0d8")}
                            />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f" }}>
                                    Description <span style={{ fontWeight: 400, color: "#7a7a7a" }}>(optional)</span>
                                </div>
                                <div style={{ fontSize: 11, color: description.length > 500 ? "#b91c1c" : "#7a7a7a" }}>
                                    {description.length} / 500
                                </div>
                            </div>
                            <textarea
                                ref={descRef}
                                value={description}
                                maxLength={500}
                                onChange={(e) => setDesc(e.target.value)}
                                placeholder="A brief summary of the business situation…"
                                rows={6}
                                style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    border: "1px solid #d0d0d8",
                                    borderRadius: 8,
                                    padding: "10px 12px",
                                    fontSize: 13,
                                    color: "#1d1d1f",
                                    fontFamily: "SF Pro Text, system-ui",
                                    resize: "none",
                                    outline: "none",
                                    lineHeight: 1.55,
                                    minHeight: 120,
                                }}
                                onFocus={(e) => (e.target.style.borderColor = "#b91c1c")}
                                onBlur={(e) => (e.target.style.borderColor = "#d0d0d8")}
                            />
                        </div>

                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
                        </div>

                        {/* --- Teaching Goals section moved up --- */}
                        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 22px", margin: "24px 0" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 7 }}>Teaching Goals</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                                {GOAL_SUGGESTIONS.map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => addSuggestedGoal(g)}
                                        style={{
                                            border: "1px solid #fecaca",
                                            background: "#fff5f5",
                                            color: "#991b1b",
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            padding: "3px 10px",
                                            cursor: "pointer",
                                            fontFamily: "SF Pro Text, system-ui",
                                        }}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 6,
                                    padding: "8px 10px",
                                    border: "1px solid #d0d0d8",
                                    borderRadius: 8,
                                    minHeight: 44,
                                    alignItems: "center",
                                    cursor: "text",
                                }}
                                onClick={() => document.getElementById("goal-input")?.focus()}
                            >
                                {goals.map((g) => (
                                    <span key={g} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#fff1f2", color: "#9f1239", border: "1px solid #fecdd3" }}>
                                        {g}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setGoals((p) => p.filter((x) => x !== g));
                                            }}
                                            style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                                <input
                                    id="goal-input"
                                    value={goalInput}
                                    onChange={(e) => setGoalInput(e.target.value)}
                                    onKeyDown={handleGoalKey}
                                    onBlur={addGoal}
                                    placeholder={goals.length === 0 ? "e.g. Market Entry Strategy, Unit Economics" : ""}
                                    style={{ flex: 1, minWidth: 140, border: "none", outline: "none", fontSize: 12, fontFamily: "SF Pro Text, system-ui", color: "#1d1d1f", background: "transparent" }}
                                />
                            </div>
                        </div>

                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginTop: 24 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Classification</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 8 }}>Case Type</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {TYPE_OPTIONS.map((o) => (
                                            <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={caseType === o.value} onSelect={setCaseType} />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 8 }}>Difficulty</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {DIFF_OPTIONS.map((o) => (
                                            <OptionPill key={o.value} value={o.value} label={o.label} desc={o.desc} selected={difficulty === o.value} onSelect={setDiff} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Duplicate Teaching Goals section removed */}
                </section>

                <aside style={{ position: "sticky", top: 66, height: "calc(100vh - 80px)", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "16px", overflowY: "auto" }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 12, background: "#f8fafc", borderRadius: 8, padding: 4 }}>
                            <button
                                type="button"
                                onClick={() => setUploadMode("file")}
                                style={{
                                    flex: 1,
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "7px 8px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    fontFamily: "SF Pro Text, system-ui",
                                    background: uploadMode === "file" ? "#fff5f5" : "transparent",
                                    color: uploadMode === "file" ? "#991b1b" : "#64748b",
                                }}
                            >
                                Upload File
                            </button>
                            <button
                                type="button"
                                onClick={() => setUploadMode("paste")}
                                style={{
                                    flex: 1,
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "7px 8px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    fontFamily: "SF Pro Text, system-ui",
                                    background: uploadMode === "paste" ? "#fff5f5" : "transparent",
                                    color: uploadMode === "paste" ? "#991b1b" : "#64748b",
                                }}
                            >
                                Paste Text
                            </button>
                        </div>

                        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                            Course Materials
                        </div>
                        <div style={{ fontSize: 11, color: "#7a7a7a", marginBottom: 12 }}>
                            Main source for AI role generation. Supports PDF, TXT, MD.
                        </div>

                        {uploadMode === "file" ? (
                            <>
                                <div
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setDragOver(true);
                                    }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    onMouseEnter={() => setDropHover(true)}
                                    onMouseLeave={() => setDropHover(false)}
                                    style={{
                                        border: `2px dashed ${dragOver ? "#b91c1c" : "#fca5a5"}`,
                                        borderRadius: 12,
                                        padding: "34px 16px",
                                        marginBottom: uploadedFiles.length > 0 ? 12 : 0,
                                        textAlign: "center",
                                        cursor: "pointer",
                                        background: dragOver || dropHover ? "#fff5f5" : "#fafafa",
                                        transition: "all 0.15s",
                                    }}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".txt,.md,.pdf"
                                        multiple
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                            if (e.target.files?.length) handleFiles(e.target.files);
                                            e.target.value = "";
                                        }}
                                    />
                                    {parsing ? (
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}>
                                                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" />
                                                <path d="M21 12a9 9 0 00-9-9" />
                                            </svg>
                                            <span style={{ fontSize: 13, color: "#991b1b" }}>Extracting text from file…</span>
                                        </div>
                                    ) : (
                                        <>
                                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="1.9" strokeLinecap="round" style={{ marginBottom: 9 }}>
                                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                                <polyline points="17 8 12 3 7 8" />
                                                <line x1="12" y1="3" x2="12" y2="15" />
                                            </svg>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#3d3d3f", marginBottom: 3 }}>
                                                Drag & drop files here, or <span style={{ color: "#b91c1c" }}>click to browse</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: "#a0a0a8" }}>Supports PDF, TXT, MD</div>
                                        </>
                                    )}
                                </div>

                                {uploadedFiles.length > 0 && (
                                    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                                        {uploadedFiles.map((f, i) => (
                                            <div key={f.name} style={{ display: "flex", alignItems: "center", padding: "10px 12px", gap: 10, background: "#fff", borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
                                                <FileIcon />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                                    <div style={{ fontSize: 10, color: "#a0a0a8", marginTop: 1 }}>{fmt(f.size)}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRequired(f.name)}
                                                    title="Click to toggle Required / Optional"
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        borderRadius: 20,
                                                        padding: "2px 8px",
                                                        flexShrink: 0,
                                                        cursor: "pointer",
                                                        border: f.required ? "1px solid #fca5a5" : "1px solid #cbd5e1",
                                                        background: f.required ? "#fff1f2" : "#f8fafc",
                                                        color: f.required ? "#9f1239" : "#475569",
                                                    }}
                                                >
                                                    {f.required ? "Required ✓" : "Optional"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(f.name)}
                                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#a0a0a8", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                                                    title="Remove file"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ marginBottom: 12 }}>
                                <textarea
                                    value={pasteText}
                                    onChange={(e) => setPasteText(e.target.value)}
                                    placeholder="Paste the full case content here…"
                                    rows={14}
                                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0d0d8", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1d1d1f", fontFamily: "SF Pro Text, system-ui", lineHeight: 1.55, resize: "vertical", outline: "none", background: "#fafafa" }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = "#b91c1c";
                                        e.target.style.background = "#fff";
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = "#d0d0d8";
                                        e.target.style.background = "#fafafa";
                                    }}
                                />
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                                    <span style={{ fontSize: 11, color: "#7a7a7a" }}>{pasteText.trim().split(/\s+/).filter(Boolean).length} words</span>
                                    <span style={{ fontSize: 11, color: pasteText.trim().length >= 50 ? "#16a34a" : "#7a7a7a" }}>
                                        {pasteText.trim().length >= 50 ? "Ready to generate ✓" : "Need at least 50 chars"}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12, marginTop: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase" }}>Financial Data</div>
                                <span style={{ fontSize: 10, fontWeight: 700, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", borderRadius: 999, padding: "2px 8px" }}>Optional</span>
                            </div>

                            <input
                                ref={excelInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                    if (e.target.files?.[0]) handleExcelFile(e.target.files[0]);
                                    e.target.value = "";
                                }}
                            />

                            <div
                                onClick={() => !parsingExcel && excelInputRef.current?.click()}
                                style={{
                                    border: `2px dashed ${parsingExcel ? "#b91c1c" : "#fca5a5"}`,
                                    borderRadius: 12,
                                    padding: "34px 16px",
                                    marginBottom: excelContent ? 12 : 0,
                                    textAlign: "center",
                                    cursor: parsingExcel ? "not-allowed" : "pointer",
                                    background: parsingExcel ? "#fff5f5" : "#fafafa",
                                    transition: "all 0.15s",
                                    position: "relative",
                                }}
                            >
                                {excelContent ? (
                                    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
                                        <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", gap: 10, background: "#fff" }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d8a4f" strokeWidth="1.8" strokeLinecap="round">
                                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="8" y1="13" x2="16" y2="13" />
                                                <line x1="8" y1="17" x2="16" y2="17" />
                                            </svg>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{excelFileName}</div>
                                                <div style={{ fontSize: 10, color: "#a0a0a8", marginTop: 1 }}>{excelSheets.length} sheet{excelSheets.length !== 1 ? "s" : ""}</div>
                                            </div>
                                            <button type="button" onClick={() => excelInputRef.current?.click()} style={{ fontSize: 11, color: "#991b1b", background: "none", border: "none", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}>
                                                Replace
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExcelContent("");
                                                    setExcelSheets([]);
                                                    setExcelFileName("");
                                                }}
                                                style={{ background: "none", border: "none", cursor: "pointer", color: "#a0a0a8", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ) : parsingExcel ? (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}>
                                            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" />
                                            <path d="M21 12a9 9 0 00-9-9" />
                                        </svg>
                                        <span style={{ fontSize: 13, color: "#991b1b" }}>Reading Excel…</span>
                                    </div>
                                ) : (
                                    <>
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="1.9" strokeLinecap="round" style={{ marginBottom: 9 }}>
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#3d3d3f", marginBottom: 3 }}>
                                            Drag & drop Excel here, or <span style={{ color: "#b91c1c" }}>click to browse</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: "#a0a0a8" }}>Supports .xlsx, .xls</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: "auto", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 12, padding: 12 }} title={tooltipText}>
                        <button
                            onClick={handleGenerate}
                            disabled={!canGenerate || generating}
                            title={tooltipText}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                padding: "13px 16px",
                                borderRadius: 10,
                                border: "none",
                                background: !canGenerate || generating ? "#d4d4d8" : "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 55%, #dc2626 100%)",
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: !canGenerate || generating ? "not-allowed" : "pointer",
                                fontFamily: "SF Pro Text, system-ui",
                                letterSpacing: "-0.1px",
                            }}
                        >
                            {generating ? "Generating Playbook…" : "Generate Playbook with AI →"}
                        </button>
                        {!canGenerate && <div style={{ marginTop: 8, fontSize: 11, color: "#71717a", lineHeight: 1.4 }}>{tooltipText}</div>}
                    </div>
                </aside>
            </div>
        </div>
    );
}
