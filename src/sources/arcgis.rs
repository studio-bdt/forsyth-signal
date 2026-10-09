use crate::models::Event;
use reqwest::Client;
use serde_json::{Map, Value};

pub async fn load_events(client: &Client, url: &str, category: &str, title_field: &str, description_fields: &[&str], status_fields: &[&str], date_fields: &[&str], location_fields: &[&str], source_name: &str, default_title: &str) -> Result<Vec<Event>, String> {
    let response = client.get(url).query(&[("where", "1=1"), ("outFields", "*"), ("returnGeometry", "true"), ("outSR", "4326"), ("f", "geojson"),]).send().await.map_err(|error| format!("Failed to contact {source_name}: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("{source_name} returned status {}",response.status()));
    }

    let data: Value = response.json().await.map_err(|error| format!("Invalid GeoJSON from {source_name}: {error}"))?;

    if let Some(error) = data.get("error") {
        return Err(format!("{source_name} returned an error: {error}"));
    }

    let features = data.get("features").and_then(Value::as_array).ok_or_else(|| format!("{source_name} response did not contain features"))?;
    let mut events = Vec::new();

    for (index, feature) in features.iter().enumerate() {
        let properties = match feature.get("properties").and_then(Value::as_object) {
            Some(properties) => properties,
            None => continue,
        };

        let geometry = feature.get("geometry").cloned();
        let title = first_value(properties, &[title_field]).unwrap_or_else(|| default_title.to_string());
        let description = first_value(properties, description_fields).unwrap_or_else(|| format!("{default_title} from {source_name}."));
        let status = first_value(properties, status_fields).unwrap_or_else(|| "Information".to_string());
        let date = first_value(properties, date_fields).unwrap_or_default();
        let location = first_value(properties, location_fields).unwrap_or_else(|| "Forsyth County, Georgia".to_string());
        let (latitude, longitude) = point_coordinates(geometry.as_ref());

        let source_url = first_value(properties, &["Link", "LINK", "Website", "WEBSITE", "URL"]);

        events.push(Event {
            id: format!(
                "{}-{}",
                category,
                properties
                    .get("OBJECTID")
                    .and_then(Value::as_i64)
                    .unwrap_or(index as i64)
            ),
            title,
            category: category.to_string(),
            description,
            latitude,
            longitude,
            location,
            status,
            date,
            source_name: Some(source_name.to_string()),
            source_url,
            geometry,
        });
    }

    Ok(events)
}

pub async fn load_geojson(client: &Client, url: &str, source_name: &str) -> Result<Value, String> {
    let response = client.get(url).query(&[("where", "1=1"), ("outFields", "*"), ("returnGeometry", "true"), ("outSR", "4326"), ("f", "geojson"),]).send().await.map_err(|error| format!("Failed to contact {source_name}: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("{source_name} returned status {}", response.status()));
    }

    let data: Value = response.json().await.map_err(|error| format!("Invalid GeoJSON from {source_name}: {error}"))?;

    if let Some(error) = data.get("error") {
        return Err(format!("{source_name} returned an error: {error}"));
    }

    Ok(data)
}

fn first_value(properties: &Map<String, Value>, fields: &[&str]) -> Option<String> {
    for field in fields {
        if let Some(value) = properties.get(*field) {
            if let Some(text) = value.as_str() {
                if !text.trim().is_empty() {
                    return Some(text.to_string());
                }
            } else if value.is_number() {
                return Some(value.to_string());
            }
        }
    }

    None
}

fn point_coordinates(geometry: Option<&Value>) -> (Option<f64>, Option<f64>) {
    let geometry = match geometry {
        Some(geometry) => geometry,
        None => return (None, None),
    };

    let coordinates = match geometry.get("coordinates").and_then(Value::as_array) {
        Some(coordinates) => coordinates,
        None => return (None, None),
    };

    match geometry.get("type").and_then(Value::as_str) {
        Some("Point") => coordinate_pair(coordinates).map(|(longitude, latitude)| (Some(latitude), Some(longitude))).unwrap_or((None, None)),
        Some("Polygon") => polygon_center(coordinates).map(|(longitude, latitude)| (Some(latitude), Some(longitude))).unwrap_or((None, None)),
        Some("MultiPolygon") => multi_polygon_center(coordinates).map(|(longitude, latitude)| (Some(latitude), Some(longitude))).unwrap_or((None, None)),
        _ => (None, None)
    }
}

fn coordinate_pair(value: &[Value]) -> Option<(f64, f64)> {
    let longitude = value.first()?.as_f64()?;
    let latitude = value.get(1)?.as_f64()?;
    Some((longitude, latitude))
}

fn polygon_center(coordinates: &[Value]) -> Option<(f64, f64)> {
    let outer_ring = coordinates.first()?.as_array()?;
    ring_centroid(outer_ring).map(|(longitude, latitude, _)| (longitude, latitude))
}

fn multi_polygon_center(coordinates: &[Value]) -> Option<(f64, f64)> {
    let mut weighted_longitude = 0.0;
    let mut weighted_latitude = 0.0;
    let mut total_area = 0.0;

    for polygon in coordinates {
        let Some(outer_ring) = polygon.as_array().and_then(|rings| rings.first()).and_then(Value::as_array)
        else {
            continue;
        };
        let Some((longitude, latitude, area)) = ring_centroid(outer_ring) else {
            continue;
        };

        weighted_longitude += longitude * area;
        weighted_latitude += latitude * area;
        total_area += area;
    }

    (total_area > f64::EPSILON).then_some((weighted_longitude / total_area, weighted_latitude / total_area))
}

fn ring_centroid(ring: &[Value]) -> Option<(f64, f64, f64)> {
    let points: Vec<(f64, f64)> = ring.iter().filter_map(|value| {value.as_array().and_then(|coordinates| coordinate_pair(coordinates))}).collect();

    if points.len() < 3 {
        return None;
    }

    let mut twice_area = 0.0;
    let mut longitude_sum = 0.0;
    let mut latitude_sum = 0.0;

    for index in 0..points.len() {
        let (longitude, latitude) = points[index];
        let (next_longitude, next_latitude) = points[(index + 1) % points.len()];
        let cross_product = longitude * next_latitude - next_longitude * latitude;
        twice_area += cross_product;
        longitude_sum += (longitude + next_longitude) * cross_product;
        latitude_sum += (latitude + next_latitude) * cross_product;
    }

    if twice_area.abs() <= f64::EPSILON {
        return None;
    }

    Some((
        longitude_sum / (3.0 * twice_area),
        latitude_sum / (3.0 * twice_area),
        twice_area.abs() / 2.0,
    ))
}
