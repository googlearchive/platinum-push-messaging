/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
'use strict';

var options = JSON.parse(decodeURIComponent(location.search.substring(1)));

var DEFAULT_TAG = self.registration.scope;
var DATA_SUPPORT = Notification.prototype.hasOwnProperty('data');

self.skipWaiting();

/**
 * Resolves a URL that is relative to the registering page to an absolute URL
 *
 * @param url {String} a relative URL
 * @return {String} the equivalent absolute URL
 */
var absUrl = function(url) {
  if (typeof(url) === 'string') {
    return new URL(url, options.baseUrl).href;
  }
};

var getClientWindows = function() {
  return clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).catch(function(error) {
    // Couldn't get client list, possibly not yet implemented in the browser
    return [];
  });
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
    var fetchOptions = {};

    if (options.useCredentials) {
      fetchOptions.credentials = 'include';
    }

    var request = new Request(absUrl(options.messageUrl), fetchOptions);

    messagePromise = fetch(request).then(function(response) {
      return response.json();
    });
  } else {
    messagePromise = data ? data.json() : Promise.resolve({});
  }

  return messagePromise.then(function(message) {
    // Not included: body, data, icon, sound, tag - we special case those
    var validNotificationOptions = ['dir', 'lang', 'noscreen', 'renotify',
        'silent', 'sticky', 'vibrate'];

    var detail = {
      title: message.title || options.title || '',
      body: message.message || options.message || '',
      tag: message.tag || options.tag || DEFAULT_TAG,
      icon: absUrl(message.icon || options.iconUrl),
      sound: absUrl(message.sound || options.sound),
      data: message
    };

    validNotificationOptions.forEach(function(option) {
      detail[option] = message[option] || options[option];
    });

    var clickUrl = absUrl(message.url || options.clickUrl);

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

  var url = absUrl(message.url || options.clickUrl);

  if (!url) {
    return;
  }

  // This is the focus URL.  If the "focus-url" property was not set, then this
  // will be undefined and will not be used.
  var focusUrl = absUrl( options.focusUrl );

  return getClientWindows().then(function(clientList) {
    // Go through the windows that this service worker controls.
    // Focus the first one that matches the message's URL.
    //
    // Attempt to match the first client that already has the desired URL open.
    //
    // Otherwise, if this service worker was configured with a "focus-url", then
    // attempt to match the first client that begins with that URL.
    //
    // A client matched in this way will receive a "platinum-push-messaging-*"
    // event.
    //
    // Finally, if no client was matched, then open up a new window to
    // show the URL.  This window will NOT receive a "platinum-push-messaging-*"
    // event.
    for (var client of clientList) {
      // Exclude client instances that do not support the properties that we need.
      if (!('url' in client) || !('focus' in client)) {
        continue;
      }
      // See if the client URL that we want is already up somewhere.
      // Otherwise, see if there is a window that starts with the focus URL
      // already open.
      if(client.url === url) {
        client.focus();
        return client;
      } else if (focusUrl && client.url.startsWith(focusUrl)) {
        client.focus();
        return client;
      }
    }
    // If no existing window could be used, then open a new one.
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

self.addEventListener('message', function(event) {
  if (event.data.type == 'test-push') {
    notify({
      json: function() {
        return Promise.resolve(event.data.message);
      }
    });
  }
});
