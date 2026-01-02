//! GraphQL module - types, resolvers, loaders, subscriptions

pub mod types;
pub mod loaders;
pub mod query;
pub mod subscription;
pub mod schema;
pub mod context;

pub use schema::{build_schema, ApiSchema};
// GqlContext and EventChannels re-exported for external use
#[allow(unused_imports)]
pub use context::{GqlContext, EventChannels};
