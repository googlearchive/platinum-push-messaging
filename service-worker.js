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
var DATA_SUPPORT = Notification.prototype.hasOwnProperty('data');

self.skipWaiting();

var getClientWindows = function() {
  return clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).catch(function(error) {
    // Couldn't get client list, possibly not yet implemented in the browser
    return [];
  })
};

var getVisible = function(url) {
  return getClientWindows().then(function(clientList) {
    for (var client of clientList) {
      if (client.url === url && client.focused &&
          client.visibilityState === 'visible') {
        return client;
      }
    }
    return null;
  });
};

var messageClient = function(client, message, notificationShown) {
  client.postMessage({
    source: self.registration.scope,
    message: message,
    type: notificationShown ? 'click' : 'push'
  });
};

var notify = function(data) {
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
    messagePromise = data ? data.json() : Promise.resolve({});
  }

  return messagePromise.then(function(message) {
    var detail = {
      title: message.title || options.title || '',
      body: message.message || options.message || '',
      tag: message.tag || options.tag || DEFAULT_TAG,
      icon: message.iconUrl || options.iconUrl,
      data: message
    };

    var clickUrl = message.clickUrl || options.clickUrl;

    if (!DATA_SUPPORT) {
      // If there is no 'data' property support on the notification then we have
      // to pass the link URL (and anything else) some other way. We use the
      // hash of the icon URL to store it.
      var iconUrl = new URL(detail.icon || 'about:blank');
      iconUrl.hash = encodeURIComponent(JSON.stringify(detail.data));
      detail.icon = iconUrl.href;
    }

    return getVisible(clickUrl).then(function(visibleClient) {
      if (visibleClient) {
        messageClient(visibleClient, message, false);
      } else {
        return self.registration.showNotification(detail.title, detail);
      }
    });
  });
};

var clickHandler = function(notification) {
  notification.close();

  var message;
  if ('data' in notification) {
    message = notification.data;
  } else {
    message = new URL(notification.icon).hash.substring(1);
    message = JSON.parse(decodeURIComponent(message));
  }

  var url = message.clickUrl || options.clickUrl;

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
  }).then(function(client) {
    if (client) {
      messageClient(client, message, true);
    }
  });
};

self.addEventListener('push', function(event) {
  event.waitUntil(notify(event.data));
});

self.addEventListener('notificationclick', function(event) {
  event.waitUntil(clickHandler(event.notification));
});
