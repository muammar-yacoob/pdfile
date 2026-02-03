# PDFile Social Media Cards

This directory contains auto-generated social media sharing cards for PDFile.

## Cards Generated

All 9 taglines have corresponding cards:

1. **pdfile-card-1.png** - "No Safe Word for PDFs."
2. **pdfile-card-2.png** - "File Discipline, Delivered."
3. **pdfile-card-3.png** - "Dominate Your Documents."
4. **pdfile-card-4.png** - "Split. Merge. Repeat."
5. **pdfile-card-5.png** - "Turn Your PDFs Inside Out."
6. **pdfile-card-6.png** - "Your PDFs, Your Rules."
7. **pdfile-card-7.png** - "Because We Hate PDFs."
8. **pdfile-card-8.png** - "Commit Document Crimes."
9. **pdfile-card-9.png** - "Because PDFs Deserve Consequences."

## Specifications

- **Size**: 1200 x 630 pixels (optimal for social media)
- **Format**: PNG
- **Background**: Dark (#0a0a0a)
- **Brand Color**: #7fa5df (theme blue)
- **Text Color**: White (#ffffff)

## Layout

Each card contains:
- **Top**: "PDFile" in large white text
- **Center**: Tagline in brand blue color
- **Bottom**: "pdfile.co" in white text

## Regenerate Cards

To regenerate all cards:

```bash
npm run social-cards
```

## Usage

These cards are perfect for:
- Twitter/X posts (1200x630 is Twitter's recommended card size)
- Facebook posts
- LinkedIn articles
- Open Graph meta tags
- Blog post featured images
- Marketing materials

## Open Graph Implementation Example

```html
<meta property="og:image" content="https://pdfile.co/social-cards/pdfile-card-1.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:image" content="https://pdfile.co/social-cards/pdfile-card-1.png" />
```
