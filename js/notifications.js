      function updateNotificationControls() {
        const button = document.querySelector("#enable-notifications-button");
        const status = document.querySelector("#notification-status");
        if (!button || !status) {
          return;
        }

        const hasVehicle = Boolean(getPrimaryVehicleId());
        const hasNotificationApi = "Notification" in window;
        const preferences = getSavedNotificationPreferences();
        const isEnabled = hasNotificationApi &&
          Notification.permission === "granted" &&
          preferences.enabled === true;

        if (!hasVehicle) {
          status.textContent = "Ajoutez un véhicule principal pour activer ses notifications.";
          button.textContent = "Ajouter un véhicule";
          button.disabled = true;
          return;
        }
        if (!hasNotificationApi) {
          status.textContent = "Les notifications système ne sont pas disponibles dans ce navigateur.";
          button.textContent = "Indisponible";
          button.disabled = true;
          return;
        }
        if (Notification.permission === "denied") {
          status.textContent = "Les notifications sont bloquées. Autorisez-les dans les réglages du navigateur.";
          button.textContent = "Notifications bloquées";
          button.disabled = true;
          return;
        }
        if (isEnabled) {
          status.textContent = preferences.backgroundEnabled
            ? "Notifications actives pour ce véhicule, y compris lors des vérifications en arrière-plan."
            : "Notifications actives pour ce véhicule lorsque le navigateur peut effectuer la vérification.";
          button.textContent = "Notifications activées";
          button.disabled = true;
          return;
        }

        status.textContent = Notification.permission === "granted"
          ? "Autorisez SIYARATI à prévenir ce véhicule des échéances et entretiens à venir."
          : "Activez les notifications pour être prévenu des échéances et entretiens du véhicule principal.";
        button.textContent = "Activer";
        button.disabled = false;
      }

      async function registerBackgroundNotificationCheck() {
        if (!notificationRegistration) {
          return false;
        }

        if ("periodicSync" in notificationRegistration) {
          try {
            await notificationRegistration.periodicSync.register("siyarati-alert-check", {
              minInterval: 15 * 60 * 1000,
            });
            return true;
          } catch {
            // Some browsers expose periodicSync but require an installed PWA.
          }
        }

        if ("sync" in notificationRegistration) {
          try {
            await notificationRegistration.sync.register("siyarati-alert-check");
          } catch {
            // The foreground interval remains the fallback for this browser.
          }
        }
        return false;
      }

      function getNotificationSnapshot() {
        const vehicleId = getPrimaryVehicleId();
        if (!vehicleId) {
          return null;
        }

        const vehicle = getSavedVehicle();
        const currentMileage = getCurrentMileage();
        return {
          vehicleId,
          vehicleName: getVehicleDisplayName(vehicle),
          currentMileage,
          entries: getReminderEntries().map((entry) => ({
            key: entry.key,
            label: entry.label,
            category: entry.category || null,
            value: entry.value,
            date: entry.date ? entry.value : null,
            targetMileage: entry.targetMileage ?? null,
            currentMileage,
            action: entry.action || null,
          })),
          updatedAt: Date.now(),
        };
      }

      async function syncNotificationState({ notify = false } = {}) {
        if (!notificationRegistration?.active || !("Notification" in window) || Notification.permission !== "granted") {
          return false;
        }
        const snapshot = getNotificationSnapshot();
        const preferences = snapshot ? getSavedNotificationPreferences() : {};
        if (preferences.enabled !== true) {
          return postNotificationSyncMessage({
            type: "SYNC_ALERTS",
            activeVehicleId: "",
            snapshot: null,
            notify: false,
          });
        }

        return postNotificationSyncMessage({
          type: "SYNC_ALERTS",
          activeVehicleId: snapshot?.vehicleId || "",
          snapshot,
          notify,
        });
      }

      function postNotificationSyncMessage(message) {
        if (!notificationRegistration?.active) {
          return Promise.resolve(false);
        }

        if (!("MessageChannel" in window)) {
          notificationRegistration.active.postMessage(message);
          return Promise.resolve(true);
        }

        return new Promise((resolve) => {
          const channel = new MessageChannel();
          const timeout = window.setTimeout(() => resolve(false), 3000);
          channel.port1.addEventListener("message", (event) => {
            window.clearTimeout(timeout);
            resolve(event.data?.ok !== false);
          }, { once: true });
          notificationRegistration.active.postMessage(message, [channel.port2]);
        });
      }

      async function syncOfflineChanges({ notify = false } = {}) {
        if (navigator.onLine === false) {
          markOfflineSyncPending("modification hors connexion");
          return false;
        }

        updateConnectionStatus("syncing");
        const hasBackgroundNotificationAccess =
          Boolean(notificationRegistration?.active) &&
          "Notification" in window &&
          Notification.permission === "granted";
        const synced = hasBackgroundNotificationAccess
          ? await syncNotificationState({ notify })
          : true;

        if (synced) {
          clearOfflineSyncPending();
        } else {
          updateConnectionStatus();
        }
        return synced;
      }

      async function initializeNotificationSupport() {
        updateNotificationControls();
        if (!("serviceWorker" in navigator)) {
          return;
        }

        try {
          await navigator.serviceWorker.register("./sw.js");
          notificationRegistration = await navigator.serviceWorker.ready;
          const preferences = getSavedNotificationPreferences();
          if ("Notification" in window && Notification.permission === "granted" && preferences.enabled === true) {
            const backgroundEnabled = await registerBackgroundNotificationCheck();
            if (preferences.backgroundEnabled !== backgroundEnabled) {
              saveNotificationPreferences({ ...preferences, backgroundEnabled });
            }
            await syncOfflineChanges({ notify: true });
          }
          updateNotificationControls();
        } catch {
          updateNotificationControls();
        }
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type !== "OPEN_ALERTS") {
            return;
          }
          const vehicleId = event.data.vehicleId;
          if (vehicleId && getSavedVehicles().some((vehicle) => vehicle.id === vehicleId)) {
            setPrimaryVehicle(vehicleId);
          }
          showScreen("alerts");
        });
      }

      window.addEventListener("offline", () => {
        markOfflineSyncPending("connexion perdue");
      });

      window.addEventListener("online", () => {
        updateConnectionStatus("syncing");
        checkAlerts();
      });

