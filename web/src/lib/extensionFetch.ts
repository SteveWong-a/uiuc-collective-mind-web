export const fetchHtmlViaExtension = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reqId = Math.random().toString();
    
    // Set a timeout
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`Extension fetch timed out for ${url}`));
    }, 15000);

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === "CMIND_FETCH_HTML_RESPONSE" && event.data.reqId === reqId) {
        window.removeEventListener("message", handler);
        clearTimeout(timeoutId);
        
        if (event.data.payload.success) {
          resolve(event.data.payload.data);
        } else {
          reject(new Error(event.data.payload.error));
        }
      }
    };
    
    window.addEventListener("message", handler);
    window.postMessage({ type: "CMIND_FETCH_HTML_REQUEST", reqId, url }, "*");
  });
};
