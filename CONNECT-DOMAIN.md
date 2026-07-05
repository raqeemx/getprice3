# 🌐 ربط دومينك بموقع GetPrice عبر Cloudflare Tunnel (نطاق فرعي)

هذا الدليل مخصّص لحالتك:
- **دومينك ليس مضافًا إلى Cloudflare بعد** → سنضيفه أولًا (الجزء أ).
- **تريد نطاقًا فرعيًا** مثل `getprice.example.com` → سنربطه بالنفق (الجزء ب).

> في كل الأوامر أدناه، استبدل:
> - `example.com` بدومينك الحقيقي.
> - `getprice.example.com` بالنطاق الفرعي الذي تريده.
> - `<اسمك>` باسم مستخدم ويندوز عندك.

**متطلب مسبق:** أن يكون التطبيق يعمل محليًا على `http://localhost:3000` عبر PM2
(انظر [WINDOWS-SELF-HOSTING.md](WINDOWS-SELF-HOSTING.md) الجزء 1 و2). تحقق:
```powershell
pm2 status
```

---

## الجزء (أ): أضِف دومينك إلى Cloudflare (مرة واحدة)

النفق المسمّى يحتاج أن يدير Cloudflare إعدادات DNS لدومينك. هذه الخطوة مجانية.

### أ.1 أنشئ حساب Cloudflare
سجّل في [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (مجاني).

### أ.2 أضِف دومينك
1. من اللوحة: **Add a site** → اكتب `example.com` → **Continue**.
2. اختر الخطة **Free** → **Continue**.
3. Cloudflare سيفحص سجلّاتك الحالية ويعرضها. اضغط **Continue**.

### أ.3 غيّر الـ Nameservers عند مُسجّل الدومين
سيعطيك Cloudflare **اسمَي Nameserver** مثل:
```
xxxx.ns.cloudflare.com
yyyy.ns.cloudflare.com
```
اذهب إلى لوحة **الشركة التي سجّلت الدومين منها** (GoDaddy / Namecheap / Name.com ...)
→ إعدادات DNS / Nameservers → **استبدل** الـ Nameservers القديمة بهذين الاثنين.

### أ.4 انتظر التفعيل
عُد إلى Cloudflare واضغط **Done, check nameservers**. قد يستغرق التفعيل من دقائق
إلى بضع ساعات. عندما تصبح حالة الدومين **Active** (يصلك بريد أيضًا)، أكمل الجزء ب.

> يمكنك التحقق من حالة الانتشار عبر [whatsmydns.net](https://www.whatsmydns.net)
> (اختر نوع NS واكتب دومينك).

---

## الجزء (ب): أنشئ النفق واربط النطاق الفرعي

### ب.1 ثبّت cloudflared (إن لم يكن مثبتًا)
```powershell
winget install Cloudflare.cloudflared
cloudflared --version
```

### ب.2 سجّل دخول cloudflared إلى حسابك
```powershell
cloudflared tunnel login
```
سيفتح المتصفح → اختر دومينك `example.com` → **Authorize**.
سيُحفظ ملف `cert.pem` في `C:\Users\<اسمك>\.cloudflared\`.

### ب.3 أنشئ النفق
```powershell
cloudflared tunnel create getprice
```
سيطبع سطرًا مثل:
```
Created tunnel getprice with id  a1b2c3d4-....-....-....-............
```
**انسخ الـ Tunnel ID** — ستحتاجه. ويُحفظ ملف اعتماد `<TUNNEL_ID>.json` في نفس المجلد.

### ب.4 اربط النطاق الفرعي بالنفق (يُنشئ سجل DNS تلقائيًا)
```powershell
cloudflared tunnel route dns getprice getprice.example.com
```

### ب.5 أنشئ ملف الإعداد `config.yml`
```powershell
notepad "$HOME\.cloudflared\config.yml"
```
الصق التالي، وعدّل `<TUNNEL_ID>` و`<اسمك>` والنطاق الفرعي:
```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<اسمك>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: getprice.example.com
    service: http://localhost:3000
  - service: http_status:404
```
احفظ وأغلق.

### ب.6 جرّب النفق يدويًا
```powershell
cloudflared tunnel run getprice
```
افتح من أي جهاز: `https://getprice.example.com` — يجب أن يظهر الموقع بـ HTTPS ✅
ثم أوقفه بـ `Ctrl + C`.

### ب.7 ثبّته كخدمة ويندوز دائمة (تبدأ مع الإقلاع)
```powershell
cloudflared service install
```
الخدمة تقرأ `config.yml` تلقائيًا وتعمل في الخلفية دائمًا.
تحقق من `services.msc` (ابحث عن **Cloudflare Tunnel** / **cloudflared**) أنها Running.

🎉 الآن موقعك حيّ ودائم على `https://getprice.example.com` من جهازك.

---

## بعد الربط: نقطتان مهمّتان

### 1) فعّل HTTPS الآمن للجلسات (موصى به)
بما أن الموقع صار على HTTPS، يُفضّل أن أفعّل في الكود `trust proxy` و`cookie.secure`
ليكون تسجيل الدخول أكثر أمانًا. أخبرني لأطبّقه (تعديل بسيط في `src/server.js`).

### 2) لا يتوقف الموقع
- **أبقِ الجهاز يعمل** ومتصلًا بالإنترنت.
- عطّل السكون: **Settings → System → Power → Screen and sleep → When plugged in, put my device to sleep → Never**.

---

## حل المشكلات

| المشكلة | الحل |
|--------|------|
| `tunnel login` لا يعرض دومينك | الدومين لم يصبح Active على Cloudflare بعد — انتظر انتشار الـ NS |
| `error 1033` أو صفحة Cloudflare بدل الموقع | النفق لا يعمل — تأكد أن خدمة cloudflared Running وأن `config.yml` صحيح |
| `502 Bad Gateway` | التطبيق لا يعمل على 3000 — نفّذ `pm2 status` و`pm2 restart getprice` |
| الموقع يفتح ثم يتوقف | الجهاز نام — عطّل وضع السكون |
| بعد تعديل `config.yml` لم يتغيّر شيء | أعد تشغيل الخدمة: `net stop cloudflared` ثم `net start cloudflared` |

---

## ملخص أوامر الجزء (ب) ⚡
```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create getprice
cloudflared tunnel route dns getprice getprice.example.com
notepad "$HOME\.cloudflared\config.yml"   # الصق الإعداد
cloudflared tunnel run getprice           # تجربة
cloudflared service install               # تثبيت دائم
```

> أرسل لي **دومينك والنطاق الفرعي** لأعطيك هذه الأوامر مملوءة بقيَمك الحقيقية جاهزة للّصق.
