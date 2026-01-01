use std::sync::{Arc, atomic::{AtomicUsize, AtomicU64, AtomicBool, Ordering}};
use std::time::{Duration, Instant};
use dashmap::DashMap;
use reqwest::{Client, Url};
use anyhow::Result;
use tracing::{warn};

#[derive(Debug, Clone)]
struct ProxyNode {
    url: Url,
    // Circuit Breaker state
    is_healthy: Arc<AtomicBool>,
    failures: Arc<AtomicUsize>,
    last_failure: Arc<DashMap<(), Instant>>,
    // Metrics
    success_count: Arc<AtomicUsize>,
    latency_sum_micros: Arc<AtomicU64>,
}

impl ProxyNode {
    fn new(url: Url) -> Self {
        Self {
            url,
            is_healthy: Arc::new(AtomicBool::new(true)),
            failures: Arc::new(AtomicUsize::new(0)),
            last_failure: Arc::new(DashMap::new()),
            success_count: Arc::new(AtomicUsize::new(0)),
            latency_sum_micros: Arc::new(AtomicU64::new(0)),
        }
    }

    fn mark_success(&self, latency: Duration) {
        self.failures.store(0, Ordering::Relaxed);
        self.is_healthy.store(true, Ordering::Relaxed);
        self.success_count.fetch_add(1, Ordering::Relaxed);
        self.latency_sum_micros.fetch_add(latency.as_micros() as u64, Ordering::Relaxed);
    }

    fn mark_failure(&self) {
        let fails = self.failures.fetch_add(1, Ordering::Relaxed) + 1;
        self.last_failure.insert((), Instant::now());
        
        // Threshold: 3 consecutive fails
        if fails >= 3 {
             if self.is_healthy.swap(false, Ordering::Relaxed) {
                 warn!(proxy=%self.url, "Proxy marked unhealthy due to consecutive failures");
             }
        }
    }

    fn is_usable(&self) -> bool {
        if self.is_healthy.load(Ordering::Relaxed) {
            return true;
        }
        
        // CB Probe after 5 min
        if let Some(last) = self.last_failure.get(&()) {
             if last.elapsed() > Duration::from_secs(300) {
                 return true;
             }
        }
        false
    }
}

pub struct ProxyLease {
    pub client: Client,
    node: Option<ProxyNode>,
}

impl ProxyLease {
    pub fn report_success(&self, latency: Duration) {
        if let Some(node) = &self.node {
            node.mark_success(latency);
        }
    }

    pub fn report_failure(&self) {
        if let Some(node) = &self.node {
            node.mark_failure();
        }
    }
}

pub struct ProxyRotator {
    proxies: Vec<ProxyNode>,
    cursor: AtomicUsize,
    base_client: Client,
}

impl ProxyRotator {
    pub fn new(proxy_urls: Vec<String>, config: &crate::config::CrawlerSettings) -> Result<Self> {
        let mut nodes = Vec::new();
        for s in proxy_urls {
            if let Ok(url) = Url::parse(&s) {
                nodes.push(ProxyNode::new(url));
            }
        }

        let base_client = Client::builder()
            .user_agent(&config.user_agent)
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()?;

        Ok(Self {
            proxies: nodes,
            cursor: AtomicUsize::new(0),
            base_client,
        })
    }

    pub fn get_client(&self) -> Result<ProxyLease> {
        if self.proxies.is_empty() {
             return Ok(ProxyLease {
                 client: self.base_client.clone(),
                 node: None,
             });
        }

        let start_idx = self.cursor.fetch_add(1, Ordering::Relaxed) % self.proxies.len();
        
        for i in 0..self.proxies.len() {
            let idx = (start_idx + i) % self.proxies.len();
            let node = self.proxies[idx].clone();
            
            if node.is_usable() {
                let client = Client::builder()
                    .user_agent("InverseDeps-Crawler/1.0") 
                    .timeout(Duration::from_secs(30))
                    .proxy(reqwest::Proxy::all(node.url.clone())?)
                    .build()?;
                    
                return Ok(ProxyLease {
                    client,
                    node: Some(node),
                });
            }
        }

        warn!("All proxies unhealthy! Falling back to direct connection.");
        Ok(ProxyLease {
            client: self.base_client.clone(),
            node: None,
        })
    }
}
