import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-parchment flex flex-col">
            <main className="flex-1 w-full max-w-[720px] mx-auto px-6 py-16">

                <Link
                    href="/login"
                    style={{ color: "#0066cc", fontSize: "14px", letterSpacing: "-0.224px" }}
                    className="hover:underline font-[SF_Pro_Text,system-ui,sans-serif]"
                >
                    ← Back
                </Link>

                <h1
                    className="mt-8 mb-2"
                    style={{
                        fontFamily: "SF Pro Display, system-ui, sans-serif",
                        fontSize: "40px",
                        fontWeight: 600,
                        lineHeight: "1.10",
                        letterSpacing: "0px",
                        color: "#1d1d1f",
                    }}
                >
                    Privacy Policy
                </h1>
                <p
                    className="mb-10"
                    style={{
                        fontFamily: "SF Pro Text, system-ui, sans-serif",
                        fontSize: "14px",
                        fontWeight: 400,
                        letterSpacing: "-0.224px",
                        color: "#7a7a7a",
                    }}
                >
                    Last updated: May 12, 2026
                </p>

                <div className="flex flex-col gap-8">
                    <Section title="1. Information We Collect">
                        <p>
                            We collect information you provide when you register for an account, including your full
                            name, academic email address, and role (Professor or Student). We also collect usage data
                            such as case interactions, interview sessions, evidence gathered, and submitted analyses
                            in order to generate performance reports.
                        </p>
                    </Section>

                    <Section title="2. How We Use Your Information">
                        <p>We use your information to:</p>
                        <ul>
                            <li>Provide and operate the AI Business Decision Simulation.</li>
                            <li>Generate personalized debrief reports and scoring based on your session activity.</li>
                            <li>Allow professors to review student performance and decision-making processes.</li>
                            <li>Improve simulation quality and platform reliability.</li>
                        </ul>
                    </Section>

                    <Section title="3. Data Sharing">
                        <p>
                            We do not sell your personal information. Session data and performance reports are shared
                            only with the professor who assigned the case. Aggregated, anonymized data may be used
                            for research and product improvement.
                        </p>
                    </Section>

                    <Section title="4. Data Retention">
                        <p>
                            Account data is retained for the duration of your enrollment or institutional license.
                            You may request deletion of your account and associated data at any time by contacting
                            your institution&apos;s administrator.
                        </p>
                    </Section>

                    <Section title="5. Security">
                        <p>
                            We use industry-standard encryption in transit (TLS) and at rest. Access to personal
                            data is restricted to authorized personnel only. However, no method of transmission
                            over the internet is 100% secure.
                        </p>
                    </Section>

                    <Section title="6. Contact">
                        <p>
                            For privacy-related inquiries, please contact your institution&apos;s platform
                            administrator or reach us at{" "}
                            <a href="mailto:privacy@example.com" style={{ color: "#0066cc" }} className="hover:underline">
                                privacy@example.com
                            </a>
                            .
                        </p>
                    </Section>
                </div>
            </main>

            <footer className="w-full pb-8 text-center">
                <p
                    style={{
                        fontFamily: "SF Pro Text, system-ui, sans-serif",
                        fontSize: "12px",
                        fontWeight: 400,
                        letterSpacing: "-0.12px",
                        color: "#7a7a7a",
                    }}
                >
                    © 2026 AI Business Decision Simulation
                </p>
            </footer>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h2
                className="mb-3"
                style={{
                    fontFamily: "SF Pro Display, system-ui, sans-serif",
                    fontSize: "21px",
                    fontWeight: 600,
                    lineHeight: "1.19",
                    letterSpacing: "0.231px",
                    color: "#1d1d1f",
                }}
            >
                {title}
            </h2>
            <div
                style={{
                    fontFamily: "SF Pro Text, system-ui, sans-serif",
                    fontSize: "17px",
                    fontWeight: 400,
                    lineHeight: "1.47",
                    letterSpacing: "-0.374px",
                    color: "#1d1d1f",
                }}
                className="flex flex-col gap-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1"
            >
                {children}
            </div>
        </div>
    );
}
