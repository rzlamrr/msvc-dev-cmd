import * as core from '@actions/core'
import * as child_process from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)']
const PROGRAM_FILES = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles']]


const EDITIONS = ['Enterprise', 'Professional', 'Community', 'BuildTools']
const YEARS = ['2026', '2022', '2019', '2017']

const VsYearVersion = {
    '2026': '18.0',
    '2022': '17.0',
    '2019': '16.0',
    '2017': '15.0',
    '2015': '14.0',
    '2013': '12.0',
}

function vsversion_to_versionnumber(vsversion) {
    if (Object.values(VsYearVersion).includes(vsversion)) {
        return vsversion
    } else {
        if (vsversion in VsYearVersion) {
            return VsYearVersion[vsversion]
        }
    }
    return vsversion
}
export { vsversion_to_versionnumber }

function vsversion_to_year(vsversion) {
    if (Object.keys(VsYearVersion).includes(vsversion)) {
        return vsversion
    } else {
        for (const [year, ver] of Object.entries(VsYearVersion)) {
            if (ver === vsversion) {
                return year
            }
        }
    }
    return vsversion
}
export { vsversion_to_year }

// VS 2022 and older install under a directory named after the year, VS 2026 and newer
// under one named after the major version number (e.g. "18").
function vsversion_to_dirname(year) {
    return Number(year) >= 2026 ? vsversion_to_versionnumber(year).split('.')[0] : year
}

const VSWHERE_PATH = `${PROGRAM_FILES_X86}\\Microsoft Visual Studio\\Installer`

function findWithVswhere(pattern, version_pattern) {
    try {
        let installationPath = child_process.execSync(`vswhere -products * ${version_pattern} -prerelease -property installationPath`).toString().trim().split(/\r?\n/)[0]
        return installationPath + '\\' + pattern
    } catch (e) {
        core.warning(`vswhere failed: ${e}`)
    }
    return null
}
export { findWithVswhere }

function findVcvarsall(vsversion) {
    const vsversion_number = vsversion_to_versionnumber(vsversion)
    let version_pattern
    if (vsversion_number) {
        const upper_bound = vsversion_number.split('.')[0] + '.9'
        version_pattern = `-version "${vsversion_number},${upper_bound}"`
    } else {
        version_pattern = "-latest"
    }

    // If vswhere is available, ask it about the location of the latest Visual Studio.
    let path = findWithVswhere('VC\\Auxiliary\\Build\\vcvarsall.bat', version_pattern)
    if (path && fs.existsSync(path)) {
        core.info(`Found with vswhere: ${path}`)
        return path
    }
    core.info("Not found with vswhere")

    // If that does not work, try the standard installation locations,
    // starting with the latest and moving to the oldest.
    const years = vsversion ? [vsversion_to_year(vsversion)] : YEARS
    for (const prog_files of PROGRAM_FILES) {
        for (const ver of years) {
            const dir = vsversion_to_dirname(ver)
            for (const ed of EDITIONS) {
                path = `${prog_files}\\Microsoft Visual Studio\\${dir}\\${ed}\\VC\\Auxiliary\\Build\\vcvarsall.bat`
                core.info(`Trying standard location: ${path}`)
                if (fs.existsSync(path)) {
                    core.info(`Found standard location: ${path}`)
                    return path
                }
            }
        }
    }
    core.info("Not found in standard locations")

    // Special case for Visual Studio 2015 (and maybe earlier), try it out too.
    path = `${PROGRAM_FILES_X86}\\Microsoft Visual C++ Build Tools\\vcbuildtools.bat`
    if (fs.existsSync(path)) {
        core.info(`Found VS 2015: ${path}`)
        return path
    }
    core.info(`Not found in VS 2015 location: ${path}`)

    throw new Error('Microsoft Visual Studio not found')
}
export { findVcvarsall }

// Split "NAME=value" at the first '=' only, as values may contain '=' themselves.
// cmd also lists hidden per-drive variables like "=C:=C:\dir", whose names start with '='.
function splitEnvLine(line) {
    const index = line.indexOf('=', 1)
    if (index < 0) {
        return [line, undefined]
    }
    return [line.slice(0, index), line.slice(index + 1)]
}

function isPathVariable(name) {
    const pathLikeVariables = ['PATH', 'INCLUDE', 'LIB', 'LIBPATH']
    return pathLikeVariables.indexOf(name.toUpperCase()) != -1
}

function filterPathValue(path) {
    let paths = path.split(';')
    // Remove duplicates by keeping the first occurance and preserving order.
    // This keeps path shadowing working as intended.
    function unique(value, index, self) {
        return self.indexOf(value) === index
    }
    return paths.filter(unique).join(';')
}

// The architecture to target when "arch" is not specified: the one of the machine we run on,
// so that ARM64 runners get native ARM64 tools instead of cross-compiling from x64 emulation.
function defaultArch(env = process.env) {
    // RUNNER_ARCH is set by GitHub Actions and is right even if Node itself runs emulated.
    const host = (env['RUNNER_ARCH'] || env['PROCESSOR_ARCHITEW6432'] || env['PROCESSOR_ARCHITECTURE'] || '').toUpperCase()
    return host === 'ARM64' ? 'arm64' : 'x64'
}
export { defaultArch }

/** See https://github.com/ilammy/msvc-dev-cmd#inputs */
function setupMSVCDevCmd(arch, sdk, toolset, uwp, spectre, vsversion) {
    if (process.platform != 'win32') {
        core.info('This is not a Windows virtual environment, bye!')
        return
    }

    // Add standard location of "vswhere" to PATH, in case it's not there.
    process.env.PATH += path.delimiter + VSWHERE_PATH

    if (!arch) {
        arch = defaultArch()
    }

    // There are all sorts of way the architectures are called. In addition to
    // values supported by Microsoft Visual C++, recognize some common aliases.
    let arch_aliases = {
        "win32": "x86",
        "win64": "x64",
        "x86_64": "x64",
        "x86-64": "x64",
    }
    // Ignore case when matching as that's what humans expect.
    if (Object.hasOwn(arch_aliases, arch.toLowerCase())) {
        arch = arch_aliases[arch.toLowerCase()]
    }

    // Due to the way Microsoft Visual C++ is configured, we have to resort to the following hack:
    // Call the configuration batch file and then output *all* the environment variables.

    var args = [arch]
    if (uwp == 'true') {
        args.push('uwp')
    }
    if (sdk) {
        args.push(sdk)
    }
    if (toolset) {
        args.push(`-vcvars_ver=${toolset}`)
    }
    if (spectre == 'true') {
        args.push('-vcvars_spectre_libs=spectre')
    }

    const vcvarsall = findVcvarsall(vsversion)
    const vcvars = `"${vcvarsall}" ${args.join(' ')}`
    core.debug(`vcvars command-line: ${vcvars}`)

    const cmd_output_string = child_process.execSync(`set && cls && ${vcvars} && cls && set`, {shell: "cmd"}).toString()
    const cmd_output_parts = cmd_output_string.split('\f')

    const old_environment = cmd_output_parts[0].split('\r\n')
    const vcvars_output   = cmd_output_parts[1].split('\r\n')
    const new_environment = cmd_output_parts[2].split('\r\n')

    // If vsvars.bat is given an incorrect command line, it will print out
    // an error and *still* exit successfully. Parse out errors from output
    // which don't look like environment variables, and fail if appropriate.
    const error_messages = vcvars_output.filter((line) => {
        if (line.match(/^\[ERROR.*\]/)) {
            // Don't print this particular line which will be confusing in output.
            if (!line.match(/Error in script usage. The correct usage is:$/)) {
                return true
            }
        }
        return false
    })
    if (error_messages.length > 0) {
        throw new Error('invalid parameters' + '\r\n' + error_messages.join('\r\n'))
    }

    // Convert old environment lines into a dictionary for easier lookup.
    let old_env_vars = {}
    for (let string of old_environment) {
        const [name, value] = splitEnvLine(string)
        old_env_vars[name] = value
    }

    // Now look at the new environment and export everything that changed.
    // These are the variables set by vsvars.bat. Also export everything
    // that was not there during the first sweep: those are new variables.
    // Environment names are case-insensitive on Windows, remember them upper-cased for lookups.
    let new_env_vars = {}
    core.startGroup('Environment variables')
    for (let string of new_environment) {
        // vsvars.bat likes to print some fluff at the beginning.
        // Skip lines that don't look like environment variables.
        if (!string.includes('=')) {
            continue;
        }
        let [name, new_value] = splitEnvLine(string)
        if (!name) {
            continue
        }
        new_env_vars[name.toUpperCase()] = new_value
        let old_value = old_env_vars[name]
        // For new variables "old_value === undefined".
        if (new_value !== old_value) {
            core.info(`Setting ${name}`)
            // Special case for a bunch of PATH-like variables: vcvarsall.bat
            // just prepends its stuff without checking if its already there.
            // This makes repeated invocations of this action fail after some
            // point, when the environment variable overflows. Avoid that.
            if (isPathVariable(name)) {
                new_value = filterPathValue(new_value)
            }
            core.exportVariable(name, new_value)
        }
    }
    core.endGroup()

    core.info(`Configured Developer Command Prompt`)

    // What vcvarsall.bat actually configured, for later steps. Absent for very old Visual Studio versions.
    const vs_install_dir = new_env_vars['VSINSTALLDIR']
    return {
        arch: arch,
        vcvarsall: vcvarsall,
        installationPath: vs_install_dir ? vs_install_dir.replace(/\\+$/, '') : '',
        vsVersion: new_env_vars['VISUALSTUDIOVERSION'] || '',
        toolsetVersion: new_env_vars['VCTOOLSVERSION'] || '',
    }
}
export { setupMSVCDevCmd }
