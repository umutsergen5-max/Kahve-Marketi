# Brand and typography

Everything below is edited in the Shopify theme editor: **Theme settings**. Nothing is hardcoded in templates, sections, snippets or JavaScript.

## Brand name — `settings.brand_name`
- Group **Marka, logo ve favicon** (settings_schema.json → `brand_name`). Default: `Vengo Roastery` (temporary working name).
- Used by: header wordmark (when no logo is uploaded) and logo `alt`, footer copyright line, browser tab title suffix, `og:site_name`, JSON-LD `WebSite.name` and `BlogPosting.publisher`.
- Empty field → falls back to the Shopify store name (`shop.name`).
- Pattern in Liquid: `{% assign brand = settings.brand_name | default: shop.name %}` (one line per file that needs it: layout/theme.liquid, sections/header, sections/footer, snippets/meta-tags, snippets/structured-data).
- To rename the brand: change the field. No code edit.

## Logo — `settings.logo`, `logo_width`, `logo_width_mobile`, `favicon`
Same group. No logo uploaded → the brand name is drawn as text in the heading font.

## Typography roles — group **Tipografi**
| Role | Setting | Default | Where it applies |
|---|---|---|---|
| Heading / display | `font_heading` | Francois One (`francois_one_n4`) | h1–h6, `.heading*`, prices, wordmark, large accent text |
| Body / UI | `font_body` | Inconsolata (`inconsolata_n4`) | paragraphs, navigation, buttons, forms, badges, captions |
| UI emphasis | derived from `font_body` (bold weight) | — | navigation and button labels |

- Both are Shopify `font_picker` settings (fonts are served from Shopify's font library; no font files ship in the theme).
- `snippets/css-variables.liquid` is the only place that turns the settings into CSS: `--font-heading-family/-weight/-style`, `--font-body-family/-weight/-style`, `--font-nav-weight`. All other CSS uses those variables (`var(--font-heading-family)`, `var(--font-body-family)`); no section declares a font by name.
- Related settings: `heading_letter_spacing`, `heading_uppercase`, `ui_uppercase`, and the size ranges (`size_banner`, `size_featured`, `size_section`, `size_block`, `size_body`, `size_nav`, `size_button`). Defaults keep the original hierarchy.
- No other fonts are introduced.
