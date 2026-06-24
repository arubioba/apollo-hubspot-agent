import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const roots = ["src", "test", "scripts"];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return entry.name.endsWith(".js") ? [full] : [];
  }));
  return nested.flat();
}

const targets = (await Promise.all(roots.map(files))).flat();

for (const target of targets) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", target], { stdio: "inherit" });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${target}`)));
  });
}
