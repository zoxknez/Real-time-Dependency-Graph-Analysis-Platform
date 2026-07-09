pub mod shared {
    pub mod event {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/shared.event.v1.rs"));
        }
    }
}

pub mod domain {
    pub mod package {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/domain.package.v1.rs"));
        }
    }
}
