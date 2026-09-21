# Customer accounts — architecture decision (Phase 8)

**Evidence.** The reference storefront links its account icon to `/customer_authentication/redirect`, i.e. Shopify's *new customer accounts* (hosted by Shopify, passwordless, one-time email codes). No `/account/login` page is part of the reference.

**Shopify today.** Two systems exist:
1. *New customer accounts* — login, registration, orders, addresses and profile are hosted by Shopify. The theme cannot render or customise them; `templates/customers/*` are ignored. The theme's part is the header account link (`routes.account_url` / `routes.account_login_url`), which Shopify redirects correctly.
2. *Classic customer accounts* — the theme renders the pages with Liquid (`templates/customers/*`, forms `customer_login`, `create_customer`, `recover_customer_password`, `reset_customer_password`, `activate_customer_password`, `customer_address`).

**Decision.** The header keeps using Shopify's account routes (works with both). The theme *also* ships complete classic-account templates (login + recovery, register, account + orders, order detail, addresses, reset password, activate account) so a store that still uses classic accounts is fully styled. With new customer accounts enabled they are simply unused. Nothing pretends to handle authentication itself: every form posts to Shopify.

**Not verified.** Real authentication, email delivery, order/address data and the address-delete `_method` override were only exercised against the mock storefront.
