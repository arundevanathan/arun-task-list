# Arun Task List

A small markdown-backed task board. ChatGPT can update `TASK_BOARD.md` directly, and the GitHub Pages webpage renderscan load and preview thate same file as a read-only pagein the browser.

## GitHub Pages

Use the repository root as the GitHub Pages source. The site entry point is `index.html`, and it loads `TASK_BOARD.md` with static relative paths.

## Files

- `TASK_BOARD.md` is the source task board.
- `index.html` is the GitHub Pages entry pointGitHub Pages cannot write files back to the repository by itself. Use the GitHub button on the page to edit `TASK_BOARD.md` through GitHub, or run the local server below for direct browser saves.

## Run

```bash
python server.py
```

Then open <http://localhost:3000>.

## Files

- `TASK_BOARD.md` is the source task board.
- `index.html` is the GitHub Pages entry point.
- `server.py` serves the browser app and saves edits back to `TASK_BOARD.md`.
- `public/` contains the editor and preview UI.
<!--stackedit_data:
eyJoaXN0b3J5IjpbLTE2MDEyNDkzNTBdfQ==
-->