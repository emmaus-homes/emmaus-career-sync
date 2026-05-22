import { chromium } from 'playwright';

// Configuration
const PAYCOM_URL = 'https://www.paycomonline.net/v4/ats/web.php/portal/94B3CAF17B7DBAF1453DBE44CECB7C13/career-page';
const PAYCOM_CLIENT_KEY = '94B3CAF17B7DBAF1453DBE44CECB7C13';
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;

// Department inference from job titles
const DEPARTMENT_MAP = [
  { keywords: ['direct support', 'dsp'], department: 'Direct Support' },
  { keywords: ['human resources', 'hr '], department: 'Human Resources' },
  { keywords: ['training', 'facilitator', 'instructor', 'education'], department: 'Training & Education' },
  { keywords: ['payroll', 'accounts payable', 'accounting', 'finance'], department: 'Finance & Administration' },
  { keywords: ['lpn', 'rn', 'nurse', 'med aide', 'clinical', 'medication'], department: 'Clinical & Nursing' },
  { keywords: ['program manager', 'program director'], department: 'Program Management' },
  { keywords: ['coordinator'], department: 'Administration' },
  { keywords: ['maintenance', 'custodial', 'groundskeeper'], department: 'Facilities' },
];

function inferDepartment(title) {
  const lower = title.toLowerCase();
  for (const { keywords, department } of DEPARTMENT_MAP) {
    if (keywords.some(kw => lower.includes(kw))) {
      return department;
    }
  }
  return 'General';
}

function parseJobType(text) {
  // Check for combined type first
  if (text.includes('Full-Time/Part-Time') || text.includes('Full Time/Part Time')) {
    return 'Full-Time/Part-Time';
  }
  if (text.includes('Part-Time') || text.includes('Part Time')) {
    return 'Part-Time';
  }
  if (text.includes('Full-Time') || text.includes('Full Time')) {
    return 'Full-Time';
  }
  if (text.includes('Contract')) return 'Contract';
  if (text.includes('PRN')) return 'PRN';
  return 'Full-Time';
}

function parseLocation(text) {
  // Match "St. Charles, MO 63301" or "City, ST 12345" pattern
  const match = text.match(/([A-Z][a-zA-Z.\s]+),\s*([A-Z]{2})(?:\s+\d{5})?/);
  if (match) {
    return `${match[1].trim()}, ${match[2]}`;
  }
  return '';
}

function parseSalary(text) {
  // Match patterns like "$19/hr", "$19 hr", "$45,000/yr", "$19.50/hr"
  const hourlyMatch = text.match(/\$[\d,.]+\s*(?:\/|\s)?hr\.?/i);
  const yearlyMatch = text.match(/\$[\d,]+\s*(?:\/|\s)?yr\.?/i);
  const rangeMatch = text.match(/\$[\d,.]+\s*[-–—]\s*\$[\d,.]+/);

  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, ' ');
  if (hourlyMatch) return hourlyMatch[0].replace(/\s+/g, '');
  if (yearlyMatch) return yearlyMatch[0].replace(/\s+/g, '');
  return '';
}

function parseReqId(text) {
  // Extract requisition ID from parentheses, e.g., "(36308)"
  const match = text.match(/\((\d{4,6})\)/);
  return match ? match[1] : '';
}

function cleanTitle(title) {
  // Remove req ID from title
  return title.replace(/\s*\(\d{4,6}\)\s*/, '').trim();
}

async function scrapePaycom() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${PAYCOM_URL}`);
    await page.goto(PAYCOM_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for job listings to render (React SPA)
    console.log('Waiting for job listings to load...');
    await page.waitForSelector('a[href*="/jobs/"]', { timeout: 30000 });

    // Scroll to load all jobs (in case of lazy loading)
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Wait a bit more for any lazy-loaded content
    await page.waitForTimeout(2000);

    // Debug: Take screenshot
    console.log('Page loaded. Taking screenshot for debugging...');
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

    // Extract job data by clicking into each job detail page
    console.log('Extracting job data...');

    // First, get all unique job IDs from the page
    const jobIds = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/jobs/"]');
      const ids = new Set();
      links.forEach(link => {
        const match = link.href.match(/\/jobs\/(\d+)/);
        if (match) ids.add(match[1]);
      });
      return [...ids];
    });

    console.log(`Found ${jobIds.length} unique job IDs: ${jobIds.join(', ')}`);

    const jobs = [];

    // Visit each job detail page to get accurate data
    for (const jobId of jobIds) {
      const jobUrl = `https://www.paycomonline.net/v4/ats/web.php/portal/${PAYCOM_CLIENT_KEY}/jobs/${jobId}`;
      console.log(`\nFetching job ${jobId}...`);

      try {
        await page.goto(jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500); // Wait for React to render

        // Extract job details from the detail page
        const jobData = await page.evaluate(() => {
          const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.innerText.trim() : '';
          };

          // Get all text content from the page
          const bodyText = document.body.innerText;

          // Try to find the job title - usually in an h1 or prominent heading
          let title = '';
          const h1 = document.querySelector('h1');
          const h2 = document.querySelector('h2');
          if (h1) title = h1.innerText.trim();
          else if (h2) title = h2.innerText.trim();

          // If no title found, look for text with req ID pattern
          if (!title) {
            const titleMatch = bodyText.match(/([A-Za-z\s\-\/]+)\s*\(\d{4,6}\)/);
            if (titleMatch) title = titleMatch[0];
          }

          return {
            title,
            bodyText: bodyText.slice(0, 2000), // First 2000 chars for parsing
          };
        });

        // Parse the extracted data
        const { title: rawTitle, bodyText } = jobData;
        const reqId = parseReqId(rawTitle) || parseReqId(bodyText);
        const title = cleanTitle(rawTitle) || `Job ${jobId}`;
        const location = parseLocation(bodyText);
        const jobType = parseJobType(bodyText);
        const salary = parseSalary(bodyText);

        // Extract summary - look for "Job Summary" section
        let summary = '';
        const summaryMatch = bodyText.match(/Job Summary[:\s]*([^]*?)(?:Qualifications|Requirements|About|Benefits|$)/i);
        if (summaryMatch) {
          summary = summaryMatch[1].trim().slice(0, 250);
        }

        console.log(`  Title: ${title}`);
        console.log(`  Location: ${location}`);
        console.log(`  Type: ${jobType}`);

        jobs.push({
          paycomId: jobId,
          reqId,
          title,
          location,
          type: jobType,
          salary,
          summary,
          bodyText
        });

      } catch (err) {
        console.log(`  Error fetching job ${jobId}: ${err.message}`);
      }
    }

    // Go back to main page for final screenshot
    await page.goto(PAYCOM_URL, { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`\nSuccessfully extracted ${jobs.length} jobs`);

    // Process into final format
    const processedJobs = jobs.map(job => ({
      id: `EH-${job.paycomId}`,
      paycomId: job.paycomId,
      reqId: job.reqId,
      title: job.title,
      department: inferDepartment(job.title),
      location: job.location,
      type: job.type,
      schedule: '',
      posted: new Date().toISOString().split('T')[0],
      featured: false,
      summary: job.summary,
      description: '',
      salary: job.salary,
      applyUrl: `https://www.paycomonline.net/v4/ats/web.php/portal/${PAYCOM_CLIENT_KEY}/jobs/${job.paycomId}`
    }));

    await browser.close();
    return processedJobs;

  } catch (error) {
    console.error('Scraping error:', error.message);
    await browser.close();
    throw error;
  }
}

async function getExistingJobs() {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    console.log('JSONbin credentials not set, skipping fetch of existing jobs');
    return null;
  }

  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });

    if (!response.ok) {
      console.log('Could not fetch existing jobs:', response.status);
      return null;
    }

    const data = await response.json();
    return data.record || data;
  } catch (error) {
    console.log('Error fetching existing jobs:', error.message);
    return null;
  }
}

async function updateJsonbin(jobsData) {
  if (!JSONBIN_BIN_ID || !JSONBIN_API_KEY) {
    console.log('\n⚠️  JSONbin credentials not set. Output:');
    console.log(JSON.stringify(jobsData, null, 2));
    return false;
  }

  console.log('Updating JSONbin...');

  const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_API_KEY
    },
    body: JSON.stringify(jobsData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JSONbin update failed: ${response.status} - ${errorText}`);
  }

  console.log('JSONbin updated successfully!');
  return true;
}

async function main() {
  console.log('='.repeat(50));
  console.log('Paycom Careers Scraper');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  try {
    // Scrape current jobs from Paycom
    const scrapedJobs = await scrapePaycom();

    if (scrapedJobs.length === 0) {
      console.log('⚠️  No jobs found. The page structure may have changed.');
      process.exit(1);
    }

    // Get existing jobs to preserve featured flags
    const existing = await getExistingJobs();
    const existingJobsMap = new Map();

    if (existing?.jobs) {
      existing.jobs.forEach(job => {
        existingJobsMap.set(job.paycomId, job);
      });
    }

    // Merge: preserve featured flag and any manual edits to summary
    const mergedJobs = scrapedJobs.map(job => {
      const existingJob = existingJobsMap.get(job.paycomId);
      if (existingJob) {
        return {
          ...job,
          featured: existingJob.featured || false,
          // Preserve manually edited summaries if they exist
          summary: existingJob.summary || job.summary,
          // Preserve schedule if manually set
          schedule: existingJob.schedule || job.schedule,
          // Preserve original posted date
          posted: existingJob.posted || job.posted
        };
      }
      return job;
    });

    // Build final structure
    const jobsData = {
      organization: 'Emmaus Homes',
      updated: new Date().toISOString(),
      source: 'github-actions-scraper',
      jobs: mergedJobs
    };

    // Report changes
    const newJobIds = new Set(scrapedJobs.map(j => j.paycomId));
    const oldJobIds = new Set(existingJobsMap.keys());

    const added = [...newJobIds].filter(id => !oldJobIds.has(id));
    const removed = [...oldJobIds].filter(id => !newJobIds.has(id));

    console.log('\n📊 Summary:');
    console.log(`   Total jobs: ${mergedJobs.length}`);
    console.log(`   New jobs: ${added.length}`);
    console.log(`   Removed jobs: ${removed.length}`);

    if (added.length > 0) {
      console.log('\n✅ New positions:');
      added.forEach(id => {
        const job = scrapedJobs.find(j => j.paycomId === id);
        console.log(`   - ${job.title} (${job.location})`);
      });
    }

    if (removed.length > 0) {
      console.log('\n❌ Closed positions:');
      removed.forEach(id => {
        const job = existingJobsMap.get(id);
        console.log(`   - ${job.title}`);
      });
    }

    // Update JSONbin
    await updateJsonbin(jobsData);

    console.log('\n✅ Scraper completed successfully!');
    console.log('='.repeat(50));

    // Set output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `jobs_count=${mergedJobs.length}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_jobs=${added.length}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `removed_jobs=${removed.length}\n`);
    }

  } catch (error) {
    console.error('\n❌ Scraper failed:', error.message);
    process.exit(1);
  }
}

// Helper functions need to be available in page.evaluate context
function parseReqId(text) {
  const match = text.match(/\((\d{4,6})\)/);
  return match ? match[1] : '';
}

function cleanTitle(title) {
  return title.replace(/\s*\(\d{4,6}\)\s*/, '').trim();
}

function parseLocation(text) {
  const match = text.match(/([A-Z][a-zA-Z.\s]+),\s*([A-Z]{2})(?:\s+\d{5})?/);
  if (match) {
    return `${match[1].trim()}, ${match[2]}`;
  }
  return '';
}

function parseJobType(text) {
  if (text.includes('Full-Time/Part-Time') || text.includes('Full Time/Part Time')) {
    return 'Full-Time/Part-Time';
  }
  if (text.includes('Part-Time') || text.includes('Part Time')) {
    return 'Part-Time';
  }
  if (text.includes('Full-Time') || text.includes('Full Time')) {
    return 'Full-Time';
  }
  if (text.includes('Contract')) return 'Contract';
  if (text.includes('PRN')) return 'PRN';
  return 'Full-Time';
}

function parseSalary(text) {
  const hourlyMatch = text.match(/\$[\d,.]+\s*(?:\/|\s)?hr\.?/i);
  const yearlyMatch = text.match(/\$[\d,]+\s*(?:\/|\s)?yr\.?/i);
  const rangeMatch = text.match(/\$[\d,.]+\s*[-–—]\s*\$[\d,.]+/);

  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, ' ');
  if (hourlyMatch) return hourlyMatch[0].replace(/\s+/g, '');
  if (yearlyMatch) return yearlyMatch[0].replace(/\s+/g, '');
  return '';
}

main();
