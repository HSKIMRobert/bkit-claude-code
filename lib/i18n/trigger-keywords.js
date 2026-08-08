/**
 * Trigger Keywords (generated data, v2.1.34)
 *
 * The 8-language trigger vocabulary for every bkit agent and skill, kept in
 * code so it costs nothing until a prompt is actually routed.
 *
 * ## Why this file exists
 *
 * The same keywords used to live in two places: here, where bkit's
 * UserPromptSubmit intent-router reads them, and in every agent/skill
 * frontmatter `description`, which Claude Code loads into context for the whole
 * session. The frontmatter copy cost roughly 5,800 tokens on every session
 * before the user typed anything, and the code copy covered only 12 of 34
 * agents and 16 of 44 skills — so the expensive copy was the complete one and
 * the free copy was the partial one.
 *
 * This file makes the free copy complete. Frontmatter now carries English
 * triggers only, which is what Claude's own agent selection reads; the other
 * seven languages route through lib/intent/trigger.js, which matches against
 * this table on every prompt. Issue #129, filed by the maintainer and open for
 * seven months.
 *
 * ## `mul`
 *
 * Spanish, French, German and Italian keywords share the Latin script, and the
 * frontmatter they were extracted from did not label them individually. They
 * are grouped under `mul` rather than guessed at. Matching is a union across
 * every key in the map, so grouping changes nothing functionally — it only
 * avoids asserting an attribution nobody verified.
 *
 * ## Regenerating
 *
 * This file is data. Edit it directly; there is no build step to re-run. The
 * one-time extraction that seeded it is recorded in the v2.1.34 CHANGELOG entry.
 *
 * @module lib/i18n/trigger-keywords
 * @version 2.1.34
 * @since 2.1.34
 */

'use strict';

/** Languages that may appear as keys. `mul` = Latin-script non-English. */
const TRIGGER_LANGUAGE_KEYS = Object.freeze(["en","ko","ja","zh","es","fr","de","it","mul"]);

/** @type {Readonly<Object<string, Object<string, string[]>>>} */
const AGENT_TRIGGER_KEYWORDS = Object.freeze({
  "bkend-expert": {
    en: ["bkend","BaaS","backend service","database setup","user auth","file upload","REST API","signup feature","login feature","signup","sign up","auth flow","oauth login","authentication","login","database","fullstack","backend","API integration","data model","presigned url","CRUD"],
    ko: ["bkend","백엔드 서비스","데이터베이스 설정","사용자 인증","파일 업로드","회원가입 기능","로그인 기능","회원가입","회원 가입","로그인 만들","소셜 로그인","인증 흐름","인증","로그인","데이터베이스","풀스택","백엔드"],
    ja: ["bkend","バックエンドサービス","データベース設定","認証設定","ファイルアップロード","会員登録","サインアップ","ログイン機能"],
    zh: ["bkend","后端服务","数据库设置","用户认证","文件上传","注册","登录功能","社交登录","認証","数据库"],
    es: ["bkend","servicio backend","base de datos","autenticación","carga de archivos","registro","iniciar sesion"],
    fr: ["bkend","service backend","base de données","authentification","téléchargement","inscription","connexion"],
    de: ["bkend","Backend-Dienst","Datenbank-Setup","Authentifizierung","Datei-Upload","Registrierung","Anmeldung"],
    it: ["bkend","servizio backend","database","autenticazione","caricamento file","registrazione","accesso"],
    mul: ["autenticacion","authentification","Authentifizierung","autenticazione"],
  },
  "bkit-impact-analyst": {
    en: ["bkit impact","architecture analysis","plugin analysis","impact assessment"],
    ko: ["bkit 영향","아키텍처 분석","플러그인 분석","영향 평가"],
    zh: ["bkit影響","bkit影响"],
    mul: ["impacto bkit","impact bkit","bkit-Auswirkung","impatto bkit"],
  },
  "cc-version-researcher": {
    en: ["CC version","CLI update","version research","changelog","release notes"],
    ko: ["CC 버전","CLI 업데이트","버전 조사","변경사항","릴리스 노트"],
    ja: ["CCバージョン"],
    zh: ["CC版本"],
    mul: ["versión CC","version CC","CC-Version","versione CC"],
  },
  "code-analyzer": {
    en: ["analyze","quality","security","code review","any issues?","code analysis","quality check","security scan","architecture check","any problems?","something wrong?","something off?"],
    ko: ["분석","품질","보안","코드 리뷰","이상해","뭔가 이상해","코드 분석","품질 검사","보안 스캔","괜찮아 보여?"],
    ja: ["分析","品質","セキュリティ","コードレビュー","おかしい","コード分析"],
    zh: ["分析","质量","安全","代码审查","有问题?","代码分析"],
    es: ["analizar","calidad","seguridad","revisión de código","hay problemas?"],
    fr: ["analyser","qualité","sécurité","revue de code","il y a des problèmes?"],
    de: ["analysieren","Qualität","Sicherheit","Code-Review","gibt es Probleme?"],
    it: ["analizzare","qualità","sicurezza","revisione codice","ci sono problemi?"],
    mul: ["il y a des problèmes?","hay problemas?","gibt es Probleme?","ci sono problemi?"],
  },
  "cto-lead": {
    en: ["team","project lead","CTO","team mode","coordinate team","architecture decision","tech lead","team coordination"],
    ko: ["팀장","프로젝트 리드","CTO","팀 구성","팀 모드","기술 결정","팀 조율"],
    ja: ["チーム","チームリード","プロジェクトリード","CTO","チーム編成"],
    zh: ["团队","团队领导","项目负责人","CTO","团队模式","团队协调"],
    es: ["equipo","líder del equipo","CTO","modo equipo"],
    fr: ["équipe","chef d'équipe","CTO","mode équipe"],
    de: ["Team","Teamleiter","CTO","Team-Modus"],
    it: ["team","leader del team","CTO","modalità team"],
    mul: ["coordinación de equipo","chef d'équipe","Teamleiter","coordinamento del team"],
  },
  "design-validator": {
    en: ["design validation","document review","spec check","validate design","review spec"],
    ko: ["설계 검증","문서 검토","스펙 확인"],
    zh: ["設計検証","设计验证"],
    mul: ["validación de diseño","validation de conception","Design-Validierung","validazione del design"],
  },
  "enterprise-expert": {
    en: ["CTO","AI Native","enterprise strategy","microservices","architecture decision"],
    ko: ["전략","아키텍처","마이크로서비스"],
    ja: ["マイクロサービス"],
    zh: ["微服务"],
    mul: ["stratégie d'entreprise","microservicios","Unternehmensstrategie","architettura"],
  },
  "frontend-architect": {
    en: ["frontend","UI architecture","component","React","Next.js","design system"],
    ko: ["프론트엔드","UI 아키텍처","컴포넌트","디자인 시스템","리액트"],
    ja: ["フロントエンド"],
    zh: ["前端架构"],
    mul: ["sistema de diseño","système de design","UI-Architektur","architettura UI"],
  },
  "gap-detector": {
    en: ["verify","check","gap","compare","validate","gap analysis","design-implementation check","compare design","verify implementation","is this right?","is this correct?","does this match?","any issues with this?"],
    ko: ["검증","확인","비교","검사","맞아?","이거 괜찮아?","갭 분석","설계-구현 비교","설계대로야?","문제 없어?"],
    ja: ["検証","確認","ギャップ","比較","正しい?","合ってる?","ギャップ分析"],
    zh: ["验证","确认","差距","比较","对吗?","对不对?","差距分析"],
    es: ["verificar","comprobar","brecha","comparar","está bien?"],
    fr: ["vérifier","contrôler","écart","comparer","c'est correct?"],
    de: ["prüfen","überprüfen","Lücke","vergleichen","ist das richtig?"],
    it: ["verificare","controllare","divario","confrontare","è giusto?"],
    mul: ["è giusto?","es correcto?","c'est correct?","ist das richtig?"],
  },
  "infra-architect": {
    en: ["AWS","Kubernetes","Terraform","infrastructure","CI/CD","EKS","RDS","cloud"],
    ko: ["인프라","쿠버네티스","클라우드"],
    ja: ["インフラ"],
    zh: ["基础设施"],
    mul: ["déploiement","infraestructura","Infrastruktur","infrastruttura"],
  },
  "pdca-iterator": {
    en: ["improve","iterate","fix","auto-fix","optimize","fix this","make it better","automatically fix"],
    ko: ["개선","반복","수정","자동 수정","고쳐줘","개선해줘","반복 개선","고쳐","더 좋게","문제 해결해줘"],
    ja: ["改善","反復","修正","自動修正","直して","もっと良く"],
    zh: ["改进","迭代","修复","自动修复","优化","自動修正","迭代优化"],
    es: ["mejorar","iterar","arreglar","auto-arreglar","optimizar"],
    fr: ["améliorer","itérer","corriger","auto-corriger","optimiser"],
    de: ["verbessern","iterieren","reparieren","auto-reparieren","optimieren"],
    it: ["migliorare","iterare","correggere","auto-correggere","ottimizzare"],
    mul: ["améliorer","mejorar","verbessern","migliorare"],
  },
  "pipeline-guide": {
    en: ["development pipeline","phase","development order","where to start","what to do first","how to begin","new project","project setup"],
    ko: ["개발 파이프라인","뭐부터","어디서부터","순서","시작"],
    ja: ["開発パイプライン"],
    zh: ["开发流程"],
    mul: ["pipeline de développement","pipeline de desarrollo","Entwicklungs-Pipeline","pipeline di sviluppo"],
  },
  "pm-discovery": {
    en: ["opportunity","discovery","OST","customer needs","pain points"],
    ko: ["기회 발견","고객 니즈","페인포인트"],
    zh: ["機会発見","机会发现"],
    mul: ["découverte","descubrimiento","Entdeckung","scoperta"],
  },
  "pm-lead": {
    en: ["pm","product discovery","PRD","market analysis","product management","pm team","PM analysis"],
    ko: ["PM 분석","제품 기획","제품 발견","PM팀","PRD 작성"],
    ja: ["PM分析","プロダクト分析","製品企画","PRD作成"],
    zh: ["产品分析","产品发现","产品管理","PRD编写","PM分析"],
    es: ["análisis PM","descubrimiento de producto","gestión de producto"],
    fr: ["analyse PM","découverte produit","gestion de produit"],
    de: ["PM-Analyse","Produktentdeckung","Produktmanagement"],
    it: ["analisi PM","scoperta prodotto","gestione prodotto"],
    mul: ["PM análisis","analyse PM","PM-Analyse","analisi PM"],
  },
  "pm-prd": {
    en: ["PRD","product requirements","feature spec","beachhead","GTM"],
    ko: ["제품 요구사항","기능 명세","비치헤드"],
    ja: ["プロダクト要件"],
    zh: ["产品需求文档"],
    mul: ["spécification produit","requisitos","Produktanforderungen","specifiche prodotto"],
  },
  "pm-research": {
    en: ["persona","competitor","market size","TAM","SAM","SOM","segmentation"],
    ko: ["페르소나","경쟁사","시장규모"],
    ja: ["ペルソナ"],
    zh: ["用户画像"],
    mul: ["competidor","concurrent","Wettbewerber","concorrente"],
  },
  "pm-strategy": {
    en: ["value proposition","lean canvas","JTBD","business model","strategy"],
    ko: ["가치 제안","비즈니스 모델"],
    zh: ["価値提案","价值主张"],
    mul: ["propuesta de valor","proposition de valeur","Wertversprechen","proposta di valore"],
  },
  "product-manager": {
    en: ["requirements","feature spec","user story","priority","scope","feature definition"],
    ko: ["요구사항","기능 정의","우선순위","범위","사용자 스토리","기능 명세"],
    zh: ["要件定義","需求分析"],
    mul: ["requisitos","exigences","Anforderungen","requisiti"],
  },
  "qa-debug-analyst": {
    en: ["debug analysis","runtime error","logging","debug log"],
    ko: ["디버그 분석"],
    ja: ["デバッグ分析"],
    zh: ["调试分析"],
    mul: ["analisis de debug","analyse de debug","Debug-Analyse","analisi debug"],
  },
  "qa-lead": {
    en: ["qa team","QA lead","test execution","QA phase","QA execution"],
    ko: ["QA 실행","QA팀"],
    ja: ["QAリード"],
    zh: ["QA执行"],
    mul: ["exécution QA","QA ejecucion","QA-Ausfuhrung","esecuzione QA"],
  },
  "qa-monitor": {
    en: ["zero script qa","log-based testing","docker logs","QA","testing","log analysis"],
    ko: ["제로 스크립트 QA","테스트","로그 분석"],
    ja: ["ゼロスクリプトQA"],
    zh: ["零脚本QA"],
    mul: ["QA sin scripts","QA sans script","Script-freies QA","QA senza script"],
  },
  "qa-strategist": {
    en: ["test strategy","QA plan","quality metrics","test plan","verification strategy"],
    ko: ["테스트 전략","QA 계획","품질 기준","검증 전략","테스트 계획"],
    ja: ["テスト戦略"],
    zh: ["测试策略"],
    mul: ["stratégie de test","estrategia de pruebas","Teststrategie","strategia di test"],
  },
  "qa-test-generator": {
    en: ["test generation","generate tests","test code"],
    ko: ["테스트 생성"],
    ja: ["テスト生成"],
    zh: ["测试生成"],
    mul: ["generar pruebas","generer tests","Tests generieren","generare test"],
  },
  "qa-test-planner": {
    en: ["test plan","test planning","QA plan"],
    ko: ["테스트 계획"],
    ja: ["テスト計画"],
    zh: ["测试计划"],
    mul: ["plan de pruebas","plan de test","Testplan","piano di test"],
  },
  "report-generator": {
    en: ["report","summary","status","what did we do?","progress","PDCA report","completion report","status report","progress report","status?","progress?","write report"],
    ko: ["보고서","요약","상태","뭐 했어?","진행 상황","PDCA 보고서","완료 보고서","진행 보고서"],
    ja: ["報告書","要約","状態","何をした?","進捗"],
    zh: ["报告","摘要","状态","做了什么?","进度","PDCA報告書","PDCA报告"],
    es: ["informe","resumen","estado","qué hicimos?","progreso"],
    fr: ["rapport","résumé","statut","qu'avons-nous fait?","progrès"],
    de: ["Bericht","Zusammenfassung","Status","was haben wir?","Fortschritt"],
    it: ["rapporto","riepilogo","stato","cosa abbiamo fatto?","progresso"],
    mul: ["qué hicimos?","qu'avons-nous fait?","was haben wir?","cosa abbiamo fatto?"],
  },
  "security-architect": {
    en: ["security","authentication","vulnerability","OWASP","CSRF","XSS","injection"],
    ko: ["보안","인증","취약점","보안 검토","인가","보안 아키텍처"],
    ja: ["セキュリティ"],
    zh: ["安全"],
    mul: ["sécurité","seguridad","Sicherheit","sicurezza"],
  },
  "self-healing": {
    en: ["self-healing","self heal","auto fix"],
    ko: ["자동 수정"],
    zh: ["自動修復","自动修复"],
    mul: ["auto-réparer","auto-reparar","automatisch reparieren","auto-riparare"],
  },
  "sprint-master-planner": {
    en: ["sprint master plan","sprint planning","sprint plan","sprint design"],
    ko: ["스프린트 마스터 플랜","스프린트 계획","스프린트 설계"],
    ja: ["スプリントマスタープラン","スプリント計画","スプリント設計"],
    zh: ["冲刺主计划","冲刺规划","冲刺设计"],
    es: ["plan maestro sprint","planificacion sprint","diseno sprint"],
    fr: ["plan maitre sprint","planification sprint","conception sprint"],
    de: ["Sprint-Hauptplan","Sprint-Planung","Sprint-Design"],
    it: ["piano principale sprint","pianificazione sprint","progettazione sprint"],
    mul: ["plan maestro sprint","plan maitre sprint","Sprint-Hauptplan","piano principale sprint"],
  },
  "sprint-orchestrator": {
    en: ["sprint orchestrator","sprint orchestration","sprint coordination","sprint lifecycle","sprint cycle","sprint"],
    ko: ["스프린트 조율","스프린트 진행","스프린트 사이클","스프린트 오케스트레이션","스프린트"],
    ja: ["スプリント調整","スプリント進行","スプリントサイクル"],
    zh: ["冲刺协调","冲刺进行","冲刺周期"],
    es: ["orquestador sprint","orquestracion sprint","coordinacion sprint","ciclo sprint"],
    fr: ["orchestrateur sprint","orchestration sprint","coordination sprint","cycle sprint"],
    de: ["Sprint-Orchestrator","Sprint-Orchestrierung","Sprint-Koordination","Sprint-Zyklus"],
    it: ["orchestratore sprint","orchestrazione sprint","coordinamento sprint","ciclo sprint"],
    mul: ["orquestador sprint","orchestrateur sprint","Sprint-Koordination","orchestratore sprint"],
  },
  "sprint-qa-flow": {
    en: ["sprint qa","sprint qa flow","data flow integrity","7 layer qa"],
    ko: ["스프린트 QA","데이터 흐름 검증","7 계층 검증"],
    ja: ["スプリントQA","データフロー検証","7階層検証"],
    zh: ["冲刺QA","数据流验证","7层验证"],
    es: ["QA sprint","integridad flujo datos","verificacion 7 capas"],
    fr: ["QA sprint","integrite flux donnees","verification 7 couches"],
    de: ["Sprint QA","Datenfluss-Integritat","7-Schichten-Verifikation"],
    it: ["QA sprint","integrita flusso dati","verifica 7 livelli"],
    mul: ["integridad flujo datos","integrite flux donnees","Datenfluss-Integritat","integrita flusso dati"],
  },
  "sprint-report-writer": {
    en: ["sprint report","sprint completion","sprint kpi","sprint carry items"],
    ko: ["스프린트 보고서","스프린트 완료","스프린트 KPI","인계 항목"],
    ja: ["スプリントレポート","スプリント完了","スプリントKPI","持ち越し項目"],
    zh: ["冲刺报告","冲刺完成","冲刺KPI","结转项"],
    es: ["reporte sprint","finalizacion sprint","KPI sprint","items pendientes"],
    fr: ["rapport sprint","achevement sprint","KPI sprint","elements reportes"],
    de: ["Sprint-Bericht","Sprint-Abschluss","Sprint-KPI","Ubertragungselemente"],
    it: ["rapporto sprint","completamento sprint","KPI sprint","elementi riportati"],
    mul: ["reporte sprint","rapport sprint","Sprint-Bericht","rapporto sprint"],
  },
  "starter-guide": {
    en: ["help","beginner","first time","how to","explain","first project","new to coding","learn to code","simple website","portfolio","landing page","HTML CSS","help understand","don't understand","confused"],
    ko: ["도움","초보자","처음","어떻게","설명해","모르겠","입문","코딩 배우기","웹사이트 만들기","이해 안 돼","어려워"],
    ja: ["助けて","初心者","初めて","どうやって","説明して","わからない"],
    zh: ["帮助","初学者","第一次","怎么","解释","不懂","初心者","新手"],
    es: ["ayuda","principiante","primera vez","cómo","explicar","no entiendo"],
    fr: ["aide","débutant","première fois","comment","expliquer","je ne comprends pas"],
    de: ["Hilfe","Anfänger","erste Mal","wie","erklären","verstehe nicht"],
    it: ["aiuto","principiante","prima volta","come","spiegare","non capisco"],
    mul: ["débutant","Anfänger","principiante","non capisco"],
  },
});

/** @type {Readonly<Object<string, Object<string, string[]>>>} */
const SKILL_TRIGGER_KEYWORDS = Object.freeze({
  "audit": {
    en: ["audit log","decision trace","session history","audit","log","history"],
    ko: ["감사 로그","결정 추적","세션 이력"],
    ja: ["監査ログ"],
    zh: ["审计日志"],
    es: ["registro de auditoría"],
    fr: ["journal d'audit"],
    de: ["Audit-Log"],
    it: ["registro di controllo"],
  },
  "bkend-auth": {
    en: ["bkend auth","bkend login","bkend signup","bkend JWT","bkend RBAC"],
    ko: ["bkend 인증","bkend 로그인","bkend 회원가입"],
  },
  "bkend-cookbook": {
    en: ["bkend tutorial","bkend cookbook","bkend troubleshooting"],
    ko: ["bkend 튜토리얼","bkend 에러 해결"],
  },
  "bkend-data": {
    en: ["bkend table","bkend CRUD","bkend column","bkend relation","bkend data"],
    ko: ["bkend 테이블","bkend 데이터"],
  },
  "bkend-quickstart": {
    en: ["bkend quickstart","bkend onboarding","bkend setup","bkend MCP"],
    ko: ["bkend 시작하기","bkend 온보딩"],
  },
  "bkend-storage": {
    en: ["bkend file","bkend upload","bkend download","bkend storage","bkend presigned URL"],
    ko: ["bkend 파일 업로드","bkend 스토리지"],
  },
  // Specific phrases only. A bare "기능" (feature/function) or "help" matched
  // any prompt that merely used the word, so the help skill outranked the one
  // the user actually wanted — "회원가입 기능 만들어줘" routed to /bkit instead
  // of /dynamic. A help surface must never be the greediest matcher.
  "bkit": {
    en: ["bkit help","bkit functions","show bkit commands","bkit command list"],
    ko: ["bkit 도움말","기능 목록","bkit 기능"],
    ja: ["bkit ヘルプ","機能一覧"],
    zh: ["bkit 帮助","功能列表"],
    mul: ["lista de funciones","liste des fonctions","Funktionsliste","elenco funzioni"],
  },
  "bkit-evals": {
    en: ["bkit evals","evals run","skill quality","eval runner"],
    ko: ["스킬 평가"],
    zh: ["評価実行","评估运行"],
    mul: ["evaluación","évaluation"],
  },
  "bkit-explore": {
    en: ["bkit explore","list skills","skill discovery","browse skills"],
    ko: ["스킬 탐색"],
    ja: ["スキル探索"],
    zh: ["技能探索"],
    mul: ["explorar","explorer"],
  },
  "bkit-rules": {
    en: ["bkit rules","core rules","methodology"],
    ko: ["핵심 규칙","PDCA 규칙. imports: - ${PLUGIN_ROOT}/templates/shared/naming-conventions.md # hooks: Managed by hooks/hooks.json (pre-write.js"],
    mul: ["unified-write-post.js) - GitHub #9354 workaround"],
  },
  "bkit-templates": {
    en: ["template","plan document","design template"],
    ko: ["템플릿","문서 양식"],
  },
  "btw": {
    en: ["btw","suggestion","improve","idea","feedback","by the way"],
    ko: ["개선","제안","아이디어","피드백","그나저나"],
    ja: ["改善","提案","アイデア","フィードバック","ところで"],
    zh: ["改进","建议","想法","反馈","顺便"],
    mul: ["sugerencia","mejora","suggestion","amélioration","Vorschlag","Verbesserung","suggerimento","miglioramento"],
  },
  "cc-version-analysis": {
    en: ["cc-version-analysis","CC upgrade","version analysis"],
    ko: ["CC 버전 분석","버전 영향"],
  },
  "claude-code-learning": {
    en: ["learn","setup","claude code","optimize"],
    ko: ["학습","설정","최적화"],
  },
  "code-review": {
    en: ["review code","code review","code quality check","quality check","bug detection"],
    ko: ["코드 리뷰","코드 검토","코드 품질","품질 검사"],
    ja: ["コードレビュー"],
    zh: ["代码审查","代码评审"],
    es: ["revisión de código"],
    fr: ["revue de code"],
    de: ["Codeüberprüfung"],
    it: ["revisione del codice"],
  },
  "control": {
    en: ["automation level","control level","trust score","l0 l1 l2 l3 l4","control","guardrail"],
    ko: ["자동화 레벨","제어 레벨","신뢰 점수","제어"],
    ja: ["自動化レベル","制御レベル"],
    zh: ["自动化级别","控制级别"],
    es: ["nivel de automatización"],
    fr: ["niveau d'automatisation"],
    de: ["Automatisierungsstufe"],
    it: ["livello automazione"],
  },
  "deploy": {
    en: ["deploy","release","ship to prod","ship","/pdca deploy"],
    ko: ["배포","릴리스","프로덕션 배포","배포해"],
    ja: ["デプロイ","リリース"],
    zh: ["部署","发布"],
    es: ["desplegar","lanzar"],
    fr: ["déployer","publier"],
    de: ["bereitstellen","veröffentlichen"],
    it: ["distribuire","rilasciare"],
    mul: ["déployer","desplegar","bereitstellen","distribuire"],
  },
  "desktop-app": {
    en: ["desktop app","Electron","Tauri","mac app","windows app"],
    ko: ["데스크톱 앱"],
  },
  "development-pipeline": {
    en: ["development pipeline","where to start","phase"],
    ko: ["개발 파이프라인","순서","시작"],
  },
  "dynamic": {
    en: ["login","fullstack","database","authentication","backend","BaaS","signup","web app"],
    ko: ["로그인","풀스택","데이터베이스","인증","백엔드"],
    ja: ["ログイン","フルスタック","データベース","認証","バックエンド"],
    zh: ["登录","全栈","数据库","认证","后端"],
    es: ["iniciar sesión","fullstack","base de datos","autenticación"],
    fr: ["connexion","fullstack","base de données","authentification"],
    de: ["Anmeldung","Fullstack","Datenbank","Authentifizierung"],
    it: ["accesso","fullstack","database","autenticazione"],
    mul: ["init dynamic"],
  },
  "enterprise": {
    en: ["microservices","kubernetes","k8s","terraform","architecture","monorepo","AI native"],
    ko: ["마이크로서비스","쿠버네티스","테라폼","아키텍처"],
    ja: ["マイクロサービス","クバネティス","テラフォーム","アーキテクチャ"],
    zh: ["微服务","kubernetes","terraform","架构"],
    es: ["microservicios","kubernetes","terraform","arquitectura"],
    fr: ["microservices","kubernetes","terraform","architecture"],
    de: ["Microservices","Kubernetes","Terraform","Architektur"],
    it: ["microservizi","kubernetes","terraform","architettura"],
    mul: ["init enterprise"],
  },
  "mobile-app": {
    en: ["mobile app","react native","flutter","ios","android","Expo"],
    ko: ["모바일 앱","리액트 네이티브","플러터","iOS","안드로이드"],
    ja: ["モバイルアプリ","React Native","Flutter","iOS","Android"],
    zh: ["移动应用","React Native","Flutter","iOS","Android"],
    es: ["aplicación móvil","react native","flutter","ios","android"],
    fr: ["application mobile","react native","flutter","ios","android"],
    de: ["mobile App","React Native","Flutter","iOS","Android"],
    it: ["app mobile","react native","flutter","ios","android"],
  },
  "pdca": {
    en: ["pdca cycle","plan design do","full pdca","pdca workflow","pdca","plan","design","analyze","report","status","next","iterate"],
    ko: ["pdca 사이클","계획 설계 구현","pdca 진행","계획","설계","분석","보고서"],
    ja: ["PDCAサイクル","計画設計実装"],
    zh: ["pdca流程","计划设计实施"],
    es: ["ciclo pdca","plan diseño implementación"],
    fr: ["cycle pdca","plan conception exécution"],
    de: ["pdca zyklus"],
    it: ["ciclo pdca"],
  },
  "pdca-batch": {
    en: ["pdca-batch","batch","multiple features"],
    ko: ["다중 기능","배치"],
  },
  "pdca-fast-track": {
    en: ["pdca fast-track","skip checkpoints","auto approve"],
    ko: ["패스트 트랙"],
    ja: ["ファストトラック"],
    zh: ["快速通道"],
    mul: ["vía rápida"],
  },
  "pdca-watch": {
    en: ["pdca watch","live dashboard","watch progress"],
    ko: ["실시간 대시보드"],
    ja: ["ライブダッシュボード"],
    zh: ["实时仪表板"],
    mul: ["panel en vivo","tableau de bord"],
  },
  "phase-1-schema": {
    en: ["schema","data model","entity","terminology"],
    ko: ["스키마","데이터 모델","용어"],
  },
  "phase-2-convention": {
    en: ["convention","coding style","lint","rules"],
    ko: ["코딩 규칙","컨벤션"],
  },
  "phase-3-mockup": {
    en: ["mockup","prototype","wireframe","UI design"],
    ko: ["목업","프로토타입. agents"],
  },
  "phase-4-api": {
    en: ["api design","rest api","endpoint design","backend api","backend","endpoint"],
    ko: ["api 설계","엔드포인트 설계","rest api 설계","백엔드 API","API 설계. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-4-api.template.md - ${PLUGIN_ROOT}/templates/shared/api-patterns.md - ${PLUGIN_ROOT}/templates/shared/error-handling-patterns.md"],
    ja: ["API設計","エンドポイント設計"],
    zh: ["api 设计","端点设计"],
    es: ["diseño api"],
    fr: ["conception api"],
    de: ["API-Design"],
    it: ["design api"],
  },
  "phase-5-design-system": {
    en: ["design system","component library","design tokens"],
    ko: ["디자인 시스템","컴포넌트. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-5-design-system.template.md agents"],
  },
  "phase-6-ui-integration": {
    en: ["UI integration","frontend-backend","API client"],
    ko: ["프론트엔드 통합","UI 구현. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-6-ui.template.md agents"],
  },
  "phase-7-seo-security": {
    en: ["SEO","security","meta tags","vulnerability"],
    ko: ["검색 최적화","보안. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-7-seo-security.template.md agents"],
  },
  "phase-8-review": {
    en: ["code review","architecture check","quality","gap analysis"],
    ko: ["코드 리뷰","품질 검증. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-8-review.template.md agents"],
  },
  "phase-9-deployment": {
    en: ["deployment","CI/CD","production","Vercel"],
    ko: ["배포","프로덕션. imports: - ${PLUGIN_ROOT}/templates/pipeline/phase-9-deployment.template.md"],
  },
  "plan-plus": {
    en: ["brainstorm plan","deep plan","intent discovery","alternatives exploration","plan-plus","brainstorm","plan plus","intent"],
    ko: ["브레인스토밍","심층 계획","의도 분석","대안 탐색","플랜플러스"],
    ja: ["ブレインストーミング計画","深い計画"],
    zh: ["头脑风暴计划","深入计划"],
    es: ["lluvia de ideas plan","plan profundo"],
    fr: ["brainstorming plan","plan approfondi"],
    de: ["Brainstorming-Plan"],
    it: ["brainstorming piano"],
  },
  "pm-discovery": {
    en: ["product discovery","prd","user research","feature spec","product plan","pm"],
    ko: ["프로덕트 기획","제품 발굴","사용자 리서치","기능 기획","프로덕트 계획","PM 분석","제품 기획"],
    ja: ["プロダクト発見","ユーザーリサーチ","機能仕様"],
    zh: ["产品发现","用户研究","功能规格"],
    es: ["descubrimiento de producto","investigación de usuario"],
    fr: ["découverte produit","recherche utilisateur"],
    de: ["Produktentdeckung","Nutzerforschung"],
    it: ["scoperta prodotto","ricerca utente"],
    mul: ["PM analysis"],
  },
  "qa-phase": {
    en: ["run qa","full qa","test everything","qa phase","quality assurance","qa cycle","QA test","qa run"],
    ko: ["qa 실행","전체 테스트","qa 단계","품질 검증","qa 돌려","qa 돌려봐","qa 해","qa 사이클"],
    ja: ["QA実行","全体テスト","QAを回して","QAフェーズ"],
    zh: ["执行qa","全面测试","运行qa","QA阶段"],
    es: ["ejecutar qa","prueba completa"],
    fr: ["exécuter qa","test complet"],
    de: ["QA ausführen"],
    it: ["esegui qa"],
    mul: ["fase QA","phase QA","QA-Phase"],
  },
  "rollback": {
    en: ["rollback","revert","undo deployment","checkpoint","restore","undo"],
    ko: ["롤백","되돌리","배포 취소","체크포인트","복원"],
    ja: ["ロールバック","元に戻す"],
    zh: ["回滚","撤销"],
    es: ["revertir","deshacer"],
    fr: ["rollback","annuler"],
    de: ["zurückrollen","rückgängig machen"],
    it: ["rollback","annulla"],
  },
  "skill-create": {
    en: ["create skill","new skill","build skill","skill-create"],
    ko: ["스킬 생성","새 스킬","스킬 만들","스킬 만들기"],
    ja: ["スキル作成","新しいスキル"],
    zh: ["创建技能","新技能"],
    es: ["crear habilidad","nueva habilidad"],
    fr: ["créer compétence"],
    de: ["Fähigkeit erstellen"],
    it: ["crea abilità"],
  },
  "skill-status": {
    en: ["skill-status","skill list"],
    ko: ["스킬 상태","스킬 목록"],
  },
  "sprint": {
    en: ["sprint","sprint init","sprint start","sprint status","sprint phase","master plan","sprint list","multi-sprint plan","sprint master plan"],
    ko: ["스프린트","스프린트 시작","스프린트 상태","스프린트 페이즈","마스터 플랜","멀티 스프린트 계획","스프린트 마스터 플랜"],
    ja: ["スプリント","スプリント開始","スプリント状態","マスタープラン"],
    zh: ["冲刺","冲刺开始","冲刺状态","主计划","冲刺主计划"],
    es: ["sprint","iniciar sprint","estado sprint","plan maestro"],
    fr: ["sprint","demarrer sprint","etat sprint","plan principal"],
    de: ["Sprint","Sprint starten","Sprint-Status","Hauptplan"],
    it: ["sprint","avvia sprint","stato sprint","piano principale"],
    mul: ["iniciar sprint","demarrer sprint","Sprint starten","avviare sprint"],
  },
  "starter": {
    en: ["static site","simple website","landing page","portfolio","static website","beginner"],
    ko: ["정적 사이트","간단한 웹사이트","랜딩 페이지","포트폴리오","정적 웹","초보자"],
    ja: ["静的サイト","シンプルなウェブサイト","ランディングページ"],
    zh: ["静态网站","简单网站","着陆页","作品集"],
    es: ["sitio estático","sitio web simple","página de destino"],
    fr: ["site statique","site web simple","page de destination"],
    de: ["statische Seite","einfache Website","Landingpage"],
    it: ["sito statico","sito web semplice","landing page"],
    mul: ["init starter"],
  },
  "zero-script-qa": {
    en: ["zero-script-qa","log testing","docker logs","QA"],
    ko: ["제로 스크립트 QA"],
  },
});

module.exports = {
  TRIGGER_LANGUAGE_KEYS,
  AGENT_TRIGGER_KEYWORDS,
  SKILL_TRIGGER_KEYWORDS,
};
