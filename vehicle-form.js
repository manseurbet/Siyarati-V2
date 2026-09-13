      function formatVehicleRegistration(value) {
        const digits = String(value || "").replace(/\D/g, "").slice(0, 12);
        if (digits.length <= 7) return digits;
        if (digits.length <= 10) return `${digits.slice(0, 7)}-${digits.slice(7)}`;
        return `${digits.slice(0, 7)}-${digits.slice(7, 10)}-${digits.slice(10, 12)}`;
      }

      function validateVehicleRegistration(value) {
        const registration = String(value || "").trim();
        const match = registration.match(/^(\d{7})-([123])(\d{2})-(\d{2})$/);
        if (!match) return false;
        const yearCode = Number(match[3]);
        const currentYearCode = new Date().getFullYear() % 100;
        const wilaya = Number(match[4]);
        const validYear = yearCode >= 70 || yearCode <= currentYearCode;
        return validYear && wilaya >= 1 && wilaya <= 68;
      }

      const vehicleRegistrationField = document.querySelector("#vehicle-registration");
      vehicleRegistrationField?.addEventListener("input", (event) => {
        event.currentTarget.value = formatVehicleRegistration(event.currentTarget.value);
        event.currentTarget.setCustomValidity(
          event.currentTarget.value && !validateVehicleRegistration(event.currentTarget.value)
            ? "Matricule invalide : 7 chiffres dans le premier bloc, puis catégorie/année et wilaya."
            : "",
        );
      });
      vehicleRegistrationField?.addEventListener("blur", (event) => {
        event.currentTarget.value = formatVehicleRegistration(event.currentTarget.value);
      });

      vehicleDetailsForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const vehicleDetails = Object.fromEntries(new FormData(form).entries());
        if (!validateVehicleRegistration(vehicleDetails["vehicle-registration"])) {
          showToast("Matricule invalide : 7 chiffres dans le premier bloc, année valide et wilaya de 01 à 68.");
          document.querySelector("#vehicle-registration")?.focus();
          return;
        }
        const currentMileageValue = Number(vehicleDetails["current-mileage"]);
        const lastOilChangeMileageValue = Number(vehicleDetails["last-oil-change-mileage"]);
        if (
          Number.isFinite(currentMileageValue) &&
          Number.isFinite(lastOilChangeMileageValue) &&
          lastOilChangeMileageValue > currentMileageValue
        ) {
          showToast("Le kilométrage de la dernière vidange ne peut pas dépasser le kilométrage actuel.");
          document.querySelector("#last-oil-change-mileage")?.focus();
          return;
        }
        const vehicles = getSavedVehicles();
        const existingVehicle = vehicles.find((vehicle) => vehicle.id === vehicleFormVehicleId);
        let isNewVehicle = false;

        if (vehicleFormMode === "add-secondary") {
          isNewVehicle = true;
          const newVehicleId = createVehicleId();
          vehicles.push({ id: newVehicleId, data: vehicleDetails });
          if (!getPrimaryVehicleId()) {
            localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, newVehicleId);
            vehicleFormMode = "edit-primary";
          }
        } else {
          const targetId = vehicleFormVehicleId || getPrimaryVehicleId() || createVehicleId();
          const existingIndex = vehicles.findIndex((vehicle) => vehicle.id === targetId);
          if (existingIndex >= 0) {
            vehicles[existingIndex] = { id: targetId, data: vehicleDetails };
          } else {
            isNewVehicle = true;
            vehicles.push({ id: targetId, data: vehicleDetails });
          }
          if (!getPrimaryVehicleId()) {
            localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, targetId);
          }
        }

        saveVehicles(vehicles);
        localStorage.removeItem(VEHICLE_STORAGE_KEY);
        updateVehicleDisplay(getSavedVehicle());
        updateMileageDisplay(getSavedVehicle()["current-mileage"]);
        renderVehicleList();
        renderDashboardVehicleSelector();
        updateVehicleAvailability();
        markMonthlyMileageUpdated();
        renderMonthlyMileageAlert();
        checkAlerts();
        showToast(vehicleFormMode === "add-secondary"
          ? "Le véhicule secondaire a été ajouté."
          : "Les informations du véhicule ont été enregistrées.");
        if (isNewVehicle) {
          pingAnonymousCounter("siyarati-car-app-vehicles-added-v1");
        }
        showScreen("home");
      });

      function prepareVehicleForm(vehicle = {}, mode = "edit-primary", vehicleId = "") {
        vehicleFormMode = mode;
        vehicleFormVehicleId = vehicleId;
        vehicleDetailsForm.reset();
        Object.entries(vehicle).forEach(([fieldName, value]) => {
          const field = vehicleDetailsForm.querySelector(`[name="${fieldName}"]`);
          if (field && field.type !== "file" && fieldName !== "vehicle-model") {
            field.value = value;
          }
        });

        const brand = vehicle["vehicle-category"] || vehicle["vehicle-brand"] || "";
        vehicleBrandField.value = brand;
        populateVehicleModels(brand, vehicle["vehicle-model"] || "");

        // Ce champ est obligatoire ; pour un véhicule déjà enregistré avant
        // qu'il ne le devienne, il peut être vide. Sans cela, la validation
        // native du navigateur bloque silencieusement l'enregistrement, sans
        // message visible : la page paraît "figée" alors qu'elle attend
        // juste ce champ.
        const lastOilChangeField = vehicleDetailsForm.querySelector('[name="last-oil-change-mileage"]');
        if (lastOilChangeField && !lastOilChangeField.value && vehicle["current-mileage"]) {
          lastOilChangeField.value = vehicle["current-mileage"];
        }
      }

      document.querySelector(".vehicle-actions").addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-vehicle-action]");
        if (!actionButton) {
          return;
        }

        const action = actionButton.dataset.vehicleAction;
        const savedVehicle = getSavedVehicle();

        if (action === "add") {
          prepareVehicleForm({}, "add-secondary");
          showScreen("vehicle-details");
          return;
        }

        if (action === "edit") {
          if (!Object.keys(savedVehicle).length) {
            showToast("Aucun véhicule enregistré. Choisissez Ajouter véhicule.");
            return;
          }
          prepareVehicleForm(savedVehicle, "edit-primary", getPrimaryVehicleId());
          showScreen("vehicle-details");
          return;
        }

        if (action === "delete") {
          if (!Object.keys(savedVehicle).length) {
            showToast("Aucun véhicule à supprimer.");
            return;
          }
          if (!window.confirm("Supprimer le véhicule principal et toutes ses données ?")) {
            return;
          }
          deleteVehicle(getPrimaryVehicleId());
          showToast("Le véhicule a été supprimé.");
        }
      });

      const dashboardVehicleSelector = document.querySelector("#dashboard-vehicle-select");
      dashboardVehicleSelector.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      dashboardVehicleSelector.addEventListener("change", (event) => {
        const vehicleId = event.currentTarget.value;
        if (!vehicleId) {
          return;
        }
        setPrimaryVehicle(vehicleId);
        showScreen("home");
      });

      document.querySelector("#add-secondary-vehicle-button").addEventListener("click", () => {
        prepareVehicleForm({}, "add-secondary");
        showScreen("vehicle-details");
      });

      document.querySelector("#vehicle-list").addEventListener("click", (event) => {
        const menuToggle = event.target.closest("[data-vehicle-menu-toggle]");
        if (menuToggle) {
          const menu = menuToggle.parentElement.querySelector("[data-vehicle-menu]");
          const isOpen = !menu.hidden;
          document.querySelectorAll("[data-vehicle-menu]").forEach((item) => {
            item.hidden = true;
          });
          document.querySelectorAll("[data-vehicle-menu-toggle]").forEach((item) => {
            item.setAttribute("aria-expanded", "false");
          });
          menu.hidden = isOpen;
          menuToggle.setAttribute("aria-expanded", String(!isOpen));
          event.stopPropagation();
          return;
        }

        const selectButton = event.target.closest("[data-select-vehicle]");
        if (selectButton) {
          setPrimaryVehicle(selectButton.dataset.selectVehicle);
          return;
        }

        const actionButton = event.target.closest("[data-vehicle-list-action]");
        if (!actionButton) {
          return;
        }

        const vehicleId = actionButton.dataset.vehicleId;
        const action = actionButton.dataset.vehicleListAction;
        const vehicle = getSavedVehicles().find((item) => item.id === vehicleId);
        if (!vehicle) {
          return;
        }

        if (action === "primary") {
          setPrimaryVehicle(vehicleId);
          return;
        }

        if (action === "edit") {
          prepareVehicleForm(vehicle.data, vehicleId === getPrimaryVehicleId() ? "edit-primary" : "edit-secondary", vehicleId);
          showScreen("vehicle-details");
          return;
        }

        if (action === "delete") {
          if (!window.confirm(`Supprimer ${getVehicleDisplayName(vehicle.data)} et toutes ses données ?`)) {
            return;
          }
          deleteVehicle(vehicleId);
          showToast("Le véhicule et ses données ont été supprimés.");
        }
      });

      document.addEventListener("click", (event) => {
        if (event.target.closest("#vehicle-list")) {
          return;
        }
        document.querySelectorAll("[data-vehicle-menu]").forEach((item) => {
          item.hidden = true;
        });
        document.querySelectorAll("[data-vehicle-menu-toggle]").forEach((item) => {
          item.setAttribute("aria-expanded", "false");
        });
      });

      const repairForm = document.querySelector("#repair-form");
      const repairList = document.querySelector("#repair-list");

      repairForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const repair = Object.fromEntries(new FormData(event.currentTarget).entries());
        const savedRepairs = getSavedRepairs();
        savedRepairs.push({
          id: `${Date.now()}-${savedRepairs.length + 1}`,
          category: repair.category,
          title: repair.title.trim(),
          date: repair.date,
          mileage: repair.mileage,
          amount: repair.amount,
          notes: repair.notes.trim(),
        });
        localStorage.setItem(getVehicleScopedStorageKey(REPAIRS_STORAGE_KEY), JSON.stringify(savedRepairs));

        // Un entretien (ex. vidange) enregistré avec un kilométrage fait
        // repartir le cycle du rappel constructeur, au lieu de le laisser
        // "Expiré" indéfiniment après la première échéance passée.
        if (repair.category === "Entretien" && repair.mileage) {
          const repairMileage = Number(repair.mileage);
          const currentBaseline = Number(getSavedVehicle()["last-oil-change-mileage"]);
          if (Number.isFinite(repairMileage) && repairMileage >= 0 &&
            (!Number.isFinite(currentBaseline) || repairMileage > currentBaseline)) {
            updateVehicleData(getPrimaryVehicleId(), { "last-oil-change-mileage": String(repairMileage) });
          }
        }

        updateMileageReferenceFromRecords();
        updateMileageDisplay(getCurrentMileage());
        renderMonthlyMileageAlert();
        event.currentTarget.reset();
        renderRepairs();
        renderExpenses();
        renderReports();
        checkAlerts();
        syncOfflineChanges().catch(() => updateConnectionStatus());
        showToast("La réparation a été enregistrée.");
        showScreen("home");
      });

      repairList.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-repair]");
        if (!removeButton) {
          return;
        }
        const repairId = removeButton.dataset.removeRepair;
        const remainingRepairs = getSavedRepairs().filter(({ id }) => id !== repairId);
        localStorage.setItem(getVehicleScopedStorageKey(REPAIRS_STORAGE_KEY), JSON.stringify(remainingRepairs));
        renderRepairs();
        renderExpenses();
        renderReports();
        syncOfflineChanges().catch(() => updateConnectionStatus());
        showToast("La réparation a été supprimée.");
      });

      const customReminderForm = document.querySelector("#custom-reminder-form");
      const customReminderList = document.querySelector("#custom-reminder-list");

      customReminderForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const reminder = Object.fromEntries(new FormData(event.currentTarget).entries());

        if (!reminder.date && !reminder.mileage) {
          showToast("Ajoutez une date ou un kilométrage cible.");
          return;
        }

        const savedReminders = getSavedCustomReminders();
        savedReminders.push({
          id: `${Date.now()}-${savedReminders.length + 1}`,
          category: reminder.category,
          title: reminder.title.trim(),
          date: reminder.date,
          mileage: reminder.mileage,
          amount: reminder.amount,
          notes: reminder.notes.trim(),
        });
        localStorage.setItem(getVehicleScopedStorageKey(CUSTOM_REMINDERS_STORAGE_KEY), JSON.stringify(savedReminders));
        event.currentTarget.reset();
        renderCustomReminders();
        renderExpenses();
        renderReports();
        checkAlerts();
        showToast("Le rappel a été ajouté.");
        showScreen("home");
      });

      customReminderList.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-reminder]");
        if (!removeButton) {
          return;
        }

        const reminderId = removeButton.dataset.removeReminder;
        const remainingReminders = getSavedCustomReminders().filter(({ id }) => id !== reminderId);
        localStorage.setItem(getVehicleScopedStorageKey(CUSTOM_REMINDERS_STORAGE_KEY), JSON.stringify(remainingReminders));
        renderCustomReminders();
        renderExpenses();
        renderReports();
        checkAlerts();
        showToast("Le rappel a été supprimé.");
      });

      document.addEventListener("pointerdown", () => {
        soundUnlocked = true;
      });

      const savedReminders = getSavedReminders();
      Object.entries(savedReminders).forEach(([fieldName, value]) => {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (field) {
          field.value = value;
        }
      });

      const savedVehicle = getSavedVehicle();
      Object.entries(savedVehicle).forEach(([fieldName, value]) => {
        const field = document.querySelector(`[name="${fieldName}"]`);
        if (field && field.type !== "file" && fieldName !== "vehicle-model") {
          field.value = value;
        }
      });
      const savedBrandIsAvailable = [...vehicleBrandField.options].some((option) => option.value === vehicleBrandField.value);
      if (!savedBrandIsAvailable && savedVehicle["vehicle-brand"]) {
        vehicleBrandField.value = savedVehicle["vehicle-brand"];
      }
      populateVehicleModels(vehicleBrandField.value, savedVehicle["vehicle-model"]);
      updateVehicleDisplay(savedVehicle);
      updateMileageDisplay(savedVehicle["current-mileage"]);

      renderVehicleList();
      renderDashboardVehicleSelector();
      updateVehicleAvailability();


      const bottomNavItems = document.querySelectorAll("[data-bottom-screen]");
      const bottomMoreButton = document.querySelector("#bottom-more-button");
