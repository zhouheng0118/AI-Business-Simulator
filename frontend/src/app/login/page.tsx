"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthFooter from "@/components/AuthFooter";
import ToggleEye from "@/components/ToggleEye";
import Field from "@/components/forms/Field";
import { loginUser } from "@/lib/auth";

interface FormState {
    email: string;
    password: string;
}

interface FormErrors {
    email?: string;
    password?: string;
}

export default function LoginPage() {
    const router = useRouter();
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
        if (Object.keys(errs).length > 0) return;
        const user = loginUser(form.email, form.password);
        if (!user) {
            setErrors({ password: "Incorrect email or password." });
            return;
        }
        router.push(user.role === "professor" ? "/dashboard/professor" : "/dashboard/student");
    }

    return (
        <div className="min-h-screen bg-parchment flex flex-col items-center px-4">
            <div className="flex-1 flex flex-col items-center justify-center w-full py-16">

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

                <div className="w-full max-w-[480px] bg-canvas border border-hairline rounded-lg px-10 py-10">

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

                        {/* Demo hint */}
                        <div style={{
                            background: "#f5f5f7", borderRadius: 8, padding: "10px 14px",
                            fontSize: "12px", color: "#7a7a7a", lineHeight: 1.6,
                            fontFamily: "SF Pro Text, system-ui, sans-serif",
                        }}>
                            <strong style={{ color: "#1d1d1f" }}>Demo accounts</strong><br />
                            Professor: <code style={{ fontSize: 11 }}>professor@demo.com</code> / <code style={{ fontSize: 11 }}>demo1234</code><br />
                            Student: <code style={{ fontSize: 11 }}>student@demo.com</code> / <code style={{ fontSize: 11 }}>demo1234</code>
                        </div>
                    </form>
                </div>
            </div>

            <AuthFooter />
        </div>
    );
}


