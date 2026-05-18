"use client";

import { useState } from "react";
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
    accentColor?: string; // Optional accent color for the section
}

interface DashboardLayoutProps {
    portalName: string;
    navSections: NavSection[];
    accountItems: NavItem[];
    headerLeft: React.ReactNode;
    headerRight: React.ReactNode;
    statsRow?: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties; // Optional custom styles
}

export default function DashboardLayout({
    portalName,
    navSections,
    accountItems,
    headerLeft,
    headerRight,
    statsRow,
    children,
    style,
}: DashboardLayoutProps) {
    const [sidebarWide, setSidebarWide] = useState(false);
    const compact = !sidebarWide;

    return (
        <div style={{ display: "flex", height: "100vh", background: "#f5f5f7", overflow: "hidden" }}>
            <aside
                onMouseEnter={() => setSidebarWide(true)}
                onMouseLeave={() => setSidebarWide(false)}
                style={{
                    width: sidebarWide ? 260 : 56,
                    flexShrink: 0,
                    background: "#ffffff",
                    borderRight: "1px solid #e0e0e0",
                    display: "flex",
                    flexDirection: "column",
                    transition: "width 0.22s ease",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        padding: sidebarWide ? "20px 20px 16px" : "14px 10px 12px",
                        borderBottom: "1px solid #e0e0e0",
                        minHeight: sidebarWide ? undefined : 52,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                    }}
                >
                    {sidebarWide ? (
                        <>
                            <div style={{ fontFamily: "SF Pro Display, system-ui", fontSize: 14, fontWeight: 600, color: "#1d1d1f", letterSpacing: "-0.14px", whiteSpace: "nowrap" }}>
                                AI Business Decision Simulation
                            </div>
                            <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 3, whiteSpace: "nowrap" }}>{portalName}</div>
                        </>
                    ) : (
                        <div
                            style={{
                                fontFamily: "SF Pro Display, system-ui",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#0066cc",
                                letterSpacing: "-0.2px",
                                textAlign: "center",
                                lineHeight: 1.2,
                            }}
                            title={`AI Business Decision Simulation — ${portalName}`}
                        >
                            AI
                        </div>
                    )}
                </div>

                <nav style={{ flex: 1, padding: sidebarWide ? "10px 8px" : "10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {navSections.map((section) => (
                        <div key={section.label}>
                            <SbLabel hidden={compact}>{section.label}</SbLabel>
                            {section.items.map((item) => (
                                <SbItem key={item.label} {...item} compact={compact} />
                            ))}
                        </div>
                    ))}
                </nav>

                <div style={{ borderTop: "1px solid #e0e0e0", padding: sidebarWide ? "10px 8px" : "10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <SbLabel hidden={compact}>Account</SbLabel>
                    {accountItems.map((item) => (
                        <SbItem key={item.label} {...item} compact={compact} />
                    ))}
                </div>
            </aside>

            <main
                style={{
                    flex: 1,
                    minWidth: 0,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    ...(style || {}), // Apply custom styles if provided
                }}
            >
                <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#ffffff", borderBottom: "1px solid #e0e0e0", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {headerLeft}
                    {headerRight}
                </div>

                {statsRow && (
                    <div
                        style={{
                            padding: "10px 32px 0",
                            width: "100%",
                            boxSizing: "border-box",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            alignItems: "stretch",
                        }}
                    >
                        {statsRow}
                    </div>
                )}

                <div style={{ padding: "16px 32px 32px", flex: 1 }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
