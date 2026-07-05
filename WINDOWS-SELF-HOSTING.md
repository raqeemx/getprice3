# 🖥️ تشغيل GetPrice حقيقيًا أونلاين من جهازك (ويندوز) — خطوة بخطوة

هذا الدليل يجعل جهازك بويندوز **خادمًا حيًّا على الإنترنت** لموقع GetPrice، برابط
`https` حقيقي يفتحه أي شخص من أي مكان — بدون استضافة مدفوعة.

الفكرة في 3 أجزاء:
1. **تشغيل التطبيق** على جهازك (Node).
2. **إبقاؤه يعمل دائمًا** (حتى بعد إعادة تشغيل الجهاز).
3. **فتح نفق آمن للإنترنت** (Cloudflare Tunnel) يعطيك رابطًا عامًّا مع HTTPS.

> ✅ ميزة الاستضافة على جهازك: قاعدة البيانات ملف محلي على قرصك، فتبقى بياناتك
> (الحسابات + تاريخ الأسعار) محفوظة تلقائيًا بلا أي إعداد إضافي.
>
> ⚠️ عيبها: **يجب أن يبقى جهازك يعمل ومتصلًا بالإنترنت** طوال الوقت حتى يعمل الموقع
> وتُجمع الأسعار وتُرسل التنبيهات.

---

## الجزء 1: تشغيل التطبيق على جهازك

### 1.1 ثبّت Node.js 24
حمّله من [nodejs.org](https://nodejs.org) (اختر **24.x**) وثبّته، أو عبر PowerShell:
```powershell
winget install OpenJS.NodeJS
```
تحقق من النسخة (يجب أن تكون 22.5 أو أحدث):
```powershell
node -v
```

### 1.2 اجلب المشروع
إن لم يكن على جهازك بعد، استنسخه (عدّل الرابط باسم مستودعك):
```powershell
cd $HOME\Documents\GitHub
git clone https://github.com/raqeemx/getprice3.git
cd getprice3
```
> إن كان المشروع موجودًا مسبقًا على جهازك، فقط ادخل مجلده:
> `cd $HOME\Documents\GitHub\getprice3`

### 1.3 ثبّت الحزم
```powershell
npm install
```

### 1.4 جهّز ملف الإعدادات `.env`
```powershell
Copy-Item .env.example .env
```
ولّد مفتاح جلسات قويًّا:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
افتح `.env` بالمفكرة وعدّل هذه القيم على الأقل:
```powershell
notepad .env
```
```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=<الصق الناتج من الأمر أعلاه>
PRICE_SOURCE=seed
RUN_ON_BOOT=true
```

### 1.5 ابذر بيانات تجريبية (اختياري لكن مفيد للتجربة)
```powershell
npm run seed
```
هذا ينشئ كتالوج هواتف + 4 متاجر + تاريخ 90 يومًا + مستخدمًا تجريبيًا:
`demo@getprice.local` / `demo1234`

### 1.6 شغّله وجرّبه محليًا
```powershell
npm start
```
افتح المتصفح على `http://localhost:3000` — يجب أن يظهر الموقع.
أوقفه مؤقتًا بـ `Ctrl + C` (سنجعله يعمل دائمًا في الجزء 2).

---

## الجزء 2: اجعله يعمل دائمًا (يبدأ تلقائيًا مع ويندوز)

نستخدم **PM2**، وهو مدير عمليات يشغّل التطبيق في الخلفية، يعيد تشغيله عند أي تعطّل،
ويبدأ تلقائيًا عند إقلاع ويندوز.

### 2.1 ثبّت PM2
```powershell
npm install -g pm2 pm2-windows-startup
```

### 2.2 فعّل الإقلاع التلقائي مع ويندوز
```powershell
pm2-startup install
```

### 2.3 شغّل التطبيق تحت PM2
من داخل مجلد المشروع:
```powershell
cd $HOME\Documents\GitHub\getprice3
pm2 start src/server.js --name getprice
```

### 2.4 احفظ الحالة ليعود تلقائيًا بعد إعادة التشغيل
```powershell
pm2 save
```

### أوامر PM2 المفيدة
```powershell
pm2 status              # حالة التطبيق
pm2 logs getprice       # متابعة السجل والتنبيهات مباشرة
pm2 restart getprice    # إعادة تشغيل (بعد أي تحديث)
pm2 stop getprice       # إيقاف
pm2 delete getprice     # إزالة من PM2
```

الآن التطبيق يعمل في الخلفية دائمًا على `http://localhost:3000`، حتى لو أغلقت نافذة
PowerShell أو أعدت تشغيل الجهاز.

---

## الجزء 3: افتح نفقًا آمنًا للإنترنت (Cloudflare Tunnel) 🌐

هذه أفضل طريقة لأنها:
- **مجانية** وتعطيك **HTTPS تلقائيًا**.
- **لا تحتاج فتح منافذ الراوتر (Port Forwarding)** ولا IP ثابت.
- تعمل حتى خلف شبكات الجوّال/CGNAT.
- لا تكشف عنوان منزلك مباشرة.

### 3.1 ثبّت cloudflared
```powershell
winget install Cloudflare.cloudflared
```
تحقق:
```powershell
cloudflared --version
```

---

### الخيار (أ): تجربة سريعة برابط مؤقت (بدون حساب/دومين)

مناسب لتجربة أن كل شيء يعمل. شغّل:
```powershell
cloudflared tunnel --url http://localhost:3000
```
سيظهر في الطرفية رابط مثل:
```
https://random-words-1234.trycloudflare.com
```
افتحه من أي جهاز/جوّال — هذا موقعك حيّ على الإنترنت ✅

> ⚠️ هذا الرابط **مؤقت** ويتغيّر كل مرة تشغّل فيها الأمر، ويتوقف عند إغلاق الطرفية.
> للاستخدام الدائم استخدم الخيار (ب).

---

### الخيار (ب): رابط ثابت باسم دومينك + خدمة دائمة (موصى به) ⭐

يتطلب دومينًا مربوطًا بـ Cloudflare (مجاني: أنشئ حسابًا على
[cloudflare.com](https://cloudflare.com) وأضف دومينك ووجّه الـ Nameservers إليه).

**1) سجّل دخول cloudflared إلى حسابك** (يفتح المتصفح للموافقة):
```powershell
cloudflared tunnel login
```

**2) أنشئ نفقًا باسم:**
```powershell
cloudflared tunnel create getprice
```
سيطبع **Tunnel ID** ويحفظ ملف اعتماد `.json` داخل `C:\Users\<اسمك>\.cloudflared\`.

**3) اربط الدومين بالنفق:**
```powershell
cloudflared tunnel route dns getprice app.yourdomain.com
```
(استبدل `app.yourdomain.com` بالنطاق الفرعي الذي تريده.)

**4) أنشئ ملف الإعداد** `C:\Users\<اسمك>\.cloudflared\config.yml`:
```powershell
notepad "$HOME\.cloudflared\config.yml"
```
والصق (عدّل `<TUNNEL_ID>` واسم ملف الاعتماد والدومين):
```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\<اسمك>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**5) جرّبه يدويًا أولًا:**
```powershell
cloudflared tunnel run getprice
```
افتح `https://app.yourdomain.com` — يجب أن يعمل الموقع. أوقفه بـ `Ctrl+C`.

**6) ثبّته كخدمة ويندوز تعمل دائمًا (تبدأ مع الإقلاع):**
```powershell
cloudflared service install
```
> الخدمة تقرأ `config.yml` تلقائيًا. تحقق من عملها من:
> `services.msc` (ابحث عن **cloudflared**) — أو أعد تشغيل الجهاز وتأكد أن الموقع يفتح.

الآن لديك موقع دائم على `https://app.yourdomain.com` يعمل من جهازك 🎉

---

## الجزء 4: الأمان والإعدادات المهمة 🔒

- **جدار حماية ويندوز:** لا تحتاج فتح أي منفذ للإنترنت، لأن Cloudflare Tunnel
  يخرج من جهازك للخارج (outbound). هذا أأمن من Port Forwarding.
- **لا تفتح منافذ الراوتر** إلا إذا كنت تعرف ما تفعل — النفق يغنيك عن ذلك.
- **HTTPS للجلسات:** يعمل تسجيل الدخول عبر النفق مباشرة. لتقوية الأمان (اختياري)
  يمكنني تعديل الكود لتفعيل `trust proxy` و`cookie.secure`.
- **حدّث ملف `.env`** بمفتاح `SESSION_SECRET` قوي (لا تتركه على القيمة الافتراضية).

---

## الجزء 5: تفعيل الأسعار الحقيقية والتنبيهات

### الأسعار الحقيقية (الزحف)
في `.env` غيّر:
```env
PRICE_SOURCE=scraper
SCRAPE_MIN_DELAY_MS=5000
SCRAPE_USER_AGENT=GetPriceBot/1.0 (+mailto:you@yourdomain.com)
```
ثم `pm2 restart getprice`.
⚠️ محدّدات المتاجر في `src/adapters/*.js` تقريبية وقد تحتاج تحديثًا، واحترم
`robots.txt` وشروط الاستخدام. راقب صحة الـ adapters من:
`https://app.yourdomain.com/api/health/adapters`

### التنبيهات (بريد/تيليجرام/متصفح)
اضبط متغيّرات `SMTP_*` و`TELEGRAM_BOT_TOKEN` و`VAPID_*` في `.env`
(التفاصيل في [README.md](README.md) و[.env.example](.env.example))، ثم `pm2 restart getprice`.
أي قناة غير مضبوطة تسقط تلقائيًا إلى سجل الخادم (تراه بـ `pm2 logs getprice`).

---

## الجزء 6: التحديث بعد أي تعديل على GitHub 🔄
```powershell
cd $HOME\Documents\GitHub\getprice3
git pull
npm install
pm2 restart getprice
```

---

## الجزء 7: حل المشكلات الشائعة 🧯

| المشكلة | الحل |
|--------|------|
| `node -v` أقل من 22.5 | ثبّت Node 24 من nodejs.org |
| الموقع لا يفتح محليًا | `pm2 logs getprice` لرؤية الخطأ؛ تأكد أن المنفذ 3000 غير مستخدم |
| الرابط العام لا يعمل | تأكد أن `cloudflared` يعمل (`services.msc`) وأن `config.yml` يشير إلى `localhost:3000` |
| فقدت البيانات | البيانات في `data\getprice.db` — لا تحذف مجلد `data` |
| الموقع يتوقف ليلًا | جهازك دخل وضع السكون — عطّل السكون: **Settings → Power → Screen and sleep → Never** |
| التطبيق لا يبدأ بعد إعادة التشغيل | تأكد نفّذت `pm2 save` و`pm2-startup install` |
| الأسعار فارغة | شغّل `npm run seed` أو فعّل `PRICE_SOURCE=scraper` |

---

## ملخص الأوامر (نسخة سريعة) ⚡
```powershell
# مرة واحدة
winget install OpenJS.NodeJS
winget install Cloudflare.cloudflared
cd $HOME\Documents\GitHub\getprice3
npm install
Copy-Item .env.example .env      # ثم عدّل SESSION_SECRET
npm run seed
npm install -g pm2 pm2-windows-startup
pm2-startup install

# التشغيل الدائم
pm2 start src/server.js --name getprice
pm2 save

# النفق الدائم (بعد إعداد config.yml)
cloudflared service install
```

> اختر: **الخيار (أ)** لتجربة سريعة (`cloudflared tunnel --url http://localhost:3000`)،
> أو **الخيار (ب)** لرابط ثابت باسم دومينك.

لو أخبرتني هل لديك دومين أم تريد الرابط المؤقت فقط، أرشدك بدقة في الخطوات المتبقية،
ويمكنني أيضًا تفعيل إعدادات HTTPS الآمنة في الكود.
