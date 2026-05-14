# Information Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the playbook generator to classify info atoms with teaching-goal filtering and unlock-difficulty levels, then add a professor-facing Information Layers tab with full edit capability.

**Architecture:** The backend adds a `level` field (1/2/3) to locked info atoms and a new PATCH endpoint for professor edits. The frontend adds an "Information Layers" tab to the existing review page, rendered by a new `InfoLayersTab` component that displays basic/hidden atoms in a two-column layout and supports inline editing via a modal.

**Tech Stack:** Python / FastAPI (backend), Next.js / TypeScript / inline styles (frontend, matching existing codebase style)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/agents/playbook_generator.py` | Add `teaching_goals` param to `_generate_info_atoms`; upgrade prompt to filter by teaching goals and classify locked atoms into L1/L2/L3 |
| Modify | `backend/database.py` | Add `update_playbook_info_atoms(playbook_id, info_atoms)` |
| Modify | `backend/routers/cases.py` | Add `PATCH /cases/{case_id}/playbook/{playbook_id}/info-atoms` endpoint |
| Create | `backend/tests/test_info_atoms.py` | Tests for new `level` field parsing and PATCH endpoint |
| Modify | `frontend/src/lib/api.ts` | Add `ApiInfoAtom` type; extend `ApiPlaybook`; add `professor.updateInfoAtoms` |
| Create | `frontend/src/components/InfoLayersTab.tsx` | Two-column visualization + edit modal |
| Modify | `frontend/src/app/professor/cases/[id]/review/page.tsx` | Add "Information Layers" tab; wire `InfoLayersTab` |

---

## Task 1: Add `level` to info atom parsing (backend)

**Files:**
- Modify: `backend/agents/playbook_generator.py`
- Create: `backend/tests/test_info_atoms.py`

### Step 1.1 — Write failing tests

Create `backend/tests/test_info_atoms.py`:

```python
"""Tests for info atom parsing with level field."""

import unittest
from agents.playbook_generator import _parse_info_atoms


class InfoAtomParsingTests(unittest.TestCase):

    def test_locked_atom_with_level_is_preserved(self):
        raw = '''[
          {
            "fact": "Actual cash runway is only 4 months",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves or burn rate",
            "level": 1
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(len(atoms), 1)
        self.assertEqual(atoms[0]["level"], 1)

    def test_allowed_atom_has_level_zero(self):
        raw = '''[
          {
            "fact": "Company was founded in 2019 with B2B SaaS focus",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 0)

    def test_locked_atom_missing_level_defaults_to_one(self):
        raw = '''[
          {
            "fact": "Head-count plan assumes 30 engineers not yet hired",
            "owner_roles": ["Operations Director"],
            "access": "locked",
            "unlock_condition": "Student asks about staffing"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 1)

    def test_level_out_of_range_is_clamped_to_one(self):
        raw = '''[
          {
            "fact": "Some hidden fact",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks",
            "level": 99
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 1)

    def test_allowed_atom_with_wrong_level_is_set_to_zero(self):
        raw = '''[
          {
            "fact": "Company revenue is $5M ARR",
            "owner_roles": ["CFO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 3
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["level"], 0)

    def test_fact_too_short_is_rejected(self):
        raw = '''[{"fact": "ok", "owner_roles": ["CEO"], "access": "allowed", "unlock_condition": "", "level": 0}]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms, [])


if __name__ == "__main__":
    unittest.main()
```

### Step 1.2 — Run tests to confirm they fail

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py -v
```

Expected: FAIL on `test_locked_atom_with_level_is_preserved` — `level` key absent from returned dict.

### Step 1.3 — Update `_parse_info_atoms` to handle `level`

In `backend/agents/playbook_generator.py`, replace the `_parse_info_atoms` function body (lines 110–144):

```python
def _parse_info_atoms(raw: str) -> list:
    """Parse and validate info atoms from LLM output."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        items = json.loads(text)
    except json.JSONDecodeError:
        return []

    if not isinstance(items, list):
        return []

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        fact = str(item.get("fact") or "").strip()
        if not fact or len(fact.split()) < 4:
            continue
        access = item.get("access", "allowed")
        if access not in ("allowed", "locked"):
            access = "allowed"
        owner_roles = [str(r) for r in (item.get("owner_roles") or []) if r]
        unlock_condition = str(item.get("unlock_condition") or "").strip()

        # level: 0 for allowed; 1/2/3 for locked. Clamp unknown values to 1.
        raw_level = item.get("level")
        if access == "allowed":
            level = 0
        elif raw_level in (1, 2, 3):
            level = int(raw_level)
        else:
            level = 1

        result.append({
            "fact": fact,
            "owner_roles": owner_roles,
            "access": access,
            "unlock_condition": unlock_condition,
            "level": level,
        })

    return result
```

### Step 1.4 — Run tests again

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py -v
```

Expected: All 6 tests PASS.

### Step 1.5 — Commit

```bash
git add backend/agents/playbook_generator.py backend/tests/test_info_atoms.py
git commit -m "feat: add level field to info atom parsing (0=allowed, 1-3=locked difficulty)"
```

---

## Task 2: Upgrade `_generate_info_atoms` prompt (backend)

**Files:**
- Modify: `backend/agents/playbook_generator.py`
- Modify: `backend/tests/test_info_atoms.py`

### Step 2.1 — Write failing test for teaching goals filtering

Add to `backend/tests/test_info_atoms.py`:

```python
import asyncio
from unittest.mock import patch
from agents.playbook_generator import _generate_info_atoms


class InfoAtomGenerationTests(unittest.IsolatedAsyncioTestCase):

    async def test_generate_info_atoms_returns_list_with_level(self):
        mock_output = '''[
          {
            "fact": "Cash runway is 4 months at current burn",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves",
            "level": 1
          },
          {
            "fact": "Company targets SMB segment with 300 existing clients",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0
          }
        ]'''
        with patch("agents.playbook_generator.complete", return_value=mock_output):
            atoms = await _generate_info_atoms(
                raw_content="EcoRide case content here",
                roles=[{"name": "CFO", "allowed_info": ["ARPU is $0.60"]}],
                title="EcoRide",
                teaching_goals=["Evaluate unit economics viability"],
            )
        self.assertIsInstance(atoms, list)
        self.assertEqual(len(atoms), 2)
        locked = [a for a in atoms if a["access"] == "locked"]
        self.assertEqual(locked[0]["level"], 1)
        allowed = [a for a in atoms if a["access"] == "allowed"]
        self.assertEqual(allowed[0]["level"], 0)
```

### Step 2.2 — Run to confirm failure

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py::InfoAtomGenerationTests -v
```

Expected: FAIL — `_generate_info_atoms` does not accept `teaching_goals` parameter.

### Step 2.3 — Update `_generate_info_atoms` signature and prompt

Replace the entire `_generate_info_atoms` function in `backend/agents/playbook_generator.py` (lines 48–107):

```python
async def _generate_info_atoms(
    raw_content: str,
    roles: list,
    title: str = "",
    teaching_goals: list[str] | None = None,
) -> list:
    """Second-pass LLM call: filter by teaching goals, then split into allowed/locked atoms with difficulty levels.

    Returns a list of info atoms:
      [{fact, owner_roles[], access('allowed'|'locked'), unlock_condition, level(0-3)}]
    """
    content_excerpt = raw_content.strip()
    goals_text = ", ".join(teaching_goals) if teaching_goals else "strategic decision-making"

    roles_context = "\n".join(
        f"- {r['name']}: " + "; ".join((r.get("allowed_info") or [])[:3])
        for r in roles
    )

    prompt = f"""You are analyzing a business case to map its information into two layers for a student simulation.

Case Title: {title}
Teaching Goals: {goals_text}

Case Content:
{content_excerpt}

Each stakeholder's already-public basic facts:
{roles_context}

STEP 1 — RELEVANCE FILTER
Only include facts that affect the student's ability to answer the teaching goals above.
Discard facts that are irrelevant to those goals (e.g. company history unrelated to the decision, office locations, founder bios).

STEP 2 — CLASSIFY EACH FACT
Classify each retained fact using these rules:

BASIC LAYER ("allowed") — use if ANY of these is true:
1. Publicly available or known to all parties
2. Students need it to know which questions to ask
3. Describes the core decision context or a stakeholder's official responsibilities
4. Describes a visible tension without revealing its root cause

HIDDEN LAYER ("locked") — use only if ALL of these are true:
1. Revealing it would materially change the student's analysis or recommendation
2. The stakeholder has a realistic motive to withhold it
3. It can only be surfaced by a student thinking in the right direction

STEP 3 — ASSIGN UNLOCK DIFFICULTY (locked atoms only)
Assign a level using these rules:
- level 1: Student only needs to ask about the right topic (no prerequisites)
- level 2: Student must question a basic-layer assumption OR get a clue from another agent first
- level 3: Student must cross-reference info from TWO OR MORE agents to even know to ask this

Return ONLY valid JSON, no markdown:
[
  {{
    "fact": "<one concrete fact, include numbers where relevant>",
    "owner_roles": ["<role name>"],
    "access": "allowed",
    "unlock_condition": "",
    "level": 0
  }},
  {{
    "fact": "<hidden fact that materially changes the analysis>",
    "owner_roles": ["<role name>"],
    "access": "locked",
    "unlock_condition": "<specific trigger: what the student must ask or demonstrate>",
    "level": 2
  }}
]

Requirements:
- 4-6 allowed atoms covering the key public facts relevant to the teaching goals
- 5-8 locked atoms covering genuine hidden risks that shift the decision
- Locked facts must be substantive: undisclosed financial risk, competitive threat, regulatory constraint, internal conflict
- unlock_conditions must be specific ("Student asks why the growth projection assumes 30% and what supports it" not "Student asks about growth")
- level must be 0 for allowed, 1/2/3 for locked based on the rules above
- Each atom belongs to 1-2 roles maximum"""

    raw = await complete(prompt, max_tokens=2000, temperature=0.2)
    return _parse_info_atoms(raw)
```

### Step 2.4 — Update the call site in `generate_playbook`

In `generate_playbook` (around line 243), update the call to pass `teaching_goals`:

```python
    # Second pass: generate hidden layer info atoms
    info_atoms = await _generate_info_atoms(
        raw_content,
        playbook["roles"],
        title,
        teaching_goals=teaching_goals,
    )
```

### Step 2.5 — Run all info atom tests

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py -v
```

Expected: All tests PASS.

### Step 2.6 — Commit

```bash
git add backend/agents/playbook_generator.py backend/tests/test_info_atoms.py
git commit -m "feat: upgrade info atom prompt with teaching-goal filter and L1/L2/L3 difficulty levels"
```

---

## Task 3: Add PATCH endpoint for professor edits (backend)

**Files:**
- Modify: `backend/database.py`
- Modify: `backend/routers/cases.py`
- Modify: `backend/tests/test_info_atoms.py`

### Step 3.1 — Write failing test for the new endpoint

Add to `backend/tests/test_info_atoms.py`:

```python
from fastapi.testclient import TestClient
from unittest.mock import patch
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import app


class InfoAtomEndpointTests(unittest.TestCase):

    def test_patch_info_atoms_calls_db_update(self):
        atoms = [
            {
                "fact": "Cash runway is 4 months",
                "owner_roles": ["CFO"],
                "access": "locked",
                "unlock_condition": "Student asks about cash",
                "level": 1,
            }
        ]
        with (
            patch("routers.cases.db.get_case", return_value={"id": "case-1"}),
            patch("routers.cases.db.get_playbook", return_value={"id": "pb-1", "case_id": "case-1"}),
            patch("routers.cases.db.update_playbook_info_atoms") as mock_update,
        ):
            client = TestClient(app)
            resp = client.patch(
                "/cases/case-1/playbook/pb-1/info-atoms",
                json={"info_atoms": atoms},
            )
        self.assertEqual(resp.status_code, 200)
        mock_update.assert_called_once_with("pb-1", atoms)

    def test_patch_info_atoms_rejects_invalid_access_value(self):
        atoms = [
            {
                "fact": "Some fact that is long enough to pass validation",
                "owner_roles": ["CFO"],
                "access": "invalid_value",
                "unlock_condition": "",
                "level": 0,
            }
        ]
        with (
            patch("routers.cases.db.get_case", return_value={"id": "case-1"}),
            patch("routers.cases.db.get_playbook", return_value={"id": "pb-1", "case_id": "case-1"}),
            patch("routers.cases.db.update_playbook_info_atoms"),
        ):
            client = TestClient(app)
            resp = client.patch(
                "/cases/case-1/playbook/pb-1/info-atoms",
                json={"info_atoms": atoms},
            )
        self.assertEqual(resp.status_code, 422)
```

### Step 3.2 — Run to confirm failure

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py::InfoAtomEndpointTests -v
```

Expected: FAIL — endpoint does not exist.

### Step 3.3 — Add `update_playbook_info_atoms` to `database.py`

Add at the end of `backend/database.py`:

```python
def update_playbook_info_atoms(playbook_id: str, info_atoms: list) -> None:
    _get_client().table("playbooks").update(
        {"info_atoms": info_atoms}
    ).eq("id", playbook_id).execute()
```

### Step 3.4 — Add PATCH endpoint to `routers/cases.py`

Add after the `reject_playbook` endpoint (before `get_pending_playbook`):

```python
class InfoAtomItem(BaseModel):
    fact: str
    owner_roles: list[str] = []
    access: str = Field(pattern="^(allowed|locked)$")
    unlock_condition: str = ""
    level: int = Field(ge=0, le=3)


class UpdateInfoAtomsIn(BaseModel):
    info_atoms: list[InfoAtomItem]


@router.patch("/{case_id}/playbook/{playbook_id}/info-atoms")
def update_info_atoms(case_id: str, playbook_id: str, body: UpdateInfoAtomsIn):
    case = db.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    playbook = db.get_playbook(playbook_id)
    if not playbook or playbook["case_id"] != case_id:
        raise HTTPException(status_code=404, detail="Playbook not found")
    atoms = [item.model_dump() for item in body.info_atoms]
    db.update_playbook_info_atoms(playbook_id, atoms)
    return {"status": "updated", "count": len(atoms)}
```

Also add `Field` to the existing pydantic import at the top of `routers/cases.py`. The current import is:
```python
from pydantic import BaseModel, Field
```
(Field is already imported — no change needed.)

### Step 3.5 — Run all tests

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/test_info_atoms.py -v
```

Expected: All tests PASS.

### Step 3.6 — Commit

```bash
git add backend/database.py backend/routers/cases.py backend/tests/test_info_atoms.py
git commit -m "feat: add PATCH endpoint for professor info atom edits"
```

---

## Task 4: Add `ApiInfoAtom` type and API call (frontend)

**Files:**
- Modify: `frontend/src/lib/api.ts`

### Step 4.1 — Add types and update `ApiPlaybook`

In `frontend/src/lib/api.ts`, add `ApiInfoAtom` after the `ApiPlaybookRole` interface (around line 47):

```typescript
export interface ApiInfoAtom {
    fact: string;
    owner_roles: string[];
    access: "allowed" | "locked";
    unlock_condition: string;
    level: 0 | 1 | 2 | 3;
}
```

Update `ApiPlaybook` to include `info_atoms`:

```typescript
export interface ApiPlaybook {
    id: string;
    case_id: string;
    version: number;
    roles: ApiPlaybookRole[];
    questions: ApiQuestion[];
    info_atoms: ApiInfoAtom[];
    review_status: string;
}
```

### Step 4.2 — Add `updateInfoAtoms` to the `professor` API object

In the `professor` section of the `api` object (around line 248), add after `rejectPlaybook`:

```typescript
        updateInfoAtoms: (caseId: string, playbookId: string, infoAtoms: ApiInfoAtom[]) =>
            patch<{ status: string; count: number }>(
                `/cases/${caseId}/playbook/${playbookId}/info-atoms`,
                { info_atoms: infoAtoms },
            ),
```

### Step 4.3 — Verify TypeScript compiles

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npx tsc --noEmit
```

Expected: No errors.

### Step 4.4 — Commit

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add ApiInfoAtom type and updateInfoAtoms API call"
```

---

## Task 5: Build `InfoLayersTab` component (frontend)

**Files:**
- Create: `frontend/src/components/InfoLayersTab.tsx`

### Step 5.1 — Create the component

Create `frontend/src/components/InfoLayersTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ApiInfoAtom, ApiPlaybookRole } from "@/lib/api";

const LEVEL_BADGE: Record<number, { label: string; bg: string; color: string }> = {
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

function dot(name: string) {
    return ROLE_DOT[name] ?? "#7a7a7a";
}

interface EditState {
    index: number;
    atom: ApiInfoAtom;
}

interface Props {
    atoms: ApiInfoAtom[];
    roles: ApiPlaybookRole[];
    saving: boolean;
    onSave: (atoms: ApiInfoAtom[]) => void;
}

export default function InfoLayersTab({ atoms, roles, saving, onSave }: Props) {
    const [items, setItems] = useState<ApiInfoAtom[]>(atoms);
    const [editing, setEditing] = useState<EditState | null>(null);
    const [dirty, setDirty] = useState(false);

    const roleNames = roles.map((r) => r.name);
    const basicItems = items.filter((a) => a.access === "allowed");
    const hiddenItems = items.filter((a) => a.access === "locked");

    // Group basic items by first owner role
    const basicByRole: Record<string, ApiInfoAtom[]> = {};
    for (const role of roleNames) {
        basicByRole[role] = basicItems.filter((a) => a.owner_roles.includes(role));
    }
    const basicUnassigned = basicItems.filter((a) => a.owner_roles.length === 0);

    function openEdit(index: number) {
        setEditing({ index, atom: { ...items[index] } });
    }

    function openAdd(access: "allowed" | "locked") {
        const newAtom: ApiInfoAtom = {
            fact: "",
            owner_roles: [],
            access,
            unlock_condition: "",
            level: access === "allowed" ? 0 : 1,
        };
        const newIndex = items.length;
        setItems((prev) => [...prev, newAtom]);
        setEditing({ index: newIndex, atom: newAtom });
        setDirty(true);
    }

    function saveEdit() {
        if (!editing) return;
        const updated = [...items];
        updated[editing.index] = editing.atom;
        setItems(updated);
        setEditing(null);
        setDirty(true);
    }

    function deleteItem(index: number) {
        setItems((prev) => prev.filter((_, i) => i !== index));
        setEditing(null);
        setDirty(true);
    }

    function moveItem(index: number, toAccess: "allowed" | "locked") {
        const updated = [...items];
        updated[index] = {
            ...updated[index],
            access: toAccess,
            level: toAccess === "allowed" ? 0 : 1,
            unlock_condition: toAccess === "allowed" ? "" : updated[index].unlock_condition,
        };
        setItems(updated);
        setEditing(null);
        setDirty(true);
    }

    function globalIndex(atom: ApiInfoAtom) {
        return items.indexOf(atom);
    }

    return (
        <div>
            {/* Save banner */}
            {dirty && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#78350f" }}>You have unsaved changes.</span>
                    <button
                        onClick={() => { onSave(items); setDirty(false); }}
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
                        Basic Layer · {basicItems.length} facts
                    </div>
                    <p style={{ fontSize: 11, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                        Visible to students before they start interviewing.
                    </p>

                    {roleNames.map((role) => {
                        const roleAtoms = basicByRole[role] ?? [];
                        return (
                            <div key={role} style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot(role), flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#1d1d1f" }}>{role}</span>
                                </div>
                                {roleAtoms.length === 0 && (
                                    <div style={{ fontSize: 11, color: "#b0b0b0", padding: "6px 10px", fontStyle: "italic" }}>No basic facts yet</div>
                                )}
                                {roleAtoms.map((atom) => {
                                    const idx = globalIndex(atom);
                                    return (
                                        <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                                    );
                                })}
                            </div>
                        );
                    })}

                    {basicUnassigned.map((atom) => {
                        const idx = globalIndex(atom);
                        return <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />;
                    })}

                    <AddButton label="+ Add basic fact" onClick={() => openAdd("allowed")} />
                </div>

                {/* ── RIGHT: Hidden Layer ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
                        Hidden Layer · {hiddenItems.length} facts
                    </div>
                    <p style={{ fontSize: 11, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                        Revealed only when students ask the right questions.
                    </p>

                    {([1, 2, 3] as const).map((lvl) => {
                        const lvlAtoms = hiddenItems.filter((a) => a.level === lvl);
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
                                {lvlAtoms.length === 0 && (
                                    <div style={{ fontSize: 11, color: "#b0b0b0", padding: "6px 10px", fontStyle: "italic" }}>None</div>
                                )}
                                {lvlAtoms.map((atom) => {
                                    const idx = globalIndex(atom);
                                    return <HiddenAtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />;
                                })}
                            </div>
                        );
                    })}

                    <AddButton label="+ Add hidden fact" onClick={() => openAdd("locked")} />
                </div>
            </div>

            {/* ── Edit Modal ── */}
            {editing && (
                <EditModal
                    atom={editing.atom}
                    roleNames={roleNames}
                    onChange={(updated) => setEditing({ ...editing, atom: updated })}
                    onSave={saveEdit}
                    onDelete={() => deleteItem(editing.index)}
                    onMove={(toAccess) => moveItem(editing.index, toAccess)}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
}

function AtomCard({ atom, onEdit }: { atom: ApiInfoAtom; onEdit: () => void }) {
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#3d3d3f", lineHeight: 1.45, flex: 1 }}>{atom.fact}</span>
            <button onClick={onEdit} style={{ fontSize: 11, color: "#0066cc", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: "2px 0", fontFamily: "SF Pro Text, system-ui" }}>Edit</button>
        </div>
    );
}

function HiddenAtomCard({ atom, onEdit }: { atom: ApiInfoAtom; onEdit: () => void }) {
    const badge = LEVEL_BADGE[atom.level] ?? LEVEL_BADGE[1];
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

                {/* Owner roles */}
                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Owner Agent</label>
                <select
                    value={atom.owner_roles[0] ?? ""}
                    onChange={(e) => onChange({ ...atom, owner_roles: e.target.value ? [e.target.value] : [] })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, marginBottom: 14, fontFamily: "SF Pro Text, system-ui" }}
                >
                    <option value="">— Unassigned —</option>
                    {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>

                {/* Fact text */}
                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Fact</label>
                <textarea
                    value={atom.fact}
                    onChange={(e) => onChange({ ...atom, fact: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", marginBottom: 14, fontFamily: "SF Pro Text, system-ui", boxSizing: "border-box" }}
                />

                {/* Unlock condition — locked only */}
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

                {/* Footer actions */}
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
```

### Step 5.2 — Verify TypeScript compiles

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npx tsc --noEmit
```

Expected: No errors.

### Step 5.3 — Commit

```bash
git add frontend/src/components/InfoLayersTab.tsx
git commit -m "feat: add InfoLayersTab component with two-column visualization and edit modal"
```

---

## Task 6: Wire `InfoLayersTab` into the review page (frontend)

**Files:**
- Modify: `frontend/src/app/professor/cases/[id]/review/page.tsx`

### Step 6.1 — Add `"layers"` to the Tab type and TabBar

In `review/page.tsx`, change the `Tab` type (line 20):

```typescript
type Tab = "overview" | "roles" | "questions" | "layers";
```

Update the `tabs` array inside `TabBar` (lines 23–27):

```typescript
    const tabs: { key: Tab; label: string }[] = [
        { key: "overview",  label: "Overview" },
        { key: "roles",     label: "Stakeholder Roles" },
        { key: "questions", label: "Discussion Questions" },
        { key: "layers",    label: "Information Layers" },
    ];
```

### Step 6.2 — Add state and save handler

At the top of `PlaybookReviewPage` where existing state is declared, add:

```typescript
    const [atomsSaving, setAtomsSaving] = useState(false);
```

Add the save handler function inside `PlaybookReviewPage` after `handleReject`:

```typescript
    async function handleSaveAtoms(atoms: ApiInfoAtom[]) {
        if (!playbook || atomsSaving) return;
        setAtomsSaving(true);
        try {
            await api.professor.updateInfoAtoms(caseId, playbook.id, atoms);
            setPlaybook({ ...playbook, info_atoms: atoms });
        } catch {
            setError("Failed to save information layers. Please try again.");
        } finally {
            setAtomsSaving(false);
        }
    }
```

### Step 6.3 — Add the import

At the top of the file, add:

```typescript
import InfoLayersTab from "@/components/InfoLayersTab";
import { ApiInfoAtom } from "@/lib/api";
```

The existing import line already imports from `@/lib/api` — extend it:

```typescript
import { api, ApiCase, ApiPlaybook, ApiPlaybookRole, ApiQuestion, ApiInfoAtom } from "@/lib/api";
```

### Step 6.4 — Add the tab render block

After the `{tab === "questions" && ...}` block and before the closing `</div>` of the main content area, add:

```tsx
                {tab === "layers" && (
                    <>
                        <p style={{ fontSize: 12, color: "#7a7a7a", margin: "0 0 16px" }}>
                            Review and edit how case facts are distributed between the basic layer (visible to students upfront) and the hidden layer (unlocked through conversation).
                        </p>
                        <InfoLayersTab
                            atoms={playbook.info_atoms ?? []}
                            roles={roles}
                            saving={atomsSaving}
                            onSave={handleSaveAtoms}
                        />
                    </>
                )}
```

### Step 6.5 — Verify TypeScript compiles

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npx tsc --noEmit
```

Expected: No errors.

### Step 6.6 — Commit

```bash
git add frontend/src/app/professor/cases/[id]/review/page.tsx
git commit -m "feat: add Information Layers tab to professor playbook review page"
```

---

## Task 7: End-to-end smoke test

### Step 7.1 — Start the backend

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m uvicorn main:app --reload --port 8000
```

### Step 7.2 — Start the frontend

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npm run dev
```

### Step 7.3 — Manual test checklist

1. Navigate to `http://localhost:3000/professor/cases/<existing-case-id>/review`
2. Confirm "Information Layers" tab appears in the tab bar
3. Click the tab — confirm two-column layout renders with basic facts on the left and hidden facts on the right
4. Hidden facts show L1 / L2 / L3 badges
5. Click **Edit** on any card — edit modal opens
6. Change the fact text and click **Save** — card updates in UI, save banner appears
7. Click **Save Changes** — banner disappears (API call succeeds)
8. Click **Move to Hidden** on a basic fact — it moves to the right column with L1 badge
9. Click **+ Add hidden fact** — empty modal opens, fill in, save — appears in L1 section
10. Click **Delete** in modal — item is removed from the list

### Step 7.4 — Run all backend tests one final time

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python -m pytest tests/ -v
```

Expected: All tests PASS.

### Step 7.5 — Final commit

```bash
git add -A
git commit -m "feat: complete information layers feature - filter, classify, visualize, edit"
```
