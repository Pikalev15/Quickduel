export default function Loading() {
  return (
    <main className="route-loading" aria-label="Loading QuickDuel" aria-busy="true">
      <div className="page-shell route-loading-head">
        <span className="loading-mark" />
        <span className="loading-line loading-line-short" />
      </div>
      <div className="page-shell route-loading-body">
        <span className="loading-line loading-line-kicker" />
        <span className="loading-line loading-line-title" />
        <span className="loading-line loading-line-title loading-line-title-short" />
        <span className="loading-line loading-line-copy" />
        <div className="loading-actions"><span /><span /></div>
      </div>
    </main>
  );
}
