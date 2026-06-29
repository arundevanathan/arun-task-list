const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const saveButton = document.querySelector("#saveButton");
const reloadButton = document.querySelector("#reloadButton");
const saveState = document.querySelector("#saveState");

let lastSaved = "";
let apiWritable = false;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(markdown) {
  return escapeHtml(markdown)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const task = line.match(/^-\s+\[( |x|X)\]\s+(.+)$/);
    if (task) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }

      const checked = task[1].toLowerCase() === "x";
      const className = checked ? ' class="task-complete"' : "";
      const checkbox = `<input type="checkbox" disabled${checked ? " checked" : ""}>`;
      html.push(`<li${className}>${checkbox} ${renderInline(task[2])}</li>`);
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }

      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function updatePreview() {
  preview.innerHTML = renderMarkdown(editor.value);
  saveState.textContent = editor.value === lastSaved ? "Saved" : "Unsaved changes";
}

async function loadTaskBoard() {
  saveState.textContent = "Loading...";
  const apiResponse = await fetch("api/task-board").catch(() => null);

  if (apiResponse && apiResponse.ok) {
    const payload = await apiResponse.json();
    apiWritable = true;
    lastSaved = payload.markdown;
    editor.value = payload.markdown;
    updatePreview();
    return;
  }

  const markdownPaths = ["TASK_BOARD.md", "../TASK_BOARD.md"];

  for (const markdownPath of markdownPaths) {
    const response = await fetch(markdownPath, { cache: "no-store" }).catch(() => null);

    if (response && response.ok) {
      const markdown = await response.text();
      apiWritable = false;
      lastSaved = markdown;
      editor.value = markdown;
      updatePreview();
      return;
    }
  }

  throw new Error("Could not load the task board.");
}

function downloadMarkdown() {
  const blob = new Blob([editor.value], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "TASK_BOARD.md";
  link.click();
  URL.revokeObjectURL(url);
}

async function saveTaskBoard() {
  if (!apiWritable) {
    downloadMarkdown();
    lastSaved = editor.value;
    updatePreview();
    saveState.textContent = "Downloaded";
    return;
  }

  saveState.textContent = "Saving...";
  const response = await fetch("api/task-board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: editor.value })
  });

  if (!response.ok) {
    throw new Error("Could not save the task board.");
  }

  const payload = await response.json();
  lastSaved = payload.markdown;
  editor.value = payload.markdown;
  updatePreview();
}

editor.addEventListener("input", updatePreview);

saveButton.addEventListener("click", () => {
  saveTaskBoard().catch((error) => {
    saveState.textContent = error.message;
  });
});

reloadButton.addEventListener("click", () => {
  loadTaskBoard().catch((error) => {
    saveState.textContent = error.message;
  });
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveButton.click();
  }
});

loadTaskBoard().catch((error) => {
  saveState.textContent = error.message;
});
