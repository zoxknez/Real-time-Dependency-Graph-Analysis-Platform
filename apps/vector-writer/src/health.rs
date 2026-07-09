use anyhow::Result;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::info;

pub async fn serve(port: u16, ready: Arc<AtomicBool>) -> Result<()> {
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).await?;
    info!("Health server listening on {}", addr);

    loop {
        let (mut socket, _) = listener.accept().await?;
        let ready = ready.clone();

        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let n = match socket.read(&mut buf).await {
                Ok(n) => n,
                Err(_) => return,
            };

            let request = String::from_utf8_lossy(&buf[..n]);
            let path = request.split_whitespace().nth(1).unwrap_or("/");

            let (status, body) = match path {
                "/health/live" => (200, "OK"),
                "/health/ready" | "/health" => {
                    if ready.load(Ordering::Relaxed) {
                        (200, "OK")
                    } else {
                        (503, "NOT_READY")
                    }
                }
                _ => (404, "NOT_FOUND"),
            };

            let reason = match status {
                200 => "OK",
                404 => "Not Found",
                _ => "Service Unavailable",
            };

            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                status,
                reason,
                body.len(),
                body
            );

            let _ = socket.write_all(response.as_bytes()).await;
        });
    }
}
