# Paid options we would adopt

Huishouden runs free: one Firebase project on the Spark plan with no billing account, public repos
for free CI, and free public services for maps and AI. That is a deliberate choice. This page lists
the paid services the apps would use if the household decides to pay, what each would add that the
free option cannot, and which features would change. Nothing here is set up; each needs the user's
approval and a billing account.

## Google Places API (place search, business hours)

**Free option today:** OpenStreetMap through the public Overpass and Nominatim servers
(`@huishouden/pwa-kit/places`).

**What the free option misses:**

- Coverage. Many suburban US businesses are not in OpenStreetMap at all. Near one household, Google
  Maps shows several dry cleaners within a mile; OpenStreetMap had no dry cleaners or laundries mapped within 3 miles.
- Hours. OpenStreetMap rarely has `opening_hours` outside city centres, and never holiday hours or
  "open now" from the business itself.
- Reliability. The public Overpass servers rate-limit and time out under load (HTTP 429 and 504), so
  a search can fail when someone needs it.

**What Places would add:** the same businesses and hours as Google Maps; "Closes 6:00 PM, before your
6:30 PM due time" warnings that hold for every place, not just the few with mapped hours; phone
numbers and websites; and autocomplete while typing a place.

**Features that would change:** Tasks' Find nearby and errand warnings; Baby's contact lookup
(pediatrician, pharmacy).

**Cost shape:** per-request pricing with a monthly free allowance per API; a household's searches are
small. Needs a billing account on a Google Cloud project. Keep it off the Firebase project (so that
stays on Spark): a separate small project holding only a browser key restricted to the Huishouden
sites and to the Places API, with a low daily quota cap.

## Firebase Blaze plan (server-side work)

**Free option today:** everything runs in the browser; Spark allows no Cloud Functions.

**What the free option misses:** work that must happen when no app is open (a reminder sent at 6 PM
when every device is asleep, a nightly import), and any API key that must stay secret, since a browser
key is public by design.

**What Blaze would add:** Cloud Functions and scheduled jobs, so reminders and imports run on time
without a device, and a server-side place to call paid APIs with a secret key.

**Cost shape:** pay as you go with a monthly free allowance; small household use typically stays
inside it, but a billing account is required. Moving the Firebase project to Blaze is the one change
here that affects every app.

## Gemini API paid tier (meal ideas and other AI features)

**Free option today:** the Gemini Developer API free tier through Firebase AI Logic.

**What the free option misses:** low rate limits, and requests refused when the model is busy
("high demand"), which the apps handle with a retry and a smaller fallback model.

**What the paid tier would add:** higher limits and priority, so suggestions rarely fail, and access
to larger models for harder tasks.

**Cost shape:** per token; a household's requests are few. Needs a billing account on the project the
key belongs to.
