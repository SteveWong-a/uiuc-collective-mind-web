import { app } from 'electron';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let server;
  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucm-test-'));
    const cookieFile = path.join(tmpDir, 'cookies.json');
    const profileDir = path.join(tmpDir, 'profile');

    // Create a local test server to simulate course and login redirects
    server = http.createServer((req, res) => {
      if (req.url === '/assessments') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body><h1>Course Assessments</h1><a href="/login" id="login-link">Log in with NetID</a></body></html>`);
      } else if (req.url === '/login') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body><h1>Illinois Login</h1><form><input type="password" name="pw"><button id="sub">Submit</button></form></body></html>`);
      } else if (req.url === '/authenticated-assessments') {
        res.writeHead(200, {
          'content-type': 'text/html',
          'set-cookie': 'session_token=valid_12345; Path=/; HttpOnly'
        });
        res.end(`<html><body><h1>Welcome, Student</h1><table aria-label="Assessments"><tr><td>HW 1</td></tr></table></body></html>`);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const { ElectronBrowser } = await import('./dist/browser-adapter.js');
    const logs = [];
    const browser = new ElectronBrowser({
      profileDir,
      cookieFile,
      log: (msg) => logs.push(msg)
    });

    console.log('Test 1: openForLogin does NOT close instantly on initial navigation');
    await browser.openForLogin(`${baseUrl}/assessments`);
    assert.equal(browser.headed, true, 'browser should be marked headed');
    // Wait 1.5 seconds - in the buggy version it would close within 100ms
    await sleep(1500);
    assert.ok(browser._loginPage, 'login window must still exist');
    assert.ok(!browser._loginPage.isDestroyed(), 'login window must NOT be destroyed');
    console.log('✓ Test 1 passed: Login window remained open');

    console.log('Test 2: calling openForLogin again reuses and focuses existing window');
    const winRef = browser._loginPage;
    await browser.openForLogin(`${baseUrl}/assessments`);
    assert.equal(browser._loginPage, winRef, 'must reuse the exact same window instance');
    assert.ok(!browser._loginPage.isDestroyed(), 'window remains alive');
    console.log('✓ Test 2 passed: Window reused cleanly');

    console.log('Test 3: withPage pull does NOT close login window while user is on auth screen');
    // Simulate user navigating to the login page with password field
    await browser._loginPage.loadURL(`${baseUrl}/login`);
    await sleep(500);
    assert.ok(!browser._loginPage.isDestroyed(), 'login window is open on login page');

    // Run a pull via withPage on another URL that throws or finishes
    await browser.withPage(`${baseUrl}/assessments`, async (page) => {
      return await page.content();
    });
    assert.ok(!browser._loginPage.isDestroyed(), 'login window must NOT be closed while on login screen');
    console.log('✓ Test 3 passed: Pull did not close active auth screen');

    console.log('Test 4: withPage pull closes login window once pull succeeds on authenticated page');
    // Simulate user completing login and landing back on authenticated assessments page
    await browser._loginPage.loadURL(`${baseUrl}/authenticated-assessments`);
    await sleep(600);

    // Now a pull succeeds through the session
    await browser.withPage(`${baseUrl}/authenticated-assessments`, async (page) => {
      const content = await page.content();
      assert.ok(content.includes('Welcome, Student'));
      return content;
    });

    // Login window should now be closed by the successful pull
    assert.ok(browser._loginPage === null || browser._loginPage.isDestroyed(), 'login window must be closed after successful pull');
    assert.equal(browser.headed, false, 'headed flag must be reset to false');
    console.log('✓ Test 4 passed: Pull closed login window after authentication');

    await browser.close();
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log('ALL ELECTRON ADAPTER TESTS PASSED SUCCESSFULLY!');
    app.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    if (server) server.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    app.exit(1);
  }
});
