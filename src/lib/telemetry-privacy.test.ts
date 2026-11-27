import { describe,expect,it } from "vitest";
import { publicTelemetryUrl } from "./telemetry-privacy";
describe("public telemetry URL",()=>{
  const base="https://quickduel.test";
  it("strips query and fragment",()=>expect(publicTelemetryUrl("/match/practice?seed=private#answer",base)).toBe(base+"/match/practice"));
  it("excludes sensitive and cross-origin paths",()=>{
    for(const path of ["/match/uuid","/duel/CODE","/share/code","/admin","/api/profile","https://outside.test/"])expect(publicTelemetryUrl(path,base)).toBeNull();
  });
});
