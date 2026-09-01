import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1
        className="font-semibold"
        style={{ fontSize: "var(--text-display)", letterSpacing: "var(--tracking-display)" }}
      >
        Earth Explorer
      </h1>
      <p style={{ color: "var(--fg-muted)" }}>
        Phase 0 in progress — the hero lands here after the visual system is approved.
      </p>
      <Link
        href="/styleguide"
        className="mt-4 rounded-full px-5 py-2 font-medium"
        style={{
          background: "var(--accent)",
          color: "var(--bg-a)",
          transition: "opacity var(--duration-fast) var(--ease-out)",
        }}
      >
        View the styleguide
      </Link>
    </main>
  );
}
