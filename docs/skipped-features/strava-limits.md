# Strava sign-in limits

Status: **capped at 10 athletes, on purpose for now** (decided 2026-11-22). "Connect with
Strava" works on the live site, but only for the first 10 athletes who connect. This page
explains why, what it would take to go further, and what to know before trying. How to set
up the integration is in the README ("Enabling Connect with Strava").

## Athlete capacity

Since 2026-06-01, Strava gates its API by how many athletes may connect to one app (as of
2026-11-22):

| Level                   | Athletes      | How to get there                                  | Rate limits (overall)       |
| ----------------------- | ------------- | ------------------------------------------------- | --------------------------- |
| Single Player Mode      | 1 (the owner) | Default for every new app                         | 200 per 15 min, 2,000 a day |
| Upgraded                | 10            | Self-service in the app's API settings, no review | 400 per 15 min, 4,000 a day |
| Standard tier, reviewed | Up to 9,999   | Strava's review of the app                        | Raised on review            |
| Extended Access         | 10,000+       | Strava's approval                                 | Higher, plus partner APIs   |

The Wornways app is at the upgraded level. Athlete 11 and later get Strava's "Limit of
connected athletes exceeded" error when they try to connect. Wornways shows no message of
its own for that yet. File and export ZIP import work for everyone.

## What it costs

- **The account that owns the app needs a Strava subscription.** Strava says "A Strava
  subscription is a prerequisite for creating an app", and existing developers had to
  subscribe by 2026-06-30. There is no separate API fee: the subscription is the price.
  It costs US $11.99 a month or $79.99 a year, and prices differ by country.
- **One app per Strava account.** Strava's API team says a second app needs a second
  Strava account, and that account would need its own subscription.
- **The review itself costs nothing.** The API Agreement allows Strava to charge for API
  access later, with notice.

So the cost depends on which account owns the app:

- **The app stays on the maintainer's own account.** No extra cost while that account is
  subscribed anyway. Its one app slot stays taken by Wornways.
- **The app moves to a dedicated Wornways account.** A second subscription, but the
  maintainer's own slot frees up, and the app no longer depends on one person's account.

`localhost` and `127.0.0.1` are always accepted as callback addresses, so local
development can use the same app. A second app is not needed for that.

## Going past 10 athletes

1. **Decide the owner account first.** An approval belongs to one app (one client ID). An
   app moved to another account after approval starts again at 1 athlete and needs
   another review. Moving means:
   - a new app, upgraded to 10;
   - new client ID and secret in the Pages settings;
   - the webhook registered again;
   - every connected athlete connecting again.
2. **Fill the 10 slots.** Strava only reviews apps that are close to their limit: "Once
   your app reaches 10 connected athletes and you're ready to scale further, please
   submit your app for review."
3. **Check the app against the API Agreement and the brand guidelines.** Already in
   place:
   - the official Connect with Strava button, linking to `strava.com/oauth/authorize`;
   - "View on Strava" links on activities;
   - webhooks instead of polling;
   - no activity or session data stored on the server;
   - a privacy page;
   - no "Strava" in the app's name, and no Strava logo in its icon.
4. **Prepare the sharing explanation.** This is the likely sticking point. Section 2.3 of
   the API Agreement says: "Strava Data provided by a specific user can only be displayed
   or disclosed in your Developer Application to that user." A Wornways video is made to
   be shared. Say so plainly in the application, and include the export and share flow:
   the video is made on the user's own device, from their own activities, and they choose
   whether to share it.
5. **Submit the Developer Program form.** It is linked from the rate-limits page. Include
   screenshots of every place Strava data is shown, and of the Connect with Strava button.
6. **Wait.** Strava says increased access "is not a guarantee" and gives no timeline.
   Developers report waits from about a week to several months, and some rejections
   without a reason.

## Small things to do meanwhile

- Catch the "Limit of connected athletes exceeded" error and tell the person to import
  their export ZIP or files instead.

## Sources (checked 2026-11-22)

- [Strava rate limits](https://developers.strava.com/docs/rate-limits/): capacity levels,
  the review steps and the form.
- [Strava getting started](https://developers.strava.com/docs/getting-started/): the
  subscription requirement and the self-service upgrade to 10.
- [Strava API Agreement](https://www.strava.com/legal/api), effective 2026-06-01: section
  2.3 (data shown only to its own user), future fees, one token per application.
- [Strava brand guidelines](https://developers.strava.com/guidelines/): button, "View on
  Strava", naming and logo rules.
- [Strava authentication](https://developers.strava.com/docs/authentication/): `localhost`
  and `127.0.0.1` are allowed callbacks.
- [Strava Community Hub: a second app](https://communityhub.strava.com/developers-api-7/how-to-register-a-second-app-with-the-strava-api-as-the-same-developer-13325)
  and [a reply from developers@strava.com](https://github.com/philippe-ths/ai-running-coach/issues/68):
  one app per account.
- [Apps for Strava: 2026 program changes](https://appsforstrava.com/blog/strava-developer-program-changes-2026):
  subscription price and deadlines, the Standard and Extended tiers.
- [AI Fitness API: Strava API in 2026](https://aifitnessapi.com/integrate/strava-api):
  reported review waits and rejections.
