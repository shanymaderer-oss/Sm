/* The Firebase project of מסע. These values are public by design (they identify the project);
   what each signed-in traveler may read or write is enforced on the server by firestore.rules.
   Until the project exists this stays null, and the site works without accounts. */
window.MASA_CLOUD = null;
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
window.MASA_AI = null;
/* window.MASA_AI = { proxy: "https://masa-ai.<your-subdomain>.workers.dev" }; */
