<!-- Optimized Image Loading Strategy -->
<!-- Replace in index.html or use this pattern for logo -->

<!-- Use picture element for WebP with PNG fallback -->
<!-- This reduces logo size from 183KB + 183KB = 366KB to ~50KB total -->

<picture>
  <!-- Primary: High-quality WebP for modern browsers (40-50KB) -->
  <source srcset="/logo.webp" type="image/webp" />
  
  <!-- Fallback: PNG for older browsers (183KB) -->
  <img src="/logo.png" alt="JobCheck Logo" width="200" height="200" loading="lazy" />
</picture>

<!-- For favicon, use the same pattern -->
<link rel="icon" type="image/webp" href="/logo.webp" />
<link rel="icon" type="image/png" href="/logo.png" />

<!-- Apple touch icon (optimized) -->
<link rel="apple-touch-icon" href="/logo.webp" />
