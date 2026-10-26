export const privacyProfile = {
  operator: "Bolaji BALOGOUN",
  location: "Arkansas 72223, United States",
  email: "bolajibalogoun@gmail.com",
  website: "https://kazi.iyanju.com",
  preparedOn: "2026-10-25",
  minimumAge: 18,
  status: "draft",
} as const;

export type PrivacyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "definitions"; items: { term: string; text: string }[] }
  | { kind: "links"; items: { label: string; href: string }[] };
export interface PrivacySection {
  id: string;
  title: string;
  blocks: PrivacyBlock[];
}
const paragraph = (text: string): PrivacyBlock => ({ kind: "paragraph", text });
const list = (...items: string[]): PrivacyBlock => ({ kind: "list", items });
const definitions = (
  items: { term: string; text: string }[],
): PrivacyBlock => ({ kind: "definitions", items });
const links = (items: { label: string; href: string }[]): PrivacyBlock => ({
  kind: "links",
  items,
});

export const privacySections: PrivacySection[] = [
  {
    id: "operator",
    title: "Who is responsible for your information",
    blocks: [
      paragraph(
        "Kazi is operated by Bolaji BALOGOUN, an individual based in Arkansas 72223, United States. In this policy, “Kazi,” “we,” “us,” and “our” refer to that operator. Privacy questions and requests can be sent to bolajibalogoun@gmail.com.",
      ),
      paragraph(
        "This policy covers the Kazi website, application, installed web app, calendar features, and API and Model Context Protocol (MCP) connections. It covers users, invited people, and people whose information is included in workspaces or support communications.",
      ),
      paragraph(
        "We determine how account administration, service security, support, and our own service operations use personal information. When an organization uses Kazi to manage its workspace content, that organization may be the controller or business responsible for that content, and Kazi may act as its processor or service provider. The applicable agreement and instructions govern those roles. Contact the organization for requests about its own use of your work records; we will help direct requests to the appropriate party.",
      ),
      paragraph(
        "This policy explains data practices. It does not replace a separate consent request where consent is legally required.",
      ),
    ],
  },
  {
    id: "information",
    title: "Information we collect and where it comes from",
    blocks: [
      definitions([
        {
          term: "Account and contact information",
          text: "Names, email addresses, usernames, account identifiers, profile images where supplied by your sign-in provider, team membership, and roles. You, your identity provider, or a person inviting you may supply this information. Our authentication provider handles sign-in credentials and session verification.",
        },
        {
          term: "Workspace content",
          text: "Projects, tasks, descriptions, comments, mentions, collaborators, files, filenames and file metadata, links, tags, priorities, dependencies, milestones, sprint objectives, assessments, and other content you or authorized teammates provide.",
        },
        {
          term: "Planning and activity records",
          text: "Time zone, working hours, capacity and notification preferences; estimates, deadlines, proposed and accepted plans, scheduled sessions, approvals, workflow changes, notifications, and timestamped activity. These records are provided by users or generated when they use the service.",
        },
        {
          term: "Connected-service information",
          text: "Calendar names and identifiers, selected availability sources, busy intervals, connection status and consent credentials; calendar-link settings; and agent credential labels, scopes, expiry, client names and versions, tool names, last-use times, call counts, and success or error outcomes.",
        },
        {
          term: "Technical and security information",
          text: "Requests to the service and its infrastructure may generate IP addresses, browser and device details, request times, URLs, error and diagnostic records, authentication events, and security or rate-limit records. Hosting and authentication providers may process these records to deliver and protect the service.",
        },
        {
          term: "Support communications",
          text: "Messages you send us, your contact details, relevant account information, and attachments or diagnostic details you choose to provide. Messages to our published email address are processed through the email service used for that address.",
        },
      ]),
      paragraph(
        "Some information is necessary to create an account, authenticate access, or provide a feature you request. Without it, the relevant service or feature may not work. Calendar connections and third-party agents are optional. We do not require sensitive personal information such as health records, government identification numbers, financial account details, or precise location to provide ordinary work management. Avoid including unnecessary sensitive information in content or support messages.",
      ),
    ],
  },
  {
    id: "shared-account",
    title: "Shared iYANJU sign-in and separate Kazi data",
    blocks: [
      paragraph(
        "Kazi is adopting shared iYANJU sign-in through Clerk. Where shared sign-in is enabled, the same iYANJU identity can sign in to participating apps. Profile and security changes made in My account apply to that shared identity. Kazi's projects, tasks, team permissions, files, and other application records remain subject to Kazi's own storage and access rules; sharing a sign-in does not by itself merge or expose those records to another app.",
      ),
      paragraph(
        "To keep an existing Kazi account, the linking flow verifies sign-in to both the previous Kazi account and the iYANJU account before you confirm the link. Kazi stores an alias mapping between the provider account identifiers and the existing Kazi account identifier, together with linking timestamps. Matching email addresses alone do not link accounts. This mapping lets the shared sign-in continue using existing work and permissions.",
      ),
      paragraph(
        "When shared identity is enabled, Kazi keeps one first-authorized-service-use record for each Kazi account in each service environment. The record identifies the account and service and distinguishes a known first authorized use date from the first date observed by that record. Later sign-ins do not overwrite the first-use date. Unknown historical first-use dates and account creation dates remain unknown; a later observation is not presented as an original creation or first-use date. These limited records support account administration and adoption measures without copying private workspace content into an analytics system.",
      ),
    ],
  },
  {
    id: "purposes",
    title: "How we use information and our legal grounds",
    blocks: [
      definitions([
        {
          term: "Provide the service",
          text: "Create and administer accounts and workspaces; store and display content; manage access, collaboration, planning, notifications, files, and exports; and operate requested integrations. Where applicable, our legal ground is performance of a contract with you or our legitimate interest in delivering services to an organizational customer.",
        },
        {
          term: "Protect and maintain Kazi",
          text: "Authenticate users, prevent abuse and unauthorized access, investigate errors, maintain reliability, and enforce appropriate access. Where applicable, we rely on legitimate interests in securing and maintaining the service, subject to balancing those interests against your rights.",
        },
        {
          term: "Understand adoption and improve features",
          text: "Analyze limited account and operational metadata and aggregate feature-use measures as described in the adoption section. Where applicable, we rely on legitimate interests in understanding and improving the service, or consent when the collection method or applicable law requires it.",
        },
        {
          term: "Communicate and respond",
          text: "Deliver invitations and service notices, answer support and privacy requests, and communicate important security or policy changes. Where applicable, we rely on contract performance, legitimate interests in supporting users, or a legal obligation.",
        },
        {
          term: "Comply with law and protect rights",
          text: "Meet applicable legal duties, respond to valid legal process, and establish, exercise, or defend legal claims. We rely on the relevant legal obligation or legitimate interest where applicable.",
        },
        {
          term: "Optional consent-based processing",
          text: "Obtain authorization for an external account connection and request separate consent for any processing that legally requires it. You can withdraw consent without affecting the lawfulness of earlier processing. An integration permission does not authorize unrelated uses of its data.",
        },
      ]),
      paragraph(
        "For organization-controlled workspace content, we process information according to the organization's lawful instructions and applicable agreement. That organization is responsible for identifying its own legal grounds and informing its users about its purposes.",
      ),
    ],
  },
  {
    id: "adoption",
    title: "Adoption analysis and product improvement",
    blocks: [
      paragraph(
        "Our interest in usage information is to understand whether Kazi is useful: for example, how many accounts or workspaces are active, which features are used, whether plans are accepted, and how often integrations succeed or fail. Existing account, workflow, and operational records can support these measures. We limit analysis to metadata needed for these purposes and use aggregate results where practical.",
      ),
      paragraph(
        "Task descriptions, comment text, uploaded file contents, calendar event contents, and support message contents are not needed for adoption counts. We do not use those contents for product-adoption analytics. Identifiers used to calculate usage counts remain personal information until they are removed or the information is effectively anonymized; a hashed or pseudonymous identifier is not automatically anonymous.",
      ),
      paragraph(
        "Kazi currently has no separate product-analytics tool or optional analytics cookies enabled in the application. Infrastructure providers may still process operational logs. Before adding dedicated analytics collection, we will disclose the event categories, provider, purposes, retention, and available choices, and obtain consent where required. You can contact us to object to applicable legitimate-interest processing or exercise an available opt-out right.",
      ),
    ],
  },
  {
    id: "workspace",
    title: "Who can see information in a workspace",
    blocks: [
      paragraph(
        "Content is visible to users who have access through workspace membership, project permissions, assignment, or collaboration settings. Team owners and managers have administration rights within their teams; private projects have additional access rules. An organization's administrators may use workflow history and reports for that organization's purposes. Information placed in a shared team is subject to that team's access rules.",
      ),
      paragraph(
        "Personal workspaces have separate access controls. A team role does not by itself provide access to another person's personal workspace. Authorized teammates may see names, email addresses or usernames used for collaboration, assigned work, comments, status changes, and reports within their permissions.",
      ),
      paragraph(
        "Removing access does not erase content already exported, downloaded, copied, or sent to another recipient. Leaving a team, archiving work, removing a member, and deleting personal information are different actions. Historical collaboration records can remain subject to the retention and rights provisions below.",
      ),
    ],
  },
  {
    id: "calendar",
    title: "Calendars and Google user data",
    blocks: [
      paragraph(
        "You can use Kazi's own agenda without connecting an external calendar. If you connect Google availability, Kazi requests calendar-list and free/busy permissions. These allow selection of calendar names and identifiers and use of busy intervals to avoid scheduling conflicts. The current availability authorization does not request permission to read event descriptions or attendees or to create events in Google Calendar.",
      ),
      paragraph(
        "We store the selected source identifiers, connection status, busy intervals needed for planning, and an encrypted refresh credential that allows authorized background availability checks. Calendar-list results include calendar names and access information. Optional free/busy sharing makes busy intervals available to authorized team planning; it does not make your outside event details public.",
      ),
      paragraph(
        "Some existing direct-sync connections may also reconcile Kazi-created sessions with an authorized destination calendar. That process can handle Kazi task titles, session times, event identifiers, and sync status. It is separate from the current availability-only permission request and depends on the permissions previously granted.",
      ),
      paragraph(
        "Private calendar subscription links and downloaded calendar files can contain task titles, dates, scheduled times, and links to work. Anyone who obtains a valid subscription URL may be able to read the feed. Share it only with a calendar service or person you trust. Revoking a link stops future authorized fetches; copies already downloaded by another calendar may remain there.",
      ),
      paragraph(
        "Disconnect Google in Connections → Calendar availability, or revoke Kazi through your Google account. Kazi's disconnect flow revokes the Google credential and removes its stored connection secret and calendar selections. This does not delete Kazi tasks, accepted plan history, or copies previously exported to other calendars. Requests to erase retained personal data can be sent to the privacy contact.",
      ),
      paragraph(
        "Kazi's use and transfer of information received from Google APIs is subject to the Google API Services User Data Policy, including its Limited Use requirements. Google data is used for the user-facing calendar and planning features you authorize, not advertising, data brokerage, or training general-purpose AI models. Human access is limited to situations permitted by those requirements, such as your affirmative authorization for support, necessary security investigations, or legal requirements.",
      ),
      links([
        {
          label: "Manage Google account connections",
          href: "https://myaccount.google.com/connections",
        },
        {
          label: "Google API Services User Data Policy",
          href: "https://developers.google.com/terms/api-services-user-data-policy",
        },
      ]),
    ],
  },
  {
    id: "agents",
    title: "AI, connected agents, and automated planning",
    blocks: [
      paragraph(
        "Kazi's planning and reporting features use work records, preferences, deadlines, and availability to produce plans, notifications, and workflow measures. Scheduled time and estimates describe plans, not measured hours worked. Reports do not require keystroke logging, screen recording, microphone access, or location tracking.",
      ),
      paragraph(
        "An MCP connection lets a third-party application or AI agent act with the credential scopes and resource permissions you grant. An authorized agent may retrieve workspace information, create or edit work, add comments, or propose or approve plans if you grant those capabilities. Data returned to that client is processed under that client's own terms and privacy practices. Check its retention and model-training settings before connecting it.",
      ),
      paragraph(
        "Kazi does not use private workspace content or Google user data to train general-purpose AI models. A connection to an AI service does not authorize that service to disregard Google data-use restrictions or other applicable obligations. We do not control a third party's independent processing after an authorized disclosure.",
      ),
      paragraph(
        "Credentials are scoped, expire, and can be revoked in Connections → MCP & agents. Revocation prevents future authorized use; it cannot retrieve copies already received by a client. Agent activity records include credential labels, client metadata, tool names, timestamps, counts, and outcomes, rather than a separate analytics copy of every tool response.",
      ),
      paragraph(
        "Plans and reports support user decisions. Kazi does not itself use these features to decide legal eligibility, employment, lending, or similarly significant matters solely by automated means. Organizations remain responsible for their own decisions and any workplace notices or assessments required by law. Review settings and authorized agent actions determine when plans require your approval.",
      ),
    ],
  },
  {
    id: "sharing",
    title: "Service providers and other disclosures",
    blocks: [
      definitions([
        {
          term: "Authentication: Clerk",
          text: "Processes identity, authentication, account profile, session, and related security information to provide sign-in and account management.",
        },
        {
          term: "Application data and files: Convex",
          text: "Processes workspace records, uploaded files, background jobs, access credentials, and related operational data needed for the backend service.",
        },
        {
          term: "Hosting and request delivery: Vercel",
          text: "Delivers the website and routes service requests, including agent traffic, and processes infrastructure and diagnostic information associated with those requests.",
        },
        {
          term: "Optional invitations: Resend",
          text: "Where invitation email delivery is enabled, processes recipient email addresses, invitation content and links, sender information, and delivery metadata.",
        },
        {
          term: "Google and your chosen applications",
          text: "Google processes optional calendar connections and messages sent to our Gmail contact address. Calendar subscription services, agent clients, identity services, and other applications you choose receive data necessary for the interactions you authorize.",
        },
      ]),
      paragraph(
        "Providers receive information relevant to their service and are subject to their applicable agreements and legal obligations. Their own notices explain their independent processing. The organization controlling a workspace can also have its own providers and disclosure obligations.",
      ),
      paragraph(
        "We may disclose information when reasonably necessary to comply with valid legal process, protect people or the service, investigate fraud or security incidents, or establish or defend legal rights. Where legally permitted and appropriate, we will give notice of a demand affecting your information.",
      ),
      paragraph(
        "If Kazi is involved in a business transfer, relevant information may be reviewed or transferred under appropriate confidentiality protections and applicable law. A transaction does not remove applicable privacy restrictions; material changes will be addressed through the notice and consent requirements that apply.",
      ),
      paragraph(
        "We do not sell personal information, disclose it to data brokers, or share it for cross-context behavioral advertising. We do not use workspace content to target advertising.",
      ),
      links([
        {
          label: "Clerk privacy information",
          href: "https://clerk.com/legal/privacy",
        },
        {
          label: "Convex privacy information",
          href: "https://www.convex.dev/legal/privacy",
        },
        {
          label: "Vercel privacy notice",
          href: "https://vercel.com/legal/privacy-notice",
        },
        {
          label: "Resend privacy policy",
          href: "https://resend.com/legal/privacy-policy",
        },
        {
          label: "Google privacy policy",
          href: "https://policies.google.com/privacy",
        },
      ]),
    ],
  },
  {
    id: "storage",
    title: "Cookies, browser storage, and tracking choices",
    blocks: [
      paragraph(
        "Authentication providers use cookies or comparable technologies for sessions, account security, and sign-in. Kazi uses browser storage for functional preferences such as the selected team, and uses a service worker to cache static application files, fonts, and icons. Kazi does not intentionally persist private live workspace responses in an application offline disk cache. Your browser can temporarily hold loaded information in memory or manage its own caches.",
      ),
      paragraph(
        "During shared-account sign-in and linking, per-tab session storage keeps a return path, a provider selection, and an expiring one-use linking proof. The proof is not placed in sign-in URLs. Kazi clears it when the link flow finishes, when its sign-out controls are used, or when an expired request is checked. The nonsecret provider selection remains through sign-out so that another sign-in directory's session is not silently opened. This storage supports the requested sign-in flow rather than advertising or product analytics.",
      ),
      paragraph(
        "The separate synthetic demo stores its work records locally and can store demo uploads in browser storage. Content you enter into the demo can remain on that device until reset or cleared. Avoid entering real confidential information into a demonstration workspace.",
      ),
      paragraph(
        "You can clear site data or change cookie permissions in your browser. Doing so can remove preferences, sign you out, or prevent features from working. Required session and security technologies differ from optional analytics or advertising technologies; any optional collection that requires consent will be presented separately before it is enabled.",
      ),
      paragraph(
        "Kazi does not currently carry out sale, advertising sharing, or targeted-advertising processing for a Global Privacy Control signal to opt out of. We do not separately change service operation in response to the older Do Not Track browser setting. If our practices change, we will provide legally required choices and recognize applicable opt-out preference signals.",
      ),
    ],
  },
  {
    id: "retention",
    title: "Retention, account closure, and deletion",
    blocks: [
      paragraph(
        "We retain personal information for the time reasonably necessary for its stated purpose, taking into account account and workspace use, the controlling organization's instructions, security needs, legal duties, and the establishment or defense of claims. We do not treat a desire for future unspecified use as a reason to keep data indefinitely.",
      ),
      definitions([
        {
          term: "Accounts and workspace records",
          text: "Generally retained while the account or workspace uses the service, and then only as necessary for an applicable deletion process, lawful organizational instructions, limited security needs, or legal obligations. Shared work, comments, accepted plans, and audit records may require a different treatment from your sign-in profile.",
        },
        {
          term: "Connected accounts and access credentials",
          text: "Connection secrets are retained while needed for the connection and removed through disconnection. Agent tokens stop authorizing access when revoked or expired; their associated labels and security history may remain for legitimate operational purposes. Token or subscription expiry is an access limit, not a promise that all associated records are erased on that date.",
        },
        {
          term: "Support, security records, and provider logs",
          text: "Retained as necessary to resolve the issue, investigate abuse, maintain service reliability, or satisfy legal requirements. Applicable provider and backup schedules can affect removal from logs and backup systems.",
        },
        {
          term: "Adoption measures",
          text: "Underlying operational records follow their own service purpose and retention rules. Aggregate statistics may be kept where they no longer identify individuals. A dedicated future analytics pipeline will have its own disclosed retention period before collection begins.",
        },
      ]),
      paragraph(
        "To request closure or deletion, email the privacy contact from an address associated with your account, or explain your relationship to the information. We may verify your identity and clarify the scope. You do not need an account to ask about information such as an invitation addressed to you.",
      ),
      paragraph(
        "Deleting a sign-in profile does not automatically establish that every Kazi backend record or shared contribution has been erased. Archiving work, removing a member, or disconnecting an integration also does not erase all associated history. We will evaluate a verified request, explain any applicable limits, and coordinate with an organization's controller where appropriate.",
      ),
      paragraph(
        "Where you use a shared iYANJU account, deleting that Clerk identity can affect sign-in to other participating apps. Deleting the shared sign-in and handling Kazi application data are separate operations. Include the Kazi account and relevant workspace in a privacy request so that the request's scope can be assessed.",
      ),
      paragraph(
        "Where information must be retained for a legal reason, access and use are limited to that reason. Deleted data can remain temporarily in restricted backups until the applicable backup cycle removes it; it is not used for ordinary service activity. Copies independently retained by teammates, calendar services, or connected clients are governed by those recipients' own responsibilities.",
      ),
    ],
  },
  {
    id: "security",
    title: "Security and incident handling",
    blocks: [
      paragraph(
        "Kazi uses authenticated access, workspace and project permissions, encrypted transport for hosted service connections, scoped and revocable agent credentials, and encryption for stored calendar refresh credentials. Agent credential values are stored as hashes rather than recoverable token values. These safeguards support security; no service can guarantee absolute protection against every threat.",
      ),
      paragraph(
        "Your workspace content is processed by Kazi's systems and authorized providers to deliver the service. Access for support, maintenance, or investigation should be limited to what is necessary for the relevant purpose. Protect your account, select trustworthy collaborators and agent clients, and treat private calendar URLs and access credentials as secrets.",
      ),
      paragraph(
        "If a personal-data incident triggers a legal notification duty, we will notify the relevant individuals, organizational controllers, or regulators as required by the applicable law. Send suspected security or privacy issues to the contact below without including passwords or access tokens.",
      ),
    ],
  },
  {
    id: "transfers",
    title: "International processing",
    blocks: [
      paragraph(
        "Kazi is operated from the United States and uses cloud and communications providers. Information may be processed in the United States and in other countries where the relevant providers and their authorized subprocessors operate. The laws in those countries can differ from the laws where you live.",
      ),
      paragraph(
        "A transfer that is restricted by applicable law must be supported by an appropriate legal arrangement. Depending on the circumstances, this may involve an adequacy decision, approved contractual clauses with the necessary UK or Swiss provisions, and additional safeguards where required. An applicable legal exception may be used only when its conditions are met. We do not rely on your mere use of Kazi as blanket consent to an international transfer.",
      ),
      paragraph(
        "Contact the privacy address for information about the applicable processing locations, transfer arrangements, and how to obtain relevant safeguards. The operator must confirm the actual provider locations and applicable agreements before this draft becomes an effective notice.",
      ),
    ],
  },
  {
    id: "rights",
    title: "Your choices and privacy requests",
    blocks: [
      list(
        "Access and export: Settings → Export my data downloads application data you are authorized to access. Where shared sign-in is enabled, it also includes your own account mapping and service-use records, without other members' identity mappings. This export is not a complete response to every statutory access request and excludes authentication and integration secrets.",
        "Correction: Edit profile information through My account and work content through the relevant feature, or ask us to correct information you cannot change.",
        "Connections: Disconnect optional calendar access, revoke agent credentials, and revoke private subscription links in the relevant Connections or Calendar settings.",
        "Access and notifications: Use project permissions, team controls, planning preferences, notification settings, and browser settings to manage available choices.",
        "Privacy rights: Depending on your location and the law that applies, request confirmation of processing, access, correction, deletion, restriction, portability, objection, withdrawal of consent, or an applicable opt-out. You may also have a right to appeal a decision and complain to a regulator.",
      ),
      paragraph(
        "Send a request to bolajibalogoun@gmail.com with the subject “Kazi privacy request.” Describe the request and the account, workspace, or invitation involved. Do not send passwords, calendar URLs, or agent tokens. We may request proportionate verification, and an authorized agent may need to show authority to act. Verification information is used for handling and protecting the request.",
      ),
      paragraph(
        "We will respond within the period required by applicable law and explain any lawful extension or refusal, including available appeal or complaint options. Requests are generally free; a fee or refusal will be used only where legally permitted. We will not unlawfully discriminate or retaliate against you for exercising privacy rights.",
      ),
      paragraph(
        "People in other countries can use the same contact to exercise rights available under their local law. The regional explanations below do not remove rights provided elsewhere. Additional local information or arrangements may be necessary depending on where Kazi is offered and how it is used.",
      ),
    ],
  },
  {
    id: "regional",
    title: "Additional information for Europe, the UK, and Switzerland",
    blocks: [
      paragraph(
        "Where European, UK, or Swiss data-protection law applies, the purposes and grounds above explain our own processing. You can request access, correction, erasure, and applicable restrictions or portability, and object to processing based on legitimate interests. You can withdraw consent for consent-based processing. These rights have legal conditions and exceptions.",
      ),
      paragraph(
        "Where the GDPR or UK GDPR applies, requests are normally handled within one month, subject to the extensions and other timing rules permitted by the applicable law. Swiss access requests are generally handled within 30 days. An organization's controller may need to answer requests about its workspace content with our assistance.",
      ),
      paragraph(
        "You may complain to the supervisory authority responsible for your location or the alleged infringement, including your relevant EEA data-protection authority, the UK Information Commissioner's Office, or the Swiss Federal Data Protection and Information Commissioner. You do not have to contact us first to exercise a right to complain.",
      ),
      paragraph(
        "If a representative or data protection officer is legally required for Kazi's activities, the applicable contact details must be made available. No appointment or certification is claimed by this draft.",
      ),
      links([
        {
          label: "Find an EEA supervisory authority",
          href: "https://www.edpb.europa.eu/about-edpb/our-members_en",
        },
        {
          label: "UK Information Commissioner's Office",
          href: "https://ico.org.uk/make-a-complaint/",
        },
        {
          label: "Swiss data-protection authority",
          href: "https://www.edoeb.admin.ch/en",
        },
      ]),
    ],
  },
  {
    id: "us-rights",
    title: "US state privacy rights and California disclosures",
    blocks: [
      paragraph(
        "Where an applicable US state privacy law covers our processing, residents may have rights to access or obtain a copy of personal information, correct it, delete it, and opt out of sale, targeted advertising, or certain profiling. Some laws provide an appeal process, permit authorized agents, or require specific treatment of sensitive data. Applicability and exceptions depend on the law, the type of information, and our activities.",
      ),
      paragraph(
        "For California's disclosure categories, the information described above can include identifiers and contact/customer records, internet or electronic activity, professional or work-related information, and inferences reflected in workflow or planning measures. Account access credentials, integration credentials, and any sensitive information voluntarily placed in content can require additional protection. Sources, purposes, recipients, and retention criteria are described in the preceding sections, including for the preceding 12 months to the extent Kazi operated during that period.",
      ),
      paragraph(
        "We do not sell personal information or share it for cross-context behavioral advertising. We use sensitive information to provide requested features and protect the service, not to infer sensitive characteristics for advertising. Where the CCPA applies, rights include knowing, access, correction, deletion, applicable limits on sensitive-information use, and freedom from unlawful discrimination. Applicable request responses are generally due within 45 days, with extensions only as permitted by law.",
      ),
      paragraph(
        "Use the privacy email to exercise a right or appeal a refusal. We will verify a request when required, explain the outcome, and provide any further appeal or regulator-contact instructions required by your state. The notice does not claim that every state statute applies to Kazi regardless of its statutory thresholds.",
      ),
    ],
  },
  {
    id: "children",
    title: "Adults-only service",
    blocks: [
      paragraph(
        "Kazi is intended for people who are at least 18 years old and legally able to use the service in their location. It is not directed to children, and we do not knowingly solicit their personal information. This is a product eligibility rule, not a statement that every jurisdiction uses the same age for privacy consent.",
      ),
      paragraph(
        "If you believe a person under 18 has supplied personal information through Kazi, contact bolajibalogoun@gmail.com. We will investigate and take appropriate steps, which may include restricting the account and deleting the information in accordance with applicable law. A team administrator's invitation does not waive the age requirement.",
      ),
    ],
  },
  {
    id: "changes",
    title: "Policy updates and contact",
    blocks: [
      paragraph(
        "We will update this policy when relevant practices or legal requirements change. The effective notice will identify its effective date and latest update. Where required, material changes will be communicated through the service, email, or another appropriate method before they take effect, and separate consent will be requested when legally necessary.",
      ),
      paragraph(
        "External sites, linked files, identity services, calendar apps, and connected AI or agent clients have their own practices. Review their notices when choosing to use them. This notice does not give them permission to use data beyond the authorization and legal limits that apply.",
      ),
      paragraph(
        "Privacy contact: Bolaji BALOGOUN, Arkansas 72223, United States. Email: bolajibalogoun@gmail.com. Website: https://kazi.iyanju.com. For organization-controlled workspaces, include the relevant team or workspace so we can route the request appropriately.",
      ),
    ],
  },
];
