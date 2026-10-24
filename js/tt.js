/* מסע · first line of defense, loaded before everything else.
   1. Trusted Types (Chrome, Edge, Safari 26+): every piece of HTML that enters the page passes through one
      sanitizer, so a script or an event handler hidden in map data, a Wikipedia text or a shared link cannot run.
      Scripts may load only from this site, workers only from this site or blob: (the map library uses them).
   2. The site refuses to run inside a frame on another site (protects the settings form from clickjacking). */
(() => {
  "use strict";
  if (window.top !== window.self) {
    let same = false;
    try { same = window.top.location.origin === location.origin; } catch {}
    if (!same) {
      document.documentElement.style.display = "none";
      try { window.top.location.href = location.href; } catch {}
      return;
    }
  }
  const tt = window.trustedTypes;
  if (!tt || !tt.createPolicy) return;
  const raw = tt.createPolicy("masa-raw", { createHTML: s => s });
  const BAD_TAGS = "script,iframe,frame,object,embed,base,meta,link,style,template,noscript";
  const URL_ATTR = /^(href|src|action|formaction|xlink:href|poster|background|srcset)$/i;
  const BAD_URL = /^\s*(javascript|vbscript|data:(?!image\/(png|jpe?g|gif|webp);))/i;
  function clean(html) {
    const doc = new DOMParser().parseFromString(raw.createHTML("<body>" + html), "text/html");
    doc.body.querySelectorAll(BAD_TAGS).forEach(e => e.remove());
    doc.body.querySelectorAll("*").forEach(el => {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name) || (URL_ATTR.test(a.name) && BAD_URL.test(a.value)) || (a.name === "style" && /expression|url\(\s*['"]?\s*javascript/i.test(a.value))) el.removeAttribute(a.name);
      }
    });
    return doc.body.innerHTML;
  }
  const sameOrigin = u => { try { const x = new URL(u, location.href); return x.origin === location.origin || x.protocol === "blob:"; } catch { return false; } };
  try {
    tt.createPolicy("default", {
      createHTML: s => clean(String(s)),
      createScriptURL: u => { if (sameOrigin(u)) return u; throw new TypeError("blocked script URL"); },
      createScript: () => { throw new TypeError("blocked inline script"); }
    });
  } catch {}
})();
