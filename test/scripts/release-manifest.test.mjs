import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  releaseArtifactNames,
  verifyReleaseChecksums,
  writeReleaseChecksums
} from '../../scripts/release-manifest.mjs'

const version = '0.1.3'

async function withReleaseFiles(run) {
  const dist = await mkdtemp(path.join(tmpdir(), 'saf0o-release-manifest-'))
  try {
    for (const artifact of releaseArtifactNames(version, { includeMacos: true, includeWindows: true })) {
      await writeFile(path.join(dist, artifact), `fixture:${artifact}`)
    }
    await run(dist)
  } finally {
    await rm(dist, { recursive: true, force: true })
  }
}

test('rejects missing, unexpected, repeated, and modified checksum entries', async () => {
  await withReleaseFiles(async (dist) => {
    const options = { dist, version, includeMacos: true, includeWindows: true }
    await writeReleaseChecksums(options)
    const manifestPath = path.join(dist, 'SHA256SUMS')
    const original = await readFile(manifestPath, 'utf8')

    await writeFile(manifestPath, original.replace(/^[^\n]+\n/, ''))
    await assert.rejects(verifyReleaseChecksums(options), /unexpected entry count/)

    const [first] = original.trim().split('\n')
    await writeFile(manifestPath, `${first}\n${first}\n${first}\n${first}\n${first}\n${first}\n`)
    await assert.rejects(verifyReleaseChecksums(options), /repeats artifact/)

    await writeFile(manifestPath, original.replace('Saf0o-0.1.3.AppImage', 'unexpected.exe'))
    await assert.rejects(verifyReleaseChecksums(options), /unexpected artifact/)

    await writeFile(manifestPath, original)
    await writeFile(path.join(dist, 'Saf0o-0.1.3.AppImage'), 'modified')
    await assert.rejects(verifyReleaseChecksums(options), /Checksum mismatch/)
  })
})

// The npm-to-pnpm switch left the draft-release job calling pnpm without installing it, so 0.1.13 failed at the last step.
test('every workflow job that runs pnpm installs it first', async () => {
  const dir = '.github/workflows'
  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.yml'))) {
    const jobs = (await readFile(path.join(dir, file), 'utf8')).split(/\n(?= {2}[\w-]+:\n)/).slice(1)
    for (const job of jobs) {
      if (/^\s+(- )?(run: )?.*\bpnpm (run|install|exec)\b/m.test(job)) {
        assert.match(job, /uses: pnpm\/action-setup@/, `${file}: ${job.slice(0, job.indexOf(':'))}`)
      }
    }
  }
})
