(function () {
  const STORAGE_KEY = "arc-perform-milestones-prototype-v1";
  const DEMO_TODAY = new Date(window.DEMO_DATA.meta.demoToday + "T00:00:00");
  const appEl = document.getElementById("app");
  const STATUSES = ["Draft", "Ready for Review", "Submitted", "Verified", "Rejected"];

  let state = loadState();
  let ui = {
    drawer: null,
    modal: null,
    toast: null
  };
  let toastTimer = null;

  window.addEventListener("hashchange", render);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);

  if (!window.location.hash) {
    window.location.hash = "#/portfolio/summary";
  } else {
    render();
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return normalizeState(raw ? JSON.parse(raw) : clone(window.DEMO_DATA));
    } catch (error) {
      return normalizeState(clone(window.DEMO_DATA));
    }
  }

  function normalizeState(rawState) {
    const nextState = clone(rawState || window.DEMO_DATA);
    const metrics = nextState.metrics || [];

    nextState.targetsByMetricId = metrics.reduce((collection, metric) => {
      const rawTargets = nextState.targetsByMetricId ? nextState.targetsByMetricId[metric.id] : [];
      const targets = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];

      collection[metric.id] = targets.map((target, index) => ({
        ...target,
        id: target.id || "target-" + metric.id + "-" + (index + 1),
        metricId: metric.id,
        lifecycleStatus: target.lifecycleStatus || "Active"
      }));
      return collection;
    }, {});

    nextState.datapointsByMetricId = metrics.reduce((collection, metric) => {
      const datapoints = nextState.datapointsByMetricId ? nextState.datapointsByMetricId[metric.id] || [] : [];
      collection[metric.id] = datapoints.map((datapoint, index) => ({
        ...datapoint,
        id: datapoint.id || "dp-" + metric.id + "-" + (index + 1),
        metricId: metric.id,
        targetId: datapoint.targetId || null
      }));
      return collection;
    }, {});

    metrics.forEach((metric) => {
      const metricTargets = nextState.targetsByMetricId[metric.id];
      const datapoints = nextState.datapointsByMetricId[metric.id];

      datapoints.forEach((datapoint) => {
        if (datapoint.targetId) {
          return;
        }

        const draftTarget = buildDraftTargetRecord(metric.id, {
          id: "target-draft-" + datapoint.id,
          endDate: datapoint.endDate,
          value: datapoint.value,
          uom: datapoint.uom
        });

        if (!metricTargets.some((target) => target.id === draftTarget.id)) {
          metricTargets.push(draftTarget);
        }

        datapoint.targetId = draftTarget.id;
      });
    });

    const renewableTargets = nextState.targetsByMetricId["energy-renewable-energy-use"] || [];
    renewableTargets.forEach((target) => {
      if (target.id === "target-draft-dp-energy-2023-headless") {
        target.name = "2023 Renewables";
      }
    });

    const renewableDatapoints = nextState.datapointsByMetricId["energy-renewable-energy-use"] || [];
    renewableDatapoints.forEach((datapoint) => {
      if (datapoint.id === "dp-energy-2023-headless") {
        datapoint.name = "2023 Renewables";
      }
    });

    return nextState;
  }

  function persistState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Local storage is optional in this prototype.
    }
  }

  function resetState() {
    state = normalizeState(clone(window.DEMO_DATA));
    persistState();
    ui.drawer = null;
    ui.modal = null;
    showToast("Demo data reset.");
    render();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getRoute() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash === "/portfolio/summary") {
      return { page: "summary", activeCategory: "summary" };
    }

    if (hash.startsWith("/metric/")) {
      const metricId = hash.split("/")[2];
      const metric = getMetric(metricId);
      if (metric) {
        return {
          page: "metric",
          metricId,
          activeCategory: metric.category
        };
      }
    }

    return { page: "summary", activeCategory: "summary" };
  }

  function getMetric(metricId) {
    return state.metrics.find((metric) => metric.id === metricId) || null;
  }

  function getTargets(metricId) {
    return (state.targetsByMetricId[metricId] || []).slice();
  }

  function isDraftTarget(target) {
    return Boolean(target && target.lifecycleStatus === "Draft");
  }

  function getDisplayTargets(metricId) {
    return getTargets(metricId).sort(function (left, right) {
      if (isDraftTarget(left) === isDraftTarget(right)) {
        return 0;
      }
      return isDraftTarget(left) ? 1 : -1;
    });
  }

  function getTarget(metricId, targetId) {
    return getTargets(metricId).find((target) => target.id === targetId) || null;
  }

  function getDatapoints(metricId) {
    return (state.datapointsByMetricId[metricId] || []).slice();
  }

  function getDatapoint(metricId, datapointId) {
    return getDatapoints(metricId).find((datapoint) => datapoint.id === datapointId) || null;
  }

  function getDatapointsForTarget(metricId, targetId) {
    return getDatapoints(metricId).filter((datapoint) => datapoint.targetId === targetId);
  }

  function getHeadlessDatapoints(metricId) {
    return getDatapoints(metricId).filter((datapoint) => !datapoint.targetId);
  }

  function compareByEndDate(left, right) {
    return new Date(left.endDate).getTime() - new Date(right.endDate).getTime();
  }

  function getSortedDatapoints(metricId, targetId) {
    const datapoints = targetId ? getDatapointsForTarget(metricId, targetId) : getDatapoints(metricId);
    return datapoints.sort(compareByEndDate);
  }

  function getPastDatapoints(metricId, targetId) {
    return getSortedDatapoints(metricId, targetId)
      .filter((datapoint) => !isFutureDatapoint(datapoint))
      .sort((left, right) => new Date(right.endDate).getTime() - new Date(left.endDate).getTime());
  }

  function getFutureDatapoints(metricId, targetId) {
    return getSortedDatapoints(metricId, targetId).filter((datapoint) => isFutureDatapoint(datapoint));
  }

  function getAllPastMilestones() {
    return state.metrics
      .flatMap((metric) =>
        getPastDatapoints(metric.id).map((datapoint) => ({
          metric,
          datapoint
        }))
      )
      .sort((left, right) => new Date(right.datapoint.endDate).getTime() - new Date(left.datapoint.endDate).getTime());
  }

  function buildEndDateFromYear(year) {
    return String(year) + "-12-31";
  }

  function isFutureEndDate(endDateString) {
    return new Date(endDateString + "T00:00:00").getTime() > DEMO_TODAY.getTime();
  }

  function isFutureDatapoint(datapoint) {
    return isFutureEndDate(datapoint.endDate);
  }

  function getYear(dateString) {
    return Number(String(dateString).slice(0, 4));
  }

  function getReportingStartDate(endDateString) {
    const endDate = new Date(endDateString + "T00:00:00");
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    startDate.setDate(startDate.getDate() + 1);
    return startDate;
  }

  function formatDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getReportingStartDateInputValue(endDateString) {
    return endDateString ? formatDateInputValue(getReportingStartDate(endDateString)) : "";
  }

  function periodsOverlap(leftEndDate, rightEndDate) {
    const leftStart = getReportingStartDate(leftEndDate).getTime();
    const leftEnd = new Date(leftEndDate + "T00:00:00").getTime();
    const rightStart = getReportingStartDate(rightEndDate).getTime();
    const rightEnd = new Date(rightEndDate + "T00:00:00").getTime();
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  function formatDateValue(date) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function formatDate(dateString) {
    return formatDateValue(new Date(dateString + "T00:00:00"));
  }

  function formatPeriod(dateString) {
    return "Year " + getYear(dateString);
  }

  function getReportingRangeLabel(endDateString) {
    return formatDateValue(getReportingStartDate(endDateString)) + " - " + formatDate(endDateString);
  }

  function formatValue(value) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return escapeHtml(String(value));
    }
    if (Math.round(number) === number) {
      return number.toLocaleString("en-US");
    }
    return number.toLocaleString("en-US", {
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function statusKey(status) {
    return String(status || "")
      .toLowerCase()
      .replaceAll(/\s+/g, "-");
  }

  function renderChip(status) {
    return '<span class="chip ' + statusKey(status) + '">' + escapeHtml(status) + "</span>";
  }

  function getAssociatedTargetLabel(metricId, targetId) {
    if (!targetId) {
      return "Target missing";
    }

    const target = getTarget(metricId, targetId);
    return target ? target.name : "Target missing";
  }

  function getTargetStatus(metricId, targetId) {
    const target = getTarget(metricId, targetId);
    if (isDraftTarget(target)) {
      return "Draft";
    }

    const datapoints = getDatapointsForTarget(metricId, targetId);
    if (!datapoints.length) {
      return "In progress";
    }
    if (datapoints.some((datapoint) => datapoint.status === "Rejected")) {
      return "Rejected";
    }
    if (datapoints.some((datapoint) => datapoint.status === "Submitted")) {
      return "Submitted";
    }
    if (datapoints.some((datapoint) => datapoint.status === "Ready for Review")) {
      return "Ready for Review";
    }
    if (datapoints.every((datapoint) => datapoint.status === "Verified")) {
      return "Verified";
    }
    return "In progress";
  }

  function getTargetEntryName(datapoint, kind) {
    if (datapoint.name) {
      return datapoint.name;
    }
    const year = getYear(datapoint.endDate);
    return kind === "interim-target" ? "Interim target " + year : "Past performance " + year;
  }

  function getDraftTargetName(endDateString) {
    return "draft " + getYear(endDateString);
  }

  function buildDraftTargetRecord(metricId, config) {
    return {
      id: config.id || "target-draft-" + metricId + "-" + Date.now(),
      metricId: metricId,
      name: config.name || getDraftTargetName(config.endDate),
      value: config.value,
      endDate: config.endDate,
      uom: config.uom,
      lifecycleStatus: "Draft"
    };
  }

  function createDraftTarget(metricId, config) {
    if (!state.targetsByMetricId[metricId]) {
      state.targetsByMetricId[metricId] = [];
    }

    const draftTarget = buildDraftTargetRecord(metricId, config);
    state.targetsByMetricId[metricId].push(draftTarget);
    return draftTarget;
  }

  function showToast(message) {
    ui.toast = message;
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(function () {
      ui.toast = null;
      render();
    }, 2600);
  }

  function handleClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      return;
    }

    const action = trigger.dataset.action;

    if (action === "navigate") {
      window.location.hash = trigger.dataset.route || "#/portfolio/summary";
      return;
    }

    if (action === "close-drawer") {
      ui.drawer = null;
      render();
      return;
    }

    if (action === "close-modal") {
      ui.modal = null;
      render();
      return;
    }

    if (action === "open-add-milestone") {
      openPastPerformanceDrawer(trigger.dataset.metricId || "", trigger.dataset.targetId || "", Boolean(trigger.dataset.metricLocked));
      return;
    }

    if (action === "open-add-interim-target") {
      openDatapointDrawer(trigger.dataset.metricId || "", "interim-target", trigger.dataset.targetId || "", true);
      return;
    }

    if (action === "open-create-target") {
      openTargetDrawer(trigger.dataset.metricId || "", trigger.dataset.targetId || "", getRoute().page === "metric", trigger.dataset.section || "target");
      return;
    }

    if (action === "open-target-details") {
      openTargetDetailsDrawer(trigger.dataset.metricId, trigger.dataset.targetId);
      return;
    }

    if (action === "edit-target-section") {
      openTargetDrawer(trigger.dataset.metricId || "", trigger.dataset.targetId || "", true, trigger.dataset.section || "target");
      return;
    }

    if (action === "open-milestone-details") {
      openMilestoneDetailsDrawer(trigger.dataset.metricId, trigger.dataset.datapointId);
      return;
    }

    if (action === "save-datapoint") {
      saveDatapoint();
      return;
    }

    if (action === "choose-past-performance-association") {
      choosePastPerformanceAssociation(trigger.dataset.targetId || "");
      return;
    }

    if (action === "save-past-performance") {
      savePastPerformance("exit");
      return;
    }

    if (action === "save-past-performance-exit") {
      savePastPerformance("exit");
      return;
    }

    if (action === "save-past-performance-verify") {
      savePastPerformance("verify");
      return;
    }

    if (action === "save-datapoint-ready") {
      saveDatapoint("Ready for Review");
      return;
    }

    if (action === "toggle-edit-milestone") {
      toggleMilestoneEdit(true);
      return;
    }

    if (action === "cancel-edit-milestone") {
      toggleMilestoneEdit(false);
      return;
    }

    if (action === "save-milestone-details") {
      saveMilestoneDetails();
      return;
    }

    if (action === "save-milestone-status") {
      saveMilestoneStatus();
      return;
    }

    if (action === "request-verification") {
      openRequestVerificationModal(trigger.dataset.metricId, trigger.dataset.datapointId);
      return;
    }

    if (action === "confirm-request-verification") {
      submitVerificationRequest();
      return;
    }

    if (action === "start-target-draft") {
      startTargetDraft(trigger.dataset.mode);
      return;
    }

    if (action === "cancel-target-draft") {
      cancelTargetDraft();
      return;
    }

    if (action === "save-target-draft") {
      saveTargetDraft();
      return;
    }

    if (action === "remove-target-draft") {
      removeTargetDraft(trigger.dataset.draftId);
      return;
    }

    if (action === "save-target") {
      saveTarget();
      return;
    }

    if (action === "set-target-editor-section") {
      if (ui.drawer && ui.drawer.type === "target") {
        const nextSection = normalizeTargetDrawerSection(trigger.dataset.section || "target");
        ui.drawer.activeSection = ui.drawer.activeSection === nextSection ? "" : nextSection;
        render();
      }
      return;
    }

    if (action === "reset-demo") {
      resetState();
    }
  }

  function handleChange(event) {
    const field = event.target.closest("[data-drawer-field]");
    if (field && ui.drawer) {
      const key = field.dataset.drawerField;
      const value = field.value;

      if (ui.drawer.type === "datapoint") {
        ui.drawer.form[key] = value;
        if (key === "metricId") {
          ui.drawer.form.targetId = "";
          ui.drawer.form.reportingYear = "";
          ui.drawer.form.value = "";
          ui.drawer.form.status = "Draft";
          syncDatapointDrawerUom();
        } else if (key === "targetId") {
          syncDatapointDrawerUom();
        }
        ui.drawer.errors = {};
        render();
        return;
      }

      if (ui.drawer.type === "past-performance") {
        ui.drawer.form[key] = value;
        if (key === "metricId") {
          ui.drawer.form.targetId = "";
          ui.drawer.form.name = "";
          ui.drawer.form.endDate = "";
          ui.drawer.form.value = "";
          ui.drawer.form.uom = "";
          ui.drawer.associationChosen = false;
          ui.drawer.associationMode = "";
          syncPastPerformanceDrawerUom();
        }
        ui.drawer.errors = {};
        render();
        return;
      }

      if (ui.drawer.type === "target") {
        ui.drawer.form[key] = value;
        if (key === "metricId") {
          populateTargetDrawer(value, "");
        } else if (key === "uom") {
          syncTargetDraftUom(value);
        }
        ui.drawer.errors = {};
        render();
        return;
      }

      if (ui.drawer.type === "milestone-details") {
        ui.drawer.form[key] = value;
        ui.drawer.errors = {};
        render();
        return;
      }
    }

    const draftField = event.target.closest("[data-target-draft-field]");
    if (draftField && ui.drawer && ui.drawer.type === "target" && ui.drawer.draftEditor) {
      ui.drawer.draftEditor[draftField.dataset.targetDraftField] = draftField.value;
      ui.drawer.draftErrors = {};
      render();
    }
  }

  function handleInput(event) {
    const field = event.target.closest("[data-drawer-field]");
    if (field && ui.drawer) {
      ui.drawer.form[field.dataset.drawerField] = field.value;
      ui.drawer.errors = {};
      return;
    }

    const draftField = event.target.closest("[data-target-draft-field]");
    if (draftField && ui.drawer && ui.drawer.type === "target" && ui.drawer.draftEditor) {
      ui.drawer.draftEditor[draftField.dataset.targetDraftField] = draftField.value;
      ui.drawer.draftErrors = {};
    }
  }

  function openDatapointDrawer(metricId, mode, targetId, metricLocked) {
    const target = getTarget(metricId, targetId);
    ui.drawer = {
      type: "datapoint",
      mode: mode,
      metricLocked: Boolean(metricLocked || targetId),
      targetLocked: Boolean(targetId),
      form: {
        metricId: metricId || "",
        targetId: targetId || "",
        reportingYear: "",
        value: "",
        uom: target ? target.uom : "",
        status: "Draft"
      },
      errors: {}
    };
    syncDatapointDrawerUom();
    render();
  }

  function openPastPerformanceDrawer(metricId, targetId, metricLocked) {
    ui.drawer = {
      type: "past-performance",
      metricLocked: Boolean(metricLocked || targetId),
      associationChosen: Boolean(targetId),
      associationMode: targetId ? "existing" : "",
      form: {
        metricId: metricId || "",
        targetId: targetId || "",
        name: "",
        endDate: "",
        value: "",
        uom: ""
      },
      errors: {}
    };
    syncPastPerformanceDrawerUom();
    render();
  }

  function syncPastPerformanceDrawerUom() {
    if (!ui.drawer || ui.drawer.type !== "past-performance") {
      return;
    }

    const metric = getMetric(ui.drawer.form.metricId);
    const target = getTarget(ui.drawer.form.metricId, ui.drawer.form.targetId);
    if (!metric) {
      ui.drawer.form.uom = "";
      return;
    }

    if (target) {
      ui.drawer.form.uom = target.uom;
      return;
    }

    if (!ui.drawer.associationChosen) {
      ui.drawer.form.uom = "";
      return;
    }

    if (!metric.uomOptions.includes(ui.drawer.form.uom)) {
      ui.drawer.form.uom = metric.uomOptions[0] || "";
    }
  }

  function choosePastPerformanceAssociation(targetId) {
    if (!ui.drawer || ui.drawer.type !== "past-performance") {
      return;
    }

    ui.drawer.form.targetId = targetId || "";
    ui.drawer.associationChosen = true;
    ui.drawer.associationMode = targetId ? "existing" : "draft";
    ui.drawer.errors = {};
    syncPastPerformanceDrawerUom();
    render();
  }

  function savePastPerformance(nextStep) {
    if (!ui.drawer || ui.drawer.type !== "past-performance") {
      return;
    }

    const form = ui.drawer.form;
    const endDate = form.endDate;
    const value = Number(form.value);
    const createsDraftTarget = ui.drawer.associationMode === "draft";
    const target = getTarget(form.metricId, form.targetId);
    const resolvedUom = target ? target.uom : form.uom;
    const errors = {};

    if (!form.metricId) {
      errors.metricId = "Choose a metric.";
    }
    if (form.metricId && !ui.drawer.associationChosen) {
      errors.targetId = "Choose whether this record should be tracked with no target or on an existing target.";
    }
    if (!form.name || !form.name.trim()) {
      errors.name = "Enter the performance name.";
    }
    if (!form.endDate) {
      errors.endDate = "Choose the performance end date.";
    }
    if (!form.value) {
      errors.value = "Enter the datapoint value.";
    } else if (Number.isNaN(value)) {
      errors.value = "Value must be numeric.";
    }
    if (!resolvedUom) {
      errors.uom = "Choose a unit of measure.";
    }

    if (form.endDate && target) {
      const duplicate = getDatapoints(form.metricId).some(function (datapoint) {
        const sameScope = (datapoint.targetId || null) === (form.targetId || null);
        const sameUom = datapoint.uom === resolvedUom;
        return sameScope && sameUom && periodsOverlap(datapoint.endDate, endDate);
      });

      if (duplicate) {
        errors.endDate = "This reporting period overlaps an existing past performance record in the same scope.";
      }
      if (isFutureEndDate(endDate)) {
        errors.endDate = "Past performance end dates must be in the past.";
      }
    }

    ui.drawer.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    if (!state.datapointsByMetricId[form.metricId]) {
      state.datapointsByMetricId[form.metricId] = [];
    }

    let targetId = form.targetId || "";
    if (createsDraftTarget && !targetId) {
      targetId = createDraftTarget(form.metricId, {
        endDate: endDate,
        value: value,
        uom: resolvedUom
      }).id;
    }

    const datapointId = "dp-" + form.metricId + "-" + Date.now();

    state.datapointsByMetricId[form.metricId].push({
      id: datapointId,
      metricId: form.metricId,
      targetId: targetId || null,
      name: form.name.trim(),
      startDate: getReportingStartDateInputValue(endDate),
      endDate: endDate,
      value: value,
      uom: resolvedUom,
      status: "Draft"
    });

    persistState();

    if (nextStep === "verify") {
      ui.drawer = null;
      ui.modal = {
        type: "documentation",
        metricId: form.metricId,
        targetId: targetId || null,
        datapointId: datapointId
      };
      render();
      return;
    }

    ui.drawer = null;
    showToast("Performance saved.");
    render();
  }

  function syncDatapointDrawerUom() {
    if (!ui.drawer || ui.drawer.type !== "datapoint") {
      return;
    }

    const metric = getMetric(ui.drawer.form.metricId);
    const target = getTarget(ui.drawer.form.metricId, ui.drawer.form.targetId);

    if (!metric) {
      ui.drawer.form.uom = "";
      return;
    }

    if (target) {
      ui.drawer.form.uom = target.uom;
      return;
    }

    if (!metric.uomOptions.includes(ui.drawer.form.uom)) {
      ui.drawer.form.uom = metric.uomOptions[0] || "";
    }
  }

  function openMilestoneDetailsDrawer(metricId, datapointId) {
    const datapoint = getDatapoint(metricId, datapointId);
    if (!datapoint) {
      return;
    }

    ui.drawer = {
      type: "milestone-details",
      metricId: metricId,
      datapointId: datapointId,
      editMode: false,
      form: {
        name: datapoint.name || "",
        endDate: datapoint.endDate,
        value: String(datapoint.value),
        uom: datapoint.uom,
        status: datapoint.status
      },
      errors: {}
    };
    render();
  }

  function toggleMilestoneEdit(nextValue) {
    if (!ui.drawer || ui.drawer.type !== "milestone-details") {
      return;
    }

    const datapoint = getDatapoint(ui.drawer.metricId, ui.drawer.datapointId);
    if (!datapoint) {
      return;
    }

    ui.drawer.editMode = nextValue;
    ui.drawer.errors = {};
    if (!nextValue) {
      ui.drawer.form.name = datapoint.name || "";
      ui.drawer.form.endDate = datapoint.endDate;
      ui.drawer.form.value = String(datapoint.value);
      ui.drawer.form.uom = datapoint.uom;
      ui.drawer.form.status = datapoint.status;
    }
    render();
  }

  function saveDatapoint(forcedStatus) {
    if (!ui.drawer || ui.drawer.type !== "datapoint") {
      return;
    }

    const form = ui.drawer.form;
    const metric = getMetric(form.metricId);
    const target = getTarget(form.metricId, form.targetId);
    const mode = ui.drawer.mode;
    const year = Number(form.reportingYear);
    const value = Number(form.value);
    const endDate = buildEndDateFromYear(year);
    const resolvedUom = target ? target.uom : form.uom;
    const errors = {};

    if (!form.metricId) {
      errors.metricId = "Choose a metric.";
    }
    if (mode === "interim-target" && !form.targetId) {
      errors.targetId = "Choose the target for this interim target.";
    }
    if (!form.reportingYear) {
      errors.reportingYear = "Choose the reporting year.";
    }
    if (!form.value) {
      errors.value = "Enter the datapoint value.";
    } else if (Number.isNaN(value)) {
      errors.value = "Value must be numeric.";
    }
    if (!resolvedUom) {
      errors.uom = "Choose a unit of measure.";
    }
    if (mode === "milestone" && !form.status && !forcedStatus) {
      errors.status = "Choose the past performance status.";
    }

    if (form.reportingYear && form.targetId) {
      const duplicate = getDatapoints(form.metricId).some(function (datapoint) {
        const sameScope = (datapoint.targetId || null) === (form.targetId || null);
        const sameYear = getYear(datapoint.endDate) === year;
        const sameUom = datapoint.uom === resolvedUom;
        return sameScope && sameYear && sameUom;
      });

      if (duplicate) {
        errors.reportingYear = "This reporting year already exists for this past performance scope.";
      }
      if (mode === "milestone" && isFutureEndDate(endDate)) {
        errors.reportingYear = "Future-dated entries are interim targets and require a target.";
      }
      if (mode === "interim-target" && !isFutureEndDate(endDate)) {
        errors.reportingYear = "Interim targets must use a future reporting year.";
      }
    }

    ui.drawer.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    if (!state.datapointsByMetricId[form.metricId]) {
      state.datapointsByMetricId[form.metricId] = [];
    }

    let targetId = form.targetId || "";
    if (mode === "milestone" && !targetId) {
      targetId = createDraftTarget(form.metricId, {
        endDate: endDate,
        value: value,
        uom: resolvedUom
      }).id;
    }

    state.datapointsByMetricId[form.metricId].push({
      id: "dp-" + form.metricId + "-" + year + "-" + Date.now(),
      metricId: form.metricId,
      targetId: targetId || null,
      endDate: endDate,
      value: value,
      uom: resolvedUom,
      status: mode === "interim-target" ? "Draft" : forcedStatus || form.status
    });

    persistState();
    ui.drawer = null;
    showToast(mode === "interim-target" ? "Interim target saved." : "Past performance saved.");
    render();
  }

  function saveMilestoneStatus() {
    if (!ui.drawer || ui.drawer.type !== "milestone-details") {
      return;
    }

    const datapoint = getDatapoint(ui.drawer.metricId, ui.drawer.datapointId);
    if (!datapoint) {
      return;
    }

    datapoint.status = ui.drawer.form.status;
    persistState();
    showToast("Past performance status updated.");
    render();
  }

  function saveMilestoneDetails() {
    if (!ui.drawer || ui.drawer.type !== "milestone-details") {
      return;
    }

    const datapoint = getDatapoint(ui.drawer.metricId, ui.drawer.datapointId);
    if (!datapoint) {
      return;
    }

    const form = ui.drawer.form;
    const endDate = form.endDate;
    const value = Number(form.value);
    const errors = {};

    if (!form.name || !form.name.trim()) {
      errors.name = "Enter the past performance name.";
    }
    if (!form.endDate) {
      errors.endDate = "Choose the past performance end date.";
    }
    if (!form.value) {
      errors.value = "Enter the datapoint value.";
    } else if (Number.isNaN(value)) {
      errors.value = "Value must be numeric.";
    }

    if (form.endDate) {
      const duplicate = getDatapoints(ui.drawer.metricId).some(function (entry) {
        if (entry.id === ui.drawer.datapointId) {
          return false;
        }
        const sameScope = (entry.targetId || null) === (datapoint.targetId || null);
        const sameUom = entry.uom === datapoint.uom;
        return sameScope && sameUom && periodsOverlap(entry.endDate, endDate);
      });

      if (duplicate) {
        errors.endDate = "This reporting period overlaps an existing past performance record in the same scope.";
      }
      if (isFutureEndDate(endDate)) {
        errors.endDate = "Past performance end dates must be in the past.";
      }
    }

    ui.drawer.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    datapoint.name = form.name.trim();
    datapoint.startDate = getReportingStartDateInputValue(endDate);
    datapoint.endDate = endDate;
    datapoint.value = value;
    datapoint.status = form.status;
    persistState();
    ui.drawer.editMode = false;
    showToast("Past performance updated.");
    render();
  }

  function openTargetDrawer(metricId, targetId, metricLocked, activeSection) {
    ui.drawer = {
      type: "target",
      metricLocked: Boolean(metricLocked || targetId),
      activeSection: normalizeTargetDrawerSection(activeSection || "target"),
      form: {
        metricId: metricId || "",
        targetId: targetId || "",
        targetName: "",
        targetValue: "",
        targetEndDate: "",
        uom: ""
      },
      errors: {},
      drafts: [],
      draftEditor: null,
      draftErrors: {}
    };
    populateTargetDrawer(metricId || "", targetId || "");
    render();
  }

  function normalizeTargetDrawerSection(sectionId) {
    if (sectionId === "milestone" || sectionId === "interim-target") {
      return "interim-target";
    }

    return sectionId;
  }

  function populateTargetDrawer(metricId, targetId) {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    const metric = getMetric(metricId);
    const target = getTarget(metricId, targetId);

    ui.drawer.form.metricId = metricId;
    ui.drawer.form.targetId = targetId;
    ui.drawer.form.targetName = target ? target.name : "";
    ui.drawer.form.targetValue = target ? String(target.value) : "";
    ui.drawer.form.targetEndDate = target ? target.endDate : "";
    ui.drawer.form.uom = target ? target.uom : metric && metric.uomOptions.length ? metric.uomOptions[0] : "";
    ui.drawer.drafts = [];
    ui.drawer.draftEditor = null;
    ui.drawer.draftErrors = {};
  }

  function getTargetDrawerLockedUom() {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return "";
    }

    const targetId = ui.drawer.form.targetId;
    if (targetId && getDatapointsForTarget(ui.drawer.form.metricId, targetId).length) {
      const target = getTarget(ui.drawer.form.metricId, targetId);
      return target ? target.uom : "";
    }

    if (ui.drawer.drafts.length) {
      return ui.drawer.drafts[0].uom;
    }

    return "";
  }

  function getTargetDrawerResolvedUom() {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return "";
    }
    return getTargetDrawerLockedUom() || ui.drawer.form.uom;
  }

  function syncTargetDraftUom(nextUom) {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    ui.drawer.drafts = ui.drawer.drafts.map(function (draft) {
      return {
        ...draft,
        uom: nextUom
      };
    });
  }

  function startTargetDraft(mode) {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    const sectionId = normalizeTargetDrawerSection(mode);
    ui.drawer.activeSection = sectionId;
    ui.drawer.draftEditor = {
      mode: sectionId,
      name: "",
      endDate: "",
      value: "",
      status: "Draft"
    };
    ui.drawer.draftErrors = {};
    render();
  }

  function cancelTargetDraft() {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    ui.drawer.draftEditor = null;
    ui.drawer.draftErrors = {};
    render();
  }

  function removeTargetDraft(draftId) {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    ui.drawer.drafts = ui.drawer.drafts.filter(function (draft) {
      return draft.id !== draftId;
    });
    render();
  }

  function saveTargetDraft() {
    if (!ui.drawer || ui.drawer.type !== "target" || !ui.drawer.draftEditor) {
      return;
    }

    const editor = ui.drawer.draftEditor;
    const draftMode = normalizeTargetDrawerSection(editor.mode);
    const endDate = editor.endDate;
    const value = Number(editor.value);
    const resolvedUom = getTargetDrawerResolvedUom();
    const targetId = ui.drawer.form.targetId;
    const errors = {};

    if (!ui.drawer.form.metricId) {
      errors.metricId = "Choose a metric before adding target pathway datapoints.";
    }
    if (!editor.name || !editor.name.trim()) {
      errors.name = "Enter a name.";
    }
    if (!editor.endDate) {
      errors.endDate = "Choose the end date.";
    }
    if (!editor.value) {
      errors.value = "Enter the datapoint value.";
    } else if (Number.isNaN(value)) {
      errors.value = "Value must be numeric.";
    }
    if (!resolvedUom) {
      errors.uom = "Choose the target unit before adding pathway datapoints.";
    }

    if (editor.endDate) {
      const duplicateExisting = targetId
        ? getDatapointsForTarget(ui.drawer.form.metricId, targetId).some(function (datapoint) {
            return periodsOverlap(datapoint.endDate, endDate);
          })
        : false;
      const duplicateDraft = ui.drawer.drafts.some(function (draft) {
        return periodsOverlap(draft.endDate, endDate);
      });

      if (duplicateExisting || duplicateDraft) {
        errors.endDate = "This reporting period overlaps an existing record on the target pathway.";
      }
    }

    ui.drawer.draftErrors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    ui.drawer.drafts.push({
      id: "draft-" + ui.drawer.form.metricId + "-" + Date.now(),
      mode: draftMode,
      name: editor.name.trim(),
      startDate: getReportingStartDateInputValue(endDate),
      endDate: endDate,
      value: value,
      uom: resolvedUom,
      status: "Draft"
    });

    ui.drawer.draftEditor = null;
    ui.drawer.draftErrors = {};
    render();
  }

  function saveTarget() {
    if (!ui.drawer || ui.drawer.type !== "target") {
      return;
    }

    const form = ui.drawer.form;
    const metric = getMetric(form.metricId);
    const existingTarget = getTarget(form.metricId, form.targetId);
    const value = Number(form.targetValue);
    const resolvedUom = getTargetDrawerResolvedUom() || form.uom;
    const errors = {};

    if (!form.metricId) {
      errors.metricId = "Choose the metric for this target.";
    }
    if (!form.targetName.trim()) {
      errors.targetName = "Enter a target name.";
    }
    if (!form.targetValue) {
      errors.targetValue = "Enter the target value.";
    } else if (Number.isNaN(value)) {
      errors.targetValue = "Target value must be numeric.";
    }
    if (!form.targetEndDate) {
      errors.targetEndDate = "Choose the target end date.";
    }
    if (!resolvedUom) {
      errors.uom = "Choose a unit of measure.";
    }

    ui.drawer.errors = errors;
    if (Object.keys(errors).length) {
      render();
      return;
    }

    if (!state.targetsByMetricId[form.metricId]) {
      state.targetsByMetricId[form.metricId] = [];
    }

    const targetId = form.targetId || "target-" + form.metricId + "-" + Date.now();
    const targetRecord = {
      id: targetId,
      metricId: form.metricId,
      name: form.targetName.trim(),
      value: value,
      endDate: form.targetEndDate,
      uom: resolvedUom,
      lifecycleStatus: existingTarget && existingTarget.lifecycleStatus ? existingTarget.lifecycleStatus : "Active"
    };

    const existingIndex = state.targetsByMetricId[form.metricId].findIndex(function (target) {
      return target.id === targetId;
    });

    if (existingIndex >= 0) {
      state.targetsByMetricId[form.metricId][existingIndex] = targetRecord;
    } else {
      state.targetsByMetricId[form.metricId].push(targetRecord);
    }

    if (!state.datapointsByMetricId[form.metricId]) {
      state.datapointsByMetricId[form.metricId] = [];
    }

    ui.drawer.drafts.forEach(function (draft) {
      state.datapointsByMetricId[form.metricId].push({
        id: draft.id.replace("draft-", "dp-"),
        metricId: form.metricId,
        targetId: targetId,
        name: draft.name || "",
        startDate: draft.startDate || getReportingStartDateInputValue(draft.endDate),
        endDate: draft.endDate,
        value: draft.value,
        uom: resolvedUom,
        status: draft.status
      });
    });

    persistState();
    ui.drawer = {
      type: "target-details",
      metricId: form.metricId,
      targetId: targetId
    };
    showToast(metric ? metric.name + " target saved." : "Target saved.");
    render();
  }

  function openTargetDetailsDrawer(metricId, targetId) {
    const target = getTarget(metricId, targetId);
    if (!target) {
      return;
    }

    ui.drawer = {
      type: "target-details",
      metricId: metricId,
      targetId: targetId
    };
    render();
  }

  function openRequestVerificationModal(metricId, datapointId) {
    ui.modal = {
      type: "request-verification",
      metricId: metricId,
      datapointId: datapointId
    };
    render();
  }

  function submitVerificationRequest() {
    if (!ui.modal || ui.modal.type !== "request-verification") {
      return;
    }

    const datapoint = getDatapoint(ui.modal.metricId, ui.modal.datapointId);
    if (datapoint) {
      datapoint.status = "Submitted";
      if (
        ui.drawer &&
        ui.drawer.type === "milestone-details" &&
        ui.drawer.metricId === ui.modal.metricId &&
        ui.drawer.datapointId === ui.modal.datapointId
      ) {
        ui.drawer.form.status = "Submitted";
      }
    }

    persistState();
    ui.modal = null;
    showToast("Verification request submitted.");
    render();
  }

  function render() {
    const route = getRoute();
    const content = route.page === "summary" ? renderSummaryPage() : renderMetricPage(route.metricId);
    appEl.innerHTML = renderShell(route, content) + renderDrawer() + renderModal() + renderToast();
  }

  function renderShell(route, content) {
    return [
      '<div class="shell">',
      '  <main class="main">',
      '    <div class="topbar">',
      "      <div>",
      '        <h1 class="portfolio-title">' + escapeHtml(state.meta.portfolioName) + "</h1>",
      "      </div>",
      "    </div>",
      '    <div class="category-tabs">' + state.categories.map(function (category) {
        return renderCategoryTab(category, route.activeCategory);
      }).join("") + "</div>",
      '    <section class="page">' + content + '<div class="footer"><button type="button" data-action="reset-demo">Reset demo data</button></div></section>',
      "  </main>",
      "</div>"
    ].join("");
  }

  function renderLeftNav() {
    const links = ["Home", "Projects", "Properties", "Portfolios"];
    return links.map(function (label) {
      return '<button class="nav-link ' + (label === "Portfolios" ? "active" : "") + '" type="button"><span class="nav-icon"></span><span>' + escapeHtml(label) + "</span></button>";
    }).join("");
  }

  function renderCategoryTab(category, activeCategory) {
    if (!category.route || category.id !== "energy") {
      return '<button class="category-tab disabled" type="button">' + escapeHtml(category.label) + "</button>";
    }

    return '<button class="category-tab ' + (category.id === activeCategory ? "active" : "") + '" type="button" data-action="navigate" data-route="' + escapeHtml(category.route) + '">' + escapeHtml(category.label) + "</button>";
  }

  function renderSummaryPage() {
    const targetRows = state.metrics.flatMap(function (metric) {
      return getDisplayTargets(metric.id).map(function (target) {
        return { metric: metric, target: target };
      });
    });

    return [
      '<p class="lead-text">View your performance summary for the category\'s targets.</p>',
      '<div class="summary-header"><div><h2 class="section-title">Target summary</h2><div class="section-description">Metrics can carry multiple targets, while past performance records stay attached to one performance pathway.</div></div><div class="button-row"><button class="button primary" type="button" data-action="open-create-target">Track Target</button></div></div>',
      renderTargetSummaryTable(targetRows),
      '<div class="section-header"><div><h2 class="section-title">Recent past performance</h2><div class="section-description">Past performance can be tracked against an existing target or with no target.</div></div><div class="button-row"><button class="button" type="button" data-action="open-add-milestone">Track past performance</button></div></div>',
      renderRecentMilestonesTable(getAllPastMilestones())
    ].join("");
  }

  function renderTargetSummaryTable(targetRows) {
    if (!targetRows.length) {
      return '<div class="table-shell"><div class="empty-state"><strong>No targets yet</strong>Create one or more targets from summary or from a metric page. Past performance can still be tracked with no target in the meantime.</div></div>';
    }

    return [
      '<div class="table-shell"><div class="table-scroll"><table>',
      "<thead><tr><th>Performance metric</th><th>Name</th><th>End date</th><th>Value</th><th>Past performance</th><th>Interim targets</th><th>Status</th></tr></thead>",
      "<tbody>",
      targetRows.map(function (row) {
        const milestones = getPastDatapoints(row.metric.id, row.target.id);
        const interimTargets = getFutureDatapoints(row.metric.id, row.target.id);
        return [
          "<tr>",
          '<td><button class="button textual" type="button" data-action="open-target-details" data-metric-id="' + escapeHtml(row.metric.id) + '" data-target-id="' + escapeHtml(row.target.id) + '">' + escapeHtml(row.metric.name) + "</button></td>",
          "<td>" + escapeHtml(row.target.name) + "</td>",
          "<td>" + formatDate(row.target.endDate) + "</td>",
          '<td class="mono">' + formatValue(row.target.value) + " " + escapeHtml(row.target.uom) + "</td>",
          "<td>" + milestones.length + "</td>",
          "<td>" + interimTargets.length + "</td>",
          "<td>" + renderChip(getTargetStatus(row.metric.id, row.target.id)) + "</td>",
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody></table></div></div>"
    ].join("");
  }

  function renderRecentMilestonesTable(rows) {
    if (!rows.length) {
      return '<div class="table-shell"><div class="empty-state"><strong>No past performance yet</strong>Start by tracking a past performance year, then request verification from here or from the metric page.<div class="button-row" style="justify-content:center; margin-top:14px;"><button class="button primary" type="button" data-action="open-add-milestone">Track past performance</button></div></div></div>';
    }

    return renderDatapointTable(rows[0].metric, rows.map(function (row) {
      return row.datapoint;
    }), {
      mode: "summary",
      metricByDatapointId: rows.reduce(function (collection, row) {
        collection[row.datapoint.id] = row.metric;
        return collection;
      }, {})
    });
  }

  function renderMetricPage(metricId) {
    const metric = getMetric(metricId);
    if (!metric) {
      return renderSummaryPage();
    }

    return [
      '<div class="metric-layout">',
      '    <div class="metric-pills">' + state.metrics.filter(function (item) {
        return item.category === metric.category;
      }).map(function (item) {
        return '<button class="metric-pill ' + (item.id === metric.id ? "active" : "") + '" type="button" data-action="navigate" data-route="#/metric/' + escapeHtml(item.id) + '">' + escapeHtml(item.shortLabel) + "</button>";
      }).join("") + "</div>",
      '    <section class="flat-section"><div class="section-header"><div><h2 class="section-title">Targets</h2></div><div class="button-row"><button class="button small" type="button" data-action="open-add-milestone" data-metric-id="' + escapeHtml(metric.id) + '">Track and verify performance</button><button class="button small" type="button" data-action="open-create-target" data-metric-id="' + escapeHtml(metric.id) + '">Create new target</button></div></div>' + renderTargetList(metric) + "</section>",
      "</div>"
    ].join("");
  }

  function renderTargetList(metric) {
    const targets = getDisplayTargets(metric.id);
    if (!targets.length) {
      return '<div class="table-shell"><div class="empty-state"><strong>No targets yet</strong>This metric can still collect past performance while you decide whether to add one or several targets.</div></div>';
    }

    return [
      '<div class="table-shell"><div class="table-scroll"><table>',
      "<thead><tr><th>Name</th><th>End date</th><th>Value</th><th>Past performance</th><th>Interim targets</th><th>Status</th></tr></thead>",
      "<tbody>",
      targets.map(function (target) {
        return [
          "<tr>",
          '<td><button class="button textual" type="button" data-action="open-target-details" data-metric-id="' + escapeHtml(metric.id) + '" data-target-id="' + escapeHtml(target.id) + '">' + escapeHtml(target.name) + "</button></td>",
          "<td>" + formatDate(target.endDate) + "</td>",
          '<td class="mono">' + formatValue(target.value) + " " + escapeHtml(target.uom) + "</td>",
          "<td>" + getPastDatapoints(metric.id, target.id).length + "</td>",
          "<td>" + getFutureDatapoints(metric.id, target.id).length + "</td>",
          "<td>" + renderChip(getTargetStatus(metric.id, target.id)) + "</td>",
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody></table></div></div>"
    ].join("");
  }

  function renderDatapointTable(metric, datapoints, options) {
    const mode = options.mode;
    if (!datapoints.length) {
      return '<div class="table-shell"><div class="empty-state"><strong>No past performance recorded</strong>' + (mode === "metric" ? "Track past performance now and attach it to an existing target or leave it with no target." : "Start by tracking a past performance year.") + "</div></div>";
    }

    const showMetricColumn = mode === "summary";
    const showNameColumn = mode === "metric";
    const metricByDatapointId = options.metricByDatapointId || {};

    return [
      '<div class="table-shell"><div class="table-scroll"><table>',
      "<thead><tr>",
      showMetricColumn ? "<th>Metric</th>" : "",
      showNameColumn ? "<th>Name</th>" : "<th>Reporting period</th>",
      "<th>Target</th><th>" + (mode === "metric" ? "End date" : "Reporting period") + "</th><th>Value</th><th>Status</th><th>Actions</th>",
      "</tr></thead>",
      "<tbody>",
      datapoints.map(function (datapoint) {
        const rowMetric = showMetricColumn ? metricByDatapointId[datapoint.id] : metric;
        return [
          "<tr>",
          showMetricColumn
            ? '<td><button class="button textual" type="button" data-action="open-milestone-details" data-metric-id="' + escapeHtml(rowMetric.id) + '" data-datapoint-id="' + escapeHtml(datapoint.id) + '">' + escapeHtml(rowMetric.name) + "</button></td>"
            : "",
          '<td><button class="button textual" type="button" data-action="open-milestone-details" data-metric-id="' + escapeHtml(rowMetric.id) + '" data-datapoint-id="' + escapeHtml(datapoint.id) + '">' + escapeHtml(showNameColumn ? getTargetEntryName(datapoint, "milestone") : getReportingRangeLabel(datapoint.endDate)) + "</button></td>",
          "<td>" + renderAssociationCell(rowMetric.id, datapoint) + "</td>",
          "<td>" + (mode === "metric" ? formatDate(datapoint.endDate) : getReportingRangeLabel(datapoint.endDate)) + "</td>",
          '<td class="mono">' + formatValue(datapoint.value) + " " + escapeHtml(datapoint.uom) + "</td>",
          "<td>" + renderChip(datapoint.status) + "</td>",
          '<td><div class="button-row"><span class="button textual inactive-link">Request verification</span></div></td>',
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody></table></div></div>"
    ].join("");
  }

  function renderAssociationCell(metricId, datapoint) {
    if (datapoint.targetId) {
      return escapeHtml(getAssociatedTargetLabel(metricId, datapoint.targetId));
    }
    return '<span class="muted-value">' + escapeHtml(getDraftTargetName(datapoint.endDate)) + "</span>";
  }

  function renderDrawer() {
    if (!ui.drawer) {
      return "";
    }

    if (ui.drawer.type === "datapoint") {
      return renderDatapointDrawer();
    }
    if (ui.drawer.type === "past-performance") {
      return renderPastPerformanceDrawer();
    }
    if (ui.drawer.type === "milestone-details") {
      return renderMilestoneDetailsDrawer();
    }
    if (ui.drawer.type === "target") {
      return renderTargetDrawer();
    }
    if (ui.drawer.type === "target-details") {
      return renderTargetDetailsDrawer();
    }
    return "";
  }

  function renderDatapointDrawer() {
    const form = ui.drawer.form;
    const mode = ui.drawer.mode;
    const metric = getMetric(form.metricId);
    const target = getTarget(form.metricId, form.targetId);
    const availableTargets = form.metricId ? getTargets(form.metricId) : [];
    const scopeDatapoints = form.metricId && form.targetId ? getDatapointsForTarget(form.metricId, form.targetId) : [];
    const title = mode === "interim-target" ? "Add Interim Target" : "Track past performance";
    const subtitle = mode === "interim-target"
      ? "Add a future reporting period on one target pathway."
      : "Track a past reporting period here. You can attach it to an existing target or choose no target.";

    return [
      '<div class="drawer-backdrop" data-action="close-drawer"></div>',
      '<aside class="drawer" aria-label="' + escapeHtml(title) + ' drawer">',
      '  <div class="drawer-header"><div><h2 class="drawer-title">' + escapeHtml(title) + '</h2><div class="drawer-subtitle">' + escapeHtml(subtitle) + '</div></div><button class="drawer-close" type="button" data-action="close-drawer">×</button></div>',
      '  <div class="drawer-body">',
      '    <section class="form-section"><div class="form-grid">',
      renderMetricField(metric),
      renderTargetField(mode, availableTargets, target),
      '<div class="form-grid two-up">',
      renderReportingYearField(mode, form.reportingYear),
      renderValueField("value", form.value, ui.drawer.errors.value),
      "</div>",
      '<div class="form-grid two-up">',
      renderDatapointUomField(metric, target, form.uom, ui.drawer.errors.uom),
      renderStatusField(mode, form.status, ui.drawer.errors.status),
      "</div>",
      mode === "milestone" && form.reportingYear && isFutureEndDate(buildEndDateFromYear(form.reportingYear))
        ? '<div class="notice warning">Future-dated entries are interim targets and require a target.</div>'
        : "",
      mode === "interim-target" && form.reportingYear && !isFutureEndDate(buildEndDateFromYear(form.reportingYear))
        ? '<div class="notice warning">Interim targets must use a future reporting year.</div>'
        : "",
      mode === "milestone" && !form.targetId && form.metricId
        ? '<div class="notice info">This past performance entry will be tracked with no target.</div>'
        : "",
      scopeDatapoints.length
        ? '<div class="notice info">Existing recorded years in this scope: ' + scopeDatapoints.map(function (datapoint) {
            return getYear(datapoint.endDate);
          }).sort().join(", ") + "</div>"
        : "",
      "    </div></section>",
      '    <div class="drawer-actions"><button class="button ghost" type="button" data-action="close-drawer">Cancel</button>',
      mode === "milestone" ? '<button class="button" type="button" data-action="save-datapoint-ready">Save &amp; mark Ready for Review</button>' : "",
      '<button class="button primary" type="button" data-action="save-datapoint">' + (mode === "interim-target" ? "Save interim target" : "Save past performance") + "</button></div>",
      "  </div>",
      "</aside>"
    ].join("");
  }

  function renderPastPerformanceDrawer() {
    const form = ui.drawer.form;
    const metric = getMetric(form.metricId);
    const target = getTarget(form.metricId, form.targetId);
    const targets = metric ? getTargets(metric.id) : [];
    const needsMetric = !form.metricId;
    const needsAssociation = metric && !ui.drawer.associationChosen;
    const scopeDatapoints = metric && form.targetId ? getDatapointsForTarget(metric.id, form.targetId) : [];
    const subtitle = !metric
      ? "Choose the performance metric you want to record."
      : !ui.drawer.associationChosen
        ? "Performance metric: " + metric.name
        : "Performance metric: " + metric.name + " | Target: " + (target ? target.name : "No target");

    return [
      '<div class="drawer-backdrop" data-action="close-drawer"></div>',
      '<aside class="drawer" aria-label="Track performance drawer">',
      '  <div class="drawer-header"><div><h2 class="drawer-title">Track Performance</h2><div class="drawer-subtitle">' + escapeHtml(subtitle) + '</div></div><button class="drawer-close" type="button" data-action="close-drawer">×</button></div>',
      '  <div class="drawer-body">',
      needsMetric ? renderPastPerformanceMetricSelection() : "",
      needsAssociation ? renderPastPerformanceAssociationSelection(metric, targets) : "",
      metric && ui.drawer.associationChosen ? renderPastPerformanceEntrySection(metric, target, !ui.drawer.metricLocked, scopeDatapoints) : "",
      !metric || !ui.drawer.associationChosen ? '    <div class="drawer-actions"><button class="button ghost" type="button" data-action="close-drawer">Cancel</button></div>' : "",
      "  </div>",
      "</aside>"
    ].join("");
  }

  function renderPastPerformanceMetricSelection() {
    return [
      '<section class="plain-drawer-section">',
      '  <div class="panel-header"><div><div class="panel-title">Performance metric</div><div class="panel-subtitle">Choose the metric you want to record performance for.</div></div></div>',
      '  <div class="form-grid">',
      '    <div class="field"><label for="past-performance-metric">Metric</label><select id="past-performance-metric" data-drawer-field="metricId"><option value="">Select metric</option>' + state.metrics.map(function (item) {
        return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === ui.drawer.form.metricId ? "selected" : "") + ">" + escapeHtml(item.name) + "</option>";
      }).join("") + '</select>' + (ui.drawer.errors.metricId ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.metricId) + "</div>" : "") + "</div>",
      "  </div>",
      "</section>"
    ].join("");
  }

  function renderPastPerformanceAssociationSelection(metric, targets) {
    return [
      '<section class="plain-drawer-section">',
      '  <div class="panel-header"><div><div class="panel-title">Target association</div><div class="panel-subtitle">Choose whether this performance entry should be tracked against a target or not.</div></div></div>',
      ui.drawer.errors.targetId ? '<div class="field-error" style="margin-bottom:12px;">' + escapeHtml(ui.drawer.errors.targetId) + "</div>" : "",
      '  <div class="choice-group"><div class="choice-list">',
      '    <button class="choice-card" type="button" data-action="choose-past-performance-association" data-target-id=""><strong>No target</strong><span>Use this when you want to track a piece of performance primarily for verification. It can always be turned into a full target later if you decide this performance should be associated with one.</span></button>',
      '  </div></div>',
      targets.length ? '<div class="choice-group"><div class="choice-group-label">Existing Targets</div><div class="choice-list">' + targets.map(function (target) {
        return '<button class="choice-card" type="button" data-action="choose-past-performance-association" data-target-id="' + escapeHtml(target.id) + '"><strong>' + escapeHtml(target.name) + "</strong></button>";
      }).join("") + "</div></div>" : "",
      "</section>"
    ].join("");
  }

  function renderPastPerformanceEntrySection(metric, target, showAssociationChange, scopeDatapoints) {
    const form = ui.drawer.form;
    const resolvedStartDate = form.endDate ? getReportingStartDateInputValue(form.endDate) : "";

    return [
      '<section class="plain-drawer-section entry-flow-section">',
      '  <div class="panel-header"><div><div class="panel-title">Performance</div><div class="panel-subtitle">' + escapeHtml(target ? "Add a reporting period on this target pathway." : "track past performance for record-keeping or verification.") + "</div></div></div>",
      '  <div class="form-grid">',
      '<div class="field"><label for="past-performance-name">Performance name*</label><input id="past-performance-name" type="text" placeholder="Name" data-drawer-field="name" value="' + escapeHtml(form.name) + '" />' + (ui.drawer.errors.name ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.name) + "</div>" : "") + "</div>",
      [
        '<div class="form-grid four-up">',
        !target
          ? '<div class="field"><label for="past-performance-uom">Unit of measure*</label><select id="past-performance-uom" data-drawer-field="uom">' + metric.uomOptions.map(function (option) {
              return '<option value="' + escapeHtml(option) + '" ' + (option === form.uom ? "selected" : "") + ">" + escapeHtml(option) + "</option>";
            }).join("") + '</select>' + (ui.drawer.errors.uom ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.uom) + "</div>" : "") + "</div>"
          : '<div class="field"><label>Unit of measure</label><div class="readonly">' + escapeHtml(target.uom) + "</div></div>",
        '<div class="field"><label for="past-performance-value">Performance value*</label><input id="past-performance-value" type="number" step="any" placeholder="00" data-drawer-field="value" value="' + escapeHtml(form.value) + '" />' + (ui.drawer.errors.value ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.value) + "</div>" : "") + "</div>",
        '<div class="field"><label>Performance start date</label><div class="readonly subtle">' + (resolvedStartDate ? formatDate(resolvedStartDate) : "MM/DD/YYYY") + "</div></div>",
        '<div class="field"><label for="past-performance-end-date">Performance end date*</label><input id="past-performance-end-date" type="date" data-drawer-field="endDate" value="' + escapeHtml(form.endDate) + '" />' + (ui.drawer.errors.endDate ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.endDate) + "</div>" : "") + "</div>",
        "</div>"
      ].join(""),
      "</div>",
      '<div class="entry-divider"></div>',
      '<div class="entry-subsection"><div class="entry-subsection-title">Financial details (optional)</div><button class="entry-link" type="button">Add financial details</button></div>',
      '<div class="drawer-actions"><button class="button ghost" type="button" data-action="close-drawer">Cancel</button><button class="button" type="button" data-action="save-past-performance-exit">Save and exit</button><button class="button primary" type="button" data-action="save-past-performance-verify">Save and verify</button></div>',
      "</section>"
    ].join("");
  }

  function renderMetricField(metric) {
    const form = ui.drawer.form;
    return [
      '<div class="field"><label for="datapoint-metric">Metric</label>',
      form.metricId && ui.drawer.metricLocked
        ? '<div class="readonly">' + escapeHtml(metric ? metric.name : "") + "</div>"
        : '<select id="datapoint-metric" data-drawer-field="metricId"><option value="">Select metric</option>' + state.metrics.map(function (item) {
            return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === form.metricId ? "selected" : "") + ">" + escapeHtml(item.name) + "</option>";
          }).join("") + "</select>",
      ui.drawer.errors.metricId ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.metricId) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderTargetField(mode, availableTargets, target) {
    const form = ui.drawer.form;
    const isInterimTarget = mode === "interim-target";
    const options = isInterimTarget
      ? availableTargets
      : [{ id: "", name: "No target", uom: "" }].concat(availableTargets);

    return [
      '<div class="field"><label for="datapoint-target">Target</label>',
      form.metricId && ui.drawer.targetLocked
        ? '<div class="readonly">' + escapeHtml(target ? target.name : "No target") + "</div>"
        : '<select id="datapoint-target" data-drawer-field="targetId" ' + (!form.metricId ? "disabled" : "") + ">" + options.map(function (item) {
            const label = item.id ? item.name + " (" + item.uom + ")" : item.name;
            return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === form.targetId ? "selected" : "") + ">" + escapeHtml(label) + "</option>";
          }).join("") + "</select>",
      '<div class="field-hint">' + escapeHtml(isInterimTarget ? "Interim targets must belong to one target pathway." : "Leave blank to track this past performance entry with no target.") + "</div>",
      ui.drawer.errors.targetId ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.targetId) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderReportingYearField(mode, selectedYear) {
    return [
      '<div class="field"><label for="datapoint-year">Reporting year</label>',
      '<select id="datapoint-year" data-drawer-field="reportingYear"><option value="">Select year</option>' + renderYearOptions(selectedYear, mode) + "</select>",
      '<div class="field-hint">' + escapeHtml(mode === "interim-target" ? "Interim targets are future 12-month periods; start date is implied." : "Past performance entries are 12-month periods; start date is implied.") + "</div>",
      ui.drawer.errors.reportingYear ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.reportingYear) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderValueField(fieldName, value, error) {
    return [
      '<div class="field"><label for="' + escapeHtml(fieldName) + '-input">Value</label>',
      '<input id="' + escapeHtml(fieldName) + '-input" type="number" step="any" data-drawer-field="' + escapeHtml(fieldName) + '" value="' + escapeHtml(value) + '" />',
      error ? '<div class="field-error">' + escapeHtml(error) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderDatapointUomField(metric, target, uom, error) {
    return [
      '<div class="field"><label for="datapoint-uom">Unit of measure</label>',
      target
        ? '<div class="readonly">' + escapeHtml(target.uom) + "</div>"
        : '<select id="datapoint-uom" data-drawer-field="uom">' + (metric ? metric.uomOptions.map(function (option) {
            return '<option value="' + escapeHtml(option) + '" ' + (option === uom ? "selected" : "") + ">" + escapeHtml(option) + "</option>";
          }).join("") : "") + "</select>",
      '<div class="field-hint">' + escapeHtml(target ? "Unit is locked to the selected target." : "Choose any valid unit for this metric.") + "</div>",
      error ? '<div class="field-error">' + escapeHtml(error) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderStatusField(mode, status, error) {
    if (mode === "interim-target") {
      return '<div class="field"><label>Status</label><div class="readonly">Draft</div><div class="field-hint">Interim targets remain Draft while they are future-dated.</div></div>';
    }

    return [
      '<div class="field"><label for="datapoint-status">Status</label>',
      '<select id="datapoint-status" data-drawer-field="status">' + STATUSES.map(function (item) {
        return '<option value="' + escapeHtml(item) + '" ' + (item === status ? "selected" : "") + ">" + escapeHtml(item) + "</option>";
      }).join("") + "</select>",
      error ? '<div class="field-error">' + escapeHtml(error) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderMilestoneDetailsDrawer() {
    const metric = getMetric(ui.drawer.metricId);
    const datapoint = getDatapoint(ui.drawer.metricId, ui.drawer.datapointId);
    if (!metric || !datapoint) {
      return "";
    }

    const target = datapoint.targetId ? getTarget(ui.drawer.metricId, datapoint.targetId) : null;
    const form = ui.drawer.form;
    const reportingEndDate = form.endDate || datapoint.endDate;

    return [
      '<div class="drawer-backdrop" data-action="close-drawer"></div>',
      '<aside class="drawer" aria-label="Past performance details drawer">',
      '  <div class="drawer-header"><div><h2 class="drawer-title">Past performance details</h2><div class="drawer-subtitle">Category: ' + escapeHtml(metric.categoryLabel) + " | Performance metric: " + escapeHtml(metric.name) + '</div></div><button class="drawer-close" type="button" data-action="close-drawer">×</button></div>',
      '  <div class="drawer-body">',
      '    <section class="form-section">',
      '      <div class="panel-header"><div class="panel-title">' + escapeHtml(form.name || datapoint.name || getReportingRangeLabel(reportingEndDate)) + '</div><div class="button-row">' + renderChip(form.status) + (ui.drawer.editMode ? '<button class="button small ghost" type="button" data-action="cancel-edit-milestone">Cancel editing</button>' : '<button class="button small" type="button" data-action="toggle-edit-milestone">Edit past performance</button>') + "</div></div>",
      '      <div class="detail-grid">',
      '        <div class="detail-item"><small>Metric</small><strong>' + escapeHtml(metric.name) + "</strong></div>",
      '        <div class="detail-item"><small>Reporting period end</small><strong>' + formatDate(reportingEndDate) + "</strong></div>",
      '        <div class="detail-item"><small>Reporting period range</small><strong>' + escapeHtml(getReportingRangeLabel(reportingEndDate)) + "</strong></div>",
      '        <div class="detail-item"><small>Associated target</small><strong>' + escapeHtml(target ? target.name : getDraftTargetName(datapoint.endDate)) + "</strong></div>",
      "      </div>",
      ui.drawer.editMode
        ? [
            '<div class="form-grid two-up" style="margin-top:16px;">',
            '<div class="field"><label for="milestone-details-name">Past performance name</label><input id="milestone-details-name" type="text" data-drawer-field="name" value="' + escapeHtml(form.name) + '" />' + (ui.drawer.errors.name ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.name) + "</div>" : "") + "</div>",
            '<div class="field"><label for="milestone-details-value">Value</label><input id="milestone-details-value" type="number" step="any" data-drawer-field="value" value="' + escapeHtml(form.value) + '" />' + (ui.drawer.errors.value ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.value) + "</div>" : "") + "</div>",
            "</div>",
            '<div class="form-grid two-up" style="margin-top:14px;"><div class="field"><label for="milestone-details-end-date">Past performance end date</label><input id="milestone-details-end-date" type="date" data-drawer-field="endDate" value="' + escapeHtml(form.endDate) + '" />' + (ui.drawer.errors.endDate ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.endDate) + '</div>' : "") + '</div><div class="field"><label>Unit of measure</label><div class="readonly">' + escapeHtml(form.uom) + "</div></div></div><div class=\"form-grid two-up\" style=\"margin-top:14px;\"><div class=\"field\"><label>Past performance start date</label><div class=\"readonly\">" + escapeHtml(form.endDate ? formatDate(getReportingStartDateInputValue(form.endDate)) : "MM/DD/YYYY") + "</div></div><div class=\"field\"><label>Reporting period</label><div class=\"readonly\">" + escapeHtml(getReportingRangeLabel(reportingEndDate)) + "</div></div></div>"
          ].join("")
        : '<div class="detail-grid" style="margin-top:16px;"><div class="detail-item"><small>Value</small><strong class="mono">' + formatValue(form.value) + " " + escapeHtml(form.uom) + '</strong></div><div class="detail-item"><small>Recorded status</small><strong>' + escapeHtml(form.status) + "</strong></div></div>",
      '<div class="helper" style="margin-top:14px;">' + escapeHtml(target ? "This past performance entry belongs to a performance pathway." : "This past performance entry is being tracked with no target.") + "</div>",
      "    </section>",
      '    <section class="form-section"><div class="panel-header"><div><div class="panel-title">Past performance status</div><div class="panel-subtitle">Status can be updated here without editing the past performance details.</div></div></div><div class="form-grid two-up"><div class="field"><label for="milestone-details-status">Status</label><select id="milestone-details-status" data-drawer-field="status">' + STATUSES.map(function (status) {
        return '<option value="' + escapeHtml(status) + '" ' + (status === form.status ? "selected" : "") + ">" + escapeHtml(status) + "</option>";
      }).join("") + '</select></div><div class="field"><label>Verification</label><div class="readonly">Request verification remains in the existing workflow and is shown here only for reference.</div></div></div></section>',
      '    <div class="drawer-actions"><button class="button ghost" type="button" data-action="close-drawer">Close</button><button class="button" type="button" data-action="save-milestone-status">Save status</button>' + (ui.drawer.editMode ? '<button class="button" type="button" data-action="save-milestone-details">Save changes</button>' : "") + '<button class="button primary inactive-link" type="button">Request verification</button></div>',
      "  </div>",
      "</aside>"
    ].join("");
  }

  function renderTargetDrawer() {
    const form = ui.drawer.form;
    const metric = getMetric(form.metricId);
    const target = getTarget(form.metricId, form.targetId);
    const lockedUom = getTargetDrawerLockedUom();
    const activeSection = typeof ui.drawer.activeSection === "string"
      ? normalizeTargetDrawerSection(ui.drawer.activeSection)
      : "target";
    const drawerTitle = target ? target.name : "Create new target";
    const drawerSubtitle = metric
      ? "Category: " + metric.categoryLabel + " | Performance metric: " + metric.name
      : "Choose the performance metric for this target.";

    return [
      '<div class="drawer-backdrop" data-action="close-drawer"></div>',
      '<aside class="drawer" aria-label="Track Target drawer">',
      '  <div class="drawer-header"><div><div class="drawer-kicker">Target</div><h2 class="drawer-title">' + escapeHtml(drawerTitle) + '</h2><div class="drawer-subtitle">' + escapeHtml(drawerSubtitle) + '</div></div><button class="drawer-close" type="button" data-action="close-drawer">×</button></div>',
      '  <div class="drawer-body">',
      renderTargetAccordionSection("target", "Target", activeSection === "target", renderTargetEditorBody(metric, target, lockedUom)),
      renderTargetAccordionSection("interim-target", "Interim targets", activeSection === "interim-target", renderTargetDraftSection("interim-target")),
      "  </div>",
      "</aside>"
    ].join("");
  }

  function renderTargetAccordionSection(sectionId, label, open, content) {
    return [
      '<section class="accordion-section ' + (open ? "open" : "") + '">',
      '  <button class="accordion-toggle" type="button" data-action="set-target-editor-section" data-section="' + escapeHtml(sectionId) + '" aria-expanded="' + (open ? "true" : "false") + '"><span>' + escapeHtml(label) + '</span><span class="accordion-chevron">' + (open ? "⌃" : "⌄") + "</span></button>",
      open ? '<div class="accordion-content">' + content + "</div>" : "",
      "</section>"
    ].join("");
  }

  function renderTargetEditorBody(metric, target, lockedUom) {
    const form = ui.drawer.form;

    return [
      '<div class="form-grid">',
      '<div class="field"><label for="target-metric">Metric</label>' + (
        form.metricId && ui.drawer.metricLocked
          ? '<div class="readonly">' + escapeHtml(metric ? metric.name : "") + "</div>"
          : '<select id="target-metric" data-drawer-field="metricId"><option value="">Select metric</option>' + state.metrics.map(function (item) {
              return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === form.metricId ? "selected" : "") + ">" + escapeHtml(item.name) + "</option>";
            }).join("") + "</select>"
      ) + (ui.drawer.errors.metricId ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.metricId) + "</div>" : "") + "</div>",
      '<div class="form-grid two-up"><div class="field"><label for="target-name">Target name</label><input id="target-name" type="text" data-drawer-field="targetName" value="' + escapeHtml(form.targetName) + '" ' + (!form.metricId ? "disabled" : "") + " />" + (ui.drawer.errors.targetName ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.targetName) + "</div>" : "") + '</div><div class="field"><label for="target-value">Target value</label><input id="target-value" type="number" step="any" data-drawer-field="targetValue" value="' + escapeHtml(form.targetValue) + '" ' + (!form.metricId ? "disabled" : "") + " />" + (ui.drawer.errors.targetValue ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.targetValue) + "</div>" : "") + "</div></div>",
      '<div class="form-grid two-up"><div class="field"><label for="target-end-date">Target end date</label><input id="target-end-date" type="date" data-drawer-field="targetEndDate" value="' + escapeHtml(form.targetEndDate) + '" ' + (!form.metricId ? "disabled" : "") + " />" + (ui.drawer.errors.targetEndDate ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.targetEndDate) + "</div>" : "") + '</div><div class="field"><label for="target-uom">Unit of measure</label>' + (
        lockedUom
          ? '<div class="readonly">' + escapeHtml(lockedUom) + "</div>"
          : '<select id="target-uom" data-drawer-field="uom" ' + (!form.metricId ? "disabled" : "") + ">" + (metric ? metric.uomOptions.map(function (option) {
              return '<option value="' + escapeHtml(option) + '" ' + (option === form.uom ? "selected" : "") + ">" + escapeHtml(option) + "</option>";
            }).join("") : "") + "</select>"
      ) + '<div class="field-hint">' + escapeHtml(lockedUom ? "Unit is locked because this target already has linked datapoints." : "Different targets on the same metric can use different valid units.") + "</div>" + (ui.drawer.errors.uom ? '<div class="field-error">' + escapeHtml(ui.drawer.errors.uom) + "</div>" : "") + "</div></div>",
      target ? '<div class="notice info">You are editing one target on this metric. Other performance pathways remain separate.</div>' : "",
      '<div class="drawer-actions"><button class="button ghost" type="button" data-action="close-drawer">Cancel</button><button class="button primary" type="button" data-action="save-target">' + (target ? "Save target" : "Create target") + "</button></div>",
      "</div>"
    ].join("");
  }

  function renderTargetDraftSection(mode) {
    const form = ui.drawer.form;
    const existingRows = form.targetId ? getSortedDatapoints(form.metricId, form.targetId) : [];
    const draftRows = ui.drawer.drafts.slice();
    const rows = existingRows.concat(draftRows);

    return [
      '<div class="split-section">',
      '<div class="field-hint">This section shows all target pathway records, whether the reporting period end date is in the past or the future.</div>',
      '  <button class="editor-add-link" type="button" data-action="start-target-draft" data-mode="' + escapeHtml(mode) + '" ' + (!form.metricId ? "disabled" : "") + '>Add interim target</button>',
      rows.length
        ? '<div class="record-stack">' + rows.map(function (row) {
            return renderTargetDraftCard(row, mode);
          }).join("") + "</div>"
        : '<div class="empty-state"><strong>No interim targets yet</strong>Add a reporting period to this target pathway. End dates can be in the past or the future.</div>',
      ui.drawer.draftEditor && normalizeTargetDrawerSection(ui.drawer.draftEditor.mode) === mode ? renderTargetDraftEditor(mode) : "",
      "</div>"
    ].join("");
  }

  function renderTargetDraftCard(row, mode) {
    const isDraft = Boolean(row.mode);
    const startDate = row.startDate || getReportingStartDateInputValue(row.endDate);

    return [
      '<div class="record-card">',
      '  <div class="record-card-header"><strong>' + escapeHtml(getTargetEntryName(row, mode)) + '</strong>' + (isDraft ? '<button class="button textual" type="button" data-action="remove-target-draft" data-draft-id="' + escapeHtml(row.id) + '">Remove</button>' : "") + "</div>",
      '  <div class="record-card-grid">',
      '    <div class="detail-item"><small>Value</small><strong class="mono">' + formatValue(row.value) + " " + escapeHtml(row.uom) + "</strong></div>",
      '    <div class="detail-item"><small>Start date</small><strong>' + formatDate(startDate) + "</strong></div>",
      '    <div class="detail-item"><small>End date</small><strong>' + formatDate(row.endDate) + "</strong></div>",
      '    <div class="detail-item"><small>Status</small><strong>' + escapeHtml(row.status || "Draft") + "</strong></div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderTargetDraftEditor(mode) {
    const editor = ui.drawer.draftEditor;
    const isInterimTarget = mode === "interim-target";
    const startDate = editor.endDate ? getReportingStartDateInputValue(editor.endDate) : "";

    return [
      '<div class="entry-editor-card">',
      '  <div class="form-grid">',
      '    <div class="field"><label for="target-draft-name">' + (isInterimTarget ? "Interim target name*" : "Past performance name*") + '</label><input id="target-draft-name" type="text" placeholder="Name" data-target-draft-field="name" value="' + escapeHtml(editor.name) + '" />' + (ui.drawer.draftErrors.name ? '<div class="field-error">' + escapeHtml(ui.drawer.draftErrors.name) + "</div>" : "") + "</div>",
      '    <div class="form-grid three-up">',
      '      <div class="field"><label for="target-draft-value">' + (isInterimTarget ? "Interim target value*" : "Past performance value*") + '</label><input id="target-draft-value" type="number" step="any" placeholder="00" data-target-draft-field="value" value="' + escapeHtml(editor.value) + '" />' + (ui.drawer.draftErrors.value ? '<div class="field-error">' + escapeHtml(ui.drawer.draftErrors.value) + "</div>" : "") + "</div>",
      '      <div class="field"><label>' + (isInterimTarget ? "Interim target start date" : "Past performance start date") + '</label><div class="readonly subtle">' + (startDate ? formatDate(startDate) : "MM/DD/YYYY") + "</div></div>",
      '      <div class="field"><label for="target-draft-end-date">' + (isInterimTarget ? "Interim target end date*" : "Past performance end date*") + '</label><input id="target-draft-end-date" type="date" data-target-draft-field="endDate" value="' + escapeHtml(editor.endDate) + '" />' + (ui.drawer.draftErrors.endDate ? '<div class="field-error">' + escapeHtml(ui.drawer.draftErrors.endDate) + "</div>" : "") + "</div>",
      "    </div>",
      ui.drawer.draftErrors.metricId ? '<div class="field-error">' + escapeHtml(ui.drawer.draftErrors.metricId) + "</div>" : "",
      ui.drawer.draftErrors.uom ? '<div class="field-error">' + escapeHtml(ui.drawer.draftErrors.uom) + "</div>" : "",
      '    <div class="entry-divider"></div>',
      '    <div class="entry-subsection"><div class="entry-subsection-title">Financial details (optional)</div><button class="entry-link" type="button">Add financial details</button></div>',
      '    <div class="entry-actions"><button class="button ghost" type="button" data-action="cancel-target-draft">Cancel</button><button class="button primary" type="button" data-action="save-target-draft">' + (isInterimTarget ? "Save interim target" : "Save past performance") + "</button></div>",
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderTargetDetailsDrawer() {
    const metric = getMetric(ui.drawer.metricId);
    const target = getTarget(ui.drawer.metricId, ui.drawer.targetId);
    if (!metric || !target) {
      return "";
    }

    return [
      '<div class="drawer-backdrop" data-action="close-drawer"></div>',
      '<aside class="drawer" aria-label="Target details drawer">',
      '  <div class="drawer-header"><div><h2 class="drawer-title">' + escapeHtml(target.name) + '</h2><div class="drawer-subtitle">Category: ' + escapeHtml(metric.categoryLabel) + " | Performance metric: " + escapeHtml(metric.name) + '</div></div><div class="drawer-header-actions"><button class="button" type="button" data-action="open-create-target" data-metric-id="' + escapeHtml(metric.id) + '" data-target-id="' + escapeHtml(target.id) + '" data-section="target">Edit target</button><button class="drawer-close" type="button" data-action="close-drawer">×</button></div></div>',
      '  <div class="drawer-body">',
      '    <section class="form-section"><div class="panel-header"><div class="panel-title">Target information</div>' + renderChip(getTargetStatus(metric.id, target.id)) + '</div><div class="detail-grid"><div class="detail-item"><small>Target name</small><strong>' + escapeHtml(target.name) + '</strong></div><div class="detail-item"><small>Target end date</small><strong>' + formatDate(target.endDate) + '</strong></div><div class="detail-item"><small>Target value</small><strong class="mono">' + formatValue(target.value) + " " + escapeHtml(target.uom) + '</strong></div><div class="detail-item"><small>Unit of measure</small><strong>' + escapeHtml(target.uom) + "</strong></div></div></section>",
      renderTargetDetailsSection(metric, target, "interim-target"),
      "  </div>",
      "</aside>"
    ].join("");
  }

  function renderTargetDetailsSection(metric, target, mode) {
    const datapoints = getSortedDatapoints(metric.id, target.id);

    return [
      '<section class="drawer-section">',
      '  <div class="panel-header"><div><div class="panel-title">Interim targets</div><div class="panel-subtitle">Interim targets are reporting periods on this target pathway, whether their end dates are in the past or the future.</div></div>' + (
        '<button class="button small" type="button" data-action="edit-target-section" data-metric-id="' + escapeHtml(metric.id) + '" data-target-id="' + escapeHtml(target.id) + '" data-section="interim-target">Edit interim targets</button>'
      ) + "</div>",
      datapoints.length
        ? '<div class="table-shell"><div class="table-scroll"><table><thead><tr><th>Interim target name</th><th>End date</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>' + datapoints.map(function (datapoint) {
            return "<tr><td><button class=\"button textual\" type=\"button\" data-action=\"open-milestone-details\" data-metric-id=\"" + escapeHtml(metric.id) + '" data-datapoint-id="' + escapeHtml(datapoint.id) + '">' + escapeHtml(getTargetEntryName(datapoint, "interim-target")) + "</button></td><td>" + formatDate(datapoint.endDate) + '</td><td class="mono">' + formatValue(datapoint.value) + " " + escapeHtml(datapoint.uom) + "</td><td>" + renderChip(datapoint.status) + '</td><td><button class="button textual" type="button" data-action="request-verification" data-metric-id="' + escapeHtml(metric.id) + '" data-datapoint-id="' + escapeHtml(datapoint.id) + '">Verify performance</button></td></tr>';
          }).join("") + "</tbody></table></div></div>"
        : '<div class="empty-state"><strong>No interim targets yet</strong>Use Edit target records to manage the reporting periods on this target pathway.</div>',
      "</section>"
    ].join("");
  }

  function renderDocumentationSummaryItem(label, value) {
    return '<div class="documentation-summary-item"><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(value) + "</strong></div>";
  }

  function renderDocumentationEvidenceBlock(title) {
    return [
      '<div class="documentation-evidence-block">',
      '  <div class="documentation-evidence-title">' + escapeHtml(title) + "</div>",
      '  <div class="documentation-evidence-grid">',
      '    <div class="field"><label>Select type of evidence</label><div class="readonly">Enter a hyperlink</div></div>',
      '    <div class="field"><label>Hyperlink</label><div class="readonly">https://hub.stg.hub.usgbc.net/portfolios/perform/workspace</div></div>',
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderDocumentationModal() {
    const metric = getMetric(ui.modal.metricId);
    const datapoint = getDatapoint(ui.modal.metricId, ui.modal.datapointId);
    const target = getTarget(ui.modal.metricId, ui.modal.targetId);
    if (!metric || !datapoint) {
      return "";
    }

    const title = datapoint.name || getTargetEntryName(datapoint, "milestone");
    const performanceRange = getReportingRangeLabel(datapoint.endDate);

    return [
      '<div class="documentation-backdrop">',
      '  <div class="documentation-modal" role="dialog" aria-modal="true" aria-labelledby="documentation-title">',
      '    <div class="documentation-modal-header"><div><h2 id="documentation-title">Documentation for ' + escapeHtml(title) + '</h2><div class="documentation-modal-meta">Category: ' + escapeHtml(metric.categoryLabel) + "  |  Portfolio: " + escapeHtml(state.meta.portfolioName) + "  |  Performance metric: " + escapeHtml(metric.name) + '</div></div><button class="documentation-close" type="button" data-action="close-modal">×</button></div>',
      '    <div class="documentation-summary-grid">' +
        renderDocumentationSummaryItem("Main target name", target ? target.name : "No target") +
        renderDocumentationSummaryItem("Performance approach", "A: absolute performance") +
        renderDocumentationSummaryItem("Target value", target ? formatValue(target.value) + " " + target.uom : "-") +
        renderDocumentationSummaryItem("Target due date", target ? formatDate(target.endDate) : "-") +
        renderDocumentationSummaryItem("Performance date", performanceRange) +
        renderDocumentationSummaryItem("Baseline value", "-") +
        renderDocumentationSummaryItem("Baseline date", "-") +
        renderDocumentationSummaryItem("Performance change", "-") +
      "</div>",
      '    <section class="documentation-section"><div class="documentation-section-title">Supporting documentation</div><div class="documentation-supporting-row"><div><small>Supporting documentation</small><strong>' + escapeHtml(title) + '</strong></div><div><small>Interim target value</small><strong>' + formatValue(datapoint.value) + " " + escapeHtml(datapoint.uom) + '</strong></div><div><small>Interim target date</small><strong>' + formatDate(datapoint.endDate) + '</strong></div><div><small>Interim target status</small><strong class="documentation-inline-status">In progress</strong></div></div></section>',
      '    <section class="documentation-section"><div class="documentation-accordion-row open"><span>Portfolio level documentation</span><span class="documentation-pill">Documentation uploaded</span></div><div class="documentation-accordion-body">' +
        renderDocumentationEvidenceBlock("Policies") +
        renderDocumentationEvidenceBlock("Methodology") +
        renderDocumentationEvidenceBlock("Letter of attestation (if applicable)") +
        renderDocumentationEvidenceBlock("Portfolio performance data") +
      "</div></section>",
      '    <section class="documentation-section documentation-compact-list"><div class="documentation-accordion-row"><span>Property level documentation</span><span class="documentation-pill">Documentation uploaded</span></div><div class="documentation-accordion-row"><span>Special circumstances or alternative documentation</span><span class="documentation-pill">Documentation uploaded</span></div><div class="documentation-accordion-row"><span>Pre-verification check</span><span class="documentation-pill success">Completed</span></div></section>',
      '    <div class="documentation-note">If you have a question for GBCI about the verification process, contact us. Verification can be requested after providing required documentation.</div>',
      '    <div class="documentation-actions"><button class="button ghost" type="button">Save draft</button><button class="button primary" type="button">Request verification</button></div>',
      "  </div>",
      "</div>"
    ].join("");
  }

  function renderModal() {
    if (!ui.modal) {
      return "";
    }

    if (ui.modal.type === "documentation") {
      return renderDocumentationModal();
    }

    if (ui.modal.type !== "request-verification") {
      return "";
    }

    const metric = getMetric(ui.modal.metricId);
    const datapoint = getDatapoint(ui.modal.metricId, ui.modal.datapointId);
    if (!metric || !datapoint) {
      return "";
    }

    return [
      '<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title">',
      '<h3 id="verification-title">Request verification</h3>',
      "<p>You’re about to request verification for this past performance entry. Evidence upload and payment happen in the verification workflow (not shown in this prototype). Continuing will mark " + escapeHtml(metric.name) + " " + escapeHtml(formatPeriod(datapoint.endDate)) + " as Submitted.</p>",
      '<div class="dialog-actions"><button class="button ghost" type="button" data-action="close-modal">Cancel</button><button class="button primary" type="button" data-action="confirm-request-verification">Continue</button></div>',
      "</div></div>"
    ].join("");
  }

  function renderToast() {
    return ui.toast ? '<div class="toast">' + escapeHtml(ui.toast) + "</div>" : "";
  }

  function renderYearOptions(selectedYear, mode) {
    const years = [];
    for (let year = DEMO_TODAY.getFullYear() - 8; year <= DEMO_TODAY.getFullYear() + 4; year += 1) {
      const endDate = buildEndDateFromYear(year);
      if (mode === "milestone" && isFutureEndDate(endDate)) {
        continue;
      }
      if (mode === "interim-target" && !isFutureEndDate(endDate)) {
        continue;
      }
      years.push(year);
    }

    return years.reverse().map(function (year) {
      return '<option value="' + year + '" ' + (String(year) === String(selectedYear) ? "selected" : "") + ">" + year + "</option>";
    }).join("");
  }
})();
