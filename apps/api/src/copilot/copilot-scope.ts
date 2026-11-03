import type { CopilotAskRequest, CopilotAskResponse, CopilotLocale } from "@im/contracts";
import { prisma } from "@im/db";

// Cheap pre-filter that stops casual off-topic chat before any paid model call. It is not a security
// boundary: a determined user can add a keyword, so the shared usage budget remains the hard cost cap.
const topicPattern = new RegExp([
  "pagerwho", "copilot", "on[ -]?call", "schedul", "rotation", "shift", "roster", "escalat", "polic", "incident", "outage",
  "alert", "notif", "pag(e|ed|er|ing)\\b", "web[ -]?hook", "payload", "integrat", "servic", "team", "member", "responder",
  "acknowledg", "resolv", "severity", "priority", "rout(e|ing)", "provider", "slack", "sms", "e-?mail", "phone", "time ?zone",
  "project", "setting", "config", "workspace", "audit", "permission", "role", "override", "deliver", "downtime", "monitor",
  "runbook", "postmortem", "server", "\\bapi\\b", "error", "\\bdown\\b", "latency", "timeout", "deploy", "\\back\\b", "\\b5\\d\\d\\b",
  "서버", "에러", "오류", "다운", "지연", "타임아웃", "배포", "먹통",
  "페이저", "코파일럿", "온콜", "당번", "당직", "근무", "교대", "로테이션", "스케줄", "일정", "에스컬레이션", "정책", "인시던트",
  "장애", "이슈", "알림", "알람", "경보", "호출", "웹훅", "웹 후크", "페이로드", "연동", "통합", "서비스", "팀", "멤버", "구성원",
  "담당", "대응", "해결", "심각도", "우선순위", "라우팅", "슬랙", "문자", "이메일", "전화", "시간대", "프로젝트", "설정", "권한",
  "역할", "감사", "발송", "전송", "모니터링",
  "值班", "排班", "轮换", "轮值", "升级", "策略", "事件", "故障", "告警", "报警", "通知", "钩子", "鉤子", "请求体", "集成", "服务",
  "团队", "成员", "负责", "响应", "确认", "解决", "严重", "优先级", "路由", "短信", "邮件", "电话", "时区", "项目", "设置", "配置",
  "权限", "角色", "审计", "监控", "发送", "服务器", "错误", "宕机", "延迟", "超时", "部署",
].join("|"), "i");

export function mentionsCopilotTopic(text: string) {
  return topicPattern.test(text);
}

export async function isWithinCopilotScope(request: CopilotAskRequest & { workspace_id: string }) {
  if (request.structured_input) return true;
  // Recent user turns keep short follow-ups ("10시로 바꿔줘", "yes") in scope.
  const text = [...(request.history ?? []).filter((message) => message.role === "user").slice(-2).map((message) => message.content), request.question].join("\n");
  if (mentionsCopilotTopic(text)) return true;
  // ponytail: substring match on up to 200 names per type; switch to token matching if false accepts matter.
  const workspace = await prisma.workspace.findUnique({ where: { id: request.workspace_id }, select: {
    members: { take: 200, select: { user: { select: { name: true } } } },
    teams: { take: 200, select: { name: true } }, services: { take: 200, select: { name: true } },
    schedules: { take: 200, select: { name: true } }, escalationPolicies: { take: 200, select: { name: true } },
  } });
  if (!workspace) return false;
  const lower = text.toLowerCase();
  return [...workspace.members.map((member) => member.user.name), ...workspace.teams, ...workspace.services, ...workspace.schedules, ...workspace.escalationPolicies]
    .map((entry) => (typeof entry === "string" ? entry : entry.name).trim().toLowerCase())
    .some((name) => name.length >= 2 && lower.includes(name));
}

const outOfScopeAnswers: Record<CopilotLocale, string> = {
  en: "PagerWho Copilot only answers questions about this project's incidents, on-call schedules, escalation policies, services, notifications and settings. Example: \"Who is on call now?\" or \"Why didn't the checkout incident alert arrive?\"",
  ko: "PagerWho Copilot은 이 프로젝트의 인시던트, 온콜 스케줄, 에스컬레이션 정책, 서비스, 알림, 설정에 관한 질문에만 답변합니다. 예: \"지금 온콜 담당자가 누구야?\", \"checkout 인시던트 알림이 왜 안 왔어?\"",
  "zh-CN": "PagerWho Copilot 仅回答与本项目的事件、值班排班、升级策略、服务、通知和设置相关的问题。例如：\"现在谁在值班？\"",
};

export function outOfScopeResponse(locale: CopilotLocale = "en"): CopilotAskResponse {
  return { answer: outOfScopeAnswers[locale], kind: "message", mode: "direct", sources: [] };
}
