"use client";

import { useState, KeyboardEvent, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { api } from "@/lib/api";

type CaseType = "decision" | "analysis" | "reflection";
type Difficulty = "easy" | "medium" | "hard";

interface UploadedFile { name: string; size: number; text: string; required: boolean }

const TYPE_OPTIONS: { value: CaseType; label: string; desc: string }[] = [
    { value: "decision",   label: "Decision",   desc: "Students recommend a course of action" },
    { value: "analysis",   label: "Analysis",   desc: "Students analyze a business situation" },
    { value: "reflection", label: "Reflection", desc: "Students reflect on lessons learned" },
];

const DIFF_OPTIONS: { value: Difficulty; label: string; desc: string }[] = [
    { value: "easy",   label: "Beginner",     desc: "Clear problem, limited ambiguity" },
    { value: "medium", label: "Intermediate", desc: "Multiple perspectives, some uncertainty" },
    { value: "hard",   label: "Advanced",     desc: "High ambiguity, competing trade-offs" },
];

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
    value, label, desc, selected, onSelect,
}: { value: T; label: string; desc: string; selected: boolean; onSelect: (v: T) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${selected ? "#0066cc" : "#e0e0e0"}`, background: selected ? "#eef4ff" : "#ffffff", cursor: "pointer", textAlign: "left", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s" }}
        >
            <div style={{ fontSize: 12, fontWeight: 600, color: selected ? "#0066cc" : "#1d1d1f" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>{desc}</div>
        </button>
    );
}

export default function NewCasePage() {
    const router = useRouter();

    const [title, setTitle]         = useState("");
    const [description, setDesc]    = useState("");
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [pasteText, setPasteText]   = useState("");
    const [caseType, setCaseType]     = useState<CaseType>("decision");
    const [difficulty, setDiff]       = useState<Difficulty>("medium");
    const [goals, setGoals]           = useState<string[]>([]);
    const [goalInput, setGoalInput]   = useState("");
    const [showPaste, setShowPaste]   = useState(false);

    const [excelContent, setExcelContent]   = useState("");
    const [excelSheets, setExcelSheets]     = useState<string[]>([]);
    const [excelFileName, setExcelFileName] = useState("");
    const [parsingExcel, setParsingExcel]   = useState(false);

    const [generating, setGenerating] = useState(false);
    const [parsing, setParsing]       = useState(false);
    const [dragOver, setDragOver]     = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const fileInputRef      = useRef<HTMLInputElement>(null);
    const excelInputRef     = useRef<HTMLInputElement>(null);

    const user = getCurrentUser();
    if (user && user.role !== "professor") { router.push("/dashboard/student"); }

    // Derive rawContent: all file texts + paste text + optional Excel financial data
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
        if (invalid.length) setError(`Unsupported file type: ${invalid.map((f) => f.name).join(", ")}. Use .txt, .md, or .pdf.`);
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
            setShowPaste(false);
            if (!title && parsed[0]) setTitle(parsed[0].name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
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
        setUploadedFiles((prev) => prev.map((f) => f.name === name ? { ...f, required: !f.required } : f));
    }

    function handleDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    }

    function addGoal() {
        const trimmed = goalInput.trim();
        if (trimmed && !goals.includes(trimmed)) setGoals((p) => [...p, trimmed]);
        setGoalInput("");
    }

    function handleGoalKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") { e.preventDefault(); addGoal(); }
        if (e.key === "Backspace" && !goalInput && goals.length > 0) setGoals((p) => p.slice(0, -1));
    }

    const contentReady = uploadedFiles.length > 0 || pasteText.trim().length >= 50;
    const canGenerate  = title.trim().length >= 3 && contentReady;

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

            {/* TopBar */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, height: 52, background: "#ffffff", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", padding: "0 28px", gap: 16 }}>
                <button
                    onClick={() => router.push("/dashboard/professor")}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", color: "#1d1d1f", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Dashboard
                </button>
                <span style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", flex: 1 }}>
                    Create New Simulation
                </span>
                <button
                    onClick={handleGenerate}
                    disabled={!canGenerate || generating}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 18px", borderRadius: 8, border: "none", background: !canGenerate || generating ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: !canGenerate || generating ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", transition: "background 0.12s" }}
                >
                    {generating
                        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" /><path d="M21 12a9 9 0 00-9-9" /></svg>Generating…</>
                        : "Generate Playbook →"}
                </button>
            </div>

            <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px 60px" }}>

                {error && (
                    <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#991b1b", marginBottom: 20 }}>
                        {error}
                    </div>
                )}
                {generating && (
                    <div style={{ background: "#eef4ff", border: "1px solid #bdd3ff", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#0044a8", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" /><path d="M21 12a9 9 0 00-9-9" /></svg>
                        AI is reading the case and generating 5 stakeholder agents + questions. This takes 15–30 seconds…
                    </div>
                )}

                <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>Case Details</div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 6 }}>Title</div>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Lime Scooters: Entering the Singapore Market"
                            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0d0d8", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1d1d1f", fontFamily: "SF Pro Text, system-ui", outline: "none" }}
                            onFocus={(e) => (e.target.style.borderColor = "#0066cc")}
                            onBlur={(e) => (e.target.style.borderColor = "#d0d0d8")}
                        />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 2 }}>Description <span style={{ fontWeight: 400, color: "#7a7a7a" }}>(optional)</span></div>
                        <div style={{ fontSize: 11, color: "#7a7a7a", marginBottom: 6 }}>Shown to students on the case overview page</div>
                        <textarea
                            value={description}
                            onChange={(e) => setDesc(e.target.value)}
                            placeholder="A brief summary of the business situation…"
                            rows={3}
                            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0d0d8", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1d1d1f", fontFamily: "SF Pro Text, system-ui", resize: "vertical", outline: "none" }}
                            onFocus={(e) => (e.target.style.borderColor = "#0066cc")}
                            onBlur={(e) => (e.target.style.borderColor = "#d0d0d8")}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 8 }}>Case Type</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {TYPE_OPTIONS.map((o) => <OptionPill key={o.value} {...o} selected={caseType === o.value} onSelect={setCaseType} />)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1d1d1f", marginBottom: 8 }}>Difficulty</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {DIFF_OPTIONS.map((o) => <OptionPill key={o.value} {...o} selected={difficulty === o.value} onSelect={setDiff} />)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Teaching Goals */}
                <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Teaching Goals</div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginBottom: 10 }}>Type a goal and press Enter to add it as a tag.</div>
                    <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", border: "1px solid #d0d0d8", borderRadius: 8, minHeight: 44, alignItems: "center", cursor: "text" }}
                        onClick={() => document.getElementById("goal-input")?.focus()}
                    >
                        {goals.map((g) => (
                            <span key={g} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#eef4ff", color: "#0044a8", border: "1px solid #bdd3ff" }}>
                                {g}
                                <button type="button" onClick={(e) => { e.stopPropagation(); setGoals((p) => p.filter((x) => x !== g)); }}
                                    style={{ background: "none", border: "none", color: "#7a9acc", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
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

                {/* Upload Course Materials */}
                <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Upload Course Materials</div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginBottom: 14 }}>
                        Upload the case file. The AI reads this to generate stakeholder personas and questions. Supports PDF, TXT, MD.
                    </div>

                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{ border: `1.5px dashed ${dragOver ? "#0066cc" : "#d0d0d8"}`, borderRadius: 10, padding: "28px 16px", marginBottom: uploadedFiles.length > 0 || showPaste ? 12 : 0, textAlign: "center", cursor: "pointer", background: dragOver ? "#eef4ff" : "#fafafa", transition: "all 0.15s" }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".txt,.md,.pdf"
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
                        />
                        {parsing ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" /><path d="M21 12a9 9 0 00-9-9" /></svg>
                                <span style={{ fontSize: 13, color: "#0066cc" }}>Extracting text from file…</span>
                            </div>
                        ) : (
                            <>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a0a0a8" strokeWidth="1.6" strokeLinecap="round" style={{ marginBottom: 8 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                <div style={{ fontSize: 13, fontWeight: 500, color: "#3d3d3f", marginBottom: 3 }}>
                                    Drag & drop files here, or <span style={{ color: "#0066cc" }}>click to browse</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#a0a0a8" }}>Supports PDF, TXT, MD</div>
                            </>
                        )}
                    </div>

                    {/* Uploaded file list */}
                    {uploadedFiles.length > 0 && (
                        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
                            {uploadedFiles.map((f, i) => (
                                <div key={f.name} style={{ display: "flex", alignItems: "center", padding: "11px 16px", gap: 12, background: "#ffffff", borderTop: i > 0 ? "1px solid #f0f0f0" : "none" }}>
                                    <FileIcon />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                        <div style={{ fontSize: 11, color: "#a0a0a8", marginTop: 1 }}>{fmt(f.size)}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toggleRequired(f.name)}
                                        title="Click to toggle Required / Optional"
                                        style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "2px 10px", flexShrink: 0, cursor: "pointer", border: f.required ? "1px solid #b9efd4" : "1px solid #bdd3ff", background: f.required ? "#edfaf3" : "#eef4ff", color: f.required ? "#1d8a4f" : "#0044a8" }}
                                    >
                                        {f.required ? "Required ✓" : "Optional"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeFile(f.name)}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "#a0a0a8", fontSize: 18, lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}
                                        title="Remove file"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* "or paste text" toggle */}
                    {uploadedFiles.length === 0 && (
                        <div style={{ marginTop: 12 }}>
                            <button
                                type="button"
                                onClick={() => setShowPaste((p) => !p)}
                                style={{ background: "none", border: "none", fontSize: 12, color: "#0066cc", cursor: "pointer", fontFamily: "SF Pro Text, system-ui", padding: 0 }}
                            >
                                {showPaste ? "▾ Hide text paste" : "▸ Or paste case text directly"}
                            </button>

                            {showPaste && (
                                <div style={{ marginTop: 10 }}>
                                    <textarea
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        placeholder="Paste the full case content here…"
                                        rows={16}
                                        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0d0d8", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1d1d1f", fontFamily: "SF Pro Text, system-ui", lineHeight: 1.6, resize: "vertical", outline: "none", background: "#fafafa" }}
                                        onFocus={(e) => { e.target.style.borderColor = "#0066cc"; e.target.style.background = "#fff"; }}
                                        onBlur={(e) => { e.target.style.borderColor = "#d0d0d8"; e.target.style.background = "#fafafa"; }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                                        <span style={{ fontSize: 11, color: "#7a7a7a" }}>
                                            {pasteText.trim().split(/\s+/).filter(Boolean).length} words
                                        </span>
                                        <span style={{ fontSize: 11, color: pasteText.trim().length >= 50 ? "#34c759" : "#7a7a7a" }}>
                                            {pasteText.trim().length >= 50 ? "Ready to generate ✓" : "Need more content to enable generation"}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Optional Excel Upload */}
                <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                        Financial Data
                        <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 8, fontSize: 11, color: "#a0a0a8" }}>Optional</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginBottom: 14 }}>
                        Upload an Excel file with financial tables (income statement, balance sheet, etc.). The AI will use this data to enrich the CFO and other agent responses.
                    </div>

                    <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        style={{ display: "none" }}
                        onChange={(e) => { if (e.target.files?.[0]) handleExcelFile(e.target.files[0]); e.target.value = ""; }}
                    />

                    {excelContent ? (
                        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", gap: 12, background: "#ffffff" }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d8a4f" strokeWidth="1.8" strokeLinecap="round">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
                                </svg>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{excelFileName}</div>
                                    <div style={{ fontSize: 11, color: "#a0a0a8", marginTop: 1 }}>{excelSheets.length} sheet{excelSheets.length !== 1 ? "s" : ""}: {excelSheets.join(", ")}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => excelInputRef.current?.click()}
                                    style={{ fontSize: 11, color: "#0066cc", background: "none", border: "none", cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                                >
                                    Replace
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setExcelContent(""); setExcelSheets([]); setExcelFileName(""); }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#a0a0a8", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
                                >×</button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => excelInputRef.current?.click()}
                            disabled={parsingExcel}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 8, border: "1px dashed #d0d0d8", background: "#fafafa", color: parsingExcel ? "#a0a0a8" : "#3d3d3f", fontSize: 12, fontWeight: 500, cursor: parsingExcel ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", transition: "all 0.12s" }}
                        >
                            {parsingExcel ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.9s linear infinite" }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3" /><path d="M21 12a9 9 0 00-9-9" /></svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                            )}
                            {parsingExcel ? "Reading Excel…" : "Upload Excel file (.xlsx / .xls)"}
                        </button>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        onClick={handleGenerate}
                        disabled={!canGenerate || generating}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 28px", borderRadius: 10, border: "none", background: !canGenerate || generating ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 14, fontWeight: 600, cursor: !canGenerate || generating ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui", letterSpacing: "-0.1px" }}
                    >
                        {generating ? "Generating Playbook…" : "Generate Playbook with AI →"}
                    </button>
                </div>
            </div>
        </div>
    );
}
