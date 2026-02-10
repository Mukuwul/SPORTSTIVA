# Contributing Guide

Thanks for contributing to this project!
This guide explains the exact workflow for contributors and the repository owner.

---

## 🧑‍💻 For Contributors (Fork-based Workflow)

### 1. Fork the Repository

* Click the **Fork** button on the original repository.
* This creates a copy under your GitHub account.

---

### 2. Clone Your Fork Locally

```bash
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
cd REPO_NAME
```

---

### 3. Add Upstream Remote

This keeps your fork updated with the original repo.

```bash
git remote add upstream https://github.com/OWNER_USERNAME/REPO_NAME.git
git remote -v
```

---

### 4. Create a New Branch

Never work directly on `main`.

```bash
git checkout -b feature/your-feature-name
```

---

### 5. Make Changes Locally

* Write clean, readable code
* Follow the project’s coding style
* Test before committing

---

### 6. Commit Your Changes

```bash
git add .
git commit -m "Add: short meaningful description"
```

---

### 7. Sync with Upstream (IMPORTANT)

Before pushing, always sync with the owner’s repo:

```bash
git fetch upstream
git merge upstream/main
```

If conflicts occur, resolve them locally before continuing.

---

### 8. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

---

### 9. Create a Pull Request (PR)

* Go to your fork on GitHub
* Click **Compare & pull request**
* Clearly describe:

  * What you changed
  * Why you changed it
* Submit the PR

---

### 10. Respond to Review Feedback

* Make requested changes
* Commit again
* Push to the same branch
  (The PR updates automatically)

---

## 👑 For Repository Owner

### 1. Review the Pull Request

* Check code quality
* Check logic and edge cases
* Ask for changes if needed

---

### 2. Test Locally (Optional but Recommended)

```bash
git fetch origin
git checkout feature/branch-name
```

---

### 3. Merge the Pull Request

* Prefer **Squash and Merge** for clean history
* Or **Rebase and Merge** if commits are clean

---

### 4. Delete Feature Branch

After merging:

* Delete the contributor’s branch (GitHub prompt)
* Keep the repository clean

---

## 🔁 Keeping Forks Updated (Contributor)

Regularly sync your fork:

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

---

## 📌 Rules & Best Practices

* No direct pushes to `main`
* One feature per branch
* Clear commit messages
* No broken builds
* Respect code review feedback

---

Happy coding 🚀
