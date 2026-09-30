window.addEventListener("message", (event) => {
  // Only accept messages from this window on an allowlisted dashboard origin.
  if (event.source !== window) return;
  if (!isCmindAppOrigin(event.origin)) return;

  // Listen for the specific sync request from the Next.js app
  if (event.data && event.data.type === "CMIND_SYNC_REQUEST") {
    console.log(`[CMIND Extension] Received sync request for ${event.data.source || "canvas"}.`);

    chrome.runtime.sendMessage({
      type: "FETCH_SOURCE_DATA",
      source: event.data.source || "canvas",
      settings: event.data.settings
    }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({
          type: "CMIND_SYNC_RESPONSE",
          payload: { success: false, error: chrome.runtime.lastError.message }
        }, event.origin);
        return;
      }
      window.postMessage({ type: "CMIND_SYNC_RESPONSE", payload: response }, event.origin);
    });
  }

  // Generic HTML fetch request (listing pages only; enforced in the worker)
  if (event.data && event.data.type === "CMIND_FETCH_HTML_REQUEST") {
    chrome.runtime.sendMessage({ type: "FETCH_HTML", url: event.data.url }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({
          type: "CMIND_FETCH_HTML_RESPONSE",
          reqId: event.data.reqId,
          payload: { success: false, error: chrome.runtime.lastError.message }
        }, event.origin);
        return;
      }
      window.postMessage({
        type: "CMIND_FETCH_HTML_RESPONSE",
        reqId: event.data.reqId,
        payload: response || { success: false, error: "Empty response from extension" }
      }, event.origin);
    });
  }
});
