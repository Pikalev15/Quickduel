import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const violations = [];
const punctuation = /\u2014|&mdash;|&#8212;|&#x2014;|\\u2014/gi;
const filler = /\b(?:unlock your potential|elevate your experience|seamless experience|embark on a journey|take your skills to the next level|game-changing experience|unleash your potential)\b/gi;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.tsx$/.test(entry.name) && !/[/\\]games[/\\](catalog|registry|display)\.ts$/.test(path)) continue;
    if (/\.(test|spec)\./.test(entry.name)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const match of line.matchAll(punctuation)) violations.push(`${relative(root,path)}:${i+1}: prohibited punctuation ${match[0]}`);
      for (const match of line.matchAll(filler)) violations.push(`${relative(root,path)}:${i+1}: avoid promotional filler "${match[0]}"`);
    });
  }
}
scan(join(root, "src"));
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log("Copy checks passed.");
