      function playAlertTone() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
          return;
        }

        const audioContext = new AudioContext();
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.75);
        gain.connect(audioContext.destination);

        [0, 0.2, 0.4].forEach((offset, index) => {
          const oscillator = audioContext.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = index === 2 ? 880 : 660;
          oscillator.connect(gain);
          oscillator.start(audioContext.currentTime + offset);
          oscillator.stop(audioContext.currentTime + offset + 0.16);
        });
      }

      document.querySelectorAll(".monthly-mileage-alert").forEach((alert) => {
        const inlineForm = alert.nextElementSibling?.classList.contains("monthly-mileage-inline-form")
          ? alert.nextElementSibling
          : null;
        const inlineInput = inlineForm?.querySelector(".monthly-mileage-inline-input");

        alert.addEventListener("click", () => {
          if (!getPrimaryVehicleId()) { showToast("Ajoutez d’abord un véhicule principal."); return; }
          if (!inlineForm) { return; }
          // La saisie se fait directement dans la carte d'alerte, sans
          // naviguer vers la fiche véhicule (qui contient d'autres champs
          // obligatoires sans rapport avec la simple mise à jour mensuelle).
          const isOpening = inlineForm.hidden;
          inlineForm.hidden = !isOpening;
          if (isOpening && inlineInput) {
            const current = getCurrentMileage();
            inlineInput.value = current !== null ? current : "";
            inlineInput.focus();
            inlineInput.select();
          }
        });
        alert.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); alert.click(); }
        });
        const dismissButton = alert.querySelector(".monthly-mileage-alert-dismiss");
        dismissButton?.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!getPrimaryVehicleId()) {
            return;
          }
          markMonthlyMileageDismissed();
          renderMonthlyMileageAlert();
          showToast("Rappel ignoré pour ce mois-ci.");
        });
        dismissButton?.addEventListener("keydown", (event) => {
          event.stopPropagation();
        });

        inlineForm?.addEventListener("click", (event) => {
          // Empêche un clic dans le formulaire de rouvrir/fermer la carte.
          event.stopPropagation();
        });
        inlineForm?.addEventListener("submit", (event) => {
          event.preventDefault();
          const vehicleId = getPrimaryVehicleId();
          if (!vehicleId) {
            return;
          }
          const newMileage = Number(inlineInput?.value);
          if (!Number.isFinite(newMileage) || newMileage < 0) {
            showToast("Saisissez un kilométrage valide.");
            return;
          }
          const current = getCurrentMileage();
          if (current !== null && newMileage < current) {
            showToast(`Le kilométrage ne peut pas être inférieur à l’actuel (${formatMileage(current)}).`);
            return;
          }
          updateVehicleData(vehicleId, { "current-mileage": String(newMileage) });
          updateMileageDisplay(getCurrentMileage());
          markMonthlyMileageUpdated();
          renderMonthlyMileageAlert();
          checkAlerts();
          renderReports();
          showToast("Kilométrage actualisé.");
        });
      });

      // Accès permanent (pas limité à une fois par mois) pour actualiser le
      // kilométrage depuis la carte véhicule de l'accueil.
      const vehicleMileageEditButton = document.querySelector("#vehicle-mileage-edit-button");
      const vehicleMileageInlineForm = document.querySelector("#vehicle-mileage-inline-form");
      const vehicleMileageInlineInput = document.querySelector("#vehicle-mileage-inline-input");
      vehicleMileageEditButton?.addEventListener("click", () => {
        if (!getPrimaryVehicleId() || !vehicleMileageInlineForm) {
          return;
        }
        const isOpening = vehicleMileageInlineForm.hidden;
        vehicleMileageInlineForm.hidden = !isOpening;
        if (isOpening && vehicleMileageInlineInput) {
          const current = getCurrentMileage();
          vehicleMileageInlineInput.value = current !== null ? current : "";
          vehicleMileageInlineInput.focus();
          vehicleMileageInlineInput.select();
        }
      });
      vehicleMileageInlineForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const vehicleId = getPrimaryVehicleId();
        if (!vehicleId) {
          return;
        }
        const newMileage = Number(vehicleMileageInlineInput?.value);
        if (!Number.isFinite(newMileage) || newMileage < 0) {
          showToast("Saisissez un kilométrage valide.");
          return;
        }
        const current = getCurrentMileage();
        if (current !== null && newMileage < current) {
          showToast(`Le kilométrage ne peut pas être inférieur à l’actuel (${formatMileage(current)}).`);
          return;
        }
        updateVehicleData(vehicleId, { "current-mileage": String(newMileage) });
        updateMileageDisplay(getCurrentMileage());
        markMonthlyMileageUpdated();
        renderMonthlyMileageAlert();
        checkAlerts();
        renderReports();
        vehicleMileageInlineForm.hidden = true;
        showToast("Kilométrage actualisé.");
      });

      document.querySelectorAll("[data-screen]").forEach((control) => {
        control.addEventListener("click", (event) => {
          if (control.classList.contains("is-disabled")) {
            event.preventDefault();
            showToast("Aucun véhicule n’est enregistré. Ajoutez d’abord un véhicule.");
            return;
          }
          showScreen(control.dataset.screen);
          updateBottomNav(control.dataset.screen);
        });
        if (control.getAttribute("role") === "button") {
          control.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              showScreen(control.dataset.screen);
            }
          });
        }
      });

      // Les alertes de l’accueil sont générées dynamiquement après le chargement.
      // La délégation garantit que le bouton « Voir » fonctionne pour chaque case.
      document.querySelector("#home-alerts-list")?.addEventListener("click", (event) => {
        const control = event.target.closest("[data-screen]");
        if (!control) return;
        event.preventDefault();
        if (control.classList.contains("is-disabled")) {
          showToast("Aucun véhicule n’est enregistré. Ajoutez d’abord un véhicule.");
          return;
        }
        showScreen(control.dataset.screen);
        updateBottomNav(control.dataset.screen);
      });

      document.querySelectorAll(".toast-card, .menu-card:not([data-screen]), .detail-card:not([data-screen])").forEach((card) => {
        card.addEventListener("click", () => {
          showToast(`${card.dataset.label} — cette rubrique sera bientôt disponible.`);
        });
      });

      const locationAction = document.querySelector("#location-action");
      const locationStatus = document.querySelector("#location-status");
      const locationResult = document.querySelector("#location-result");
      const locationShareMode = document.querySelector("#location-share-mode");
      const sendLocationButton = document.querySelector("#send-location-button");
      const locationShareStatus = document.querySelector("#location-share-status");
      const breakdownReasonSelect = document.querySelector("#breakdown-reason-select");
      const towAction = document.querySelector("#tow-action");
      const towStatus = document.querySelector("#tow-status");
      let currentLocationMapUrl = "";
      let selectedBreakdownReason = "";

      breakdownReasonSelect?.addEventListener("change", () => {
        selectedBreakdownReason = breakdownReasonSelect.value;
        locationAction.disabled = false;
        locationStatus.textContent = `Motif choisi : ${selectedBreakdownReason} · appuyez pour obtenir votre position`;
        locationResult.hidden = true;
        currentLocationMapUrl = "";
        locationShareStatus.textContent = "";
      });

      locationAction.addEventListener("click", () => {
        // Le mode d’envoi doit apparaître dès l’action « Ma position ».
        // Le bouton d’envoi reste désactivé tant que les coordonnées ne sont pas obtenues.
        locationResult.hidden = false;
        sendLocationButton.disabled = true;
        locationShareStatus.textContent = "Recherche de votre position…";

        if (!selectedBreakdownReason) {
          locationStatus.textContent = "Sélectionnez d’abord le problème.";
          breakdownReasonSelect?.focus();
          return;
        }

        if (!navigator.geolocation) {
          locationStatus.textContent = "La géolocalisation n’est pas disponible sur cet appareil.";
          return;
        }

        if (!window.isSecureContext) {
          // Les navigateurs bloquent purement et simplement la géolocalisation
          // hors HTTPS (ou localhost) : ouvrir le fichier directement
          // (file://) ou le servir en http:// simple ne fonctionnera jamais.
          locationStatus.textContent = "La géolocalisation nécessite une connexion sécurisée (HTTPS). Ouvrez l’application via son adresse en ligne (https://…).";
          showToast("Géolocalisation bloquée : l’application doit être servie en HTTPS.");
          return;
        }

        locationStatus.textContent = "Recherche de votre position…";
        // Le menu de partage reste visible pendant la recherche de position.
        currentLocationMapUrl = "";

        // Même logique que la V1 : demande directe au GPS avec haute précision.
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const latitude = coords.latitude.toFixed(5);
            const longitude = coords.longitude.toFixed(5);
            locationStatus.textContent = `Position trouvée : ${latitude}, ${longitude}`;
            currentLocationMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
            locationResult.hidden = false;
            sendLocationButton.disabled = false;
            locationShareStatus.textContent = "Choisissez WhatsApp, SMS ou Facebook puis appuyez sur « Envoyer ma position ».";
            showToast("Votre position a été trouvée.");
          },
          (error) => {
            if (error.code === 1) {
              locationStatus.textContent = "Position inaccessible. Autorisez la localisation puis réessayez.";
            } else if (error.code === 2) {
              locationStatus.textContent = "Position indisponible. Activez le GPS puis réessayez.";
            } else if (error.code === 3) {
              locationStatus.textContent = "La recherche de position a pris trop de temps. Réessayez.";
            } else {
              locationStatus.textContent = "Position inaccessible. Autorisez la localisation puis réessayez.";
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
      });

      sendLocationButton.addEventListener("click", () => {
        if (!currentLocationMapUrl) {
          locationShareStatus.textContent = "Trouvez votre position avant de l’envoyer.";
          return;
        }

        const message = `🚨 JE SUIS EN PANNE\n${selectedBreakdownReason}\n📍 Ma position : ${currentLocationMapUrl}`;
        const shareMode = locationShareMode.value;
        if (shareMode === "whatsapp") {
          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
          locationShareStatus.textContent = "WhatsApp a été ouvert.";
        } else if (shareMode === "sms") {
          window.location.href = `sms:?body=${encodeURIComponent(message)}`;
        } else {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentLocationMapUrl)}&quote=${encodeURIComponent(message)}`, "_blank", "noopener");
          locationShareStatus.textContent = "Facebook a été ouvert.";
        }
      });

      const towStorageKey = getVehicleScopedStorageKey(TOW_STORAGE_KEY);
      let savedTowNumber = localStorage.getItem(towStorageKey);
      if (!savedTowNumber && getPrimaryVehicleId()) {
        const legacyTowNumber = localStorage.getItem(TOW_STORAGE_KEY);
        if (legacyTowNumber) {
          savedTowNumber = legacyTowNumber;
          localStorage.setItem(towStorageKey, legacyTowNumber);
          localStorage.removeItem(TOW_STORAGE_KEY);
        }
      }
      if (savedTowNumber) {
        towStatus.textContent = "Numéro enregistré · appuyez pour appeler";
      }

      towAction.addEventListener("click", () => {
        const savedNumber = localStorage.getItem(getVehicleScopedStorageKey(TOW_STORAGE_KEY)) || "";
        const enteredNumber = window.prompt("Entrez le numéro du dépanneur", savedNumber);
        if (enteredNumber === null) {
          return;
        }

        const phoneNumber = enteredNumber.replace(/[^\d+]/g, "");
        if (!/^\+?\d{8,15}$/.test(phoneNumber)) {
          showToast("Numéro de dépanneur invalide.");
          return;
        }

        localStorage.setItem(getVehicleScopedStorageKey(TOW_STORAGE_KEY), phoneNumber);
        towStatus.textContent = "Numéro enregistré · appuyez pour appeler";
        window.location.href = `tel:${phoneNumber}`;
      });

      document.querySelector("#documents-screen").addEventListener("change", (event) => {
        const uploadInput = event.target.closest("[data-document-upload]");
        const file = uploadInput?.files?.[0];
        if (!uploadInput || !file) {
          return;
        }

        if (!getPrimaryVehicleId()) {
          uploadInput.value = "";
          showToast("Ajoutez d’abord un véhicule principal.");
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          uploadInput.value = "";
          showToast("Le fichier doit faire 5 Mo maximum.");
          return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
          try {
            const documents = getSavedDocuments();
            documents[uploadInput.dataset.documentUpload] = {
              name: file.name,
              type: file.type,
              size: file.size,
              data: reader.result,
            };
            localStorage.setItem(
              getVehicleScopedStorageKey(DOCUMENTS_STORAGE_KEY),
              JSON.stringify(documents),
            );
            renderDocuments();
            syncOfflineChanges().catch(() => updateConnectionStatus());
            showToast(`${file.name} a été téléchargé.`);
            showScreen("home");
          } catch {
            showToast("Impossible d’enregistrer ce fichier. Essayez un fichier plus léger.");
          }
        });
        reader.addEventListener("error", () => {
          showToast("Impossible de lire ce fichier.");
        });
        reader.readAsDataURL(file);
      });

      const vehicleBrandField = document.querySelector("#vehicle-category");
      const vehicleDetailsForm = document.querySelector("#vehicle-details-form");
      let vehicleFormMode = "edit-primary";
      let vehicleFormVehicleId = "";
      vehicleBrandField.addEventListener("change", (event) => {
        populateVehicleModels(event.currentTarget.value);
      });

