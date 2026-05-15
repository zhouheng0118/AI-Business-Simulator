"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RoleChip from "@/components/RoleChip";
import AuthFooter from "@/components/AuthFooter";
import ToggleEye from "@/components/ToggleEye";
import Field from "@/components/forms/Field";
import Label from "@/components/forms/Label";
import ErrorText from "@/components/forms/ErrorText";
import { registerUser } from "@/lib/auth";

type Role = "professor" | "student";

interface FormState {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: Role | null;
}

interface FormErrors {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
}

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState<FormState>({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: null,
    });
    const [errors, setErrors] = useState<FormErrors>({});
    const [showPassword, setShowPassword] = useState(false);

    function validate(): FormErrors {
        const e: FormErrors = {};
        if (!form.fullName.trim()) e.fullName = "Full name is required.";
        if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email address.";
        if (form.password.length < 8) e.password = "Password must be at least 8 characters.";
        if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match.";
        if (!form.role) e.role = "Please select a role.";
        return e;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;
        registerUser({
            fullName: form.fullName,
            email: form.email,
            password: form.password,
            role: form.role!,
        });
        router.push("/login");
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

                {/* Card */}
                <div className="w-full max-w-[580px] bg-canvas border border-hairline rounded-lg px-10 py-10">

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
                            Create Your Account
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
                            Join the AI Business Simulator platform.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                        {/* Full Name */}
                        <Field label="Full Name" error={errors.fullName}>
                            <input
                                type="text"
                                autoComplete="name"
                                placeholder="Jane Doe"
                                value={form.fullName}
                                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                                className="form-input"
                            />
                        </Field>

                        {/* Academic Email */}
                        <Field label="Academic Email" error={errors.email}>
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
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    className="form-input pr-12"
                                />
                                <ToggleEye show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                            </div>
                        </Field>

                        {/* Confirm Password */}
                        <Field label="Confirm Password" error={errors.confirmPassword}>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                    placeholder="Repeat your password"
                                    value={form.confirmPassword}
                                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                    className="form-input pr-12"
                                />
                                <ToggleEye show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                            </div>
                        </Field>

                        {/* Role Selection */}
                        <div className="flex flex-col gap-2">
                            <Label>Select Primary Role</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <RoleChip
                                    role="professor"
                                    selected={form.role === "professor"}
                                    onSelect={() => setForm({ ...form, role: "professor" })}
                                />
                                <RoleChip
                                    role="student"
                                    selected={form.role === "student"}
                                    onSelect={() => setForm({ ...form, role: "student" })}
                                />
                            </div>
                            {errors.role && <ErrorText>{errors.role}</ErrorText>}
                        </div>

                        <div className="mt-3">
                            <button type="submit" className="btn-primary w-full text-center">
                                Create Account
                            </button>
                        </div>

                        {/* Sign in link */}
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
                            Already have an account?{" "}
                            <Link href="/login" style={{ color: "#0066cc" }} className="hover:underline">
                                Sign in
                            </Link>
                        </p>
                    </form>
                </div>
            </div>

            <AuthFooter />
        </div>
    );
}


