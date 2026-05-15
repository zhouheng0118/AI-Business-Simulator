export default function Label({ children }: { children: React.ReactNode }) {
    return (
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
            {children}
        </label>
    );
}
