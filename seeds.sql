-- CaseIQ — Demo Seed Data
-- Run this AFTER schema.sql to populate the database with a demo case.
-- Safe to re-run: deletes existing data first.

-- ─────────────────────────────────────────
-- Clear existing data (cascade handles child tables)
-- ─────────────────────────────────────────
DELETE FROM reports;
DELETE FROM submissions;
DELETE FROM messages;
DELETE FROM sessions;
DELETE FROM case_assignments;
DELETE FROM playbooks;
DELETE FROM cases;

-- ─────────────────────────────────────────
-- Demo case: Spotify India Market Entry
-- ─────────────────────────────────────────
INSERT INTO cases (
  id,
  title,
  description,
  raw_content,
  file_type,
  teaching_goals,
  case_type,
  difficulty,
  status
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Spotify Market Entry: India Expansion Strategy',
  'Spotify is evaluating its expansion strategy in India, the world''s second-largest smartphone market. The team must assess pricing strategy, competitive threats, and partnership opportunities to achieve profitability within 3 years.',
  'Spotify launched in India in 2019 with a freemium model. Current user base: 8M monthly active users, but only 3% are paying subscribers. Local competitors JioSaavn and Gaana together hold 65% market share and offer free ad-supported streaming. Spotify''s average revenue per user (ARPU) in India is $0.60 vs $5.20 globally. Licensing costs consume 78% of India revenue. Reliance Jio is offering bundled music streaming at no extra cost to its 450M subscribers. Artist royalty disputes have delayed 12% of Bollywood catalog. Mobile data costs have dropped 95% since 2016, driving audio consumption up 300%. A potential partnership with a major telecom operator could add 20M users but requires revenue sharing of 40%.',
  'text',
  ARRAY['Market Entry', 'Pricing Strategy', 'Competitive Analysis', 'Financial Analysis'],
  'decision',
  'hard',
  'published'
);

-- ─────────────────────────────────────────
-- Demo playbook for the Spotify case
-- ─────────────────────────────────────────
INSERT INTO playbooks (
  id,
  case_id,
  version,
  roles,
  info_atoms,
  questions,
  review_status,
  published_at
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  1,
  '[
    {
      "name": "CEO",
      "title": "Chief Executive Officer",
      "persona": "Visionary, growth-focused, optimistic about India''s long-term potential",
      "focus_area": "Strategic vision & growth pressure",
      "allowed_info": [
        "Spotify entered India in 2019 with a freemium model",
        "8M monthly active users, 3% conversion to paid",
        "Long-term goal: profitability within 3 years",
        "Telecom partnership talks are ongoing"
      ],
      "locked_info": [
        "Internal debate about exiting the India market if losses exceed $50M",
        "Board pressure to show profitability by Q4 next year"
      ],
      "unlock_conditions": "Student must ask about strategic options including exit, AND must have already interviewed CFO"
    },
    {
      "name": "CFO",
      "title": "Chief Financial Officer",
      "persona": "Cautious, data-driven, focused on unit economics",
      "focus_area": "Cash flow & financial risk",
      "allowed_info": [
        "ARPU in India: $0.60 vs $5.20 globally",
        "Licensing costs consume 78% of India revenue",
        "Telecom partnership requires 40% revenue sharing"
      ],
      "locked_info": [
        "Current India operation loses $18M annually",
        "Break-even requires 15% paid subscriber conversion"
      ],
      "unlock_conditions": "Student must ask specifically about profitability targets or loss figures"
    },
    {
      "name": "Head of Operations",
      "title": "Head of Operations",
      "persona": "Pragmatic, execution-focused, highlights on-the-ground challenges",
      "focus_area": "Supply chain & execution difficulty",
      "allowed_info": [
        "12% of Bollywood catalog delayed due to royalty disputes",
        "Mobile data costs dropped 95% since 2016, driving 300% audio consumption growth",
        "Local team of 45 people in Mumbai and Bangalore"
      ],
      "locked_info": [
        "Two key Bollywood label negotiations have stalled for 8 months",
        "Engineering team turnover rate in India is 35% annually"
      ],
      "unlock_conditions": "Student must ask about content library gaps or operational challenges"
    },
    {
      "name": "Customer Rep",
      "title": "Target Market Customer",
      "persona": "Price-sensitive, uses multiple free streaming apps simultaneously",
      "focus_area": "Consumer preferences & price sensitivity",
      "allowed_info": [
        "JioSaavn and Gaana together hold 65% market share with free tiers",
        "Jio bundles free music streaming for its 450M subscribers",
        "Most users unwilling to pay more than ₹50/month (~$0.60)"
      ],
      "locked_info": [
        "Podcast content is emerging as a differentiator that price-sensitive users would pay for"
      ],
      "unlock_conditions": "Student must ask about what would make them switch from free alternatives"
    },
    {
      "name": "Local Expert",
      "title": "Market Consultant",
      "persona": "Well-connected, nuanced view of India''s regional diversity",
      "focus_area": "Local market & regulatory landscape",
      "allowed_info": [
        "Regional language content (Tamil, Telugu, Punjabi) is under-served by competitors",
        "UPI payments make micro-subscriptions (₹10/week) technically feasible",
        "Tier-2 and Tier-3 cities represent 60% of new smartphone users"
      ],
      "locked_info": [
        "New data localisation regulation under consideration could require local servers, adding $8M capex"
      ],
      "unlock_conditions": "Student must ask about regulatory environment or government policy"
    }
  ]',
  '[
    {"fact": "ARPU in India is $0.60 vs $5.20 globally", "owner_roles": ["CFO"], "access": "allowed"},
    {"fact": "Licensing costs consume 78% of India revenue", "owner_roles": ["CFO"], "access": "allowed"},
    {"fact": "Current India operation loses $18M annually", "owner_roles": ["CFO"], "access": "locked", "unlock_condition": "Student asks about profitability or loss figures"},
    {"fact": "Break-even requires 15% paid conversion", "owner_roles": ["CFO"], "access": "locked", "unlock_condition": "Student asks about profitability targets"},
    {"fact": "12% Bollywood catalog delayed due to royalty disputes", "owner_roles": ["Head of Operations"], "access": "allowed"},
    {"fact": "Two Bollywood label negotiations stalled 8 months", "owner_roles": ["Head of Operations"], "access": "locked", "unlock_condition": "Student asks about content library gaps"},
    {"fact": "JioSaavn and Gaana hold 65% market share", "owner_roles": ["Customer Rep"], "access": "allowed"},
    {"fact": "Podcast content emerging as paid differentiator", "owner_roles": ["Customer Rep"], "access": "locked", "unlock_condition": "Student asks what would make users switch from free alternatives"},
    {"fact": "Regional language content is under-served", "owner_roles": ["Local Expert"], "access": "allowed"},
    {"fact": "New data localisation regulation could add $8M capex", "owner_roles": ["Local Expert"], "access": "locked", "unlock_condition": "Student asks about regulatory environment"}
  ]',
  '[
    {
      "id": "q1",
      "type": "decision",
      "text": "Should Spotify continue investing in India or exit the market? If staying, which market entry/expansion strategy should they pursue?",
      "rubric_dimensions": [
        {"name": "Decision clarity", "weight": 30},
        {"name": "Evidence use", "weight": 30},
        {"name": "Risk awareness", "weight": 20},
        {"name": "Alternatives considered", "weight": 20}
      ]
    },
    {
      "id": "q2",
      "type": "analysis",
      "text": "Analyse the financial viability of the proposed telecom partnership (40% revenue share, +20M users).",
      "rubric_dimensions": [
        {"name": "Quantitative reasoning", "weight": 40},
        {"name": "Assumption clarity", "weight": 30},
        {"name": "Competitive context", "weight": 30}
      ]
    },
    {
      "id": "q3",
      "type": "reflection",
      "text": "Reflect on your investigation process: what information did you prioritise, what did you miss, and how would you approach this case differently?",
      "rubric_dimensions": [
        {"name": "Self-awareness", "weight": 40},
        {"name": "Learning articulation", "weight": 30},
        {"name": "Actionable insight", "weight": 30}
      ]
    }
  ]',
  'approved',
  now()
);
