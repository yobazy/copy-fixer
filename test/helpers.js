import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = join(ROOT, 'skill', 'copyproof', 'scripts');
export const DEMO = join(ROOT, 'test', 'fixtures', 'demo-app');

/** A throwaway copy of the demo project, so tests can write to it. */
export function demoCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'copyproof-test-'));
  cpSync(DEMO, dir, { recursive: true });
  rmSync(join(dir, '.copyproof', 'feedback.json'), { force: true });
  rmSync(join(dir, '.copyproof', 'prompt.md'), { force: true });
  return dir;
}

/** Run one of the scripts and return { status, stdout, stderr }. */
export function run(script, args, opts = {}) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: 'utf8', ...opts });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Start serve.mjs on a free port. Resolves to { url, port, stop }. */
export function serve(project) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [join(SCRIPTS, 'serve.mjs'), project, '--port', String(port), '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((ok, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error(`serve did not start: ${out}`)), 5000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(timer);
        const p = Number(m[1]);
        ok({ url: `http://localhost:${p}`, port: p, stop: () => child.kill() });
      }
    });
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => fail(new Error(`serve exited ${code}: ${out}`)));
  });
}
