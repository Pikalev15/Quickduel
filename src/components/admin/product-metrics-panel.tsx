"use client";
import { useEffect, useState } from "react";
import type { ProductMetrics } from "@/lib/product-metrics";

const percent = (n: number | null) => n === null ? "N/A" : (n*100).toFixed(1)+"%";
const seconds = (n: number | null) => n === null ? "N/A" : (n/1000).toFixed(1)+"s";
const number = (n: number) => n.toLocaleString();
export function ProductMetricsPanel() {
  const [days,setDays] = useState(7);
  const [revision,setRevision] = useState(0);
  const [report,setReport] = useState<ProductMetrics | null>(null);
  const [error,setError] = useState<string | null>(null);
  useEffect(()=>{
    const controller = new AbortController();
    const timer = window.setTimeout(()=>{
      setReport(null); setError(null);
      void fetch(`/api/admin/product-metrics?days=${days}`,{cache:"no-store",signal:controller.signal})
        .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error?.message??"Report unavailable.");return body.data as ProductMetrics;})
        .then(data=>{if(!controller.signal.aborted)setReport(data);})
        .catch(caught=>{if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:"Report unavailable.");});
    },0);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[days,revision]);
  const peak = Math.max(1,...(report?.daily.map(d=>d.players)??[]));
  return <section className="admin-product-report">
    <div className="feature-section-heading"><div><h2>Product analytics</h2><p>Observed gameplay activity and recorded human matches. Dates use UTC.</p></div></div>
    <div className="qd-metrics-actions">
      <label>Reporting window <select value={days} onChange={event=>setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
      <button className="calm-secondary" type="button" onClick={()=>setRevision(v=>v+1)}>Refresh</button>
      <a href="https://vercel.com/pikalev15s-projects/quickduel/analytics" target="_blank" rel="noreferrer">Web Analytics</a>
      <a href="https://vercel.com/pikalev15s-projects/quickduel/speed-insights" target="_blank" rel="noreferrer">Speed Insights</a>
    </div>
    {error ? <p role="alert">{error}</p> : !report || report.days!==days ? <p role="status">Loading report…</p> : <>
      <dl className="qd-metrics-kpis">
        <div><dt>Active players</dt><dd>{number(report.players)}</dd><small>Identified players with gameplay events</small></div>
        <div><dt>Human matches</dt><dd>{number(report.matches.started)}</dd><small>Started in the selected period</small></div>
        <div><dt>Returning players</dt><dd>{percent(report.returning.rate)}</dd><small>{report.returning.count} observed on multiple days</small></div>
        <div><dt>Match completion</dt><dd>{percent(report.matches.completionRate)}</dd><small>Includes recorded forfeits; excludes pending matches</small></div>
      </dl>
      <h3>Daily active players</h3>
      <div className="qd-metrics-chart" role="group" aria-label="Daily active players chart">
        {report.daily.map(d=><div key={d.date} title={`${d.date}: ${d.players} players`}><span>{d.players}</span><i style={{height:`${Math.max(2,d.players/peak*100)}%`}}/><small>{d.date.slice(5)}</small></div>)}
      </div>
      <dl className="qd-metrics-kpis">
        <div><dt>Observed sessions</dt><dd>{number(report.sessions)}</dd></div>
        <div><dt>Day 1 retention</dt><dd>{percent(report.retention.day1.rate)}</dd><small>{report.retention.day1.returned}/{report.retention.day1.cohort} eligible</small></div>
        <div><dt>Day 7 retention</dt><dd>{percent(report.retention.day7.rate)}</dd><small>{report.retention.day7.returned}/{report.retention.day7.cohort} eligible</small></div>
        <div><dt>Placement completion</dt><dd>{percent(report.placements.completionRate)}</dd><small>{report.placements.placed}/{report.placements.started} accounts with ranked progress, all time</small></div>
        <div><dt>Median queue wait</dt><dd>{seconds(report.queue.medianMs)}</dd><small>{report.queue.matched} reported successful searches</small></div>
        <div><dt>95th percentile wait</dt><dd>{seconds(report.queue.p95Ms)}</dd></div>
        <div><dt>Queue cancellations</dt><dd>{report.queue.cancelled}</dd><small>{report.queue.joined} join events</small></div>
        <div><dt>Normal match completion</dt><dd>{percent(report.matches.normalRate)}</dd><small>{report.matches.other} other completed outcomes; {report.matches.pending} pending</small></div>
      </dl>
      <h3>Game popularity and abandonment</h3>
      <div className="qd-metrics-table"><table><thead><tr><th>Game</th><th>Human starts</th><th>Practice starts</th><th>Normal finishes</th><th>Abandoned</th><th>Abandonment</th></tr></thead><tbody>{report.games.map(g=><tr key={g.game}><th>{g.game.replaceAll("_"," ")}</th><td>{g.started}</td><td>{g.practice}</td><td>{g.normal}</td><td>{g.abandoned}</td><td>{percent(g.abandonmentRate)}</td></tr>)}</tbody></table>{report.games.length===0&&<p>No games recorded in this period.</p>}</div>
      <h3>Device breakdown</h3>
      <div className="qd-metrics-table"><table><thead><tr><th>Device</th><th>Players</th><th>Queue joins</th><th>Cancelled</th><th>Median wait</th><th>p95 wait</th></tr></thead><tbody>{report.devices.map(d=><tr key={d.device}><th>{d.device}</th><td>{d.players}</td><td>{d.joined}</td><td>{d.cancelled}</td><td>{seconds(d.medianMs)}</td><td>{seconds(d.p95Ms)}</td></tr>)}</tbody></table></div>
      <p className="qd-metrics-note">Retention uses the first observed gameplay day after a 30-day lookback, not account creation. Only cohorts with a full return-day window are included. Opt-outs, missing events and anonymous practice without a player ID reduce observed totals. Device counts may overlap. Use Speed Insights for browser responsiveness and load metrics.</p>
      <small>Report generated {new Date(report.asOf).toLocaleString()}</small>
    </>}
  </section>;
}
