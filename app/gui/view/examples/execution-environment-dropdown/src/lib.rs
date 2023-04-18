//! This is a visualization example scene which creates a sinusoidal graph.

// === Standard Linter Configuration ===
#![deny(non_ascii_idents)]
#![warn(unsafe_code)]
#![allow(clippy::bool_to_int_with_if)]
#![allow(clippy::let_and_return)]
// === Non-Standard Linter Configuration ===
#![warn(missing_copy_implementations)]
#![warn(missing_debug_implementations)]
#![warn(missing_docs)]
#![warn(trivial_casts)]
#![warn(trivial_numeric_casts)]
#![warn(unused_import_braces)]
#![warn(unused_qualifications)]

use ensogl::prelude::*;

use ensogl::animation;
use ensogl::application::Application;
use ensogl_text_msdf::run_once_initialized;
use ide_view_execution_environment_selector as execution_environment_selector;
use ide_view_execution_environment_selector::ExecutionEnvironments;


// ======================
// === Initialisation ===
// ======================

fn make_entries() -> ExecutionEnvironments {
    Rc::new(vec!["Design".to_string().into(), "Live".to_string().into()])
}

fn init(app: &Application) {
    let app = app.clone_ref();
    let world = &app.display;
    let _scene = &world.default_scene;

    let execution_environment_selector =
        execution_environment_selector::ExecutionEnvironmentSelector::new(&app);
    world.add_child(&execution_environment_selector);
    execution_environment_selector.set_available_execution_environments(make_entries());

    world
        .on
        .before_frame
        .add(move |_time_info: animation::TimeInfo| {
            let _keep_alive = &execution_environment_selector;
        })
        .forget();
}


// ===================
// === Entry Point ===
// ===================

/// Entry point for the demo scene.
#[entry_point]
#[allow(dead_code)]
pub fn main() {
    run_once_initialized(|| {
        let app = Application::new("root");
        init(&app);
        mem::forget(app);
    });
}