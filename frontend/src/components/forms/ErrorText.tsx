export default function ErrorText({ children }: { children: React.ReactNode }) {
    return (
        <p
            style={{
                fontFamily: "SF Pro Text, system-ui, sans-serif",
                fontSize: "12px",
                fontWeight: 400,
                letterSpacing: "-0.12px",
                color: "#ff3b30",
            }}
        >
            {children}
        </p>
    );
}
