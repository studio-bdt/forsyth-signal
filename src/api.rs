use axum::Json;
use reqwest::Client;
use serde_json::Value;
use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

use crate::models::Event;
use crate::sources::{arcgis,meetings,};

const ZONING_URL: &str = "https://geo.forsythco.com/gisworkflow/rest/services/Public/Zoning_Applications/FeatureServer/0/query";
const INSIGHT_URL: &str = "https://geo.forsythco.com/gis3/rest/services/Public/Insight2Forsyth/FeatureServer";
const SCHOOLS_URL: &str = "https://services2.arcgis.com/StQaZGYzUARPnrpL/ArcGIS/rest/services/Public_School/FeatureServer/0/query";
const PARKS_URL: &str = "https://services2.arcgis.com/StQaZGYzUARPnrpL/ArcGIS/rest/services/Park_Facility/FeatureServer/0/query";
const ZONING_DISTRICTS_URL: &str = "https://geo.forsythco.com/gisworkflow/rest/services/Public/Zoning_Districts/FeatureServer/0/query";
const EVENTS_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const LOCAL_EVENTS: &str = include_str!("../data/events.json");

struct CachedEvents {
    loaded_at: Instant,
    events: Vec<Event>,
}

static EVENTS_CACHE: OnceLock<Mutex<Option<CachedEvents>>> = OnceLock::new();

pub async fn get_events() -> Result<Json<Vec<Event>>, (axum::http::StatusCode, String)> {
    let mut cache = EVENTS_CACHE.get_or_init(|| Mutex::new(None)).lock().await;

    if let Some(cached) = cache.as_ref() {
        if cached.loaded_at.elapsed() < EVENTS_CACHE_TTL {
            return Ok(Json(cached.events.clone()));
        }
    }

    let events = load_events().await?;
    *cache = Some(CachedEvents {
        loaded_at: Instant::now(),
        events: events.clone(),
    });

    Ok(Json(events))
}

pub async fn get_schools() -> Result<Json<Vec<Event>>, (axum::http::StatusCode, String)> {
    let client = Client::new();
    let mut schools = arcgis::load_events(
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
    ).await.map_err(bad_gateway)?;
    schools.sort_by(|first, second| first.title.cmp(&second.title));
    Ok(Json(schools))
}

pub async fn load_events() -> Result<Vec<Event>, (axum::http::StatusCode, String)> {
    let client = Client::new();
    let insight_urls = std::array::from_fn::<_, 5, _>(|index| format!("{INSIGHT_URL}/{index}/query"));

    let (mut zoning, mut planning_hearings, mut permits, mut zoning_applications, mut participation_signs, mut hearing_signs) = tokio::try_join!(
        arcgis::load_events(&client, ZONING_URL, "development", "ZANUMBER", &["COMMENTS", "PROCESS"], &["ZASTATUS"], &[], &["LOCATION", "ADDRESS"], "Forsyth County GIS", "Zoning Application"),
        arcgis::load_events(&client, &insight_urls[0], "development", "ProjectName", &["PlanType", "PlanWorkClass"], &["PlanStatus", "SubmittalStatus"], &["CompletionDate", "ApplicationDate", "LastChangedDate"], &["Address", "LOCATION", "ProjectName"], "Forsyth County Planning & Community Development", "Planning Hearing"),
        arcgis::load_events(&client, &insight_urls[1], "development", "ProjectName", &["PlanType", "PlanWorkClass"], &["PlanStatus", "SubmittalStatus"], &["ApplicationDate", "LastChangedDate", "CompletionDate"], &["Address", "LOCATION", "ProjectName"], "Forsyth County Planning & Community Development", "New Permit"),
        arcgis::load_events(&client, &insight_urls[2], "development", "ProjectName", &["PlanType", "PlanWorkClass", "COMMENTS"], &["PlanStatus", "SubmittalStatus"], &["ApplicationDate", "LastChangedDate", "CompletionDate"], &["Address", "LOCATION", "ProjectName"], "Forsyth County Planning & Community Development", "Zoning Application"),
        arcgis::load_events(&client, &insight_urls[3], "public-notice", "ProjectName", &["PlanType", "PlanWorkClass"], &["PlanStatus", "SubmittalStatus"], &["ApplicationDate", "LastChangedDate"], &["Address", "LOCATION", "ProjectName"], "Forsyth County Planning & Community Development", "Public Participation Sign"),
        arcgis::load_events(&client, &insight_urls[4], "public-notice", "ProjectName", &["PlanType", "PlanWorkClass"], &["PlanStatus", "SubmittalStatus"], &["ApplicationDate", "LastChangedDate"], &["Address", "LOCATION", "ProjectName"], "Forsyth County Planning & Community Development", "Hearing Sign"),
    ).map_err(bad_gateway)?;

    let mut events = load_local_events()?;
    events.append(&mut zoning);
    events.append(&mut planning_hearings);
    events.append(&mut permits);
    events.append(&mut zoning_applications);
    events.append(&mut participation_signs);
    events.append(&mut hearing_signs);

    events.extend(meetings::load_meetings());

    Ok(events)
}

pub async fn get_layers() -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    let client = Client::new();

    let schools = arcgis::load_geojson(&client, SCHOOLS_URL, "Forsyth County Schools GIS",).await.map_err(bad_gateway)?;
    let parks = arcgis::load_geojson(&client, PARKS_URL, "Forsyth County Parks & Recreation GIS",).await.map_err(bad_gateway)?;

    let zoning = arcgis::load_geojson(&client, ZONING_DISTRICTS_URL, "Forsyth County GIS",).await.map_err(bad_gateway)?;

    Ok(Json(serde_json::json!({"schools": schools, "parks": parks, "zoning": zoning})))
}

fn load_local_events() -> Result<Vec<Event>, (axum::http::StatusCode, String)> {
    serde_json::from_str(LOCAL_EVENTS).map_err(|error| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to parse data/events.json: {error}"),))
}

fn bad_gateway(error: String) -> (axum::http::StatusCode, String) {
    (
        axum::http::StatusCode::BAD_GATEWAY,
        error,
    )
}
