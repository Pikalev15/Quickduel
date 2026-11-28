"use client";
import {useEffect,useState} from "react";
import {recommendedPractice} from "@/games/match-rules";
import Link from "next/link";
import type {GameId} from "@/games/types";
export function PracticeRecommendation({game,seed}:{game:GameId;seed:string}){
 const [tier,setTier]=useState<"easy"|"standard"|"expert">("standard");
 useEffect(()=>{let active=true;void fetch("/api/profile",{cache:"no-store"}).then(async res=>{if(!res.ok)return;const body=await res.json();if(active&&typeof body.data?.rating==="number"&&typeof body.data?.matches_played==="number")setTier(recommendedPractice(body.data.rating,body.data.matches_played));}).catch(()=>{});return()=>{active=false;};},[]);
 return <div className="qd-recommended-practice"><p>Recommended: <strong>{tier[0].toUpperCase()+tier.slice(1)}</strong>. Based on your placed rank; override below.</p><Link className="calm-primary" href={`/match/practice?game=${game}&seed=${seed}&difficulty=${tier}`}>Play recommended</Link></div>;
}
