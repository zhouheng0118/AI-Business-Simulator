"use client";

import { SbLabel, SbItem } from "./shared";

export interface NavItem {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
    danger?: boolean;
}

export interface NavSection {
    label: string;
    items: NavItem[];
}

interface DashboardLayoutProps {
    portalName: string;
    navSections: NavSection[];
    accountItems: NavItem[];
    headerLeft: React.ReactNode;
    headerRight: React.ReactNode;
    statsRow?: React.ReactNode;
    children: React.ReactNode;
}

export default function DashboardLayout({
    portalName,
    navSections,
    accountItems,
    headerLeft,
    headerRight,
    statsRow,
    children,
}: DashboardLayoutProps) {
    return (
        <div style={{ display: "flex", height: "100vh", background: "#f5f5f7", overflow: "hidden" }}>
            <aside style={{ width: 220, flexShrink: 0, background: "#ffffff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e0e0e0" }}>
                    <div style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px" }}>
                        AI Business Simulator
                    </div>
                    <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 3 }}>{portalName}</div>
                </div>

                <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {navSections.map((section) => (
                        <div key={section.label}>
                            <SbLabel>{section.label}</SbLabel>
                            {section.items.map((item) => (
                                <SbItem key={item.label} {...item} />
                            ))}
                        </div>
                    ))}
                </nav>

                <div style={{ borderTop: "1px solid #e0e0e0", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel>Account</SbLabel>
                    {accountItems.map((item) => (
                        <SbItem key={item.label} {...item} />
                    ))}
                </div>
            </aside>

            <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {headerLeft}
                    {headerRight}
                </div>

                {statsRow && (
                    <div style={{ padding: "20px 32px 0", display: "flex", gap: 12 }}>
                        {statsRow}
                    </div>
                )}

                <div style={{ padding: "20px 32px 32px", flex: 1 }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
