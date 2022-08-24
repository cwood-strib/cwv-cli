const puppeteer = require('puppeteer');
// const devices = require('puppeteer/DeviceDescriptors');


const Good3G = {
  'offline': false,
  'downloadThroughput': 1.5 * 1024 * 1024 / 8,
  'uploadThroughput': 750 * 1024 / 8,
  'latency': 40
};

const phone = puppeteer.devices['iPhone 6'];

function calcLCP() {
  window.largestContentfulPaint = 0;

  const observer = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      window.largestContentfulPaint = lastEntry.renderTime || lastEntry.loadTime;
  });

  observer.observe({ type: 'largest-contentful-paint', buffered: true });

  document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
          observer.takeRecords();
          observer.disconnect();
          console.log('LCP:', window.largestContentfulPaint);
      }
  });
}

function calcJank() {
  window.cumulativeLayoutShiftScore = 0;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        console.log("New observer entry for cls: " + entry.value);
        console.log("cls entry", entry)
        window.cumulativeLayoutShiftScore += entry.value;
      }
    }
  });

  observer.observe({ type: 'layout-shift', buffered: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      observer.takeRecords();
      observer.disconnect();
      console.log('CLS:', window.cumulativeLayoutShiftScore);
    }
  });
}


async function getCLS(url) {
  const browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox', 
      '--ignore-certificate-errors', 
      '--disable-extensions',
      '--allow-running-insecure-content'
    ],
    timeout: 10000
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    await client.send('Network.enable');
    await client.send('ServiceWorker.enable');
    await client.send('Network.emulateNetworkConditions', Good3G);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.emulate(phone);

    await page.evaluateOnNewDocument(calcJank);
    await page.evaluateOnNewDocument(calcLCP);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    let cls = await page.evaluate(function () { return window.cumulativeLayoutShiftScore; });
    let lcp = await page.evaluate(function () { return window.largestContentfulPaint; });
    browser.close();
    return { cls, lcp };
  } catch (error) {
    console.log(error);
    browser.close();
    return;
  }
}

const Ratings = {
  Good: "Good",
  NeedsImprovement: "Needs Improvement",
  Poor: "Poor"
}

function rateLcp(lcp) {
  if (typeof lcp !== 'number') {
    return;
  }

  if (lcp <= 2.5) {
    return Ratings.Good;
  } else if (lcp > 2.5 && lcp <= 4.0) {
    return Ratings.NeedsImprovement;
  } else {
    return Ratings.Poor;
  }
}

function rateCLS(cls) {
  if (typeof cls !== 'number') {
    return;
  }

  if (cls <= 0.1) {
    return Ratings.Good 
  } else if (cls > 0.1 && cls <= 0.25) {
    return Ratings.NeedsImprovement;
  } else {
    return Ratings.Poor;
  }
}

getCLS("https://vm-m.startribune.com").then(cwv => {
  if (cwv.cls && cwv.lcp) {
    console.log(`CLS: ${cwv.cls} - ${rateCLS(cwv.cls)}`)
    console.log(`LCP: ${cwv.lcp} - ${rateLcp(cwv.lcp)}`)
  } else {
    console.error("Failed to measure cwv metrics")
  }
});
