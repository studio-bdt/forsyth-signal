use reqwest::Client;
use serde_json::Value;
use vercel_runtime::{run, service_fn, Error, Request};

const SCHOOLS_URL: &str = "https://services2.arcgis.com/StQaZGYzUARPnrpL/ArcGIS/rest/services/Public_School/FeatureServer/0/query";

#[tokio::main]
async fn main() -> Result<(), Error> {
    run(service_fn(handler)).await
}

async fn handler(_request: Request) -> Result<Value, Error> {
    let client = Client::new();
    let mut schools = forsyth_signal::sources::arcgis::load_events(
        &client,
        SCHOOLS_URL,
        "schools",
        "SCH_NAME",
        &["TYPE", "GRDRANGE"],
        &["STATE"],
        &["YEAR_OPEN"],
        &["ADDRESS", "CITY", "ZIP"],
        "Forsyth County Schools GIS",
        "School",
    )
    .await
    .map_err(std::io::Error::other)?;

    schools.sort_by(|first, second| first.title.cmp(&second.title));
    Ok(serde_json::to_value(schools)?)
}
