const expect = require('chai').expect;
const qs = require('qs');
const {By} = require('selenium-webdriver');
const activateSW = require('../../../infra/testing/activate-sw');

describe(`[workbox-google-analytics] Load and use Google Analytics`,
    function() {
  const driver = global.__workbox.webdriver;
  const testServerAddress = global.__workbox.server.getAddress();
  const testingUrl =
    `${testServerAddress}/test/workbox-google-analytics/static/basic-example/`;
  const swUrl = `${testingUrl}sw.js`;

  /**
   * Sends a mesage to the service worker via postMessage and invokes the
   * `done()` callback when the service worker responds, with any data value
   * passed to the event.
   *
   * @param {Object} data An object to send to the service worker.
   * @param {Function} done The callback automatically passed via webdriver's
   *     `executeAsyncScript()` method.
   */
  const messageSw = (data, done) => {
    let messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (evt) => done(evt.data);
    navigator.serviceWorker.controller.postMessage(
        data, [messageChannel.port2]);
  };

  beforeEach(async function() {
    // Load the page and wait for the first service worker to activate.
    await driver.get(testingUrl);
    await activateSW(swUrl);

    // Reset the spied requests array.
    await driver.executeAsyncScript(messageSw, {
      action: 'clear-spied-requests',
    });
  });

  it(`should load a page with service worker`, async function() {
    const err = await driver.executeAsyncScript((done) => {
      fetch('https://www.google-analytics.com/analytics.js', {mode: 'no-cors'})
          .then(() => done(), (err) => done(err.message));
    });

    expect(err).to.not.exist;
  });

  it(`replay failed Google Analytics hits`, async function() {
    // Skip this test in browsers that don't support background sync.
    // TODO(philipwalton): figure out a way to work around this.
    const browserSuppotsSync = await driver.executeScript(() => {
      return 'SyncManager' in window;
    });
    if (!browserSuppotsSync) this.skip();

    const simulateOfflineEl =
        await driver.findElement(By.id('simulate-offline'));

    // Send a hit while online to ensure regular requests work.
    await driver.executeAsyncScript((done) => {
      window.gtag('event', 'beacon', {
        transport_type: 'beacon',
        event_callback: () => done(),
      });
    });

    let requests = await driver.executeAsyncScript(messageSw, {
      action: 'get-spied-requests',
    });
    expect(requests).to.have.lengthOf(1);

    // Reset the spied requests array.
    await driver.executeAsyncScript(messageSw, {
      action: 'clear-spied-requests',
    });

    // Check the "simulate offline" checkbox and make some requests.
    await simulateOfflineEl.click();
    await driver.executeAsyncScript((done) => {
      window.gtag('event', 'beacon', {
        transport_type: 'beacon',
        event_label: Date.now(),
        event_callback: () => done(),
      });
    });
    await driver.executeAsyncScript((done) => {
      window.gtag('event', 'pixel', {
        transport_type: 'image',
        event_label: Date.now(),
        event_callback: () => done(),
      });
    });
    await driver.executeAsyncScript((done) => {
      fetch('https://httpbin.org/get').then(() => done());
    });

    // Get all spied requests and ensure there haven't been any (since we're
    // offline).
    requests = await driver.executeAsyncScript(messageSw, {
      action: 'get-spied-requests',
    });
    expect(requests).to.have.lengthOf(0);

    // Uncheck the "simulate offline" checkbox and then trigger a sync.
    await simulateOfflineEl.click();
    await driver.executeAsyncScript(messageSw, {
      action: 'dispatch-sync-event',
    });

    // Ensure only 2 requests have replayed, since only 2 of them were to GA.
    requests = await driver.executeAsyncScript(messageSw, {
      action: 'get-spied-requests',
    });
    expect(requests).to.have.lengthOf(2);

    // Parse the request bodies to set the params as an object and convert the
    // qt param to a number.
    for (const request of requests) {
      request.params = qs.parse(request.body);
      request.params.qt = Number(request.params.qt);
      request.originalTime = request.timestamp - request.params.qt;
    }

    expect(requests[0].params.ea).to.equal('beacon');
    expect(requests[1].params.ea).to.equal('pixel');

    // Ensure the hit's qt params were present and greater than 0,
    // and ensure those values reflect the original order of the hits.
    expect(requests[0].params.qt > 0).to.be.true;
    expect(requests[0].params.qt > 0).to.be.true;
    expect(requests[0].originalTime < requests[1].originalTime).to.be.true;
  });
});
