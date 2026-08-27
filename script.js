"use strict";

const STORAGE_KEY = "warm-todo.tasks.v1";
const VALID_CATEGORIES = new Set(["work", "life"]);

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const categorySelect = document.querySelector("#category-select");
const assigneeInput = document.querySelector("#assignee-input");
const taskError = document.querySelector("#task-error");
const taskList = document.querySelector("#task-list");
const taskSummary = document.querySelector("#task-summary");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = emptyState.querySelector("h3");
const emptyDescription = emptyState.querySelector("p");
const filterButtons = [...document.querySelectorAll(".filter-button")];

let tasks = loadTasks();
let activeFilter = "all";

function loadTasks() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    if (!storedValue) return [];

    const parsedTasks = JSON.parse(storedValue);
    if (!Array.isArray(parsedTasks)) return [];

    return parsedTasks
      .filter((task) => task && typeof task.text === "string" && task.text.trim())
      .map((task) => ({
        id: String(task.id || createId()),
        text: task.text.trim().slice(0, 200),
        category: VALID_CATEGORIES.has(task.category) ? task.category : "work",
        assignee: typeof task.assignee === "string" ? task.assignee.trim().slice(0, 60) : "",
        completed: Boolean(task.completed),
        createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // The app remains usable when storage is unavailable or full.
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = `task-item${task.completed ? " is-completed" : ""}`;
  item.dataset.id = task.id;

  const checkButton = document.createElement("button");
  checkButton.className = "task-check";
  checkButton.type = "button";
  checkButton.dataset.action = "toggle";
  checkButton.setAttribute("aria-label", task.completed ? `將「${task.text}」標示為未完成` : `完成「${task.text}」`);
  checkButton.setAttribute("aria-pressed", String(task.completed));
  checkButton.textContent = "✓";

  const content = document.createElement("div");
  content.className = "task-content";

  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.text;

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const badge = document.createElement("span");
  badge.className = `category-badge ${task.category}`;
  badge.textContent = task.category === "work" ? "工作" : "生活";
  meta.append(badge);

  if (task.assignee) {
    const assignee = document.createElement("span");
    assignee.className = "assignee";
    assignee.textContent = `負責人：${task.assignee}`;
    meta.append(assignee);
  }

  content.append(title, meta);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.setAttribute("aria-label", `刪除「${task.text}」`);
  deleteButton.textContent = "×";

  item.append(checkButton, content, deleteButton);
  return item;
}

function render() {
  const visibleTasks = activeFilter === "all"
    ? tasks
    : tasks.filter((task) => task.category === activeFilter);

  taskList.replaceChildren(...visibleTasks.map(createTaskElement));

  const remainingCount = tasks.filter((task) => !task.completed).length;
  taskSummary.textContent = tasks.length
    ? `共 ${tasks.length} 件，還有 ${remainingCount} 件待完成`
    : "目前沒有任務";

  const isEmpty = visibleTasks.length === 0;
  emptyState.hidden = !isEmpty;

  if (tasks.length === 0) {
    emptyTitle.textContent = "今天還沒有任務";
    emptyDescription.textContent = "從上方新增一件想完成的事吧。";
  } else if (isEmpty) {
    const label = activeFilter === "work" ? "工作" : "生活";
    emptyTitle.textContent = `沒有${label}任務`;
    emptyDescription.textContent = "切換其他分類，或新增一件新任務。";
  }
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

  tasks.unshift({
    id: createId(),
    text: text.slice(0, 200),
    category: VALID_CATEGORIES.has(categorySelect.value) ? categorySelect.value : "work",
    assignee: assigneeInput.value.trim().slice(0, 60),
    completed: false,
    createdAt: new Date().toISOString(),
  });

  saveTasks();
  taskForm.reset();
  categorySelect.value = "work";
  taskInput.focus();
  render();
});

taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) {
    taskInput.removeAttribute("aria-invalid");
    taskError.textContent = "";
  }
});

taskList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) return;

  const item = actionButton.closest(".task-item");
  const taskIndex = tasks.findIndex((task) => task.id === item?.dataset.id);
  if (taskIndex === -1) return;

  if (actionButton.dataset.action === "toggle") {
    tasks[taskIndex].completed = !tasks[taskIndex].completed;
  } else if (actionButton.dataset.action === "delete") {
    tasks.splice(taskIndex, 1);
  }

  saveTasks();
  render();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((candidate) => {
      const isActive = candidate === button;
      candidate.classList.toggle("is-active", isActive);
      candidate.setAttribute("aria-pressed", String(isActive));
    });
    render();
  });
});

render();
