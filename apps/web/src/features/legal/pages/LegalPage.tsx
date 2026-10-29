import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BrandMark } from "../../../shared/components";
import { normalizeLocale } from "../../../shared/i18n";
import { ThemeToggleButton } from "../../../shared/theme";

type LegalDocument = "privacy" | "terms";

type LegalSection = {
  body?: string[];
  items?: string[];
  title: string;
};

type LegalCopy = {
  back: string;
  effectiveDate: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
  title: string;
};

const effectiveDate = "2026-10-08";
const contactEmail = "pagerwho.notifications@gmail.com";

const copy: Record<LegalDocument, { en: LegalCopy; ko: LegalCopy }> = {
  privacy: {
    ko: {
      back: "PagerWho 홈으로 돌아가기",
      effectiveDate: `시행일: ${effectiveDate}`,
      lastUpdated: `최종 수정일: ${effectiveDate}`,
      title: "개인정보처리방침",
      intro: "PagerWho는 서비스 제공에 필요한 범위에서 개인정보를 처리합니다. 이 방침은 PagerWho 웹 서비스에서 어떤 정보를 처리하고, 왜 사용하며, 이용자가 어떤 선택을 할 수 있는지 설명합니다.",
      sections: [
        {
          title: "1. 처리하는 정보",
          items: [
            "Google OIDC 로그인 시 Google이 제공하는 고유 사용자 식별자(subject identifier), 이름, 이메일 주소, 이메일 확인 여부 및 제공되는 경우 프로필 이미지",
            "계정, 프로젝트, 팀, 온콜 일정, 에스컬레이션 정책, 인시던트 및 서비스 이용 과정에서 이용자가 입력하거나 생성한 운영 데이터",
            "로그인 세션과 인증 상태를 유지하는 데 필요한 세션 정보",
            "서비스 안정성, 오류 진단 및 보안을 위한 요청 시각, 동작 결과, 기기·브라우저의 일반적인 기술 정보와 보안 로그",
          ],
        },
        {
          title: "2. 처리 목적",
          items: [
            "Google 계정을 통한 본인 확인, 계정 생성 및 로그인 제공",
            "인시던트 대응, 온콜 일정, 알림 및 협업 기능 제공",
            "서비스 운영, 장애 대응, 부정 이용 방지 및 보안 유지",
            "이용자 문의 처리와 중요한 서비스 변경사항 안내",
          ],
        },
        {
          title: "3. 보관 및 삭제",
          body: [
            "개인정보와 운영 데이터는 계정 및 서비스 제공에 필요한 동안 보관합니다. 계정 삭제 요청이 접수되거나 처리 목적이 달성되면, 법령상 보관 의무 또는 보안·분쟁 대응을 위해 필요한 경우를 제외하고 합리적인 기간 내 삭제하거나 식별할 수 없도록 처리합니다.",
            "백업에 남은 정보는 정해진 백업 순환 주기에 따라 삭제될 수 있습니다. 보안 로그는 서비스 보호와 사고 조사에 필요한 범위에서 제한적으로 보관합니다.",
          ],
        },
        {
          title: "4. 공유 및 처리 위탁",
          body: [
            "PagerWho는 개인정보를 판매하지 않습니다. 서비스 제공에 필요한 경우 호스팅, 데이터베이스, 이메일·메시지 전송, 모니터링 등 인프라 제공자가 제한된 범위에서 정보를 처리할 수 있습니다. 또한 법적 의무 이행, 이용자 또는 타인의 권리와 안전 보호를 위해 필요한 경우 정보를 제공할 수 있습니다.",
            "Google 로그인에는 Google의 서비스 및 개인정보처리방침이 함께 적용됩니다. PagerWho는 Google 비밀번호를 수집하거나 저장하지 않습니다.",
          ],
        },
        {
          title: "5. 이용자의 권리와 선택",
          body: [
            "이용자는 자신의 개인정보에 대한 열람, 정정, 삭제 또는 처리 제한을 요청할 수 있습니다. Google 계정 설정에서 PagerWho의 접근 권한을 철회할 수도 있습니다. 권한 철회는 향후 Google 로그인을 제한할 수 있지만, 이미 보관 중인 PagerWho 계정 데이터의 삭제를 자동으로 요청하지는 않습니다.",
          ],
        },
        {
          title: "6. 쿠키와 보안",
          body: [
            "PagerWho는 로그인 상태와 보안에 필요한 쿠키 또는 유사 기술을 사용합니다. 합리적인 기술적·관리적 보호조치를 적용하지만, 어떠한 전송 또는 저장 방식도 절대적인 안전을 보장할 수는 없습니다.",
          ],
        },
        {
          title: "7. 문의",
          body: [
            `개인정보 처리 또는 권리 행사에 관한 문의는 ${contactEmail}으로 보내주세요.`,
          ],
        },
      ],
    },
    en: {
      back: "Back to PagerWho",
      effectiveDate: `Effective date: ${effectiveDate}`,
      lastUpdated: `Last updated: ${effectiveDate}`,
      title: "Privacy Policy",
      intro: "PagerWho processes personal information only as needed to provide the service. This policy explains what information the PagerWho web service processes, why it is used, and the choices available to you.",
      sections: [
        {
          title: "1. Information we process",
          items: [
            "When you sign in with Google OIDC: the Google subject identifier, name, email address, email verification status, and profile image when provided",
            "Account and operational data you enter or create, including projects, teams, on-call schedules, escalation policies, incidents, and services",
            "Session information needed to maintain your signed-in and authentication state",
            "Request times, operation results, general device and browser details, and security logs used for reliability, diagnosis, and security",
          ],
        },
        {
          title: "2. How we use information",
          items: [
            "To verify identity and provide account creation and sign-in through Google",
            "To provide incident response, on-call scheduling, notification, and collaboration features",
            "To operate and secure the service, respond to failures, and prevent misuse",
            "To respond to questions and communicate important service changes",
          ],
        },
        {
          title: "3. Retention and deletion",
          body: [
            "We retain personal information and operational data while needed to provide your account and the service. Following an account deletion request or when the purpose for processing ends, we delete or de-identify it within a reasonable period unless retention is required by law or reasonably needed for security or dispute resolution.",
            "Information in backups may remain until the applicable backup cycle completes. Security logs are retained only as reasonably needed to protect the service and investigate incidents.",
          ],
        },
        {
          title: "4. Sharing and service providers",
          body: [
            "PagerWho does not sell personal information. Infrastructure providers may process limited information when needed for hosting, databases, email or message delivery, and monitoring. We may also disclose information to meet legal obligations or protect the rights and safety of users or others.",
            "Google services and Google's privacy policy also apply to Google sign-in. PagerWho does not collect or store your Google password.",
          ],
        },
        {
          title: "5. Your rights and choices",
          body: [
            "You may request access to, correction of, deletion of, or restriction of your personal information. You may also revoke PagerWho's access in your Google Account settings. Revoking access may prevent future Google sign-in, but does not automatically request deletion of data already held in your PagerWho account.",
          ],
        },
        {
          title: "6. Cookies and security",
          body: [
            "PagerWho uses cookies or similar technology needed for sign-in state and security. We apply reasonable technical and organizational safeguards, but no method of transmission or storage can be guaranteed to be completely secure.",
          ],
        },
        {
          title: "7. Contact",
          body: [`For privacy questions or requests, contact ${contactEmail}.`],
        },
      ],
    },
  },
  terms: {
    ko: {
      back: "PagerWho 홈으로 돌아가기",
      effectiveDate: `시행일: ${effectiveDate}`,
      lastUpdated: `최종 수정일: ${effectiveDate}`,
      title: "서비스 이용약관",
      intro: "본 약관은 PagerWho 서비스의 이용 조건을 설명합니다. 서비스를 이용하면 본 약관과 개인정보처리방침에 동의한 것으로 봅니다.",
      sections: [
        {
          title: "1. 이용 자격 및 동의",
          body: [
            "서비스를 이용하려면 관련 법률에 따라 계약을 체결할 수 있어야 합니다. 조직을 대신해 서비스를 이용하는 경우 해당 조직을 본 약관에 구속할 권한이 있음을 확인합니다. 약관에 동의하지 않으면 서비스를 이용하지 않아야 합니다.",
          ],
        },
        {
          title: "2. 계정과 보안",
          body: [
            "정확한 계정 정보를 유지하고 로그인 수단과 세션을 안전하게 관리할 책임은 이용자에게 있습니다. 계정의 무단 사용이나 보안 문제가 의심되면 즉시 PagerWho에 알려야 합니다. 하나의 계정을 여러 사람이 공유하거나 다른 사람을 사칭해서는 안 됩니다.",
          ],
        },
        {
          title: "3. 허용되는 이용",
          items: [
            "법률을 위반하거나 타인의 권리를 침해하는 행위",
            "서비스, 계정 또는 시스템에 대한 무단 접근이나 보안 우회 시도",
            "악성 코드, 스팸 또는 서비스 운영을 방해하는 트래픽 전송",
            "허가 없이 서비스의 취약점을 탐색하거나 과도한 부하를 유발하는 행위",
            "서비스를 이용해 오해를 유발하거나 유해한 알림을 발송하는 행위",
          ],
          body: ["PagerWho는 합법적인 인시던트 대응과 운영 협업 목적으로 사용해야 하며, 다음 행위를 해서는 안 됩니다."],
        },
        {
          title: "4. 서비스 변경 및 가용성",
          body: [
            "PagerWho는 기능을 추가, 변경 또는 중단할 수 있습니다. 안정적인 제공을 위해 노력하지만 서비스가 항상 중단이나 오류 없이 제공된다고 보장하지 않습니다. 유지보수, 장애, 보안 문제 또는 외부 서비스의 영향으로 이용이 제한될 수 있습니다.",
          ],
        },
        {
          title: "5. 데이터 및 제3자 서비스",
          body: [
            "이용자는 서비스에 입력하거나 연동하는 데이터에 필요한 권리를 보유해야 합니다. PagerWho는 서비스 제공과 보호를 위해 해당 데이터를 처리합니다. Google OIDC, 메시지 전송 또는 기타 연동 서비스에는 각 제공자의 약관과 정책이 별도로 적용되며, 그 제공자의 서비스 변경이나 장애는 PagerWho의 통제 밖에 있을 수 있습니다.",
          ],
        },
        {
          title: "6. 지식재산권",
          body: [
            "이용자가 제공한 데이터에 대한 권리는 이용자에게 유지됩니다. PagerWho 서비스, 소프트웨어, 상표, 디자인 및 관련 콘텐츠에 대한 권리는 PagerWho 또는 정당한 권리자에게 있습니다. 본 약관은 서비스를 허용된 방식으로 이용할 제한적 권리만 부여합니다.",
          ],
        },
        {
          title: "7. 보증 부인 및 책임 제한",
          body: [
            "서비스는 관련 법률이 허용하는 범위에서 현재 상태로 제공됩니다. PagerWho는 특정 목적 적합성, 무중단 운영 또는 모든 알림의 성공적인 전달을 보장하지 않습니다. 이용자는 PagerWho를 유일한 생명·안전 또는 긴급 통신 수단으로 의존해서는 안 됩니다.",
            "관련 법률이 허용하는 최대 범위에서 PagerWho는 간접적, 부수적, 특별 또는 결과적 손해와 데이터·수익·영업 기회의 손실에 책임을 지지 않습니다. 법률상 배제할 수 없는 책임에는 이 제한이 적용되지 않습니다.",
          ],
        },
        {
          title: "8. 이용 중단 및 종료",
          body: [
            "이용자는 언제든 서비스 이용 중단 또는 계정 삭제를 요청할 수 있습니다. PagerWho는 약관 위반, 보안 위험, 법적 요구 또는 서비스 보호를 위해 필요할 경우 계정이나 접근을 제한 또는 종료할 수 있습니다. 가능한 경우 적절한 안내를 제공합니다.",
          ],
        },
        {
          title: "9. 약관 변경 및 문의",
          body: [
            `약관을 변경할 경우 이 페이지의 최종 수정일을 갱신하고, 중요한 변경은 합리적인 방법으로 알립니다. 약관에 관한 문의는 ${contactEmail}으로 보내주세요.`,
          ],
        },
      ],
    },
    en: {
      back: "Back to PagerWho",
      effectiveDate: `Effective date: ${effectiveDate}`,
      lastUpdated: `Last updated: ${effectiveDate}`,
      title: "Terms of Service",
      intro: "These terms describe the conditions for using PagerWho. By using the service, you agree to these terms and the Privacy Policy.",
      sections: [
        {
          title: "1. Eligibility and acceptance",
          body: ["You must be able to enter into a contract under applicable law. If you use the service for an organization, you confirm that you have authority to bind it to these terms. Do not use the service if you do not agree."],
        },
        {
          title: "2. Accounts and security",
          body: ["You are responsible for keeping account information accurate and securing your sign-in method and sessions. Notify PagerWho promptly if you suspect unauthorized use or a security issue. Do not share one account among multiple people or impersonate another person."],
        },
        {
          title: "3. Acceptable use",
          body: ["Use PagerWho for lawful incident response and operational collaboration. You must not:"],
          items: [
            "Violate the law or another person's rights",
            "Attempt unauthorized access to or bypass the security of services, accounts, or systems",
            "Transmit malware, spam, or traffic that disrupts the service",
            "Probe for vulnerabilities without permission or cause excessive load",
            "Use the service to send misleading or harmful notifications",
          ],
        },
        {
          title: "4. Service changes and availability",
          body: ["PagerWho may add, change, or discontinue features. We work to provide a reliable service, but do not guarantee uninterrupted or error-free operation. Maintenance, outages, security events, or third-party services may limit availability."],
        },
        {
          title: "5. Data and third-party services",
          body: ["You must have the necessary rights to data you submit or connect. PagerWho processes that data to provide and protect the service. Google OIDC, messaging, and other integrations are also governed by their providers' terms and policies, and changes or failures in those services may be outside PagerWho's control."],
        },
        {
          title: "6. Intellectual property",
          body: ["You retain rights in data you provide. PagerWho and its licensors retain rights in the service, software, trademarks, designs, and related content. These terms grant only a limited right to use the service as permitted."],
        },
        {
          title: "7. Disclaimers and limitation of liability",
          body: [
            "To the extent permitted by law, the service is provided as-is. PagerWho does not guarantee fitness for a particular purpose, uninterrupted operation, or successful delivery of every alert. Do not rely on PagerWho as the sole means of life-safety or emergency communication.",
            "To the maximum extent permitted by law, PagerWho is not liable for indirect, incidental, special, or consequential damages, or for lost data, revenue, or business opportunity. This limitation does not apply to liability that cannot lawfully be excluded.",
          ],
        },
        {
          title: "8. Suspension and termination",
          body: ["You may stop using the service or request account deletion at any time. PagerWho may restrict or terminate an account or access when necessary for a terms violation, security risk, legal requirement, or protection of the service. We will provide reasonable notice when practicable."],
        },
        {
          title: "9. Changes and contact",
          body: [`When these terms change, we will update the last-updated date and provide reasonable notice of material changes. For questions, contact ${contactEmail}.`],
        },
      ],
    },
  },
};

export function LegalPage({ document: documentType }: { document: LegalDocument }) {
  const { i18n } = useTranslation();
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) === "ko" ? "ko" : "en";
  const content = copy[documentType][locale];

  useEffect(() => {
    document.title = `${content.title} · PagerWho`;

    return () => {
      document.title = "PagerWho";
    };
  }, [content.title]);

  return (
    <main className="min-h-screen bg-canvas pb-24 text-ink [&:lang(ko)]:break-keep">
      <header className="border-b border-hairline-soft bg-canvas/88 backdrop-blur-[18px]">
        <div className="mx-auto flex min-h-16 max-w-260 items-center justify-between gap-4 px-5 py-3 sm:px-7.5">
          <Link className="inline-flex items-center gap-2.5 text-[15px] font-bold leading-none no-underline" to="/">
            <BrandMark />
            <span>Pager Who</span>
          </Link>
          <ThemeToggleButton />
        </div>
      </header>

      <article className="mx-auto grid max-w-210 gap-10 px-5 pb-12 pt-10 sm:px-7.5 sm:pt-16">
        <header className="grid gap-5 border-b border-hairline-soft pb-8">
          <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-ink-muted no-underline hover:text-ink" to="/">
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.2} />
            {content.back}
          </Link>
          <div className="grid gap-3">
            <h1 className="m-0 text-[36px] font-[650] leading-tight text-ink sm:text-[48px]">{content.title}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-subtle">
              <span>{content.effectiveDate}</span>
              <span>{content.lastUpdated}</span>
            </div>
          </div>
          <p className="m-0 max-w-180 text-base leading-7 text-ink-muted sm:text-lg">{content.intro}</p>
        </header>

        <div className="grid gap-9">
          {content.sections.map((section) => (
            <section className="grid gap-3" key={section.title}>
              <h2 className="m-0 text-xl font-[650] leading-snug text-ink sm:text-2xl">{section.title}</h2>
              {section.body?.map((paragraph) => (
                <PolicyParagraph key={paragraph} text={paragraph} />
              ))}
              {section.items ? (
                <ul className="m-0 grid gap-2 pl-5 text-[15px] leading-7 text-ink-muted marker:text-accent sm:text-base">
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className="border-t border-hairline-soft pt-6 text-sm text-ink-subtle">
          <Link className="font-semibold text-ink-muted no-underline hover:text-ink" to={documentType === "privacy" ? "/terms" : "/privacy"}>
            {documentType === "privacy"
              ? locale === "ko" ? "서비스 이용약관" : "Terms of Service"
              : locale === "ko" ? "개인정보처리방침" : "Privacy Policy"}
          </Link>
        </footer>
      </article>
    </main>
  );
}

function PolicyParagraph({ text }: { text: string }) {
  if (!text.includes(contactEmail)) {
    return <p className="m-0 text-[15px] leading-7 text-ink-muted sm:text-base">{text}</p>;
  }

  const [before, after] = text.split(contactEmail);

  return (
    <p className="m-0 text-[15px] leading-7 text-ink-muted sm:text-base">
      {before}
      <a className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent" href={`mailto:${contactEmail}`}>{contactEmail}</a>
      {after}
    </p>
  );
}
