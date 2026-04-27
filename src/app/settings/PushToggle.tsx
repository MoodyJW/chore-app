"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "./push-actions";
import styles from "./PushToggle.module.css";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushToggle() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  async function checkSubscription() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return; // No SW registered (likely in dev mode)
      
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (err) {
      console.error("Error checking push subscription:", err);
    }
  }

  async function subscribe() {
    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setError("Service worker is not registered. (Push is disabled in development)");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });

      const result = await savePushSubscription(JSON.stringify(subscription));
      if (result.success) {
        setIsSubscribed(true);
      } else {
        setError(result.error || "Failed to save subscription on server");
        await subscription.unsubscribe();
      }
    } catch (err: any) {
      console.error("Error subscribing to push:", err);
      setError(err.message || "Failed to subscribe");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setIsSubscribed(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
        // Note: In a production app, we should also delete the subscription from the DB
      } else {
        setIsSubscribed(false);
      }
    } catch (err: any) {
      console.error("Error unsubscribing:", err);
      setError(err.message || "Failed to unsubscribe");
    } finally {
      setLoading(false);
    }
  }

  if (!isSupported) {
    return (
      <div className={styles.unsupported}>
        Push notifications are not supported in this browser.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <span className={styles.title}>Daily Reminders</span>
        <span className={styles.desc}>
          Get a push notification if chores are incomplete by 7 PM.
        </span>
      </div>
      <div className={styles.actions}>
        {isSubscribed ? (
          <button
            className={`btn btn-ghost btn-sm ${styles.toggleBtn}`}
            onClick={unsubscribe}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : "Disable"}
          </button>
        ) : (
          <button
            className={`btn btn-primary btn-sm ${styles.toggleBtn}`}
            onClick={subscribe}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : "Enable"}
          </button>
        )}
      </div>
      {error && <p className={styles.error}>⚠️ {error}</p>}
    </div>
  );
}
