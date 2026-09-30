// Shared by the service worker (importScripts) and the content script
// (listed first in manifest content_scripts.js). Keep this list identical
// to the content_script matches / app host_permissions in manifest.json.
var CMIND_APP_ORIGINS = Object.freeze([
  "http://localhost:3000",
  "https://uiuc-collective-mind-web.vercel.app",
  "https://uiuc-cmind-2026.web.app",
  "https://uiuc-cmind-2026.firebaseapp.com",
]);

function isCmindAppOrigin(origin) {
  return CMIND_APP_ORIGINS.indexOf(String(origin || "")) !== -1;
}

function isCmindAppSender(sender) {
  var href = (sender && (sender.url || (sender.tab && sender.tab.url))) || "";
  try {
    return isCmindAppOrigin(new URL(href).origin);
  } catch (e) {
    return false;
  }
}

// Only the listing pages the dashboard actually syncs. A generic fetch() with
// the student's cookies would otherwise return gradebook HTML, CSRF tokens,
// or (if pointed at a lesson / assessment URL) assignment content.
function isAllowedHtmlFetchUrl(urlString) {
  var u;
  try {
    u = new URL(String(urlString || ""));
  } catch (e) {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;

  if (u.hostname === "us.prairielearn.com") {
    return /^\/pl\/course_instance\/\d+\/assessments\/?$/.test(u.pathname);
  }
  if (u.hostname === "cs128.org") {
    return u.pathname === "/my/gradebook" || u.pathname === "/my/gradebook/";
  }
  if (u.hostname === "smart.physics.illinois.edu") {
    if (u.pathname !== "/Course" && u.pathname !== "/Course/") return false;
    return /^\d+$/.test(u.searchParams.get("enrollmentID") || "");
  }
  return false;
}
