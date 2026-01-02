//! Generated protobuf types from proto/*.proto files
//!
//! This module contains the generated Rust code from our Protocol Buffer definitions.
//! The actual code generation happens in build.rs at compile time.

pub mod shared {
    pub mod event {
        pub mod v1 {
            tonic::include_proto!("shared.event.v1");
        }
    }
}

pub mod domain {
    pub mod package {
        pub mod v1 {
            tonic::include_proto!("domain.package.v1");
        }
    }
}
