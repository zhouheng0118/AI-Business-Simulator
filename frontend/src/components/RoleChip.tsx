"use client";

interface RoleChipProps {
  role: "professor" | "student";
  selected: boolean;
  onSelect: () => void;
}

const ROLES = {
  professor: {
    label: "Professor",
    description: "Manage cases and review analytics.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
          d="M14 3L26 9v2l-12 6L2 11V9L14 3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M2 11v8M8 13.5v5a6 6 0 0012 0v-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  student: {
    label: "Student",
    description: "Participate in analytical cases.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 24c0-5.523 4.477-10 10-10s10 4.477 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
};

export default function RoleChip({ role, selected, onSelect }: RoleChipProps) {
  const { label, description, icon } = ROLES[role];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex flex-col items-center gap-2 w-full px-6 py-6 rounded-lg border transition-all duration-150 text-left outline-none",
        selected
          ? "border-primary bg-white shadow-[0_0_0_3px_rgba(0,102,204,0.14)]"
          : "border-hairline bg-white hover:border-[#c7c7cc]",
      ].join(" ")}
      aria-pressed={selected}
    >
      <span className={selected ? "text-primary" : "text-ink-muted-48"}>
        {icon}
      </span>
      <span
        style={{ fontFamily: "SF Pro Display, system-ui, sans-serif", fontSize: "21px", fontWeight: 600, lineHeight: "1.19", letterSpacing: "0.231px" }}
        className={selected ? "text-ink" : "text-ink"}
      >
        {label}
      </span>
      <span
        style={{ fontFamily: "SF Pro Text, system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: "1.43", letterSpacing: "-0.224px" }}
        className="text-ink-muted-48 text-center"
      >
        {description}
      </span>
    </button>
  );
}
