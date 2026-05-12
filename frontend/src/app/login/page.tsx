"use client";

import { useState } from "react";
import Link from "next/link";

interface FormState {
    email: string;
    password: string;
}

interface FormErrors {
    email?: string;
    password?: string;
}

export default function LoginPage() {
    const [form, setForm] = useState<FormState>({ email: "", password: "" });
    const [errors, setErrors] = useState<FormErrors>({});
    const [showPassword, setShowPassword] = useState(false);

    function validate(): FormErrors {
        const e: FormErrors = {};
        if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email address.";
        if (!form.password) e.password = "Password is required.";
        return e;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length === 0) {
            // TODO: call login API
            console.log("login", form);
        }
    }

    return (
        <div className="min-h-screen bg-parchment flex flex-col items-center justify-center px-4 py-16">
            {/* Logo */}
            <div className="mb-10 text-center">
                <span
                    style={{
                        fontFamily: "SF Pro Display, system-ui, sans-serif",
                        fontSize: "28px",
                        fontWeight: 600,
                        letterSpacing: "-0.28px",
                        color: "#1d1d1f",
                    }}
                >
                    AI Business Simulator
                </span>
            </div>

            {/* Card */}
            <div className="w-full max-w-[480px] bg-canvas border border-hairline rounded-lg px-10 py-10">

                {/* Heading */}
                <div className="mb-8 text-center">
                    <h1
                        style={{
                            fontFamily: "SF Pro Display, system-ui, sans-serif",
                            fontSize: "34px",
                            fontWeight: 600,
                            lineHeight: "1.47",
                            letterSpacing: "-0.374px",
                            color: "#1d1d1f",
                        }}
                    >
                        Sign In
                    </h1>
                    <p
                        style={{
                            fontFamily: "SF Pro Text, system-ui, sans-serif",
                            fontSize: "17px",
                            fontWeight: 400,
                            lineHeight: "1.47",
                            letterSpacing: "-0.374px",
                            color: "#7a7a7a",
                            marginTop: "6px",
                        }}
                    >
                        Welcome back.
                    </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                    {/* Email */}
                    <Field label="Email" error={errors.email}>
                        <input
                            type="email"
                            autoComplete="email"
                            placeholder="jane.doe@university.edu"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="form-input"
                        />
                    </Field>

                    {/* Password */}
                    <Field label="Password" error={errors.password}>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder="Your password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                className="form-input pr-12"
                            />
                            <ToggleEye show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                        </div>
                    </Field>

                    {/* Submit */}
                    <div className="mt-3">
                        <button type="submit" className="btn-primary w-full text-center">
                            Sign In
                        </button>
                    </div>

                    {/* Register link */}
                    <p
                        className="text-center"
                        style={{
                            fontFamily: "SF Pro Text, system-ui, sans-serif",
                            fontSize: "14px",
                            fontWeight: 400,
                            letterSpacing: "-0.224px",
                            color: "#7a7a7a",
                        }}
                    >
                        Don&apos;t have an account?{" "}
                        <Link href="/register" style={{ color: "#0066cc" }} className="hover:underline">
                            Create one
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-[6px]">
            <label
                style={{
                    fontFamily: "SF Pro Text, system-ui, sans-serif",
                    fontSize: "14px",
                    fontWeight: 600,
                    lineHeight: "1.29",
                    letterSpacing: "-0.224px",
                    color: "#1d1d1f",
                }}
            >
                {label}
            </label>
            {children}
            {error && (
                <p
                    style={{
                        fontFamily: "SF Pro Text, system-ui, sans-serif",
                        fontSize: "12px",
                        fontWeight: 400,
                        letterSpacing: "-0.12px",
                        color: "#ff3b30",
                    }}
                >
                    {error}
                </p>
            )}
        </div>
    );
}

function ToggleEye({ show, onToggle }: { show: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted-48 hover:text-ink transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
        >
            {show ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
            )}
        </button>
    );
}