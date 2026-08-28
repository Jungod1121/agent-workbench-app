use axum::{
    body::Body,
    extract::{Request, State},
    http::HeaderMap,
    response::IntoResponse,
    routing::any,
    Router,
};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub address: String,
    pub port: u16,
    pub upstream: String,
}

struct ProxyInner {
    is_running: bool,
    port: u16,
    address: String,
    upstream: String,
    shutdown_tx: Option<oneshot::Sender<()>>,
    handle: Option<tokio::task::JoinHandle<()>>,
}

pub struct ProxyState {
    inner: Arc<Mutex<ProxyInner>>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(ProxyInner {
                is_running: false,
                port: 0,
                address: "127.0.0.1:0".to_string(),
                upstream: String::new(),
                shutdown_tx: None,
                handle: None,
            })),
        }
    }
}

impl ProxyState {
    pub fn set_upstream(&self, upstream: String) {
        let mut g = self.inner.lock().unwrap();
        g.upstream = upstream;
    }

    pub fn get_status(&self) -> ProxyStatus {
        let g = self.inner.lock().unwrap();
        ProxyStatus {
            is_running: g.is_running,
            address: g.address.clone(),
            port: g.port,
            upstream: g.upstream.clone(),
        }
    }

    pub async fn start(&self, upstream: String) -> Result<ProxyStatus, String> {
        // if already running, stop first
        self.stop().await.ok();
        let inner = self.inner.clone();
        // bind to 0 to get random free port, or 19840 if available
        let try_ports = [19840u16, 0u16];
        let mut last_err = String::new();
        for &p in &try_ports {
            let addr: SocketAddr = format!("127.0.0.1:{}", p).parse().unwrap();
            match tokio::net::TcpListener::bind(addr).await {
                Ok(listener) => {
                    let local_addr = listener.local_addr().map_err(|e| e.to_string())?;
                    let port = local_addr.port();
                    let address = local_addr.to_string();
                    let (tx, rx) = oneshot::channel::<()>();
                    let app_state = upstream.clone();
                    let router = Router::new()
                        .route("/*path", any(proxy_handler))
                        .route("/", any(proxy_handler))
                        .with_state(app_state);

                    let handle = tokio::spawn(async move {
                        axum::serve(listener, router)
                            .with_graceful_shutdown(async move {
                                let _ = rx.await;
                            })
                            .await
                            .ok();
                    });

                    {
                        let mut g = inner.lock().unwrap();
                        g.is_running = true;
                        g.port = port;
                        g.address = address.clone();
                        g.upstream = upstream.clone();
                        g.shutdown_tx = Some(tx);
                        g.handle = Some(handle);
                    }
                    log::info!("Proxy started at {} upstream {}", address, upstream);
                    return Ok(ProxyStatus {
                        is_running: true,
                        address,
                        port,
                        upstream,
                    });
                }
                Err(e) => {
                    last_err = e.to_string();
                    continue;
                }
            }
        }
        Err(format!("bind failed: {}", last_err))
    }

    pub async fn stop(&self) -> Result<(), String> {
        let (tx, handle) = {
            let mut g = self.inner.lock().unwrap();
            if !g.is_running {
                return Ok(());
            }
            let tx = g.shutdown_tx.take();
            let h = g.handle.take();
            g.is_running = false;
            g.port = 0;
            g.address = "127.0.0.1:0".to_string();
            (tx, h)
        };
        if let Some(tx) = tx {
            let _ = tx.send(());
        }
        if let Some(h) = handle {
            // wait a bit for graceful shutdown, but don't block forever
            let _ = tokio::time::timeout(std::time::Duration::from_millis(800), h).await;
        }
        log::info!("Proxy stopped");
        Ok(())
    }
}

async fn proxy_handler(
    State(upstream): State<String>,
    req: Request<Body>,
) -> impl IntoResponse {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = req.method().clone();
    let headers = req.headers().clone();
    // For W2 minimal: just return a JSON that shows proxy is alive, and echo request.
    // In W3 we will do real forward via hyper.
    let body = format!(
        r#"{{"proxy":"Agent Workbench W2","upstream":"{}","method":"{}","path":"{}{}","headers":{}}}"#,
        upstream,
        method,
        path,
        query,
        headers_to_json(&headers)
    );
    let mut resp_headers = HeaderMap::new();
    resp_headers.insert("content-type", "application/json".parse().unwrap());
    resp_headers.insert("x-proxy-by", "agent-workbench".parse().unwrap());
    (resp_headers, body)
}

fn headers_to_json(headers: &HeaderMap) -> String {
    let mut m = serde_json::Map::new();
    for (k, v) in headers.iter() {
        if let Ok(s) = v.to_str() {
            m.insert(k.to_string(), serde_json::Value::String(s.to_string()));
        }
    }
    serde_json::Value::Object(m).to_string()
}
