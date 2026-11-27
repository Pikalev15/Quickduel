"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PublicProfile } from "@/types/database";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";
import { ProfileDrawer } from "./profile-drawer";

export function ProfileControl() {
  const [open,setOpen]=useState(false);
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<PublicProfile|null>(null);
  useEffect(()=>{
    let active=true;
    let unsubscribe:(()=>void)|undefined;
    let generation=0;
    async function refresh(sessionUser:User|null){
      const ticket=++generation;
      if(!active)return;
      setUser(sessionUser);
      setProfile(null);
      if(!sessionUser)return;
      try{
        const response=await fetch("/api/profile",{cache:"no-store"});
        const body=await response.json();
        if(active&&ticket===generation&&response.ok)setProfile(body.data);
      }catch{/* Profile remains unavailable. */}
    }
    void loadSupabaseBrowserClient().then(async client=>{
      if(!active||!client)return;
      const result=await client.auth.getSession();
      if(!active)return;
      void refresh(result.data.session?.user??null);
      const {data}=client.auth.onAuthStateChange((event,session)=>{
        if(event!=="INITIAL_SESSION")window.setTimeout(()=>void refresh(session?.user??null),0);
      });
      unsubscribe=()=>data.subscription.unsubscribe();
    }).catch(()=>{});
    return()=>{active=false;unsubscribe?.();};
  },[]);
  return <>
    <button type="button" className="profile-chip qd-profile-control" aria-label="Player profile" onClick={()=>setOpen(true)}><span data-profile-frame={profile?.equipped_cosmetics?.profile_frame ?? undefined} className={`accent-${profile?.accent_colour??"volt"}`}>{(profile?.display_name??"QD").slice(0,2).toUpperCase()}</span><b>Player profile</b></button>
    {open&&<ProfileDrawer key={`${profile?.id??user?.id??"guest"}:${profile?"profile":"initial"}`} open profile={profile} user={user} onClose={()=>setOpen(false)} onUpdated={setProfile} onSignedOut={()=>{setUser(null);setProfile(null);setOpen(false);}}/>}
  </>;
}
