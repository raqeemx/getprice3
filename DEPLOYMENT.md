# 🚀 دليل تشغيل GetPrice حقيقيًا أونلاين (خطوة بخطوة)

هذا الدليل يشرح كيف تنقل مشروعك من GitHub إلى موقع حيّ يعمل على الإنترنت برابط حقيقي.

---

## 0) قبل أن تبدأ — 3 حقائق مهمة عن هذا المشروع

اقرأها لتفهم لماذا نختار استضافة معيّنة دون غيرها:

1. **يحتاج خادمًا يعمل باستمرار (Always‑on)، وليس Serverless.**
   المشروع يشغّل مهامًا مجدولة داخله (`node-cron`) لجمع الأسعار وإطلاق التنبيهات.
   لذلك **لا يصلح** على Vercel أو Netlify (serverless functions تنام بين الطلبات).
   يصلح على: **VPS، Railway، Render (Web Service)، Fly.io، أو أي خادم Node دائم**.

2. **يحتاج Node.js نسخة 22.5 أو أحدث** (يُفضّل 24)، لأنه يستخدم قاعدة SQLite
   المدمجة `node:sqlite`. تأكد أن المنصة تستخدم Node 24 (ملف `.nvmrc` موجود مسبقًا).

3. **قاعدة البيانات ملف على القرص** (`data/getprice.db`).
   على المنصات السحابية القرص «مؤقت» ويُمسح عند كل إعادة نشر.
   لذلك **يجب ربط قرص دائم (Persistent Disk / Volume)** بالمسار `data/` وإلا ستفقد
   الحسابات وتاريخ الأسعار عند كل تحديث. (كل طريقة أدناه تشرح كيف.)

---

## 1) جهّز متغيّرات البيئة (مطلوب لكل الطرق)

المشروع يعمل بإعدادات افتراضية، لكن للإنتاج الحقيقي اضبط على الأقل:

| المتغيّر | القيمة | لماذا |
|---------|--------|-------|
| `NODE_ENV` | `production` | يخفي رسائل الأخطاء التفصيلية |
| `PORT` | تُحدّده المنصة تلقائيًا غالبًا | منفذ الاستماع |
| `SESSION_SECRET` | نص عشوائي طويل | تشفير جلسات الدخول — **إلزامي** |
| `DB_PATH` | `./data/getprice.db` | مسار القرص الدائم |
| `PRICE_SOURCE` | `seed` أو `scraper` | مصدر الأسعار (اشرح لاحقًا) |
| `RUN_ON_BOOT` | `true` | يجمع الأسعار مرة عند الإقلاع |

**ولّد `SESSION_SECRET` قويًا:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

القائمة الكاملة للمتغيّرات موجودة في ملف [`.env.example`](.env.example) (بريد SMTP،
Telegram، Web Push...). انسخها واضبط ما تحتاجه.

---

## 2) الطريقة الأسهل — Railway (موصى بها للمبتدئين) 🚂

خادم دائم + قرص دائم بأقل مجهود.

1. ادخل [railway.app](https://railway.app) وسجّل عبر GitHub.
2. **New Project → Deploy from GitHub repo** واختر مستودع `getprice3`.
3. Railway سيكتشف Node تلقائيًا ويشغّل `npm start`.
4. **أضف قرصًا دائمًا:** من إعدادات الخدمة → **Volumes → New Volume**
   واربطه بالمسار: `/app/data`
5. **أضف المتغيّرات:** تبويب **Variables**:
   ```
   NODE_ENV=production
   SESSION_SECRET=<الناتج من الأمر أعلاه>
   DB_PATH=/app/data/getprice.db
   PRICE_SOURCE=seed
   RUN_ON_BOOT=true
   ```
6. **تأكد من نسخة Node:** ملف `.nvmrc` (24) موجود، لكن إن احتجت أضف متغيّرًا
   `NIXPACKS_NODE_VERSION=24`.
7. **بذر البيانات التجريبية (مرة واحدة):** من تبويب الأوامر/Shell شغّل:
   ```bash
   npm run seed
   ```
   (أو احذف هذه الخطوة إذا ستضيف هواتف حقيقية عبر الواجهة.)
8. من **Settings → Networking → Generate Domain** ستحصل على رابط
   `https://xxxx.up.railway.app` — هذا موقعك الحيّ ✅

---

## 3) بديل ممتاز — Render 🎨

1. ادخل [render.com](https://render.com) → **New → Web Service** واربط GitHub.
2. الإعدادات:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. **أضف قرصًا دائمًا:** تبويب **Disks → Add Disk**
   - **Mount Path:** `/opt/render/project/src/data`
   - **Size:** 1 GB يكفي
4. **Environment Variables:**
   ```
   NODE_ENV=production
   SESSION_SECRET=<عشوائي طويل>
   DB_PATH=/opt/render/project/src/data/getprice.db
   PRICE_SOURCE=seed
   RUN_ON_BOOT=true
   ```
5. **نسخة Node:** أضف متغيّرًا `NODE_VERSION=24` (أو اعتمد `.nvmrc`).
6. **Deploy**. بعد النجاح تحصل على رابط `https://xxxx.onrender.com` ✅
7. للبذر مرة واحدة: افتح **Shell** من لوحة Render وشغّل `npm run seed`.

> ملاحظة: خطة Render المجانية قد تُنيم الخدمة بعد خمول — استخدم خطة مدفوعة صغيرة
> لضمان عمل الجدولة (poller) على مدار الساعة.

---

## 4) الطريقة الاحترافية — خادم VPS خاص (تحكّم كامل) 🖥️

الأفضل إذا تريد **تفعيل الزحف الحقيقي** واستقرارًا كاملًا. مثال على Ubuntu 22/24
(DigitalOcean / Hetzner / Contabo / AWS Lightsail...).

### 4.1 تجهيز الخادم
```bash
# اتصل بالخادم
ssh root@YOUR_SERVER_IP

# ثبّت Node 24 عبر nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 24
nvm alias default 24

# ثبّت git و nginx
apt update && apt install -y git nginx
```

### 4.2 جلب المشروع وتشغيله
```bash
cd /var/www
git clone https://github.com/raqeemx/getprice3.git
cd getprice3

npm install --omit=dev

# جهّز الإعدادات
cp .env.example .env
nano .env   # اضبط SESSION_SECRET و NODE_ENV=production ... إلخ

# بذر بيانات أولية (اختياري)
npm run seed

# جرّب التشغيل يدويًا للتأكد
npm start   # ثم Ctrl+C بعد التأكد من ظهور "GetPrice يعمل على ..."
```

### 4.3 اجعله يعمل دائمًا عبر systemd
أنشئ الخدمة:
```bash
nano /etc/systemd/system/getprice.service
```
والصق (عدّل المسار واسم المستخدم إن لزم):
```ini
[Unit]
Description=GetPrice price monitor
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/getprice3
# عدّل المسار لنسخة node من nvm:
ExecStart=/root/.nvm/versions/node/v24.14.0/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
# باقي المتغيّرات تُقرأ من ملف .env تلقائيًا

[Install]
WantedBy=multi-user.target
```
> لمعرفة مسار node الصحيح: `which node`

فعّلها:
```bash
systemctl daemon-reload
systemctl enable --now getprice
systemctl status getprice        # تأكد active (running)
journalctl -u getprice -f        # لمتابعة السجل والتنبيهات مباشرة
```

### 4.4 اربط دومين + HTTPS عبر Nginx
```bash
nano /etc/nginx/sites-available/getprice
```
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
ln -s /etc/nginx/sites-available/getprice /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# شهادة HTTPS مجانية
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
الآن موقعك على `https://yourdomain.com` ✅

> **مهم للجلسات خلف HTTPS:** إذا استخدمت دومين HTTPS، أضف في `src/server.js`
> `app.set('trust proxy', 1)` وفعّل `cookie.secure = true` (يمكنني عمل ذلك لك).

---

## 5) طريقة Docker (تعمل في أي مكان) 🐳

المشروع يحتوي [`Dockerfile`](Dockerfile) جاهزًا.

```bash
# بناء الصورة
docker build -t getprice .

# التشغيل مع قرص دائم للبيانات + متغيّرات
docker run -d --name getprice \
  -p 3000:3000 \
  -v getprice_data:/app/data \
  -e SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
  -e PRICE_SOURCE=seed \
  getprice

# بذر البيانات مرة واحدة
docker exec -it getprice npm run seed
```
يعمل على أي منصة تدعم Docker (Fly.io، Railway، DigitalOcean App Platform، خادمك الخاص).

---

## 6) تفعيل الأسعار الحقيقية (الزحف) 🕷️

بشكل افتراضي `PRICE_SOURCE=seed` (بيانات محاكاة آمنة). لتفعيل الجلب الحقيقي:

```env
PRICE_SOURCE=scraper
SCRAPE_MIN_DELAY_MS=5000
SCRAPE_USER_AGENT=GetPriceBot/1.0 (+mailto:you@yourdomain.com)
```

⚠️ **قبل التفعيل اعلم:**
- محدّدات الأسعار (CSS selectors) في `src/adapters/*.js` **تقريبية** وقد تحتاج تحديثًا
  حسب التصميم الحالي لكل متجر. جرّب متجرًا واحدًا وتحقق من السجل.
- **احترم `robots.txt` وشروط الاستخدام** لكل متجر، واستخدم معدلات طلب منخفضة.
- الأفضل والأكثر استقرارًا: استخدام **APIs رسمية / Affiliate APIs** عند توفّرها —
  أضِف adapter جديدًا في `src/adapters/` وسجّله في `index.js` دون تغيير باقي النظام.
- إذا فشل adapter عدة مرات يصلك **تنبيه إداري** على `ADMIN_EMAIL`.

راقب صحة الـ adapters عبر: `https://yourdomain.com/api/health/adapters`

---

## 7) تفعيل قنوات التنبيه الحقيقية 🔔

اضبط في `.env` / متغيّرات المنصة:

**البريد (SMTP):**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app-password       # كلمة مرور تطبيق، وليست كلمة مرورك العادية
MAIL_FROM="GetPrice <you@gmail.com>"
ADMIN_EMAIL=you@gmail.com
```

**Telegram:** أنشئ بوت عبر [@BotFather](https://t.me/BotFather) وضع التوكن:
```env
TELEGRAM_BOT_TOKEN=123456:ABC...
```
ثم كل مستخدم يضع `Chat ID` الخاص به من صفحة الإعدادات.

**إشعارات المتصفح (Web Push):** ولّد المفاتيح:
```bash
npx web-push generate-vapid-keys
```
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@yourdomain.com
```
> Web Push يتطلب HTTPS (يعمل تلقائيًا بعد خطوة الشهادة أعلاه).

أي قناة غير مُعدّة تسقط تلقائيًا إلى **Console** (سجل الخادم) فلا يضيع أي تنبيه.

---

## 8) التحديث بعد أي تعديل على GitHub 🔄

**VPS:**
```bash
cd /var/www/getprice3
git pull
npm install --omit=dev
systemctl restart getprice
```
**Railway / Render:** يعيدان النشر تلقائيًا عند كل `git push` (طالما القرص الدائم مربوط، تبقى البيانات).

---

## 9) حل المشكلات الشائعة 🧯

| العرض | السبب المرجّح | الحل |
|------|----------------|------|
| `SqliteError` أو `require('node:sqlite')` يفشل | Node أقدم من 22.5 | فعّل Node 24 (`.nvmrc` / `NODE_VERSION`) |
| فقدان الحسابات بعد إعادة النشر | لا يوجد قرص دائم | اربط Volume بالمسار `data/` واضبط `DB_PATH` عليه |
| الجدولة (poller) لا تعمل | استضافة serverless أو خطة تنام | استخدم خادمًا دائمًا (VPS/خطة مدفوعة) |
| تسجيل الدخول لا يثبت خلف HTTPS | إعداد الكوكيز/البروكسي | فعّل `trust proxy` + `cookie.secure` |
| لا تصل الإيميلات | SMTP غير مضبوط | راجع متغيّرات SMTP وكلمة مرور التطبيق |
| العروض فارغة | لم تُبذر البيانات ولا يوجد زحف | شغّل `npm run seed` أو فعّل `scraper` |

---

## خلاصة سريعة ✅

- **أسرع طريق:** Railway + Volume على `/app/data` + المتغيّرات = موقع حيّ خلال دقائق.
- **أقوى طريق:** VPS + systemd + Nginx + Certbot = تحكم كامل وزحف حقيقي.
- **لا تنسَ:** `SESSION_SECRET` قوي، قرص دائم للـ `data/`، وNode 24.

لو أخبرتني بالمنصة التي اخترتها، أضبط لك ملفات الإعداد الخاصة بها (مثل `trust proxy`
للـ HTTPS أو `render.yaml`) مباشرة.
