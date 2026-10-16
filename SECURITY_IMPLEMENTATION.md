# 🔒 Security Implementation Guide - JobCheck

**CRITICAL: Follow these steps in order**

---

## ⚠️ STEP 1: IMMEDIATELY REVOKE COMPROMISED API KEY

**Your exposed API key:** `AQ.Ab8RN6LepMOQMt8MXvDXUrZAX_XkK-f-wewsZypK1HMDrhyjFw`

### Action Required NOW:

1. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/apis/credentials
   - Find this API key
   - Click the key → Click "DELETE" or "DISABLE"
   - Confirm deletion

2. **Check Usage:**
   - Go to: https://console.cloud.google.com/apis/dashboard
   - Review "Generative Language API" usage for last 7 days
   - Look for suspicious spikes or unusual patterns
   - Check billing: https://console.cloud.google.com/billing

---

## STEP 2: Generate Secure New API Key

1. **Create New Key with Restrictions:**
   ```
   Google Cloud Console → APIs & Services → Credentials → CREATE CREDENTIALS → API key
   ```

2. **Apply Restrictions Immediately:**
   
   **Application Restrictions:**
   - Select: "HTTP referrers (websites)"
   - Add allowed referrers:
     ```
     https://jobcheck.netlify.app/*
     https://*.netlify.app/*
     http://localhost:8888/*
     http://localhost:3000/*
     ```
   
   **API Restrictions:**
   - Select: "Restrict key"
   - Enable ONLY: "Generative Language API"
   
   **Save the key** - you'll need it in the next step

---

## STEP 3: Configure Netlify Environment Variables

### DO NOT store keys in .env file anymore!

1. **Go to Netlify Dashboard:**
   - Your site → Site settings → Environment variables

2. **Add New Variable:**
   ```
   Key: GEMINI_API_KEY
   Value: <your-new-secure-key>
   Scopes: All scopes (Production, Deploy Previews, Branch deploys)
   ```

3. **Add Optional Safe Browsing Key (if you have one):**
   ```
   Key: SAFE_BROWSING_KEY
   Value: <your-safe-browsing-key>
   Scopes: All scopes
   ```

4. **Save** → **Trigger Deploy** to apply changes

---

## STEP 4: Clean Up Local Environment

```bash
# Delete the compromised .env file
rm .env

# Verify it's gone
ls -la | grep .env

# Should only see .env.example (which is safe)
```

---

## STEP 5: Secure Your .env.example

Replace with safe template values:
```bash
# Template for local development. Copy to `.env` and fill in real values.
# NEVER commit the real `.env` — it is listed in .gitignore.

# Required for AI intelligence layer (Google Gemini, search grounding).
GEMINI_API_KEY=your_gemini_api_key_here

# Optional. Enables Google Safe Browsing rule (+60 risk points).
SAFE_BROWSING_KEY=your_safe_browsing_key_here
```

---

## STEP 6: Check Git History for Leaks

```bash
# Search for the compromised key in ALL git history
cd /path/to/jobcheck
git log -p --all | grep -i "AQ.Ab8RN6Le"

# Search for any .env commits
git log --all --full-history -- .env

# Search for generic API key patterns
git log -p --all | grep -E "(GEMINI_API_KEY|GOOGLE_API_KEY|API_KEY.*=)"
```

### If Found in Git History:
**The repository is permanently compromised.** You must:
1. Assume the key is public
2. Revoke ALL keys that ever appeared
3. Consider using BFG Repo-Cleaner to purge history:
   ```bash
   # Install BFG
   # Download from: https://rtyley.github.io/bfg-repo-cleaner/
   
   # Clean the repo
   bfg --delete-files .env
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   
   # Force push (WARNING: breaks all forks)
   git push --force --all
   ```

---

## STEP 7: Implement Code-Level Security Fixes

I'll now create secured versions of your critical files.

