import React from "react";
import Label from "./Label";
import ErrorText from "./ErrorText";

export default function Field({
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
            <Label>{label}</Label>
            {children}
            {error && <ErrorText>{error}</ErrorText>}
        </div>
    );
}
