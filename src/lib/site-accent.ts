export const SITE_ACCENTS = [
  {id:"blue",label:"Periwinkle",swatch:"#b9c8fa"},
  {id:"mint",label:"Mint",swatch:"#b7e4ce"},
  {id:"rose",label:"Rose",swatch:"#f2c4d4"},
  {id:"lavender",label:"Lavender",swatch:"#dac8f2"},
  {id:"peach",label:"Peach",swatch:"#f5d1b0"},
] as const;
export type SiteAccent = typeof SITE_ACCENTS[number]["id"];
export function isSiteAccent(value: unknown): value is SiteAccent {
  return SITE_ACCENTS.some(accent => accent.id === value);
}
export const SITE_ACCENT_KEY = "quickduel:site-accent";
