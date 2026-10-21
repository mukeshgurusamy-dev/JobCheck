const targetUrl = "https://www.linkedin.com/jobs/view/4477297874/";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractHtmlContent(html) {
  if (!html) return { title: "", text: "" };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch?.[1] ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text: clean.slice(0, 25000) };
}

function isBotOrCaptchaBlock(text) {
  if (!text || text.trim().length < 30) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("trouble accessing google search") ||
    lower.includes("unusual traffic from your computer network") ||
    lower.includes("our systems have detected unusual traffic") ||
    lower.includes("attention required! | cloudflare") ||
    lower.includes("checking your browser before accessing") ||
    lower.includes("please enable cookies") ||
    (lower.includes("access denied") && text.length < 350) ||
    (lower.includes("403 forbidden") && text.length < 350) ||
    lower.includes("target url returned error 404") ||
    lower.includes("target url returned error 403") ||
    lower.includes("cf-browser-verification")
  );
}

// Strategy 1-3: Direct fetch with multiple User-Agents
async function testDirectFetch() {
  console.log("\n" + "=".repeat(80));
  console.log("STRATEGY 1-3: Direct Fetch (with 3 User-Agents)");
  console.log("=".repeat(80));

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 JobCheck/1.0",
    "Twitterbot/1.0 (JobCheck Preview Bot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  ];

  for (let i = 0; i < userAgents.length; i++) {
    try {
      console.log(`\n  Attempt ${i + 1}: ${userAgents[i].substring(0, 60)}...`);
      const res = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgents[i],
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        },
        timeout: 7000,
      });

      console.log(`  Status: ${res.status}`);
      const html = await res.text();
      const contentLength = html.length;
      console.log(`  Response size: ${contentLength} bytes`);

      if (res.status >= 200 && res.status < 400) {
        const { title, text } = extractHtmlContent(html);
        const isBlocked = isBotOrCaptchaBlock(text);
        console.log(`  Title: ${title.substring(0, 80)}`);
        console.log(`  Extracted text length: ${text.length} chars`);
        console.log(`  Blocked/CAPTCHA detected: ${isBlocked}`);
        if (!isBlocked && text.length > 100) {
          console.log(`  ✅ SUCCESS - Got ${text.length} chars`);
          console.log(`  Preview: ${text.substring(0, 150)}...`);
          return { success: true, text, title };
        }
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  console.log(`  ❌ All direct fetch attempts failed`);
  return { success: false };
}

// Strategy 4: Jina Reader
async function testJina() {
  console.log("\n" + "=".repeat(80));
  console.log("STRATEGY 4: Jina Reader (r.jina.ai)");
  console.log("=".repeat(80));

  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    console.log(`  URL: ${jinaUrl.substring(0, 80)}...`);

    const res = await fetch(jinaUrl, {
      headers: {
        "X-No-Cache": "true",
      },
      timeout: 6000,
    });

    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response size: ${text.length} bytes`);

    if (res.ok) {
      const isBlocked = isBotOrCaptchaBlock(text);
      console.log(`  Blocked/CAPTCHA detected: ${isBlocked}`);
      if (!isBlocked && text.length > 100) {
        console.log(`  ✅ SUCCESS - Got ${text.length} chars`);
        console.log(`  Preview: ${text.substring(0, 150)}...`);
        return { success: true, text };
      } else if (text.length <= 100) {
        console.log(`  ❌ Too little content (${text.length} chars)`);
      }
    }
    console.log(`  ❌ Jina failed`);
    return { success: false };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false };
  }
}

// Strategy 5: Google Cache
async function testGoogleCache() {
  console.log("\n" + "=".repeat(80));
  console.log("STRATEGY 5: Google Cache");
  console.log("=".repeat(80));

  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(targetUrl)}&hl=en`;
    console.log(`  Cache URL constructed`);

    const res = await fetch(cacheUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Referer": "https://www.google.com/",
      },
      timeout: 4000,
    });

    console.log(`  Status: ${res.status}`);
    const html = await res.text();
    console.log(`  Response size: ${html.length} bytes`);

    if (res.ok) {
      const { title, text } = extractHtmlContent(html);
      const isBlocked = isBotOrCaptchaBlock(text);
      console.log(`  Extracted text length: ${text.length} chars`);
      console.log(`  Blocked/CAPTCHA detected: ${isBlocked}`);
      if (!isBlocked && text.length > 100) {
        console.log(`  ✅ SUCCESS - Got ${text.length} chars`);
        console.log(`  Preview: ${text.substring(0, 150)}...`);
        return { success: true, text, title };
      }
    }
    console.log(`  ❌ Google Cache failed`);
    return { success: false };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false };
  }
}

// Strategy 6: Search Snippets (DuckDuckGo)
async function testSearchSnippet() {
  console.log("\n" + "=".repeat(80));
  console.log("STRATEGY 6: Search Snippets (DuckDuckGo site search)");
  console.log("=".repeat(80));

  try {
    const rootDomain = "linkedin.com";
    const query = encodeURIComponent(`site:${rootDomain} careers job vacancy`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;
    console.log(`  Query: site:${rootDomain} careers job vacancy`);

    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
      },
      timeout: 6000,
    });

    console.log(`  Status: ${res.status}`);
    const html = await res.text();
    console.log(`  Response size: ${html.length} bytes`);

    if (res.ok) {
      const snippetMatches = html.matchAll(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi);
      const snippets = [];
      for (const m of snippetMatches) {
        if (m[1]) {
          snippets.push(m[1].replace(/<[^>]+>/g, " ").trim());
        }
      }
      const combined = snippets.join(" ").replace(/\s+/g, " ").trim();
      console.log(`  Snippets found: ${snippets.length}`);
      console.log(`  Combined length: ${combined.length} chars`);

      const isBlocked = isBotOrCaptchaBlock(combined);
      console.log(`  Blocked/CAPTCHA detected: ${isBlocked}`);
      if (!isBlocked && combined.length > 50) {
        console.log(`  ✅ SUCCESS - Got ${combined.length} chars`);
        console.log(`  Preview: ${combined.substring(0, 150)}...`);
        return { success: true, text: combined.slice(0, 10000) };
      }
    }
    console.log(`  ❌ Search snippets failed or too short`);
    return { success: false };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false };
  }
}

// Strategy 7: DuckDuckGo Instant Answer
async function testDuckDuckGoInstant() {
  console.log("\n" + "=".repeat(80));
  console.log("STRATEGY 7: DuckDuckGo Instant Answer API");
  console.log("=".repeat(80));

  try {
    const domain = "linkedin.com";
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(domain)}&format=json&no_html=1&skip_disambig=1`;
    console.log(`  Query domain: ${domain}`);

    const res = await fetch(ddgUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobCheck/1.0)",
      },
      timeout: 5000,
    });

    console.log(`  Status: ${res.status}`);
    const data = await res.json();

    if (res.ok) {
      const parts = [];
      if (data.AbstractText) parts.push(data.AbstractText);
      if (data.Abstract && data.Abstract !== data.AbstractText) parts.push(data.Abstract);
      if (data.Answer) parts.push(data.Answer);
      if (data.Definition) parts.push(data.Definition);
      if (data.RelatedTopics) {
        const topics = data.RelatedTopics
          .slice(0, 5)
          .map((t) => t.Text ?? "")
          .filter(Boolean);
        parts.push(...topics);
      }

      const combined = parts.join(" ").trim();
      console.log(`  Parts collected: ${parts.length}`);
      console.log(`  Combined length: ${combined.length} chars`);

      const isBlocked = isBotOrCaptchaBlock(combined);
      console.log(`  Blocked/CAPTCHA detected: ${isBlocked}`);
      if (!isBlocked && combined.length > 20) {
        console.log(`  ✅ SUCCESS - Got ${combined.length} chars`);
        console.log(`  Preview: ${combined.substring(0, 150)}...`);
        return { success: true, text: combined };
      }
    }
    console.log(`  ❌ DuckDuckGo Instant Answer failed or too short`);
    return { success: false };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false };
  }
}

// Main test runner
async function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " ".repeat(78) + "║");
  console.log("║" + "  FALLBACK EXTRACTION STRATEGY TEST  ".padEnd(78) + "║");
  console.log("║" + " ".repeat(78) + "║");
  console.log("║" + `  URL: ${targetUrl}`.padEnd(78) + "║");
  console.log("║" + " ".repeat(78) + "║");
  console.log("╚" + "═".repeat(78) + "╝");

  const results = [];

  // Run tests in order
  const direct = await testDirectFetch();
  results.push({ strategy: "Direct Fetch (3 UAs)", ...direct });
  if (direct.success) {
    console.log("\n✅ EXTRACTION SUCCEEDED at Strategy 1-3. Would stop here.");
    printSummary(results);
    return;
  }

  await sleep(500); // Rate limit between requests
  const jina = await testJina();
  results.push({ strategy: "Jina Reader", ...jina });
  if (jina.success) {
    console.log("\n✅ EXTRACTION SUCCEEDED at Strategy 4. Would stop here.");
    printSummary(results);
    return;
  }

  await sleep(500);
  const cache = await testGoogleCache();
  results.push({ strategy: "Google Cache", ...cache });
  if (cache.success) {
    console.log("\n✅ EXTRACTION SUCCEEDED at Strategy 5. Would stop here.");
    printSummary(results);
    return;
  }

  await sleep(500);
  const search = await testSearchSnippet();
  results.push({ strategy: "Search Snippets", ...search });
  if (search.success) {
    console.log("\n✅ EXTRACTION SUCCEEDED at Strategy 6. Would stop here.");
    printSummary(results);
    return;
  }

  await sleep(500);
  const instant = await testDuckDuckGoInstant();
  results.push({ strategy: "DuckDuckGo Instant", ...instant });
  if (instant.success) {
    console.log("\n✅ EXTRACTION SUCCEEDED at Strategy 7. Would stop here.");
    printSummary(results);
    return;
  }

  console.log("\n❌ ALL STRATEGIES FAILED. Would fallback to URL-only analysis.");
  printSummary(results);
}

function printSummary(results) {
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  for (const r of results) {
    const status = r.success ? "✅ SUCCESS" : "❌ FAILED";
    console.log(`  ${status} - ${r.strategy}`);
  }
}

runAllTests().catch(console.error);
