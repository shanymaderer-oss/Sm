/* The Firebase project of מסע. These values are public by design (they identify the project);
   what each signed-in traveler may read or write is enforced on the server by firestore.rules.
   Until the project exists this stays null, and the site works without accounts. */
window.MASA_CLOUD = {
  apiKey: "AIzaSyBBKGdDxEHaZ14CFcTNvHNF5S3bXgkaAE8", authDomain: "masa-86058.firebaseapp.com", projectId: "masa-86058",
  appId: "1:746493644804:web:39440905d851f442b6a551",
  googleClientId: "746493644804-r6qi6f8iru8e1k8ssgh8abd4vurvhvq0.apps.googleusercontent.com" // the "Web client" id from Google Cloud → Credentials
};
/* window.MASA_CLOUD = {
  apiKey: "...", authDomain: "....firebaseapp.com", projectId: "...", appId: "...",
  googleClientId: "....apps.googleusercontent.com"
}; */

/* Tripadvisor Content API (restaurant ratings, 4.5 and up for meals). The key is limited on Tripadvisor's side
   to this site's address and to a daily budget. null = ratings are off. */
window.MASA_TA = null;
/* window.MASA_TA = { key: "..." }; or, through a small proxy that keeps the key: { proxy: "https://.../ta" } */

/* the smart guide for everyone: the address of our Cloudflare Worker (tools/ai-worker). Its host must also be in the
   connect-src of the Content-Security-Policy in index.html. */
window.MASA_AI = { proxy: "https://masa-ai.sivanmad7.workers.dev" };
/* window.MASA_AI = { proxy: "https://masa-ai.<your-subdomain>.workers.dev" }; */

/* partner programs: when a partnership is approved, its id goes here and is added to every link to that site.
   Example: { "booking.com": { aid: "1234567" }, "getyourguide.com": { partner_id: "ABC123" }, "viator.com": { pid: "P00012345", mcid: "42383" } }
   While this is null, no link carries a partner id and the "partner links" notice is not shown. */
/* Stay22 affiliate id (public, it is in every link): hotel and activity sites go through stay22.com/allez/<brand> */
window.MASA_STAY22 = "masaplanner";
window.MASA_PARTNERS = { "aviasales.com": { marker: "799451" }, "tiqets.com": { tp: { c: 89, p: 2074 } }, "klook.com": { tp: { c: 137, p: 4110 } }, "airalo.com": { tp: { c: 541, p: 8310 } }, "saily.com": { tp: { c: 629, p: 8979 } }, "yesim.app": { tp: { c: 224, p: 5998 } }, "welcomepickups.com": { tp: { c: 627, p: 8919 } }, "kiwitaxi.com": { tp: { c: 1, p: 647 } }, "localrent.com": { tp: { c: 87, p: 2043 } }, "kiwi.com": { tp: { c: 111, p: 4136 } }, "booking.com": { s22: "booking" }, "hotels.com": { s22: "hotelscom" }, "expedia.com": { s22: "expedia" }, "agoda.com": { s22: "agoda" }, "vrbo.com": { s22: "vrbo" }, "getyourguide.com": { s22: "getyourguide" } }; // Travelpayouts partner id (marker; public, not a secret)
