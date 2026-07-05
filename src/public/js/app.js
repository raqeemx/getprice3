/* GetPrice client — رسم بياني لتاريخ السعر + تفعيل Web Push */
(function () {
  // ===== الرسم البياني =====
  const el = document.getElementById('priceChart');
  if (el && window.Chart && Array.isArray(window.__SERIES__)) {
    const palette = ['#5b8cff', '#00c2a8', '#f59e0b', '#a855f7', '#ef4444'];
    // اجمع كل التواريخ لتوحيد المحور
    const labelsSet = new Set();
    window.__SERIES__.forEach((s) => s.points.forEach((p) => labelsSet.add(p.x)));
    const labels = [...labelsSet].sort();
    const datasets = window.__SERIES__.map((s, i) => {
      const map = new Map(s.points.map((p) => [p.x, p.y]));
      return {
        label: s.label,
        data: labels.map((l) => (map.has(l) ? map.get(l) : null)),
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '22',
        tension: 0.25,
        spanGaps: true,
        pointRadius: 0,
        borderWidth: 2,
      };
    });
    new window.Chart(el, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#9aa0be' } } },
        scales: {
          x: { ticks: { color: '#9aa0be', maxTicksLimit: 8 }, grid: { color: '#2a2f47' } },
          y: { ticks: { color: '#9aa0be' }, grid: { color: '#2a2f47' } },
        },
      },
    });
  }

  // ===== Web Push =====
  const pushBtn = document.getElementById('enablePush');
  if (pushBtn && window.__VAPID__) {
    const status = document.getElementById('pushStatus');
    pushBtn.addEventListener('click', async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          status.textContent = 'المتصفح لا يدعم الإشعارات.';
          return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          status.textContent = 'تم رفض الإذن.';
          return;
        }
        const reg = await navigator.serviceWorker.register('/public/js/sw.js');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.__VAPID__),
        });
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
        status.textContent = res.ok ? 'تم تفعيل الإشعارات ✅' : 'فشل التسجيل.';
      } catch (e) {
        status.textContent = 'خطأ: ' + e.message;
      }
    });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
})();
