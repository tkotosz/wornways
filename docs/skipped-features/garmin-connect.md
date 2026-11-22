# Garmin Connect

Status: **not built, on purpose** (decided 2026-11-22). Garmin activities come in through
the account export ZIP and single activity files (see [web-app.md](../web-app.md)). This page
explains why Wornways has no "Connect with Garmin" sign-in, and what would have to change
to add one.

## What a sign-in needs

Garmin offers its data through the Garmin Connect Developer Program, which has three tiers
(as of 2026-11-22):

| Tier       | Who it is for                           | Delivery          | History               | Users                   | Cost                                                                      |
| ---------- | --------------------------------------- | ----------------- | --------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Personal   | One person reading their own data       | Pull              | n/a                   | Only the key's owner    | Free                                                                      |
| Starter    | Organizations with apps for other users | Push only         | None                  | Capped (reported 1,000) | Free (reported)                                                           |
| Enterprise | Organizations at scale                  | Push or ping/pull | About 1 month or more | Unlimited               | Reported $1,000 onboarding fee plus fees per active user, from 2027-04-01 |

- **Personal does not fit.** Its API key comes from the developer's own Garmin Connect
  account and may be used only by its owner. It cannot let other people sign in.
- **Starter or Enterprise is required** for a normal OAuth 2.0 (PKCE) sign-in. The sign-in
  works like Strava's: authorize at `connect.garmin.com/oauth2Confirm`, exchange the code
  at `diauth.garmin.com/di-oauth2-service/oauth/token`.

## Why it is not built

1. **Only a legal entity can apply.** The Starter access request form is "intended for
   businesses, organizations and other commercial entities". It asks for:
   - a legal company name and company address;
   - a contact with legal authority to represent the company;
   - an email on a company domain (free mail providers and generic inboxes are turned
     away);
   - a privacy policy link and the business model;
   - every hosting provider or vendor that processes the data.

   Wornways has no legal entity behind it and no domain of its own, and registering one
   only for this is not worth it.

2. **Starter has no history.** A user who connects sees only activities recorded after
   that moment. The main use of Wornways is replaying past activities (a month, a season,
   a year), so a new connection would start empty. Enterprise backfill is reportedly one
   30-day window per data type, and it also needs a "historical data" permission that is
   off by default on Garmin's consent screen.
3. **Push means storing routes on a server.** Garmin sends each new activity to a webhook
   whenever the watch syncs, whether Wornways is open or not. The server would have to
   keep GPS tracks until the user opens the app. That breaks the rule that nothing leaves
   the device (see Rules in [web-app.md](../web-app.md)). It would also need encrypted
   storage, a retention rule, deletion on disconnect or permission change, and webhooks
   that answer within seconds and tolerate duplicate deliveries.

The export ZIP gives a Garmin user's whole history, with nothing stored on a server.

## What would change the decision

- Wornways gets a legal entity (sole trader or company), its own domain and a privacy
  policy. Garmin publishes no rule on whether a sole trader is accepted, and applying
  costs nothing.
- The program changes: Starter gets history, or pull delivery, so routes no longer have to
  be stored on a server.

If it is picked up again, check these sources first. The fees, the user cap and the token
lifetimes come from press and third-party posts. The full API, including whether an
activity push carries GPS samples or a FIT file, is documented only behind the Developer
Portal login after approval.

## Sources (checked 2026-11-22)

- [Garmin Connect Developer Program overview](https://developer.garmin.com/gc-developer-program/overview/):
  tiers, delivery and history.
- [Starter access request form](https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/):
  eligibility and the fields it asks for.
- [Garmin OAuth 2.0 PKCE specification (PDF)](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf):
  the token endpoint.
- [Garmin Rumors: the new tiers](https://garminrumors.com/garmin-connect-developer-program-personal-starter-enterprise/)
  and [Momentum: the program reopens](https://www.themomentum.ai/blog/garmin-connect-developer-program-reopens):
  the user cap, the fees and the reopening on 2026-10-21.
- [Open Wearables: Garmin API integration](https://openwearables.io/docs/providers/garmin-api-integration)
  and [developer guide](https://openwearables.io/blog/garmin-connect-api-developer-guide-activities-health-metrics):
  application tips, push delivery and backfill limits.
- [Apps for Strava: the Personal API key](https://appsforstrava.com/blog/garmin-connect-developer-program-personal-api-key):
  what the Personal tier allows.
