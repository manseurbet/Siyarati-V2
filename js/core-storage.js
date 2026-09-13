      const toast = document.querySelector(".toast");
      let toastTimer;

      const screens = {
        home: document.querySelector("#home-screen"),
        "vehicle-info": document.querySelector("#vehicle-info-screen"),
        documents: document.querySelector("#documents-screen"),
        "vehicle-details": document.querySelector("#vehicle-details-screen"),
        reminders: document.querySelector("#reminders-screen"),
        alerts: document.querySelector("#alerts-screen"),
        expenses: document.querySelector("#expenses-screen"),
        troubleshooting: document.querySelector("#troubleshooting-screen"),
        repair: document.querySelector("#repair-screen"),
        more: document.querySelector("#more-screen"),
      };

      const REMINDERS_STORAGE_KEY = "siyarati-reminders";
      const VEHICLE_STORAGE_KEY = "siyarati-vehicle";
      const VEHICLES_STORAGE_KEY = "siyarati-vehicles";
      const PRIMARY_VEHICLE_STORAGE_KEY = "siyarati-primary-vehicle";

      // Compteur d'usage anonyme : incrémente un simple nombre public,
      // sans aucune donnée personnelle ni identifiable (ni matricule, ni
      // marque, ni kilométrage). Échec toujours silencieux (hors-ligne,
      // service indisponible…) pour ne jamais impacter l'app.
      function pingAnonymousCounter(counterKey) {
        try {
          fetch(`https://countapi.mileshilliard.com/api/v1/hit/${counterKey}`, { mode: "cors" }).catch(() => {});
        } catch {
          // Ignoré volontairement.
        }
      }
      const TOW_STORAGE_KEY = "siyarati-tow-number";
      const CUSTOM_REMINDERS_STORAGE_KEY = "siyarati-custom-reminders";
      const MONTHLY_MILEAGE_ALERT_KEY = "siyarati-monthly-mileage-alert";
      const USER_SPACE_KEY = "siyarati-anonymous-user-space";

      function getAnonymousUserSpaceId() {
        let id = localStorage.getItem(USER_SPACE_KEY);
        if (!id) {
          id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(USER_SPACE_KEY, id);
        }
        return id;
      }
      getAnonymousUserSpaceId();
      const ALERT_ACTIONS_STORAGE_KEY = "siyarati-alert-actions";
      const DOCUMENTS_STORAGE_KEY = "siyarati-documents";
      const REPAIRS_STORAGE_KEY = "siyarati-repairs";
      const NOTIFICATION_PREFERENCES_STORAGE_KEY = "siyarati-notification-preferences";
      const OFFLINE_SYNC_STORAGE_KEY = "siyarati-offline-sync";
      const reminderDefinitions = [
        { key: "insurance-date", label: "Assurance" },
        { key: "sticker-date", label: "Vignette" },
        { key: "technical-inspection-date", label: "Contrôle technique" },
        { key: "oil-change-date", label: "Dernière vidange" },
      ];
      let lastUrgentSignature = "";
      let soundUnlocked = false;
      let notificationRegistration = null;
      const vehicleModels = {
        Audi: ["A1", "A3", "A4", "A6", "Q2", "Q3", "Q5", "Q7"],
        BMW: ["Série 1", "Série 2", "Série 3", "Série 5", "X1", "X3", "X5"],
        Chery: ["Tiggo 2 Pro", "Tiggo 4 Pro", "Tiggo 7 Pro", "Tiggo 8 Pro"],
        Chevrolet: ["Spark", "Aveo", "Cruze", "Captiva"],
        "Citroën": ["C3", "C4", "C-Elysée", "Berlingo"],
        Dacia: ["Sandero", "Logan", "Duster", "Stepway", "Dokker", "Lodgy"],
        DFSK: ["Glory 500", "Glory 580", "K01"],
        Fiat: ["500", "Panda", "Tipo", "Argo", "Doblo", "Ducato"],
        Ford: ["Fiesta", "Focus", "Ranger", "Transit", "Kuga", "EcoSport"],
        Geely: ["Emgrand", "Coolray", "GX3 Pro", "Geometry C"],
        "Great Wall": ["Wingle 5", "Wingle 7", "Poer", "M4"],
        Hyundai: ["i10", "i20", "Accent", "Elantra", "Grand i10", "Creta", "Tucson", "Santa Fe"],
        Isuzu: ["D-Max", "NPR", "NKR"],
        JAC: ["JS2", "JS3", "JS4", "J7", "X200", "X250"],
        JMC: ["Vigus", "Carry", "N720"],
        Kia: ["Picanto", "Rio", "Cerato", "Carens", "Sportage", "Sorento"],
        "Mercedes-Benz": ["Classe A", "Classe C", "Classe E", "GLA", "GLC", "Sprinter"],
        Mitsubishi: ["Lancer", "ASX", "Outlander", "L200", "Canter"],
        Nissan: ["Micra", "Sunny", "Qashqai", "X-Trail", "Navara", "Patrol"],
        Opel: ["Corsa", "Astra", "Crossland", "Grandland", "Combo"],
        Peugeot: ["108", "208", "301", "308", "408", "2008", "3008", "5008", "Partner", "Expert"],
        Renault: ["Clio", "Symbol", "Logan", "Fluence", "Mégane", "Captur", "Arkana", "Kangoo", "Master"],
        Seat: ["Ibiza", "Leon", "Arona", "Ateca"],
        Skoda: ["Fabia", "Octavia", "Scala", "Kamiq", "Karoq", "Kodiaq"],
        Suzuki: ["Alto", "Swift", "Celerio", "Vitara", "Jimny", "Carry"],
        Toyota: ["Yaris", "Corolla", "Etios", "Aygo", "RAV4", "Hilux", "Land Cruiser", "Proace"],
        Volkswagen: ["Polo", "Golf", "Passat", "Tiguan", "T-Roc", "Caddy", "Transporter"],
        Autre: ["Autre modèle"],
      };
      const manufacturerMaintenanceProfiles = {
        Audi: { default: 15000, Électrique: 30000 },
        BMW: { default: 15000, Électrique: 30000 },
        Chery: { default: 10000, Électrique: 30000 },
        Chevrolet: { default: 15000, Électrique: 30000 },
        "Citroën": { default: 15000, Électrique: 30000 },
        Dacia: { default: 15000, Électrique: 30000 },
        DFSK: { default: 10000, Électrique: 30000 },
        Fiat: { default: 15000, Électrique: 30000 },
        Ford: { default: 15000, Électrique: 30000 },
        Geely: { default: 15000, Électrique: 30000 },
        "Great Wall": { default: 10000, Électrique: 30000 },
        Hyundai: { default: 15000, Électrique: 30000 },
        Isuzu: { default: 10000, Électrique: 30000 },
        JAC: { default: 10000, Électrique: 30000 },
        JMC: { default: 10000, Électrique: 30000 },
        Kia: { default: 15000, Électrique: 30000 },
        "Mercedes-Benz": { default: 15000, Électrique: 30000 },
        Mitsubishi: { default: 15000, Électrique: 30000 },
        Nissan: { default: 15000, Électrique: 30000 },
        Opel: { default: 15000, Électrique: 30000 },
        Peugeot: { default: 15000, Électrique: 30000 },
        Renault: { default: 15000, Électrique: 30000 },
        Seat: { default: 15000, Électrique: 30000 },
        Skoda: { default: 15000, Électrique: 30000 },
        Suzuki: { default: 10000, Électrique: 30000 },
        Toyota: { default: 15000, Électrique: 30000 },
        Volkswagen: { default: 15000, Électrique: 30000 },
      };

      // Intervalles par défaut appliqués automatiquement quand l'utilisateur
      // choisit une de ces catégories dans un rappel personnalisé SANS
      // préciser lui-même de date ou de kilométrage cible. S'il saisit une
      // valeur, elle est toujours utilisée telle quelle à la place.
      const customReminderDefaults = {
        "Vidange": { type: "mileage", interval: 10000 },
        "Courroie de distribution": { type: "mileage", interval: 80000 },
        "Révision": { type: "mileage", interval: 50000 },
        "Vignette": { type: "march-next-year" },
      };

      function getCustomReminderDefaultDate(rule) {
        if (rule.type !== "march-next-year") {
          return null;
        }
        const nextYear = new Date().getFullYear() + 1;
        return `${nextYear}-03-01`;
      }

      function getCustomReminderDefaultMileage(rule) {
        if (rule.type !== "mileage") {
          return null;
        }
        const current = getCurrentMileage();
        return current !== null ? current + rule.interval : null;
      }

      function populateVehicleModels(brand, selectedModel = "") {
        const modelField = document.querySelector("#vehicle-model");
        const models = vehicleModels[brand] || [];
        modelField.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = brand ? "Choisir un modèle" : "Choisir d’abord une marque";
        placeholder.selected = !selectedModel;
        placeholder.disabled = true;
        modelField.appendChild(placeholder);

        models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          option.selected = model === selectedModel;
          modelField.appendChild(option);
        });

        modelField.disabled = !brand || models.length === 0;
      }

      function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
      }

      function showScreen(name) {
        Object.entries(screens).forEach(([screenName, screen]) => {
          screen.classList.toggle("is-hidden", screenName !== name);
        });
        if (name === "alerts") {
          checkAlerts({ playSound: true });
        }
        if (name === "home") {
          // Toujours rafraîchir les alertes à l'ouverture de l'accueil,
          // notamment juste après l'ajout d'un nouveau rappel.
          renderHomeAlerts(getReminderEntries());
           renderMonthlyMileageAlert();
        }
        if (name === "expenses") {
          renderExpenses();
          renderReports();
        }
        if (name === "repair") {
          renderRepairs();
        }
        if (name === "documents") {
          renderDocuments();
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      function getSavedReminders() {
        try {
          const vehicleId = getPrimaryVehicleId();
          const key = vehicleId ? `${REMINDERS_STORAGE_KEY}:${vehicleId}` : REMINDERS_STORAGE_KEY;
          const scopedValue = localStorage.getItem(key);
          if (vehicleId && scopedValue === null) {
            const legacyValue = localStorage.getItem(REMINDERS_STORAGE_KEY);
            if (legacyValue !== null) {
              localStorage.setItem(key, legacyValue);
              localStorage.removeItem(REMINDERS_STORAGE_KEY);
              return JSON.parse(legacyValue || "{}");
            }
          }
          return JSON.parse(scopedValue || "{}");
        } catch {
          return {};
        }
      }

      function getSavedVehicles() {
        try {
          const savedVehicles = JSON.parse(localStorage.getItem(VEHICLES_STORAGE_KEY) || "null");
          if (Array.isArray(savedVehicles)) {
            return savedVehicles.filter((vehicle) => vehicle?.id && vehicle?.data && typeof vehicle.data === "object");
          }

          const legacyVehicle = JSON.parse(localStorage.getItem(VEHICLE_STORAGE_KEY) || "{}");
          if (legacyVehicle && typeof legacyVehicle === "object" && Object.keys(legacyVehicle).length) {
            const migratedVehicle = { id: "vehicle-primary", data: legacyVehicle };
            localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify([migratedVehicle]));
            localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, migratedVehicle.id);
            return [migratedVehicle];
          }
          return [];
        } catch {
          return [];
        }
      }

      function saveVehicles(vehicles) {
        localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(vehicles));
      }

      function updateVehicleData(vehicleId, patch) {
        if (!vehicleId) {
          return;
        }
        const vehicles = getSavedVehicles();
        const index = vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
        if (index === -1) {
          return;
        }
        vehicles[index] = { id: vehicleId, data: { ...vehicles[index].data, ...patch } };
        saveVehicles(vehicles);
      }

      function getPrimaryVehicleId() {
        const vehicles = getSavedVehicles();
        if (!vehicles.length) {
          return "";
        }

        const storedPrimaryId = localStorage.getItem(PRIMARY_VEHICLE_STORAGE_KEY);
        const primaryVehicle = vehicles.find((vehicle) => vehicle.id === storedPrimaryId) || vehicles[0];
        if (storedPrimaryId !== primaryVehicle.id) {
          localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, primaryVehicle.id);
        }
        return primaryVehicle.id;
      }

      function getSavedVehicle() {
        const primaryId = getPrimaryVehicleId();
        return getSavedVehicles().find((vehicle) => vehicle.id === primaryId)?.data || {};
      }

      function getVehicleScopedStorageKey(baseKey, vehicleId = getPrimaryVehicleId()) {
        return vehicleId ? `${baseKey}:${vehicleId}` : baseKey;
      }

      function getSavedCustomReminders() {
        try {
          const key = getVehicleScopedStorageKey(CUSTOM_REMINDERS_STORAGE_KEY);
          let storedValue = localStorage.getItem(key);
          if (getPrimaryVehicleId() && storedValue === null) {
            const legacyValue = localStorage.getItem(CUSTOM_REMINDERS_STORAGE_KEY);
            if (legacyValue !== null) {
              localStorage.setItem(key, legacyValue);
              localStorage.removeItem(CUSTOM_REMINDERS_STORAGE_KEY);
              storedValue = legacyValue;
            }
          }
          const reminders = JSON.parse(storedValue || "[]");
          return Array.isArray(reminders) ? reminders : [];
        } catch {
          return [];
        }
      }

      function getSavedAlertActions() {
        try {
          const key = getVehicleScopedStorageKey(ALERT_ACTIONS_STORAGE_KEY);
          const actions = JSON.parse(localStorage.getItem(key) || "{}");
          return actions && typeof actions === "object" ? actions : {};
        } catch {
          return {};
        }
      }

      function getSavedNotificationPreferences() {
        try {
          const key = getVehicleScopedStorageKey(NOTIFICATION_PREFERENCES_STORAGE_KEY);
          const preferences = JSON.parse(localStorage.getItem(key) || "{}");
          return preferences && typeof preferences === "object" ? preferences : {};
        } catch {
          return {};
        }
      }

      function saveNotificationPreferences(preferences) {
        const vehicleId = getPrimaryVehicleId();
        if (!vehicleId) {
          return;
        }
        localStorage.setItem(
          getVehicleScopedStorageKey(NOTIFICATION_PREFERENCES_STORAGE_KEY, vehicleId),
          JSON.stringify(preferences),
        );
      }

      function getPendingOfflineSync() {
        try {
          const pending = JSON.parse(localStorage.getItem(OFFLINE_SYNC_STORAGE_KEY) || "null");
          return pending && typeof pending === "object" ? pending : null;
        } catch {
          return null;
        }
      }

      function updateConnectionStatus(state = "") {
        const status = document.querySelector("#connection-status");
        const text = document.querySelector("#connection-status-text");
        if (!status || !text) {
          return;
        }

        const isOffline = navigator.onLine === false;
        const hasPendingSync = Boolean(getPendingOfflineSync());
        status.classList.toggle("is-offline", isOffline);
        status.classList.toggle("is-syncing", !isOffline && state === "syncing");

        if (isOffline) {
          text.textContent = hasPendingSync
            ? "Hors connexion · enregistré"
            : "Hors connexion";
          return;
        }
        if (state === "syncing") {
          text.textContent = "Synchronisation…";
          return;
        }
        text.textContent = hasPendingSync ? "En ligne · à synchroniser" : "En ligne";
      }

      function markOfflineSyncPending(reason = "modification") {
        localStorage.setItem(OFFLINE_SYNC_STORAGE_KEY, JSON.stringify({
          pending: true,
          reason,
          queuedAt: Date.now(),
        }));
        updateConnectionStatus();
      }

      function clearOfflineSyncPending() {
        localStorage.removeItem(OFFLINE_SYNC_STORAGE_KEY);
        updateConnectionStatus();
      }

