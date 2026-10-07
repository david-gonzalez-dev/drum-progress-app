// Builds the web app as a static bundle for the iPhone app (Capacitor), WITHOUT touching the normal website build.
//   node scripts/build-ios.mjs [--sync]
// It copies the project into .ios-build/, leaves out what only works on the website's server (API routes,
// middleware, the legal pages -- the app links to the live site for those), turns on static export, builds,
// and puts the result in ios-www/ (Capacitor's "webDir"). --sync then copies it into the native iOS project.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const work = path.join(root, ".ios-build");
const webUrl = process.env.IOS_WEB_URL ?? "https://drum-progress-app.vercel.app";
const skip = ["src/app/api", "src/middleware.ts", "src/app/privacy", "src/app/terms", "src/app/support", "src/app/legal-shell.tsx"].map((p) => path.join(root, p));

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
cpSync(path.join(root, "src"), path.join(work, "src"), { recursive: true, filter: (p) => !skip.includes(p) });
cpSync(path.join(root, "public"), path.join(work, "public"), { recursive: true });
for (const f of ["package.json", "tsconfig.json"]) cpSync(path.join(root, f), path.join(work, f));

// static export can't read request headers, so drop the CSP-nonce header read from the layout
const layoutPath = path.join(work, "src/app/layout.tsx");
let layout = readFileSync(layoutPath, "utf8");
layout = layout.replace('import { headers } from "next/headers";\n', "").replace("  await headers();\n", "");
writeFileSync(layoutPath, layout);

writeFileSync(path.join(work, "next.config.mjs"), 'export default { output: "export", images: { unoptimized: true } };\n');

// only public (NEXT_PUBLIC_*) values go into the app bundle; never the server-only keys
const env = readFileSync(path.join(root, ".env.local"), "utf8").split("\n").filter((l) => l.startsWith("NEXT_PUBLIC_"));
env.push(`NEXT_PUBLIC_WEB_URL=${webUrl}`, "NEXT_PUBLIC_NATIVE=1");
writeFileSync(path.join(work, ".env.production"), env.join("\n") + "\n");

const build = spawnSync("npx", ["next", "build"], { cwd: work, stdio: "inherit" });
if (build.status !== 0) { console.error("iOS web build failed"); process.exit(build.status ?? 1); }

rmSync(path.join(root, "ios-www"), { recursive: true, force: true });
cpSync(path.join(work, "out"), path.join(root, "ios-www"), { recursive: true });
console.log("ios-www ready");

if (process.argv.includes("--sync")) {
  const sync = spawnSync("npx", ["cap", "sync", "ios"], { cwd: root, stdio: "inherit", env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? "/Applications/Xcode.app/Contents/Developer" } });
  process.exit(sync.status ?? 0);
}
