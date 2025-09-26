import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import fs from 'fs';
import {stringify} from 'csv-stringify/sync';
import path from 'path';
dotenv.config();

const getDynamicHTML = async (query, pageCount) => {
    let browser; // Define browser outside try...catch to access it in the finally block
    try {
        // 1. Launch a headless browser instance.
        // 'headless: "new"' uses the modern headless mode which is more capable.
        browser = await puppeteer.launch({ headless: true });

        // 2. Open a new page.
        const puppeteerPage = await browser.newPage();
        await puppeteerPage.setViewport({ width: 1920, height: 1080 });
        await puppeteerPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');


        await puppeteerPage.goto('https://www.threads.com/login?hl=ko');
        await puppeteerPage.waitForSelector('input[placeholder="사용자 이름, 전화번호 또는 이메일 주소"]');
        await puppeteerPage.type('input[placeholder="사용자 이름, 전화번호 또는 이메일 주소"]', process.env.INS_ID, {delay: 100});
        await puppeteerPage.waitForSelector('input[placeholder="비밀번호"]');
        await puppeteerPage.type('input[placeholder="비밀번호"]', process.env.INS_PW, {delay: 110});
        //await puppeteerPage.waitForSelector('form div[role="button"]:not([disabled])');
        await Promise.all([
            puppeteerPage.click('form div[role="button"]'), 
            puppeteerPage.waitForNavigation({waitUntil: 'networkidle2'})
        ])
        .catch(console.error('login failed. try again later'));

        console.log('login successful');
        console.log('begin scroll...');

        // 3. Navigate to the URL and wait for the network to be idle.
        // 'networkidle2' is a good signal that dynamic content has likely finished loading.
        const url = `https://www.threads.com/search?q=${query}&serp_type=tags&hl=ko`;
        await puppeteerPage.goto(url, {
            waitUntil: 'networkidle2'
        });

        // 4. Wait for the target content to appear on the page.
        // Modern sites like Threads use auto-generated, changing class names.
        // It's more reliable to select elements by stable attributes like ARIA roles.
        // Here, we wait for a div that acts as a list item in a feed.
        
        const itemSelector = 'div[aria-label="칼럼 본문"] > div > div > div > div > div > div > div > div';
        await puppeteerPage.waitForSelector(itemSelector);

        let crawlResult = [];
        let prevRecords = 0;
        try{
            let lastHeight = await puppeteerPage.evaluate('document.body.scrollHeight');
            
            for(let i = 0; i < pageCount; i++){
                console.log(prevRecords);
                
                await puppeteerPage.evaluate('window.scrollTo(0, document.body.scrollHeight)');

                //await puppeteerPage.waitForNetworkIdle({idleTime: 3000});
                
                await puppeteerPage.waitForFunction(
                    (prevRecords, itemSelector) => {
                        const newRecords = document.querySelectorAll(itemSelector).length;
                        console.log(`prev: ${prevRecords}, new: ${newRecords}`)
                        return newRecords > prevRecords;
                    },
                    {timeout: 30000},
                    prevRecords,
                    itemSelector
                );
                
                await puppeteerPage.waitForSelector(itemSelector);
                const newResults = await puppeteerPage.$$eval(itemSelector, (elements) => 
                    elements.map((el) => ({
                        text: el.innerText,
                        firstLink: el.querySelector('a')?.href,
                    
                    }))
                );

                newResults.slice(prevRecords);
                for(let j = 0; j < newResults.length; j++){
                    crawlResult.push(newResults[j]);
                }
                
                let newHeight = await puppeteerPage.evaluate('document.body.scrollHeight');
                
                // if(newHeight === lastHeight){
                //     break;
                // }
                console.log('scrolling...');
                prevRecords = await puppeteerPage.$$eval(itemSelector, items => items.length);
            }
        }catch(error){
            console.error('An error occurred during scrolling:', error);
            throw new Error('Problem with scrolling');
        }
        await puppeteerPage.waitForSelector(itemSelector);

        // // 5. Extract the data from the page.
        // // page.$$eval runs `document.querySelectorAll` in the browser and passes the
        // // found elements to a callback function.
        // const searchResults = await puppeteerPage.$$eval(itemSelector, (elements) =>
        //     // We map over the elements to extract the data we need.
        //     // This callback runs in the browser's context, not in Node.js.
        //     elements.map((el) => ({
        //         // Extract the plain text content of the element.
        //         text: el.innerText,
        //         // You could also extract other things, like links:
        //         firstLink: el.querySelector('a')?.href,
        //     }))
        // );

        // console.log(`Found ${searchResults.length} search results.`);
        // console.log(searchResults);
        console.log(crawlResult);
        return crawlResult;

    } catch (err) {
        console.error("An error occurred during scraping:", err);
    } finally {
        // 6. Ensure the browser is closed, even if an error occurred.
        if (browser) {
            await browser.close();
        }
    }
};

const writeCSV = (data) => {
    const writeData = data.map((elements) => {
        const textContent = elements.text;
        const fixedContent = textContent.split('\n');
        const user = fixedContent[0];
        const title = fixedContent[1];
        const date = fixedContent[2];
        const content = fixedContent.slice(3).join('\n');
        const fixedLink = elements.firstLink;
        return {user, title, date, content, link: fixedLink};
    });

    const output = stringify(writeData, {
        header: true
    });
    console.log(`${output.length} ready to write`);

    const __dir = path.resolve('output');
    if(!fs.existsSync(__dir)){
        fs.mkdirSync(__dir);
    }

    const currentTime = new Date().toISOString().replace(/:/g, '-');
    const fileName = `output.${currentTime}.csv`;
    const filePath = path.join(__dir, fileName);
    try{
        fs.writeFileSync(filePath, output, 'utf-8');
    }catch(err){
        throw new Error(err.message);
    }
}

const main = async () => {
    const data = await getDynamicHTML('개발', 5);
    writeCSV(data);
}

main();