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
          const target = item.dataset.bottomScreen;
          if (target) {
            showScreen(target);
            updateBottomNav(target);
          }
        });
      });

      bottomMoreButton?.addEventListener("click", () => {
        showScreen("more");
        updateBottomNav("more");
      });
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
