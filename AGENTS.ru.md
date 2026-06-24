> Русский перевод [AGENTS.md](./AGENTS.md).

# Руководство по проекту

## Базовые правила

### Гигиена генерации спецификаций

- Не ссылайтесь на пути `.fusion/tasks/<id>/<file>` в разделах Context/Steps/File Scope, если файл уже не существует, явно не создаётся как артефакт `(new)` либо не является соседним `PROMPT.md`/`task.json`/`attachments/*`.
- Висящие ссылки на task-local файлы — блокирующая причина для REVISE спецификации.
- Сохраняйте черновики планирования и промежуточные заметки через `fn_task_document_write`, а не выдумывайте task-local файлы на диске.

#### Доказательства внешней интеграции

Любая задача, интегрирующая сторонний инструмент (CLI, демон, скачиваемый бинарник, зависимость под управлением установщика), обязана указывать в PROMPT.md:
1. Канонический URL upstream-репозитория.
2. URL документации/домашней страницы.
3. URL релиза/загрузки.
4. Имя бинарника/CLI в обратных кавычках.
5. Контрольную сумму или маркер `upstream-pending-verification`.

Отсутствие доказательств — блокирующий REVISE. Никогда не выдумывайте URL релизов, имена бинарников или хеши.

Пример формы раздела с доказательствами:

```markdown
## External Integration Evidence

- Canonical upstream repo URL: https://github.com/max-sixty/worktrunk
- Docs / homepage URL: https://worktrunk.dev/
- Release / download URL: https://github.com/max-sixty/worktrunk/releases/latest/download/wt-linux-x64.tar.gz
- Binary / CLI name: `wt`
- Checksum: `sha256-<digest>` (or `upstream-pending-verification` until the checksum is pinned)
```

Подробное руководство по написанию спецификаций и принятые варианты размеченной разметки см. в `docs/contributing.md`.

### Финализация изменений

Когда изменение затрагивает публикуемый `@runfusion/fusion`, добавьте changeset (пример: `.changeset/<name>.md` с `"@runfusion/fusion": patch`).

Типы инкремента:
- **patch** — исправления багов/внутреннее
- **minor** — новые функции/CLI/инструменты
- **major** — ломающие изменения

**НЕ** создавайте changeset'ы для AGENTS.md/README/внутренней документации, конфигурации CI или рефакторингов, сохраняющих поведение. `@fusion/core`, `@fusion/dashboard` и `@fusion/engine` приватны.

### Релизы

Используйте только:

```bash
pnpm release --yes
```

`scripts/release.mjs` — источник истины. Не подменяйте его ручными `changeset version`, `pnpm publish` или git-тегами.

### Структура пакетов

- `@fusion/core` — доменная модель/хранилище задач (приватный)
- `@fusion/dashboard` — веб-UI + API-сервер (приватный)
- `@fusion/engine` — triage/executor/reviewer/merger/scheduler (приватный)
- `@runfusion/fusion` — CLI + расширение pi (публикуемый)

Публикуется только `@runfusion/fusion`; пакеты `@fusion/*` упакованы в него.

#### Импорт между пакетами `@fusion/*`

Импорты `@fusion/*` должны статически анализироваться. Антипаттерн:

```ts
const engineModule = "@fusion/engine";
const engine = await import(/* @vite-ignore */ engineModule);
```

Правила:
1. По умолчанию — статические импорты.
2. `@fusion/core` использует DI (`setCreateFnAgent`) вместо динамического `import("@fusion/engine")` из-за цикличности.
3. Никогда не возвращайте трюк `engineModule = "@fusion/engine"`.
4. `vi.mock("@fusion/engine", ...)` остаётся валидным.

### Команды тестирования

Слияние-гейт тонкий и доверенный: CI блокирует PR только по Lint, Typecheck, Build и Gate (boot smoke + `pnpm test:gate`). Всё остальное запускается неблокирующе в `full-suite.yml` при push в main. Красный гейт означает реальную проблему; красный неблокирующий прогон — информация, а не стоп-фактор для слияния. Typecheck'и/ручные проверки не заменяют гейт.

```bash
pnpm test          # gate suite + changed-only affected tests (bounded; never full-suite)
pnpm test:gate     # the merge gate: curated engine-core suite + CI-shape test
pnpm smoke:boot    # boot smoke: CLI --help + real serve /api/health
pnpm test:velocity # weekly report-only test velocity baseline; use -- --measure --write-report to refresh
pnpm test:full     # full workspace suite — explicit opt-in only
pnpm lint
pnpm build
pnpm verify:workspace  # deep opt-in verification (lint -> test:full -> build); NOT the merge gate
```

### Постоянное правило: нестабильные тесты карантинятся при первом же обнаружении (Deletion Ratchet)

- Тест, замеченный падающим без соответствующего реального бага в изменении, КАРАНТИНИТСЯ ПРИ ПЕРВОМ ЖЕ ОБНАРУЖЕНИИ: добавьте запись в `scripts/lib/test-quarantine.json` (`file`, `reason` со ссылкой на упавший прогон, `quarantinedAt`) И соответствующую однострочную `exclude` в vitest-конфиге этого пакета, в том же коммите.
- **Агенты никогда не должны задабривать нестабильный тест.** Никаких расширенных таймаутов, добавленных ретраев, ослабленных или удалённых ассертов ради прохождения флака. Вместо этого — карантин. Задабривание истощает сигнал теста, и именно так suite сгнил в прошлый раз.
- Карантинный тест УДАЛЯЕТСЯ через 14 дней (`quarantinedAt` + 2 недели), если не спасён. Спасение требует доказательств, что тест ловит реальные регрессии, плюс исправления первопричины — а не стабилизационных проходов.
- Флак ВНУТРИ слияние-гейта вытесняется, а не пропускается: удалите его строку из allow-list `engine-core` в `packages/engine/vitest.config.ts` (PR на вытеснение не требует, чтобы нестабильный тест проходил).
- Второй карантин в той же подсистеме — запах продуктовой гонки: посмотрите на продуктовый код до того, как сработает таймер удаления (см. `docs/solutions/ui-bugs/skill-autocomplete-highlight-reset-on-swr-revalidation.md`: флак, «стабилизированный» три раза, оказался реальной гонкой).
- Допуск в гейт требует доказательств ценности; тесты никогда не попадают в гейт по умолчанию. Механика: `docs/testing.md` → «Quarantine ledger and the deletion ratchet».

### Постоянное правило: не добавляйте медленные тесты (FN-5048)

- Предпочитайте узкие швы, in-memory подделки, общие harness'ы и точечные ассерты.
- Предпочитайте поддельные таймеры реальному поллингу/ожиданиям по времени.
- Не маскируйте медлительность повышением ручек worker/concurrency.
- Не добавляйте новые реальные сетевые вызовы, реальные циклы поллинга или mock-the-world-обёртки, когда существует более узкий шов.
- При решении trim vs keep используйте таксономию тестирования из `docs/testing.md`.

### Постоянное правило: чините инвариант, а не репро (FN-5893)

- При исправлении бага регрессионный тест должен утверждать общий инвариант по ВСЕМ известным поверхностям — а не только единственную сообщённую репродукцию.
- Приёмка на основе симптома обязательна для задач класса «баг»: финальная верификация должна воспроизвести исходное условие падения и утвердить, что оно больше не возникает, через реальный автоматический тест. Закодируйте это секцией `## Symptom Verification` в PROMPT.md с **Original symptom**, **Exact reproduction** и **Assertion it is gone**; одного зелёного build/тестов недостаточно. Этот маркер — контракт, потребляемый гейтом авто-закрытия GitHub (FN-6230).
- Перечисление поверхностей теперь — обязательный артефакт исправления бага: спецификация должна включать секцию `## Surface Enumeration`, планирование обязано REVISE при отсутствии этой секции, а ревью обязано REVISE любой регрессионный тест, покрывающий только репро.
- Гейт Surface Enumeration также применяется к задачам, добавляющим или удаляющим UI-аффордансы (иконки, кнопки, шевроны, переключатели, бейджи, пункты меню, цели клика), включая косметические задачи Review Level 0.
- Перечислите поверхности до заведения или закрытия исправления: каждый provider/bridge для стриминга и путей агента, и desktop, и mobile брейкпоинты для UI-поведения, состояния данных empty/undefined/duplicate/populated, а также каждый общий hook/component/module/helper, переиспользующий затронутую логику.
- После удаления UI-аффорданса явно проверьте и зачистите пустые оболочки кнопок, осиротевшие цели клика, теперь неиспользуемые обёртки и висящие aria-label'ы на обоих брейкпоинтах desktop и mobile.
- Используйте канонический чек-лист из `docs/testing.md` → **Surface Enumeration checklist**, чтобы планирование и ревью перечисляли одни и те же поверхности.
- Мотивирующие инциденты: пробелы в стримированном ответе чинились трижды, прежде чем инвариант был полностью покрыт (FN-5787, FN-5789, FN-5803), кнопка «Show hidden» в usage регрессировала трижды, прежде чем более широкое покрытие закрепилось (FN-5797, FN-5875, FN-5919), а исправление пустого дашборда при auto-merge переоткрылось после того, как покрытие только desktop пропустило mobile Android (FN-5751).
- Мотивирующий инцидент для UI-аффордансов: удаление выпадающей стрелки в строке workflow заняло три задачи (FN-6115 → FN-6118 → FN-6123), потому что аффорданс рендерился в двух компонентах, а mobile сохранял пустую оболочку кнопки `btn-icon` 36×36.
- Если регрессионный тест доказывает только точный сообщённый случай — он неполон; расширяйте его, пока инвариант не будет держаться по всем известным поверхностям.

### Порт 4040 зарезервирован

Никогда не убивайте процессы на порту 4040 и никогда не запускайте тестовые серверы на 4040. Используйте `--port 0` или другой свободный порт.

### Никогда не запускайте неограниченный `find` по системной временной директории

Не запускайте рекурсивный `find` (или любой неограниченный рекурсивный обход директорий) с корнем во временной директории ОС — `$TMPDIR`, `/tmp` или macOS `/var/folders/...` (канонически `/private/var/...`). Корень temp может содержать огромное число записей на CI и долгоживущих dev-хостах, поэтому широкое сканирование может зависнуть на минуты и забить I/O.

Когда нужен временный артефакт agi, целься прямо в известный префикс и перечисляй один уровень с фильтром по префиксу — никогда не обходи всё дерево temp. Канонический ограниченный паттерн — собственная зачистка движка: нерекурсивные проходы `readdirSync(...)` по сконфигурированному корню `<worktreesDir>/.ai-merge/` плюс legacy `.fusion/ai-merge/` и остатки `tmpdir()`, отфильтрованные по известному префиксу вроде `fusion-ai-merge-` (`SelfHealingManager.cleanupStaleTempMergeWorktrees()` в `packages/engine/src/self-healing.ts`). Ограниченные по области вызовы `find` под рабочим деревом проекта или `.fusion/` допустимы; запрещено только широкое сканирование корня temp.

### Правила процессов движка

#### Никогда не используйте `execSync` для команд, заданных пользователем

Запускайте заданные пользователем команды (скрипты test/build/workflow) через асинхронный `exec` с таймаутом. `execSync` приемлем только для короткого детерминированного git-пламбинга.

#### Контракт Move-Task

Пользовательский `moveTask(in-progress → todo)` — это жёсткая отмена: прервать активные сессии/подпроцессы и припарковать задачу в `todo` с семантикой паузы пользователя. Отскоки (rebounds) движка не должны выставлять `userPaused`.

#### Супервизия процессов

Используйте `superviseSpawn(...)` из `@fusion/core` для управляемых дочерних процессов; не используйте сырые паттерны detached `spawn`/`nohup`, если они явно не в allow-list. Это обеспечивают `eslint.config.mjs` + `scripts/check-no-nohup.mjs`.

### Соглашения Git

- Префиксы коммитов: `feat(FN-XXX):`, `fix(FN-XXX):`, `test(FN-XXX):`
- Один коммит на границу шага
- Включайте префикс ID задачи
- Коммиты в task-worktree agi должны нести трейлеры `Fusion-Task-Id: FN-NNNN`

### Слияние веток в main

1. **Удаляйте дублирующиеся коммиты перед слиянием.** Перебазируйтесь, убирая дубликаты, уже находящиеся на main.
2. **Squash теперь — дефолт проекта; пути слияния с сохранением истории требуют явного включения.** Новые проекты по умолчанию используют `directMergeCommitStrategy="always-squash"`. Чтобы сохранить мультикоммитную историю, явно задайте проектный `directMergeCommitStrategy` в `"auto"` или `"always-rebase"`, либо задайте per-task override `**Direct Merge Commit Strategy:** ...` в `PROMPT.md`.
3. **Пустые cherry-pick'и — no-op.** Не создавайте пустые коммиты.
4. **Применяется классификатор already-on-main.** Разрешайте восстановление finalize/self-healing, когда линия предков приземлена.
5. **Авто-восстановление от контаминации ограничено.** Первый проход может авто-удалить чужие upstream-коммиты; повторяющиеся/неоднозначные случаи эскалируются.
6. **Запускайте политику аудита после squash.** Уважайте `postMergeAuditMode` (`warn`/`block`/`off`) и стадии авто-восстановления.
7. **Применяйте pre-commit гейт по объёму диффа.** Блокируйте подозрительное сжатие до squash-коммита.
8. **Защита от перекрытия smart-prefer-main.** Недавние перекрывающиеся коммиты main могут переключить на prefer-branch.
9. **Партиционирование области Layer-3.** Конфликты вне области разрешаются в пользу main до AI-арбитража, если `task.scopeOverride=true` не задан.
10. **Авто-prerebase при дивергенции/горячих файлах.** Fail-soft и продолжение обычного стека конфликтов.

### Защита gitignored-путей при squash-слияниях

Никогда не форс-добавляйте игнорируемые артефакты (например `git add -f .fusion/...`). Используйте task-документы для находок/заметок.

### Инвариант File-Scope при squash-слияниях

Каждый squash-коммит должен пересекаться с `## File Scope` задачи (если область не пуста). Нарушения должны падать с `FileScopeViolationError` и сбрасывать состояние до squash.

Существует per-task отказ: `task.scopeOverride = true` (залогируйте причину).

### Замечание про `autoMerge: false` (FN-5147)

Когда `settings.autoMerge: false`, `in-review` терминален-до-слияния человеком. Self-healing, мутирующий жизненный цикл, не должен двигать такие задачи назад, ставить их на паузу/в fail или повторно ставить в очередь на выполнение.

Ограниченное исключение (FN-5819): члены shared-branch-group (`branchContext.assignmentMode === "shared"`) по-прежнему выполняют шаг локальной интеграции member→shared-branch, пока auto-merge выключен. Это исключение только для сборки `branch_groups.branchName`; продвижение shared-branch → default-branch остаётся под гейтом группового/глобального auto-merge.

### Mock-провайдер (тестовый режим)

`testMode?: boolean` теперь доступен и в проектных, и в глобальных настройках. Если проектный `testMode === true` (или разрешённый провайдер по умолчанию — `"mock"` на любом уровне), каждая AI-полоса принудительно переводится в `mock/scripted`, переопределяя выбор моделей per-task и per-lane. Дашборд выставляет это через переключатель «Enable test mode» в Settings Modal и постоянный баннер «Test mode — no real AI calls».

### Аудит прогонов

- FN-5419: git run-audit теперь включает `pull:fast-forward` и `stash:pop-conflict`; git-поверхности дашборда теперь включают расширенный путь integration-worktree `POST /api/git/pull` плюс сопутствующие маршруты `POST /api/git/stash-resolve`, `POST /api/git/stash-drop` и `POST /api/git/stash-apply`.
- FN-6292: self-healing эмитит `task:reconcile-dependency-blocking-lease`, когда отскакивает in-progress держателя, чьё устаревшее file-scope-лиз блокирует невыполненную зависимость, и `task:reconcile-dependency-blocking-lease-no-action`, когда triple-proof блокирует это движение назад.
- FN-6736: self-healing эмитит `task:reclaim-phantom-executor-binding`, когда доказывает, что in-memory executor-active-привязка устарела, очищает привязку и повторно ставит in-progress задачу в очередь с сохранением worktree/прогресса.
- FN-6783: открытие task-store и housekeeping self-healing эмитят `task:reconcile-orphaned-task-dir`, когда недеструктивно реимпортируют валидную живую директорию `.fusion/tasks/{ID}/task.json`, у которой нигде нет строки задачи, сохраняя soft-deleted/archived/tombstoned ID.
- FN-6782/FN-6796: self-healing эмитит `task:auto-recover-paused-abort-park`, когда очищает безвредную операторскую парковку pause-abort, повторно ставя в очередь безопасные строки `todo`/`in-progress` или сохраняя чистую auto-merge-eligible строку `in-review` для продвижения ревью.
- FN-6793/FN-6797: self-healing эмитит `task:reconcile-in-review-unmet-dependencies`, когда отскакивает `in-review`-задачу, чьи объявленные зависимости всё ещё не выполнены, и `task:reconcile-in-review-unmet-dependencies-no-action`, когда pause/user-pause, `autoMerge:false`, доказательство живого выполнения/checkout или неудавшаяся мутация отскока блокируют это движение назад.


## Справочная документация (более глубокие детали)

- `./docs/architecture.md` — инварианты жизненного цикла, правила self-healing, страховки взаимодействия надёжности, внутренности run-audit.
- `./docs/testing.md` — полные полосы тестирования, руководство по worker fanout, таксономия тестов, недельный velocity-baseline и организация файлов.
- `./docs/test-velocity-baseline.md` — недельный отчёт о скорости цикла обратной связи тестов #leads-ready, генерируемый `scripts/test-velocity-baseline.mjs`.
- `./docs/dashboard-guide.md` — поведение дашборда и детали **Styling Guide**. Здесь живёт пользовательская документация для Merge Advance Notice и Smart Pull.
- `./docs/PLUGIN_AUTHORING.md` — руководство по написанию плагинов, lifecycle-хуки, маршруты, инструменты и поверхности расширения дашборда.
- `./docs/agents.md` — область расширения pi, инструменты координации, лизинг checkout, рантайм-конфигурация.
- `./docs/settings-reference.md` — иерархия выбора моделей, режим mock-провайдера, приоритет бюджета токенов, пресеты.
- `./docs/storage.md` — детали гибридной модели хранения, включая per-task хранение `agent-log.jsonl` и семантику ретенции.
- `./docs/multi-project.md` — центральная/per-project БД и режимы изоляции.
- `./docs/missions.md` — модель миссия/milestone/slice/feature.
- `./docs/workflow-steps.md` — гейты prompt/script и поведение блокировки слияния.
- `./docs/secrets.md` — политика секретов и поведение инструментов.
- `./docs/diagnostics.md` — соглашения диагностического логирования движка.
- `./docs/task-management.md` — семантика очистки и восстановления архива.
- `./docs/soft-delete-verification-matrix.md` — обязательная матрица верификации soft-delete.
- `./docs/cli-reference.md` — справочник CLI и терминального UI.
- `./docs/contributing.md` — соглашения по контрибьютингу и контекст, смежный с релизами.
- `./docs/solutions/` — задокументированные решения прошлых проблем (баги, архитектурные паттерны, лучшие практики, соглашения), организованные по категориям с YAML-frontmatter (`category`, `module`, `tags`, `problem_type`, `applies_when`). Актуально при реализации или отладке в задокументированных областях.
- `./CONCEPTS.md` — общий доменный словарь (сущности, именованные процессы, концепции статусов). Актуально при ориентировании в кодовой базе или обсуждении доменных концепций.

### Тяжёлые view с ленивой загрузкой

Эти 20 view загружаются лениво через `React.lazy()` с `<Suspense fallback={null}>`.
Держите этот инвентарь AGENTS в синхроне с ленивыми импортами App, ленивыми импортами модалок AppModals (`SettingsModal`, `WorkflowNodeEditor`, `SetupWizardModal`) и `packages/dashboard/app/__tests__/lazy-loaded-views-docs.test.ts`.

- `AgentsView`
- `ChatView`
- `MemoryView`
- `DevServerView`
- `SecretsView`
- `InsightsView`
- `DocumentsView`
- `SkillsView`
- `ResearchView`
- `CommandCenter`
- `EvalsView`
- `TodoView`
- `GoalsView`
- `PullRequestView`
- `SetupWizardModal`
- `SettingsModal`
- `WorkflowNodeEditor`
- `PluginManager`
- `PiExtensionsManager`
- `AgentDetailView`

Примечание: встроенные view основного контента Workflows (`_WorkflowEditorView`), Import Tasks (`_ImportTasksView`), Automations (`_AutomationsView`) и Settings (`_SettingsView`) в App.tsx — это ленивые сплиты с префиксом `_`, переиспользующие уже задокументированные чанки. Они намеренно исключены из курируемого списка выше и из подсчёта; `lazy-loaded-views-docs.test.ts` отфильтровывает ленивые const'ы с префиксом `_` (`extractAppLazyViews`), поэтому не добавляйте их как пункты.

## Комментарии FNXC_LOG:
   - Пожалуйста, всякий раз, когда работаете над кодовой базой. Я хочу, чтобы вы добавляли комментарии с описанием даты изменения (обязательно в формате yyyy-MM-dd-hh:mm) и описанием требований или изменения требований, которые заставили вас реализовать определённую функциональность.
   - Я хочу, чтобы вы писали FNXC:Area-of-product перед всеми вашими комментариями, чтобы их можно было искать grep'ом.
   - Большая часть этого должна быть написана как jsdoc, но вы можете добавлять короткие комментарии вокруг важных переменных и более сложных частей кодовой базы.
   - Идея в том, чтобы закодировать требования системы (особенно поведение ПО, UX и важные технические решения) в код, чтобы позже было яснее, почему был написан тот или иной фрагмент кода.
   - Всегда следите за тем, чтобы эти комментарии оставались актуальными по мере работы в кодовой базе и изменения требований.
   - Используйте принципы технического письма, чтобы писать немногословные комментарии, передающие важную информацию без воды.
   - Помните, что ВСЕ важные пользовательские требования, присланные пользователем, должны быть записаны как комментарии где-то в кодовой базе.
   - Нет необходимости добавлять переносы строк в FNXC-комментариях, чтобы оставаться в пределах определённой ширины символов. Просто добавляйте переносы строк нормально в конце предложений.

   Хороший пример FNXC-комментария:
   ```
   /*
   FNXC:SettingsNavigation 2026-05-13-08:05:
   The Settings dialog needs enough horizontal room for a main-tab section sidebar while Ghostty settings live in their own second tab.
   Use scoped CSS so the native modal host and Storybook share the same width without relying on newly generated utilities.

   FNXC:SettingsNavigation 2026-05-13-08:11:
   The modal should be 20% wider than the first section-sidebar layout and use a taller viewport so more settings remain visible without scrolling.
   */
   ```
