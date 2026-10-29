import { ArrowLeft, ArrowRight, Check, ChevronRight, Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, NavLink, useLocation, useParams } from "react-router-dom";

import { BrandMark, CodeBlock } from "../../../shared/components";
import { normalizeLocale } from "../../../shared/i18n";
import { ThemeToggleButton } from "../../../shared/theme";
import { cn } from "../../../shared/utils";
import { docsGroups, getDocsArticle, getDocsArticles, type DocsArticle, type DocsSection } from "../docsContent";

const docsUi = {
  en: { allDocs: "All documentation", automate: "Automate", clear: "Clear search", closeNav: "Close documentation navigation", configure: "Configure", docs: "Documentation", emptyBody: "Try a feature name such as webhook, on-call, SMTP, or workflow.", emptyTitle: "No matching guide", getStarted: "Get started", homeDescription: "Set up alert intake, route notifications, respond to incidents, and automate follow-up work.", homeTitle: "Operate PagerWho with confidence.", nav: "Documentation", next: "Next", note: "Note", openNav: "Open documentation navigation", previous: "Previous", read: "read", reference: "Reference", respond: "Respond", search: "Search documentation", searchPlaceholder: "Search setup, workflows, notifications…", signIn: "Sign in" },
  ko: { allDocs: "전체 문서", automate: "자동화", clear: "검색 지우기", closeNav: "문서 메뉴 닫기", configure: "설정", docs: "문서", emptyBody: "Webhook, 온콜, SMTP 또는 Workflow 같은 기능 이름으로 검색해 보세요.", emptyTitle: "일치하는 가이드가 없습니다", getStarted: "시작하기", homeDescription: "알림 수신을 설정하고, 통지를 라우팅하고, 인시던트에 대응하며 후속 작업을 자동화하세요.", homeTitle: "PagerWho를 자신 있게 운영하세요.", nav: "사용자 문서", next: "다음", note: "참고", openNav: "문서 메뉴 열기", previous: "이전", read: "읽기", reference: "참조", respond: "대응", search: "문서 검색", searchPlaceholder: "설정, Workflow, 알림 검색…", signIn: "로그인" },
  "zh-CN": { allDocs: "全部文档", automate: "自动化", clear: "清除搜索", closeNav: "关闭文档导航", configure: "配置", docs: "文档", emptyBody: "请尝试 Webhook、值班、SMTP 或 Workflow 等功能名称。", emptyTitle: "没有匹配的指南", getStarted: "开始使用", homeDescription: "配置告警接入、路由通知、响应事故并自动执行后续工作。", homeTitle: "更有信心地运营 PagerWho。", nav: "用户文档", next: "下一篇", note: "注意", openNav: "打开文档导航", previous: "上一篇", read: "阅读", reference: "参考", respond: "响应", search: "搜索文档", searchPlaceholder: "搜索配置、Workflow、通知…", signIn: "登录" },
} as const;

type DocsUi = { [Key in keyof typeof docsUi.en]: string };

export function DocsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language);
  const ui = docsUi[locale];
  const articles = getDocsArticles(locale);
  const article = getDocsArticle(slug, locale);
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${article?.title ?? "Documentation"} · PagerWho`;
    return () => { document.title = "PagerWho"; };
  }, [article?.title]);

  if (slug && !article) return <Navigate replace to="/docs" />;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <DocsHeader isMenuOpen={isMenuOpen} onMenuToggle={() => setIsMenuOpen((current) => !current)} ui={ui} />
      <div className="mx-auto grid max-w-310 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DocsSidebar articles={articles} className={cn("hidden lg:block", isMenuOpen && "block")} mobile={false} ui={ui} />
        {isMenuOpen ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-hairline bg-canvas p-5 lg:hidden">
            <DocsSidebar articles={articles} mobile ui={ui} />
          </div>
        ) : null}
        {article ? <ArticlePage article={article} articles={articles} ui={ui} /> : <DocsHome articles={articles} ui={ui} />}
      </div>
    </main>
  );
}

function DocsHeader({ isMenuOpen, onMenuToggle, ui }: { isMenuOpen: boolean; onMenuToggle: () => void; ui: DocsUi }) {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline-soft bg-canvas/92 backdrop-blur-[18px]">
      <div className="mx-auto flex min-h-16 max-w-310 items-center justify-between gap-3 px-5 sm:px-7.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="inline-flex shrink-0 items-center gap-2.5 text-[15px] font-bold leading-none no-underline" to="/">
            <BrandMark />
            <span className="hidden sm:inline">Pager Who</span>
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-hairline" />
          <Link className="text-sm font-semibold text-ink-muted no-underline hover:text-ink" to="/docs">{ui.docs}</Link>
        </div>
        <div className="flex items-center gap-2">
          <Link className="hidden text-sm font-semibold text-ink-muted no-underline hover:text-ink sm:block" to="/login">{ui.signIn}</Link>
          <ThemeToggleButton />
          <button
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? ui.closeNav : ui.openNav}
            className="inline-flex size-9 items-center justify-center rounded-md border border-hairline bg-transparent text-ink lg:hidden"
            onClick={onMenuToggle}
            type="button"
          >
            {isMenuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function DocsSidebar({ articles, className, mobile, ui }: { articles: DocsArticle[]; className?: string; mobile: boolean; ui: DocsUi }) {
  return (
    <aside className={cn(!mobile && "sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-hairline-soft px-5 py-7", className)}>
      <nav aria-label={ui.nav}>
        <Link className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-muted no-underline hover:text-ink" to="/docs">
          <ArrowLeft size={15} /> {ui.allDocs}
        </Link>
        <div className="grid gap-6">
          {docsGroups.map((group) => (
            <div className="grid gap-1.5" key={group}>
              <h2 className="m-0 text-[11px] font-[750] uppercase tracking-[0.04em] text-ink-subtle">{groupLabel(group, ui)}</h2>
              {articles.filter((article) => article.group === group).map((article) => (
                <NavLink
                  className={({ isActive }) => cn(
                    "rounded-md px-2.5 py-2 text-[13px] font-semibold leading-5 no-underline transition-colors",
                    isActive ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-1 hover:text-ink",
                  )}
                  key={article.slug}
                  to={`/docs/${article.slug}`}
                >
                  {article.title}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function DocsHome({ articles, ui }: { articles: DocsArticle[]; ui: DocsUi }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleArticles = useMemo(() => articles.filter((article) =>
    !normalizedQuery || `${article.title} ${article.description} ${article.group}`.toLowerCase().includes(normalizedQuery),
  ), [articles, normalizedQuery]);

  return (
    <div className="min-w-0 px-5 pb-24 pt-10 sm:px-8 sm:pt-14 lg:px-12">
      <div className="mx-auto max-w-220">
        <header className="grid gap-5 border-b border-hairline-soft pb-10">
          <div className="grid max-w-180 gap-3">
            <h1 className="m-0 text-[38px] font-[650] leading-[1.12] tracking-[-0.025em] sm:text-[52px]">{ui.homeTitle}</h1>
            <p className="m-0 max-w-170 text-base leading-7 text-ink-muted sm:text-lg">{ui.homeDescription}</p>
          </div>
          <label className="relative block max-w-150">
            <span className="sr-only">{ui.search}</span>
            <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
            <input
              className="min-h-12 w-full rounded-lg border border-hairline bg-surface-1 pl-11 pr-4 text-[15px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ui.searchPlaceholder}
              type="search"
              value={query}
            />
          </label>
        </header>

        {visibleArticles.length ? (
          <div className="grid gap-12 pt-10">
            {docsGroups.map((group) => {
              const articles = visibleArticles.filter((article) => article.group === group);
              if (!articles.length) return null;
              return (
                <section className="grid gap-4" key={group}>
                  <h2 className="m-0 text-xl font-[650] tracking-[-0.01em]">{groupLabel(group, ui)}</h2>
                  <div className="divide-y divide-hairline-soft border-y border-hairline-soft">
                    {articles.map((article) => <ArticleRow article={article} key={article.slug} />)}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid justify-items-start gap-2 py-14">
            <h2 className="m-0 text-xl font-[650]">{ui.emptyTitle}</h2>
            <p className="m-0 text-ink-muted">{ui.emptyBody}</p>
            <button className="mt-2 rounded-full border border-hairline bg-transparent px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-2" onClick={() => setQuery("")} type="button">{ui.clear}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleRow({ article }: { article: DocsArticle }) {
  const Icon = article.icon;
  return (
    <Link className="group grid gap-3 py-5 no-underline sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center" to={`/docs/${article.slug}`}>
      <span className="inline-flex size-9 items-center justify-center rounded-md bg-surface-1 text-ink-muted group-hover:text-accent"><Icon size={17} /></span>
      <span className="grid gap-1">
        <strong className="text-[15px] font-[650] text-ink group-hover:text-accent">{article.title}</strong>
        <span className="text-sm leading-6 text-ink-muted">{article.description}</span>
      </span>
      <span className="hidden items-center gap-2 text-xs font-semibold text-ink-subtle sm:flex">{article.readingTime}<ChevronRight className="transition-transform group-hover:translate-x-0.5" size={15} /></span>
    </Link>
  );
}

function ArticlePage({ article, articles, ui }: { article: DocsArticle; articles: DocsArticle[]; ui: DocsUi }) {
  const currentIndex = articles.findIndex((candidate) => candidate.slug === article.slug);
  const previous = articles[currentIndex - 1];
  const next = articles[currentIndex + 1];

  return (
    <article className="min-w-0 px-5 pb-24 pt-9 sm:px-8 sm:pt-12 lg:px-12">
      <div className="mx-auto max-w-190">
        <header className="grid gap-4 border-b border-hairline-soft pb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
            <Link className="text-ink-muted no-underline hover:text-ink" to="/docs">{ui.docs}</Link>
            <ChevronRight size={13} />
            <span>{groupLabel(article.group, ui)}</span>
          </div>
          <h1 className="m-0 text-[34px] font-[650] leading-[1.14] tracking-[-0.025em] sm:text-[46px]">{article.title}</h1>
          <p className="m-0 max-w-170 text-base leading-7 text-ink-muted sm:text-lg">{article.description}</p>
          <span className="text-xs font-semibold text-ink-subtle">{article.readingTime} {ui.read}</span>
        </header>

        <div className="grid gap-12 pt-10">
          {article.sections.map((section) => <ArticleSection key={section.heading} section={section} ui={ui} />)}
        </div>

        <footer className="mt-14 grid gap-3 border-t border-hairline-soft pt-6 sm:grid-cols-2">
          {previous ? <ArticlePager article={previous} direction={ui.previous} /> : <span />}
          {next ? <ArticlePager article={next} direction={ui.next} right /> : null}
        </footer>
      </div>
    </article>
  );
}

function ArticleSection({ section, ui }: { section: DocsSection; ui: DocsUi }) {
  return (
    <section className="grid scroll-mt-24 gap-4" id={slugify(section.heading)}>
      <h2 className="m-0 text-[23px] font-[650] leading-tight tracking-[-0.015em]">{section.heading}</h2>
      {section.paragraphs?.map((paragraph) => <p className="m-0 max-w-[72ch] text-[15px] leading-7 text-ink-muted sm:text-base" key={paragraph}>{paragraph}</p>)}
      {section.steps ? (
        <ol className="m-0 grid list-none gap-0 p-0">
          {section.steps.map((step, index) => (
            <li className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 border-b border-hairline-soft py-4 first:pt-1 last:border-0" key={step.title}>
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink">{index + 1}</span>
              <span className="grid gap-1">
                <strong className="text-[15px] font-[650] text-ink">{step.title}</strong>
                <span className="text-[15px] leading-6 text-ink-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {section.bullets ? (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {section.bullets.map((bullet) => (
            <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 text-[15px] leading-6 text-ink-muted" key={bullet}>
              <Check aria-hidden="true" className="mt-1 text-accent" size={15} strokeWidth={2.4} />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {section.code ? <CodeBlock className="whitespace-pre-wrap p-4">{section.code}</CodeBlock> : null}
      {section.note ? <p className="m-0 rounded-lg bg-surface-1 px-4 py-3.5 text-sm leading-6 text-ink-muted"><strong className="text-ink">{ui.note}: </strong>{section.note}</p> : null}
    </section>
  );
}

function ArticlePager({ article, direction, right }: { article: DocsArticle; direction: string; right?: boolean }) {
  return (
    <Link className={cn("group grid gap-1 rounded-lg border border-hairline p-4 no-underline hover:bg-surface-1", right && "text-right")} to={`/docs/${article.slug}`}>
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold text-ink-subtle", right && "justify-end")}>{right ? null : <ArrowLeft size={13} />}{direction}{right ? <ArrowRight size={13} /> : null}</span>
      <strong className="text-sm font-[650] text-ink group-hover:text-accent">{article.title}</strong>
    </Link>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function groupLabel(group: DocsArticle["group"], ui: DocsUi) {
  const labels: Record<DocsArticle["group"], string> = {
    "Get started": ui.getStarted,
    Respond: ui.respond,
    Configure: ui.configure,
    Automate: ui.automate,
    Reference: ui.reference,
  };
  return labels[group];
}
