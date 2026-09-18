window.addEventListener("message", (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  // Listen for the specific sync request from the Next.js app
  if (event.data && event.data.type === "CMIND_SYNC_REQUEST") {
    console.log(`[CMIND Extension] Received sync request for ${event.data.source || 'canvas'}.`);
    
    // Forward to the background worker to execute cross-origin fetch
    chrome.runtime.sendMessage({ 
      type: "FETCH_SOURCE_DATA", 
      source: event.data.source || "canvas",
      settings: event.data.settings
    }, (response) => {
      // Send the response back to the Next.js app
      window.postMessage({ type: "CMIND_SYNC_RESPONSE", payload: response }, "*");
    });
  }

  // Generic HTML fetch request
  if (event.data && event.data.type === "CMIND_FETCH_HTML_REQUEST") {
    chrome.runtime.sendMessage({ type: "FETCH_HTML", url: event.data.url }, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ 
          type: "CMIND_FETCH_HTML_RESPONSE", 
          reqId: event.data.reqId, 
          payload: { success: false, error: chrome.runtime.lastError.message } 
        }, "*");
        return;
      }
      window.postMessage({ 
        type: "CMIND_FETCH_HTML_RESPONSE", 
        reqId: event.data.reqId, 
        payload: response || { success: false, error: "Empty response from extension" }
      }, "*");
    });
  }
});
