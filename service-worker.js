/*
  Copyright 2015 Google Inc. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
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
  var messagePromise;

  if (options.messageUrl) {
    messagePromise = fetch(options.messageUrl).then(function(response) {
      return response.json();
    }).then(function(data) {
      var messages = [];
      for (var key in data) {
        messages.push(data[key]);
      }
      return messages[0] || {};
    });
  } else {
    messagePromise = Promise.resolve({});
  }

  return messagePromise.then(function(message) {
    message.title = message.title || options.title || '';
    message.message = message.message || options.message || '';
    message.tag = message.tag || options.tag || DEFAULT_TAG;
    message.icon = message.iconUrl || options.iconUrl;
    message.clickUrl = message.clickUrl || options.clickUrl;

    var iconUrl = new URL(message.icon || 'about:blank');
    iconUrl.hash = encodeURIComponent(message.clickUrl);
    message.icon = iconUrl.href;

    return getVisible(message.clickUrl).then(function(visibleClient) {
      if (visibleClient) {
        // TODO: Do something here, like postMessage the client and trigger an event
      } else {
        return self.registration.showNotification(message.title, {
          body: message.message,
          tag: message.tag,
          icon: message.icon,
          data: message.clickUrl
        });
      }
    });
  });
};

var clickHandler = function(notification) {
  notification.close();

  var url = decodeURIComponent(new URL(notification.icon).hash.substring(1));

  if (!url) {
    return;
  }

  return getClientWindows().then(function(clientList) {
    for (var client of clientList) {
      if (client.url === url && 'focus' in client) {
        client.focus();
        return client;
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
