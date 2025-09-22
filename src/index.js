const puppeteer = require('puppeteer');

const getDynamicHTML = async () => {
    let browser; // Define browser outside try...catch to access it in the finally block
    try {
        // 1. Launch a headless browser instance.
        // 'headless: "new"' uses the modern headless mode which is more capable.
        browser = await puppeteer.launch({ headless: "new" });

        // 2. Open a new page.
        const page = await browser.newPage();

        // 3. Navigate to the URL and wait for the network to be idle.
        // 'networkidle2' is a good signal that dynamic content has likely finished loading.
        const url = 'https://www.threads.com/search?q=%EB%B9%95%EC%8A%A4&serp_type=tags&hl=ko';
        await page.goto(url, {
            waitUntil: 'networkidle2',
        });

        // 4. Wait for the target content to appear on the page.
        // Modern sites like Threads use auto-generated, changing class names.
        // It's more reliable to select elements by stable attributes like ARIA roles.
        // Here, we wait for a div that acts as a list item in a feed.
        const itemSelector = 'div[class="x78zum5 xdt5ytf"]';
        await page.waitForSelector(itemSelector);

        // 5. Extract the data from the page.
        // page.$$eval runs `document.querySelectorAll` in the browser and passes the
        // found elements to a callback function.
        const searchResults = await page.$$eval(itemSelector, (elements) =>
            // We map over the elements to extract the data we need.
            // This callback runs in the browser's context, not in Node.js.
            elements.map((el) => ({
                // Extract the plain text content of the element.
                text: el.innerText,
                // You could also extract other things, like links:
                firstLink: el.querySelector('a')?.href,
            }))
        );

        console.log(`Found ${searchResults.length} search results.`);
        console.log(searchResults);

        return searchResults;

    } catch (err) {
        console.error("An error occurred during scraping:", err);
    } finally {
        // 6. Ensure the browser is closed, even if an error occurred.
        if (browser) {
            await browser.close();
        }
    }
};

getDynamicHTML();