#[allow(clippy::all)]
pub mod domain {
    pub mod tenant {
        pub mod v1 {
            include!("domain.tenant.v1.rs");
        }
    }
}
