# دیپلوی «فقط گیت‌هاب» — GitHub Codespaces

اپ Together (Express + socket.io + Postgres) کاملاً روی زیرساخت خود گیت‌هاب اجرا می‌شود — بدون Railway، بدون کلود، بدون هیچ سرور دیگری. یک Codespace مثل یک ماشین ۲ هسته‌ای/۸ گیگ در ابر گیت‌هاب است که پورت ۳۰۰۰ را با HTTPS عمومی و پشتیبانی WebSocket بیرون می‌دهد (HTTPS معتبر = دوربین/میکروفون مرورگر کار می‌کند).

## راه الف — توکن به من بده، خودم همه را انجام می‌دهم

1. در گیت‌هاب: Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate
2. دو تیک: `repo` و `codespace`
3. توکن را همین‌جا در چت بفرست (یا env کن): من repo را می‌سازم، Codespace را راه می‌اندازم، اپ را بالا می‌برم و URL نهایی را می‌دهم.

## راه ب — خودت، ۴ قدم بدون توکن‌دادن

1. این پوشه را یک ریپوی خصوصی در گیت‌هاب کن:
   ```bash
   cd together-github-codespace
   git init && git add -A && git commit -m together && git branch -M main
   gh repo create together-app --private --source . --push     # یا آپلود از مرورگر در github.com/new
   ```
2. در صفحهٔ ریپو: **Code → Codespaces → Create codespace on main** (ماشین پیش‌فرض ۲core/8GB همان است که سهمیهٔ رایگان دارد)
3. در ترمینال Codespace:
   ```bash
   bash deploy/codespace-up.sh
   ```
4. پنل **Ports** → پورت ۳۰۰۰ → **Visibility: Public** → URL را باز کن:
   `https://<نام-codespace>-3000.app.github.dev`

اگر `gh` روی دستگاهت نصب است، قدم‌های ۲ تا ۴ خودکار می‌شود:
```bash
bash deploy/gh-codespace-deploy.sh
```

## محدودیت‌های واقعی (مستندات docs.github.com)

| موضوع | عدد |
|---|---|
| سهمیهٔ رایگان حساب شخصی | ۱۲۰ core-hour در ماه + ۱۵GB storage |
| ماشین ۲ هسته‌ای | یعنی ~۶۰ ساعت روشن در ماه |
| توقف خودکار بعد از بی‌کاری | ۳۰ دقیقه (تا ۲۴۰ دقیقه قابل تنظیم) |
| نگهداری codespace متوقف | ۳۰ روز |
| URL بعد از استاپ | ثابت می‌ماند ولی پاسخ نمی‌دهد؛ با `gh codespace start` یا بازکردن در گیت‌هاب دوباره بالا می‌آید |

هشدار صادقانه: Codespaces «سرور همیشه‌روشن» نیست — سهمیهٔ رایگان برای استفادهٔ واقعیِ روزانهٔ چندنفره کافی است ولی اپ بعد از نیم‌ساعت بی‌کاری خواب می‌شود و کاربر بعدی چند ده ثانیه تأخیر راه‌اندازی می‌بیند. برای demo و استفادهٔ خودتان عالی است؛ برای سرویس ۲۴/۷ یا باید هر وقت لازم شد روشنش کنید یا سرور واقعی (مسیر کلود: کف ~۱۲۵,۵۶۸).

## جزئیات فنی

- ایمیج اپ داخل Codespace از `Dockerfile` خود ریپو build می‌شود (`deploy/compose.codespace.yaml`) — هیچ رجیستری خارجی لازم نیست.
- Postgres رسمی (16-alpine) با volume دائمی داخل codespace؛ پسورد و URL در همان فایل compose.
- سیگنالینگ socket.io روی همان پورت ۳۰۰۰ از طریق WebSocket پروکسی می‌شود؛ ویدیو مستقیماً P2P بین دو مرورگر است و از سرور رد نمی‌شود.
- خاموش‌کردن دستی برای صرفه‌جویی: `gh codespace stop -c <name>`؛ روشن‌کردن: `gh codespace start -c <name>`.
