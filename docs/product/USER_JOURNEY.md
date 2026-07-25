# User Journey

What a streetwear founder named Maya experiences from Day 0 to Day 90 on
LaunchWings. Concrete, narrative. Pair with [PRD](PRD.md) and
[PRODUCT](PRODUCT.md) for the operating spec.

## Who Maya is

- 27, runs **Vert Heat**, an LA-based streetwear label.
- 14K IG followers, 4K FB Page followers.
- Shopify store, ~$420K/yr revenue last 12 months.
- Drops a new capsule monthly (8-15 SKUs), restocks twice mid-month.
- Currently uses Manychat Pro + the $29 AI add-on. Hates the bills,
  hates the bot tone. Saw a Reddit thread about LaunchWings.

## Day 0 — Signup

She lands on launchwings.com from a Reddit comment. Hero says "The AI
launch concierge for streetwear brands. Run your drop in your voice, on
autopilot." She clicks "Start free trial."

Six minutes later (on her phone, between meetings):
1. Email + password, picks Starter $79
2. Connects @vertheat IG Business (OAuth, Meta consent screen, accepts
   permissions for messages + comments)
3. Connects Vert Heat Shopify store (OAuth)
4. Lands on the **First Drop wizard**

Card on file. 14-day trial. She didn't talk to a salesperson.

## Day 0 — First Drop wizard (8 minutes)

She watches a progress bar as we pull her last 100 captions and 50
recent DM threads. Then we show her three sample captions in the inferred
voice — one for a tease post, one for an order-confirmation DM, one for
a sizing question reply.

She reads them. The tease caption has the exact "no caps, sparse
adjectives, hyperlink at the end" rhythm her real posts have. The DM
reply opens with "yo" (which she does) and closes with "🔥" (which she
does).

She taps "feels right."

Next: she's prompted to schedule a launch. She has a drop next Friday;
she fills in:
- Drop type: Capsule (4 pieces)
- Drop date: Friday 6pm PT
- Theme name: "Late Bloom 02"
- Drop URL on Shopify (already populated)

We render her the **Launch Playbook preview** — 11 beats from T-7d
through T+3d. She swipes through. Beat 4 (the T-12h teaser) calls the
drop "drops at 6pm sharp" and she taps the edit pencil; changes "sharp"
to "on the dot" because that's how she talks. The edit is captured.

She approves the playbook. Exits to the Dashboard.

## Day 1-6 — Pre-launch

Saturday morning a notification: "Tease post is ready for your final
look — going live at 12pm." She opens, reads, taps approve. It goes
live. By that night she gets 9 DMs asking "is it sneakers or hoodies."
The AI replies to 7 in her voice ("hoodies. nothing else. soon."). She
manually replies to 2 — one is a question about a previous order, one
feels like a hot lead (mentions a specific colorway).

Sunday: Hot-Lead Inbox surfaces the colorway DM. The thread shows the
customer also visited the product page 4 times. Maya replies personally:
"yo got u, late bloom drops fri 6pm. send me a follow + I'll save u
the size." That customer buys on launch day.

Tuesday: another teaser. She makes only 2 edits across both posts. Her
edit-rate is at 22% by the end of the week.

## Day 7 — Drop day

Friday 6pm. She watches the dashboard from her couch.

- 6:00pm: drop post auto-publishes
- 6:01pm: first DM ("link?") — AI auto-replies with the Shopify URL
- 6:04pm: 12 simultaneous DMs flooding — AI is handling them, hot leads
  starting to bubble
- 6:11pm: Hot-Lead Inbox shows 4 leads. Maya taps into one — a customer
  has DM'd twice asking for size L and small Maya saw the inventory is
  3 left. She replies personally: "we got 3 left in L, lock it in." Customer
  buys 4 minutes later.
- 6:30pm: the first urgency beat fires automatically — Story poll "what
  are u copping." 
- 7:15pm: the first abandoned-cart trigger fires — DM to a user who
  added Late Bloom 02 hoodie to cart 18 minutes ago and didn't check
  out. AI sends: "yo saw u eyeing the bloom. anything I can answer?"
  User replies, buys.
- 9:00pm: she eats dinner. The bot keeps replying. She's not on her
  phone.
- 11:00pm: revenue counter shows $9,800. She's never had this clean a
  drop.

## Day 8-10 — Post-launch

The Launch Playbook fires:
- Saturday: low-stock urgency beat ("L in the hoodie down to 4")
- Sunday: restock-soon beat ("if u missed it, dropping again next
  month")
- Monday: recap post ("Late Bloom 02 — sold out in 38 hours")

Hot-Lead Inbox queues 3 customers who DM'd "is there a restock list" —
Maya manually replies and starts a Klaviyo list (yes, she still uses
Klaviyo for email — the two coexist fine).

Total drop revenue: $14,200 (vs. her prior 6-month-average drop:
$8,900).

## Day 30 — Steady state

By the end of month 1:
- 2 drops + 1 restock run through Launch Playbook
- Average edit-rate: 18%
- 4,200 AI replies sent
- 31 hot leads surfaced, 19 converted to Shopify orders
- Total monthly attributed revenue: ~$24,500
- Time spent on IG DMs: she estimates 4 hours instead of 30+

She's a paying customer. Trial converted. She tells two friends in the
LA streetwear Discord.

## Day 60 — First friction

She runs a Flash Sale for unsold inventory. She wants the Launch Playbook
to do hourly urgency. The current Flash Sale template defaults to every
4 hours. She emails support: "can we do hourly?" Founder replies same
day: "you can edit timing per beat — here's a 30-sec video." She does.

She approaches her 5K reply cap mid-month. Banner appears: "you're at
80%. Upgrade to Growth to keep Opus on every first reply." She upgrades
to $149 because the AI quality matters for her brand voice.

## Day 90 — The flywheel is visible

By day 90:
- Average edit-rate: 11% (the corpus knows her)
- 8 drops + 4 restocks run
- $58K attributed revenue across the quarter
- 3 of her friends signed up via her referral link (she earns 20% rev
  share on each for 3 months)
- Dashboard shows: "Brand-voice quality: top 10% of cohort"

She tells the founder in a Slack DM: "I'd pay $300 for this." Founder
doesn't raise her price. She becomes the customer-success North Star.

## Where this journey breaks (failure paths)

Documented for the team to design against:

- **Day 0 ingest fails** (Meta API timeout): wizard shows error,
  retry path, founder support reaches out same hour
- **Day 7 drop AI sounds off** to her: she taps the edit pencil, system
  captures, tone-card refreshes in 24h
- **Day 7 a hot lead is mishandled** by auto-handle: she clicks "revert"
  on that thread, system learns this intent class needs approval for her
- **Day 30 reply cap hit and she doesn't notice the banner**: soft-cap
  to Haiku, no service stop, no surprise bill
- **Day 60 her Meta account is flagged**: outbound paused globally,
  founder gets alert + 4h response from support

## What we measure on Maya

Internal-only metrics we track per tenant:
- Edit-rate trend (target: down-and-to-the-right)
- Auto-handle adoption (target: rises to 60%+ within 60 days)
- Hot-lead conversion lift (target: 2× baseline)
- Time-spent-in-app per drop (target: declining as autopilot improves)
- Drops/month (target: 2-4 sustained)
- Revenue/drop trend (vs her own pre-LaunchWings baseline)

When Maya's metrics regress, we reach out. When they accelerate, we ask
her to be on a podcast.
