export default function Loading() {
  return <main aria-busy="true" aria-label="載入頁面" className="mx-auto w-full max-w-6xl space-y-6 px-5 py-10"><p role="status">正在載入，請稍候…</p><div aria-hidden="true" className="motion-safe:animate-pulse"><div className="mb-6 h-12 w-2/3 rounded-xl bg-stone-200"/><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-56 rounded-xl bg-stone-200"/>)}</div></div></main>;
}
