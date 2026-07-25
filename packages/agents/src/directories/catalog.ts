// F2 PR1 — directory catalog.
//
// Static reference data: ~30 launch directories LaunchWings supports out of
// the box, prioritised for B2B SaaS / dev tools / AI products (the founders
// we're shipping for per VISION.md). Each entry carries:
//
//   - slug:           stable identifier used in directory_submissions.directory_slug
//   - name:           human-readable label
//   - submissionUrl:  the page a founder hits to start a submission
//   - automationKind: "api" (programmatic), "browser_form" (Browserbase in PR3),
//                     or "manual" (human paste — the agent prepares the copy
//                     and we surface it via the daily brief)
//   - category:       launch | directory | newsletter | forum | review | social
//   - instructionsMd: one-paragraph submission shape (what the directory
//                     actually wants — used by the system prompt for the
//                     blurb generator + as founder-facing tooltip)
//   - fieldSchemaJson: { fields: Array<{ key, label, type, maxLength?, required }> }
//                     The agent uses this to build payload_json. Free-text
//                     fields with maxLength get truncated hard at agent-prepare
//                     time after the LLM blurb generation.
//   - notes:          optional free-form (e.g. "invite-only — won't be public
//                     until you have karma")
//
// Why ~80% of these entries are `automation_kind: "manual"` or `"browser_form"`:
// per `docs/research/03-integrations.md`, the vast majority of launch
// directories deliberately don't expose APIs (their value is curation; an API
// would invite spam). The orchestration moat is precisely that we automate the
// human-touch step via Browserbase (PR3) or surface copy-pastable text in the
// daily brief (this PR via `needs_manual` status). Competitors do not.
//
// `automationKind: "api"` is reserved for the small set with public submission
// APIs (Product Hunt's Maker API, Dev.to's articles API, Hashnode's GraphQL).
// PR1 doesn't actually call any of them — entries just stay in `draft` until
// PR2 wires the first batch.
//
// Field max-lengths are sourced from each directory's actual constraints as
// of 2026-05-08. Update with a comment + date when a directory changes them;
// drift is preferable to silent truncation surprises.

export type DirectoryAutomationKind = "api" | "browser_form" | "manual";
export type DirectoryCategory =
  | "launch"
  | "directory"
  | "newsletter"
  | "forum"
  | "review"
  | "social";

export interface DirectoryFieldSpec {
  /** Stable key used in payload_json. Snake_case to match field labels on the directory side. */
  key: string;
  /** Human-readable label for the founder UI. */
  label: string;
  /** "text" (single-line) | "longtext" (multi-line) | "url" | "email" | "image_url" | "select" | "date". */
  type: "text" | "longtext" | "url" | "email" | "image_url" | "select" | "date";
  /** Hard maxLength enforced by the agent after LLM generation. Absent = no limit. */
  maxLength?: number;
  /** Whether the directory rejects submissions missing this field. */
  required: boolean;
  /** Optional select options when type === "select". */
  options?: ReadonlyArray<string>;
}

export interface DirectoryCatalogEntry {
  slug: string;
  name: string;
  submissionUrl: string;
  automationKind: DirectoryAutomationKind;
  category: DirectoryCategory;
  instructionsMd: string;
  fieldSchemaJson: { fields: ReadonlyArray<DirectoryFieldSpec> };
  notes?: string;
  enabled: boolean;
}

// Standard product fields surface across most directories. Define once,
// reference per-entry. Each entry can still extend with directory-specific
// fields (e.g. Product Hunt's "topics", Indie Hackers's "milestone").
const F = {
  name: (max = 60): DirectoryFieldSpec => ({
    key: "name",
    label: "Product name",
    type: "text",
    maxLength: max,
    required: true,
  }),
  tagline: (max = 60): DirectoryFieldSpec => ({
    key: "tagline",
    label: "Tagline",
    type: "text",
    maxLength: max,
    required: true,
  }),
  description: (max = 260): DirectoryFieldSpec => ({
    key: "description",
    label: "Description",
    type: "longtext",
    maxLength: max,
    required: true,
  }),
  longDescription: (max = 2000): DirectoryFieldSpec => ({
    key: "long_description",
    label: "Long description",
    type: "longtext",
    maxLength: max,
    required: false,
  }),
  url: (): DirectoryFieldSpec => ({
    key: "url",
    label: "Website URL",
    type: "url",
    required: true,
  }),
  email: (): DirectoryFieldSpec => ({
    key: "email",
    label: "Founder email",
    type: "email",
    required: true,
  }),
  screenshotUrl: (): DirectoryFieldSpec => ({
    key: "screenshot_url",
    label: "Screenshot URL",
    type: "image_url",
    required: false,
  }),
  logoUrl: (): DirectoryFieldSpec => ({
    key: "logo_url",
    label: "Logo URL",
    type: "image_url",
    required: false,
  }),
  category: (options?: ReadonlyArray<string>): DirectoryFieldSpec => ({
    key: "category",
    label: "Category",
    type: "select",
    required: false,
    ...(options ? { options } : {}),
  }),
  pricing: (options?: ReadonlyArray<string>): DirectoryFieldSpec => ({
    key: "pricing",
    label: "Pricing model",
    type: "select",
    required: false,
    ...(options ? { options } : {}),
  }),
  launchDate: (): DirectoryFieldSpec => ({
    key: "launch_date",
    label: "Launch date",
    type: "date",
    required: false,
  }),
} as const;

// ---- The catalog ---------------------------------------------------------

export const DIRECTORY_CATALOG: ReadonlyArray<DirectoryCatalogEntry> = [
  // ---- Launch platforms (pure launch) ----
  {
    slug: "product-hunt",
    name: "Product Hunt",
    submissionUrl: "https://www.producthunt.com/posts/new",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd:
      "The single biggest launch surface for B2B SaaS. Browser-form automation handles the multi-step wizard; founder approves the final post before the scheduled launch slot fires.",
    fieldSchemaJson: {
      fields: [
        F.name(40),
        F.tagline(60),
        F.description(260),
        F.url(),
        F.logoUrl(),
        F.screenshotUrl(),
        {
          key: "topics",
          label: "Topics (1-3)",
          type: "text",
          maxLength: 120,
          required: true,
        },
        F.launchDate(),
      ],
    },
    notes:
      "Tagline rendered next to the post; first 60 chars matter most. PH uses 'Maker comment' separately — generated in PR2 social-draft pipeline.",
    enabled: true,
  },
  {
    slug: "betalist",
    name: "BetaList",
    submissionUrl: "https://betalist.com/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd:
      "Curated pre-launch directory; great for early signups. Editor picks which submissions go live; turnaround ~2 weeks free or 24h paid.",
    fieldSchemaJson: {
      fields: [
        F.name(50),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.logoUrl(),
        F.email(),
      ],
    },
    enabled: true,
  },
  {
    slug: "indie-hackers",
    name: "Indie Hackers — Products",
    submissionUrl: "https://www.indiehackers.com/products/new",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd:
      "Self-serve product listing on Indie Hackers. Founder profile required; the agent prepares the listing, the founder pastes the milestone post separately.",
    fieldSchemaJson: {
      fields: [
        F.name(50),
        F.tagline(140),
        F.description(1500),
        F.url(),
        F.logoUrl(),
        F.pricing(["free", "freemium", "paid", "subscription"]),
      ],
    },
    enabled: true,
  },
  {
    slug: "tiny-startups",
    name: "Tiny Startups",
    submissionUrl: "https://tinystartups.com/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd:
      "Newsletter + directory for solo / micro startups. Submit once; appears in the next weekly digest and on the site.",
    fieldSchemaJson: {
      fields: [
        F.name(50),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.email(),
      ],
    },
    enabled: true,
  },
  {
    slug: "microlaunch",
    name: "Microlaunch",
    submissionUrl: "https://microlaunch.net/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Daily product launch board for indie makers. Plain form.",
    fieldSchemaJson: {
      fields: [
        F.name(50),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.logoUrl(),
        F.category(),
      ],
    },
    enabled: true,
  },
  {
    slug: "peerlist",
    name: "Peerlist Launchpad",
    submissionUrl: "https://peerlist.io/launchpad",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd:
      "Weekly launchpad on Peerlist; tech-leaning audience. Need a Peerlist account to submit; product card + screenshots.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(800),
        F.url(),
        F.logoUrl(),
        F.screenshotUrl(),
      ],
    },
    enabled: true,
  },
  {
    slug: "uneed",
    name: "Uneed",
    submissionUrl: "https://www.uneed.best/submit-a-tool",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Daily-tools launch board. Free + paid tiers; paid skips the queue.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.logoUrl(),
        F.category(),
        F.pricing(["free", "freemium", "paid"]),
      ],
    },
    enabled: true,
  },
  {
    slug: "fazier",
    name: "Fazier",
    submissionUrl: "https://fazier.com/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Product Hunt alternative; dev-tool friendly.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.logoUrl(),
        F.screenshotUrl(),
      ],
    },
    enabled: true,
  },
  {
    slug: "launching-next",
    name: "LaunchingNext",
    submissionUrl: "https://www.launchingnext.com/submit/",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Submit upcoming startups; long-tail SEO traffic.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(800),
        F.url(),
        F.email(),
        F.category(),
      ],
    },
    enabled: true,
  },
  {
    slug: "launch-news",
    name: "Launch.news",
    submissionUrl: "https://launch.news/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Aggregator for product launches; light editorial review.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.logoUrl(),
      ],
    },
    enabled: true,
  },
  {
    slug: "startups-fyi",
    name: "Startups.fyi",
    submissionUrl: "https://www.startups.fyi/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Indie startup directory; weekly highlights newsletter.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.email(),
        F.category(),
      ],
    },
    enabled: true,
  },
  {
    slug: "betafy",
    name: "Betafy",
    submissionUrl: "https://betafy.co/submit",
    automationKind: "browser_form",
    category: "launch",
    instructionsMd: "Beta directory; useful for pre-launch waitlist boost.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(140),
        F.description(500),
        F.url(),
        F.email(),
      ],
    },
    enabled: true,
  },

  // ---- Reviews / comparison directories ----
  {
    slug: "alternativeto",
    name: "AlternativeTo",
    submissionUrl: "https://alternativeto.net/contribute/",
    automationKind: "browser_form",
    category: "review",
    instructionsMd:
      "Add your product as an alternative to existing tools. The agent suggests 1-3 likely incumbents based on category.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.description(800),
        F.url(),
        F.logoUrl(),
        F.category(),
        {
          key: "alternative_to",
          label: "Alternative to (existing tool slugs)",
          type: "text",
          maxLength: 200,
          required: true,
        },
      ],
    },
    enabled: true,
  },
  {
    slug: "saashub",
    name: "SaaSHub",
    submissionUrl: "https://www.saashub.com/submit-product",
    automationKind: "browser_form",
    category: "review",
    instructionsMd: "SaaS directory; comparison-heavy traffic. Free listing, paid for placement.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.tagline(160),
        F.description(1500),
        F.url(),
        F.logoUrl(),
        F.category(),
        F.pricing(),
      ],
    },
    enabled: true,
  },
  {
    slug: "g2",
    name: "G2",
    submissionUrl: "https://sell.g2.com/list-your-product",
    automationKind: "browser_form",
    category: "review",
    instructionsMd:
      "B2B review directory; the heaviest review-driven traffic for enterprise SaaS. Free listing requires verification email.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.tagline(160),
        F.description(2000),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
        F.pricing(),
      ],
    },
    notes: "G2 verification can take 1-2 weeks. Submit early.",
    enabled: true,
  },
  {
    slug: "capterra",
    name: "Capterra",
    submissionUrl: "https://www.capterra.com/vendors/sign-up",
    automationKind: "browser_form",
    category: "review",
    instructionsMd:
      "Gartner-owned B2B software review directory. Free listing; pay-per-click advertising tier.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.tagline(160),
        F.description(2000),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
      ],
    },
    enabled: true,
  },
  {
    slug: "getapp",
    name: "GetApp",
    submissionUrl: "https://www.getapp.com/p/sem/become-a-vendor/",
    automationKind: "browser_form",
    category: "review",
    instructionsMd: "Capterra-network B2B review directory. Listing flows through the same vendor portal.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.tagline(160),
        F.description(2000),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
      ],
    },
    enabled: true,
  },
  {
    slug: "producthuntspy",
    name: "ProductHuntSpy",
    submissionUrl: "https://producthuntspy.com/submit",
    automationKind: "browser_form",
    category: "review",
    instructionsMd: "Tracker / leaderboard for Product Hunt launches; surfaces upcoming launches.",
    fieldSchemaJson: {
      fields: [F.name(60), F.tagline(160), F.description(500), F.url()],
    },
    enabled: true,
  },

  // ---- Forums / communities (manual posting) ----
  {
    slug: "hacker-news",
    name: "Hacker News (Show HN)",
    submissionUrl: "https://news.ycombinator.com/submit",
    automationKind: "manual",
    category: "forum",
    instructionsMd:
      "A Show HN post — title format `Show HN: <product> – <one-line description>`. The agent prepares title + first comment. Founder must post (HN rate-limits new accounts and detects automation).",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "HN title",
          type: "text",
          maxLength: 80,
          required: true,
        },
        F.url(),
        {
          key: "first_comment",
          label: "First comment (founder context)",
          type: "longtext",
          maxLength: 1500,
          required: true,
        },
      ],
    },
    notes: "Don't auto-post. HN bans accounts that submit programmatically.",
    enabled: true,
  },
  {
    slug: "lobsters",
    name: "Lobsters",
    submissionUrl: "https://lobste.rs/stories/new",
    automationKind: "manual",
    category: "forum",
    instructionsMd:
      "Invite-only tech community. The agent prepares a story title + body; founder must have an existing account to post.",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Story title",
          type: "text",
          maxLength: 100,
          required: true,
        },
        F.url(),
        {
          key: "body",
          label: "Story body / context",
          type: "longtext",
          maxLength: 1500,
          required: false,
        },
        {
          key: "tags",
          label: "Tags",
          type: "text",
          maxLength: 100,
          required: true,
        },
      ],
    },
    notes: "Invite-only. Won't apply to most founders without an existing account.",
    enabled: true,
  },
  {
    slug: "reddit-saas",
    name: "Reddit — r/SaaS",
    submissionUrl: "https://www.reddit.com/r/SaaS/submit",
    automationKind: "manual",
    category: "forum",
    instructionsMd:
      "B2B SaaS subreddit. The agent prepares a Show-Reddit-style title + body. Founder must post manually (Reddit's API submission requires earned karma + flair compliance).",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Reddit title",
          type: "text",
          maxLength: 300,
          required: true,
        },
        {
          key: "body",
          label: "Reddit body",
          type: "longtext",
          maxLength: 10_000,
          required: true,
        },
        {
          key: "flair",
          label: "Flair",
          type: "text",
          maxLength: 30,
          required: false,
        },
      ],
    },
    enabled: true,
  },
  {
    slug: "reddit-sideproject",
    name: "Reddit — r/SideProject",
    submissionUrl: "https://www.reddit.com/r/SideProject/submit",
    automationKind: "manual",
    category: "forum",
    instructionsMd:
      "Side-project subreddit. Less strict than r/SaaS but the same posting rules — founder posts manually.",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Reddit title",
          type: "text",
          maxLength: 300,
          required: true,
        },
        {
          key: "body",
          label: "Reddit body",
          type: "longtext",
          maxLength: 10_000,
          required: true,
        },
      ],
    },
    enabled: true,
  },
  {
    slug: "reddit-startups",
    name: "Reddit — r/startups",
    submissionUrl: "https://www.reddit.com/r/startups/submit",
    automationKind: "manual",
    category: "forum",
    instructionsMd:
      "Larger startups subreddit. Heavier mods; submit ONLY in 'Share Your Startup' threads or with strict flair.",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Reddit title",
          type: "text",
          maxLength: 300,
          required: true,
        },
        {
          key: "body",
          label: "Reddit body",
          type: "longtext",
          maxLength: 10_000,
          required: true,
        },
        {
          key: "flair",
          label: "Flair (required by mods)",
          type: "text",
          maxLength: 30,
          required: true,
        },
      ],
    },
    notes: "Heavily moderated; mod approval can take 24h.",
    enabled: true,
  },
  {
    slug: "reddit-indiehackers",
    name: "Reddit — r/IndieHackers",
    submissionUrl: "https://www.reddit.com/r/IndieHackers/submit",
    automationKind: "manual",
    category: "forum",
    instructionsMd: "Indie-hackers community subreddit. Friendly to launch posts.",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Reddit title",
          type: "text",
          maxLength: 300,
          required: true,
        },
        {
          key: "body",
          label: "Reddit body",
          type: "longtext",
          maxLength: 10_000,
          required: true,
        },
      ],
    },
    enabled: true,
  },

  // ---- Blog cross-posts (manual; we draft, founder posts) ----
  {
    slug: "dev-to",
    name: "DEV.to",
    submissionUrl: "https://dev.to/new",
    automationKind: "manual",
    category: "social",
    instructionsMd:
      "Cross-post a launch story. The agent prepares a markdown article with frontmatter; founder pastes into the editor (DEV.to API works but the editor UX matters for cover image upload).",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Article title",
          type: "text",
          maxLength: 128,
          required: true,
        },
        {
          key: "body_markdown",
          label: "Article body (markdown)",
          type: "longtext",
          maxLength: 50_000,
          required: true,
        },
        {
          key: "tags",
          label: "Tags (max 4)",
          type: "text",
          maxLength: 100,
          required: false,
        },
        {
          key: "cover_image_url",
          label: "Cover image URL",
          type: "image_url",
          required: false,
        },
      ],
    },
    enabled: true,
  },
  {
    slug: "hashnode",
    name: "Hashnode",
    submissionUrl: "https://hashnode.com/draft",
    automationKind: "manual",
    category: "social",
    instructionsMd:
      "Tech-blog platform. Same launch-story article as DEV.to; the agent reuses the markdown body verbatim.",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Article title",
          type: "text",
          maxLength: 128,
          required: true,
        },
        {
          key: "body_markdown",
          label: "Article body (markdown)",
          type: "longtext",
          maxLength: 50_000,
          required: true,
        },
        {
          key: "tags",
          label: "Tags",
          type: "text",
          maxLength: 100,
          required: false,
        },
        {
          key: "cover_image_url",
          label: "Cover image URL",
          type: "image_url",
          required: false,
        },
      ],
    },
    enabled: true,
  },
  {
    slug: "medium",
    name: "Medium",
    submissionUrl: "https://medium.com/new-story",
    automationKind: "manual",
    category: "social",
    instructionsMd:
      "Long-form launch story. The agent prepares title + subtitle + body; founder pastes into Medium's editor (clipboard import preserves formatting).",
    fieldSchemaJson: {
      fields: [
        {
          key: "title",
          label: "Story title",
          type: "text",
          maxLength: 100,
          required: true,
        },
        {
          key: "subtitle",
          label: "Subtitle",
          type: "text",
          maxLength: 140,
          required: false,
        },
        {
          key: "body_markdown",
          label: "Story body (markdown)",
          type: "longtext",
          maxLength: 50_000,
          required: true,
        },
        {
          key: "tags",
          label: "Tags (max 5)",
          type: "text",
          maxLength: 100,
          required: false,
        },
      ],
    },
    enabled: true,
  },

  // ---- Index-style directories (lighter forms) ----
  {
    slug: "ai-tools-directory",
    name: "There's An AI For That",
    submissionUrl: "https://theresanaiforthat.com/submit/",
    automationKind: "browser_form",
    category: "directory",
    instructionsMd:
      "AI-product directory; high SEO traffic for 'best AI for X' searches. Free listing requires email verification.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(160),
        F.description(800),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
        F.pricing(),
      ],
    },
    enabled: true,
  },
  {
    slug: "futurepedia",
    name: "Futurepedia",
    submissionUrl: "https://www.futurepedia.io/submit-tool",
    automationKind: "browser_form",
    category: "directory",
    instructionsMd: "AI-tools directory. Editorial review before listing goes live.",
    fieldSchemaJson: {
      fields: [
        F.name(60),
        F.tagline(160),
        F.description(800),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
        F.pricing(),
      ],
    },
    enabled: true,
  },
  {
    slug: "saasworthy",
    name: "SaaSworthy",
    submissionUrl: "https://www.saasworthy.com/list-your-product",
    automationKind: "browser_form",
    category: "review",
    instructionsMd: "B2B SaaS directory + scoring. Free listing tier; verification email required.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        F.tagline(160),
        F.description(2000),
        F.url(),
        F.logoUrl(),
        F.email(),
        F.category(),
      ],
    },
    enabled: true,
  },

  // ---- Newsletters (manual pitch) ----
  {
    slug: "mind-the-product",
    name: "Mind the Product Newsletter",
    submissionUrl: "https://www.mindtheproduct.com/contact/",
    automationKind: "manual",
    category: "newsletter",
    instructionsMd:
      "Pitch the product to the Mind the Product editorial team. The agent prepares a one-paragraph pitch + product context block. Founder sends via the contact form; not API-accessible.",
    fieldSchemaJson: {
      fields: [
        F.name(80),
        {
          key: "pitch",
          label: "Editorial pitch",
          type: "longtext",
          maxLength: 1500,
          required: true,
        },
        F.url(),
        F.email(),
      ],
    },
    enabled: true,
  },
] as const;

// ---- Lookup helpers -------------------------------------------------------

const BY_SLUG = new Map(DIRECTORY_CATALOG.map((d) => [d.slug, d]));

export function getDirectoryBySlug(slug: string): DirectoryCatalogEntry | undefined {
  return BY_SLUG.get(slug);
}

export function listDirectorySlugs(): string[] {
  return DIRECTORY_CATALOG.map((d) => d.slug);
}

export function listEnabledDirectories(): DirectoryCatalogEntry[] {
  return DIRECTORY_CATALOG.filter((d) => d.enabled);
}
