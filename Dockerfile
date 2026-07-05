# GetPrice — صورة تشغيل جاهزة
# Node 24 يوفّر node:sqlite المدمجة (لا حاجة لأي حزمة native)
FROM node:24-alpine

# مجلد العمل داخل الحاوية
WORKDIR /app

# ثبّت الحزم أولًا للاستفادة من طبقات الكاش
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# انسخ بقية المشروع
COPY . .

# مجلد قاعدة البيانات (يُربط بـ Volume دائم في الإنتاج)
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/getprice.db
# شغّل دورة جمع عند الإقلاع حتى تظهر بيانات فورًا (اختياري)
ENV RUN_ON_BOOT=true

EXPOSE 3000

# البيانات الدائمة يجب أن تبقى خارج طبقات الصورة
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
