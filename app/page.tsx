export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0b1220 0%, #111827 50%, #030712 100%)',
        color: '#e5e7eb',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '72px 24px 56px' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: '#bae6fd',
            background: 'rgba(14, 165, 233, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 999,
            padding: '8px 12px',
          }}
        >
          New website build
        </span>

        <h1 style={{ marginTop: 20, fontSize: 'clamp(2rem, 5vw, 4rem)', lineHeight: 1.08, color: '#fff' }}>
          Launch a polished website in record time.
        </h1>
        <p style={{ marginTop: 18, maxWidth: 720, fontSize: 18, color: '#cbd5e1', lineHeight: 1.6 }}>
          This starter homepage is built with Next.js and designed to be customized quickly for your product,
          portfolio, or agency.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
          <button
            style={{
              background: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              padding: '12px 18px',
              cursor: 'pointer',
            }}
          >
            Get Started
          </button>
          <button
            style={{
              background: 'transparent',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: 12,
              fontWeight: 600,
              padding: '12px 18px',
              cursor: 'pointer',
            }}
          >
            View Demo
          </button>
        </div>
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px 72px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {[
            { title: 'Beautiful and responsive', text: 'Looks great on mobile, tablet, and desktop screens.' },
            { title: 'Conversion-friendly', text: 'Clear headings and CTAs that guide visitors to action.' },
            { title: 'Easy to extend', text: 'Add new pages, CMS data, forms, and integrations as you grow.' },
          ].map((item) => (
            <article
              key={item.title}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid #1e293b',
                borderRadius: 18,
                padding: 20,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, color: '#fff' }}>{item.title}</h2>
              <p style={{ marginTop: 12, color: '#cbd5e1', lineHeight: 1.55 }}>{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
