mod package_deleted;
mod version_upserted;
mod version_yanked;

pub use package_deleted::handle_package_deleted;
pub use version_upserted::handle_version_upserted;
pub use version_yanked::handle_version_yanked;

use crate::graph::MemgraphClient;
use anyhow::Result;

/// Event type header values from C4 producer (original format)
pub const EVENT_TYPE_VERSION_UPSERTED: &str = "version.upserted";
pub const EVENT_TYPE_VERSION_YANKED: &str = "version.yanked";
pub const EVENT_TYPE_PACKAGE_DELETED: &str = "package.deleted";

/// Event type header values from PyPI/Cargo ingestors (topic-style format)
pub const EVENT_TYPE_DOMAIN_VERSION_UPSERT: &str = "domain.version.upsert.v1";
pub const EVENT_TYPE_DOMAIN_VERSION_YANKED: &str = "domain.version.yanked.v1";
pub const EVENT_TYPE_DOMAIN_PACKAGE_UPSERT: &str = "domain.package.upsert.v1";
pub const EVENT_TYPE_DOMAIN_PACKAGE_DELETED: &str = "domain.package.deleted.v1";

/// Common trait for event handlers
#[async_trait::async_trait]
#[allow(dead_code)]
pub trait EventHandler: Send + Sync {
    async fn handle(&self, client: &MemgraphClient, payload: &[u8]) -> Result<()>;
}
