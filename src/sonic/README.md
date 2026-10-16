# Sonic Logo

This folder contains the brand sonic logo video that plays when users first visit the website.

## Files

- **SonicLogo.mp4** - The brand introduction video (3MB)

## How It Works

1. **First Visit**: When a user visits the site for the first time in a session, the sonic logo video plays automatically with sound
2. **Skip Option**: Users can skip the intro at any time by:
   - Clicking the "Skip Intro" button (top-right)
   - Pressing the ESC key
3. **Session Memory**: After watching or skipping once, the intro won't show again in the same browser session
4. **Accessibility**: 
   - Respects `prefers-reduced-motion` setting
   - Includes ARIA labels for screen readers
   - Shows progress indicator
5. **Fallback**: If autoplay with sound is blocked by the browser, it mutes and retries. If that fails, it skips automatically.

## Implementation

The sonic intro is implemented in:
- `src/components/SonicIntro/SonicIntro.ts` - Component logic
- `src/styles/sonic-intro.css` - Styling
- `src/main.ts` - Integration point

The video plays before `initApp()` is called, ensuring a smooth branded experience.

## Best Practices Applied

Based on 2026 web trends:
- ✅ Keep intro under 6 seconds
- ✅ Provide skip option
- ✅ Remember user preference
- ✅ Accessibility compliant
- ✅ Graceful fallbacks for autoplay policies
- ✅ Responsive design (works on mobile)
- ✅ Progress indicator for user feedback
