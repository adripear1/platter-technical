# Product slider

A storefront section that shows up to ten products from a collection. The heading sits on the left, Shop all sits on the right, and each card shows the image, title, reviews, and price.

Open `index.html` in a browser. The preview is static: it does not need a build, an install, or a bundler. GitHub Pages serves that same file from the repository root.

## Files to review

| File | What it is |
| --- | --- |
| `index.html` | Section markup: heading, ten cards, progress bar, Show more |
| `js/slider.js` | Vanilla JavaScript. No theme code |
| `css/tailwind.css` | Tailwind utilities used by the preview |
| `css/slider.css` | The pieces utilities cannot express: the 4.75-card row, the progress thumb, and the mobile dropdown |
| `schema/product-slider.schema.json` | Section settings |

`src/tailwind.css` and `tailwind.config.js` regenerate `css/tailwind.css` with `npm run build:css`. Reviewers do not need to run that.

## Behavior

On desktop the row shows four full cards and about three quarters of the next one, then slides to the rest. Drag, the progress bar, and the arrow keys (while the progress bar is focused) all move the row. The progress thumb rests at 3px and grows to 6px on hover, keyboard focus, and touch.

Hovering a card, or focusing it, fades the photo to the second image.

Below 768px the first four products stay in a two-column grid. Show more drops the other six open, and Show less closes them. The progress bar is desktop only.

## Shopify

The theme section is in `shopify/` and does not use the theme's product card, carousel, or price snippets.

Copy these into a theme:

- `shopify/sections/product-slider.liquid`
- `shopify/snippets/product-slider-card.liquid`
- `shopify/assets/product-slider.css`
- `shopify/assets/product-slider.js`

In the theme editor, add **Product slider** and choose a collection. Products tagged `best-seller` get the left badge. A compare-at price higher than the price gets the right badge, for example `Save 20%`. Reviews read the standard product rating metafields (`reviews.rating` and `reviews.rating_count`). With no collection selected, the section shows the same ten sample products as the HTML preview.

`shopify/assets/product-slider.js` is the same behavior as `js/slider.js`. The stylesheet is scoped to `<product-slider>` and does not load Tailwind preflight into the theme.
