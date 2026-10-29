import type { DocsSection } from "./docsContent";

export type DocsTranslation = {
  description: string;
  readingTime: string;
  sections: DocsSection[];
  title: string;
};

type TranslationMap = Record<string, DocsTranslation>;

export const koDocs: TranslationMap = {
  "getting-started": {
    title: "PagerWho 시작하기",
    description: "프로젝트를 만들고 첫 알림 흐름을 처음부터 끝까지 확인합니다.",
    readingTime: "8분",
    sections: [
      { heading: "설정할 항목", paragraphs: ["PagerWho 프로젝트에는 서비스, 온콜 일정, 에스컬레이션 정책과 하나 이상의 알림 프로바이더가 필요합니다. 뒤 단계에서 앞서 만든 리소스를 참조할 수 있도록 이 순서대로 설정하세요."], bullets: ["인시던트 대응 리소스를 담을 프로젝트", "수신 Webhook 엔드포인트가 있는 서비스", "한 명 이상의 참여자가 있는 온콜 일정", "서비스에 연결된 에스컬레이션 정책", "예상 담당자에게 전달되는 테스트 인시던트"] },
      { heading: "프로젝트 설정", steps: [
        { title: "프로젝트 생성 또는 선택", body: "Projects에서 프로젝트를 만들고 알아보기 쉬운 이름을 지정합니다. 선택한 프로젝트에 따라 앱에 표시되는 모든 리소스가 바뀝니다." },
        { title: "담당자 초대", body: "Project settings → Access에서 인시던트를 받거나 처리할 사용자를 초대하고 필요한 역할만 부여합니다." },
        { title: "서비스 생성", body: "Services에서 모니터링할 시스템을 만듭니다. 서비스와 함께 수신 Webhook 엔드포인트가 생성됩니다." },
        { title: "대응 경로 구성", body: "온콜 일정을 만든 다음 사용자, 팀 또는 일정을 대상으로 하는 에스컬레이션 정책을 만들고 서비스에 연결합니다." },
        { title: "전송 설정", body: "Project settings → Providers에서 조직 소유의 Slack, SMTP 또는 Twilio 자격 증명을 설정합니다." },
        { title: "테스트 알림 전송", body: "Webhook에 샘플 이벤트를 보내 인시던트 생성, 알림, 확인과 해결 흐름을 검증합니다." },
      ] },
      { heading: "설정 완료 확인", bullets: ["서비스에 에스컬레이션 정책이 표시됨", "일정 미리보기에 예상 담당자가 표시됨", "하나 이상의 알림 프로바이더가 활성화되고 테스트됨", "Webhook 요청이 올바른 서비스에 인시던트를 생성함", "담당자가 인시던트를 확인하고 해결할 수 있음"], note: "PagerWho를 생명·안전 또는 긴급 통신을 위한 유일한 수단으로 사용하지 마세요." },
    ],
  },
  "services-and-webhooks": {
    title: "서비스와 수신 Webhook", description: "모니터링 도구를 연결하고 이벤트를 중복 제거된 인시던트로 전환합니다.", readingTime: "9분",
    sections: [
      { heading: "알림 수신 방식", paragraphs: ["서비스는 팀이 운영하는 시스템을 나타냅니다. 각 Webhook 엔드포인트는 하나의 서비스에 속하며, 해당 엔드포인트로 생성된 알림은 서비스의 에스컬레이션 정책과 대응 설정을 따릅니다.", "PagerWho는 event_key와 fingerprint를 사용해 반복 전송이 불필요한 중복 인시던트를 만들지 않도록 합니다."] },
      { heading: "이벤트 전송", code: `POST <webhook URL>\nContent-Type: application/json\n\n{\n  "event_key": "checkout-api/latency",\n  "title": "Checkout latency is above threshold",\n  "severity": "high",\n  "source": "monitoring",\n  "dedup_key": "checkout-api-latency"\n}`, bullets: ["같은 문제의 반복 보고에는 안정적인 dedup_key 사용", "새 전송에는 새로운 event_key 사용", "엔드포인트 URL과 비밀값은 발신 시스템의 자격 증명으로 보관"] },
      { heading: "엔드포인트 교체 또는 비활성화", steps: [{ title: "대체 엔드포인트 먼저 준비", body: "모니터링 시스템을 변경하기 전에 비밀값을 회전하거나 대체 엔드포인트를 만듭니다." }, { title: "발신 시스템 업데이트", body: "발신 측 URL 또는 비밀값을 교체하고 테스트 이벤트를 보냅니다." }, { title: "이전 경로 제거", body: "새 전송이 PagerWho에 표시된 뒤에만 이전 엔드포인트를 비활성화합니다." }], note: "Webhook URL과 비밀값은 자격 증명입니다. 티켓, 채팅 또는 공개 로그에 붙여 넣지 마세요." },
    ],
  },
  incidents: {
    title: "인시던트 대응", description: "인시던트 상태, 우선순위, 확인과 해결 방식을 이해합니다.", readingTime: "7분",
    sections: [
      { heading: "인시던트 수명 주기", steps: [{ title: "발생", body: "PagerWho가 알림을 수신하고 설정된 에스컬레이션을 시작했습니다." }, { title: "확인", body: "담당자가 대응을 맡았습니다. 해당되는 경우 대기 중인 에스컬레이션과 알림이 중단됩니다." }, { title: "해결", body: "활성 대응이 완료되었습니다. 인시던트를 닫기 전에 타임라인에 필요한 정보를 남기세요." }] },
      { heading: "우선순위와 심각도", paragraphs: ["심각도는 알림 소스가 보고한 영향을, 우선순위는 팀이 정한 대응 긴급도를 나타냅니다."], bullets: ["P1: 즉시 협업 대응", "P2: 중대한 영향에 대한 긴급 대응", "P3: 운영 중 빠른 조사", "P4–P5: 낮은 긴급도 또는 후속 작업"] },
      { heading: "안전하게 확인하기", bullets: ["실제로 대응할 수 있을 때 확인", "서비스, 알림 소스와 타임라인 검토", "추가 담당자가 필요하면 수동 에스컬레이션 사용", "상태가 안정된 뒤에만 해결 처리"] },
    ],
  },
  "on-call": {
    title: "온콜 일정", description: "로테이션을 구성하고 담당 범위를 미리 보며 임시 오버라이드를 추가합니다.", readingTime: "8분",
    sections: [
      { heading: "예측 가능한 담당 범위 만들기", paragraphs: ["일정은 특정 시점의 담당자를 계산합니다. 기본 및 보조 로테이션을 포함하고 팀이나 서비스에 연결할 수 있습니다."], steps: [{ title: "시간대 선택", body: "로테이션을 관리하는 시간대를 사용하고 일광 절약 시간 전환을 검토합니다." }, { title: "참여자 추가", body: "승인된 프로젝트 멤버 중 온콜 참여 권한이 있는 사용자만 선택할 수 있습니다." }, { title: "교대 설정", body: "시작 시간과 로테이션 간격을 정하고 일관된 교대 시간을 유지합니다." }, { title: "미리보기 확인", body: "에스컬레이션 정책에 연결하기 전에 현재와 다음 담당자를 확인합니다." }] },
      { heading: "임시 변경에 오버라이드 사용", paragraphs: ["오버라이드는 기본 로테이션을 변경하지 않고 지정한 기간의 담당자를 교체합니다."], bullets: ["시작과 종료 시간을 명확히 지정", "기본 또는 보조 레이어 선택", "대체 사용자가 활성 프로젝트 멤버인지 확인", "저장 전 겹치는 오버라이드 검토"] },
    ],
  },
  "escalation-policies": {
    title: "에스컬레이션 정책", description: "사용자, 팀과 온콜 일정을 통해 알림을 라우팅합니다.", readingTime: "10분",
    sections: [
      { heading: "에스컬레이션 경로 설계", paragraphs: ["에스컬레이션 정책은 순서가 있는 알림 단계입니다. 각 단계는 대상과 다음 단계로 넘어가기 전 대기 시간을 정의합니다."], steps: [{ title: "주 담당자 알림", body: "서비스를 책임지는 온콜 일정이나 담당자로 시작합니다." }, { title: "더 넓은 그룹으로 확대", body: "첫 단계가 제때 확인되지 않으면 팀이나 보조 일정을 사용합니다." }, { title: "적절한 지연 설정", body: "긴급 인시던트를 방치하지 않으면서 전송과 대응에 필요한 시간을 허용합니다." }, { title: "반복 여부 결정", body: "반복 알림이 운영상 유용할 때만 사용하고 유한한 반복 횟수를 설정합니다." }] },
      { heading: "대상 동작", bullets: ["사용자 대상은 승인된 해당 멤버에게 알림", "팀 대상은 유효한 팀 멤버로 확장", "일정 대상은 실행 시점의 활성 참여자를 선택", "비어 있거나 라우팅할 수 없는 대상도 Worker를 중단하지 않고 기록"], note: "멤버십, 일정 또는 프로바이더가 바뀐 뒤 정책을 다시 테스트하세요." },
    ],
  },
  "notification-providers": {
    title: "알림 프로바이더", description: "조직 소유 계정으로 Slack, SMTP 이메일과 Twilio를 설정합니다.", readingTime: "11분",
    sections: [
      { heading: "자체 프로바이더 사용", paragraphs: ["PagerWho는 프로젝트에 설정된 자격 증명으로 알림을 보냅니다. 사용량, 결제, 발신자 검증, 전송률과 프로바이더 정책은 해당 계정 소유자가 관리합니다."] },
      { heading: "SMTP 이메일", bullets: ["메일 제공자가 제공한 SMTP 호스트, 포트, 사용자 이름과 비밀번호 입력", "Google, Naver 등이 요구하면 앱 비밀번호 사용", "일반 연결을 TLS로 전환하면 STARTTLS, 처음부터 암호화하면 TLS 선택", "From email은 SMTP 계정 또는 인증된 도메인에서 허용되어야 함", "인시던트 알림에 사용하기 전에 프로바이더 테스트 실행"] },
      { heading: "Slack과 Twilio", bullets: ["Slack에는 유효한 프로젝트 소유 연동과 대상 설정 필요", "Twilio는 조직 소유의 Account SID, Auth Token과 발신자 사용", "수신 전화번호와 사용자 알림 연락처는 별도 설정", "노출된 자격 증명은 프로바이더에서 먼저 회전한 뒤 PagerWho 업데이트"] },
    ],
  },
  workflows: {
    title: "Workflow 자동화", description: "프로젝트 이벤트에서 조건부 Action을 실행하고 반복 루프를 방지합니다.", readingTime: "13분",
    sections: [
      { heading: "Workflow 모델", bullets: ["Trigger: 평가를 시작하는 프로젝트 이벤트", "Filter: 이벤트 데이터에 적용하는 equals, in 또는 exists 검사", "Condition: Action 그래프의 true/false 분기", "Action: HTTP 호출 또는 지원되는 PagerWho 작업", "Run-as user: 각 Action을 현재 권한으로 승인하는 프로젝트 멤버"] },
      { heading: "빌드와 테스트", steps: [{ title: "구체적인 Trigger 선택", body: "자동화를 나타내는 가장 좁은 이벤트와 리소스 유형으로 시작합니다." }, { title: "Filter 추가", body: "관련 없는 이벤트가 실행을 만들지 않도록 안정적인 메타데이터를 필터링합니다." }, { title: "모든 분기 연결", body: "Condition이나 외부 요청이 실패할 수 있다면 성공과 실패 경로를 모두 정의합니다." }, { title: "테스트 실행", body: "현재 프로젝트의 리소스를 선택하고 실행 기록에서 모든 Action 결과를 확인합니다." }, { title: "검증 후 활성화", body: "비활성 Workflow는 수동 테스트할 수 있지만 실제 이벤트에서는 실행되지 않습니다." }] },
      { heading: "이전 출력 사용", code: `{{event.metadata.priority}}\n{{actions.create_service.output.service.id}}\n{{actions.http_request.output.status}}`, paragraphs: ["템플릿은 이벤트 필드와 앞서 성공한 Action의 출력을 읽을 수 있습니다."] },
      { heading: "안전 경계", bullets: ["다른 프로젝트의 리소스를 대상으로 사용할 수 없음", "Action 실행 시 권한을 다시 확인", "Workflow가 만든 이벤트는 새 Trigger로 소비하지 않음", "동일 이벤트의 중복 처리가 중복 실행을 만들지 않음", "HTTP timeout과 오류를 실행 기록에 저장"] },
    ],
  },
  "roles-and-permissions": {
    title: "역할과 권한", description: "멤버에게 업무에 필요한 프로젝트 접근 권한만 부여합니다.", readingTime: "7분",
    sections: [
      { heading: "일반 프로젝트 역할", bullets: ["Project Owner: 소유권 관련 변경을 포함한 전체 프로젝트 제어", "Project Admin: 플랫폼 관리 권한을 제외한 프로젝트 설정", "Viewer: 프로젝트 데이터 읽기 전용", "Incident Responder: 인시던트 확인과 해결", "Notification Recipient: 알림 라우팅 대상", "On-call Participant: 일정 로테이션 참여", "Service Manager: 서비스와 Webhook 관리"] },
      { heading: "최소 권한 적용", paragraphs: ["역할은 기존 세션을 포함해 다음 요청부터 적용됩니다. 자동화도 run-as 사용자의 현재 권한을 사용합니다."], bullets: ["Project Owner를 최소 한 명 유지", "알림 수신만을 위해 Project Admin을 부여하지 않기", "멤버 제거 또는 역할 변경 전 run-as 사용자 검토", "Platform Admin은 일반 프로젝트 관리자와 별도"] },
    ],
  },
  troubleshooting: {
    title: "문제 해결", description: "알림, 통지 또는 Workflow가 실행되지 않을 때 원인을 찾습니다.", readingTime: "12분",
    sections: [
      { heading: "알림이 인시던트를 만들지 않음", bullets: ["Webhook 엔드포인트가 활성 상태이며 올바른 서비스에 속하는지 확인", "URL, 인증 비밀값, Content-Type과 JSON body 확인", "테스트 재전송 시 새로운 event_key 사용", "같은 dedup_key가 기존 열린 인시던트를 갱신했는지 확인"] },
      { heading: "알림이 전송되지 않음", bullets: ["서비스에 에스컬레이션 정책이 있는지 확인", "대상이 유효한 멤버로 해석되는지 확인", "수신자 이메일, Slack 또는 전화 연락처 확인", "Operations에서 프로바이더 테스트와 전송 로그 확인", "프로바이더 거부, rate limit, 발신자 인증과 잔액 확인"] },
      { heading: "Workflow가 실행되지 않음", bullets: ["Workflow가 활성화되었는지 확인", "이벤트 Action, 리소스 유형과 Filter 값 비교", "Trigger가 시작 Action에 연결되었는지 확인", "run-as 사용자의 멤버십과 권한 확인", "실행 기록에서 실패 Action, HTTP 상태 또는 timeout 확인"] },
      { heading: "지원 요청", paragraphs: ["대략적인 시간, 프로젝트와 리소스 이름, 예상 동작과 표시된 오류 코드를 포함하세요. 공개 Discord 채널에 비밀번호, Webhook 비밀값, 토큰, 사용자 원본 데이터 또는 전체 요청 payload를 보내지 마세요."] },
    ],
  },
};

export const zhDocs: TranslationMap = {
  "getting-started": { title: "开始使用 PagerWho", description: "创建项目并验证第一条完整的告警流程。", readingTime: "8 分钟", sections: [
    { heading: "需要配置的内容", paragraphs: ["一个可用的 PagerWho 项目需要服务、值班计划、升级策略和至少一个通知提供商。请按此顺序配置，以便后续步骤引用已创建的资源。"], bullets: ["用于存放响应资源的项目", "带有传入 Webhook 的服务", "至少包含一名参与者的值班计划", "连接到服务的升级策略", "能够送达预期响应人的测试事件"] },
    { heading: "配置项目", steps: [{ title: "创建或选择项目", body: "在 Projects 中创建项目并使用易于识别的名称。当前项目决定应用中显示的所有资源。" }, { title: "邀请响应人", body: "在 Project settings → Access 中邀请成员，并仅授予其工作所需的角色。" }, { title: "创建服务", body: "在 Services 中创建要监控的系统。PagerWho 会为该服务创建传入 Webhook。" }, { title: "构建响应路径", body: "创建值班计划和面向用户、团队或计划的升级策略，然后连接到服务。" }, { title: "配置发送渠道", body: "在 Project settings → Providers 中配置组织拥有的 Slack、SMTP 或 Twilio 凭据。" }, { title: "发送测试告警", body: "向 Webhook 发送示例事件，并确认事件创建、通知、确认和解决流程。" }] },
    { heading: "确认配置完成", bullets: ["服务显示升级策略", "计划预览显示预期响应人", "至少一个通知提供商已启用并测试", "Webhook 在正确服务中创建事件", "响应人可以确认并解决事件"], note: "请勿将 PagerWho 作为生命安全或紧急通信的唯一渠道。" },
  ] },
  "services-and-webhooks": { title: "服务和传入 Webhook", description: "连接监控工具，并将事件转换为去重后的事故。", readingTime: "9 分钟", sections: [
    { heading: "告警接入方式", paragraphs: ["服务代表团队所运营的系统。每个 Webhook 端点属于一个服务，通过该端点创建的告警会继承服务的升级策略和响应配置。", "PagerWho 使用 event_key 和 fingerprint 防止重复投递产生不必要的重复事故。"] },
    { heading: "发送事件", code: `POST <webhook URL>\nContent-Type: application/json\n\n{\n  "event_key": "checkout-api/latency",\n  "title": "Checkout latency is above threshold",\n  "severity": "high",\n  "source": "monitoring",\n  "dedup_key": "checkout-api-latency"\n}`, bullets: ["同一问题的重复报告使用稳定的 dedup_key", "新的投递使用新的 event_key", "将端点 URL 和密钥作为发送系统的凭据保存"] },
    { heading: "轮换或禁用端点", steps: [{ title: "先创建替代端点", body: "更改监控系统之前，先轮换密钥或创建替代端点。" }, { title: "更新发送方", body: "替换发送系统中的 URL 或密钥并发送测试事件。" }, { title: "移除旧路径", body: "确认新投递出现在 PagerWho 后，再禁用旧端点。" }], note: "Webhook URL 和密钥属于凭据，请勿粘贴到工单、聊天或公开日志中。" },
  ] },
  incidents: { title: "响应事故", description: "了解事故状态、优先级、确认和解决流程。", readingTime: "7 分钟", sections: [
    { heading: "事故生命周期", steps: [{ title: "已触发", body: "PagerWho 已收到告警并启动配置的升级路径。" }, { title: "已确认", body: "响应人已接手处理；适用时会停止待处理升级和通知。" }, { title: "已解决", body: "主动响应已完成。关闭前请在时间线中保留必要信息。" }] },
    { heading: "优先级和严重性", paragraphs: ["严重性描述告警源报告的影响，优先级表示团队设定的响应紧迫程度。"], bullets: ["P1：立即协同响应", "P2：对重大影响进行紧急响应", "P3：在运营期间尽快调查", "P4–P5：较低紧迫度或后续工作"] },
    { heading: "安全地确认", bullets: ["仅在能够实际响应时确认", "检查服务、告警源和时间线", "需要其他人员时使用手动升级", "状态稳定后再解决"] },
  ] },
  "on-call": { title: "值班计划", description: "建立轮换、预览覆盖并添加临时替班。", readingTime: "8 分钟", sections: [
    { heading: "建立可预测的覆盖", paragraphs: ["计划用于计算特定时间的负责人，可包含主轮换和备用轮换，并可关联团队或服务。"], steps: [{ title: "选择时区", body: "使用管理轮换的时区，并检查夏令时切换。" }, { title: "添加参与者", body: "只能选择已加入项目且拥有值班参与权限的成员。" }, { title: "设置交接", body: "选择开始时间和轮换间隔，并保持稳定的交接时间。" }, { title: "检查预览", body: "连接升级策略前，确认当前和下一位响应人。" }] },
    { heading: "使用替班处理临时变更", paragraphs: ["替班会在指定时间段内替换负责人，而不修改基础轮换。"], bullets: ["明确设置开始和结束时间", "选择主层或备用层", "确认替代用户仍是活跃项目成员", "保存前检查重叠替班"] },
  ] },
  "escalation-policies": { title: "升级策略", description: "通过用户、团队和值班计划路由通知。", readingTime: "10 分钟", sections: [
    { heading: "设计升级路径", paragraphs: ["升级策略是一组有序的通知步骤，每一步都定义目标以及进入下一步前的等待时间。"], steps: [{ title: "通知主要负责人", body: "从负责该服务的值班计划或响应人开始。" }, { title: "扩大到更广的群组", body: "第一步未及时确认时，使用团队或备用计划。" }, { title: "设置合理延迟", body: "为投递和响应留出时间，同时避免紧急事故无人处理。" }, { title: "决定是否重复", body: "仅在重复通知有运营价值时启用，并设置有限次数。" }] },
    { heading: "目标行为", bullets: ["用户目标通知对应的已加入成员", "团队目标展开为有效团队成员", "计划目标在执行时选择当前参与者", "空目标或无法路由的目标会被记录且不会中断 Worker"], note: "成员、计划或提供商变更后请重新测试策略。" },
  ] },
  "notification-providers": { title: "通知提供商", description: "使用组织自己的账户配置 Slack、SMTP 邮件和 Twilio。", readingTime: "11 分钟", sections: [
    { heading: "自带提供商", paragraphs: ["PagerWho 使用项目中配置的凭据发送通知。用量、计费、发件人验证、可达性和提供商政策由账户所有者负责。"] },
    { heading: "SMTP 邮件", bullets: ["输入邮件提供商提供的主机、端口、用户名和密码", "Google、Naver 等要求时使用应用密码", "普通连接升级为 TLS 时选择 STARTTLS，从一开始加密时选择 TLS", "From email 必须被 SMTP 账户或已验证域名允许", "用于事故通知前先执行提供商测试"] },
    { heading: "Slack 和 Twilio", bullets: ["Slack 需要项目拥有的有效集成和目标配置", "Twilio 使用组织拥有的 Account SID、Auth Token 和发件号码", "收件电话号码和用户通知联系方式需单独配置", "凭据泄露后先在提供商处轮换，再立即更新 PagerWho"] },
  ] },
  workflows: { title: "Workflow 自动化", description: "从项目事件运行条件 Action，并避免循环触发。", readingTime: "13 分钟", sections: [
    { heading: "Workflow 模型", bullets: ["Trigger：开始评估的项目事件", "Filter：针对事件数据的 equals、in 或 exists 检查", "Condition：Action 图中的 true/false 分支", "Action：HTTP 调用或受支持的 PagerWho 操作", "Run-as user：以当前权限授权每个 Action 的项目成员"] },
    { heading: "构建和测试", steps: [{ title: "选择具体 Trigger", body: "从最能代表自动化的具体事件和资源类型开始。" }, { title: "添加 Filter", body: "对稳定的事件元数据进行过滤，避免无关事件创建执行。" }, { title: "连接所有分支", body: "当条件或外部请求可能失败时，同时定义成功和失败路径。" }, { title: "运行测试", body: "选择当前项目的资源，并在执行历史中检查每个 Action 的结果。" }, { title: "验证后启用", body: "禁用的 Workflow 可以手动测试，但不会由实时事件运行。" }] },
    { heading: "使用之前的输出", code: `{{event.metadata.priority}}\n{{actions.create_service.output.service.id}}\n{{actions.http_request.output.status}}`, paragraphs: ["模板可以读取事件字段和之前成功 Action 的输出。"] },
    { heading: "安全边界", bullets: ["Action 不能以其他项目的资源为目标", "执行 Action 时重新检查权限", "Workflow 产生的事件不会作为新 Trigger 消费", "同一事件的重复处理不会创建重复执行", "HTTP 超时和错误会记录在执行历史中"] },
  ] },
  "roles-and-permissions": { title: "角色和权限", description: "仅授予成员完成工作所需的项目访问权限。", readingTime: "7 分钟", sections: [
    { heading: "常用项目角色", bullets: ["Project Owner：完整项目控制，包括所有权相关变更", "Project Admin：不含平台管理的项目配置", "Viewer：只读访问", "Incident Responder：确认和解决事故", "Notification Recipient：可被选择为通知对象", "On-call Participant：可加入计划轮换", "Service Manager：管理服务和 Webhook"] },
    { heading: "应用最小权限", paragraphs: ["角色从下一次请求起生效，包括现有会话。自动化同样使用 run-as 用户的当前权限。"], bullets: ["至少保留一名 Project Owner", "不要仅为接收通知授予 Project Admin", "移除成员或更改角色前检查 run-as 用户", "Platform Admin 与普通项目管理员分离"] },
  ] },
  troubleshooting: { title: "故障排除", description: "当告警、通知或 Workflow 未运行时查找原因。", readingTime: "12 分钟", sections: [
    { heading: "告警未创建事故", bullets: ["确认 Webhook 端点已启用并属于预期服务", "检查 URL、认证密钥、Content-Type 和 JSON body", "重试测试投递时使用新的 event_key", "检查相同 dedup_key 是否更新了已有未关闭事故"] },
    { heading: "通知未送达", bullets: ["确认事故服务已配置升级策略", "确认目标能解析为有效成员", "检查收件人的邮件、Slack 或电话联系方式", "在 Operations 中测试提供商并查看投递日志", "检查提供商拒绝、限流、发件人验证和余额"] },
    { heading: "Workflow 未运行", bullets: ["确认 Workflow 已启用", "比较事件 Action、资源类型和 Filter 值", "确认 Trigger 已连接入口 Action", "检查 run-as 用户仍是项目成员并拥有权限", "在执行历史中查看失败 Action、HTTP 状态或超时"] },
    { heading: "请求支持", paragraphs: ["请提供大致时间、项目和资源名称、预期行为以及可见错误码。不要在公开 Discord 频道发送密码、Webhook 密钥、令牌、原始用户数据或完整请求 payload。"] },
  ] },
};
