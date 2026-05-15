"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default function RootPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getCurrentUser();
        if (!user) {
            router.replace("/login");
        } else if (user.role === "professor") {
            router.replace("/dashboard/professor");
        } else {
            router.replace("/dashboard/student");
        }
    }, [router]);

    return null;
}
