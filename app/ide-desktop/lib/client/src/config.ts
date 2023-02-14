import chalk from 'chalk'
import * as content from '../../content/src/config'
import * as paths from 'paths'
import * as naming from 'naming'

// =================
// === Constants ===
// =================

export const helpExtendedName = 'helpExtended'
export const helpExtendedOptionName = naming.camelToKebabCase(helpExtendedName)

// ==================
// === WindowSize ===
// ==================

/** Window size (width and height). */
export class WindowSize {
    static separator = 'x'
    constructor(public width: number, public height: number) {}

    /** Constructor of the default window size. */
    static default(): WindowSize {
        return new WindowSize(1380, 900)
    }

    /** Parses the input text in form of `<width>x<height>`. */
    static parse(arg: string): Error | WindowSize {
        const size = arg.split(WindowSize.separator)
        const widthStr = size[0]
        const heightStr = size[1]
        const width = widthStr ? parseInt(widthStr) : NaN
        const height = heightStr ? parseInt(heightStr) : NaN
        if (isNaN(width) || isNaN(height)) {
            return new Error(`Incorrect window size provided '${arg}'.`)
        } else {
            return new WindowSize(width, height)
        }
    }

    /** Returns window size in a form of `<width>x<height>`. */
    pretty(): string {
        return `${this.width}${WindowSize.separator}${this.height}`
    }
}

// ==============
// === Config ===
// ==============

export const config = content.options.merge(
    new content.Group({
        options: {
            window: new content.Option({
                passToApplication: false,
                default: true,
                description:
                    'Show the window. If set to false, only the server is run. You can use another ' +
                    'client or a browser to connect to it.',
            }),
            server: new content.Option({
                passToApplication: false,
                default: true,
                description:
                    'Run the server. If set to false, you can connect to an existing server on the ' +
                    'provided `port`.',
            }),
            info: new content.Option({
                passToApplication: false,
                default: false,
                description:
                    `Print the system debug information. It is recommended to copy the output ` +
                    `of this command when submitting a report regarding any bugs encountered.`,
            }),
            version: new content.Option({
                passToApplication: false,
                default: false,
                description: `Print the version.`,
            }),
            help: new content.Option({
                passToApplication: false,
                default: false,
                description:
                    'Show the common configuration options help page. ' +
                    'To see all options, use `-full-help`.',
            }),
            [helpExtendedName]: new content.Option({
                passToApplication: false,
                default: false,
                description:
                    'Show all the configuration options help page, including the less-common ' +
                    'options.',
            }),
            engine: new content.Option({
                passToApplication: false,
                default: true,
                description: 'Start the engine process.',
            }),
        },
        groups: {
            window: new content.Group({
                options: {
                    size: new content.Option({
                        passToApplication: false,
                        default: WindowSize.default().pretty(),
                        description: `The initial window size.`,
                    }),
                    frame: new content.Option({
                        passToApplication: false,
                        default: process.platform !== 'darwin',
                        defaultDescription: 'false on MacOS, true otherwise',
                        description: 'Draw window frame.',
                    }),
                    vibrancy: new content.Option({
                        passToApplication: false,
                        default: false,
                        description: 'Use the vibrancy effect.',
                    }),
                    closeToQuit: new content.Option({
                        passToApplication: false,
                        default: process.platform !== 'darwin',
                        defaultDescription: 'false on MacOS, true otherwise',
                        description:
                            'Determines whether the app should quit when the window is closed. ' +
                            'If false, the window will be hidden after pressing the close ' +
                            'button. You can then bring the window back by pressing the app ' +
                            'dock icon.',
                    }),
                },
            }),
            server: new content.Group({
                options: {
                    port: new content.Option({
                        passToApplication: false,
                        default: 8080,
                        description: `Port to use. In case the port is unavailable, next free port will be found.`,
                    }),
                },
            }),

            performance: new content.Group({
                options: {
                    backgroundThrottling: new content.Option({
                        passToApplication: true,
                        default: false,
                        description: 'Throttle animations when run in background.',
                    }),

                    forceHighPerformanceGpu: new content.Option({
                        passToApplication: false,
                        default: true,
                        description:
                            'Force using discrete GPU when there are multiple GPUs available',
                    }),

                    angleBackend: new content.Option({
                        passToApplication: false,
                        default: process.platform === 'darwin' ? 'metal' : 'default',
                        defaultDescription: 'metal on MacOS, default otherwise',
                        description:
                            `Choose the graphics backend for ANGLE (graphics engine abstraction ` +
                            `layer). The OpenGL backend is soon to be deprecated on Mac, and may ` +
                            `contain driver bugs that are not planned to be fixed. The Metal ` +
                            `backend is still experimental, and may contain bugs that are still ` +
                            `being worked on. The Metal backend should be more performant.`,
                    }),

                    loadProfile: new content.Option({
                        passToApplication: false,
                        // FIXME
                        default: [] as string[],
                        description:
                            'Load a performance profile. For use with developer tools such as the `profiling-run-graph` entry point.',
                    }),
                    saveProfile: new content.Option({
                        passToApplication: false,
                        default: '',
                        description: 'Record a performance profile and write to a file.',
                    }),
                    workflow: new content.Option({
                        passToApplication: false,
                        default: '',
                        description:
                            'Specify a workflow for profiling. Must be used with -entry-point=profile.',
                    }),
                    ignoreGpuBlocklist: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description:
                            `The built-in software rendering list is overridden, allowing for ` +
                            `GPU acceleration on system configurations that do not inherently ` +
                            `support it. It should be noted that some hardware configurations ` +
                            `may have driver issues that could result in rendering ` +
                            `discrepancies. Despite this, the utilization of GPU acceleration ` +
                            `has the potential to significantly enhance the performance of the ` +
                            `application in our specific use cases. This behavior can be ` +
                            `observed in the following example: ` +
                            `https://groups.google.com/a/chromium.org/g/chromium-dev/c/09NnO6jYT6o.`,
                    }),
                    disableSandbox: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description:
                            `The sandbox feature is disabled for all process types that are ` +
                            `typically subjected to sandboxing. This option serves as a ` +
                            `browser-level switch solely for testing purposes. Although Google ` +
                            `discourages the use of this option, it is deemed safe for use in ` +
                            `this particular instance as the browser is exclusively designed to ` +
                            `display Enso, which already has unrestricted access to all files ` +
                            `and system settings on the user's machine. This modification has ` +
                            `been known to result in correct app behavior on certain systems, ` +
                            `as demonstrated in this example: ` +
                            `https://github.com/enso-org/enso/issues/3801.`,
                    }),
                    disableGpuSandbox: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description:
                            `Disables the GPU process sandbox. It should be noted that on ` +
                            `certain hardware configurations, the utilization of GPU sandboxing ` +
                            `may result in WebGL crashes. Despite Google's discouragement of ` +
                            `this option, it is considered safe for use in this specific ` +
                            `instance, as the browser is dedicated solely to the display of ` +
                            `Enso, which has unrestricted access to all files and system ` +
                            `settings on the user's machine. For a detailed explanation of ` +
                            `instances where such crashes may occur, please refer to this ` +
                            `document: https://wiki.archlinux.org/title/chromium.`,
                    }),
                    disableGpuVsync: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description:
                            `Disable the GPU Vertical Synchronization (VSync). This feature ` +
                            `synchronizes the refresh rate and frame rate of the monitor to ` +
                            `ensure optimal picture quality, particularly in gaming scenarios. ` +
                            `However, in applications that heavily rely on a graphical user ` +
                            `interface, the utilization of VSync is not deemed essential. By ` +
                            `disabling this feature, performance may be improved on hardware ` +
                            `configurations with limited capabilities. In addition, disabling ` +
                            `VSync also has the potential to reduce rendering latency. For a ` +
                            `comprehensive understanding of this aspect, please refer to this ` +
                            `thread: https://bugs.chromium.org/p/chromium/issues/detail?id=460919.`,
                    }),
                    disableSmoothScrolling: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description:
                            `Disable smooth scrolling feature. This modification has the ` +
                            `potential to reduce latency experienced with input devices. For ` +
                            `further elaboration, please refer to this thread: ` +
                            `https://news.ycombinator.com/item?id=28782493.`,
                    }),
                    enableNativeGpuMemoryBuffers: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: true,
                        description: `Enable native CPU-mappable GPU memory buffer support on Linux.`,
                    }),
                },
            }),

            engine: new content.Group({
                options: {
                    projectManagerPath: new content.Option({
                        passToApplication: false,
                        default: paths.projectManager,
                        description:
                            'Set the path of a local project manager to use for running projects.',
                    }),
                },
            }),

            debug: new content.Group({
                options: {
                    verbose: new content.Option({
                        passToApplication: false,
                        default: false,
                        description: `Increase logs verbosity. Affects both IDE and the backend.`,
                    }),
                    devTools: new content.Option({
                        passToApplication: false,
                        default: false,
                        description: 'Run the application in development mode.',
                    }),
                },
            }),
            chrome: new content.Group({
                description:
                    `Chrome and Electron command line options. Please be advised that the ` +
                    `provided list contains both Electron-specific options as well as a ` +
                    `selection of Chrome command line options that are officially supported ` +
                    `by Electron ` +
                    `(https://www.electronjs.org/docs/latest/api/command-line-switches). It is ` +
                    `important to note that not all Chrome switches may be compatible with ` +
                    `Electron. For example, the switch '-chrome.crash-test' is not functional in ` +
                    `the Electron environment. For a comprehensive collection of Chrome options, ` +
                    `you may refer to ` +
                    `https://peter.sh/experiments/chromium-command-line-switches.` +
                    `\n\n` +
                    chalk.red(`WARNING: `) +
                    `Neither the option names nor values undergo validation by ` +
                    `Chrome due to the lack of an option validation API. This may result in the ` +
                    `acceptance of invalid options, which will be silently ignored. To verify ` +
                    `the successful passing of options to Chrome, the use of ` +
                    `'-electron.disable-gpu' can be employed as a diagnostic measure, ` +
                    `effectively preventing the display of WebGL canvas.`,
                options: {
                    // === Electron Options ===
                    // https://www.electronjs.org/docs/latest/api/command-line-switches

                    authServerWhitelist: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'A comma-separated list of servers for which integrated authentication is ' +
                            'enabled.',
                    }),
                    authNegotiateDelegateWhitelist: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'A comma-separated list of servers for which delegation of user credentials is ' +
                            "required. Without '*' prefix the URL has to match exactly.",
                    }),
                    disableNtlmV2: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description: 'Disables NTLM v2 for posix platforms, no effect elsewhere.',
                    }),
                    disableHttpCache: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description: 'Disables the disk cache for HTTP requests.',
                    }),
                    disableHttp2: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description: 'Disable HTTP/2 and SPDY/3.1 protocols.',
                    }),
                    disableRendererBackgrounding: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description:
                            "Prevents Chrome from lowering the priority of invisible pages' renderer " +
                            'processes.',
                    }),
                    diskCacheSize: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: 0,
                        description:
                            'Forces the maximum disk space to be used by the disk cache, in bytes.',
                    }),
                    enableLogging: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "Prints Chrome's logging to stderr (or a log file, if provided as argument).",
                    }),
                    forceFieldtrials: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'Field trials to be forcefully enabled or disabled. For example, ' +
                            "'WebRTC-Audio-Red-For-Opus/Enabled/'.",
                    }),
                    hostRules: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'A comma-separated list of rules that control how hostnames are mapped. For ' +
                            "example, 'MAP * 127.0.0.1'.",
                    }),
                    hostResolverRules: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "Like '--host-rules' but these rules only apply to the host resolver.",
                    }),
                    ignoreCertificateErrors: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description: 'Ignores certificate related errors.',
                    }),
                    ignoreConnectionsLimit: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "Ignore the connections limit for domains list separated by ','.",
                    }),
                    jsFlags: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'Specifies the flags passed to the Node.js engine. For example, ' +
                            '\'-electron-js-flags="--harmony_proxies --harmony_collections"\'.',
                    }),
                    lang: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description: 'Set a custom locale.',
                    }),
                    logFile: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "If '-electron-enable-logging' is specified, logs will be written to the given path. " +
                            'The parent directory must exist.',
                    }),
                    logNetLog: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'Enables net log events to be saved and writes them to the provided path.',
                    }),
                    logLevel: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "Sets the verbosity of logging when used together with '-electron-enable-logging'. " +
                            "The argument should be one of Chrome's LogSeverities.",
                    }),
                    noProxyServer: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description:
                            "Don't use a proxy server and always make direct connections. Overrides " +
                            'any other proxy server flags that are passed.',
                    }),
                    noSandbox: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description:
                            'Disables the Chrome sandbox. Forces renderer process and Chrome helper ' +
                            'processes to run un-sandboxed. Should only be used for testing.',
                    }),
                    proxyBypassList: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'Instructs Electron to bypass the proxy server for the given ' +
                            'semi-colon-separated list of hosts. This flag has an effect only if used in tandem ' +
                            "with '--proxy-server'. For example, " +
                            '\'--proxy-bypass-list "<local>;*.google.com;*foo.com;1.2.3.4:5678"\'.',
                    }),
                    proxyPacUrl: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description: 'Uses the PAC script at the specified url.',
                    }),
                    proxyServer: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            "Use a specified proxy server ('address:port'), which overrides the system " +
                            'setting. This switch only affects requests with HTTP protocol, including HTTPS and ' +
                            'WebSocket requests. It is also noteworthy that not all proxy servers support HTTPS ' +
                            'and WebSocket requests. The proxy URL does not support username and password ' +
                            'authentication per ' +
                            '[Chrome issue](https://bugs.chromium.org/p/chromium/issues/detail?id=615947).',
                    }),
                    remoteDebuggingPort: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description: 'Enables remote debugging over HTTP on the specified port.',
                    }),
                    v: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: 0,
                        description:
                            'Gives the default maximal active V-logging level; 0 is the default. Normally ' +
                            'positive values are used for V-logging levels. This switch only works when ' +
                            "'-electron-enable-logging' is also passed.",
                    }),
                    vmodule: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            'Gives the per-module maximal V-logging levels to override the value given by ' +
                            "'-electron-v'. E.g. 'my_module=2,foo*=3' would change the logging level for all code in " +
                            "source files 'my_module.*' and 'foo*.*'. Any pattern containing a forward or " +
                            'backward slash will be tested against the whole pathname and not only the module. ' +
                            "This switch only works when '-electron-enable-logging' is also passed.",
                    }),
                    force_high_performance_gpu: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description:
                            'Force using discrete GPU when there are multiple GPUs available.',
                    }),
                    force_low_power_gpu: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: false,
                        description:
                            'Force using integrated GPU when there are multiple GPUs available.',
                    }),

                    enableBlinkFeatures: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            `A list of Blink (Chrome's rendering engine) features separated ` +
                            `by ',' like 'CSSVariables,KeyboardEventKey' to enable. The full ` +
                            `list of supported feature strings can be found in the ` +
                            `[RuntimeEnabledFeatures.json5](https://cs.chromium.org/chromium/src/third_party/blink/renderer/platform/runtime_enabled_features.json5?l=70) ` +
                            `file.`,
                    }),

                    disableBlinkFeatures: new content.Option({
                        passToApplication: false,
                        primary: false,
                        default: '',
                        description:
                            `A list of Blink (Chrome's rendering engine) features separated ` +
                            `by ',' like 'CSSVariables,KeyboardEventKey' to disable. The full ` +
                            `list of supported feature strings can be found in the ` +
                            `[RuntimeEnabledFeatures.json5](https://cs.chromium.org/chromium/src/third_party/blink/renderer/platform/runtime_enabled_features.json5?l=70) ` +
                            `file.`,
                    }),
                },
            }),
        },
    })
)
config.groups.startup.options.platform.default = process.platform
config.groups.startup.options.platform.value = process.platform

export type Args = typeof config
