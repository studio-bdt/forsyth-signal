import {
    initializeMap,
    addEventMarkers,
    addEventGeometry,
    selectEventGeometry,
    getMap,
    flyTo,
    isMapReady,
    setSelectedEvent
} from './map.js?v=forsyth-county-boundary';

import {
    setEvents,
    getEvents,
    setState,
    setCategory,
    setSearch,
    selectEvent,
    renderEvents
} from './events.js?v=unique-event-keys-polygon-perf';

import {
    initializeSearch
} from './search.js';

import {
    initializeAddressSearch,
    setAddressEvents
} from './address.js?v=clickable-nearby-events';

const eventsContainer = document.getElementById('events');
const detailsContainer = document.getElementById('details');
const eventCount = document.getElementById('event-count');
const searchInput = document.getElementById('search');
const categoryFilter = document.getElementById('category-filter');
const addressSearch = document.getElementById('address-search');
const addressSubmit = document.getElementById('address-submit');
const addressResults = document.getElementById('address-results');

let allEvents = [];
let addressSearchInitialized = false;
let mapEventsRendered = false;
const EVENTS_CACHE_NAME = 'forsyth-signal-events-v1';
const EVENTS_CACHE_URL = '/api/events';

function render() {
    renderEvents(eventsContainer, eventCount, showEvent);
}

function showEvent(event, source = 'list', mapLocation = null) {
    document.getElementById('event-group-panel').hidden = true;
    selectEvent(event.id);
    const isMapSelection = source.startsWith('map-');

    if (isMapSelection) {
        const state = event.state;
        if (state) {
            setState(state);
            document.querySelectorAll('.event-tab').forEach(button => {
                button.classList.toggle('is-active', button.dataset.state === state);
            });
        }

        const categoryOption = [...categoryFilter.options]
            .find(option => option.value === event.category);
        const category = categoryOption ? event.category : 'all';
        setCategory(category);
        categoryFilter.value = category;
        setSearch('');
        searchInput.value = '';
        searchInput.parentElement.querySelector('.search-clear').hidden = true;
    }

    const location = String(event.location ?? event.address ?? '').trim();

    const hasCoordinates = event.latitude != null && event.longitude != null && String(event.latitude).trim() !== '' && String(event.longitude).trim() !== '' && Number.isFinite(Number(event.latitude)) && Number.isFinite(Number(event.longitude));

    let mapsUrl = '';

    if (hasCoordinates) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
    } else if (location) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    }

    let calendarUrl = '';
    const dateOnly = String(event.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (event.state === 'upcoming' && dateOnly) {
        const [, year, month, day] = dateOnly;
        const calendarUrlObject = new URL('https://calendar.google.com/calendar/render');
        calendarUrlObject.search = new URLSearchParams({
            action: 'TEMPLATE',
            text: event.title,
            dates: `${year}${month}${day}/${nextCalendarDay(year, month, day)}`,
            location,
            details: event.description ?? '',
        }).toString();

        calendarUrl = calendarUrlObject.href;
    } else {
        const start = new Date(event.date);
        if (event.state === 'upcoming' && event.date && !Number.isNaN(start.getTime())) {
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const toGoogleDate = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
            const calendarUrlObject = new URL('https://calendar.google.com/calendar/render');
            calendarUrlObject.search = new URLSearchParams({
                action: 'TEMPLATE',
                text: event.title,
                dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
                location,
                details: event.description ?? '',
            }).toString();
            calendarUrl = calendarUrlObject.href;
        }
    }

    detailsContainer.innerHTML = `
        <div class='details-category'>
            ${event.category}
        </div>

        <h2>
            ${escapeHtml(event.title)}
        </h2>

        <div class='details-status'>
            ${escapeHtml(event.status || event.state)}
        </div>

        ${
            event.summary
                ? `
                    <p>
                        <strong>
                            ${escapeHtml(event.summary)}
                        </strong>
                    </p>
                `
                : ''
        }

        <div class='why-matter'>
            <div class='why-matter-title'>
                Why does this matter?
            </div>

            <div class='why-matter-text'>
                ${escapeHtml(
                    getWhyItMatters(event)
                )}
            </div>
        </div>

        ${
            event.description
                ? `
                    <p>
                        ${escapeHtml(
                            event.description
                        )}
                    </p>
                `
                : ''
        }

        <div class='details-section'>
            <div class='details-label'>
                LOCATION
            </div>

            <div>
                ${escapeHtml(event.location)}
            </div>
        </div>

        ${
            event.date
                ? `
                    <div class='details-section'>
                        <div class='details-label'>
                            DATE
                        </div>

                        <div>
                            ${escapeHtml(event.date)}
                        </div>
                    </div>
                `
                : ''
        }

        ${
            mapsUrl || calendarUrl
                ? `
                    <div class='event-actions'>
                        ${
                            mapsUrl
                                ? `
                                    <a class='event-action-link'
                                    href='${escapeAttribute(mapsUrl)}'
                                    target='_blank'
                                    rel='noopener noreferrer'>
                                        Open in Google Maps
                                    </a>
                                `
                                : ''
                        }

                        ${
                            calendarUrl
                                ? `
                                    <a class='event-action-link event-action-link--calendar'
                                    href='${escapeAttribute(calendarUrl)}'
                                    target='_blank'
                                    rel='noopener noreferrer'>
                                        Add to Google Calendar
                                    </a>
                                `
                                : ''
                        }
                    </div>
                `
                : ''
        }

        ${
            event.source_url
                ? `
                    <div class='details-section'>
                        <a class='details-source-link' href='${escapeAttribute(event.source_url)}' target='_blank' rel='noopener noreferrer'>
                            Official Source →
                        </a>
                    </div>
                `
                : ''
        }
    `;

    if (event.geometry !== null && event.geometry !== undefined) {
        if (isMapReady()) {
            selectEventGeometry(event, {fitBounds: !isMapSelection});
        } else {
            setSelectedEvent(event.id);
        }
    }

    if (isMapReady() && source === 'map-zone' && mapLocation) {
        zoomToMapLocation(mapLocation);
    } else if (isMapReady() && source === 'map-marker' &&
        event.latitude !== null && event.longitude !== null) {
        flyTo(event.latitude, event.longitude);
    } else if (!event.geometry) {
        setSelectedEvent(event.id);
        if (isMapReady() && !isMapSelection &&
            event.latitude !== null && event.longitude !== null) {
            flyTo(event.latitude, event.longitude);
        }
    }

    render();
    if (window.matchMedia('(max-width: 900px)').matches) {
        setMobilePanel(isMapSelection ? 'events-panel' : 'details-panel', false);
    }
}

function showMapEvent(event, source = 'map-marker', mapLocation = null) {
    showEvent(event, source, mapLocation);
}

function zoomToMapLocation(location) {
    const map = getMap();
    const currentZoom = map.getZoom();
    map.easeTo({
        center: location,
        zoom: Math.min(16, Math.max(currentZoom + 1.5, 14)),
        duration: 550
    });
}

function getWhyItMatters(event) {
    if (event.why_it_matters) {
        return event.why_it_matters;
    }

    if (event.category === 'development') {
        if (event.state === 'upcoming') {
            return 'This development is an upcoming proposal or hearing that may affect how land is used in Forsyth County.';
        }

        if (event.state === 'active') {
            return 'This development is currently being reviewed or considered and may affect nearby property, traffic, or land use.';
        }

        return 'This development has already been decided, but the record can help residents understand changes occurring in their community.';
    }

    if (event.category === 'education') {
        return 'Board of Education decisions can affect students, families, schools, budgets, and education policy across Forsyth County.';
    }

    if (event.category === 'transportation') {
        return 'Transportation projects and decisions can affect traffic, travel times, road access, and future development.';
    }

    if (event.category === 'government') {
        return 'This is a public government proceeding where decisions affecting Forsyth County residents may be discussed or made.';
    }

    return 'This is a local government or community event that may provide information about decisions and changes in Forsyth County.';
}


function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}


function escapeAttribute(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function nextCalendarDay(year, month, day) {
    const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
    return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function syncMapEvents() {
    if (!isMapReady() || mapEventsRendered || allEvents.length === 0) {
        return;
    }

    mapEventsRendered = true;
    addEventGeometry(allEvents, showMapEvent);
    addEventMarkers(allEvents, showMapEvent);
}

function applyEvents(events) {
    allEvents = events;
    setEvents(allEvents);
    allEvents = getEvents();
    render();

    if (!addressSearchInitialized) {
        initializeAddressSearch({
            input: addressSearch,
            button: addressSubmit,
            results: addressResults,
            events: allEvents,
            onEventSelect: showEvent
        });
        addressSearchInitialized = true;
    } else {
        setAddressEvents(allEvents);
    }

    if (isMapReady()) {
        mapEventsRendered = false;
        syncMapEvents();
    }
}

async function loadEvents() {
    const eventsRequest = fetch(EVENTS_CACHE_URL, {cache: 'no-cache'}).then(
        response => ({response}),
        error => ({error})
    );

    try {
        if ('caches' in window) {
            const cache = await caches.open(EVENTS_CACHE_NAME);
            const cachedResponse = await cache.match(EVENTS_CACHE_URL);
            if (cachedResponse) {
                const events = await cachedResponse.json();
                if (!Array.isArray(events)) {
                    throw new Error('Cached event data is not an array');
                }
                applyEvents(events);
            }
        }
    } catch (error) {
        console.error('Failed to read cached events:', error);
    }

    try {
        const result = await eventsRequest;
        if (result.error) {
            throw result.error;
        }
        const response = result.response;

        if (!response.ok) {
            throw new Error(`API returned: ${response.status}`);
        }

        const responseForCache = response.clone();
        const events = await response.json();
        if (!Array.isArray(events)) {
            throw new Error('Events API returned an invalid response');
        }
        applyEvents(events);
        if ('caches' in window) {
            try {
                const cache = await caches.open(EVENTS_CACHE_NAME);
                await cache.put(EVENTS_CACHE_URL, responseForCache);
            } catch (error) {
                console.error('Failed to cache events:', error);
            }
        }
    } catch (error) {
        console.error('Failed to load events:', error);

        if (allEvents.length === 0) {
            eventsContainer.innerHTML = `
                <div class='error'>
                    Failed to load events.
                </div>
            `;
        }
    }
}

document.querySelectorAll('.event-tab').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.event-tab').forEach(other => other.classList.remove('is-active'));
        button.classList.add('is-active');
        setState(button.dataset.state);
        render();
    });
});

categoryFilter.addEventListener('change', () => {
    setCategory(categoryFilter.value);
    render();
});

initializeSearch({
    eventSearch: searchInput,
    locationSearch: document.getElementById('location-search'),
    locationResults: document.getElementById('location-results'),
    onEventSearch: search => {setSearch(search); render();}
});

window.addEventListener('location-selected', event => {
    flyTo(event.detail.latitude, event.detail.longitude);
    const locationSearch = document.getElementById('location-search');
    locationSearch.value = event.detail.name;
    locationSearch.parentElement.querySelector('.search-clear').hidden = false;
});

window.onMapReady = syncMapEvents;

initializeMap(showMapEvent).catch(error => {
    console.error('Failed to initialize map:', error);
    const message = document.createElement('div');
    message.className = 'map-error';
    message.textContent = 'The map could not be loaded. Events are still available in the list.';
    document.getElementById('map-container').appendChild(message);
});
loadEvents();

const mapContainer = document.getElementById('map-container');
const mobilePanelButtons = document.querySelectorAll('#mobile-panel-controls [data-panel]');

function setMobilePanel(panelId, toggle = true) {
    const open = panelId && (
        !toggle || !document.getElementById(panelId).classList.contains('is-open')
    );
    document.querySelectorAll('.mobile-panel').forEach(panel => panel.classList.remove('is-open'));
    mobilePanelButtons.forEach(button => {
        const isActive = open && button.dataset.panel === panelId;
        button.setAttribute('aria-expanded', String(Boolean(isActive)));
        button.classList.toggle('is-active', Boolean(isActive));
    });
    if (open) {
        document.getElementById(panelId).classList.add('is-open');
    }
    mapContainer.classList.toggle('has-open-panel', Boolean(open));
}

mobilePanelButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (document.getElementById('details-panel').classList.contains('is-open')) {
            clearEventSelection();
        }
        setMobilePanel(button.dataset.panel);
    });
});
document.querySelectorAll('.panel-close').forEach(button => {
    button.addEventListener('click', () => {
        clearEventSelection();
        setMobilePanel(null);
    });
});

function enableMobilePanelDragging(panelId, handleId) {
    const panel = document.getElementById(panelId);
    const handle = document.getElementById(handleId);
    const snapRatios = [0.35, 0.62, 1];
    let activePointerId = null;
    let startY = 0;
    let startHeight = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    handle.addEventListener('pointerdown', event => {
        if (!window.matchMedia('(max-width: 900px)').matches ||
            event.button !== 0 ||
            event.target.closest('button')) {
            return;
        }

        activePointerId = event.pointerId;
        startY = event.clientY;
        lastY = event.clientY;
        lastTime = event.timeStamp;
        startHeight = panel.getBoundingClientRect().height;
        velocity = 0;
        panel.style.setProperty('--panel-height', `${startHeight}px`);
        handle.setPointerCapture(event.pointerId);
        panel.classList.add('is-dragging');
    });

    handle.addEventListener('pointermove', event => {
        if (event.pointerId !== activePointerId) {
            return;
        }

        const deltaTime = event.timeStamp - lastTime;
        if (deltaTime > 0) {
            velocity = (event.clientY - lastY) / deltaTime;
        }
        lastY = event.clientY;
        lastTime = event.timeStamp;

        const maxHeight = Math.max(180, panel.parentElement.clientHeight - 180);
        const height = Math.max(180, Math.min(maxHeight, startHeight + startY - event.clientY));
        panel.style.setProperty('--panel-height', `${height}px`);
    });

    const finishDragging = event => {
        if (event.pointerId !== activePointerId) {
            return;
        }

        activePointerId = null;
        panel.classList.remove('is-dragging');
        const maxHeight = Math.max(180, panel.parentElement.clientHeight - 180);
        const dragDistance = event.clientY - startY;
        const momentum = Math.abs(dragDistance) > 40
            ? Math.max(-0.8, Math.min(0.8, velocity)) * 100
            : 0;
        const projectedHeight = Math.max(
            180,
            Math.min(maxHeight, panel.getBoundingClientRect().height - momentum)
        );
        const snapHeights = snapRatios.map(ratio => Math.min(maxHeight, maxHeight * ratio));
        const snapHeight = snapHeights.reduce((closest, height) =>
            Math.abs(height - projectedHeight) < Math.abs(closest - projectedHeight)
                ? height
                : closest
        );
        panel.style.setProperty('--panel-height', `${snapHeight}px`);
    };

    handle.addEventListener('pointerup', finishDragging);
    handle.addEventListener('pointercancel', finishDragging);
}

enableMobilePanelDragging('events-panel', 'events-header');
enableMobilePanelDragging('details-panel', 'details-header');

function clearEventSelection() {
    selectEvent(null);
    setSelectedEvent(null);
    detailsContainer.innerHTML = '<p>Select an event</p>';
    render();
}

document.getElementById('events-back-to-top').addEventListener('click', () => {
    const eventsPanel = document.getElementById('events-panel');
    if (window.matchMedia('(max-width: 900px)').matches) {
        eventsPanel.scrollTo({top: 0, behavior: 'smooth'});
    } else {
        document.getElementById('events').scrollTo({top: 0, behavior: 'smooth'});
    }
});

const eventsPanel = document.getElementById('events-panel');
const backToTopButton = document.getElementById('events-back-to-top');

eventsPanel.addEventListener('scroll', () => {
    if (!window.matchMedia('(max-width: 900px)').matches) {
        return;
    }

    backToTopButton.hidden = eventsPanel.scrollTop <= 0;
});

const addressPanel = document.getElementById('address-panel');
const addressReopen = document.getElementById('address-reopen');

document.getElementById('address-close')?.addEventListener('click', () => {
    addressPanel.hidden = true;
    addressReopen.hidden = false;
});

addressReopen?.addEventListener('click', () => {
    addressPanel.hidden = false;
    addressReopen.hidden = true;
});