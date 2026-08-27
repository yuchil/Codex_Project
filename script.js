"use strict";

const STORAGE_KEY = "warm-todo.tasks.v1";
const STATUSES = ["todo", "process", "done"];
const STATUS_LABELS = { todo: "To-do", process: "Process", done: "Done" };
const VALID_CATEGORIES = new Set(["work", "life"]);
const PRIORITIES = ["high", "medium", "low"];
const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const categorySelect = document.querySelector("#category-select");
const prioritySelect = document.querySelector("#priority-select");
const assigneeInput = document.querySelector("#assignee-input");
const taskError = document.querySelector("#task-error");
const taskSummary = document.querySelector("#task-summary");
const board = document.querySelector(".board");
const announcement = document.querySelector("#board-announcement");
const filterButtons = [...document.querySelectorAll(".filter-button")];
const lists = Object.fromEntries(
  STATUSES.map((status) => [status, document.querySelector(`[data-list="${status}"]`)])
);

let tasks = loadTasks();
let activeFilter = "all";
let dragState = null;

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const fallbackOrder = { todo: 0, process: 0, done: 0 };

    return parsed
      .filter((task) => task && typeof task.text === "string" && task.text.trim())
      .map((task) => {
        const status = STATUSES.includes(task.status)
          ? task.status
          : task.completed ? "done" : "todo";
        return {
          id: String(task.id || createId()),
          text: task.text.trim().slice(0, 200),
          category: VALID_CATEGORIES.has(task.category) ? task.category : "work",
          priority: PRIORITIES.includes(task.priority) ? task.priority : "medium",
          assignee: typeof task.assignee === "string" ? task.assignee.trim().slice(0, 60) : "",
          status,
          order: Number.isFinite(task.order) ? task.order : fallbackOrder[status]++,
          createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Keep the board usable if browser storage is unavailable or full.
  }
}

function visibleTasksFor(status) {
  return tasks
    .filter((task) => task.status === status && (activeFilter === "all" || task.category === activeFilter))
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.order - b.order);
}

function createButton(className, action, label, text) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = "task-item";
  item.dataset.id = task.id;

  const top = document.createElement("div");
  top.className = "task-top";
  const handle = createButton("drag-handle", "drag", `拖曳「${task.text}」`, "⠿");
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.text;
  top.append(handle, title);

  const meta = document.createElement("div");
  meta.className = "task-meta";
  const badge = document.createElement("span");
  badge.className = `category-badge ${task.category}`;
  badge.textContent = task.category === "work" ? "工作" : "生活";
  meta.append(badge);
  const priority = document.createElement("span");
  priority.className = `priority-badge ${task.priority}`;
  priority.textContent = PRIORITY_LABELS[task.priority];
  meta.append(priority);
  if (task.assignee) {
    const assignee = document.createElement("span");
    assignee.className = "assignee";
    assignee.textContent = `負責人：${task.assignee}`;
    meta.append(assignee);
  }

  const statusIndex = STATUSES.indexOf(task.status);
  const actions = document.createElement("div");
  actions.className = "task-actions";
  const previous = createButton("move-button", "previous", `將「${task.text}」移至上一階段`, "←");
  previous.disabled = statusIndex === 0;
  const next = createButton("move-button", "next", `將「${task.text}」移至下一階段`, "→");
  next.disabled = statusIndex === STATUSES.length - 1;
  const remove = createButton("delete-button", "delete", `刪除「${task.text}」`, "×");
  actions.append(previous, next, remove);
  item.append(top, meta, actions);
  return item;
}

function render() {
  STATUSES.forEach((status) => {
    const visible = visibleTasksFor(status);
    lists[status].replaceChildren(...visible.map(createTaskElement));
    const count = document.querySelector(`[data-count="${status}"]`);
    count.textContent = visible.length;
    count.setAttribute("aria-label", `${visible.length} 件任務`);
    document.querySelector(`[data-empty="${status}"]`).hidden = visible.length > 0;
  });

  const visibleTotal = activeFilter === "all"
    ? tasks.length
    : tasks.filter((task) => task.category === activeFilter).length;
  taskSummary.textContent = tasks.length
    ? activeFilter === "all" ? `共 ${tasks.length} 件任務` : `顯示 ${visibleTotal} / ${tasks.length} 件任務`
    : "目前沒有任務";
}

function normalizeOrders(status) {
  tasks
    .filter((task) => task.status === status)
    .sort((a, b) => a.order - b.order)
    .forEach((task, index) => { task.order = index; });
}

function moveTask(taskId, targetStatus, visibleIndex = null) {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task || !STATUSES.includes(targetStatus)) return;
  const sourceStatus = task.status;
  const targetVisible = visibleTasksFor(targetStatus).filter((candidate) => candidate.id !== taskId);
  const samePriority = targetVisible.filter((candidate) => candidate.priority === task.priority);
  const insertAt = visibleIndex === null
    ? samePriority.length
    : targetVisible.slice(0, Math.max(0, visibleIndex)).filter((candidate) => candidate.priority === task.priority).length;
  const previous = samePriority[insertAt - 1];
  const next = samePriority[insertAt];

  if (previous && next) task.order = (previous.order + next.order) / 2;
  else if (previous) task.order = previous.order + 1;
  else if (next) task.order = next.order - 1;
  else task.order = 0;
  task.status = targetStatus;

  normalizeOrders(sourceStatus);
  normalizeOrders(targetStatus);
  saveTasks();
  render();
  announcement.textContent = `已將「${task.text}」移至 ${STATUS_LABELS[targetStatus]}`;
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.setAttribute("aria-invalid", "true");
    taskError.textContent = "請輸入任務內容。";
    taskInput.focus();
    return;
  }

  taskInput.removeAttribute("aria-invalid");
  taskError.textContent = "";
  tasks.filter((task) => task.status === "todo").forEach((task) => { task.order += 1; });
  tasks.push({
    id: createId(),
    text: text.slice(0, 200),
    category: VALID_CATEGORIES.has(categorySelect.value) ? categorySelect.value : "work",
    priority: PRIORITIES.includes(prioritySelect.value) ? prioritySelect.value : "medium",
    assignee: assigneeInput.value.trim().slice(0, 60),
    status: "todo",
    order: 0,
    createdAt: new Date().toISOString(),
  });
  saveTasks();
  taskForm.reset();
  categorySelect.value = "work";
  prioritySelect.value = "medium";
  taskInput.focus();
  render();
});

taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) {
    taskInput.removeAttribute("aria-invalid");
    taskError.textContent = "";
  }
});

board.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.dataset.action === "drag") return;
  const task = tasks.find((candidate) => candidate.id === button.closest(".task-item")?.dataset.id);
  if (!task) return;

  if (button.dataset.action === "delete") {
    tasks = tasks.filter((candidate) => candidate.id !== task.id);
    normalizeOrders(task.status);
    saveTasks();
    render();
    return;
  }

  const offset = button.dataset.action === "previous" ? -1 : 1;
  const targetStatus = STATUSES[STATUSES.indexOf(task.status) + offset];
  if (targetStatus) moveTask(task.id, targetStatus);
});

filterButtons.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  filterButtons.forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("is-active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
  render();
}));

function cancelDrag(message = "") {
  if (!dragState) return;
  dragState.proxy.remove();
  dragState.placeholder.remove();
  dragState.source.classList.remove("is-drag-source");
  document.body.classList.remove("is-dragging");
  document.querySelectorAll(".is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
  dragState = null;
  if (message) announcement.textContent = message;
}

function updateProxyPosition(event) {
  dragState.proxy.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.proxy.style.top = `${event.clientY - dragState.offsetY}px`;
}

function onPointerMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  updateProxyPosition(event);
  const dropzone = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-dropzone]");
  document.querySelectorAll(".is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));

  if (!dropzone) {
    dragState.target = null;
    dragState.placeholder.remove();
    return;
  }

  dropzone.closest(".board-column").classList.add("is-drop-target");
  const list = dropzone.querySelector(".task-list");
  const cards = [...list.querySelectorAll(".task-item:not(.is-drag-source)")];
  const nextCard = cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });
  if (nextCard) list.insertBefore(dragState.placeholder, nextCard);
  else list.append(dragState.placeholder);
  dragState.target = { status: dropzone.dataset.dropzone, list };

  if (event.clientY < 48) window.scrollBy(0, -10);
  else if (event.clientY > window.innerHeight - 48) window.scrollBy(0, 10);
}

function onPointerUp(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { source, target, placeholder } = dragState;
  const taskId = source.dataset.id;
  let status = null;
  let index = null;
  if (target) {
    status = target.status;
    index = [...target.list.children]
      .filter((child) => (child.classList.contains("task-item") && child !== source) || child === placeholder)
      .indexOf(placeholder);
  }
  cancelDrag();
  if (status) moveTask(taskId, status, index);
}

board.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest('[data-action="drag"]');
  if (!handle || event.button !== 0) return;
  const source = handle.closest(".task-item");
  const rect = source.getBoundingClientRect();
  const proxy = source.cloneNode(true);
  proxy.classList.add("is-drag-proxy");
  proxy.style.width = `${rect.width}px`;
  proxy.setAttribute("aria-hidden", "true");
  const placeholder = document.createElement("li");
  placeholder.className = "drag-placeholder";
  placeholder.style.height = `${rect.height}px`;

  source.classList.add("is-drag-source");
  document.body.append(proxy);
  document.body.classList.add("is-dragging");
  dragState = {
    source, proxy, placeholder,
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    target: null,
  };
  updateProxyPosition(event);
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
});

board.addEventListener("pointermove", onPointerMove);
board.addEventListener("pointerup", onPointerUp);
board.addEventListener("pointercancel", () => cancelDrag("已取消拖曳"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dragState) cancelDrag("已取消拖曳");
});

saveTasks();
render();
