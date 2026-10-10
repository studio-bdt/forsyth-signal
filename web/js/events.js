import {
    escapeHtml,
    getEventState,
    getCategoryName,
    formatEventDate
} from './utils.js';

let allEvents = [];
let currentState = 'upcoming';
let currentCategory = 'all';
let currentSearch = '';
let selectedEventId = null;
let searchableEvents = [];
let visibleEvents = [];
let renderedEventCount = 0;
const EVENT_BATCH_SIZE = 40;

export function setEvents(events) {
    const idCounts = new Map();
    for (const [index, event] of events.entries()) {
        const id = String(event.id ?? `event-${index}`);
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }

    const idOccurrences = new Map();
    allEvents = events.map((event, index) => {
        const rawId = String(event.id ?? `event-${index}`);
        const occurrence = idOccurrences.get(rawId) || 0;
        idOccurrences.set(rawId, occurrence + 1);

        const normalizedEvent = {
            ...event,
            id: idCounts.get(rawId) > 1 ? `${rawId}::${occurrence}` : rawId,
            date: formatEventDate(event.date)
        };
        return {...normalizedEvent, state: getEventState(normalizedEvent)};
    });
    searchableEvents = allEvents.map(event => [
        event.title,
        event.category,
        event.location,
        event.description,
        event.summary
    ].map(value => String(value ?? '').toLowerCase()).join('\n'));
}

export function getEvents() {
    return allEvents;
}

export function getSelectedEvent() {
    return allEvents.find(event => event.id === selectedEventId);
}

export function selectEvent(id) {
    selectedEventId = id;
}

export function filterEvents() {
    const searchTerms = currentSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

    return allEvents.filter((event, index) => {
        const stateMatches = event.state === currentState;
        const categoryMatches = currentCategory === 'all' || event.category === currentCategory;
        const searchText = searchableEvents[index];
        const searchMatches = searchTerms.every(term => searchText.includes(term));

        return (stateMatches && categoryMatches && searchMatches);
    });
}

export function setState(state) {
    currentState = state;
}

export function setCategory(category) {
    currentCategory = category;
}

export function setSearch(search) {
    currentSearch = search;
}

export function renderEvents(container, countContainer, onSelect) {
    onSelectEvent = onSelect;
    visibleEvents = filterEvents();

    countContainer.textContent = `${visibleEvents.length} event${visibleEvents.length === 1 ? '' : 's'}`;

    container.innerHTML = '';
    container.scrollTop = 0;
    renderedEventCount = 0;

    if (visibleEvents.length === 0) {
        container.innerHTML = `
            <div class='empty'>
                No ${currentState} events found :(
            </div>
        `;
        return;
    }

    const selectedIndex = visibleEvents.findIndex(event => event.id === selectedEventId);
    if (selectedIndex >= EVENT_BATCH_SIZE) {
        const [selectedEvent] = visibleEvents.splice(selectedIndex, 1);
        visibleEvents.unshift(selectedEvent);
    }

    appendEventBatch(container, countContainer);
    if (selectedIndex >= 0) {
        const selectedCard = container.querySelector('.event.is-selected');
        selectedCard?.scrollIntoView({block: 'nearest'});
    }
}

function appendEventBatch(container, countContainer) {
    const end = Math.min(renderedEventCount + EVENT_BATCH_SIZE, visibleEvents.length);
    const fragment = document.createDocumentFragment();

    for (let index = renderedEventCount; index < end; index++) {
        const event = visibleEvents[index];
        const element = document.createElement('article');
        element.className = event.id === selectedEventId ? 'event is-selected' : 'event';
        element.setAttribute('role', 'button');
        element.setAttribute('aria-pressed', String(event.id === selectedEventId));
        element.dataset.eventIndex = String(index);
        element.tabIndex = 0;

        element.innerHTML = `
            <div class='event-category'>
                ${escapeHtml(
                    getCategoryName(event.category)
                )}
            </div>

            <div class='event-title'>
                ${escapeHtml(event.title)}
            </div>

            ${
                event.summary
                    ? `
                        <div class='event-summary'>
                            ${escapeHtml(event.summary)}
                        </div>
                    `
                    : ''
            }

            <div class='event-location'>
                ${escapeHtml(event.location)}
            </div>

            ${
                event.date
                    ? `
                        <div class='event-date'>
                            ${escapeHtml(event.date)}
                        </div>
                    `
                    : ''
            }

            <div class='event-state ${event.state}'>
                ${event.state}
            </div>

            <div class='event-details-hint'>
                View details <span aria-hidden='true'>→</span>
            </div>

        `;

        fragment.appendChild(element);
    }

    container.appendChild(fragment);
    renderedEventCount = end;
    countContainer.textContent = renderedEventCount < visibleEvents.length
        ? `${renderedEventCount} of ${visibleEvents.length} events`
        : `${visibleEvents.length} event${visibleEvents.length === 1 ? '' : 's'}`;
}

let onSelectEvent = () => {};

function appendEventsNearBottom(event) {
    if (renderedEventCount >= visibleEvents.length) {
        return;
    }

    const container = event.currentTarget;
    if (container.id === 'events-panel') {
        if (event.target !== container) {
            return;
        }
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 120) {
            appendEventBatch(document.getElementById('events'), document.getElementById('event-count'));
        }
        return;
    }

    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 120) {
        appendEventBatch(container, document.getElementById('event-count'));
    }
}

document.getElementById('events')?.addEventListener('scroll', appendEventsNearBottom);
document.getElementById('events-panel')?.addEventListener('scroll', appendEventsNearBottom);

document.getElementById('events')?.addEventListener('click', event => {
    const index = Number(event.target.closest('.event')?.dataset.eventIndex);
    const selected = visibleEvents[index];
    if (selected) {
        onSelectEvent(selected);
    }
});

document.getElementById('events')?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    const index = Number(event.target.closest('.event')?.dataset.eventIndex);
    const selected = visibleEvents[index];
    if (selected) {
        event.preventDefault();
        onSelectEvent(selected);
    }
});