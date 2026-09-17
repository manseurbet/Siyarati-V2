      function getSavedDocuments() {
        try {
          const key = getVehicleScopedStorageKey(DOCUMENTS_STORAGE_KEY);
          const documents = JSON.parse(localStorage.getItem(key) || "{}");
          return documents && typeof documents === "object" ? documents : {};
        } catch {
          return {};
        }
      }

      function getSavedRepairs() {
        try {
          const key = getVehicleScopedStorageKey(REPAIRS_STORAGE_KEY);
          const repairs = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(repairs) ? repairs : [];
        } catch {
          return [];
        }
      }

      function formatDocumentSize(size) {
        const bytes = Number(size);
        if (!Number.isFinite(bytes) || bytes <= 0) {
          return "";
        }
        if (bytes < 1024 * 1024) {
          return `${Math.round(bytes / 1024)} Ko`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
      }

      function renderDocuments() {
        const documents = getSavedDocuments();
        const guidance = document.querySelector("#documents-guidance");
        document.querySelectorAll("[data-document-status]").forEach((statusElement) => {
          const documentFile = documents[statusElement.dataset.documentStatus];
          statusElement.classList.toggle("has-file", Boolean(documentFile));
          statusElement.textContent = documentFile
            ? `${documentFile.name} · ${formatDocumentSize(documentFile.size)}`
            : "Aucun fichier téléchargé";
        });
        document.querySelectorAll("[data-document-view]").forEach((viewButton) => {
          const documentFile = documents[viewButton.dataset.documentView];
          viewButton.hidden = !documentFile;
        });
        if (guidance) {
          const requiredDocuments = [
            ["carte-grise", "la carte grise"],
            ["assurance", "l’assurance"],
            ["vignette", "la vignette"],
          ];
          const missingDocuments = requiredDocuments
            .filter(([key]) => !documents[key])
            .map(([, label]) => label);
          guidance.textContent = missingDocuments.length
            ? `Pour un dossier complet, ajoutez ${missingDocuments.join(", ")}.`
            : "Dossier documentaire complet : SIYARATI peut mieux vous rappeler vos échéances.";
        }
      }

      function formatMileage(value) {
        const mileage = Number(value);
        return Number.isFinite(mileage) && mileage >= 0
          ? `${new Intl.NumberFormat("fr-FR").format(mileage)} km`
          : "—";
      }

      function formatAmount(value) {
        const amount = Number(value);
        return Number.isFinite(amount) && amount >= 0
          ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(amount)} DA`
          : "";
      }

      function getCurrentMileage() {
        const mileage = Number(getSavedVehicle()["current-mileage"]);
        return Number.isFinite(mileage) && mileage >= 0 ? mileage : null;
      }

      function updateMileageDisplay(value) {
        const mileageDisplay = document.querySelector("#current-mileage-display");
        if (mileageDisplay) {
          mileageDisplay.textContent = formatMileage(value);
        }
      }

      function updateVehicleDisplay(vehicle = {}) {
        const nameDisplay = document.querySelector("#vehicle-name-display");
        const metaDisplay = document.querySelector("#vehicle-meta-display");
        const icon = document.querySelector("#vehicle-card-icon");
        const editButton = document.querySelector('[data-vehicle-action="edit"]');
        const deleteButton = document.querySelector('[data-vehicle-action="delete"]');
        const mileageRow = document.querySelector("#vehicle-mileage-row");
        const mileageInlineForm = document.querySelector("#vehicle-mileage-inline-form");
        const brand = vehicle["vehicle-category"] || vehicle["vehicle-brand"] || "";
        const model = vehicle["vehicle-model"] || "";
        const vehicleName = [brand, model].filter(Boolean).join(" ");
        const registration = vehicle["vehicle-registration"] || "";
        const hasVehicle = Object.keys(vehicle).length > 0;

        nameDisplay.textContent = vehicleName || "Aucun véhicule enregistré";
        metaDisplay.textContent = registration || "Ajoutez votre véhicule avec le bouton “+ Ajouter”.";
        // Modifier/Supprimer n'ont de sens que s'il existe déjà un véhicule.
        if (editButton) editButton.hidden = !hasVehicle;
        if (deleteButton) deleteButton.hidden = !hasVehicle;
        if (mileageRow) mileageRow.hidden = !hasVehicle;
        if (mileageInlineForm && !hasVehicle) mileageInlineForm.hidden = true;

        if (icon) {
          const photo = getSavedDocuments().photo;
          if (photo?.data) {
            icon.innerHTML = `<img src="${escapeHtml(photo.data)}" alt="Photo du véhicule" />`;
          } else {
            icon.innerHTML = `
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 17h14l1.2-5.2a2 2 0 0 0-1.95-2.45H5.75A2 2 0 0 0 3.8 11.8L5 17Z" />
                <path d="M7 9.35 8.3 6h7.4L17 9.35M7 17v2M17 17v2M5 13h14" />
              </svg>`;
          }
        }
      }

      function getVehicleDisplayName(vehicle = {}) {
        return [vehicle["vehicle-category"] || vehicle["vehicle-brand"], vehicle["vehicle-model"]]
          .filter(Boolean)
          .join(" ") || "Véhicule sans nom";
      }

      function renderDashboardVehicleSelector() {
        const selector = document.querySelector("#dashboard-vehicle-select");
        if (!selector) {
          return;
        }

        const vehicles = getSavedVehicles();
        const primaryId = getPrimaryVehicleId();
        selector.innerHTML = "";

        if (!vehicles.length) {
          const emptyOption = document.createElement("option");
          emptyOption.value = "";
          emptyOption.textContent = "Aucun véhicule enregistré";
          selector.appendChild(emptyOption);
          selector.disabled = true;
          return;
        }

        vehicles.forEach(({ id, data }) => {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = getVehicleDisplayName(data);
          option.selected = id === primaryId;
          selector.appendChild(option);
        });
        selector.disabled = false;
      }

      function createVehicleId() {
        return `vehicle-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      }

      function clearVehicleData(vehicleId) {
        [
          REMINDERS_STORAGE_KEY,
          CUSTOM_REMINDERS_STORAGE_KEY,
          ALERT_ACTIONS_STORAGE_KEY,
           NOTIFICATION_PREFERENCES_STORAGE_KEY,
          DOCUMENTS_STORAGE_KEY,
          REPAIRS_STORAGE_KEY,
          TOW_STORAGE_KEY,
        ].forEach((baseKey) => localStorage.removeItem(`${baseKey}:${vehicleId}`));
      }

      function updateVehicleAvailability() {
        const hasPrimaryVehicle = Boolean(getPrimaryVehicleId());
        document.querySelectorAll("[data-requires-vehicle]").forEach((card) => {
          card.classList.toggle("is-disabled", !hasPrimaryVehicle);
          card.setAttribute("aria-disabled", String(!hasPrimaryVehicle));
        });
      }

      function renderVehicleList() {
        const vehicleList = document.querySelector("#vehicle-list");
        if (!vehicleList) {
          return;
        }

        const vehicles = getSavedVehicles();
        const primaryId = getPrimaryVehicleId();
        if (!vehicles.length) {
          vehicleList.innerHTML = `
            <div class="vehicle-list-empty">
              <strong>Aucun véhicule enregistré</strong>
              <p>Utilisez le bouton + pour ajouter un véhicule secondaire.</p>
            </div>
          `;
          return;
        }

        vehicleList.innerHTML = vehicles
          .map(({ id, data }) => {
            const isPrimary = id === primaryId;
            const registration = data["vehicle-registration"] || "Matricule non renseigné";
            return `
              <article class="vehicle-list-item${isPrimary ? " is-primary" : ""}">
                <button class="vehicle-list-main" type="button" data-select-vehicle="${escapeHtml(id)}" aria-label="Sélectionner ${escapeHtml(getVehicleDisplayName(data))}">
                  <span class="vehicle-list-icon" aria-hidden="true">🚗</span>
                  <span class="vehicle-list-copy">
                    <strong>${escapeHtml(getVehicleDisplayName(data))}</strong>
                    <small>${isPrimary ? "Véhicule principal" : "Véhicule secondaire"} · ${escapeHtml(registration)}</small>
                  </span>
                </button>
                <div class="vehicle-list-actions">
                  <button class="vehicle-list-menu-toggle" type="button" data-vehicle-menu-toggle aria-label="Ouvrir le menu de ${escapeHtml(getVehicleDisplayName(data))}" aria-expanded="false">···</button>
                  <div class="vehicle-list-menu" data-vehicle-menu hidden>
                    <button class="vehicle-list-action" type="button" data-vehicle-list-action="primary" data-vehicle-id="${escapeHtml(id)}" ${isPrimary ? "disabled" : ""}>${isPrimary ? "Véhicule principal" : "Définir comme principal"}</button>
                    <button class="vehicle-list-action" type="button" data-vehicle-list-action="edit" data-vehicle-id="${escapeHtml(id)}">Modifier</button>
                    <button class="vehicle-list-action is-danger" type="button" data-vehicle-list-action="delete" data-vehicle-id="${escapeHtml(id)}">Supprimer</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("");
      }

      function setPrimaryVehicle(vehicleId) {
        if (!getSavedVehicles().some((vehicle) => vehicle.id === vehicleId)) {
          return;
        }
        localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, vehicleId);
        updateVehicleDisplay(getSavedVehicle());
        updateMileageDisplay(getSavedVehicle()["current-mileage"]);
        renderVehicleList();
        renderDashboardVehicleSelector();
        renderDocuments();
        updateVehicleAvailability();
        updateNotificationControls();
        checkAlerts();
        showToast("Le véhicule principal a été changé.");
      }

      function deleteVehicle(vehicleId) {
        const vehicles = getSavedVehicles();
        const wasPrimary = getPrimaryVehicleId() === vehicleId;
        clearVehicleData(vehicleId);
        const remainingVehicles = vehicles.filter((vehicle) => vehicle.id !== vehicleId);
        saveVehicles(remainingVehicles);

        if (wasPrimary) {
          if (remainingVehicles.length) {
            localStorage.setItem(PRIMARY_VEHICLE_STORAGE_KEY, remainingVehicles[0].id);
          } else {
            localStorage.removeItem(PRIMARY_VEHICLE_STORAGE_KEY);
          }
        }
        localStorage.removeItem(VEHICLE_STORAGE_KEY);
        prepareVehicleForm();
        updateVehicleDisplay(getSavedVehicle());
        updateMileageDisplay(getSavedVehicle()["current-mileage"]);
        renderVehicleList();
        renderDashboardVehicleSelector();
        renderDocuments();
        updateVehicleAvailability();
        updateNotificationControls();
        checkAlerts();
      }

