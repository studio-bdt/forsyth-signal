// IF YOU ARE RUNNING ON A LOCAL DEVELOPMENT SERVER, RUN ```cargo run --bin forsyth-signal```

use axum::{
    routing::get,
    Router,
};

use tower_http::services::ServeDir;
use forsyth_signal::api;

#[tokio::main]
async fn main() {
    let api = Router::new().route("/events", get(api::get_events)).route("/schools", get(api::get_schools));
    let app = Router::new().nest("/api", api).fallback_service(ServeDir::new("web"));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();

    println!("Forsyth Signal running at http://localhost:3000");

    axum::serve(listener, app).await.unwrap();
}