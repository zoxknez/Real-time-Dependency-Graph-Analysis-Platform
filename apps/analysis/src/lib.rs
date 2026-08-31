//! Analysis Library Crate
//!
//! Exposes public API analysis, snapshot repository, and counterfactual scenario evaluation.

#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]
#![allow(unused_parens)]
#![allow(clippy::all)]

pub mod api_snapshot;
pub mod ast_parser;
pub mod breaking_detector;
pub mod config;
pub mod counterfactual;
pub mod public_api;
