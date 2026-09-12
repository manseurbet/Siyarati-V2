const DATABASE_NAME = "siyarati-notifications";
const DATABASE_VERSION = 2;
const APP_CACHE_NAME = "siyarati-app-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/core-storage.js",
  "./js/notifications.js",
  "./js/documents-vehicles.js",
  "./js/reminders-alerts.js",
  "./js/events-wiring.js",
  "./js/vehicle-form.js",
  "./js/bootstrap.js",
];
const ACTIVE_VEHICLE_KEY = "activeVehicleId";
const PERIODIC_CHECK_TAG = "siyarati-alert-check";

function cacheAppShell() {
  return caches.open(APP_CACHE_NAME).then(async (cache) => {
    await Promise.all(APP_SHELL.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // A temporary network failure must not prevent the worker from installing.
      }
    }));
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith("siyarati-app-") && cacheName !== APP_CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const cache = await caches.open(APP_CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      if (event.request.mode === "navigate") {
        return caches.match("./index.html");
      }
      throw new Error("Ressource indisponible hors connexion");
    }
  })());
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) {
        database.createObjectStore("snapshots", { keyPath: "vehicleId" });
      }
      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("deliveries")) {
        database.createObjectStore("deliveries", { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readRecord(storeName, key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function writeRecord(storeName, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function claimDelivery(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("deliveries", "readwrite");
    const request = transaction.objectStore("deliveries").add({ id, sentAt: Date.now() });
    request.addEventListener("success", () => resolve(true));
    request.addEventListener("error", (event) => {
      event.preventDefault();
      if (request.error?.name === "ConstraintError") {
        resolve(false);
      } else {
        reject(request.error);
      }
    });
  });
}

function getDateStatus(date) {
  if (!date) {
    return "upcoming";
  }
  const hoursRemaining = (new Date(`${date}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursRemaining < 0) {
    return "expired";
  }
  const daysRemaining = hoursRemaining / 24;
  if (daysRemaining <= 2) {
    return "critical";
  }
  if (daysRemaining <= 3) {
    return "warning";
  }
  if (daysRemaining <= 7) {
    return "safe";
  }
  return "upcoming";
}

function getMileageStatus(targetMileage, currentMileage) {
  const parsedTargetMileage = targetMileage === null || targetMileage === undefined
    ? NaN
    : Number(targetMileage);
  const parsedCurrentMileage = currentMileage === null || currentMileage === undefined
    ? NaN
    : Number(currentMileage);
  if (!Number.isFinite(parsedTargetMileage) || !Number.isFinite(parsedCurrentMileage)) {
    return "upcoming";
  }
  const mileageRemaining = parsedTargetMileage - parsedCurrentMileage;
  if (mileageRemaining < 0) {
    return "expired";
  }
  if (mileageRemaining <= 100) {
    return "critical";
  }
  if (mileageRemaining <= 200) {
    return "warning";
  }
  if (mileageRemaining <= 300) {
    return "safe";
  }
  return "upcoming";
}

function getMostUrgentStatus(...statuses) {
  const priority = { upcoming: 0, safe: 1, warning: 2, critical: 3, expired: 4 };
  return statuses.sort((first, second) => priority[second] - priority[first])[0] || "upcoming";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatMileage(value) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} km`;
}

function getNotificationBody(entry, status) {
  const label = entry.category ? `${entry.category} · ${entry.label}` : entry.label;
  const mileageRemaining = Number.isFinite(entry.targetMileage) && Number.isFinite(entry.currentMileage)
    ? entry.targetMileage - entry.currentMileage
    : null;
  if (status === "expired") {
    return `Échéance dépassée : ${label}. À traiter maintenant.`;
  }
  if (status === "critical") {
    return entry.date
      ? `Alerte critique : ${label} arrive le ${formatDate(entry.date)}.`
      : `Alerte critique : ${label} dans ${Math.max(0, Math.ceil(mileageRemaining))} km.`;
  }
  if (status === "warning") {
    return entry.date
      ? `Échéance proche : ${label} le ${formatDate(entry.date)}.`
      : `${label} est à prévoir dans ${Math.max(0, Math.ceil(mileageRemaining))} km.`;
  }
  return entry.date
    ? `${label} approche : échéance le ${formatDate(entry.date)}.`
    : `${label} approche : objectif à ${formatMileage(entry.targetMileage)}.`;
}

function getEvaluatedEntry(entry) {
  const dateStatus = getDateStatus(entry.date);
  const mileageStatus = getMileageStatus(
    entry.targetMileage,
    entry.currentMileage,
  );
  return {
    ...entry,
    status: getMostUrgentStatus(dateStatus, mileageStatus),
  };
}

async function deliverSnapshot(snapshot) {
  if (!snapshot?.vehicleId || !Array.isArray(snapshot.entries)) {
    return;
  }

  const entries = snapshot.entries
    .map(getEvaluatedEntry)
    .filter((entry) => entry.status !== "upcoming" && entry.action?.state !== "done")
    .filter((entry) => {
      if (entry.action?.state !== "snoozed" || !entry.action.until) {
        return true;
      }
      return new Date(`${entry.action.until}T23:59:59`).getTime() <= Date.now();
    });

  for (const entry of entries) {
    const deliveryId = [
      snapshot.vehicleId,
      entry.key,
      entry.status,
      entry.value ?? entry.targetMileage ?? "",
    ].join(":");
    if (!(await claimDelivery(deliveryId))) {
      continue;
    }

    await self.registration.showNotification(`SIYARATI · ${snapshot.vehicleName}`, {
      body: getNotificationBody(entry, entry.status),
      tag: deliveryId,
      renotify: false,
      data: {
        vehicleId: snapshot.vehicleId,
        entryKey: entry.key,
        url: self.registration.scope,
      },
    });
  }
}

async function getActiveSnapshot() {
  const activeVehicle = await readRecord("meta", ACTIVE_VEHICLE_KEY);
  return activeVehicle?.value ? readRecord("snapshots", activeVehicle.value) : null;
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SYNC_ALERTS") {
    return;
  }

  event.waitUntil((async () => {
    try {
      const { activeVehicleId, snapshot, notify } = event.data;
      await writeRecord("meta", { key: ACTIVE_VEHICLE_KEY, value: activeVehicleId || "" });
      if (snapshot?.vehicleId) {
        await writeRecord("snapshots", snapshot);
        if (notify) {
          await deliverSnapshot(snapshot);
        }
      }
      event.ports[0]?.postMessage({ type: "SYNC_ALERTS_COMPLETE", ok: true });
    } catch (error) {
      event.ports[0]?.postMessage({
        type: "SYNC_ALERTS_COMPLETE",
        ok: false,
        message: error?.message || "Synchronisation impossible",
      });
    }
  })());
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === PERIODIC_CHECK_TAG) {
    event.waitUntil(getActiveSnapshot().then(deliverSnapshot));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === PERIODIC_CHECK_TAG) {
    event.waitUntil(getActiveSnapshot().then(deliverSnapshot));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = windowClients.find((client) => "focus" in client);
    if (existingClient) {
      await existingClient.focus();
      existingClient.postMessage({
        type: "OPEN_ALERTS",
        vehicleId: event.notification.data?.vehicleId || "",
        entryKey: event.notification.data?.entryKey || "",
      });
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});