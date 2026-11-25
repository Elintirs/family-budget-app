#!/usr/bin/env bash
# Выкладка APK: Google Диск (rclone, удалённый диск «gdrive», доступ только к своим файлам) и
# запись версии в рабочий деплой, чтобы телефоны показали плашку «Скачать и установить».
#
#   scripts/publish-apk.sh "Что нового одной строкой"        # залить и записать (dry=0)
#   DRY=1 scripts/publish-apk.sh "..."                       # залить и проверить без записи
#
# Один раз до первого запуска: rclone config create gdrive drive scope=drive.file
set -euo pipefail
cd "$(dirname "$0")/.."

notes=${1:?Нужна строка «что нового»}
apk=release/budget.apk
version=$(sed -nE "s/^  version: '([0-9.]+)',/\1/p" apps/mobile/app.config.ts)
[ -n "$version" ] || { echo "Не нашёл версию в app.config.ts" >&2; exit 1; }
[ -f "$apk" ] || { echo "Нет $apk, сначала собери релиз" >&2; exit 1; }

# Версия внутри APK должна совпадать с app.config.ts, иначе плашка будет вечной.
inside=$(unzip -p "$apk" assets/app.config | sed -nE 's/.*"version":"([0-9.]+)".*/\1/p')
[ "$inside" = "$version" ] || { echo "В APK версия $inside, в app.config.ts $version" >&2; exit 1; }

# Android ставит обновление, только если versionCode вырос: иначе плашка есть, а установка падает.
apkanalyzer=${ANDROID_HOME:-$HOME/Library/Android/sdk}/cmdline-tools/latest/bin/apkanalyzer
code=$("$apkanalyzer" manifest version-code "$apk")
config_code=$(sed -nE "s/^ *versionCode: ([0-9]+),/\1/p" apps/mobile/app.config.ts)
[ "$code" = "$config_code" ] || { echo "В APK versionCode $code, в app.config.ts $config_code" >&2; exit 1; }
last_file=release/last-version-code
last=$(cat "$last_file" 2>/dev/null || echo 0)
[ "$code" -gt "$last" ] || { echo "versionCode $code не больше прошлого опубликованного $last" >&2; exit 1; }

remote="gdrive:Бюджет/budget-$version.apk"
echo "Заливаю $apk → $remote"
rclone copyto "$apk" "$remote" $([ -t 1 ] && echo --progress)
# rclone link открывает доступ «все, у кого есть ссылка» (только чтение).
link=$(rclone link "$remote")
id=$(sed -nE 's#.*[?&]id=([A-Za-z0-9_-]+).*#\1#p; s#.*/d/([A-Za-z0-9_-]+).*#\1#p' <<<"$link" | head -1)
[ -n "$id" ] || { echo "Не разобрал ссылку: $link" >&2; exit 1; }
url="https://drive.google.com/uc?export=download&id=$id"
echo "Ссылка: $url"

# Секреты читаем из gas/.env.local и не печатаем.
deployment=$(sed -nE 's/^DEPLOYMENT_ID=//p' gas/.env.local)
admin=$(sed -nE 's/^ADMIN_TOKEN=//p' gas/.env.local)
dry=$([ "${DRY:-0}" = 1 ] && echo 1 || echo 0)
res=$(curl -sSL -G "https://script.google.com/macros/s/$deployment/exec" \
  --data-urlencode "admin=$admin" \
  --data-urlencode "table=prod" \
  --data-urlencode "action=setLatestApp" \
  --data-urlencode "version=$version" \
  --data-urlencode "url=$url" \
  --data-urlencode "notes=$notes" \
  --data-urlencode "dry=$dry")
echo "$res"
grep -q '"ok":true' <<<"$res" || { echo "Сервер не записал версию" >&2; exit 1; }
[ "$dry" = 1 ] || echo "$code" > "$last_file"
