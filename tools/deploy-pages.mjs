// Publishes dist/ to the gh-pages branch of origin (GitHub Pages serves that branch).
// Run through `npm run deploy`, which tests and builds first.
import { execSync } from "node:child_process";
import { mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });
const remote = execSync("git remote get-url origin").toString().trim();
const dir = mkdtempSync(join(tmpdir(), "ares-pages-"));
try {
  cpSync("dist", dir, { recursive: true });
  writeFileSync(join(dir, ".nojekyll"), ""); // serve files as-is
  run("git init -q -b gh-pages", dir);
  run("git add -A", dir);
  run('git -c user.name="ares-deploy" -c user.email="ares-deploy@users.noreply.github.com" commit -q -m "Deploy site"', dir);
  run(`git push -q -f ${remote} gh-pages`, dir);
  console.log("Published dist/ to gh-pages.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
