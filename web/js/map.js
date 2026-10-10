let maplibregl;
let map;
let selectedZoningId = null;
const selectedGeometryIds = new Set();
let mapReady = false;
let geometryEvents = [];
let eventMarkers = [];
const LAST_USER_POSITION_KEY = 'forsyth-signal-last-user-position';

function getLastUserPosition() {
    try {
        const saved = localStorage.getItem(LAST_USER_POSITION_KEY);
        if (!saved) {
            return null;
        }

        const position = JSON.parse(saved);
        if (position &&
            typeof position === 'object' &&
            Number.isFinite(position.latitude) &&
            Number.isFinite(position.longitude) &&
            Math.abs(position.latitude) <= 90 &&
            Math.abs(position.longitude) <= 180) {
            return position;
        }

        console.error('Saved user position is invalid.');
        localStorage.removeItem(LAST_USER_POSITION_KEY);
    } catch (error) {
        console.error('Failed to read saved user position:', error);
    }

    return null;
}

export async function initializeMap(onEventSelect) {
    maplibregl = await import('https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs');
    const lastPosition = getLastUserPosition();
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                osm: {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors'
                }
            },
            layers: [
                {
                    id: 'osm',
                    type: 'raster',
                    source: 'osm'
                }
            ]
        },
        center: lastPosition
            ? [lastPosition.longitude, lastPosition.latitude]
            : [-84.14, 34.21],
        zoom: lastPosition ? 14 : 10
    });
    map.scrollZoom.setWheelZoomRate(1 / 600);

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        trackUserLocation: false,
        showUserLocation: true,
        showAccuracyCircle: true
    });
    geolocateControl.on('geolocate', event => {
        const position = {
            latitude: event.coords.latitude,
            longitude: event.coords.longitude
        };

        try {
            localStorage.setItem(LAST_USER_POSITION_KEY, JSON.stringify(position));
        } catch (error) {
            console.error('Failed to save user position:', error);
        }
    });
    map.addControl(geolocateControl, 'top-right');

    if (lastPosition) {
        new maplibregl.Marker({color: '#344F1F'})
            .setLngLat([lastPosition.longitude, lastPosition.latitude])
            .addTo(map);
    }

    map.on('load', () => {
        map.addSource('forsyth-county-boundary', {
            type: 'geojson',
            data: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=GEOID%3D%2713117%27&outFields=NAME%2CGEOID&returnGeometry=true&outSR=4326&f=geojson'
        });
        map.addLayer({
            id: 'forsyth-county-boundary-fill',
            type: 'fill',
            source: 'forsyth-county-boundary',
            paint: {
                'fill-color': '#344F1F',
                'fill-opacity': 0.08
            }
        });
        map.addLayer({
            id: 'forsyth-county-boundary-outline',
            type: 'line',
            source: 'forsyth-county-boundary',
            paint: {
                'line-color': '#344F1F',
                'line-opacity': 0.65,
                'line-width': 2.5
            }
        });

        mapReady = true;
        if (window.onMapReady) {
            window.onMapReady();
        }
    });
}

export function getMap() {
    return map;
}

export function isMapReady() {
    return mapReady;
}

export function addEventMarkers(events, onEventSelect) {
    for (const {marker} of eventMarkers) {
        marker.remove();
    }
    eventMarkers = [];

    const eventsByLocation = new Map();
    for (const event of events) {
        const isArea = event.geometry?.type === 'Polygon' || event.geometry?.type === 'MultiPolygon';
        if (isArea) {
            continue;
        }

        const latitude = Number(event.latitude);
        const longitude = Number(event.longitude);
        if (event.latitude === null || event.longitude === null ||
            !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
        }

        const coordinates = [longitude, latitude];
        const key = `${longitude},${latitude}`;
        let locationGroup = eventsByLocation.get(key);
        if (!locationGroup) {
            locationGroup = {events: [], coordinates};
            eventsByLocation.set(key, locationGroup);
        }
        locationGroup.events.push(event);
    }

    for (const {events: eventsAtLocation, coordinates} of eventsByLocation.values()) {
        eventsAtLocation.sort((first, second) =>
            String(first.date || '').localeCompare(String(second.date || ''))
        );
        const marker = new maplibregl.Marker()
            .setLngLat(coordinates)
            .addTo(map);
        const markerElement = marker.getElement();
        markerElement.setAttribute('role', 'button');
        markerElement.tabIndex = 0;

        if (eventsAtLocation.length > 1) {
            markerElement.classList.add('has-event-group');
            const count = document.createElement('span');
            count.className = 'event-marker-count';
            count.textContent = String(eventsAtLocation.length);
            count.setAttribute('aria-hidden', 'true');
            markerElement.appendChild(count);
            markerElement.setAttribute(
                'aria-label',
                `${eventsAtLocation.length} events at this exact location`
            );
            markerElement.title = `${eventsAtLocation.length} events at this exact location`;
        } else {
            markerElement.setAttribute('aria-label', eventsAtLocation[0].title);
            markerElement.title = eventsAtLocation[0].title;
        }

        const selectMarkerEvents = clickEvent => {
            clickEvent.stopPropagation();
            if (eventsAtLocation.length === 1) {
                onEventSelect(eventsAtLocation[0], 'map-marker');
            } else {
                setSelectedEvent(null);
                for (const {marker: otherMarker} of eventMarkers) {
                    otherMarker.getElement().classList.remove('is-selected', 'is-group-open');
                }
                markerElement.classList.add('is-selected', 'is-group-open');
                showEventChooser(
                    eventsAtLocation,
                    (event) => onEventSelect(event, 'map-marker'),
                    'Events at this location'
                );
            }
        };
        markerElement.addEventListener('click', selectMarkerEvents, {capture: true});
        markerElement.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectMarkerEvents(event);
            }
        });

        markerElement.classList.toggle(
            'is-selected',
            eventsAtLocation.some(event => String(event.id) === String(selectedZoningId))
        );
        eventMarkers.push({events: eventsAtLocation, marker});
    }
}

function showEventChooser(events, onEventSelect, headingText) {
    const panel = document.getElementById('event-group-panel');
    const heading = document.getElementById('event-group-title');
    const count = document.getElementById('event-group-count');
    const list = document.getElementById('event-group-list');

    heading.textContent = headingText;
    count.textContent = `${events.length} events · ordered by date`;
    list.replaceChildren();

    const instruction = document.createElement('p');
    instruction.className = 'event-group-instruction';
    instruction.textContent = 'Choose an event to open its full details.';
    list.appendChild(instruction);

    for (const event of events) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-chooser-item';

        const title = document.createElement('span');
        title.className = 'event-chooser-title';
        title.textContent = event.title;
        button.appendChild(title);

        const when = event.date || event.status;
        if (when) {
            const date = document.createElement('span');
            date.className = 'event-chooser-date';
            date.textContent = when;
            button.appendChild(date);
        }

        button.addEventListener('click', () => {
            closeEventChooser();
            onEventSelect(event);
        });
        list.appendChild(button);
    }

    panel.hidden = false;
    document.getElementById('main').classList.add('has-event-chooser');
    list.scrollTop = 0;
    document.getElementById('event-group-close').focus({preventScroll: true});
}

function closeEventChooser() {
    const panel = document.getElementById('event-group-panel');
    if (panel && !panel.hidden) {
        panel.hidden = true;
    }
    document.getElementById('main').classList.remove('has-event-chooser');
    for (const {events, marker} of eventMarkers) {
        const markerElement = marker.getElement();
        markerElement.classList.remove('is-group-open');
        markerElement.classList.toggle(
            'is-selected',
            events.some(event => String(event.id) === String(selectedZoningId))
        );
    }
}

document.getElementById('event-group-close')?.addEventListener('click', () => {
    closeEventChooser();
});

document.addEventListener('click', event => {
    if (!(event.target instanceof Element) ||
        !event.target.closest('#map .maplibregl-canvas')) {
        return;
    }

    const clickOnMarker = eventMarkers.some(({marker}) => {
        const bounds = marker.getElement().getBoundingClientRect();
        return event.clientX >= bounds.left && event.clientX <= bounds.right &&
            event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    });
    if (!clickOnMarker) {
        closeEventChooser();
    }
});

export function addEventGeometry(events, onEventSelect) {
    geometryEvents = events;
    const features = events.filter(event => event.geometry !== null && event.geometry !== undefined)
        .map(event => ({
            type: 'Feature',
            geometry: event.geometry,
            properties: {
                id: event.id
            }
        }));

    const data = {
        type: 'FeatureCollection',
        features
    };

    const existing = map.getSource('event-geometry');

    if (existing) {
        existing.setData(data);
        return;
    }

    map.addSource('event-geometry', {
        type: 'geojson',
        data,
        promoteId: 'id',
        maxzoom: 13,
        tolerance: 0.75
    });

    map.addLayer({
        id: 'event-geometry-fill',
        type: 'fill',
        source: 'event-geometry',
        paint: {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                '#344F1F',
                '#F4991A'
            ],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                0.35,
                0.18
            ]
        }
    });

    map.addLayer({
        id: 'event-geometry-outline',
        type: 'line',
        source: 'event-geometry',
        paint: {
            'line-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                '#344F1F',
                '#F4991A'
            ],
            'line-opacity': 0.9,
            'line-width': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                3,
                2
            ]
        }
    });

    map.on('click', 'event-geometry-fill', event => {
        if (!event.features || event.features.length === 0) {
            return;
        }

        const selectedId = String(event.features[0].properties.id);
        const selectedEvent = geometryEvents.find(item => String(item.id) === selectedId);
        if (selectedEvent) {
            onEventSelect(selectedEvent, 'map-zone', event.lngLat);
        }
    });

    map.on('mouseenter', 'event-geometry-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'event-geometry-fill', () => {
        map.getCanvas().style.cursor = '';
    });
}

export function selectEventGeometry(event, {fitBounds = true} = {}) {
    if (!event.geometry) {
        return;
    }

    const selectedId = String(event.id);
    const alreadySelected = selectedGeometryIds.has(selectedId);
    setSelectedEvent(event.id, {clearGeometry: false});

    if (!alreadySelected) {
        for (const previousId of selectedGeometryIds) {
            map.setFeatureState(
                {source: 'event-geometry', id: previousId},
                {selected: false}
            );
        }
        map.setFeatureState(
            {source: 'event-geometry', id: selectedId},
            {selected: true}
        );
        selectedGeometryIds.clear();
        selectedGeometryIds.add(selectedId);
    }

    if (fitBounds) {
        zoomToGeometry(event.geometry);
    }
}

export function setSelectedEvent(id, {clearGeometry = true} = {}) {
    if (clearGeometry && String(selectedZoningId) !== String(id)) {
        clearSelectedZoning();
    }
    selectedZoningId = id;
    for (const {events, marker} of eventMarkers) {
        marker.getElement().classList.toggle(
            'is-selected',
            events.some(event => String(event.id) === String(id))
        );
    }
    closeEventChooser();
}

function clearSelectedZoning() {
    if (map.getSource('event-geometry')) {
        for (const id of selectedGeometryIds) {
            map.setFeatureState(
                {source: 'event-geometry', id},
                {selected: false}
            );
        }
    }
    selectedGeometryIds.clear();
    selectedZoningId = null;
}

function zoomToGeometry(geometry) {
    const bounds = new maplibregl.LngLatBounds();

    addGeometryToBounds(geometry, bounds);

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {padding: 80, maxZoom: 15, duration: 700});
    }
}

function addGeometryToBounds(geometry, bounds) {
    if (!geometry) {
        return;
    }

    if (geometry.type === 'Point') {
        bounds.extend(geometry.coordinates);
        return;
    }

    if (geometry.type === 'MultiPoint') {
        for (const coordinate of geometry.coordinates) {
            bounds.extend(coordinate);

        }

        return;
    }

    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString' || geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        addCoordinatesToBounds(geometry.coordinates, bounds);
    }
}

function addCoordinatesToBounds(coordinates, bounds) {
    if (!Array.isArray(coordinates)) {
        return;
    }

    if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
        bounds.extend(coordinates);
        return;
    }

    for (const coordinate of coordinates) {
        addCoordinatesToBounds(coordinate, bounds);
    }
}

export function flyTo(latitude, longitude, zoom=14) {
    map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(zoom, map.getZoom()),
        duration: 650
    });
}

export function addAddressMarker(latitude, longitude) {
    const marker = new maplibregl.Marker({color: '#344F1F'}).setLngLat([longitude, latitude]).addTo(map);

    return marker;
}