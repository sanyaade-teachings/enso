use crate::prelude::*;

use crate::ide::web::IdeDesktop;
use crate::project::Context;
use crate::project::IsArtifact;
use derivative::Derivative;


#[derive(Clone, Debug, PartialEq, Eq, Hash, Deref)]
pub struct Artifact(crate::paths::generated::RepoRootDistGui);

impl AsRef<Path> for Artifact {
    fn as_ref(&self) -> &Path {
        self.0.as_path()
    }
}

impl IsArtifact for Artifact {}

impl Artifact {
    pub fn new(gui_path: impl AsRef<Path>) -> Self {
        // TODO: sanity check
        Self(crate::paths::generated::RepoRootDistGui::new_root(gui_path.as_ref()))
    }
}

/// Override the default value of `newDashboard` in `config.json` to `true`.
///
/// This is a temporary workaround. We want to enable the new dashboard by default in the CI-built
/// IDE, but we don't want to enable it by default in the IDE built locally by developers.
pub fn override_default_for_authentication(
    path: &crate::paths::generated::RepoRootAppIdeDesktopLibContentConfigSrcConfigJson,
) -> Result {
    let json_path = ["groups", "featurePreview", "options", "newDashboard", "value"];
    let mut json = ide_ci::fs::read_json::<serde_json::Value>(path)?;
    let mut current =
        json.as_object_mut().ok_or_else(|| anyhow!("Failed to find object in {:?}", path))?;
    for key in &json_path[..json_path.len() - 1] {
        current = current
            .get_mut(*key)
            .with_context(|| format!("Failed to find {key:?} in {path:?}"))?
            .as_object_mut()
            .with_context(|| format!("Failed to find object at {key:?} in {path:?}"))?;
    }
    current.insert(json_path.last().unwrap().to_string(), serde_json::Value::Bool(true));
    ide_ci::fs::write_json(path, &json)?;
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Gui;


#[derive(Clone, Derivative, Serialize, Deserialize)]
#[derivative(Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub commit: String,
    #[derivative(Debug(format_with = "std::fmt::Display::fmt"))]
    pub version: Version,
    #[derivative(Debug(format_with = "std::fmt::Display::fmt"))]
    pub engine_version: Version,
    pub name: String,
}

pub fn ide_desktop_from_context(context: &Context) -> IdeDesktop {
    IdeDesktop::new(&context.repo_root, context.octocrab.clone(), context.cache.clone())
}
