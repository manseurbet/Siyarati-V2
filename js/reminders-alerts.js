      function getAlertStatus(hoursRemaining) {
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

      function getMileageAlertStatus(mileageRemaining) {
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

      function getMostUrgentAlertStatus(...statuses) {
        const priority = {
          upcoming: 0,
          safe: 1,
          warning: 2,
          critical: 3,
          expired: 4,
        };
        return statuses.sort((first, second) => priority[second] - priority[first])[0] || "upcoming";
      }

      function getManufacturerMaintenanceEntries() {
        const vehicleId = getPrimaryVehicleId();
        const vehicle = getSavedVehicle();
        const brand = vehicle["vehicle-category"] || vehicle["vehicle-brand"];
        const model = vehicle["vehicle-model"];
        const engineType = vehicle["engine-type"];
        const profile = manufacturerMaintenanceProfiles[brand];
        const currentMileage = getCurrentMileage();

        if (!brand || !model || !engineType || !profile || currentMileage === null) {
          return [];
        }

        const interval = profile[engineType] || profile.default;
        if (!interval) {
          return [];
        }

        let baselineMileage = Number(vehicle["last-oil-change-mileage"]);
        if (!Number.isFinite(baselineMileage) || baselineMileage < 0) {
          // Aucune référence connue : on l'ancre une seule fois sur le
          // kilométrage actuel et on la persiste. Sans cela, recalculer la
          // référence à chaque appel fait "fuir" l'échéance en permanence :
          // elle ne devient jamais proche, ni due.
          baselineMileage = currentMileage;
          updateVehicleData(vehicleId, { "last-oil-change-mileage": String(currentMileage) });
        }
        // Si le kilométrage saisi a dépassé l'objectif (vidange non faite à
        // temps), on avance directement au prochain palier atteignable au
        // lieu de rester bloqué sur une échéance déjà dépassée : l'alerte
        // propose toujours un nouvel objectif, pas une impasse.
        let targetMileage = baselineMileage + interval;
        while (currentMileage > targetMileage) {
          targetMileage += interval;
        }
        const mileageRemaining = targetMileage - currentMileage;
        const mileageStatus = getMileageAlertStatus(mileageRemaining);

        return [{
          key: `manufacturer-service-${brand}-${model}`,
          label: "Vidange",
          category: "Constructeur",
          value: targetMileage,
          date: null,
          targetMileage,
          hoursRemaining: null,
          mileageRemaining,
          dateStatus: "upcoming",
          mileageStatus,
          status: mileageStatus,
          isAutomatic: true,
        }];
      }

      function getReminderEntries() {
        const savedReminders = getSavedReminders();
        const fixedEntries = reminderDefinitions
          .filter(({ key }) => savedReminders[key])
          .map(({ key, label }) => {
            const date = new Date(`${savedReminders[key]}T00:00:00`);
            const hoursRemaining = (date.getTime() - Date.now()) / (1000 * 60 * 60);
            const status = getAlertStatus(hoursRemaining);

            return {
              key,
              label,
              value: savedReminders[key],
              date,
              hoursRemaining,
              mileageRemaining: null,
              dateStatus: status,
              mileageStatus: "upcoming",
              status,
            };
          });

        const currentMileage = getCurrentMileage();
        const customEntries = getSavedCustomReminders().map((reminder) => {
          const date = reminder.date ? new Date(`${reminder.date}T00:00:00`) : null;
          const targetMileage = reminder.mileage ? Number(reminder.mileage) : null;
          const hoursRemaining = date ? (date.getTime() - Date.now()) / (1000 * 60 * 60) : null;
          const mileageRemaining = targetMileage !== null && currentMileage !== null
            ? targetMileage - currentMileage
            : null;
          const dateStatus = date ? getAlertStatus(hoursRemaining) : "upcoming";
          const mileageStatus = mileageRemaining !== null ? getMileageAlertStatus(mileageRemaining) : "upcoming";
          const status = getMostUrgentAlertStatus(dateStatus, mileageStatus);

          return {
            key: `custom-${reminder.id}`,
            label: reminder.title,
            category: reminder.category,
            value: reminder.date || reminder.mileage,
            date,
            targetMileage,
            hoursRemaining,
            mileageRemaining,
            dateStatus,
            mileageStatus,
            status,
          };
        });

        const manufacturerEntries = getManufacturerMaintenanceEntries();

        const actions = getSavedAlertActions();
        return [...fixedEntries, ...customEntries, ...manufacturerEntries]
          .sort((first, second) => {
          const firstTarget = first.date ? first.date.getTime() : first.targetMileage ?? Number.POSITIVE_INFINITY;
          const secondTarget = second.date ? second.date.getTime() : second.targetMileage ?? Number.POSITIVE_INFINITY;
          return firstTarget - secondTarget;
          })
          .map((entry) => ({ ...entry, action: actions[entry.key] || null }));
      }

      function formatReminderDate(date) {
        return new Intl.DateTimeFormat("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(date);
      }

      function getReminderStatusLabel(entry) {
        const displayState = getAlertDisplayState(entry);
        if (displayState.status === "done") {
          return "Traitée";
        }

        if (displayState.status === "snoozed" && entry.action?.until) {
          return `Reportée au ${formatReminderDate(new Date(`${entry.action.until}T00:00:00`))}`;
        }

        if (entry.status === "expired") {
          if (entry.mileageRemaining !== null && entry.mileageRemaining !== undefined && entry.mileageStatus === entry.status) {
            const overdueKm = Math.abs(Math.ceil(entry.mileageRemaining));
            return overdueKm > 0 ? `Dépassé de ${overdueKm} km` : "Expiré aujourd’hui";
          }
          if (entry.hoursRemaining !== null && entry.hoursRemaining !== undefined && entry.dateStatus === entry.status) {
            const overdueDays = Math.abs(Math.floor(entry.hoursRemaining / 24));
            return overdueDays > 0 ? `Dépassé de ${overdueDays} jour${overdueDays > 1 ? "s" : ""}` : "Expiré aujourd’hui";
          }
          return "Expiré";
        }

        const targets = [];
        if (entry.hoursRemaining !== null && entry.hoursRemaining !== undefined && entry.dateStatus === entry.status) {
          const days = Math.max(1, Math.ceil(entry.hoursRemaining / 24));
          targets.push(`Dans ${days} jour${days > 1 ? "s" : ""}`);
        }
        if (entry.mileageRemaining !== null && entry.mileageRemaining !== undefined && entry.mileageStatus === entry.status) {
          targets.push(`Dans ${Math.max(0, Math.ceil(entry.mileageRemaining))} km`);
        }
        return targets.join(" · ") || "À venir";
      }

      function getAlertDisplayState(entry) {
        if (entry.action?.state === "done") {
          return { status: "done", active: false };
        }

        if (entry.action?.state === "snoozed" && entry.action.until) {
          const snoozeUntil = new Date(`${entry.action.until}T23:59:59`);
          if (snoozeUntil.getTime() > Date.now()) {
            return { status: "snoozed", active: false };
          }
        }

        return { status: entry.status, active: true };
      }

      function formatReminderTarget(entry) {
        const targets = [];
        if (entry.date) {
          targets.push(`Échéance : ${formatReminderDate(entry.date)}`);
        }
        if (entry.targetMileage !== null && entry.targetMileage !== undefined && Number.isFinite(Number(entry.targetMileage))) {
          targets.push(`Objectif : ${formatMileage(entry.targetMileage)}`);
          const current = getCurrentMileage();
          if (current !== null) {
            targets.push(`Actuel : ${formatMileage(current)}`);
          }
        }
        return targets.join(" · ") || "Échéance à définir";
      }

      function getAlertAdvice(entry) {
        if (entry.status === "expired") {
          return "À faire maintenant : régularisez cette échéance.";
        }
        if (entry.mileageRemaining !== null && entry.mileageRemaining !== undefined) {
          if (entry.mileageRemaining <= 0) {
            return `Kilométrage atteint : prenez rendez-vous dès maintenant (${formatMileage(entry.targetMileage)}).`;
          }
          if (entry.mileageRemaining <= 300) {
            return `Prenez rendez-vous avant d’atteindre ${formatMileage(entry.targetMileage)}.`;
          }
          return `Anticipez cette intervention avant ${formatMileage(entry.targetMileage)}.`;
        }
        if (entry.date) {
          return `Préparez cette démarche avant le ${formatReminderDate(entry.date)}.`;
        }
        return "Ajoutez une date ou un kilométrage pour recevoir une recommandation.";
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function formatCustomReminderTarget(reminder) {
        const targets = [];
        if (reminder.date) {
          targets.push(formatReminderDate(new Date(`${reminder.date}T00:00:00`)));
        }
        if (reminder.mileage) {
          targets.push(formatMileage(reminder.mileage));
        }
        return targets.join(" · ");
      }

      function renderCustomReminders() {
        const list = document.querySelector("#custom-reminder-list");
        const reminders = getSavedCustomReminders();

        if (!reminders.length) {
          list.innerHTML = '<p class="reminder-section-intro">Aucun rappel personnalisé ajouté pour le moment.</p>';
          return;
        }

        list.innerHTML = reminders
          .map((reminder) => `
            <article class="custom-reminder-item">
              <div class="custom-reminder-copy">
                <strong>${escapeHtml(reminder.title)}</strong>
                <small>${escapeHtml(reminder.category)} · ${escapeHtml(formatCustomReminderTarget(reminder))}${reminder.amount ? ` · ${escapeHtml(formatAmount(reminder.amount))}` : ""}</small>
              </div>
              <button class="remove-reminder-button" type="button" data-remove-reminder="${escapeHtml(reminder.id)}" aria-label="Supprimer ${escapeHtml(reminder.title)}">×</button>
            </article>
          `)
          .join("");
      }

      function renderRepairs() {
        const list = document.querySelector("#repair-list");
        if (!list) {
          return;
        }
        const repairs = getSavedRepairs();
        if (!repairs.length) {
          list.innerHTML = '<p class="reminder-section-intro">Aucune réparation enregistrée. Ajoutez une intervention pour construire l’historique réel de votre voiture.</p>';
          return;
        }

        list.innerHTML = repairs
          .slice()
          .sort((first, second) => String(second.date).localeCompare(String(first.date)))
          .map((repair) => {
            const details = [
              repair.category,
              repair.date ? formatReminderDate(new Date(`${repair.date}T00:00:00`)) : "",
              repair.mileage ? formatMileage(repair.mileage) : "",
              repair.amount !== "" && repair.amount !== undefined ? formatAmount(repair.amount) : "",
            ].filter(Boolean).join(" · ");
            return `
              <article class="repair-item">
                <div class="repair-item-copy">
                  <strong>${escapeHtml(repair.title)}</strong>
                  <small>${escapeHtml(details)}${repair.notes ? ` · ${escapeHtml(repair.notes)}` : ""}</small>
                </div>
                <button class="remove-repair-button" type="button" data-remove-repair="${escapeHtml(repair.id)}" aria-label="Supprimer ${escapeHtml(repair.title)}">×</button>
              </article>
            `;
          })
          .join("");
      }

      function getHistoryEntries() {
        const reminderEntries = getSavedCustomReminders()
          .filter((reminder) => reminder.amount !== "" && Number.isFinite(Number(reminder.amount)) && Number(reminder.amount) >= 0)
          .map((reminder) => ({ ...reminder, source: "Rappel" }));
        const repairEntries = getSavedRepairs()
          .filter((repair) => repair.amount !== "" && Number.isFinite(Number(repair.amount)) && Number(repair.amount) >= 0)
          .map((repair) => ({ ...repair, source: "Réparation" }));
        return [...reminderEntries, ...repairEntries];
      }

      function renderExpenses() {
        const list = document.querySelector("#expense-list");
        const total = document.querySelector("#expense-total");
        const count = document.querySelector("#expense-count");
        const expenses = getHistoryEntries();
        const totalAmount = expenses.reduce((sum, reminder) => sum + Number(reminder.amount), 0);

        total.textContent = formatAmount(totalAmount);
        count.textContent = `${expenses.length} rappel${expenses.length > 1 ? "s" : ""}`;

        if (!expenses.length) {
          list.innerHTML = '<p class="reminder-section-intro">Aucun montant enregistré depuis vos rappels.</p>';
          return;
        }

        list.innerHTML = expenses
          .map((expense) => {
            const dateLabel = expense.date
              ? formatReminderDate(new Date(`${expense.date}T00:00:00`))
              : "Date non renseignée";
            return `
              <article class="expense-item">
                <div>
                  <p class="expense-item-category">${escapeHtml(expense.category)}</p>
                  <h3 class="expense-item-title">${escapeHtml(expense.title)}</h3>
                  <p class="expense-item-date">${escapeHtml(dateLabel)}</p>
                </div>
                <strong class="expense-item-amount">${escapeHtml(formatAmount(expense.amount))}</strong>
              </article>
            `;
          })
          .join("");
      }

      function renderReports() {
        const total = document.querySelector("#report-total");
        const count = document.querySelector("#report-count");
        const bars = document.querySelector("#report-bars");
        const recentList = document.querySelector("#report-recent-list");
        const expenses = getHistoryEntries();
        const totalAmount = expenses.reduce((sum, reminder) => sum + Number(reminder.amount), 0);
        const categoryTotals = expenses.reduce((categories, reminder) => {
          categories[reminder.category] = (categories[reminder.category] || 0) + Number(reminder.amount);
          return categories;
        }, {});
        const sortedCategories = Object.entries(categoryTotals).sort((first, second) => second[1] - first[1]);
        const highestCategoryTotal = sortedCategories[0]?.[1] || 0;

        total.textContent = formatAmount(totalAmount);
        count.textContent = expenses.length;

        if (!expenses.length) {
          bars.innerHTML = '<p class="reminder-section-intro">Ajoutez un montant dans un rappel pour afficher le rapport.</p>';
          recentList.innerHTML = '<p class="reminder-section-intro">Aucune donnée disponible pour le moment.</p>';
          const emptyInsight = document.querySelector("#history-insight");
          if (emptyInsight) {
            emptyInsight.textContent = "Analyse automatique : ajoutez vos interventions et leurs montants pour repérer les postes qui coûtent le plus.";
          }
          return;
        }

        bars.innerHTML = sortedCategories
          .map(([category, amount]) => `
            <div class="report-bar-row">
              <div class="report-bar-heading">
                <span>${escapeHtml(category)}</span>
                <strong>${escapeHtml(formatAmount(amount))}</strong>
              </div>
              <div class="report-bar-track" role="img" aria-label="${escapeHtml(category)} : ${escapeHtml(formatAmount(amount))}">
                <div class="report-bar-fill" style="width: ${Math.max(5, (amount / highestCategoryTotal) * 100)}%"></div>
              </div>
            </div>
          `)
          .join("");

        recentList.innerHTML = expenses
          .slice()
          .reverse()
          .slice(0, 5)
          .map((expense) => {
            const dateLabel = expense.date
              ? formatReminderDate(new Date(`${expense.date}T00:00:00`))
              : "Date non renseignée";
            return `
              <div class="report-recent-item">
                <div class="report-recent-copy">
                  <strong>${escapeHtml(expense.title)}</strong>
                  <small>${escapeHtml(expense.category)} · ${escapeHtml(dateLabel)}</small>
                </div>
                <span class="report-recent-amount">${escapeHtml(formatAmount(expense.amount))}</span>
              </div>
            `;
          })
          .join("");

        const insight = document.querySelector("#history-insight");
        if (insight) {
          const highestCategory = sortedCategories[0];
          insight.textContent = highestCategory
            ? `Analyse automatique : la catégorie la plus coûteuse est ${highestCategory[0]} avec ${formatAmount(highestCategory[1])}. Pensez à vérifier les prochaines échéances liées à cette catégorie.`
            : "Analyse automatique : ajoutez vos interventions et leurs montants pour repérer les postes qui coûtent le plus.";
        }
      }

      function getMonthKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
      function isMonthlyMileageUpdated() {
        const id = getPrimaryVehicleId();
        return Boolean(id && localStorage.getItem(`${MONTHLY_MILEAGE_ALERT_KEY}:${id}`) === getMonthKey());
      }
      function markMonthlyMileageUpdated() {
        const id = getPrimaryVehicleId();
        if (id) localStorage.setItem(`${MONTHLY_MILEAGE_ALERT_KEY}:${id}`, getMonthKey());
      }
      function isMonthlyMileageDismissed() {
        const id = getPrimaryVehicleId();
        return Boolean(id && localStorage.getItem(`${MONTHLY_MILEAGE_ALERT_KEY}:dismissed:${id}`) === getMonthKey());
      }
      function markMonthlyMileageDismissed() {
        const id = getPrimaryVehicleId();
        if (id) localStorage.setItem(`${MONTHLY_MILEAGE_ALERT_KEY}:dismissed:${id}`, getMonthKey());
      }
      function renderMonthlyMileageAlert() {
        const alerts = document.querySelectorAll(".monthly-mileage-alert");
        if (!alerts.length) return;
        const hasVehicle = Boolean(getPrimaryVehicleId());
        // Le kilométrage saisi lors de l'actualisation devient la référence
        // courante (via getCurrentMileage/current-mileage) pour tous les
        // calculs (rappel constructeur, rapports…).
        const updated = hasVehicle && isMonthlyMileageUpdated();
        // Le rappel reste actif tant que l'utilisateur n'a ni actualisé,
        // ni explicitement refusé (ignoré) le rappel de ce mois-ci.
        const dismissed = hasVehicle && !updated && isMonthlyMileageDismissed();

        alerts.forEach((alert) => {
          const text = alert.querySelector(".monthly-mileage-alert-text");
          const inlineForm = alert.nextElementSibling?.classList.contains("monthly-mileage-inline-form")
            ? alert.nextElementSibling
            : null;
          alert.classList.toggle("is-disabled", !hasVehicle);
          alert.setAttribute("aria-disabled", String(!hasVehicle));

          // Le rappel disparaît une fois actualisé OU refusé pour le mois en
          // cours, ou tant qu'aucun véhicule n'est enregistré (rien à
          // actualiser). Il réapparaîtra automatiquement au mois suivant.
          alert.hidden = updated || dismissed || !hasVehicle;
          if (updated || dismissed || !hasVehicle) {
            if (inlineForm) inlineForm.hidden = true;
          }
          if (updated || dismissed || !hasVehicle) {
            return;
          }

          if (text) text.textContent = `Mise à jour mensuelle · ${getMonthKey()}`;
        });
      }
      function getMileageReferenceFromRecords() {
        const vehicle = getSavedVehicle();
        const values = [];
        const current = Number(vehicle["current-mileage"]);
        if (Number.isFinite(current) && current >= 0) values.push(current);
        getSavedRepairs().forEach((repair) => { const m = Number(repair.mileage); if (Number.isFinite(m) && m >= 0) values.push(m); });
        return values.length ? Math.max(...values) : null;
      }
      function updateMileageReferenceFromRecords() {
        const id = getPrimaryVehicleId();
        if (!id) return;
        const reference = getMileageReferenceFromRecords();
        if (reference === null) return;
        const vehicles = getSavedVehicles();
        const i = vehicles.findIndex(v => v.id === id);
        if (i < 0) return;
        const current = Number(vehicles[i].data["current-mileage"]);
        if (!Number.isFinite(current) || reference > current) { vehicles[i].data["current-mileage"] = String(reference); saveVehicles(vehicles); }
      }

      function renderHomeAlerts(entries) {
        const list = document.querySelector("#home-alerts-list");
        const count = document.querySelector("#home-alert-count");
        if (!list || !count) {
          return;
        }

        // Une alerte créée dans Rappels doit apparaître immédiatement sur
        // l'accueil, même si son échéance est encore lointaine.
        // Sans véhicule enregistré, aucune alerte n'a de sens.
        const missingVehicleDocuments = getPrimaryVehicleId()
          ? [
              ["carte-grise", "Carte grise"],
              ["assurance", "Assurance"],
              ["vignette", "Vignette"],
            ].filter(([key]) => !getSavedDocuments()[key])
          : [];
        const displayEntries = [...entries];
        if (missingVehicleDocuments.length) {
          displayEntries.push({
            key: "missing-documents",
            label: "Documents à télécharger",
            documentNames: missingVehicleDocuments.map(([, label]) => label),
            status: "warning",
            date: null,
            targetMileage: null,
            isDocumentAlert: true,
          });
        }
        const activeEntries = displayEntries
          .filter((entry) => entry.isDocumentAlert || getAlertDisplayState(entry).active)
          .sort((first, second) => {
            const priority = { expired: 4, critical: 3, warning: 2, safe: 1, upcoming: 0 };
            const priorityDifference = priority[second.status] - priority[first.status];
            if (priorityDifference !== 0) {
              return priorityDifference;
            }
            const firstTarget = first.date ? first.date.getTime() : first.targetMileage ?? Number.POSITIVE_INFINITY;
            const secondTarget = second.date ? second.date.getTime() : second.targetMileage ?? Number.POSITIVE_INFINITY;
            return firstTarget - secondTarget;
          });

        count.textContent = activeEntries.length;

        if (!activeEntries.length) {
          list.innerHTML = !getPrimaryVehicleId()
            ? '<div class="home-alert-empty">Ajoutez votre véhicule pour activer le suivi.</div>'
            : entries.length
              ? '<div class="home-alert-empty">Aucune alerte active pour le moment.</div>'
              : '<div class="home-alert-empty">Aucune alerte pour le moment. Ajoutez vos échéances dans <strong>Rappels</strong>.</div>';
          return;
        }

        list.innerHTML = activeEntries.slice(0, 5).map((entry) => {
          const displayState = entry.isDocumentAlert
            ? { status: "warning", active: true }
            : getAlertDisplayState(entry);
          // Format compact façon "point coloré + une ligne" : on combine le
          // libellé et le statut en une seule phrase (ex. "Assurance dans 8
          // jours") plutôt que deux lignes séparées.
          const summary = entry.isDocumentAlert
            ? `À télécharger : ${entry.documentNames.join(", ")}`
            : `${entry.category ? `${entry.category} · ${entry.label}` : entry.label} ${getReminderStatusLabel(entry).toLowerCase()}`;
          return `
            <button class="home-alert-row" type="button" data-screen="${entry.isDocumentAlert ? "documents" : "alerts"}" data-requires-vehicle>
              <span class="home-alert-icon is-${displayState.status}" aria-hidden="true"></span>
              <span class="home-alert-copy">
                <strong>${escapeHtml(summary)}</strong>
              </span>
              <span class="home-alert-status">Voir</span>
            </button>
          `;
        }).join("");
      }

      function renderAlerts(entries) {
        const summary = document.querySelector("#alert-summary");
        const count = document.querySelector("#alert-count");
        const summaryCopy = document.querySelector("#alert-summary-copy");
        const alertsList = document.querySelector("#alerts-list");
        const activeEntries = entries.filter((entry) => {
          const displayState = getAlertDisplayState(entry);
          return displayState.active;
        });
        summary.classList.toggle("is-clear", activeEntries.length === 0);
        count.textContent = activeEntries.length;

        if (activeEntries.length === 0) {
          summaryCopy.textContent = entries.length
            ? "Aucune échéance active à traiter pour le moment."
            : "Ajoutez vos dates dans Rappels pour activer la surveillance.";
        } else {
          summaryCopy.textContent = `${activeEntries.length} échéance${activeEntries.length > 1 ? "s" : ""} à traiter.`;
        }

        if (!entries.length) {
          alertsList.innerHTML = '<div class="alerts-empty">Aucune date enregistrée pour le moment. Rendez-vous dans <strong>Rappels</strong> pour ajouter vos échéances.</div>';
          return;
        }

        // Une alerte "Traitée" disparaît définitivement de la liste (jusqu'à
        // ce qu'elle redevienne due naturellement) au lieu de rester affichée
        // avec un bouton "Rétablir". Les alertes reportées, elles, restent
        // visibles : ce n'est que temporaire.
        const visibleEntries = entries.filter((entry) => getAlertDisplayState(entry).status !== "done");

        if (!visibleEntries.length) {
          alertsList.innerHTML = '<div class="alerts-empty">Aucune échéance à traiter pour le moment.</div>';
          return;
        }

        alertsList.innerHTML = visibleEntries
          .map((entry) => {
            const displayState = getAlertDisplayState(entry);
            return `
            <article class="alert-item is-${displayState.status}">
              <div class="alert-item-copy">
                <h3 class="alert-item-title">${escapeHtml(entry.category ? `${entry.category} · ${entry.label}` : entry.label)}</h3>
                <p class="alert-item-date">${formatReminderTarget(entry)}</p>
                <p class="alert-item-advice">${escapeHtml(getAlertAdvice(entry))}</p>
              </div>
              <span class="alert-item-status">${getReminderStatusLabel(entry)}</span>
              <div class="alert-item-actions">
                ${displayState.active
                  ? `<button type="button" data-alert-action="done" data-alert-key="${escapeHtml(entry.key)}">Traiter</button>
                     <button type="button" data-alert-action="snooze" data-alert-key="${escapeHtml(entry.key)}">Reporter</button>`
                  : `<button type="button" data-alert-action="restore" data-alert-key="${escapeHtml(entry.key)}">Rétablir</button>`}
              </div>
            </article>
          `;
          })
          .join("");
      }

      function renderSmartAdvice(entries = getReminderEntries()) {
        const list = document.querySelector("#smart-advice-list");
        if (!list) {
          return;
        }

        if (!getPrimaryVehicleId()) {
          list.innerHTML = `
            <article class="smart-advice-item">
              <div class="smart-advice-copy">
                <strong>Commencez par enregistrer votre véhicule</strong>
                <span>SIYARATI pourra ensuite calculer les échéances et les actions prioritaires.</span>
              </div>
              <button class="smart-advice-action" type="button" data-advice-screen="vehicle-info">Configurer</button>
            </article>
             <article class="smart-advice-item">
               <div class="smart-advice-copy">
                 <strong>Ajouter vos documents</strong>
                 <span>Centralisez la carte grise, l’assurance et la vignette de votre véhicule.</span>
               </div>
               <button class="smart-advice-action" type="button" data-advice-screen="documents">Documents</button>
             </article>
             <article class="smart-advice-item">
               <div class="smart-advice-copy">
                 <strong>Ajouter un rappel</strong>
                 <span>Enregistrez une prochaine échéance d’entretien ou de document.</span>
               </div>
               <button class="smart-advice-action" type="button" data-advice-screen="reminders">Ajouter</button>
             </article>
          `;
          return;
        }

        const activeEntries = entries
          .filter((entry) => getAlertDisplayState(entry).active && entry.status !== "upcoming")
          .sort((first, second) => {
            const priority = { expired: 4, critical: 3, warning: 2, safe: 1, upcoming: 0 };
            return priority[second.status] - priority[first.status];
          });
        const missingDocuments = ["carte-grise", "assurance", "vignette"]
          .filter((key) => !getSavedDocuments()[key]);
        const recommendations = [];

        activeEntries.slice(0, 2).forEach((entry) => {
          recommendations.push({
            state: entry.status === "expired" || entry.status === "critical" ? "is-critical" : "is-warning",
            title: entry.status === "expired" || entry.status === "critical" ? "Action prioritaire" : "À planifier",
            text: `${entry.label} · ${getAlertAdvice(entry)}`,
            action: "Voir",
            screen: "alerts",
          });
        });

        if (missingDocuments.length) {
          recommendations.push({
            state: "",
            title: "Complétez le dossier du véhicule",
            text: `Il manque ${missingDocuments.length} document${missingDocuments.length > 1 ? "s" : ""} important${missingDocuments.length > 1 ? "s" : ""}.`,
            action: "Documents",
            screen: "documents",
          });
        }

        recommendations.push({
          state: "",
          title: "Ajouter un rappel",
          text: "Enregistrez une prochaine échéance d’entretien ou de document.",
          action: "Ajouter",
          screen: "reminders",
        });

        if (!recommendations.length) {
          recommendations.push({
            state: "",
            title: "Votre voiture est suivie",
            text: "Aucune action urgente. SIYARATI continuera de surveiller vos dates et votre kilométrage.",
            action: "Rappels",
            screen: "reminders",
          });
        }

        list.innerHTML = recommendations
          .slice(0, 4)
          .map((recommendation) => `
            <article class="smart-advice-item ${recommendation.state}">
              <div class="smart-advice-copy">
                <strong>${escapeHtml(recommendation.title)}</strong>
                <span>${escapeHtml(recommendation.text)}</span>
              </div>
              <button class="smart-advice-action" type="button" data-advice-screen="${recommendation.screen}">${escapeHtml(recommendation.action)}</button>
            </article>
          `)
          .join("");
      }

      function handleAlertAction(action, alertKey) {
        const actions = getSavedAlertActions();
        if (action === "done") {
          actions[alertKey] = { state: "done" };
          showToast("Alerte marquée comme traitée.");
        } else if (action === "snooze") {
          const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const until = window.prompt("Reporter cette alerte jusqu’au (AAAA-MM-JJ)", defaultDate);
          if (until === null) {
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(new Date(`${until}T00:00:00`).getTime())) {
            showToast("Date de report invalide.");
            return;
          }
          actions[alertKey] = { state: "snoozed", until };
          showToast(`Alerte reportée au ${formatReminderDate(new Date(`${until}T00:00:00`))}.`);
        } else {
          delete actions[alertKey];
          showToast("Alerte réactivée.");
        }

        localStorage.setItem(getVehicleScopedStorageKey(ALERT_ACTIONS_STORAGE_KEY), JSON.stringify(actions));
        checkAlerts();
      }

      document.querySelector("#alerts-list").addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-alert-action]");
        if (!actionButton) {
          return;
        }
        handleAlertAction(actionButton.dataset.alertAction, actionButton.dataset.alertKey);
      });

      document.querySelector("#enable-notifications-button").addEventListener("click", async () => {
        if (!getPrimaryVehicleId()) {
          showToast("Ajoutez d’abord un véhicule principal.");
          return;
        }
        if (!("Notification" in window)) {
          showToast("Les notifications ne sont pas disponibles dans ce navigateur.");
          return;
        }
        if (Notification.permission === "denied") {
          showToast("Autorisez les notifications dans les réglages du navigateur.");
          updateNotificationControls();
          return;
        }

        if (!notificationRegistration) {
          await initializeNotificationSupport();
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          showToast("Les notifications n’ont pas été activées.");
          updateNotificationControls();
          return;
        }

        const backgroundEnabled = await registerBackgroundNotificationCheck();
        saveNotificationPreferences({ enabled: true, backgroundEnabled });
        await syncOfflineChanges({ notify: true });
        updateNotificationControls();
        showToast(backgroundEnabled
          ? "Notifications activées, y compris en arrière-plan."
          : "Notifications activées pour les vérifications disponibles.");
      });

      function checkAlerts(options = {}) {
        const entries = getReminderEntries();
        const criticalEntries = entries.filter((entry) =>
          (entry.status === "critical" || entry.status === "expired") && getAlertDisplayState(entry).active
        );
        const criticalSignature = criticalEntries.map((entry) => `${entry.key}:${entry.value}`).join("|");

        renderHomeAlerts(entries);
        renderAlerts(entries);

        const shouldPlaySound =
          criticalEntries.length &&
          (options.playSound || (soundUnlocked && criticalSignature !== lastUrgentSignature));

        if (shouldPlaySound) {
          playAlertTone();
        }

        lastUrgentSignature = criticalSignature;
        updateNotificationControls();
        syncOfflineChanges({ notify: true }).catch(() => updateConnectionStatus());
      }

