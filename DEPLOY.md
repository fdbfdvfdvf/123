# انتشار آنلاین Together — ۳۰ ثانیه تا ۳ دقیقه

اپ **۱۰۰٪ استاتیک و بدون بک‌اند** است (P2P). هر جا این فایل میزبانی شود، لینک دعوت اتاق‌ها خودکار آنلاین می‌شود: `https://دامنه-شما/#r=CODE`. هیچ دیتابیس یا سرویس دیگری لازم نیست.

## مسیر ۱ — Railway (با CLI، ~۲ دقیقه)

```bash
cd deploy                     # پوشهٔ deploy کنار این فایل
npm i -g @railway/cli
railway login                 # با اکانت Railway خودتان
railway init --name together  # پروژهٔ جدید
railway up                    # build با Dockerfile موجود در همین پوشه
railway domain                # ساخت دامنهٔ عمومی → لینک آنلاین شما
```

Health check روی `/healthz` است و `railway.json` تنظیمات build/restart را دارد.
(مسیر وب بدون CLI: محتوای این پوشه را در یک ریپوی GitHub بگذارید → Railway → New Project → Deploy from GitHub repo → Settings → Networking → Generate Domain.)

## مسیر ۲ — Netlify Drop (سریع‌ترین، بدون CLI)

1. https://app.netlify.com/drop را باز کنید و **فقط `index.html`** را درگ‌ودراپ کنید.
2. بلافاصله لینک https می‌گیرید — همان لینک دعوت اتاق.

## مسیر ۳ — Vercel / هر هاست استاتیک

```bash
npx vercel deploy/            # یا آپلود index.html روی GitHub Pages و…
```

## بعد از انتشار

- لینک دعوت را از دکمهٔ «دعوت» داخل اتاق کپی کنید — به‌طور خودکار روی دامنهٔ جدید ساخته می‌شود.
- مهمان بدون ثبت‌نام و بدون نصب چیزی وارد می‌شود.
- **یادآوری صادقانهٔ معماری P2P:** اتاق تا وقتی میزبانش تب را باز دارد زنده است؛ داده‌ها مستقیم بین دستگاه‌ها می‌روند و هیچ چیزی روی سرور ذخیره نمی‌شود. نسخهٔ سرور-محور (اتاق‌های دائمی + مرورگر مشترک کامل) در `../blueprint-fa.md` طراحی شده است.
