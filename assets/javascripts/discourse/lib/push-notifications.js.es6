import KeyValueStore from 'discourse/lib/key-value-store';

export const keyValueStore = new KeyValueStore("discourse_push_notifications_");

export function userSubscriptionKey(user) {
  return `subscribed-${user.get('id')}`;
}

function sendSubscriptionToServer(subscription) {
  Discourse.ajax('/push_notifications/subscribe', {
    type: 'POST',
    data: { subscription: subscription.toJSON() }
  });
}

function userAgentVersionChecker(agent, version, mobileView) {
  const uaMatch = navigator.userAgent.match(new RegExp(`${agent}\/(\\d+)\\.\\d`));
  if (uaMatch && mobileView) return false;
  if (!uaMatch || parseInt(uaMatch[1]) < version) return false;
  return true;
}

export function isPushNotificationsSupported(mobileView) {
  if (!(('serviceWorker' in navigator) &&
     (ServiceWorkerRegistration &&
     ('showNotification' in ServiceWorkerRegistration.prototype) &&
     ('PushManager' in window)))) {

    return false;
  }

  if ((!userAgentVersionChecker('Firefox', 44, mobileView)) &&
     (!userAgentVersionChecker('Chrome', 50))) {
    return false;
  }

  return true;
}

export function register(user, mobileView) {
  if (!isPushNotificationsSupported(mobileView)) return;

  navigator.serviceWorker.register(`${Discourse.BaseUri}/push-service-worker.js`).then(() => {
    if (Notification.permission === 'denied' || !user) return;

    navigator.serviceWorker.ready.then(serviceWorkerRegistration => {
      serviceWorkerRegistration.pushManager.getSubscription().then(subscription => {
        if (subscription) {
          sendSubscriptionToServer(subscription);
          // Resync localStorage
          keyValueStore.setItem(userSubscriptionKey(user), 'subscribed');
        }
      }).catch(e => Ember.Logger.error(e));
    });
  });
}

export function subscribe(callback) {
  if (!isPushNotificationsSupported()) return;

  navigator.serviceWorker.ready.then(serviceWorkerRegistration => {
    serviceWorkerRegistration.pushManager.subscribe({ userVisibleOnly: true }).then(subscription => {
      sendSubscriptionToServer(subscription);
      if (callback) callback();
    }).catch(e => Ember.Logger.error(e));
  });
}

export function unsubscribe(callback) {
  if (!isPushNotificationsSupported()) return;

  navigator.serviceWorker.ready.then(serviceWorkerRegistration => {
    serviceWorkerRegistration.pushManager.getSubscription().then(subscription => {
      if (subscription) {
        subscription.unsubscribe().then((successful) => {
          if (successful) {
            Discourse.ajax('/push_notifications/unsubscribe', {
              type: 'POST',
              data: { subscription: subscription.toJSON() }
            });
          }
        });
      }
    }).catch(e => Ember.Logger.error(e));

    if (callback) callback();
  });
}
