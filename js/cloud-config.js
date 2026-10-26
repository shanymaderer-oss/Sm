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
