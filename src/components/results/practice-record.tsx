"use client";
import {useEffect,useRef,useState} from "react";
import {masteryLevel,updatePracticeRecord,type PracticeRecord} from "@/games/personal-records";
export function PracticeRecordNotice({recordKey,score,accuracy,timeMs,summary}:{recordKey:string;score:number;accuracy:number;timeMs:number;summary:string}){
 const handled=useRef(false);
 const [result,setResult]=useState<{improved:boolean;record:PracticeRecord}|null>(null);
 useEffect(()=>{if(handled.current||score<=-999999)return;handled.current=true;
 const timer=window.setTimeout(()=>{
 try{const key="quickduel:practice-record:v1:"+recordKey;
 const old=JSON.parse(localStorage.getItem(key)??"null") as PracticeRecord|null;
 const next=updatePracticeRecord(old,{score,accuracy,timeMs,summary});localStorage.setItem(key,JSON.stringify(next.record));setResult(next);
 }catch{/* Local storage unavailable. */}
 },0);return()=>{window.clearTimeout(timer);handled.current=false;};
 },[recordKey,score,accuracy,timeMs,summary]);
 if(!result)return null;
 const r=result.record,average=r.recentAccuracy.reduce((a,b)=>a+b,0)/Math.max(1,r.recentAccuracy.length);
 return <div className="qd-personal-record" role="status" data-record={result.improved}><strong>{result.improved?"New practice personal best":"Practice personal best"}</strong><span>{r.summary}</span><small>{masteryLevel(average,r.recentAccuracy.length)} · {Math.round(average*100)}% recent accuracy · {r.attempts} attempts on this device, same settings</small></div>;
}
