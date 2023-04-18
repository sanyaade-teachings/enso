//! This module contains the logic for the execution environment selector.

use super::*;

use crate::Frp;

use ide_view_execution_environment_selector::ExecutionEnvironment;


// =============================
// === Execution Environment ===
// =============================

fn get_next_execution_environment(
    current: &ExecutionEnvironment,
    available: &[ExecutionEnvironment],
) -> Option<ExecutionEnvironment> {
    let index = available.iter().position(|mode| mode == current)?;
    let next_index = (index + 1) % available.len();
    Some(available[next_index].clone())
}

/// Initialise the FRP logic for the execution environment selector.
pub fn init_frp(frp: &Frp, model: &GraphEditorModelWithNetwork) {
    let out = &frp.private.output;
    let network = frp.network();
    let inputs = &model.frp;
    let execution_environment_selector = &model.execution_environment_selector;

    frp::extend! { network


        // === Execution Environment Changes ===

        execution_environment_selector.set_available_execution_environments <+ frp.set_available_execution_environments;
        selected_execution_environment <- frp.set_execution_environment.map(|env| (*env).into());
        execution_environment_state <- all(out.execution_environment,frp.set_available_execution_environments);

        execution_environment_toggled <- execution_environment_state.sample(&frp.toggle_execution_environment);
        toggled_execution_environment <- execution_environment_toggled.map(|(mode,available)| get_next_execution_environment(mode,available)).unwrap();

        external_execution_environment_update <- any(selected_execution_environment,toggled_execution_environment);
        execution_environment_selector.set_execution_environment <+ external_execution_environment_update;

        execution_environment_update <- any(execution_environment_selector.selected_execution_environment,external_execution_environment_update);
        out.execution_environment <+ execution_environment_update;
        out.execution_environment_play_button_pressed <+ execution_environment_selector.play_press;


        // === Layout ===

        init <- source::<()>();
        size_update <- all(init,execution_environment_selector.size,inputs.space_for_window_buttons);
        eval size_update ([model]((_,size,gap_size)) {
            let y_offset = MACOS_TRAFFIC_LIGHTS_VERTICAL_CENTER;
            let traffic_light_width = traffic_lights_gap_width();

            let execution_environment_selector_x = gap_size.x + traffic_light_width;
            model.execution_environment_selector.set_x(execution_environment_selector_x);
            let breadcrumb_gap_width = execution_environment_selector_x + size.x + TOP_BAR_ITEM_MARGIN;
            model.breadcrumbs.gap_width(breadcrumb_gap_width);

            model.execution_environment_selector.set_y(y_offset + size.y / 2.0);
            model.breadcrumbs.set_y(y_offset + component::breadcrumbs::HEIGHT / 2.0);
        });
    }
    init.emit(());
}