"use strict";

const STORAGE_KEY = "warm-todo.tasks.v2";
const LEGACY_STORAGE_KEY = "warm-todo.tasks.v1";
const STATUSES = ["todo", "process", "done"];
const VALID_STATUSES = new Set(STATUSES);
const VALID_CATEGORIES = new Set(["work", "life"]);

const form = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const assigneeInput = document.querySelector("#assignee-input");
const categoryInput = document.querySelector("#category-input");
const taskError = document.querySelector("#task-error");
const taskCount = document.querySelector("#task-count");
const board = document.querySelector("#board");
const filterButtons = [...document.querySelectorAll(".filter-button")];
const columns = Object.fromEntries(STATUSES.map((status) => [
  status, document.querySelector(`[data-column="${status}"]`),
]));

let tasks = loadTasks();
let activeFilter = "all";
let dragState = null;

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTasks(source, legacy = false) {
  if (!Array.isArray(source)) return [];
  const normalized = source
    .filter((task) => task && typeof task === "object" && typeof task.text === "string")
    .map((task, index) => ({
      id: typeof task.id === "string" ? task.id : createId(),
      text: task.text.trim(),
      assignee: typeof task.assignee === "string" ? task.assignee.trim() : "",
      category: VALID_CATEGORIES.has(task.category) ? task.category : "work",
      status: legacy ? (task.completed ? "done" : "todo") :
        (VALID_STATUSES.has(task.status) ? task.status : "todo"),
      order: Number.isFinite(task.order) ? task.order : index,
      createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now() - index,
    }))
    .filter((task) => task.text);

  STATUSES.forEach((status) => {
    normalized.filter((task) => task.status === status)
      .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt)
      .forEach((task, index) => { task.order = index; });
  });
  return normalized;
}

function loadTasks() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeTasks(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return [];
    const migrated = normalizeTasks(JSON.parse(legacy), true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // The current session remains usable if browser storage is unavailable.
  }
}

function orderedTasks(status, applyFilter = true) {
  return tasks.filter((task) => task.status === status)
    .filter((task) => !applyFilter || activeFilter === "all" || task.category === activeFilter)
    .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

function createTaskElement(task) {
  const item = document.createElement("article");
  item.className = `task-item${task.status === "done" ? " completed" : ""}`;
  item.dataset.id = task.id;
  item.dataset.status = task.status;
  item.setAttribute("role", "listitem");

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.setAttribute("aria-label", `拖曳「${task.text}」`);
  dragHandle.addEventListener("pointerdown", (event) => startDrag(event, task.id));

  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.text;
  main.append(title);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const tag = document.createElement("span");
  tag.className = `category-tag ${task.category}`;
  tag.textContent = task.category === "work" ? "工作" : "生活";
  meta.append(tag);
  if (task.assignee) {
    const assignee = document.createElement("span");
    assignee.className = "assignee";
    assignee.textContent = `負責人：${task.assignee}`;
    meta.append(assignee);
  }
  main.append(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const statusSelect = document.createElement("select");
  statusSelect.className = "status-select";
  statusSelect.setAttribute("aria-label", `變更「${task.text}」的狀態`);
  [["todo", "To-do"], ["process", "Process"], ["done", "Done"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = task.status === value;
    statusSelect.append(option);
  });
  statusSelect.addEventListener("change", () => moveTask(task.id, statusSelect.value, 0));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `刪除「${task.text}」`);
  deleteButton.addEventListener("click", () => deleteTask(task.id));
  actions.append(statusSelect, deleteButton);
  item.append(dragHandle, main, actions);
  return item;
}

function render() {
  STATUSES.forEach((status) => {
    const visible = orderedTasks(status);
    columns[status].replaceChildren(...visible.map(createTaskElement));
    document.querySelector(`[data-count="${status}"]`).textContent = visible.length;
    document.querySelector(`[data-empty="${status}"]`).hidden = visible.length > 0;
  });
  const doneCount = tasks.filter((task) => task.status === "done").length;
  taskCount.textContent = tasks.length ? `${doneCount} / ${tasks.length} 項已完成` : "0 項任務";
}

function normalizeOrders() {
  STATUSES.forEach((status) => {
    orderedTasks(status, false).forEach((task, index) => { task.order = index; });
  });
}

function moveTask(id, targetStatus, visibleIndex) {
  if (!VALID_STATUSES.has(targetStatus)) return;
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  const sourceStatus = task.status;
  const targetVisible = orderedTasks(targetStatus).filter((item) => item.id !== id);
  const beforeTask = targetVisible[visibleIndex];
  const fullTarget = orderedTasks(targetStatus, false).filter((item) => item.id !== id);
  let insertionIndex = beforeTask ? fullTarget.findIndex((item) => item.id === beforeTask.id) : fullTarget.length;
  if (insertionIndex < 0) insertionIndex = fullTarget.length;

  task.status = targetStatus;
  fullTarget.splice(insertionIndex, 0, task);
  fullTarget.forEach((item, index) => { item.order = index; });
  if (sourceStatus !== targetStatus) {
    orderedTasks(sourceStatus, false).filter((item) => item.id !== id)
      .forEach((item, index) => { item.order = index; });
  }
  normalizeOrders();
  saveTasks();
  render();
}

function addTask(event) {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.setAttribute("aria-invalid", "true");
    taskError.textContent = "請輸入任務內容。";
    taskInput.focus();
    return;
  }
  orderedTasks("todo", false).forEach((task) => { task.order += 1; });
  tasks.push({
    id: createId(), text, assignee: assigneeInput.value.trim(), category: categoryInput.value,
    status: "todo", order: 0, createdAt: Date.now(),
  });
  saveTasks();
  form.reset();
  taskInput.removeAttribute("aria-invalid");
  taskError.textContent = "";
  taskInput.focus();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  normalizeOrders();
  saveTasks();
  render();
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  render();
}

function startDrag(event, id) {
  if (event.pointerType !== "touch" && event.button !== 0) return;
  const card = event.currentTarget.closest(".task-item");
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add("drag-ghost");
  Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
  document.body.append(ghost);
  card.classList.add("drag-source");
  document.body.classList.add("is-dragging");
  dragState = {
    id, card, ghost, pointerId: event.pointerId,
    offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
    targetStatus: card.dataset.status,
    targetIndex: orderedTasks(card.dataset.status).findIndex((task) => task.id === id),
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.addEventListener("pointermove", updateDrag);
  event.currentTarget.addEventListener("pointerup", finishDrag);
  event.currentTarget.addEventListener("pointercancel", cancelDrag);
  event.preventDefault();
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;
  dragState.ghost.hidden = true;
  const underPointer = document.elementFromPoint(event.clientX, event.clientY);
  dragState.ghost.hidden = false;
  const column = underPointer?.closest(".board-column");
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  document.querySelectorAll(".drop-indicator").forEach((item) => item.remove());
  if (!column) {
    dragState.targetStatus = null;
    return;
  }
  column.classList.add("drag-over");
  const status = column.dataset.status;
  const cards = [...columns[status].querySelectorAll(".task-item:not(.drag-source)")];
  let index = cards.findIndex((card) => event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2);
  if (index === -1) index = cards.length;
  const indicator = document.createElement("div");
  indicator.className = "drop-indicator";
  columns[status].insertBefore(indicator, cards[index] || null);
  dragState.targetStatus = status;
  dragState.targetIndex = index;
}

function cleanupDrag() {
  if (!dragState) return;
  const handle = dragState.card.querySelector(".drag-handle");
  handle.removeEventListener("pointermove", updateDrag);
  handle.removeEventListener("pointerup", finishDrag);
  handle.removeEventListener("pointercancel", cancelDrag);
  dragState.card.classList.remove("drag-source");
  dragState.ghost.remove();
  document.body.classList.remove("is-dragging");
  document.querySelectorAll(".board-column").forEach((item) => item.classList.remove("drag-over"));
  document.querySelectorAll(".drop-indicator").forEach((item) => item.remove());
}

function finishDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { id, targetStatus, targetIndex } = dragState;
  cleanupDrag();
  dragState = null;
  if (targetStatus) moveTask(id, targetStatus, targetIndex);
}

function cancelDrag() {
  cleanupDrag();
  dragState = null;
}

form.addEventListener("submit", addTask);
taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) {
    taskInput.removeAttribute("aria-invalid");
    taskError.textContent = "";
  }
});
filterButtons.forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dragState) cancelDrag();
});

render();
