# Brand assets

- `logo.svg`: editable copper open-cube mark, also used as the favicon.
- `og-image.jpg`: 1200 × 630 social preview for the home page: the open copper cube from the landing-page hero.
- `og/<slug>.jpg`: 1200 × 630 social preview for each appliance page.

All six social cards share one layout on the blueprint-navy dark theme: the logo and site name, the appliance number and title in Syne, the one-line summary from its landing card, the domain, and a dark-theme render of the model (the 1280 px thumbnail, or the hero cube for the home page). They are HTML rendered to JPEG (quality 88) at 1200 × 630, so re-render them when a model or the theme changes. The logo is a simple native SVG. Metadata is embedded in each HTML document so crawlers do not need JavaScript. New appliance pages should include the same metadata with their own title, description, and canonical URL.

Production origin: `https://howshitworks.darshanpania.me`. Deploy the HTML and public assets together. Live unfurls require deployment; services may cache previous previews.
