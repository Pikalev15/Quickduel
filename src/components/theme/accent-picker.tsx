"use client";
import { useTheme } from "./theme-provider";
import { SITE_ACCENTS } from "@/lib/site-accent";
export function AccentPicker() {
  const { accent, setAccent } = useTheme();
  return <fieldset className="qd-site-accent"><legend>Website accent</legend><p>Choose a colour for this device.</p><div className="qd-site-swatches">
    {SITE_ACCENTS.map(option=><button type="button" key={option.id} aria-label={option.label+" website accent"} aria-pressed={accent===option.id} onClick={()=>setAccent(option.id)}><span style={{background:option.swatch}} aria-hidden="true">{accent===option.id?"✓":""}</span><small>{option.label}</small></button>)}
  </div></fieldset>;
}
