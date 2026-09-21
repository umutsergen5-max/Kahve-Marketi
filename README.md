# Vengo Roastery — Shopify theme

An original **Shopify Online Store 2.0** theme for a coffee roastery and online shop (coffee, brewing equipment, accessories). It is written from scratch: layout, spacing and interaction ideas only, no third-party theme code, no third-party brand content, no bundled fonts or images.

**Vengo Roastery is a temporary working brand name.** It is a default value of one theme setting, not text in the templates (see below).

## Status

Phases 1–8 are implemented and were validated **only against a local mock storefront** (real Liquid rendering, browser tests at 375 / 390 / 768 / 1024 / 1280 px, accessibility and structural checks). The theme has **not** yet been uploaded to Shopify, and **Shopify Theme Check has not been run**.

| Phase | Scope |
|---|---|
| 1–2 | Analysis, foundation: tokens, base CSS, settings, locales, JS core |
| 3 | Global chrome: announcement bar, header, mega menu, mobile menu, search / cart / quick-add drawers, footer |
| 4 | Home page: hero, grids, featured product / collection, slideshows, product card |
| 5 | Collections: filters, sorting, pagination, layout toggle, collection list |
| 6 | Product page: gallery, variants, quantity, dynamic checkout, recommendations, recently viewed |
| 7 | Content: blog (masonry), article, page, FAQ, wholesale, locations, legal presentation |
| 8 | Search results, cart page, customer templates (classic accounts), 404, password, gift card |

Default language is Turkish (`locales/tr.default.json`); more locales can be added next to it.

## Brand and typography (theme settings)

Everything is edited in the theme editor → **Theme settings**; nothing is hardcoded.

- **Brand name** — `brand_name` (default `Vengo Roastery`). Blank falls back to the Shopify store name. Used for the header wordmark, footer copyright, page title suffix, Open Graph site name, structured data and the password / gift-card pages.
- **Logo and favicon** — `logo`, `logo_width`, `logo_width_mobile`, `favicon`.
- **Fonts** — `font_heading` (default Francois One) and `font_body` (default Inconsolata; also navigation, buttons, forms). Both are Shopify font pickers; only `snippets/css-variables.liquid` turns them into CSS variables.

Details: [docs/brand-and-typography.md](docs/brand-and-typography.md). Customer-account architecture: [docs/customer-accounts.md](docs/customer-accounts.md).

## Structure

```
assets/      CSS and JavaScript (no images, no font files)
config/      settings_schema.json, settings_data.json
layout/      theme.liquid, password.liquid
locales/     tr.default.json (+ schema strings)
sections/    page and layout sections
snippets/    shared components (cards, price, forms, icons, …)
templates/   JSON templates (+ gift_card.liquid)
docs/        notes (not uploaded to Shopify, see .shopifyignore)
```

## The reference site

The site used as a layout / UX reference during design is **not part of this repository**, and no content, images, code or identifiers from it are included.

## Intended workflow

1. **GitHub** — this repository is the source of truth. Work on a branch, open a pull request, merge to `main`.
2. **Shopify** — connect the repository to a development or unpublished theme through Shopify's GitHub integration (or Shopify CLI). Nothing is connected yet.
3. **Preview** — review the connected, unpublished theme in the theme editor and preview; run Shopify Theme Check; fix findings.
4. **Publish** — publish the theme from the Shopify admin only after review.

## Known open items (need a real Shopify store)

Theme Check; real customer authentication, order and address data; real gift-card data (QR image not included); the `previous_article` / `next_article` direction; Section Rendering of the cart page on a live store; real screen-reader testing.

## Security

Do not commit credentials, API tokens, `.env` files or store-specific configuration (see `.gitignore`).
