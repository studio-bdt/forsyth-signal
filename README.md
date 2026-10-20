# Forsyth Signal

Track the plans, join the conversation, and shape the future of your neighborhood and community.

This website was built for 2026 Congressional App Challenge.

## Functions
The main purpose of Forsyth Signal is to encourage people to participate in civics. It can be hard to find information about civic meetings, where development plans are happening, and where public hearing signs are. That's why we built this web app. 

 - Browse through upcoming meetings
 - See active development plans
 - Go through past zoning areas
 - See what affects you

## For the developers
Here's the basic outline of the project

 - api --- Contains the code for recieving data from dependency APIs.

 - data --- Stored data is saved here during runtime.

 - src --- Contains the backend of the web application.

 - web --- Contains the frontend of the application.

 - ROOT.* --- Files for building and development environment configurations.

### IMPORTANT!!!!!!!
If you are running this project, you will need rust installed. To open the project on a local development server, run the following in the terminal:

```cargo run --bin forsyth-signal```

### TESTING
To test mock events/details screen when the backend is being blocked by network restrictions, paste and run this in the DevTools console
```
(async () => {
  const futureDate = days =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const mockEvents = [
    {
      id: "mock-001",
      title: "Octavius' 10th Birthday!",
      category: "development",
      state: "upcoming",
      status: "Scheduled",
      date: futureDate(7),
      location: "Octavius' House",
      latitude: 34.207,
      longitude: -84.14,
      summary: "A birthday party celebration for Octavius, who is turning 10 today!",
      description: "Join us for burgers, lawn games, and birthday cake as we celebrate Octavius turning 10! We will be outdoors, so wear comfortable casual clothes.",
      why_it_matters: "It really doesn't.",
      source_name: "OctaviusNews",
      source_url: "",
      geometry: null
    }
  ];

  const cache = await caches.open("forsyth-signal-events-v1");
  await cache.put(
    "/api/events",
    new Response(JSON.stringify(mockEvents), {
      headers: { "Content-Type": "application/json" }
    })
  );

  location.reload();
})();
```
