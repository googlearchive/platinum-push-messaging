'use strict';

var options = JSON.parse(decodeURIComponent(location.search.substring(1)));

var DEFAULT_TAG = self.registration.scope;

self.skipWaiting();

var getClientWindows = function() {
  return clients.matchAll({type: 'window', includeUncontrolled: true}).catch(function(error) {
    // Couldn't get client list, possibly not yet implemented in the browser
    return [];
  })
};

var getVisible = function(url) {
  return getClientWindows().then(function(clientList) {
    for (var client of clientList) {
      if (client.url === url && client.focused && client.visibilityState === 'visible') {
        return client;
      }
    }
    return null;
  });
};

var notify = function() {
  // TODO: Investigate {credentials: 'include'}
  // TODO: Including auth params in the options isn't going to work. Access
  // tokens, etc., expire :(
  return fetch(options.messageUrl).then(function(response) {
    return response.json();
  }).then(function(data) {
    var messages = [];
    for (var key in data) {
      messages.push(data[key]);
    }
    return messages[0] || {};
  }).then(function(message) {
    return getVisible(message.url).then(function(visibleClient) {
      if (visibleClient) {
        // TODO: Do something here, like postMessage the client and trigger an event
      } else {
        // TODO: Have better configuration for how JSON data maps to notifications
        return self.registration.showNotification(message.title || options.title, {
          body: message.message || options.message || '',
          tag: message.url || message.tag || options.tag || DEFAULT_TAG,
          icon: message.icon || options.icon,
        });
      }
    });
  });
};

var clickHandler = function(notification) {
  notification.close();

  var url = options.clickUrl || notification.tag;

  return getClientWindows().then(function(clientList) {
    for (var client of clientList) {
      if (client.url === url && 'focus' in client) {
        return client.focus();
      }
    }
    if ('openWindow' in clients) {
      return clients.openWindow(url);
    }
  });
};

self.addEventListener('push', function(event) {
  event.waitUntil(notify());
});

self.addEventListener('notificationclick', function(event) {
  event.waitUntil(clickHandler(event.notification));
});
