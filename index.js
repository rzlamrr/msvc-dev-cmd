import { setupMSVCDevCmd } from './lib.js'
import * as core from '@actions/core'

function main() {
    var   arch    = core.getInput('arch')
    const sdk     = core.getInput('sdk')
    const toolset = core.getInput('toolset')
    const uwp     = core.getInput('uwp')
    const spectre = core.getInput('spectre')
    const vsversion = core.getInput('vsversion')

    const result = setupMSVCDevCmd(arch, sdk, toolset, uwp, spectre, vsversion)
    if (result) {
        core.setOutput('arch', result.arch)
        core.setOutput('vcvarsall', result.vcvarsall)
        core.setOutput('installation-path', result.installationPath)
        core.setOutput('vs-version', result.vsVersion)
        core.setOutput('toolset-version', result.toolsetVersion)
    }
}

try {
    main()
}
catch (e) {
    core.setFailed('Could not setup Developer Command Prompt: ' + e.message)
}
