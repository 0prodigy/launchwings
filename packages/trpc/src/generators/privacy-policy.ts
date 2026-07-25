// LRC-04 — Privacy Policy generator (deterministic, Termly-style template).
//
// Pure function. No LLM, no network. Inputs are validated by the caller's
// zod schema; this module just renders markdown. Jurisdiction-specific
// callouts are appended (CCPA for US, GDPR for EU/UK, generic for "Other").

export type Jurisdiction = "US" | "EU" | "UK" | "Other";

export interface PrivacyPolicyInputs {
  orgName: string;
  contactEmail: string;
  jurisdiction: Jurisdiction;
  productName: string;
  productUrl: string | null;
}

export interface PrivacyPolicyArtifact {
  markdown: string;
}

function jurisdictionRights(j: Jurisdiction): string {
  switch (j) {
    case "US":
      return [
        "If you are a California resident, the California Consumer Privacy Act (CCPA) gives you the right to:",
        "",
        "- Know what personal information we collect about you and how we use it.",
        "- Request deletion of your personal information.",
        "- Opt out of the sale or sharing of your personal information (we do not sell or share personal information for cross-context behavioral advertising).",
        "- Be free from discrimination for exercising any of these rights.",
        "",
        "To exercise these rights, contact us at the address below.",
      ].join("\n");
    case "EU":
    case "UK":
      return [
        `If you are in the European Economic Area or the United Kingdom, the General Data Protection Regulation (GDPR${j === "UK" ? " / UK GDPR" : ""}) gives you the right to:`,
        "",
        "- Access the personal data we hold about you.",
        "- Request rectification of inaccurate data.",
        "- Request erasure of your personal data.",
        "- Restrict or object to processing of your personal data.",
        "- Data portability — receive your data in a structured, machine-readable format.",
        "- Lodge a complaint with your local supervisory authority.",
        "",
        "Our lawful bases for processing are: (a) consent, (b) performance of a contract, and (c) our legitimate interests in operating and improving the service.",
      ].join("\n");
    case "Other":
    default:
      return [
        "Depending on your jurisdiction, you may have the right to access, correct, delete, or port your personal information, and to object to or restrict certain processing. To exercise any of these rights, contact us at the address below.",
      ].join("\n");
  }
}

export function renderPrivacyPolicy(
  inputs: PrivacyPolicyInputs,
): PrivacyPolicyArtifact {
  const today = new Date().toISOString().slice(0, 10);
  const productLine = inputs.productUrl
    ? `${inputs.productName} (${inputs.productUrl})`
    : inputs.productName;

  const md = [
    `# Privacy Policy`,
    ``,
    `_Last updated: ${today}_`,
    ``,
    `${inputs.orgName} ("we", "us", "our") operates ${productLine} (the "Service"). This Privacy Policy explains what information we collect, how we use it, and the rights you have over it.`,
    ``,
    `## Information We Collect`,
    ``,
    `We collect the following categories of information:`,
    ``,
    `- **Account information** you provide when signing up (e.g. name, email address, organization).`,
    `- **Usage data** about how you interact with the Service (pages visited, features used, timestamps, approximate location derived from IP address).`,
    `- **Device and log data** automatically collected by your browser (browser type, operating system, referring URL, IP address).`,
    `- **Communications** you send to us (support requests, feedback, survey responses).`,
    ``,
    `## How We Use It`,
    ``,
    `We use the information above to:`,
    ``,
    `- Provide, operate, and maintain the Service.`,
    `- Authenticate you and secure your account.`,
    `- Communicate with you about the Service, including transactional emails and product updates you have opted into.`,
    `- Analyze usage in aggregate to improve features and reliability.`,
    `- Comply with legal obligations and enforce our Terms of Service.`,
    ``,
    `## Sharing`,
    ``,
    `We do not sell your personal information. We share information only with:`,
    ``,
    `- **Service providers** who process data on our behalf under written agreements (e.g. hosting, analytics, email delivery).`,
    `- **Legal authorities** when required by law, subpoena, or to protect our rights and the safety of our users.`,
    `- **Successors in interest** in the event of a merger, acquisition, or asset sale, subject to standard confidentiality protections.`,
    ``,
    `## Cookies`,
    ``,
    `The Service uses cookies and similar technologies to keep you signed in, remember preferences, and measure aggregate usage. You can disable cookies in your browser settings; some Service features may not work without them.`,
    ``,
    `## Your Rights`,
    ``,
    jurisdictionRights(inputs.jurisdiction),
    ``,
    `## Data Retention`,
    ``,
    `We retain personal information for as long as your account is active or as needed to provide the Service. We delete or anonymize personal information when it is no longer required, except where longer retention is required by law.`,
    ``,
    `## Security`,
    ``,
    `We use industry-standard administrative, technical, and physical safeguards to protect your information. No method of transmission or storage is 100% secure; we cannot guarantee absolute security.`,
    ``,
    `## Children`,
    ``,
    `The Service is not directed to children under 13 (or 16 in the EEA / UK). We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us and we will delete it.`,
    ``,
    `## Changes to This Policy`,
    ``,
    `We may update this Privacy Policy from time to time. Material changes will be posted on this page with a new "Last updated" date.`,
    ``,
    `## Contact`,
    ``,
    `Questions or requests about this Privacy Policy? Contact us at **${inputs.contactEmail}**.`,
    ``,
  ].join("\n");

  return { markdown: md };
}
