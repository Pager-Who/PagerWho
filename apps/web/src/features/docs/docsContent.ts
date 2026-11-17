import {
  BellRing, BookOpen, CalendarDays, GitBranch, KeyRound, PlugZap,
  RadioTower, ShieldCheck, Workflow, type LucideIcon,
} from "lucide-react";
import { docsGroups, getDocsArticle as getSharedArticle, getDocsArticles as getSharedArticles,
  type DocsArticle as SharedArticle, type DocsSection } from "@im/contracts";
import type { AppLocale } from "../../shared/i18n";

export { docsGroups };
export type { DocsSection };
export type DocsArticle = SharedArticle & { icon: LucideIcon };

const icons: Record<string, LucideIcon> = {
  "getting-started": BookOpen,
  "services-and-webhooks": PlugZap,
  incidents: RadioTower,
  "on-call": CalendarDays,
  "escalation-policies": GitBranch,
  "notification-providers": BellRing,
  workflows: Workflow,
  "roles-and-permissions": ShieldCheck,
  troubleshooting: KeyRound,
};

function withIcon(article: SharedArticle): DocsArticle {
  return { ...article, icon: icons[article.slug] ?? BookOpen };
}

export function getDocsArticles(locale: AppLocale): DocsArticle[] {
  return getSharedArticles(locale).map(withIcon);
}

export function getDocsArticle(slug: string | undefined, locale: AppLocale = "en") {
  const article = getSharedArticle(slug, locale);
  return article ? withIcon(article) : undefined;
}
