// Shared password-first dialog behavior; stores remain responsible for authentication.
(function (global) {
  "use strict";

  function create({
    button,
    dialog,
    form,
    cancelButton,
    titleElement,
    descriptionElement,
    emailField,
    emailInput,
    passwordInput,
    modeButton,
    submitButton,
    errorElement,
    getStore,
    isSignedIn,
    openDialog,
    scheduleFocus,
    onUnavailable = () => {},
    onActionFailure = () => {},
    logger = console,
  }) {
    let started = false;
    let editorMode = false;

    function renderMode() {
      titleElement.textContent = editorMode ? "Editor sign in" : "Choir member sign in";
      descriptionElement.textContent = editorMode
        ? "Sign in with your editor email and password."
        : "Enter the shared choir password to view and download lyrics.";
      emailField.hidden = !editorMode;
      emailInput.required = editorMode;
      emailInput.disabled = !editorMode;
      modeButton.textContent = editorMode ? "Choir member sign in" : "Editor sign in";
    }

    function setEditorMode(value, { focus = false } = {}) {
      editorMode = Boolean(value);
      renderMode();
      if (focus) scheduleFocus(() => (editorMode ? emailInput : passwordInput).focus());
    }

    async function onAuthAction() {
      const store = getStore();
      if (!store) {
        onUnavailable();
        return;
      }
      try {
        if (isSignedIn()) {
          await store.signOut();
        } else {
          errorElement.textContent = "";
          setEditorMode(false);
          openDialog(dialog);
          scheduleFocus(() => passwordInput.focus());
        }
      } catch (error) {
        logger.error(error);
        onActionFailure(error);
      }
    }

    function closeDialog() {
      dialog.close();
    }

    function onDialogClick(event) {
      if (event.target === dialog) closeDialog();
    }

    async function onSubmit(event) {
      event.preventDefault();
      errorElement.textContent = "";
      const previousLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Signing in…";
      try {
        const store = getStore();
        if (!store) {
          onUnavailable();
          return;
        }
        if (editorMode) {
          await store.signInEditor(emailInput.value.trim(), passwordInput.value);
        } else {
          await store.signInChoir(passwordInput.value);
        }
        passwordInput.value = "";
        closeDialog();
      } catch (error) {
        logger.error(error);
        errorElement.textContent = editorMode
          ? "Sign-in failed. Check the email and password."
          : "Sign-in failed. Check the choir password.";
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = previousLabel;
      }
    }

    function start() {
      if (started) return;
      renderMode();
      button.addEventListener("click", onAuthAction);
      cancelButton.addEventListener("click", closeDialog);
      modeButton.addEventListener("click", onModeClick);
      dialog.addEventListener("click", onDialogClick);
      form.addEventListener("submit", onSubmit);
      started = true;
    }

    function stop() {
      if (!started) return;
      button.removeEventListener("click", onAuthAction);
      cancelButton.removeEventListener("click", closeDialog);
      modeButton.removeEventListener("click", onModeClick);
      dialog.removeEventListener("click", onDialogClick);
      form.removeEventListener("submit", onSubmit);
      started = false;
    }

    function onModeClick() {
      setEditorMode(!editorMode, { focus: true });
    }

    return Object.freeze({ setEditorMode, start, stop });
  }

  const api = Object.freeze({ create });
  global.AuthController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
