//! Generated models from Protobuf definitions
//!
//! This crate contains Rust structs generated from our .proto files.
//! The actual generation happens in build.rs

pub mod analysis;
pub mod audit;
pub mod generated;
pub mod license;
pub mod package;
pub mod policy;
pub mod provenance;
pub mod sbom;
pub mod scorecard;
pub mod tenant;
pub mod vex;
pub mod vulnerability;

// Re-export common types
pub use analysis::*;
pub use package::*;
pub use tenant::*;
pub use vulnerability::*;

/// Common ID type used across the platform
pub type PackageId = String;

/// Ecosystem enum for Rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Ecosystem {
    Npm,
    PyPi,
    Cargo,
    Maven,
    NuGet,
    Go,
}

impl Ecosystem {
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "npm" => Some(Ecosystem::Npm),
            "pypi" => Some(Ecosystem::PyPi),
            "cargo" | "crates" => Some(Ecosystem::Cargo),
            "maven" => Some(Ecosystem::Maven),
            "nuget" => Some(Ecosystem::NuGet),
            "go" | "golang" => Some(Ecosystem::Go),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Ecosystem::Npm => "npm",
            Ecosystem::PyPi => "pypi",
            Ecosystem::Cargo => "cargo",
            Ecosystem::Maven => "maven",
            Ecosystem::NuGet => "nuget",
            Ecosystem::Go => "go",
        }
    }
}

impl std::fmt::Display for Ecosystem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
