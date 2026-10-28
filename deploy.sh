#!/bin/sh
# Выкладка AromaOS на сервер (crm.arome-marketing.kz): самодостаточная сборка Next → /opt/aromaos/app, сервис aromaos.
# Секреты (DATABASE_URL, SESSION_SECRET, SETUP_CODE) — только на сервере в /opt/aromaos/.env.
set -e
cd "$(dirname "$0")"
HOST=ubuntu@87.199.130.157
NEXT_DIST_DIR=.next-prod npx next build
S=.next-prod/standalone
rm -rf "$S/data" "$S/node_modules/sharp" "$S/node_modules/@img"   # локальная PGlite-база и бинарники sharp под Windows не нужны
cp -r .next-prod/static "$S/.next-prod/static"
cp -r public "$S/public"
# Turbopack кладёт в .next-prod/node_modules ссылки на внешние пакеты (pg, pglite) с абсолютным путём Windows —
# на сервере перевешиваем их на относительные ../node_modules/<пакет>
tar -czf - -C "$S" . | ssh $HOST 'set -e; rm -rf /tmp/aos-new; mkdir /tmp/aos-new; tar -xzf - -C /tmp/aos-new
  cd /tmp/aos-new; find .next-prod/node_modules -type l | while read l; do
    pkg=$(readlink "$l" | sed "s|.*/node_modules/||"); ln -sfn "$(realpath -m --relative-to="$(dirname "$l")" "node_modules/$pkg")" "$l"; done; cd /
  sudo rsync -a --delete /tmp/aos-new/ /opt/aromaos/app/ && sudo chown -R aromaos:aromaos /opt/aromaos/app && rm -rf /tmp/aos-new
  sudo systemctl restart aromaos'
echo "выложено: https://crm.arome-marketing.kz/"
