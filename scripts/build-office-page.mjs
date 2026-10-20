// Builds .claude/skills/buero/seite/buero.html, the office as an Artifact
// page: the mod's own drawing and cloud code, compiled and inlined into
// seite/vorlage.html, so the page and the pane always draw the same office.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mod = join(root, '.claude/skills/buero')
const sources = ['model', 'cloud', 'post', 'auftraege', 'besprechung', 'art']
const out = mkdtempSync(join(tmpdir(), 'buero-page-'))

try {
  execFileSync('tsc', [
    '--outDir', out, '--rootDir', mod,
    '--module', 'es2022', '--target', 'es2022', '--lib', 'es2022', '--skipLibCheck',
    ...sources.map(name => join(mod, 'hooks', `${name}.ts`)),
  ], { stdio: 'inherit' })
  const library = sources
    .map(name => readFileSync(join(out, 'hooks', `${name}.js`), 'utf8'))
    .join('\n')
    .split('\n')
    .filter(line => !/^import\s/.test(line))
    .map(line => line.replace(/^export\s+/, ''))
    .join('\n    ')
  const template = readFileSync(join(mod, 'seite/vorlage.html'), 'utf8')
  if (!template.includes('/*__OFFICE_LIB__*/')) {
    throw new Error('vorlage.html has no /*__OFFICE_LIB__*/ marker')
  }
  const page = template.replace('/*__OFFICE_LIB__*/', () => library)
  writeFileSync(join(mod, 'seite/buero.html'), page)
  console.log(`wrote seite/buero.html (${page.length} characters)`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
