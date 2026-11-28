import sharp from "sharp";

export const AVATAR_MAX_INPUT = 2 * 1024 * 1024;
export const AVATAR_MAX_OUTPUT = 48 * 1024;
export const AVATAR_TYPES = new Set(["image/png","image/jpeg","image/webp"]);

export async function normalizeAvatar(request: Request): Promise<Buffer> {
  if (!AVATAR_TYPES.has(request.headers.get("content-type") ?? "")) throw new Error("Unsupported image type");
  if (Number(request.headers.get("content-length")) > AVATAR_MAX_INPUT || !request.body) throw new Error("Invalid image size");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AVATAR_MAX_INPUT) { await reader.cancel(); throw new Error("Image too large"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const image = sharp(Buffer.concat(parts), {limitInputPixels: 16_000_000, failOn: "error"});
  const metadata = await image.metadata();
  if (!["png","jpeg","webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
  const output = await image.rotate().resize(192,192,{fit:"cover",position:"centre"}).webp({quality:80}).toBuffer();
  if (output.length > AVATAR_MAX_OUTPUT) throw new Error("Image too complex");
  return output;
}
