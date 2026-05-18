import Link from "next/link";

export default function AuthFooter() {
    return (
        <footer className="w-full mt-auto pt-10 pb-8 text-center">
            <p
                style={{
                    fontFamily: "SF Pro Text, system-ui, sans-serif",
                    fontSize: "12px",
                    fontWeight: 400,
                    lineHeight: "1.0",
                    letterSpacing: "-0.12px",
                    color: "#7a7a7a",
                }}
            >
                © 2026 AI Business Decision Simulation
                <span className="mx-2">·</span>
                <Link href="/privacy" style={{ color: "#7a7a7a" }} className="hover:text-ink hover:underline transition-colors">
                    Privacy Policy
                </Link>
                <span className="mx-2">·</span>
                <Link href="/terms" style={{ color: "#7a7a7a" }} className="hover:text-ink hover:underline transition-colors">
                    Terms of Service
                </Link>
            </p>
        </footer>
    );
}
