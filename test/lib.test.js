import { test } from 'node:test'
import assert from 'node:assert/strict'

import { defaultArch, describeInstallations, vsversion_to_versionnumber, vsversion_to_year } from '../lib.js'

test('defaultArch follows the runner architecture', () => {
    assert.equal(defaultArch({ RUNNER_ARCH: 'X64' }), 'x64')
    assert.equal(defaultArch({ RUNNER_ARCH: 'ARM64' }), 'arm64')
})

test('defaultArch falls back to the processor architecture, even for emulated processes', () => {
    assert.equal(defaultArch({ PROCESSOR_ARCHITECTURE: 'AMD64' }), 'x64')
    assert.equal(defaultArch({ PROCESSOR_ARCHITECTURE: 'ARM64' }), 'arm64')
    // An x64 process emulated on an ARM64 machine sees the real architecture here.
    assert.equal(defaultArch({ PROCESSOR_ARCHITECTURE: 'AMD64', PROCESSOR_ARCHITEW6432: 'ARM64' }), 'arm64')
})

test('defaultArch is x64 when nothing is known', () => {
    assert.equal(defaultArch({}), 'x64')
})

test('Visual Studio years and version numbers map both ways', () => {
    assert.equal(vsversion_to_versionnumber('2026'), '18.0')
    assert.equal(vsversion_to_versionnumber('2022'), '17.0')
    assert.equal(vsversion_to_versionnumber('16.0'), '16.0')
    assert.equal(vsversion_to_year('18.0'), '2026')
    assert.equal(vsversion_to_year('2019'), '2019')
})

test('describeInstallations lists what vswhere found', () => {
    const text = describeInstallations([{ name: 'Visual Studio Build Tools 2026', version: '18.6.1', path: 'C:/VS' }])
    assert.ok(text.includes('Visual Studio Build Tools 2026 (version 18.6.1) in C:/VS'))
})

test('describeInstallations says so when nothing was found', () => {
    assert.match(describeInstallations([]), /did not report any Visual Studio installation/)
})
