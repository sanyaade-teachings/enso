// === Features ===
#![feature(const_trait_impl)]
#![feature(string_remove_matches)]
#![feature(once_cell_try)]
// === Standard Linter Configuration ===
#![deny(non_ascii_idents)]
#![warn(unsafe_code)]
#![allow(clippy::bool_to_int_with_if)]
#![allow(clippy::let_and_return)]



mod prelude {
    pub use derive_more::*;
    pub use enso_build_base::prelude::*;

    pub use convert_case::Case;
    pub use convert_case::Casing;
    pub use itertools::Itertools;
    pub use proc_macro2::Span;
    pub use proc_macro2::TokenStream;
    pub use quote::quote;
    pub use syn::Data;
    pub use syn::DeriveInput;
    pub use syn::Ident;
    pub use syn_1 as syn;
}

use prelude::*;

pub mod paths;
pub mod program_args;
