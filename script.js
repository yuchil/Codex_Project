"use strict";

const STORAGE_KEY = "warm-todo.tasks.v1";
const VALID_CATEGORIES = new Set(["work", "life"]);

const form = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const assigneeInput = document.querySelector("#assignee-input");
const categoryInput = document.querySelector("#category-input");
const taskError = document.querySelector("#task-error");
const taskList = document.querySelector("#task-list");
const taskCount = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyMessage = document.querySelector("#empty-message");
const filterButtons = [...document.querySelectorAll(".filter-button")];

let tasks = loadTasks();
let activeFilter = "all";

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((task) => task && typeof task === "object" && typeof task.text === "string")
      .map((task) => ({
        id: typeof task.id === "string" ? task.id : createId(),
        text: task.text.trim(),
        assignee: typeof task.assignee === "string" ? task.assignee.trim() : "",
        category: VALID_CATEGORIES.has(task.category) ? task.category : "work",
        completed: Boolean(task.completed),
        createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now(),
      }))
      .filter((task) => task.text);
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // The list still works for the current page when storage is unavailable.
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
  item.className = `task-item${task.completed ? " completed" : ""}`;
  item.dataset.id = task.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `將「${task.text}」標記為${task.completed ? "未完成" : "完成"}`);
  checkbox.addEventListener("change", () => toggleTask(task.id));

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

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `刪除「${task.text}」`);
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  item.append(checkbox, main, deleteButton);
  return item;
}

function render() {
  const visibleTasks = tasks
    .filter((task) => activeFilter === "all" || task.category === activeFilter)
    .sort((a, b) => b.createdAt - a.createdAt);

  taskList.replaceChildren(...visibleTasks.map(createTaskElement));

  const completedCount = tasks.filter((task) => task.completed).length;
  taskCount.textContent = tasks.length
    ? `${completedCount} / ${tasks.length} 項已完成`
    : "0 項任務";

  const isEmpty = visibleTasks.length === 0;
  emptyState.hidden = !isEmpty;
  taskList.hidden = isEmpty;

  if (isEmpty && tasks.length > 0) {
    const categoryName = activeFilter === "work" ? "工作" : "生活";
    emptyTitle.textContent = `沒有${categoryName}任務`;
    emptyMessage.textContent = "切換其他分類，或新增一件任務吧。";
  } else {
    emptyTitle.textContent = "還沒有任務";
    emptyMessage.textContent = "從上方新增第一件想完成的事吧。";
  }
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

  tasks.push({
    id: createId(),
    text,
    assignee: assigneeInput.value.trim(),
    category: categoryInput.value,
    completed: false,
    createdAt: Date.now(),
  });

  saveTasks();
  form.reset();
  taskInput.removeAttribute("aria-invalid");
  taskError.textContent = "";
  taskInput.focus();
  render();
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task,
  );
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  render();
}

form.addEventListener("submit", addTask);
taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) {
    taskInput.removeAttribute("aria-invalid");
    taskError.textContent = "";
  }
});
filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

render();
