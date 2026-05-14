# Basic Layer Sub-Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify basic-layer info atoms into five pedagogical categories (Company Background, Decision Context, Role Statement, Visible Tension, Public Numbers) so professors see facts organised by type rather than by agent.

**Architecture:** Add a `category` string field to the info atom data model throughout the stack — LLM prompt assigns it, Pydantic validates it, the frontend stores it. The `InfoLayersTab` left column switches from role-grouping to category-grouping; each card keeps a role-colour dot so agent ownership stays visible. Locked atoms always carry `category: ""`.

**Tech Stack:** Python 3.9 / FastAPI / Pydantic v2 (backend), Next.js 14 / TypeScript / inline styles (frontend), pytest (tests)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/agents/playbook_generator.py` | Add `category` to `_parse_info_atoms`; add Step 2b to LLM prompt |
| Modify | `backend/routers/cases.py` | Add `category: str = ""` to `InfoAtomItem` |
| Modify | `backend/tests/test_info_atoms.py` | Tests for `category` field + update existing fixtures |
| Modify | `frontend/src/lib/api.ts` | Add `category: string` to `ApiInfoAtom` |
| Modify | `frontend/src/components/InfoLayersTab.tsx` | Category constants; category-grouped left column; category selector in edit modal |

---

## Task 1: Add `category` to info atom parsing (backend)

**Files:**
- Modify: `backend/agents/playbook_generator.py`
- Modify: `backend/tests/test_info_atoms.py`

- [ ] **Step 1.1 — Write three failing tests**

Add to the `InfoAtomParsingTests` class in `backend/tests/test_info_atoms.py` (after `test_fact_too_short_is_rejected`):

```python
    def test_allowed_atom_category_is_preserved(self):
        raw = '''[
          {
            "fact": "Company was founded in 2019 with B2B SaaS focus",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0,
            "category": "company_background"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "company_background")

    def test_locked_atom_category_is_forced_empty(self):
        raw = '''[
          {
            "fact": "Actual cash runway is only 4 months at current burn",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves",
            "level": 1,
            "category": "company_background"
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "")

    def test_allowed_atom_missing_category_defaults_to_empty(self):
        raw = '''[
          {
            "fact": "Company has 300 enterprise clients across the region",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0
          }
        ]'''
        atoms = _parse_info_atoms(raw)
        self.assertEqual(atoms[0]["category"], "")
```

- [ ] **Step 1.2 — Run to confirm failure**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomParsingTests::test_allowed_atom_category_is_preserved tests/test_info_atoms.py::InfoAtomParsingTests::test_locked_atom_category_is_forced_empty tests/test_info_atoms.py::InfoAtomParsingTests::test_allowed_atom_missing_category_defaults_to_empty -v
```

Expected: all three FAIL with `KeyError: 'category'`.

- [ ] **Step 1.3 — Update `_parse_info_atoms` in `playbook_generator.py`**

In `backend/agents/playbook_generator.py`, replace the `_parse_info_atoms` function (currently lines 134–180) with:

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

        # category: one of five keys for allowed atoms; always "" for locked
        category = str(item.get("category") or "").strip() if access == "allowed" else ""

        result.append({
            "fact": fact,
            "owner_roles": owner_roles,
            "access": access,
            "unlock_condition": unlock_condition,
            "level": level,
            "category": category,
        })

    return result
```

- [ ] **Step 1.4 — Run all parsing tests**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomParsingTests -v
```

Expected: all 9 tests PASS.

- [ ] **Step 1.5 — Commit**

```bash
git add backend/agents/playbook_generator.py backend/tests/test_info_atoms.py
git commit -m "feat: add category field to info atom parsing (allowed only)"
```

---

## Task 2: Upgrade LLM prompt to assign category (backend)

**Files:**
- Modify: `backend/agents/playbook_generator.py`
- Modify: `backend/tests/test_info_atoms.py`

- [ ] **Step 2.1 — Write failing test**

Add to the `InfoAtomGenerationTests` class in `backend/tests/test_info_atoms.py`:

```python
    async def test_generate_info_atoms_includes_category(self):
        mock_output = '''[
          {
            "fact": "Company was founded in 2019 as a B2B SaaS platform",
            "owner_roles": ["CEO"],
            "access": "allowed",
            "unlock_condition": "",
            "level": 0,
            "category": "company_background"
          },
          {
            "fact": "Cash runway is only 4 months at current burn rate",
            "owner_roles": ["CFO"],
            "access": "locked",
            "unlock_condition": "Student asks about cash reserves",
            "level": 1,
            "category": ""
          }
        ]'''
        with patch("agents.playbook_generator.complete", return_value=mock_output) as mock_complete:
            atoms = await _generate_info_atoms(
                raw_content="EcoRide case content here",
                roles=[{"name": "CEO", "allowed_info": ["Founded in 2019"]}],
                title="EcoRide",
                teaching_goals=["Evaluate market entry strategy"],
            )
        called_prompt = mock_complete.call_args[0][0]
        self.assertIn("company_background", called_prompt)
        self.assertIn("category", called_prompt)
        allowed = [a for a in atoms if a["access"] == "allowed"]
        self.assertEqual(allowed[0]["category"], "company_background")
        locked = [a for a in atoms if a["access"] == "locked"]
        self.assertEqual(locked[0]["category"], "")
```

- [ ] **Step 2.2 — Run to confirm failure**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomGenerationTests::test_generate_info_atoms_includes_category -v
```

Expected: FAIL — `AssertionError` because `"company_background"` not in prompt yet.

- [ ] **Step 2.3 — Update `_generate_info_atoms` prompt in `playbook_generator.py`**

In `backend/agents/playbook_generator.py`, replace the entire `_generate_info_atoms` function (lines 50–131) with:

```python
async def _generate_info_atoms(
    raw_content: str,
    roles: list,
    title: str = "",
    teaching_goals: list[str] | None = None,
) -> list:
    """Second-pass LLM call: filter by teaching goals, classify into layers, assign difficulty and category.

    Returns a list of info atoms:
      [{fact, owner_roles[], access('allowed'|'locked'), unlock_condition, level(0-3), category}]
    """
    content_excerpt = raw_content.strip()
    goals_text = ", ".join(teaching_goals) if teaching_goals else "strategic decision-making"

    roles_context = "\n".join(
        f"- {r['name']}: " + ("; ".join((r.get("allowed_info") or [])[:3]) or "(none listed)")
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

STEP 2b — ASSIGN CATEGORY (for "allowed" atoms only, set "category": "" for all "locked" atoms)
Assign exactly one of these five category values to each "allowed" atom:
- "company_background": publicly known company size, business model, or market environment
- "decision_context": the decision currently under consideration and its urgency or stakes
- "role_statement": this stakeholder's official role and area of responsibility
- "visible_tension": a known contradiction, pressure, or gap without revealing its root cause
- "public_numbers": specific numbers available from public sources (revenue, users, timelines, costs)

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
    "level": 0,
    "category": "company_background"
  }},
  {{
    "fact": "<hidden fact that materially changes the analysis>",
    "owner_roles": ["<role name>"],
    "access": "locked",
    "unlock_condition": "<specific trigger: what the student must ask or demonstrate>",
    "level": 2,
    "category": ""
  }}
]

Requirements:
- 4-6 allowed atoms covering the key public facts relevant to the teaching goals
- 5-8 locked atoms covering genuine hidden risks that shift the decision
- Locked facts must be substantive: undisclosed financial risk, competitive threat, regulatory constraint, internal conflict
- unlock_conditions must be specific ("Student asks why the growth projection assumes 30% and what supports it" not "Student asks about growth")
- level must be 0 for allowed, 1/2/3 for locked based on the rules above
- category must be one of the five keys above for allowed atoms; must be "" for locked atoms
- Each atom belongs to 1-2 roles maximum"""

    raw = await complete(prompt, max_tokens=2000, temperature=0.2)
    return _parse_info_atoms(raw)
```

- [ ] **Step 2.4 — Run all info atom generation tests**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomGenerationTests -v
```

Expected: both tests PASS.

- [ ] **Step 2.5 — Commit**

```bash
git add backend/agents/playbook_generator.py backend/tests/test_info_atoms.py
git commit -m "feat: add category classification step to info atom LLM prompt"
```

---

## Task 3: Update PATCH endpoint to accept `category` field (backend)

**Files:**
- Modify: `backend/routers/cases.py`
- Modify: `backend/tests/test_info_atoms.py`

- [ ] **Step 3.1 — Write new test and update existing fixture**

In `backend/tests/test_info_atoms.py`, make two changes to `InfoAtomEndpointTests`:

**a) Update `test_patch_info_atoms_calls_db_update` — add `"category": ""` to the fixture** (Pydantic's `model_dump()` will now include the field, so the `assert_called_once_with` check requires it):

```python
    def test_patch_info_atoms_calls_db_update(self):
        atoms = [
            {
                "fact": "Cash runway is 4 months",
                "owner_roles": ["CFO"],
                "access": "locked",
                "unlock_condition": "Student asks about cash",
                "level": 1,
                "category": "",
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
        self.assertEqual(resp.json()["count"], 1)
        mock_update.assert_called_once_with("pb-1", atoms)
```

**b) Add new test for category being stored:**

```python
    def test_patch_info_atoms_stores_category(self):
        atoms = [
            {
                "fact": "Company was founded in 2019 as a B2B SaaS platform",
                "owner_roles": ["CEO"],
                "access": "allowed",
                "unlock_condition": "",
                "level": 0,
                "category": "company_background",
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
        stored = mock_update.call_args[0][1]
        self.assertEqual(stored[0]["category"], "company_background")
```

- [ ] **Step 3.2 — Run to confirm test_patch_info_atoms_stores_category fails**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomEndpointTests::test_patch_info_atoms_stores_category -v
```

Expected: FAIL — `KeyError: 'category'` because `InfoAtomItem` doesn't have the field yet.

- [ ] **Step 3.3 — Update `InfoAtomItem` in `routers/cases.py`**

Find the `InfoAtomItem` class (currently around line 240). Replace it with:

```python
class InfoAtomItem(BaseModel):
    fact: str = Field(min_length=10)
    owner_roles: list[str] = []
    access: str = Field(pattern="^(allowed|locked)$")
    unlock_condition: str = ""
    level: int = Field(ge=0, le=3)
    category: str = ""
```

- [ ] **Step 3.4 — Run all endpoint tests**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py::InfoAtomEndpointTests -v
```

Expected: all 3 tests PASS.

- [ ] **Step 3.5 — Run full test suite**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/backend
python3 -m pytest tests/test_info_atoms.py -v
```

Expected: all 12 tests PASS.

- [ ] **Step 3.6 — Commit**

```bash
git add backend/routers/cases.py backend/tests/test_info_atoms.py
git commit -m "feat: add category field to PATCH info-atoms endpoint"
```

---

## Task 4: Add `category` to frontend API type

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 4.1 — Update `ApiInfoAtom` interface**

In `frontend/src/lib/api.ts`, find `ApiInfoAtom` (currently around line 61) and replace it with:

```typescript
export interface ApiInfoAtom {
    fact: string;
    owner_roles: string[];
    access: "allowed" | "locked";
    unlock_condition: string;
    level: 0 | 1 | 2 | 3;
    category: string;
}
```

- [ ] **Step 4.2 — Verify TypeScript compiles**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.3 — Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add category field to ApiInfoAtom type"
```

---

## Task 5: Restructure InfoLayersTab left column by category

**Files:**
- Modify: `frontend/src/components/InfoLayersTab.tsx`

- [ ] **Step 5.1 — Replace the full file**

Write the complete new `frontend/src/components/InfoLayersTab.tsx`:

```tsx
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

const BASIC_CATEGORIES: { key: string; label: string }[] = [
    { key: "company_background", label: "Company & Market Background" },
    { key: "decision_context",   label: "Core Decision Context" },
    { key: "role_statement",     label: "Role & Responsibilities" },
    { key: "visible_tension",    label: "Visible Tensions" },
    { key: "public_numbers",     label: "Public Key Numbers" },
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

    // Group basic atoms by category
    const basicByCategory: Record<string, typeof basicIndexed> = {};
    for (const cat of BASIC_CATEGORIES) {
        basicByCategory[cat.key] = basicIndexed.filter((x) => x.atom.category === cat.key);
    }
    const basicUncategorized = basicIndexed.filter(
        (x) => !BASIC_CATEGORIES.some((c) => c.key === x.atom.category)
    );

    const hiddenUncategorized = hiddenIndexed.filter((x) => x.atom.level === 0);

    function openEdit(idx: number) {
        setEditing({ index: idx, atom: { ...items[idx] }, isNew: false });
    }

    function openAdd(access: "allowed" | "locked") {
        const newAtom: ApiInfoAtom = {
            fact: "",
            owner_roles: [],
            access,
            unlock_condition: "",
            level: access === "allowed" ? 0 : 1,
            category: "",
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
                {/* ── LEFT: Basic Layer grouped by category ── */}
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0066cc", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
                        Basic Layer · {basicIndexed.length} facts
                    </div>
                    <p style={{ fontSize: 11, color: "#7a7a7a", margin: "0 0 14px", lineHeight: 1.5 }}>
                        Visible to students before they start interviewing.
                    </p>

                    {BASIC_CATEGORIES.map(({ key, label }) => {
                        const catAtoms = basicByCategory[key] ?? [];
                        return (
                            <div key={key} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#7a7a7a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                                    {label}
                                </div>
                                {catAtoms.length === 0 && (
                                    <div style={{ fontSize: 11, color: "#b0b0b0", padding: "6px 10px", fontStyle: "italic" }}>None</div>
                                )}
                                {catAtoms.map(({ atom, idx }) => (
                                    <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                                ))}
                            </div>
                        );
                    })}

                    {/* Atoms with missing or unknown category */}
                    {basicUncategorized.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#b0b0b0", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                                Uncategorized
                            </div>
                            {basicUncategorized.map(({ atom, idx }) => (
                                <AtomCard key={idx} atom={atom} onEdit={() => openEdit(idx)} />
                            ))}
                        </div>
                    )}

                    <AddButton label="+ Add basic fact" onClick={() => openAdd("allowed")} />
                </div>

                {/* ── RIGHT: Hidden Layer grouped by difficulty ── */}
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
    const primaryRole = atom.owner_roles[0];
    return (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 7, flex: 1 }}>
                {primaryRole && (
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot(primaryRole), flexShrink: 0, marginTop: 4 }} />
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

                {/* Owner Agent */}
                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Owner Agent</label>
                <select
                    value={atom.owner_roles[0] ?? ""}
                    onChange={(e) => onChange({ ...atom, owner_roles: e.target.value ? [e.target.value] : [] })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, marginBottom: 14, fontFamily: "SF Pro Text, system-ui" }}
                >
                    <option value="">— Unassigned —</option>
                    {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>

                {/* Category — basic layer only */}
                {!isLocked && (
                    <>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Category</label>
                        <select
                            value={atom.category}
                            onChange={(e) => onChange({ ...atom, category: e.target.value })}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, marginBottom: 14, fontFamily: "SF Pro Text, system-ui" }}
                        >
                            <option value="">— Uncategorized —</option>
                            {BASIC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                    </>
                )}

                {/* Fact */}
                <label style={{ fontSize: 11, fontWeight: 600, color: "#7a7a7a", display: "block", marginBottom: 4 }}>Fact</label>
                <textarea
                    value={atom.fact}
                    onChange={(e) => onChange({ ...atom, fact: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", marginBottom: 14, fontFamily: "SF Pro Text, system-ui", boxSizing: "border-box" }}
                />

                {/* Unlock condition + difficulty — locked only */}
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

                {/* Footer */}
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

- [ ] **Step 5.2 — Verify TypeScript compiles**

```bash
cd /Users/yifei/Downloads/AI-Business-Simulator-main/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.3 — Commit**

```bash
git add frontend/src/components/InfoLayersTab.tsx
git commit -m "feat: restructure basic layer by category with role dots and category edit selector"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Five categories defined: `company_background`, `decision_context`, `role_statement`, `visible_tension`, `public_numbers`
- ✅ LLM prompt assigns category in Step 2b
- ✅ `_parse_info_atoms` extracts and forces `""` for locked atoms
- ✅ PATCH endpoint accepts and stores `category`
- ✅ Frontend type updated
- ✅ Left column grouped by 5 categories instead of by role
- ✅ Role colour dot preserved on each `AtomCard`
- ✅ Category selector in edit modal for basic layer atoms
- ✅ Uncategorized bucket for atoms with missing/unknown category
- ✅ Moving locked→allowed sets `category: ""` (needs professor to recategorize)

**Type consistency across tasks:**
- `category: string` throughout (backend `InfoAtomItem`, `_parse_info_atoms` result, `ApiInfoAtom`, component state)
- `BASIC_CATEGORIES[n].key` is the string stored in `category` field — same values in prompt, parser, and UI filter

**No placeholders:** All steps include complete code.
