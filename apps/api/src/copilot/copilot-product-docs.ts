import { getDocsArticles, type CopilotSource, type DocsLocale } from "@im/contracts";
import { z } from "zod";

const argsSchema = z.object({ query: z.string().trim().min(2).max(200) }).strict();
const locales: DocsLocale[] = ["en", "ko", "zh-CN"];

export const productDocsTool = {
  type: "function", name: "search_product_docs",
  description: "Search public PagerWho product guides for feature explanations and setup steps. Read-only; not the current project's configuration or incident evidence.",
  parameters: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 200 } }, required: ["query"], additionalProperties: false },
};

function terms(value: string): string[] {
  const words = value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.flatMap((word) => {
    if (/^[a-z0-9]+$/.test(word)) return word.length >= 3 ? [word] : [];
    return word.length >= 4 ? [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))] : [word];
  }))];
}

function score(query: string[], title: string, heading: string, content: string) {
  const titleText = title.toLocaleLowerCase();
  const headingText = heading.toLocaleLowerCase();
  const contentText = content.toLocaleLowerCase();
  return query.reduce((total, term) => total + (titleText.includes(term) ? 5 : 0) + (headingText.includes(term) ? 4 : 0) + (contentText.includes(term) ? 1 : 0), 0);
}

export function searchProductDocs(args: unknown, locale: DocsLocale) {
  const { query } = argsSchema.parse(args);
  const selectedLocale = locales.includes(locale) ? locale : "en";
  const queryTerms = terms(query).filter((term) => term.length > 1);
  const matches = getDocsArticles(selectedLocale).flatMap((article) => article.sections.map((section) => {
    const content = [
      ...(section.paragraphs ?? []), ...(section.steps ?? []).map((step) => `${step.title}: ${step.body}`),
      ...(section.bullets ?? []), section.note ?? "", section.code ?? "",
    ].filter(Boolean).join("\n");
    const slugMatch = query.toLocaleLowerCase().includes(article.slug) ? 20 : 0;
    return { article, section, content, rank: slugMatch + score(queryTerms, `${article.title} ${article.description}`, section.heading, content) };
  })).filter((match) => match.rank > 0).sort((a, b) => b.rank - a.rank).slice(0, 4);

  const sources: CopilotSource[] = matches.map(({ article, section, content }) => ({
    path: `/docs/${article.slug}`, title: `${article.title} · ${section.heading}`,
    snippet: content.slice(0, 600),
  }));
  return {
    data: matches.map(({ article, section, content }) => ({
      title: article.title, section: section.heading, path: `/docs/${article.slug}`,
      excerpt: content.slice(0, 1800),
    })),
    sources,
    locale: selectedLocale,
  };
}
