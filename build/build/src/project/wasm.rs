//! Wrappers over the Rust part of the IDE codebase.

use crate::prelude::*;

use crate::paths::generated::RepoRootDistWasm;
use crate::project::IsArtifact;
use derivative::Derivative;
use ide_ci::fs::compressed_size;
use ide_ci::fs::copy_file_if_different;
use ide_ci::programs::cargo;
use ide_ci::programs::wasm_opt;
use ide_ci::programs::wasm_opt::WasmOpt;
use ide_ci::programs::wasm_pack;
use ide_ci::programs::Cargo;
use ide_ci::programs::WasmPack;
use std::time::Duration;
use tokio::process::Child;


// ==============
// === Export ===
// ==============

pub mod env;
pub mod test;


pub const BINARYEN_VERSION_TO_INSTALL: u32 = 108;

pub const DEFAULT_INTEGRATION_TESTS_WASM_TIMEOUT: Duration = Duration::from_secs(300);

pub const INTEGRATION_TESTS_CRATE_NAME: &str = "enso-integration-test";

pub const OUTPUT_NAME: &str = "ide";

/// Name of the artifact that will be uploaded as part of CI run.
pub const WASM_ARTIFACT_NAME: &str = "gui_wasm";

pub const DEFAULT_TARGET_CRATE: &str = "app/gui";

#[derive(
clap::ArgEnum,
Clone,
Copy,
Debug,
Default,
strum::Display,
strum::EnumString,
PartialEq,
Eq
)]
#[strum(serialize_all = "kebab-case")]
pub enum ProfilingLevel {
    #[default]
    Objective,
    Task,
    Detail,
    Debug,
}

#[derive(
clap::ArgEnum,
Clone,
Copy,
Debug,
Default,
strum::Display,
strum::EnumString,
PartialEq,
Eq
)]
#[strum(serialize_all = "kebab-case")]
pub enum LogLevel {
    Error,
    #[default]
    Warn,
    Info,
    Debug,
    Trace,
}

#[derive(clap::ArgEnum, Clone, Copy, Debug, PartialEq, Eq, strum::Display, strum::AsRefStr)]
#[strum(serialize_all = "kebab-case")]
pub enum Profile {
    Dev,
    Profile,
    Release,
    // Production,
}

impl From<Profile> for wasm_pack::Profile {
    fn from(profile: Profile) -> Self {
        match profile {
            Profile::Dev => Self::Dev,
            Profile::Profile => Self::Profile,
            Profile::Release => Self::Release,
            // Profile::Production => Self::Release,
        }
    }
}

impl Profile {
    pub fn should_check_size(self) -> bool {
        match self {
            Profile::Dev => false,
            Profile::Profile => false,
            Profile::Release => true,
            // Profile::Production => true,
        }
    }

    pub fn extra_rust_options(self) -> Vec<String> {
        match self {
            // Profile::Production => ["-Clto=fat", "-Ccodegen-units=1", "-Cincremental=false"]
            //     .into_iter()
            //     .map(ToString::to_string)
            //     .collect(),
            Profile::Dev | Profile::Profile | Profile::Release => vec![],
        }
    }

    pub fn optimization_level(self) -> wasm_opt::OptimizationLevel {
        match self {
            Profile::Dev => wasm_opt::OptimizationLevel::O0,
            Profile::Profile => wasm_opt::OptimizationLevel::O,
            Profile::Release => wasm_opt::OptimizationLevel::O3,
        }
    }
}

#[derive(Clone, Derivative)]
#[derivative(Debug)]
pub struct BuildInput {
    /// Path to the crate to be compiled to WAM. Relative to the repository root.
    pub crate_path: PathBuf,
    pub wasm_opt_options: Vec<String>,
    pub skip_wasm_opt: bool,
    pub extra_cargo_options: Vec<String>,
    pub profile: Profile,
    pub profiling_level: Option<ProfilingLevel>,
    pub log_level: LogLevel,
    pub uncollapsed_log_level: LogLevel,
    pub wasm_size_limit: Option<byte_unit::Byte>,
    pub system_shader_tools: bool,
}

impl BuildInput {
    pub async fn perhaps_check_size(&self, wasm_path: impl AsRef<Path>) -> Result {
        let compressed_size = compressed_size(&wasm_path).await?.get_appropriate_unit(true);
        info!("Compressed size of {} is {}.", wasm_path.as_ref().display(), compressed_size);
        if let Some(wasm_size_limit) = self.wasm_size_limit {
            let wasm_size_limit = wasm_size_limit.get_appropriate_unit(true);
            if !self.profile.should_check_size() {
                warn!("Skipping size check because profile is '{}'.", self.profile,);
            } else if self.profiling_level.unwrap_or_default() != ProfilingLevel::Objective {
                // TODO? additional leeway as sanity check
                warn!(
                    "Skipping size check because profiling level is {:?} rather than {}.",
                    self.profiling_level,
                    ProfilingLevel::Objective
                );
            } else {
                ensure!(
                    compressed_size < wasm_size_limit,
                    "Compressed WASM size ~{} ({} bytes) exceeds the limit of {} ({} bytes).",
                    compressed_size,
                    compressed_size.get_byte(),
                    wasm_size_limit,
                    wasm_size_limit.get_byte(),
                )
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Wasm;

#[derive(Clone, Derivative)]
#[derivative(Debug)]
pub struct WatchInput {
    pub cargo_watch_options: Vec<String>,
}

#[derive(Clone, Debug, Display, PartialEq, Eq)]
pub struct Artifact(pub RepoRootDistWasm);

impl Artifact {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self(RepoRootDistWasm::new_root(path))
    }

    /// Files that should be shipped in the Gui bundle.
    pub fn files_to_ship(&self) -> Vec<&Path> {
        // We explicitly deconstruct object, so when new fields are added, we will be forced to
        // consider whether they should be shipped or not.
        let RepoRootDistWasm {
            path: _,
            dynamic_assets,
            pkg_js,
            pkg_js_map,
            pkg_wasm: _,
            pkg_opt_wasm,
        } = &self.0;
        vec![
            dynamic_assets.as_path(),
            pkg_js.as_path(),
            pkg_js_map.as_path(),
            pkg_opt_wasm.as_path(),
        ]
    }
}

impl AsRef<Path> for Artifact {
    fn as_ref(&self) -> &Path {
        self.0.as_path()
    }
}

impl IsArtifact for Artifact {}

impl Wasm {
    pub async fn check(&self) -> Result {
        Cargo
            .cmd()?
            .apply(&cargo::Command::Check)
            .apply(&cargo::Options::Workspace)
            .apply(&cargo::Options::Package(INTEGRATION_TESTS_CRATE_NAME.into()))
            .apply(&cargo::Options::AllTargets)
            .run_ok()
            .await
    }

    pub async fn test(&self, repo_root: PathBuf, wasm: &[test::Browser], native: bool) -> Result {
        async fn maybe_run<Fut: Future<Output=Result>>(
            name: &str,
            enabled: bool,
            f: impl (FnOnce() -> Fut),
        ) -> Result {
            if enabled {
                info!("Will run {name} tests.");
                f().await.context(format!("Running {name} tests."))
            } else {
                info!("Skipping {name} tests.");
                Ok(())
            }
        }

        maybe_run("native", native, async || {
            Cargo
                .cmd()?
                .current_dir(repo_root.clone())
                .apply(&cargo::Command::Test)
                .apply(&cargo::Options::Workspace)
                // Color needs to be passed to tests themselves separately.
                // See: https://github.com/rust-lang/cargo/issues/1983
                .arg("--")
                .apply(&cargo::Color::Always)
                .run_ok()
                .await
        })
            .await?;

        maybe_run("wasm", !wasm.is_empty(), || test::test_all(repo_root.clone(), wasm)).await?;
        Ok(())
    }

    pub async fn integration_test(
        &self,
        source_root: PathBuf,
        _project_manager: Option<Child>,
        headless: bool,
        additional_options: Vec<String>,
        wasm_timeout: Option<Duration>,
    ) -> Result {
        info!("Running Rust WASM test suite.");
        use wasm_pack::TestFlags::*;
        WasmPack
            .cmd()?
            .current_dir(source_root)
            .set_env_opt(
                env::WASM_BINDGEN_TEST_TIMEOUT,
                wasm_timeout.map(|d| d.as_secs()).as_ref(),
            )?
            .test()
            .apply_opt(headless.then_some(&Headless))
            .apply(&test::BROWSER_FOR_WASM_TESTS)
            .arg("integration-test")
            .arg("--profile=integration-test")
            .args(additional_options)
            .run_ok()
            .await
        // PM will be automatically killed by dropping the handle.
    }

    /// Process "raw" WASM (as compiled) by optionally invoking wasm-opt.
    pub async fn finalize_wasm(
        wasm_opt_options: &[String],
        skip_wasm_opt: bool,
        profile: Profile,
        temp_dist: &RepoRootDistWasm,
    ) -> Result {
        let should_call_wasm_opt = {
            if profile == Profile::Dev {
                debug!("Skipping wasm-opt invocation, as it is not part of profile {profile}.");
                false
            } else if skip_wasm_opt {
                debug!("Skipping wasm-opt invocation, as it was explicitly requested.");
                false
            } else {
                true
            }
        };

        if should_call_wasm_opt {
            let mut wasm_opt_command = WasmOpt.cmd()?;
            let has_custom_opt_level = wasm_opt_options.iter().any(|opt| {
                wasm_opt::OptimizationLevel::from_str(opt.trim_start_matches('-')).is_ok()
            });
            if !has_custom_opt_level {
                wasm_opt_command.apply(&profile.optimization_level());
            }
            wasm_opt_command
                .args(wasm_opt_options)
                .arg(&temp_dist.pkg_wasm)
                .apply(&wasm_opt::Output(&temp_dist.pkg_opt_wasm))
                .run_ok()
                .await?;
        } else {
            copy_file_if_different(&temp_dist.pkg_wasm, &temp_dist.pkg_opt_wasm)?;
        }
        Ok(())
    }
}
