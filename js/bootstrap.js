      function updateBottomNav(screenName) {
        bottomNavItems.forEach((item) => {
          const active = item.dataset.bottomScreen === screenName;
          item.classList.toggle("is-active", active);
          if (active) {
            item.setAttribute("aria-current", "page");
          } else {
            item.removeAttribute("aria-current");
          }
        });
        if (bottomMoreButton) {
          const activeMore = screenName === "more";
          bottomMoreButton.classList.toggle("is-active", activeMore);
          if (activeMore) {
            bottomMoreButton.setAttribute("aria-current", "page");
          } else {
            bottomMoreButton.removeAttribute("aria-current");
          }
        }
      }

      bottomNavItems.forEach((item) => {
        item.addEventListener("click", () => {
          if (item.classList.contains("is-disabled")) {
            showToast("Ajoutez d’abord un véhicule pour accéder à cette section.");
            return;
          }
          const target = item.dataset.bottomScreen;
          if (target) {
            showScreen(target);
            updateBottomNav(target);
          }
        });
      });

      bottomMoreButton?.addEventListener("click", () => {
        if (bottomMoreButton.classList.contains("is-disabled")) {
          showToast("Ajoutez d’abord un véhicule pour accéder à cette section.");
          return;
        }
        showScreen("more");
        updateBottomNav("more");
      });

      document.querySelector('#home-empty-state [data-vehicle-action="add"]')?.addEventListener("click", () => {
        prepareVehicleForm({}, "add-secondary");
        showScreen("vehicle-details");
      });

      // Priorité absolue : déterminer l'état "aucun véhicule" avant tout
      // autre rendu, pour que l'écran d'accueil soit toujours cohérent même
      // si une fonction plus bas échoue sur un état vierge (première visite).
      updateVehicleAvailability();
      updateHomeEmptyState();

      renderDocuments();
      renderCustomReminders();
      renderRepairs();
      renderExpenses();
      renderReports();
      updateConnectionStatus();
      updateMileageReferenceFromRecords();
      renderMonthlyMileageAlert();
      checkAlerts();

      // Premier affichage : toujours ouvrir l'accueil, où le bouton
      // "+ Ajouter" permet de créer le premier véhicule.
      showScreen("home");
      updateBottomNav("home");

      initializeNotificationSupport();
      window.setInterval(() => checkAlerts(), 60000);

      pingAnonymousCounter("siyarati-car-app-opens-v1");
