# PDF Rendering & Environment Consistency

## Overview

JobCheck generates PDFs using `html2canvas` + `jsPDF` on both client and server environments. To minimize rendering differences between development and production, we lock critical versions.

## Environment Consistency

### Locked Versions
- **Node.js**: `20.11.0` (locked in `.nvmrc` and `netlify.toml`)
- **npm**: Latest compatible with Node 20.11.0
- **html2canvas**: See `package.json`
- **jsPDF**: See `package.json`

### Why Locking Matters
Different versions of Node, npm, or rendering libraries produce slightly different PDFs due to:
- Font rendering engine differences
- Image loading timeouts
- CSS parsing variations
- Box model calculations

### Setting Up Locally
1. Install Node 20.11.0:
   ```bash
   nvm install 20.11.0
   nvm use  # Uses version from .nvmrc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## PDF Generation Paths

### Development (`npm run dev`)
- Client-side rendering with html2canvas
- Direct browser rendering engine
- Immediate image loading
- Consistent with your system fonts

### Netlify Dev (`netlify dev`)
- Server-side rendering in headless Chromium
- `imageTimeout: 5000ms` for remote images
- Headless environment (no GUI)
- Different font anti-aliasing

### Production (Deployed)
- Server-side rendering in Netlify's headless environment
- Same settings as `netlify dev`
- `imageTimeout: 3000ms` for performance
- Consistent with locked Node version

## Expected Differences

**Minor variations may occur:**
- Font rendering appears slightly sharper or softer
- Image loading timing (especially for external images)
- Subpixel anti-aliasing differences
- Color space conversion in PDF compression

**These are normal and acceptable** for browser-to-PDF conversion.

## PDF Configuration

See `src/utils/pdfReport.ts` for rendering settings:
- `scale: 2` - Double resolution for sharp typography
- `useCORS: true` - Load cross-origin images
- `allowTaint: true` - Allow mixed content images
- `backgroundColor: "#ffffff"` - White page background
- `imageTimeout` - Configured per environment

## Testing PDFs Across Environments

To verify rendering consistency:

1. **Local dev**: `npm run dev` → Download PDF
2. **Local Netlify**: `netlify dev` → Download PDF
3. **Production**: Deploy and download PDF
4. Compare visually (minor font differences are acceptable)

## Future Improvements

If pixel-perfect consistency becomes critical:
- Use dedicated PDF service (PDFShift, CloudConvert)
- Switch to server-side rendering with fixed Chromium version
- Pre-render static PDFs at build time
- Use Puppeteer Cloud for consistent headless rendering
