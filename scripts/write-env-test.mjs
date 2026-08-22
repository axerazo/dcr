// scripts/write-env-test.mjs
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const MAP = {
  API_URL: 'VITE_SUPABASE_URL',
  ANON_KEY: 'VITE_SUPABASE_ANON_KEY',
  SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  DB_URL: 'SUPABASE_DB_URL',
}

const raw = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

const out = []
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
  if (m && MAP[m[1]]) out.push(`${MAP[m[1]]}="${m[2]}"`)
}

if (out.length !== 4) {
  console.error(`Expected 4 vars, got ${out.length}. Is the stack running?`)
  process.exit(1)
}

writeFileSync('.env.test', out.join('\n') + '\n')
console.log('.env.test written')