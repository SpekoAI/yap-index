# RSS Feed Verification Status

Verified on 2026-07-12 with:

```sh
bun run pipeline/verify.ts
```

The verifier fetches and parses each configured RSS feed, requires at least one
audio enclosure, and sends a `HEAD` request with redirects enabled to the newest
audio enclosure.

| Show | Feed URL | Status | Feed title | Audio items | Sample enclosure | Verified |
| --- | --- | --- | --- | ---: | --- | --- |
| All-In Podcast | https://rss.libsyn.com/shows/254861/destinations/1928300.xml | OK | All-In with Chamath, Jason, Sacks & Friedberg | 397/397 | HTTP 200 | 2026-07-12 |
| Lex Fridman Podcast | https://lexfridman.com/feed/podcast/ | OK | Lex Fridman Podcast | 499/499 | HTTP 200 | 2026-07-12 |
| Acquired | https://feeds.transistor.fm/acquired | OK | Acquired | 215/215 | HTTP 200 | 2026-07-12 |
| My First Million | https://feeds.megaphone.fm/HS2300184645 | OK | My First Million | 880/880 | HTTP 200 | 2026-07-12 |
| Lenny's Podcast | https://api.substack.com/feed/podcast/10845.rss | OK | Lenny's Podcast: Product \| Career \| Growth | 352/352 | HTTP 200 | 2026-07-12 |
| Dwarkesh Podcast | https://apple.dwarkesh-podcast.workers.dev/feed.rss | OK | Dwarkesh Podcast | 133/133 | HTTP 200 | 2026-07-12 |
| Latent Space | https://api.substack.com/feed/podcast/1084089.rss | OK | Latent Space: The AI Engineer Podcast | 213/213 | HTTP 200 | 2026-07-12 |
| a16z Podcast | https://feeds.simplecast.com/JGE3yC0V | OK | The a16z Show | 1000/1000 | HTTP 200 | 2026-07-12 |
| This Week in Startups | https://rss.libsyn.com/shows/624860/destinations/5500155.xml | OK | This Week in Startups | 298/300 | HTTP 200 | 2026-07-12 |
| Pivot | https://feeds.megaphone.fm/pivot | OK | Pivot | 789/789 | HTTP 200 | 2026-07-12 |

No feed URL changes or show substitutions were required.
