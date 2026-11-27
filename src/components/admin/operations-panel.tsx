"use client";
import {useEffect,useState} from "react";

type Player={display_name:string;public_code:string;rating:number;matches_played:number;wins:number;losses:number;draws:number;account_state:string;created_at:string;last_active_at:string|null};
type Match={id:string;game_type:string;status:string;source:string;ranked:boolean;completion_reason:string|null;created_at:string;completed_at:string|null;invalidated_at:string|null};
type Report={asOf:string;counts:Record<string,number|null>;players:Player[]|null;matches:Match[]|null};
const date=(value:string|null)=>value?new Date(value).toLocaleString():"N/A";
export function OperationsPanel(){
 const [report,setReport]=useState<Report|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const [filter,setFilter]=useState("");
 const [tab,setTab]=useState<"players"|"matches">("players");
 useEffect(()=>{
   const controller=new AbortController();
   const timer=window.setTimeout(()=>{
     setError(null);
     void fetch("/api/admin/operations",{cache:"no-store",signal:controller.signal}).then(async response=>{
       const body=await response.json();if(!response.ok)throw new Error(body.error?.message??"Operations report unavailable.");return body.data as Report;
     }).then(data=>{if(!controller.signal.aborted)setReport(data);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Operations report unavailable.");});
   },0);
   return()=>{clearTimeout(timer);controller.abort();};
 },[revision]);
 const query=filter.trim().toLowerCase();
 const players=report?.players?.filter(p=>[p.display_name,p.public_code,p.account_state].some(v=>v?.toLowerCase().includes(query)));
 const matches=report?.matches?.filter(m=>[m.id,m.game_type,m.status,m.source,m.completion_reason].some(v=>v?.toLowerCase().includes(query)));
 return <section className="admin-product-report"><div className="feature-section-heading"><div><h2>Operations</h2><p>Account growth, competitive activity, social requests and recent records.</p></div><button className="calm-secondary" onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
 {error&&<p role="alert">{error}</p>}
 {!report?<p>Loading operations…</p>:<>
 <dl className="qd-metrics-kpis">{Object.entries(report.counts).map(([label,n])=><div key={label}><dt>{label}</dt><dd>{n===null?"N/A":n.toLocaleString()}</dd></div>)}</dl>
 <div className="qd-metrics-actions"><button className="calm-secondary" aria-pressed={tab==="players"} onClick={()=>setTab("players")}>Recent players</button><button className="calm-secondary" aria-pressed={tab==="matches"} onClick={()=>setTab("matches")}>Recent matches</button><label>Filter<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Name, code, game or status"/></label></div>
 <div className="qd-metrics-table">{tab==="players"?players?<table><thead><tr><th>Player</th><th>Rating</th><th>Ranked played</th><th>W / L / D</th><th>State</th><th>Created</th><th>Last active</th></tr></thead><tbody>{players.map(p=><tr key={p.public_code}><th>{p.display_name}#{p.public_code}</th><td>{p.rating}</td><td>{p.matches_played}</td><td>{p.wins} / {p.losses} / {p.draws}</td><td>{p.account_state}</td><td>{date(p.created_at)}</td><td>{date(p.last_active_at)}</td></tr>)}</tbody></table>:<p>Player report unavailable.</p>:matches?<table><thead><tr><th>Match ID</th><th>Game</th><th>State</th><th>Source</th><th>Ranked</th><th>Outcome</th><th>Created</th><th>Completed</th></tr></thead><tbody>{matches.map(m=><tr key={m.id}><td>{m.id}</td><th>{m.game_type.replaceAll("_"," ")}</th><td>{m.invalidated_at?"Invalidated":m.status}</td><td>{m.source}</td><td>{m.ranked?"Yes":"No"}</td><td>{m.completion_reason??"N/A"}</td><td>{date(m.created_at)}</td><td>{date(m.completed_at)}</td></tr>)}</tbody></table>:<p>Match report unavailable.</p>}</div>
 <small>Latest 50 players or matches. Counts are current as of {date(report.asOf)}; N/A indicates an unavailable query. Private messages, email addresses and challenge answers are excluded.</small>
 </>}
 </section>;
}
