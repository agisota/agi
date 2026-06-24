# Руководство по мобильной разработке

> Русский перевод [MOBILE.md](./MOBILE.md).

Мобильные сборки agi упаковывают веб-клиент дашборда в оболочки Capacitor через `packages/mobile/`.

## Требования

- **Node.js** 22+
- **pnpm** 10+
- **Xcode** (сборки под iOS)
- **Android Studio** (Android SDK + инструменты эмулятора)
- **Java JDK** 17+ (сборки Android через Gradle)

## Быстрый старт

```bash
pnpm install
pnpm mobile:build
pnpm mobile:ios      # открыть проект iOS в Xcode
# или
pnpm mobile:android  # открыть проект Android в Android Studio
```

## Разработка с Live Reload

Используйте хелперы live-reload в `packages/mobile/scripts/live-reload.ts`:

```bash
pnpm mobile:dev:ios
pnpm mobile:dev:android
```

Эти команды автоматически устанавливают:

- `FUSION_LIVE_RELOAD=true`
- `FUSION_SERVER_URL=http://localhost:5173` (по умолчанию)

Чтобы нацелиться на другой URL dev-сервера, задайте `FUSION_SERVER_URL` перед запуском (или передайте `--server-url` напрямую в скрипт):

```bash
FUSION_SERVER_URL=http://192.168.1.50:5173 pnpm mobile:dev:android
```

## Сборка для продакшена

```bash
pnpm mobile:build
```

Это запускает:

1. `pnpm --filter @fusion/dashboard build`
2. `pnpm --filter @fusion/mobile cap sync`

После синхронизации откройте нативные проекты для подписи/дистрибуции релиза:

```bash
pnpm mobile:ios
pnpm mobile:android
```

## Установка PWA

Дашборд включает манифест PWA (`packages/dashboard/app/public/manifest.json`) и service worker (`packages/dashboard/app/public/sw.js`).

### Отступ под home-индикатор в standalone-режиме iOS

- Установленный standalone-режим задаёт `--standalone-bottom-gap` через `@media (display-mode: standalone) { :root { ... } }`.
- Нижний отступ должен оставаться привязанным к правилам layout/компонентов (например, отступы мобильного контента и смещения футера/навигации), а не к глобальному padding у `#root`.
- Сохраняйте standalone-отступ аддитивным к существующей обработке safe-area (`env(safe-area-inset-bottom, 0px)`).
- Обёртка `.project-content` — единственный источник истины для резервирования нижнего пространства под мобильную навигацию/футер/standalone; встроенные вкладки дашборда (например, Агенты и Миссии) должны применять только собственный padding контента и не должны повторно добавлять `--mobile-nav-height` или дублировать отступ футера.

Установка из браузера:

- **Chrome**: меню с тремя точками → **Install app**
- **Safari (iOS)**: **Share** → **Add to Home Screen**

> Service worker'ы требуют **HTTPS** (или `localhost`). Установка PWA и офлайн-поведение не будут работать на обычных HTTP-источниках.

## Поведение мобильного UX

### Онбординг нативной оболочки и профили подключения

Первый запуск в мобильной оболочке открывает онбординг удалённого подключения на уровне оболочки, до онбординга моделей в дашборде.

Каноничный поток (настройка через QR/вручную, сохранённые профили, поведение активного профиля и оговорки по безопасности) описан в [Руководстве по подключению нативной оболочки](./docs/native-shell.md).

Заметки по реализации:
- Профили мобильной оболочки сохраняются в локальном хранилище оболочки (Capacitor Preferences), отдельно от настроек проекта/глобальных настроек agi.
- Откат при удалении активного профиля управляется оболочкой: удаление активного профиля повышает первый из оставшихся профилей, а удаление последнего профиля сбрасывает состояние в чистое пустое.
- Дашборд использует это через общие API подключения `window.fusionShell`.

### Режим планирования

Режим планирования на мобильном устройстве открывается сразу в панель композера, когда нет ни одной сессии планирования, избегая тупика с пустым сайдбаром. На десктопе/планшете split-view не затрагивается. После сохранения сессий мобильный интерфейс показывает список сессий как обычно, и пользователь может переключаться между панелями списка и деталей.

### Поведение прокрутки/читаемости Chat и Quick Chat на мобильном

- Chat и Quick Chat должны держать прокрутку в пределах контейнера (`.chat-messages` / `.quick-chat-panel-messages`) и не переключаться на API прокрутки уровня страницы (включая `scrollIntoView()`), чтобы избежать дрейфа viewport в мобильном Safari.
- Мобильные заголовки прямых тредов Full Chat включают переключатель быстрых сессий по нажатию на заголовок; сохраняйте поведение одной панели (возврат к списку по-прежнему работает) и держите переключатель привязанным только к прямым сессиям (треды комнат сохраняют существующее поведение заголовка/возврата комнаты).
- Обе поверхности теперь приостанавливают автопрокрутку live-tail, когда пользователь прокручивает прочь от низа, показывают временный элемент перехода **Latest** и возобновляют следование за хвостом только после возврата вниз.
- Ширина мобильных «пузырей» намеренно немного больше для читаемости, но padding safe-area, границы полноэкранного Quick Chat и компактные мобильные сводки вызовов инструментов должны оставаться нетронутыми.

## Конвейер CI/CD

Мобильный CI определён в `.github/workflows/mobile.yml`.

- Запускается вручную через **GitHub Actions → Mobile Builds → Run workflow**
- Также запускается при push в `main`, когда меняются файлы под `packages/mobile/**` или `packages/dashboard/**`
- Задачи:
  - `build-web` (собрать дашборд и загрузить `dist/client`)
  - `build-ios` (синхронизация/сборка iOS, когда существует `packages/mobile/ios/`)
  - `build-android` (синхронизация/сборка Android, когда существует `packages/mobile/android/`)

Артефакты хранятся 30 дней.

## Замена иконок PWA

Текущие иконки — заглушки:

- `packages/dashboard/app/public/icons/icon-192.png`
- `packages/dashboard/app/public/icons/icon-512.png`

Сгенерируйте продакшен-иконки из `logo.svg` (пример с sharp-cli):

```bash
npx sharp-cli -i packages/dashboard/app/public/logo.svg -o packages/dashboard/app/public/icons/icon-192.png resize 192 192
npx sharp-cli -i packages/dashboard/app/public/logo.svg -o packages/dashboard/app/public/icons/icon-512.png resize 512 512
```

При желании можно также использовать ImageMagick.

## Устранение неполадок

### `cap sync` падает

- Убедитесь, что зависимости установлены: `pnpm install`
- Убедитесь, что проекты платформ добавлены (`packages/mobile/ios` / `packages/mobile/android`)
- Перезапустите: `pnpm mobile:sync`

### Сборка iOS падает

- Проверьте совместимость версии/тулчейна Xcode
- Откройте `packages/mobile/ios/App/App.xcworkspace` в Xcode и настройте параметры подписи

### Сборка Android падает

- Проверьте Java 17+ (`java -version`)
- Убедитесь, что Android SDK и инструменты Gradle установлены через Android Studio

### PWA не устанавливается

- Проверьте HTTPS (или localhost)
- Убедитесь, что `manifest.json` и `sw.js` отдаются из собранного приложения
- Очистите старый service worker/кэш и перезагрузите

## Справочник по скриптам

Корневые скрипты (`package.json`):

- `mobile:build`
- `mobile:ios`
- `mobile:android`
- `mobile:dev:ios`
- `mobile:dev:android`
- `mobile:sync`

Скрипты мобильного пакета (`packages/mobile/package.json`):

- `cap`
- `dev:ios`
- `dev:android`
- `build:mobile`
