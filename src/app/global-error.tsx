"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#02050b", color: "#f2f5f8", fontFamily: "Georgia, serif" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "4rem 1rem" }}>
          <p style={{ letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 }}>Atlas</p>
          <h1 style={{ fontSize: 40, fontWeight: 400 }}>Atlas couldn&apos;t continue</h1>
          <p style={{ lineHeight: 1.6 }}>The page hit an unexpected error. Research in this tab was cleared.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, border: 0, borderRadius: 8, padding: "0.6rem 1rem", background: "#e7eef8", color: "#071018" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
