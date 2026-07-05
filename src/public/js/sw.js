/* Service Worker لإشعارات Web Push */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'GetPrice', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'GetPrice';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/public/icon.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
