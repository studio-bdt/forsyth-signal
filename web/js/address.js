import {
    distanceMiles,
    escapeHtml
} from './utils.js';

import {
    addAddressMarker,
    flyTo,
    isMapReady
} from './map.js?v=group-switch-selection';

let addressMarker = null;
let savedAddress = null;
let addressEvents = [];

export function setAddressEvents(events) {
    addressEvents = events;
}

export function initializeAddressSearch({input, button, results, events, onEventSelect}) {
    addressEvents = events;
    results.addEventListener('click', event => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const result = event.target.closest('.impact-event');
        if (!result) {
            return;
        }

        const selectedEvent = addressEvents.find(
            item => String(item.id) === result.dataset.eventId
        );
        if (selectedEvent) {
            onEventSelect(selectedEvent, 'address-result');
        }
    });

    const saved = localStorage.getItem('forsyth-signal-address');

    if (saved) {
        try {
            savedAddress = JSON.parse(saved);
            input.value = savedAddress.name;
        } catch {
            localStorage.removeItem('forsyth-signal-address');
        }
    }

    async function search() {
        const query = input.value.trim();

        if (!query) {
            return;
        }

        button.disabled = true;
        button.textContent = 'Searching...';

        try {
            const result = await geocodeAddress(query);

            if (!result) {
                results.innerHTML = `
                    <div class='address-result'>
                        No address found.
                    </div>
                `;

                return;
            }

            savedAddress = {
                name: result.display_name,
                latitude: Number(result.lat),
                longitude: Number(result.lon)
            };

            localStorage.setItem('forsyth-signal-address', JSON.stringify(savedAddress));

            const nearby = findNearbyEvents(savedAddress, addressEvents);

            if (isMapReady()) {
                if (addressMarker) {
                    addressMarker.remove();
                }

                addressMarker = addAddressMarker(
                    savedAddress.latitude,
                    savedAddress.longitude
                );

                if (nearby.length > 0) {
                    flyTo(savedAddress.latitude, savedAddress.longitude, 14);
                }
            }

            renderImpact(results, nearby);
        } catch (error) {
            console.error('Address search failed:', error);

            results.innerHTML = `
                <div class='address-result'>
                    Address search failed.
                </div>
            `;
        } finally {
            button.disabled = false;
            button.textContent = 'Find';
        }
    }

    button.addEventListener('click', search);

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {

            search();

        }
    });
}

async function geocodeAddress(query) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(query);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
    }

    const results = await response.json();

    return results[0] || null;
}


function findNearbyEvents(address, events) {
    return events.filter(event => event.latitude !== null && event.longitude !== null).map(event => ({event, distance: distanceMiles(address.latitude, address.longitude, event.latitude, event.longitude)})).filter(item => item.distance <= 2).sort((a, b) => a.distance - b.distance);
}

function renderImpact(container, nearby) {
    if (nearby.length === 0) {
        container.innerHTML = `
            <div class='address-result'>
                <strong>
                    No nearby events
                </strong>
                Nothing currently recorded
                within 2 miles of this address.
            </div>
        `;

        return;
    }

    const direct = nearby.filter(item => item.distance <= 0.25);
    const close = nearby.filter(item => item.distance > 0.25 && item.distance <= 1);
    const farther = nearby.filter(item => item.distance > 1);

    let html = `
        <div class='impact-heading'>
            ${nearby.length}
            nearby event${nearby.length === 1 ? '' : 's'}
        </div>
    `;

    if (direct.length > 0) {
        html += `
            <div class='impact-heading'>
                Very close to your address
            </div>
        `;

        html += renderImpactGroup(direct);
    }

    if (close.length > 0) {
        html += `
            <div class='impact-heading'>
                Within 1 mile
            </div>
        `;

        html += renderImpactGroup(close);
    }

    if (farther.length > 0) {
        html += `
            <div class='impact-heading'>
                Within 2 miles
            </div>
        `;

        html += renderImpactGroup(farther);
    }

    container.innerHTML = html;
}

function renderImpactGroup(events) {
    return events.map(item => `
        <button class='impact-event' type='button' data-event-id='${escapeHtml(item.event.id)}'>
            <strong>
                ${escapeHtml(
                    item.event.title
                )}
            </strong>

            <div class='impact-distance'>
                ${item.distance.toFixed(1)} miles away
            </button>
        </div>
    `).join('');
}