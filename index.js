const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Capture a screenshot of the given page at the given resolution.
 * 
 * @param {Object} page - Pupperteer object for the page.
 * @param {Number} width - Resolution width.
 * @param {Number} height - Resolution height.
 * @returns {Object} - The screenshot data.
 */
async function captureScreenshot(page, width, height) {
    console.log("Screenshot [" + width + "x" + height + "]")

    await page.setViewport({width, height});
    const screenshot = await page.screenshot({fullPage: true});
    return screenshot;
}

/**
 * Capture screenshots of a webpage at different resolutions and save them.
 * 
 * @param {string} url - The URL of the webpage.
 * @param {Object} page - The Pupperteer page object for capturing screenshots.
 * @param {string[]} resolutions - An array of strings containing resolutions for the screenshots (e.g. ['800-600', '1920x1080']).
 * @returns {Promise} - A promise that resolves when all of the screenshots have been captured and saved.
 */
async function captureScreenshotsForPage(url, page, resolutions) {

    console.log("Starting screenshot capture");

    // Create an output directory path using segments from the URL
    const segments = url.split('/').filter(segment => segment && segment !== 'https:');
    const hostname = segments[0];
    const regex = /[<>:"/\\|?*\x00-\x1F]/g;
    const safeSegments = segments.slice(1).map(segment => segment.replace(regex, ''));
    const directory = path.join(__dirname, 'images', hostname, ...safeSegments);

    // Create the directory if it doesn't exist
    fs.existsSync(directory) || fs.mkdirSync(directory, { recursive: true });

    // Capture a screenshot for each resolution and save them in the directory
    for (const resolution of resolutions) {
        const [width, height] = resolution.split('x').map(Number);
        const screenshot = await captureScreenshot(page, width, height);

        // Create the full path + filename and save the file to it.
        const filename = path.join(directory, `${resolution}.png`);
        fs.writeFileSync(filename, screenshot);

        console.log("Saved to: " + filename);
    }

    console.log("Screenshots finished");
}

/**
 * Returns a list of URLs found within hrefs on a given page.
 * 
 * @param {Object} page - The Pupperteer page object for scraping.
 * @returns {Promise<string[]>} - A promise that resolves to an array of strings containing the found URLs.
 */
async function getLinksFromPage(page, domain) {
    console.log(`Getting links from page: ${await page.title()}`);

    const links = await page.evaluate((domain) => {
        const elements = document.getElementsByTagName('a');
        const links = [];

        console.log(`Found ${elements.length} potential links`);

        for (let i = 0; i < elements.length; i++) {
            const href = elements[i].getAttribute('href');
            console.log(`Checking href of link [${i + 1}/${elements.length}]: ${href}`);

            // Filter out hrefs containing illegal characters/words
            if (!href || ["mailto:", "tel:", "javascript:", "#"].some(word => href.includes(word))) {
                console.log("[FAIL] Skipping link (illegal characters)");
                continue;                
            }

            // Filter out hrefs from different domains
            if (new URL(href, window.location.href).hostname !== domain) {
                console.log("[FAIL] Skipping link (foreign domain)");
                continue;
            }

            if (!href.includes("://")) {
                console.log("[OK] href altered and added to queue");
                links.push(new URL(href, window.location.href).href);
                continue;
            }

            console.log("[OK] href added to queue");
            links.push(href);
        }

        return links;
    }, domain);

    return links;
}

/**
 * Main function. Iterates over a queue of pages and saves screenshots to the file system.
 * 
 * @param {string} url - The page URL to start the process. 
 * @param {*} resolutions - An array of strings as resolutions.
 * @param {*} domain 
 */
async function captureScreenshotsForAllPages(url, resolutions, domain) {
    console.log("Starting application");

    // Browser and page used to navigate the webpages
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const queue = [url];  // URLs to visit
    const visited = new Set();  // URLS that have been visited
    var visitedCount = 0;

    console.log("Starting queue");
    while (queue.length > 0) {
        console.log("Items remaining in queue: " + queue.length);
        console.log("Pages visited: " + visitedCount);

        const currentUrl = queue.shift();
        console.log("Current URL: " + currentUrl);
        
        // We don't want to process pages multiple times, so skip visited URLs
        if (visited.has(currentUrl)) {
            console.log("Skipping URL (visited)");
            continue;
        }

        console.log("Visiting URL");
        visited.add(currentUrl);
        visitedCount ++;

        // Pages that download content cause errors, so catch them
        try { await page.goto(currentUrl, {timeout: 30000}); }
        catch (error) {
            console.log("Handled exception during page.goto: " + error);
            continue;  // continue, otherwise screenshots will be created of the previous page under this page's name
        }

        // Get screenshots
        await captureScreenshotsForPage(currentUrl, page, resolutions);

        // Get new links and add them to the queue
        const links = await getLinksFromPage(page, domain);
        console.log("Checking links");

        if (!links.length) {
            console.log("[FAIL] No links found");
            continue;
        }

        for (const link of links) {
            console.log("Checking link: " + link);

            if (!visited.has(link) && link.startsWith(url)) {
                console.log("[OK] Adding link to queue");
                queue.push(link);
            }
            else {
                console.log("[FAIL] Skipping link (visited or foreign domain)");
            }
        }
    }
    await browser.close();
    console.log(`Visited ${visited} pages`);
}

// Configure these values ONLY
const url = 'https://www.microsoft.com/';
const domain = 'www.microsoft.com';
const resolutions = ['1920x1080', '1366x768', '360x640', '414x896', '1536x864', '375x667'];

// Start the program using the configured parameters
captureScreenshotsForAllPages(url, resolutions, domain)
    .then(() => console.log('Screenshots captured successfully'))
    .catch((error) => console.error(error));
