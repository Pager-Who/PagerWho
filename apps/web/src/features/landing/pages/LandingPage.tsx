import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  GitBranch,
  PlugZap,
  RadioTower,
  ShieldCheck,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../../shared/auth";
import { BrandMark } from "../../../shared/components";
import { getCurrentLocale, useStaticText } from "../../../shared/i18n";
import { ThemeToggleButton } from "../../../shared/theme";
import { cn } from "../../../shared/utils";

const responseSteps: Array<{
  body: string;
  icon: LucideIcon;
  label: string;
  title: string;
}> = [
  {
    body: "Receive webhook alerts, group duplicates, and track each incident in a timeline.",
    icon: RadioTower,
    label: "01",
    title: "Receive alerts",
  },
  {
    body: "Notify the right responder using the service on-call schedule and escalation policy.",
    icon: UsersRound,
    label: "02",
    title: "Notify the responder",
  },
  {
    body: "If no one responds, notify the next person according to your escalation policy.",
    icon: GitBranch,
    label: "03",
    title: "Contact the next responder",
  },
];

const capabilitySections: Array<{
  bullets: string[];
  description: string;
  icon: LucideIcon;
  title: string;
}> = [
  {
    bullets: ["Service webhooks", "Deduplication", "Incident timeline"],
    description: "Create incidents from monitoring, logging, or custom webhook events.",
    icon: PlugZap,
    title: "Alert intake",
  },
  {
    bullets: ["Primary and secondary rotation", "Overrides", "Calendar preview"],
    description: "See who is responsible before an incident starts.",
    icon: CalendarDays,
    title: "On-call schedules",
  },
  {
    bullets: ["Notification delays", "Repeat rules", "Acknowledge and resolve incidents"],
    description: "Set who gets notified, how long to wait, and who is next if there is no response.",
    icon: BellRing,
    title: "Escalation policies",
  },
  {
    bullets: ["Project roles", "Audit log", "Provider settings"],
    description: "Manage team permissions, review audit logs, and configure notification providers.",
    icon: ShieldCheck,
    title: "Project operations",
  },
  {
    bullets: ["Event triggers", "Canvas editor", "HTTP actions"],
    description: "Automate follow-up work from incident, service, and workflow events.",
    icon: Workflow,
    title: "Workflows",
  },
];

export function LandingPage() {
  const { isAuthenticated, isCheckingAuth } = useAuth();
  const t = useStaticText();
  const isKorean = getCurrentLocale() === "ko";
  const appPath = isAuthenticated ? "/overview" : "/login";
  const appCta = isAuthenticated ? t("Open dashboard") : t("Get started");

  return (
    <main className="min-h-screen overflow-x-clip bg-canvas pb-20 text-ink [&:lang(ko)]:break-keep">
      <header className="sticky top-0 z-30 border-b border-hairline-soft bg-canvas/88 backdrop-blur-[18px]">
        <div className="mx-auto flex min-h-16 max-w-310 flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7.5">
          <Link className="inline-flex items-center gap-2.5 text-[15px] font-bold leading-none no-underline" to="/">
            <BrandMark />
            <span>Pager Who</span>
          </Link>

          <nav aria-label={t("Landing navigation")} className="order-last flex w-full flex-wrap items-center justify-center gap-1 rounded-full border border-hairline bg-white/4 p-1 lg:order-none lg:w-auto">
            <HeaderLink href="#flow">{t("How it works")}</HeaderLink>
            <HeaderLink href="#product">{t("Product")}</HeaderLink>
            <Link className="rounded-full px-3.5 py-2 text-sm font-semibold leading-none text-ink-muted no-underline hover:bg-surface-1 hover:text-ink" to="/docs">Docs</Link>
            <HeaderLink href="#contact">{t("Contact")}</HeaderLink>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            {!isAuthenticated && !isCheckingAuth ? (
              <Link className="hidden min-h-9.5 items-center justify-center rounded-full px-3.5 text-sm font-semibold leading-none text-ink-muted no-underline shadow-[inset_0_0_0_1px_var(--color-hairline)] hover:bg-surface-2 hover:text-ink sm:inline-flex" to="/login">
                {t("Sign in")}
              </Link>
            ) : null}
            <Link className="inline-flex min-h-9.5 items-center justify-center gap-2 rounded-full bg-ink px-3.5 text-sm font-semibold leading-none text-canvas no-underline transition duration-120 ease hover:-translate-y-px" to={appPath}>
              {appCta}
              <ArrowRight size={15} strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-hairline-soft bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0)_38%),var(--color-canvas)]">
        <div className="mx-auto grid max-w-310 gap-7 px-5 pb-10 pt-10 sm:px-7.5 sm:pb-12 sm:pt-13 lg:grid-cols-[minmax(0,0.82fr)_minmax(420px,1fr)] lg:items-center">
          <div className="grid max-w-182 gap-5">
            <div className="landing-reveal grid gap-4">
              <h1 className="m-0 text-[38px] font-[650] leading-[1.15] text-ink sm:text-[56px] lg:text-[68px]">
                {t("Get the right person on every alert.")}
              </h1>
              <p className="m-0 max-w-172 text-lg leading-[1.5] text-ink-muted sm:text-xl">
                {t("Pager Who turns monitoring alerts into incidents, notifies the on-call responder, and contacts the next person when there is no response.")}
              </p>
            </div>

            <div className="landing-reveal landing-delay-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold leading-none text-canvas no-underline transition duration-120 ease hover:-translate-y-px" to={appPath}>
                {appCta}
                <ArrowRight size={16} strokeWidth={2.2} />
              </Link>
              <a className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold leading-none text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-hairline)] transition duration-120 ease hover:-translate-y-px hover:bg-surface-1" href="#contact">
                {t("Contact us")}
              </a>
            </div>

          </div>

          <HeroPreview />
        </div>
      </section>

      <section className="scroll-mt-56 sm:scroll-mt-36 border-b border-hairline-soft" id="flow">
        <div className="mx-auto grid max-w-310 gap-7 px-5 py-14 sm:px-7.5 lg:grid-cols-[0.72fr_1fr] lg:items-start">
          <SectionIntro
            description="Connect your monitoring tools, set an on-call schedule, and decide who to notify if an alert goes unanswered."
            eyebrow="How it works"
            title="From the first alert to a clear next step."
          />

          <div className="grid gap-3">
            {responseSteps.map((step, index) => (
              <StepRow className={delayClasses[index]} key={step.title} step={step} />
            ))}
          </div>
        </div>
      </section>

      <section className="scroll-mt-56 sm:scroll-mt-36 border-b border-hairline-soft" id="product">
        <div className="mx-auto grid max-w-310 gap-7 px-5 py-14 sm:px-7.5">
          <SectionIntro
            description="Manage alerts, on-call schedules, and follow-up tasks without losing track of who is responding."
            eyebrow="Product"
            title="Keep your incident response in one place."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {capabilitySections.map((section, index) => (
              <CapabilityCard className={delayClasses[index % delayClasses.length]} key={section.title} section={section} />
            ))}
          </div>
        </div>
      </section>

      <section className="scroll-mt-56 sm:scroll-mt-36 border-b border-hairline-soft" id="contact">
        <div className="mx-auto grid max-w-310 gap-6 px-5 py-14 sm:px-7.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <SectionIntro
            eyebrow="Contact"
            title="Questions? Meet us on Discord."
            description="Ask about setup, share feedback, or talk with the Pager Who team in our Discord community."
          />
          <a
            className="inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold leading-none text-canvas no-underline transition duration-120 ease hover:-translate-y-px"
            href="https://discord.gg/gZWNefYHMh"
            rel="noreferrer"
            target="_blank"
          >
            {t("Join Discord")}
            <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
          </a>
        </div>
      </section>

      <section className="border-b border-hairline-soft">
        <div className="mx-auto grid max-w-310 gap-5 px-5 py-14 sm:px-7.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid max-w-184 gap-3">
            <span className="text-xs font-bold uppercase leading-none text-accent">{t("Start here")}</span>
            <h2 className="m-0 text-[30px] font-[650] leading-[1.2] text-ink sm:text-[42px]">
              {t("Create one service, one schedule, and one escalation policy.")}
            </h2>
            <p className="m-0 text-base leading-[1.5] text-ink-muted">
              {t("Send a test alert to check that the right person is notified, then invite your team.")}
            </p>
          </div>

          <Link className="inline-flex min-h-12 w-fit items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold leading-none text-canvas no-underline transition duration-120 ease hover:-translate-y-px" to={appPath}>
            {appCta}
            <ArrowRight size={16} strokeWidth={2.2} />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-310 flex-col gap-4 px-5 pt-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-7.5">
        <span>© {new Date().getFullYear()} Pager Who</span>
        <nav aria-label={isKorean ? "법적 고지" : "Legal"} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="font-semibold text-ink-muted no-underline hover:text-ink" to="/docs">
            {t("Documentation")}
          </Link>
          <Link className="font-semibold text-ink-muted no-underline hover:text-ink" to="/privacy">
            {isKorean ? "개인정보처리방침" : "Privacy Policy"}
          </Link>
          <Link className="font-semibold text-ink-muted no-underline hover:text-ink" to="/terms">
            {isKorean ? "서비스 이용약관" : "Terms of Service"}
          </Link>
        </nav>
      </footer>
    </main>
  );
}

const delayClasses = ["landing-delay-1", "landing-delay-2", "landing-delay-3"];

function HeaderLink({ children, href }: { children: string; href: string }) {
  return (
    <a className="rounded-full px-3.5 py-2 text-sm font-semibold leading-none text-ink-muted no-underline hover:bg-surface-1 hover:text-ink" href={href}>
      {children}
    </a>
  );
}

function HeroPreview() {
  const t = useStaticText();

  return (
    <div className="landing-reveal landing-delay-2 mx-auto w-full max-w-250">
      <PreviewShell label="Example incident" title="Checkout service incident">
        <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_230px]">
          <div className="grid gap-3 rounded-md border border-hairline bg-surface-1 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1.5">
                <span className="text-xs font-bold uppercase leading-none text-accent">{t("P1 critical")}</span>
                <h2 className="m-0 min-w-0 text-[22px] font-[650] leading-tight text-ink">{t("Checkout API latency spike")}</h2>
                <p className="m-0 text-sm leading-[1.4] text-ink-muted">{t("18 webhook events grouped into one incident.")}</p>
              </div>
              <PreviewStatus />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <PreviewStat label="Service" value="checkout-api" />
              <PreviewStat label="Owner" value="Payments" />
              <PreviewStat label="On-call" value="Mina Park" />
            </div>
          </div>

          <div className="grid gap-2.5 rounded-md border border-hairline bg-surface-1 p-4">
            <span className="text-xs font-bold uppercase leading-none text-ink-subtle">{t("Escalation")}</span>
            <PreviewStep active label="Primary on-call" value="now" />
            <PreviewStep label="Secondary" value="+5 min" />
            <PreviewStep label="Team channel" value="+10 min" />
            <div className="h-1.5 overflow-hidden rounded-full bg-canvas/80">
              <span className="landing-progress-fill block h-full rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </PreviewShell>
    </div>
  );
}

function SectionIntro({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  const t = useStaticText();

  return (
    <div className="grid max-w-180 gap-3">
      <span className="text-xs font-bold uppercase leading-none text-accent">{t(eyebrow)}</span>
      <h2 className="m-0 text-[30px] font-[650] leading-[1.2] text-ink sm:text-[42px]">{t(title)}</h2>
      <p className="m-0 max-w-156 text-base leading-[1.55] text-ink-muted">{t(description)}</p>
    </div>
  );
}

function StepRow({
  className,
  step,
}: {
  className: string | undefined;
  step: (typeof responseSteps)[number];
}) {
  const t = useStaticText();

  return (
    <article className={cn("landing-reveal landing-flow-card grid gap-3 rounded-md border border-hairline bg-surface-1 p-4.5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-start", className)}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink">
        {step.label}
      </span>
      <step.icon className="mt-1 text-accent" size={22} strokeWidth={2.1} />
      <div className="grid gap-1.5">
        <h3 className="m-0 text-lg font-semibold leading-tight text-ink">{t(step.title)}</h3>
        <p className="m-0 text-sm leading-[1.5] text-ink-muted">{t(step.body)}</p>
      </div>
    </article>
  );
}

function CapabilityCard({
  className,
  section,
}: {
  className: string | undefined;
  section: (typeof capabilitySections)[number];
}) {
  const t = useStaticText();

  return (
    <article className={cn("landing-reveal landing-flow-card grid content-start gap-4 rounded-md border border-hairline bg-surface-1 p-4.5", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/12 text-accent">
        <section.icon size={21} strokeWidth={2.1} />
      </div>
      <div className="grid gap-2">
        <h3 className="m-0 text-xl font-[650] leading-tight text-ink">{t(section.title)}</h3>
        <p className="m-0 text-sm leading-[1.5] text-ink-muted">{t(section.description)}</p>
      </div>
      <div className="grid gap-2">
        {section.bullets.map((bullet) => (
          <div className="flex items-center gap-2.5 text-sm leading-[1.45] text-ink-muted" key={bullet}>
            <CheckCircle2 className="shrink-0 text-success" size={16} strokeWidth={2.2} />
            <span>{t(bullet)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PreviewShell({ children, label, title }: { children: ReactNode; label: string; title: string }) {
  const t = useStaticText();

  return (
    <div className="landing-preview-frame overflow-hidden rounded-md border border-hairline bg-canvas-raised shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline-soft bg-surface-1 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning" />
          <span className="h-2.5 w-2.5 rounded-full bg-success" />
          <strong className="ml-2 min-w-0 truncate text-sm font-semibold leading-none text-ink">{t(title)}</strong>
        </div>
        <span className="hidden text-xs font-semibold leading-none text-ink-subtle sm:inline">{t(label)}</span>
      </div>
      {children}
    </div>
  );
}

function PreviewStatus() {
  const t = useStaticText();

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/16 px-2.5 py-1.5 text-xs font-bold leading-none text-danger">
      <span className="landing-pulse-dot h-1.5 w-1.5 rounded-full bg-danger" />
      {t("triggered")}
    </span>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  const t = useStaticText();

  return (
    <div className="grid gap-1 rounded-md bg-canvas/42 p-3">
      <span className="text-xs font-semibold leading-none text-ink-subtle">{t(label)}</span>
      <strong className="min-w-0 truncate text-sm font-semibold leading-tight text-ink">{t(value)}</strong>
    </div>
  );
}

function PreviewStep({ active = false, label, value }: { active?: boolean; label: string; value: string }) {
  const t = useStaticText();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-canvas/42 p-3">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-tight text-ink">
        <span className={active ? "h-2 w-2 shrink-0 rounded-full bg-accent" : "h-2 w-2 shrink-0 rounded-full bg-surface-3"} />
        <span className="min-w-0 truncate">{t(label)}</span>
      </span>
      <span className="text-xs font-semibold leading-tight text-ink-muted">{t(value)}</span>
    </div>
  );
}
