"use client";

import { useState } from "react";
import { ApiInfoAtom, ApiPlaybookRole } from "@/lib/api";

const LEVEL_BADGE: Record<1 | 2 | 3, { label: string; bg: string; color: string }> = {
    1: { label: "L1", bg: "#f0fdf4", color: "#166534" },
    2: { label: "L2", bg: "#fffbeb", color: "#92400e" },
    3: { label: "L3", bg: "#fef2f2", color: "#991b1b" },
};

const ROLE_DOT: Record<string, string> = {
    "CEO":                     "#0066cc",
    "CFO":                     "#1d8a4f",
    "Operations Director":     "#c05c00",
    "Customer Representative": "#6b21a8",
    "Local Expert":            "#0e7490",
};

const BASIC_CATEGORIES: { key: string; label: string; description: string }[] = [
    { key: "company_background", label: "Company Background",  description: "Who the company is, market, competitors" },
    { key: "decision_context",   label: "Decision Context",    description: "What decision is being made and why now" },
    { key: "role_statement",     label: "Role Statement",      description: "Stakeholder's official mandate in this case" },
    { key: "visible_tension",    label: "Visible Tension",     description: "Acknowledged conflict or risk, no root cause" },
    { key: "public_numbers",     label: "Public Numbers",      description: "Revenue, pricing, headcount, market size" },
];

function dot(name: string) {
    return ROLE_DOT[name] ?? "#7a7a7a";
}

interface EditState {
    index: number;
    atom: ApiInfoAtom;
    isNew: boolean;
}

interface Props {
    atoms: ApiInfoAtom[];
    roles: ApiPlaybookRole[];
    saving: boolean;
    onSave: (atoms: ApiInfoAtom[]) => Promise<void>;
}

export default function InfoLayersTab({ atoms, roles, saving, onSave }: Props) {
    const [items, setItems] = useState<ApiInfoAtom[]>(atoms);
    const [editing, setEditing] = useState<EditState | null>(null);
    const [dirty, setDirty] = useState(false);

    const roleNames = roles.map((r) => r.name);

    // Carry index through filtering to avoid fragile indexOf lookups
    const indexed = items.map((a, i) => ({ atom: a, idx: i }));
    const basicIndexed = indexed.filter((x) => x.atom.access === "allowed");
    const hiddenIndexed = indexed.filter((x) => x.atom.access === "locked");
    const hiddenUncategorized = hiddenIndexed.filter((x) => x.atom.level === 0);

    function openEdit(idx: number) {
        setEditing({ index: idx, atom: { ...items[idx] }, isNew: false });
    }

    function openAdd(access: "allowed" | "locked") {
        // Do NOT pre-append — append only on saveEdit to avoid phantom cards on cancel
        const newAtom: ApiInfoAtom = {
            fact: "",
            owner_roles: [],
            access,
            unlock_condition: "",
            level: access === "allowed" ? 0 : 1,
            category: "",
            objective_index: 0,
        };
        setEditing({ index: -1, atom: newAtom, isNew: true });
    }

    function saveEdit() {
        if (!editing) return;
        if (editing.isNew) {
            setItems((prev) => [...prev, editing.atom]);
        } else {
            const updated = [...items];
            updated[editing.index] = editing.atom;
            setItems(updated);
        }
        setEditing(null);
        setDirty(true);
    }

    function deleteItem() {
        if (!editing) return;
        if (editing.isNew) {
            // Nothing was appended yet — just close
            setEditing(null);
            return;
        }
        setItems((prev) => prev.filter((_, i) => i !== editing.index));
        setEditing(null);
        setDirty(true);
    }

    function moveItem(toAccess: "allowed" | "locked") {
        if (!editing) return;
        const updatedAtom: ApiInfoAtom = {
            ...editing.atom,
            access: toAccess,
            level: (toAccess === "allowed" ? 0 : 1) as 0 | 1,
            unlock_condition: toAccess === "allowed" ? "" : editing.atom.unlock_condition,
            category: toAccess === "locked" ? "" : editing.atom.category,
        };
        if (editing.isNew) {
            // Not in items yet — just update the modal's working copy
            setEditing({ ...editing, atom: updatedAtom });
            return;
        }
        const updated = [...items];
        updated[editing.index] = updatedAtom;
        setItems(updated);
        setEditing(null);
        setDirty(true);
    }

    async function handleSaveChanges() {
        try {
            await onSave(items);
            setDirty(false);
        } catch {
            // Parent shows its own error; keep dirty so professor can retry
        }
    }

    return (
        <div>
            {dirty && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#78350f" }}>You have unsaved changes.</span>
                    <button
                        onClick={handleSaveChanges}
                        disabled={saving}
                        style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: saving ? "#b0c8f0" : "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "SF Pro Text, system-ui" }}
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* ── LEFT: Basic Layer ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0066cc", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
                        Basic Layer · {basicIndexed.length} facts
                    </div>
                    <p style={{ fontSize: 11, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                        Visible to students before they start interviewing.
                    </p>

                    {BASIC_CATEGORIES.map(({ key, label, description }) => {
                        const catAtoms = basicIndexed.filter((x) => x.atom.category === key);
                        return (
                            <div key={key} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#1d1d1f", marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 10, color: "#9a9a9a", marginBottom: 6 }}>{description}</div>
                                {catAtoms.length === 0 && (
                                    <div style={{ fontSize: 11, color: "#b0b0b0", padding: "6px 10px", fontStyle: "italic" }}>None</div>
                                )}
                                {catAtoms.map(({ atom, idx }) => (
                                    <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                                ))}
                            </div>
                        );
                    })}

                    {/* Atoms with empty or unrecognized category */}
                    {(() => {
                        const validKeys = new Set(BASIC_CATEGORIES.map((c) => c.key));
                        const uncatAtoms = basicIndexed.filter((x) => !validKeys.has(x.atom.category));
                        if (uncatAtoms.length === 0) return null;
                        return (
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#f5f5f7", color: "#7a7a7a" }}>?</span>
                                    <span style={{ fontSize: 11, color: "#7a7a7a" }}>Uncategorized — set category</span>
                                </div>
                                {uncatAtoms.map(({ atom, idx }) => (
                                    <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                                ))}
                            </div>
                        );
                    })()}

                    <AddButton label="+ Add basic fact" onClick={() => openAdd("allowed")} />
                </div>

                {/* ── RIGHT: Hidden Layer ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
                        Hidden Layer · {hiddenIndexed.length} facts
                    </div>
                    <p style={{ fontSize: 11, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                        Revealed only when students ask the right questions.
                    </p>

                    {([1, 2, 3] as const).map((lvl) => {
                        const lvlItems = hiddenIndexed.filter((x) => x.atom.level === lvl);
                        const badge = LEVEL_BADGE[lvl];
                        return (
                            <div key={lvl} style={{ marginBottom: 14 }}>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: badge.bg, color: badge.color }}>
                                        {badge.label}
                                    </span>
                                    <span style={{ fontSize: 11, color: "#7a7a7a" }}>
                                        {lvl === 1 ? "Ask right topic" : lvl === 2 ? "Question assumption" : "Cross-reference agents"}
                                    </span>
                                </div>
                                {lvlItems.length === 0 && (
                                    <div style={{ fontSize: 11, color: "#b0b0b0", padding: "6px 10px", fontStyle: "italic" }}>None</div>
                                )}
                                {lvlItems.map(({ atom, idx }) => (
                                    <HiddenAtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                                ))}
                            </div>
                        );
                    })}

                    {/* Atoms that arrived from backend with level=0 — show so professor can fix them */}
                    {hiddenUncategorized.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#f5f5f7", color: "#7a7a7a" }}>?</span>
                                <span style={{ fontSize: 11, color: "#7a7a7a" }}>Uncategorized — set difficulty</span>
                            </div>
                            {hiddenUncategorized.map(({ atom, idx }) => (
                                <HiddenAtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                            ))}
                        </div>
                    )}

                    <AddButton label="+ Add hidden fact" onClick={() => openAdd("locked")} />
                </div>
            </div>

            {editing && (
                <EditModal
                    atom={editing.atom}
                    roleNames={roleNames}
                    onChange={(updated) => setEditing({ ...editing, atom: updated })}
                    onSave={saveEdit}
                    onDelete={deleteItem}
                    onMove={moveItem}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}

function AtomCard({ atom, onEdit }: { atom: ApiInfoAtom; onEdit: () => void }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                {atom.owner_roles.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                        {atom.owner_roles.map((r) => (
                            <div key={r} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: ROLE_DOT[r] ?? "#7a7a7a", flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: "#7a7a7a" }}>{r}</span>
                            </div>
                        ))}
                    </div>
                )}
                <span style={{ fontSize: 12, color: "#3d3d3f", lineHeight: 1.45 }}>{atom.fact}</span>
            </div>
            <button onClick={onEdit} style={{ fontSize: 11, color: "#0066cc", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 0", fontFamily: "SF Pro Text, system-ui" }}>Edit</button>
        </div>
    );
}

function HiddenAtomCard({ atom, onEdit }: { atom: ApiInfoAtom; onEdit: () => void }) {
    const badge = atom.level in LEVEL_BADGE ? LEVEL_BADGE[atom.level as 1 | 2 | 3] : LEVEL_BADGE[1];
    const agentLabel = atom.owner_roles.join(" × ");
    return (
        <div style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    {agentLabel && <span style={{ fontSize: 10, color: "#7a7a7a" }}>{agentLabel}</span>}
                </div>
                <button onClick={onEdit} style={{ fontSize: 11, color: "#0066cc", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 0", fontFamily: "SF Pro Text, system-ui" }}>Edit</button>
            </div>
            <p style={{ fontSize: 12, color: "#3d3d3f", margin: "0 0 5px", lineHeight: 1.45 }}>{atom.fact}</p>
            {atom.unlock_condition && (
                <p style={{ fontSize: 11, color: "#7a7a7a", margin: 0, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>Unlock: </span>{atom.unlock_condition}
                </p>
            )}
        </div>
    );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px dashed #c0c0c0", background: "none", color: "#7a7a7a", fontSize: 12, cursor: "pointer", fontFamily: "SF Pro Text, system-ui", marginTop: 4 }}
        >
            {label}
        </button>
    );
}

function EditModal({
    atom, roleNames, onChange, onSave, onDelete, onMove, onClose,
}: {
    atom: ApiInfoAtom;
    roleNames: string[];
    onChange: (a: ApiInfoAtom) => void;
    onSave: () => void;
    onDelete: () => void;
    onMove: (to: "allowed" | "locked") => void;
    onClose: () => void;
}) {
    const isLocked = atom.access === "locked";

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", width: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.16)", fontFamily: "SF Pro Text, system-ui" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f", marginBottom: 18 }}>
                    {isLocked ? "Edit Hidden Fact" : "Edit Basic Fact"}
                </div>

                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Owner Agent</label>
                <select
                    value={atom.owner_roles[0] ?? ""}
                    onChange={(e) => onChange({ ...atom, owner_roles: e.target.value ? [e.target.value] : [] })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, marginBottom: 14, fontFamily: "SF Pro Text, system-ui" }}
                >
                    <option value="">— Unassigned —</option>
                    {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>

                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Fact</label>
                <textarea
                    value={atom.fact}
                    onChange={(e) => onChange({ ...atom, fact: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", marginBottom: 14, fontFamily: "SF Pro Text, system-ui", boxSizing: "border-box" }}
                />

                {!isLocked && (
                    <>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Category</label>
                        <select
                            value={atom.category}
                            onChange={(e) => onChange({ ...atom, category: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, marginBottom: 14, fontFamily: "SF Pro Text, system-ui" }}
                        >
                            <option value="">— Uncategorized —</option>
                            {BASIC_CATEGORIES.map(({ key, label }) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </>
                )}

                {isLocked && (
                    <>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Unlock Condition</label>
                        <textarea
                            value={atom.unlock_condition}
                            onChange={(e) => onChange({ ...atom, unlock_condition: e.target.value })}
                            rows={2}
                            placeholder="e.g. Student asks about cash runway or burn rate"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", marginBottom: 14, fontFamily: "SF Pro Text, system-ui", boxSizing: "border-box" }}
                        />

                        <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 8 }}>Unlock Difficulty</label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                            {([1, 2, 3] as const).map((lvl) => {
                                const b = LEVEL_BADGE[lvl];
                                const selected = atom.level === lvl;
                                return (
                                    <button
                                        key={lvl}
                                        onClick={() => onChange({ ...atom, level: lvl })}
                                        style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: selected ? `2px solid ${b.color}` : "1px solid #d0d0d0", background: selected ? b.bg : "#fff", color: selected ? b.color : "#7a7a7a", fontSize: 11, fontWeight: selected ? 700 : 400, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                                    >
                                        {b.label}<br />
                                        <span style={{ fontSize: 10, fontWeight: 400 }}>
                                            {lvl === 1 ? "Right topic" : lvl === 2 ? "Question assumption" : "Cross-reference"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => onMove(isLocked ? "allowed" : "locked")}
                            style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #d0d0d0", background: "#fff", color: "#1d1d1f", fontSize: 11, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            {isLocked ? "Move to Basic" : "Move to Hidden"}
                        </button>
                        <button
                            onClick={onDelete}
                            style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid #fecaca", background: "#fff5f5", color: "#991b1b", fontSize: 11, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Delete
                        </button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={onClose}
                            style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #d0d0d0", background: "#fff", color: "#1d1d1f", fontSize: 12, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onSave}
                            style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: "#0066cc", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "SF Pro Text, system-ui" }}
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
