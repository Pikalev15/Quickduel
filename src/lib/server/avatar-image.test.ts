import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeAvatar, AVATAR_MAX_INPUT } from "./avatar-image";

describe("player avatar normalization", () => {
  it("converts a PNG into a bounded square WebP", async () => {
    const png = await sharp({create:{width:320,height:80,channels:3,background:"#ff8800"}}).png().toBuffer();
    const result = await normalizeAvatar(new Request("http://localhost",{method:"POST",headers:{"content-type":"image/png"},body:Uint8Array.from(png)}));
    expect(await sharp(result).metadata()).toMatchObject({format:"webp",width:192,height:192});
  });
  it("rejects forged images, unsupported formats and excessive input", async () => {
    for(const [type,body] of [["image/png",new Uint8Array([1,2,3])],["image/svg+xml",new Uint8Array([1,2,3])],["image/png",new Uint8Array(AVATAR_MAX_INPUT+1)]] as const) {
      await expect(normalizeAvatar(new Request("http://localhost",{method:"POST",headers:{"content-type":type},body}))).rejects.toThrow();
    }
  });
});
