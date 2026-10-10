export function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function formatEventDate(value) {
    const rawDate = String(value ?? '').trim();
    if (!/^\d{10,13}$/.test(rawDate)) {
        return rawDate;
    }

    const timestamp = Number(rawDate);
    const milliseconds = rawDate.length === 10 ? timestamp * 1000 : timestamp;
    const date = new Date(milliseconds);
    if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
        return rawDate;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getEventState(event) {
    if (event.state) {
        return event.state;
    }

    const status = String(event.status || '').toLowerCase();

    if (status.includes('approved') || status.includes('denied') || status.includes('completed') || status.includes('closed') || status.includes('withdrawn')) {
        return 'past';
    }

    if (status.includes('pending') || status.includes('review') || status.includes('active') || status.includes('proposed')) {
        return 'active';
    }

    if (event.date) {
        const date = new Date(event.date);

        if (!Number.isNaN(date.getTime())) {
            return date >= new Date() ? 'upcoming' : 'past';
        }
    }

    return 'active';
}

export function getCategoryName(category) {
    const names = {
        development: 'Development',
        government: 'Government',
        education: 'Education',
        transportation: 'Transportation',
        community: 'Community',
        'public-notice': 'Public notice',
        schools: 'School'
    };

    return names[category] || 'Other';
}

export function distanceMiles(latitude1, longitude1, latitude2, longitude2) {
    const earthRadius = 3958.8;

    const dLat = (latitude2 - latitude1) * Math.PI / 180;
    const dLon = (longitude2 - longitude1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude1 * Math.PI / 180) * Math.cos(latitude2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
}