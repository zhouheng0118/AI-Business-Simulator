# AI Business Simulator

An AI-powered business simulation platform for business school education.

## What It Does

AI Business Simulator transforms existing course materials into interactive business decision simulations. Professors upload their cases, slides, assignments, and rubrics — the platform automatically generates a structured simulation where students must act as real managers rather than passive readers.

Instead of reading a complete case study and writing an analysis, students navigate incomplete information, interview AI stakeholders, uncover hidden data, and make business decisions under uncertainty.

## The Problem It Solves

Traditional case studies hand students a complete picture upfront. Real business decisions don't work that way — managers face conflicting information, partial data, competing stakeholder interests, and time pressure. This gap between classroom analysis and real decision-making is what AI Business Simulator is designed to close.

At the same time, generative AI has made it trivial to produce a polished case analysis in minutes. What AI cannot easily replicate is the *process* of a good decision: knowing which questions to ask, whose account to trust, which risks to weigh, and how to reason under uncertainty. This platform shifts assessment from the final report to the decision process itself.

## How It Works

**For professors:**
1. Upload existing course materials — case PDFs, slides, assignment prompts, financial data, grading rubrics.
2. The system's orchestrating Agent parses the materials and generates a simulation playbook: student role, company background, task objective, stakeholder agents, hidden information, evidence points, and scoring rubric.
3. The professor reviews and confirms the generated setup before students begin.

**For students:**
1. Enter the simulation and read the initial company background and task.
2. Choose which AI stakeholder agents to interview — CEO, CFO, Operations Manager, Local Market Expert, Customer Representative.
3. Ask questions in natural language. A master Agent controls information release: each stakeholder answers only within their role and knowledge boundary, and some critical information only surfaces when students ask the right questions.
4. A Student Assistant tracks an Evidence Board — logging what has been discovered, from which source, and what risks it implies.
5. When enough evidence is gathered, submit a final decision memo responding to the case questions with supporting evidence, risk assessment, and reflection.
6. Receive a personalized debrief report scored against the professor's rubric, covering what evidence was used, what was overlooked, and how the reasoning process held up.

## Core Agents (MVP)

| Agent | Role | Key tension |
|---|---|---|
| CEO | Growth-focused executive | May downplay execution costs and local complexity |
| CFO | Financial gatekeeper | Holds critical cash runway data; conservative on high-cost expansion |
| Operations Manager | Execution realist | Surfaces underestimated supply chain and staffing challenges |
| Local Market Expert | On-the-ground partner | Knows real rent and consumer preference gaps; has own incentives |
| Customer Representative | Target user voice | Reveals price sensitivity and taste preference differences |

## Educational Value

- Trains **information gathering** — students decide who to ask and what to ask
- Trains **evidence-based reasoning** — decisions must be supported by what was actually discovered
- Trains **stakeholder analysis** — different agents have different interests and biases
- Trains **risk identification** — critical risks are hidden until students probe for them
- Makes AI-generated submissions difficult — the platform evaluates the process, not just the output

## Who It's For

- **Professors** teaching strategy, marketing, operations, entrepreneurship, or capstone courses who want active learning without redesigning their curriculum
- **Students** preparing for consulting, product management, or strategy roles who want to practice real decision-making
- **MBA programs and career centers** looking for scalable, AI-integrated business decision training

---

*This project is currently in the proposal and early prototype stage.*
