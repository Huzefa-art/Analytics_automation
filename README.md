# 🔍 Website Tech Detector

Scans a list of websites and outputs an Excel report showing what
CMS, CRM, analytics, chat, payment, and ad tools each site uses.

---

## ⚡ Quick Setup (one-time)

```bash
pip install -r requirements.txt
```

---

## 🚀 How to Use

**Step 1** — Add your URLs to `urls.txt` (one per line):
```
shopify.com
notion.so
yourcompetitor.com
```

**Step 2** — Run the script:
```bash
python tech_detector.py
```

**Step 3** — Open the generated `tech_report_YYYYMMDD_HHMMSS.xlsx`

---

## ⚙️ Options

```bash
# Custom input file
python tech_detector.py my_leads.txt

# Custom input + custom output name
python tech_detector.py my_leads.txt output.xlsx
```

---

## 📋 What It Detects

| Category                  | Examples                                      |
|---------------------------|-----------------------------------------------|
| CMS                       | WordPress, Shopify, Wix, Webflow, Squarespace |
| CRM / Marketing Automation| HubSpot, Salesforce, Klaviyo, Marketo         |
| Analytics                 | GA4, GTM, Hotjar, Mixpanel, Segment, Heap     |
| Live Chat / Support       | Intercom, Drift, Zendesk, Crisp, Tawk.to      |
| Payments                  | Stripe, PayPal, Klarna, Razorpay              |
| Advertising / Pixels      | FB Pixel, Google Ads, LinkedIn, TikTok        |
| Hosting / CDN             | Cloudflare, AWS, Vercel, Netlify              |
| JavaScript Frameworks     | React, Vue, Angular, Next.js, jQuery          |

---

## 📊 Output

- **Tech Stack Report** sheet — one row per site, colour-coded cells
- **Summary** sheet — technology popularity ranking across all sites

---

## ⚠️ Notes

- Detection is based on HTML fingerprinting (like BuiltWith/Wappalyzer)
- Some server-side tools (e.g. backend CRMs) may not be detectable
- Obfuscated or headless sites may show fewer results
- The script waits 0.5s between requests to avoid rate-limiting
