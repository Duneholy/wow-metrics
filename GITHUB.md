# Публикация на GitHub

Эта папка — готовая к загрузке копия проекта (без `node_modules`, сборок, `.env` и локальной БД).

## 1. Первый запуск у себя (проверка)

```bat
Install wow_metrics.bat
Launch wow_metrics.bat
```

Если окно установки сразу закрывается: запускайте **`Install wow_metrics.bat`**. Node.js устанавливается автоматически; нужна папка `scripts\` в проекте. При сбое — `install.log` и запуск от имени администратора.

## 2. Создать репозиторий и отправить код

В PowerShell из этой папки:

```powershell
cd "C:\Users\Yury Mikhno\Desktop\wow_metrics_2"
git init
git add .
git commit -m "Initial commit: wow_metrics open source release"
```

На GitHub: **New repository** → имя, например `wow_metrics` → без README (он уже в проекте).

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wow_metrics.git
git push -u origin main
```

Замените `YOUR_USERNAME` и URL на свои.

## 3. Что не попадёт в git (см. `.gitignore`)

- `node_modules/`, `dist/`
- `backend/.env`, `backend/prisma/*.db`
- логи, ярлыки `*.lnk`

Секреты: после `install.bat` появится `backend/.env` — он только локально, в репозиторий не коммитится.

## 4. Для пользователей клона

1. `install.bat`
2. `Launch wow_metrics.bat`  
   Опционально production: `setup.bat` → `cd backend && npm start` → http://localhost:4000

См. также [DISCLAIMER.md](DISCLAIMER.md) и [LICENSE](LICENSE).
